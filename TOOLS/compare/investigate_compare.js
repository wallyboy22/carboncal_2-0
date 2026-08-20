/**
 * =============================================================================
 * PROJETO: CCAL - Toolkit de Comparação de Versões
 * SCRIPT: investigate_compare.js
 * -----------------------------------------------------------------------------
 * DESCRIÇÃO: Inspector interativo para comparar os assets finais das versões
 *            do SEEG espacializado (v00, v02, v03, v04, v06) e dos Módulos
 *            CCAL (01, 02, 03, 04). Clique no mapa -> matriz anos x variáveis
 *            colorida, com suporte a comparação entre duas versões (Δ e %).
 * -----------------------------------------------------------------------------
 * USO: 1) Abra no Code Editor; 2) escolha Modo, Versão, Unidade e Ano alvo;
 *       3) marque "Comparar" e escolha a baseline; 4) clique no mapa.
 * -----------------------------------------------------------------------------
 * REQUER: users/workspaceipam/CCAL:TOOLS/compare/catalog.js
 * =============================================================================
 */

var catalog = require('users/workspaceipam/CCAL:TOOLS/compare/catalog.js');

var TC_TO_TCO2 = catalog.TC_TO_TCO2;

// -----------------------------------------------------------------------------
// Estado e cache
// -----------------------------------------------------------------------------

var state = {
  mode: 'SEEG',
  version: 'v04',
  baseline: 'v03',
  compare: false,
  unit: 'tCO2e/ha',
  target_year: '2024',
  is_transposed: true,
  last_data: null,
  last_coords: null,
  config: {} // toggles por variável (key -> bool)
};

var combined_cache = {};
function getCombined(mode, version, prefix) {
  var key = prefix + mode + '/' + version;
  if (!combined_cache[key]) combined_cache[key] = catalog.buildCombined(mode, version, prefix);
  return combined_cache[key];
}

var varMap = {}; // key -> varDef do schema atual
function refreshVarMap() {
  varMap = {};
  catalog.getVariables(state.mode, state.version).forEach(function (v) { varMap[v.key] = v; });
}

// -----------------------------------------------------------------------------
// Paletas
// -----------------------------------------------------------------------------

var paletaStock = ["#440154", "#46327e", "#365c8d", "#277f8e", "#1fa187", "#4ac16d", "#a0da39", "#fde725"];

function isStockKey(k) { return ['stock', 'swd', 'swg'].indexOf(k) !== -1; }
function isRemovalKey(k) { return ['svi', 'gain', 'rem'].indexOf(k) !== -1; }
function isNetKey(k) { return k === 'net'; }

function visFor(key) {
  if (isStockKey(key)) return { min: 0, max: 250, palette: paletaStock };
  if (isNetKey(key)) return { min: -15, max: 15, palette: ['#c6dbef', '#ffffff', '#fc9272'] };
  if (isRemovalKey(key)) return { min: 0, max: 10, palette: ['white', '#74c476'] };
  var max = (key === 'def' || key === 'defs') ? 200 : (key === 'edge') ? 30 : 50;
  return { min: 0, max: max, palette: ['white', '#fdae6b', '#d7301f'] };
}

// -----------------------------------------------------------------------------
// UI
// -----------------------------------------------------------------------------

var panel = ui.Panel({ style: { padding: '8px', width: '440px' } });
panel.add(ui.Label('CCAL / SEEG — Comparador de Versões', { fontWeight: 'bold', fontSize: '16px', color: '#2c3e50' }));
panel.add(ui.Label('Clique no mapa para inspecionar um ponto.', { fontSize: '11px', color: '#7f8c8d', margin: '0 0 6px 0' }));

var mode_select = ui.Select({ items: catalog.getModes(), value: state.mode, onChange: onModeChange, style: { stretch: 'horizontal' } });
var version_select = ui.Select({ items: catalog.getVersions(state.mode), value: state.version, onChange: onVersionChange, style: { stretch: 'horizontal' } });
var unit_select = ui.Select({
  items: ['tCO2e/ha', 'tC/ha', 'kgCO2e/ha', 'kgC/ha', 'tCO2e/px', 'tC/px', 'kgCO2e/px', 'kgC/px'],
  value: state.unit,
  onChange: function (v) { state.unit = v; if (state.last_data) renderMatrix(state.last_data); },
  style: { stretch: 'horizontal' }
});
var year_select = ui.Select({ items: catalog.getYears(state.mode, state.version), value: state.target_year, onChange: onYearChange, style: { stretch: 'horizontal' } });

function row(label, widget) {
  var r = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal'), style: { margin: '2px 0' } });
  r.add(ui.Label(label, { fontSize: '11px', fontWeight: 'bold', width: '150px' }));
  r.add(widget);
  return r;
}

panel.add(row('Modo:', mode_select));
panel.add(row('Versão:', version_select));
panel.add(row('Ano alvo (mapa):', year_select));
panel.add(row('Exibir em:', unit_select));

var compare_cb = ui.Checkbox('Comparar com baseline', state.compare, function (c) {
  state.compare = c;
  baseline_panel.style().set('shown', c);
  if (state.last_coords) { runInspect(state.last_coords); return; }
  if (state.last_data) renderMatrix(state.last_data);
}, { fontSize: '12px', fontWeight: 'bold' });
panel.add(compare_cb);

var baseline_select = ui.Select({ items: catalog.getVersions(state.mode), value: state.baseline, onChange: function (v) {
  state.baseline = v;
  if (state.last_coords) { runInspect(state.last_coords); return; }
  if (state.last_data) renderMatrix(state.last_data);
}, style: { stretch: 'horizontal' } });
var baseline_panel = row('Baseline:', baseline_select);
baseline_panel.style().set('shown', false);
panel.add(baseline_panel);

var inspector_results = ui.Panel();
panel.add(inspector_results);

panel.add(ui.Button({
  label: 'Inverter Matriz',
  onClick: function () {
    state.is_transposed = !state.is_transposed;
    if (state.last_data) renderMatrix(state.last_data);
  },
  style: { stretch: 'horizontal' }
}));

var matrix_outer = ui.Panel({ style: { stretch: 'both', padding: '2px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6' } });
panel.add(matrix_outer);

// Gaveta de camadas
var gaveta_panel = ui.Panel({ layout: ui.Panel.Layout.flow('vertical'), style: { margin: '10px 0', border: '1px solid #eee', shown: false } });
var is_gaveta_shown = false;
var toggle_gaveta = ui.Button({
  label: 'Camadas',
  onClick: function () {
    is_gaveta_shown = !is_gaveta_shown;
    gaveta_panel.style().set('shown', is_gaveta_shown);
    toggle_gaveta.setLabel(is_gaveta_shown ? 'Fechar camadas' : 'Camadas');
  },
  style: { stretch: 'horizontal' }
});
panel.add(toggle_gaveta);
panel.add(gaveta_panel);

ui.root.insert(0, panel);

// -----------------------------------------------------------------------------
// Camadas do mapa
// -----------------------------------------------------------------------------

var click_layer = ui.Map.Layer(ee.Geometry.Point([0, 0]), { color: 'FF00FF' }, 'Ponto Selecionado', false);
var default_layer = null;
var layer_objs = {}; // key -> ui.Map.Layer

function removeLayer(key) {
  var ly = layer_objs[key];
  if (ly) { Map.layers().remove(ly); delete layer_objs[key]; }
  Map.layers().remove(click_layer);
  Map.layers().add(click_layer);
}

function addLayer(key, shown) {
  removeLayer(key);
  if (!shown) return;
  var img = getCombined(state.mode, state.version, '').select(key + '_' + state.target_year).selfMask();
  var vis = visFor(key);
  vis.bands = [key + '_' + state.target_year];
  var name = (varMap[key] ? varMap[key].label : key) + ' ' + state.target_year;
  var ly = ui.Map.Layer(img, vis, name, true);
  layer_objs[key] = ly;
  Map.add(ly);
  Map.layers().remove(click_layer);
  Map.layers().add(click_layer);
}

function removeDefaultLayer() {
  if (default_layer) { Map.layers().remove(default_layer); default_layer = null; }
}

function addDefaultLayer() {
  removeDefaultLayer();
  var keys = Object.keys(varMap);
  if (!keys.length) return;
  var key = keys[0];
  var img = getCombined(state.mode, state.version, '').select(key + '_' + state.target_year).selfMask();
  var vis = visFor(key);
  vis.bands = [key + '_' + state.target_year];
  default_layer = ui.Map.Layer(img, vis, (varMap[key].label || key) + ' ' + state.target_year, true);
  Map.add(default_layer);
}

function resetLayers() {
  Object.keys(layer_objs).forEach(removeLayer);
  removeDefaultLayer();
  addDefaultLayer();
  Object.keys(varMap).forEach(function (k) {
    if (state.config[k]) addLayer(k, true);
  });
}

// -----------------------------------------------------------------------------
// Rebuild da gaveta (variáveis da versão atual)
// -----------------------------------------------------------------------------

function rebuildGaveta() {
  gaveta_panel.clear();
  gaveta_panel.add(ui.Label('Camadas (ano alvo: ' + state.target_year + ')', { fontSize: '10px', color: '#3498db', fontWeight: 'bold' }));
  var vars = catalog.getVariables(state.mode, state.version);
  vars.forEach(function (v) {
    if (state.config[v.key] === undefined) state.config[v.key] = (v.key === 'net');
    var r = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal'), style: { margin: '3px 0' } });
    var cb = ui.Checkbox({
      label: v.label,
      value: state.config[v.key],
      onChange: function (c) {
        state.config[v.key] = c;
        addLayer(v.key, c);
        if (state.last_data) renderMatrix(state.last_data);
      },
      style: { fontSize: '11px', width: '200px' }
    });
    r.add(cb);
    gaveta_panel.add(r);
  });
}

// -----------------------------------------------------------------------------
// Mudanças de estado
// -----------------------------------------------------------------------------

function onModeChange(m) {
  state.mode = m;
  state.version = (m === 'SEEG') ? 'v04' : 'M4';
  state.baseline = (m === 'SEEG') ? 'v03' : 'M3';
  var versions = catalog.getVersions(m);
  version_select.items().reset(versions);
  version_select.setValue(state.version);
  baseline_select.items().reset(versions);
  baseline_select.setValue(state.baseline);
  year_select.items().reset(catalog.getYears(m, state.version));
  refreshVarMap();
  onYearChange(catalog.getYears(m, state.version).slice(-1)[0]);
  rebuildGaveta();
  resetLayers();
  clearMatrix();
}

function onVersionChange(v) {
  state.version = v;
  year_select.items().reset(catalog.getYears(state.mode, v));
  refreshVarMap();
  onYearChange(catalog.getYears(state.mode, v).slice(-1)[0]);
  rebuildGaveta();
  resetLayers();
  clearMatrix();
}

function onYearChange(y) {
  state.target_year = y;
  year_select.setValue(y);
  resetLayers();
  if (state.last_data) renderMatrix(state.last_data);
}

function clearMatrix() {
  state.last_data = null;
  matrix_outer.clear();
  matrix_outer.add(ui.Label('Clique no mapa para inspecionar um ponto.', { color: 'gray', fontSize: '12px' }));
}

function runInspect(coords) {
  print('Inspecting:', coords);
  inspector_results.clear();
  matrix_outer.clear();
  matrix_outer.add(ui.Label('Auditando pixel (aguarde)...', { color: 'gray', fontSize: '12px' }));

  var point = ee.Geometry.Point(coords.lon, coords.lat);
  click_layer.setEeObject(point);
  click_layer.setShown(true);

  var combined = getCombined(state.mode, state.version, '');
  if (state.compare) {
    combined = combined.addBands(getCombined(state.mode, state.baseline, 'b_'));
  }

  combined.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: point.buffer(10),
    scale: 30,
    bestEffort: true
  }).evaluate(function (obj, err) {
    if (err) {
      print('❌ Erro no GEE:', err);
      matrix_outer.clear();
      matrix_outer.add(ui.Label('Erro no servidor GEE:', { fontWeight: 'bold', color: 'red' }));
      matrix_outer.add(ui.Label(String(err), { fontSize: '10px', color: 'red' }));
      return;
    }
    if (!obj) {
      print('⚠️ Resultado vazio');
      matrix_outer.clear();
      matrix_outer.add(ui.Label('Erro de clique: resultado vazio.', { color: 'red' }));
      return;
    }
    print('✅ Resultado recebido. Renderizando matriz...');
    state.last_data = obj;
    renderMatrix(obj);
  });
}

// -----------------------------------------------------------------------------
// Renderização da matriz
// -----------------------------------------------------------------------------

function getColor(key, val) {
  if (val === null || val === undefined || isNaN(val) || val === 0) return '#ffffff';
  if (isStockKey(key)) {
    var i = Math.min(paletaStock.length - 1, Math.max(0, Math.floor((val / 250) * (paletaStock.length - 1))));
    return paletaStock[i];
  }
  if (isNetKey(key)) return val > 0 ? '#ffd6d6' : '#d6f5d6';
  if (isRemovalKey(key)) return val > 0 ? '#cce5cc' : '#ffffff';
  return val > 0 ? '#ffe0cc' : '#ffffff';
}

function getContrastColor(hex) {
  if (!hex || hex.length < 7) return '#000000';
  var r = parseInt(hex.substring(1, 3), 16);
  var g = parseInt(hex.substring(3, 5), 16);
  var b = parseInt(hex.substring(5, 7), 16);
  var brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return (brightness > 125) ? '#000000' : '#ffffff';
}

function renderMatrix(obj) {
  matrix_outer.clear();
  var years = catalog.getYears(state.mode, state.version);
  var active_keys = Object.keys(varMap).filter(function (k) { return state.config[k]; });
  var l_w = state.compare ? '76px' : '58px';
  var l_m = '1px';
  var compare = state.compare;

  var container = ui.Panel({ layout: state.is_transposed ? ui.Panel.Layout.flow('vertical') : ui.Panel.Layout.flow('horizontal') });
  matrix_outer.add(container);

  // Cabeçalho
  var header = ui.Panel({ layout: state.is_transposed ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'), style: { backgroundColor: '#e9ecef', border: '1px solid #adb5bd', margin: l_m } });
  header.add(ui.Label('Ano', { fontWeight: 'bold', fontSize: '8px', width: '30px', textAlign: 'center', margin: l_m }));
  active_keys.forEach(function (k) {
    header.add(ui.Label(varMap[k].label, { fontWeight: 'bold', fontSize: '8px', width: l_w, textAlign: 'center', margin: l_m }));
  });
  container.add(header);

  var area_fact = obj.pixel_area_ha || 0.09;

  years.forEach(function (year) {
    var sub = ui.Panel({ layout: state.is_transposed ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'), style: { border: '1px solid #ced4da', margin: l_m } });

    sub.add(ui.Label(year, { fontSize: '9px', width: '30px', textAlign: 'center', margin: l_m }));

    active_keys.forEach(function (k) {
      var v = varMap[k];
      var raw = obj[k + '_' + year];
      var conv = (raw === undefined || raw === null) ? null : catalog.convertValue(raw, v.kind, v.per, state.unit, area_fact);

      var txt = '--';
      var style = { margin: l_m, fontSize: '9px', width: l_w, textAlign: 'center' };

      if (conv !== null) {
        var show = (Math.abs(conv) > 0.0001) ? conv.toFixed(1) : ' ';
        txt = show;

        if (compare) {
          var raw_b = obj['b' + k + '_' + year];
          if (raw_b !== undefined && raw_b !== null) {
            var conv_b = catalog.convertValue(raw_b, v.kind, v.per, state.unit, area_fact);
            var delta = conv - conv_b;
            var pct = (Math.abs(conv_b) > 0.0001) ? ((conv / conv_b - 1) * 100).toFixed(0) : '—';
            var d_txt = 'Δ ' + ((Math.abs(delta) > 0.0001) ? (delta > 0 ? '+' : '') + delta.toFixed(1) : '0') + ' (' + pct + '%)';
            var d_color = (Math.abs(delta) > 0.0001) ? (delta > 0 ? '#c0392b' : '#1e8449') : '#7f8c8d';
            txt = show + '\n' + d_txt;
            style.fontSize = '9px';
            style.color = '#000000';
            style.whiteSpace = 'pre-line';
          }
        }
      }

      var bg = getColor(k, conv);
      style.backgroundColor = bg;
      style.color = getContrastColor(bg);
      if (compare && txt.indexOf('\n') !== -1) {
        var parts = txt.split('\n');
        var cell = ui.Panel({ layout: ui.Panel.Layout.flow('vertical'), style: { backgroundColor: bg, width: l_w, margin: l_m } });
        cell.add(ui.Label(parts[0], { fontSize: '9px', textAlign: 'center', color: getContrastColor(bg) }));
        cell.add(ui.Label(parts[1], { fontSize: '7px', textAlign: 'center', color: (parts[1].indexOf('+') !== -1 && parts[1].indexOf('Δ') !== -1) ? '#c0392b' : (parts[1].indexOf('-') !== -1 ? '#1e8449' : '#7f8c8d') }));
        sub.add(cell);
        return;
      }
      sub.add(ui.Label(String(txt), style));
    });

    container.add(sub);
  });

  // Rodapé informativo
  var info = 'Unidade: ' + state.unit + '  |  Área pixel: ' + area_fact.toFixed(4) + ' ha' + (compare ? '  |  Baseline: ' + state.baseline : '');
  matrix_outer.add(ui.Label(info, { fontSize: '9px', color: '#7f8c8d', margin: '4px 0 0 0' }));
}

// -----------------------------------------------------------------------------
// Clique no mapa
// -----------------------------------------------------------------------------

Map.onClick(function (coords) {
  state.last_coords = coords;
  runInspect(coords);
});

Map.style().set('cursor', 'crosshair');

// -----------------------------------------------------------------------------
// Inicialização
// -----------------------------------------------------------------------------

refreshVarMap();
year_select.setValue(state.target_year);
rebuildGaveta();
addDefaultLayer();

print('CCAL/SEEG Comparador pronto. Modo:', state.mode, '| Versão:', state.version, '| Unidade:', state.unit);