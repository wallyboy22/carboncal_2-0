/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var geometry = 
    /* color: #d63000 */
    /* shown: false */
    ee.Geometry.Polygon(
        [[[-76.54780555077535, 6.702549891783329],
          [-76.54780555077535, -36.49659065368281],
          [-28.735305550775358, -36.49659065368281],
          [-28.735305550775358, 6.702549891783329]]], null, false);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// =============================================================================
// CCAL Módulo 3 — Auditoria Técnica v036 (UI FIX + MATRIZ ALINHADA)
// =============================================================================

// 1. PARÂMETROS E ATIVOS
var VERSION = 'v036';
var BASE_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/';
var YEARS_ALL = ['1985', '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
  '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
  '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
  '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];
var YEARS_FIRE = YEARS_ALL.slice(1);
var GWP_CH4 = 28, GWP_N2O = 265, TC_TO_TCO2 = 3.67;

var INCR_TABLE = {
  "Amazônia": { "F": { "gte20": 1.1698, "lt20": 4.7841 }, "G": { "gte20": 0, "lt20": 1.7000 } },
  "Caatinga": { "F": { "gte20": 0.5928, "lt20": 2.4378 }, "G": { "gte20": 0, "lt20": 0.6000 } },
  "Cerrado": { "F": { "gte20": 0.9484, "lt20": 3.8789 }, "G": { "gte20": 0, "lt20": 1.7000 } },
  "Mata Atlântica": { "F": { "gte20": 0.7780, "lt20": 3.1690 }, "G": { "gte20": 0, "lt20": 0.6000 } },
  "Pampa": { "F": { "gte20": 0.7340, "lt20": 2.9896 }, "G": { "gte20": 0, "lt20": 1.7000 } },
  "Pantanal": { "F": { "gte20": 0.9622, "lt20": 3.9159 }, "G": { "gte20": 0, "lt20": 1.7000 } }
};

// Ativos
var biomass_stock_bruto = ee.Image(BASE_ASSET + 'biomass_stock_' + VERSION);
var fire_forest = ee.Image(BASE_ASSET + 'fire_forest_emissions_' + VERSION);
var fire_savanna = ee.Image(BASE_ASSET + 'fire_savanna_emissions_' + VERSION);
var fire_grassland = ee.Image(BASE_ASSET + 'fire_grassland_emissions_' + VERSION);
var logging = ee.Image(BASE_ASSET + 'logging_emissions_' + VERSION);
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var desf_reg = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var fire_annual = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1');
var fire_freq = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1');
var fire_tsf = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1');

var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');
var paletaTrans = ["#ffffff", '#faf5d1', '#3f7849', '#5bcf20', '#ea1c1c', '#b4f792', '#fe9934', '#303149'];
var paletaStock = ["#440154", "#46327e", "#365c8d", "#277f8e", "#1fa187", "#4ac16d", "#a0da39", "#fde725"];

// 2. CORREÇÃO TÉCNICA (DESF_REG)
var desf_corrected = ee.Image(YEARS_ALL.reduce(function (acc, year, i) {
  var curr = desf_reg.select('classification_' + year);
  if (i === 0) return curr.rename('classification_' + year);
  var prev = ee.Image(acc).slice(-1);
  return ee.Image(acc).addBands(prev.where(curr.neq(7), curr).rename('classification_' + year));
}, null));
var desf_corrected_bwd = ee.Image(YEARS_ALL.slice().reverse().reduce(function (acc, year, i) {
  var curr = desf_corrected.select('classification_' + year);
  if (i === 0) return curr.rename('classification_' + year);
  var next = ee.Image(acc).slice(0, 1);
  return ee.Image(acc).addBands(next.where(curr.neq(7), curr).rename('classification_' + year));
}, null));
var desf_reg_corrected = desf_corrected.where(desf_corrected.eq(7), desf_corrected_bwd);

// 3. MOTOR DE CÁLCULO
var pixel_area_ha = ee.Image.pixelArea().divide(10000);
var biome_list = Object.keys(INCR_TABLE);
var biome_masks = {};
biome_list.forEach(function (b) { biome_masks[b] = ee.Image(1).paint(biomas.filter(ee.Filter.equals('Bioma', b)), 1).eq(1); });

var age_acum = ee.Image(0);
var degr_acum = ee.Image(0);
var out_bands = ee.Image().select();

YEARS_FIRE.forEach(function (y, i) {
  var desf_y = desf_reg_corrected.select('classification_' + y);
  var is_sec = desf_y.eq(3).or(desf_y.eq(5));
  age_acum = age_acum.add(1).multiply(is_sec);

  var incr_y = ee.Image(0);
  biome_list.forEach(function (b) {
    var bm = biome_masks[b];
    var val = age_acum.lt(20).multiply(INCR_TABLE[b].F.lt20).add(age_acum.gte(20).multiply(INCR_TABLE[b].F.gte20));
    incr_y = incr_y.where(bm.and(is_sec), val);
  });

  var f_fl_co2 = fire_forest.select('CO2_tC_ha_' + y).unmask(0);
  var f_sv_co2e = fire_savanna.select('CO2_tCO2e_ha_' + y).unmask(0);
  var mad_tC = (i >= YEARS_FIRE.indexOf('2017')) ? logging.select('logging_tC_ha_' + y).unmask(0) : ee.Image(0);

  degr_acum = degr_acum.add(incr_y).subtract(f_fl_co2).subtract(f_sv_co2e.divide(TC_TO_TCO2)).subtract(mad_tC);
  var stk_fin = biomass_stock_bruto.select('biomass_stock_' + y).add(degr_acum);

  out_bands = out_bands.addBands([
    incr_y.rename('gain_secveg_' + y), stk_fin.rename('stock_' + y),
    f_fl_co2.multiply(TC_TO_TCO2).multiply(pixel_area_ha).add(f_sv_co2e.multiply(pixel_area_ha)).rename('loss_fire_' + y),
    mad_tC.multiply(TC_TO_TCO2).multiply(pixel_area_ha).rename('loss_logging_' + y),
    stk_fin.subtract(biomass_stock_bruto.select('biomass_stock_' + y)).multiply(TC_TO_TCO2).multiply(pixel_area_ha).rename('loss_deforestation_' + y)
  ]);
});
var final_image = out_bands.float();

// 4. INTERFACE E CONFIGURAÇÃO
var panel = ui.Panel({ style: { padding: '8px' } });
var is_transposed = true, last_data = null, target_year = '2023';

var config = {
  lulc_orig: true, trans_orig: false, trans_adj: true, fire_annual: false, fire_freq: false, fire_tsf: false, stock_in: false,
  fire_forest: false, fire_forest_co2: false, fire_forest_ch4: false, fire_forest_n2o: false,
  fire_savanna: false, fire_savanna_co2: false, fire_savanna_ch4: false, fire_savanna_n2o: false,
  fire_grassland: false, fire_grassland_ch4: false, fire_grassland_n2o: false,
  logging_raw: false, out_stock: true, out_fire: false, out_logging: false, out_secveg: false, out_defor: true,
  year: true, unit: 'tCO2e/ha'
};

var row_titles = {
  'year': 'Year', 'lulc_orig': 'LULC', 'trans_orig': 'TRANS.O', 'trans_adj': 'TRANS.C', 'fire_annual': 'BURN', 'fire_freq': 'FREQ', 'fire_tsf': 'TSF', 'stock_in': 'Stk.In',
  'fire_forest': '🔥For', 'fire_forest_co2': 'co2', 'fire_forest_ch4': 'ch4', 'fire_forest_n2o': 'n2o',
  'fire_savanna': '🔥Sav', 'fire_savanna_co2': 'co2', 'fire_savanna_ch4': 'ch4', 'fire_savanna_n2o': 'n2o',
  'fire_grassland': '🔥Gra', 'fire_grassland_ch4': 'ch4', 'fire_grassland_n2o': 'n2o',
  'logging_raw': '🪓Log', 'out_stock': 'Estoque Final', 'out_fire': 'Fogo Total', 'out_logging': 'Madeira Total', 'out_secveg': 'Regeneração Total', 'out_defor': 'Balanço Desmat.'
};

// Objeto para persistir as instâncias de Map.Layer
var layers = {};

/**
 * Retorna (ou cria) a instância ui.Map.Layer para uma determinada chave
 */
function getLayerInstance(key) {
  if (layers[key]) return layers[key];

  var img, vis, name = row_titles[key] || key;

  switch (key) {
    case 'lulc_orig':
      img = lulc.select('classification_' + target_year);
      vis = { min: 0, max: 75, palette: paletaMapBiomas };
      break;
    case 'trans_adj':
      img = desf_reg_corrected.select('classification_' + target_year);
      vis = { min: 0, max: 7, palette: paletaTrans };
      break;
    case 'trans_orig':
      img = desf_reg.select('classification_' + target_year);
      vis = { min: 0, max: 7, palette: paletaTrans };
      break;
    case 'out_stock':
      img = final_image.select('stock_' + target_year);
      vis = { min: 0, max: 250, palette: paletaStock };
      break;
    case 'out_defor':
      img = final_image.select('loss_deforestation_' + target_year).selfMask();
      vis = { min: 0, max: 100, palette: ['white', 'red'] };
      break;
    case 'out_secveg':
      img = final_image.select('gain_secveg_' + target_year).selfMask();
      vis = { min: 0, max: 10, palette: ['white', 'green'] };
      break;
    case 'out_fire':
      img = final_image.select('loss_fire_' + target_year).selfMask();
      vis = { min: 0, max: 50, palette: ['white', 'orange', 'red'] };
      break;
    case 'fire_annual':
      img = fire_annual.select('burned_area_' + target_year).selfMask();
      vis = { palette: ['red'] };
      break;
    case 'fire_freq':
      img = fire_freq.selfMask();
      vis = { min: 1, max: 20, palette: ['#ffffcc','#ffeda0','#fed976','#feb24c','#fd8d3c','#fc4e2a','#e31a1c','#bd0026','#800026'] };
      break;
    default:
      return null;
  }

  layers[key] = ui.Map.Layer(img, vis, name);
  return layers[key];
}

function convertValue(val, unit) {
  var f_massa = (unit.indexOf('kg') !== -1) ? 1000 : 1;
  var f_quimico = (unit.indexOf('CO2e') !== -1) ? TC_TO_TCO2 : 1;
  return val * f_massa * f_quimico;
}
panel.add(ui.Label('CCAL M3 — Auditoria Técnica', { fontWeight: 'bold', fontSize: '18px', color: '#2c3e50' }));
var inspector_results = ui.Panel();
panel.add(inspector_results);
panel.add(ui.Button({
  label: '🔄 Inverter Matriz',
  onClick: function () {
    is_transposed = !is_transposed;
    if (last_data) renderMatrix(last_data);
  },
  style: { stretch: 'horizontal' }
}));

var unit_panel = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal'), style: { margin: '0 0 10px 0' } });
unit_panel.add(ui.Label('Exibir em:', { fontSize: '11px', fontWeight: 'bold' }));
unit_panel.add(ui.Select({ items: ['tCO2e/ha', 'tC/ha', 'kgCO2e/ha', 'kgC/ha'], value: config.unit, onChange: function (v) { config.unit = v; if (last_data) renderMatrix(last_data); }, style: { stretch: 'horizontal' } }));
panel.add(unit_panel);

var matrix_outer = ui.Panel({ style: { stretch: 'both', padding: '2px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6' } });
panel.add(matrix_outer);

var gaveta_panel = ui.Panel({
  layout: ui.Panel.Layout.flow('vertical'),
  style: { margin: '10px 0', border: '1px solid #eee', shown: false }
});
var is_gaveta_shown = false;
var toggle_gaveta = ui.Button({
  label: 'Configurações e Ajuda',
  onClick: function () {
    is_gaveta_shown = !is_gaveta_shown;
    gaveta_panel.style().set('shown', is_gaveta_shown);
    toggle_gaveta.setLabel(is_gaveta_shown ? 'Fechar Configurações' : 'Configurações e Ajuda');
  },
  style: { stretch: 'horizontal' }
});
panel.add(toggle_gaveta);
panel.add(gaveta_panel);

function createConfigRow(key, label_text, is_sub, target_panel) {
  var row = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal'), style: { margin: is_sub ? '1px 0 1px 20px' : '3px 0' } });
  
  var cb = ui.Checkbox({ 
    label: label_text, 
    value: config[key], 
    onChange: function (c) { 
      config[key] = c; 
      var ly = getLayerInstance(key);
      if (ly) {
        if (c) Map.add(ly);
        else Map.layers().remove(ly);
      }
      if (last_data) renderMatrix(last_data); 
    }, 
    style: { fontSize: is_sub ? '10px' : '11px', width: is_sub ? '135px' : '160px' } 
  });
  
  row.add(cb);
  var help_btn = ui.Button({ imageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA0UlEQVR4nMXSQUoDQRQE0LfQuDGeIOo5RD2OhlxHAjmBJicQ8SxGBc0dzCqhoAVtepjZiLVp5vf86vpVnz/ANVbYYItPLHHZ13iABda4wQSH5bzFK+blvyYWeMRxx33qT4WkKful0byrvsd4a42zKrKHYIqHurgps+pREJwVY39hi9FAgiN8tRScDiQ4x0ddXJaohhDMcF8Xr0r+4x6CE7zjokFsXnKuSX42P+Ou4142LCTJOVHFkxgb1yM7L6e5cxO/kSVJzjEq6eTMzE3Z/489zV4rLYSBhc4AAAAASUVORK5CYII=" });
  var help_txt = ui.Label('Descrição técnica.', { fontSize: '9px', color: '#7f8c8d', shown: false, margin: '2px 0 2px 25px' });
  help_btn.onClick(function () { help_txt.style().set('shown', !help_txt.style().get('shown')); });
  row.add(help_btn); target_panel.add(row); target_panel.add(help_txt);
}

var inputs_panel = ui.Panel();
gaveta_panel.add(ui.Label('Entradas (Inputs):', { fontSize: '10px', color: '#3498db', fontWeight: 'bold' }));
gaveta_panel.add(inputs_panel);
createConfigRow('lulc_orig', 'LULC (MapBiomas)', false, inputs_panel);
createConfigRow('trans_orig', 'TRANS (Original)', false, inputs_panel);
createConfigRow('trans_adj', 'TRANS (Ajustado)', false, inputs_panel);
createConfigRow('fire_annual', 'ÁREA QUEIMADA', false, inputs_panel);
createConfigRow('fire_freq', 'FREQ. FOGO', false, inputs_panel);
createConfigRow('fire_tsf', 'TSF (Anos)', false, inputs_panel);
createConfigRow('stock_in', 'ESTOQUE BASE', false, inputs_panel);
createConfigRow('logging_raw', 'MADEIRA (Raw tC/ha)', false, inputs_panel);
createConfigRow('fire_forest', 'FOGO FLORESTA', false, inputs_panel);
createConfigRow('fire_forest_co2', '↳ CO2 (tC)', true, inputs_panel);
createConfigRow('fire_forest_ch4', '↳ CH4 (t)', true, inputs_panel);
createConfigRow('fire_forest_n2o', '↳ N2O (t)', true, inputs_panel);
createConfigRow('fire_savanna', 'FOGO SAVANA', false, inputs_panel);
createConfigRow('fire_savanna_co2', '↳ CO2 (tCO2e)', true, inputs_panel);
createConfigRow('fire_savanna_ch4', '↳ CH4 (t)', true, inputs_panel);
createConfigRow('fire_savanna_n2o', '↳ N2O (t)', true, inputs_panel);
createConfigRow('fire_grassland', 'FOGO CAMPESTRE', false, inputs_panel);
createConfigRow('fire_grassland_ch4', '↳ CH4 (t)', true, inputs_panel);
createConfigRow('fire_grassland_n2o', '↳ N2O (t)', true, inputs_panel);

var outputs_panel = ui.Panel();
gaveta_panel.add(ui.Label('Saídas (Produto Final):', { fontSize: '10px', color: '#27ae60', fontWeight: 'bold' }));
gaveta_panel.add(outputs_panel);
createConfigRow('out_stock', 'Estoque Final', false, outputs_panel);
createConfigRow('out_fire', 'Fogo Total', false, outputs_panel);
createConfigRow('out_logging', 'Madeira Total', false, outputs_panel);
createConfigRow('out_secveg', 'Regeneração Total', false, outputs_panel);
createConfigRow('out_defor', 'Balanço Desmat.', false, outputs_panel);

ui.root.insert(0, panel);

function updateLayers() {
  Object.keys(config).forEach(function(key) {
    if (config[key]) {
      var ly = getLayerInstance(key);
      if (ly) Map.add(ly);
    }
  });
}

function renderMatrix(obj) {
  matrix_outer.clear();
  var container = ui.Panel({ layout: is_transposed ? ui.Panel.Layout.flow('vertical') : ui.Panel.Layout.flow('horizontal') });
  matrix_outer.add(container);
  var l_w = '55px', l_m = '1px', active_keys = Object.keys(row_titles).filter(function (k) { return config[k] });

  // Header Panel
  var title_panel = ui.Panel({ layout: is_transposed ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'), style: { backgroundColor: '#e9ecef', border: '1px solid #adb5bd', margin: l_m } });
  active_keys.forEach(function (k) {
    title_panel.add(ui.Label(row_titles[k], { fontWeight: 'bold', fontSize: '8px', width: l_w, textAlign: 'center', margin: l_m }));
  });
  container.add(title_panel);

  // Data Panels
  YEARS_FIRE.forEach(function (year) {
    var sub = ui.Panel({ layout: is_transposed ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'), style: { border: '1px solid #ced4da', margin: l_m } });
    active_keys.forEach(function (k) {
      var val = '--', style = { margin: l_m, fontSize: '9px', width: l_w, textAlign: 'center' };
      if (k === 'lulc_orig') { var l = obj['lulc_' + year]; val = l ? ('00' + l).slice(-2) : '--'; style.backgroundColor = paletaMapBiomas[l]; }
      else if (k === 'year') val = year.slice(-2);
      else {
        var base = 0;
        if (k === 'stock_in') base = obj['biomass_stock_' + year];
        else if (k === 'logging_raw') base = obj['logging_tC_ha_' + year];
        else if (k === 'out_stock') base = obj['stock_' + year];
        else if (k === 'out_fire') base = obj['loss_fire_' + year];
        else if (k === 'out_logging') base = obj['loss_logging_' + year];
        else if (k === 'out_secveg') base = obj['gain_secveg_' + year];
        else if (k === 'out_defor') base = obj['loss_deforestation_' + year];
        else if (k === 'fire_annual') base = obj['fire_annual_' + year];
        else if (k === 'fire_freq') base = obj['fire_freq_' + year];
        else if (k === 'fire_tsf') base = obj['fire_tsf_' + year];
        else if (k.indexOf('fire_forest') !== -1) base = obj[k.replace('fire_forest', 'CO2_tC_ha').replace('_ch4', 'CH4_t_ha').replace('_n2o', 'N2O_t_ha')];
        else if (k.indexOf('fire_savanna') !== -1) {
          var b_name = k.replace('fire_savanna', 'CO2_tCO2e_ha').replace('_ch4', 'CH4_t_ha').replace('_n2o', 'N2O_t_ha');
          base = (k.indexOf('_co2') !== -1 || k === 'fire_savanna') ? obj[b_name] / TC_TO_TCO2 : obj[b_name];
        }
        else if (k.indexOf('fire_grassland') !== -1) base = obj[k.replace('fire_grassland', 'CH4_t_ha').replace('_n2o', 'N2O_t_ha')];

        var is_gas = (k.indexOf('_ch4') !== -1 || k.indexOf('_n2o') !== -1);
        var conv = is_gas ? base : convertValue(base || 0, config.unit);
        val = (conv > 0.0001 || conv < -0.0001) ? conv.toFixed(is_gas ? 3 : 1) : ' ';
      }
      sub.add(ui.Label(val, style));
    });
    container.add(sub);
  });
}

Map.onClick(function (coords) {
  inspector_results.clear(); matrix_outer.clear(); matrix_outer.add(ui.Label('Carregando...'));
  var point = ee.Geometry.Point(coords.lon, coords.lat);
  var combined = final_image.addBands(biomass_stock_bruto).addBands(lulc.rename(YEARS_ALL.map(function (y) { return 'lulc_' + y }))).addBands(desf_reg_corrected.rename(YEARS_ALL.map(function (y) { return 'trans_c_' + y })));
  combined.reduceRegion({ reducer: ee.Reducer.first(), geometry: point, scale: 30 }).evaluate(function (obj) {
    if (!obj) return; last_data = obj; renderMatrix(obj);
    var landsat = ee.ImageCollection('projects/nexgenmap/MapBiomas2/LANDSAT/BRAZIL/mosaics-2').filter(ee.Filter.eq('year', 2023)).filterBounds(point).mosaic();
    Map.layers().insert(0, ui.Map.Layer(landsat, { bands: ['swir1_median_wet', 'nir_median_wet', 'red_median_wet'], gain: [0.08, 0.06, 0.2] }, 'Landsat 2023', false));
  });
});
updateLayers(); Map.style().set('cursor', 'crosshair');
