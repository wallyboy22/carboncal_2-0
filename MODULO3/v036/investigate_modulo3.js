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
// CCAL Módulo 3 — v036
// investigate_modulo3.js
// Script de inspeção e reconstrução: carrega ativos intermediários para gerar o produto final.
// =============================================================================

// =============================================================================
// 1. PARÂMETROS E ATIVOS
// =============================================================================
var VERSION = 'v036';
var BASE_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/';
var FINAL_ASSET = 'projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO3-' + VERSION;

var YEARS_ALL = ['1985', '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
  '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
  '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
  '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];
var YEARS_FIRE = YEARS_ALL.slice(1);

var GWP_CH4 = 28;
var GWP_N2O = 265;
var TC_TO_TCO2 = 3.67;

// Carregamento dos Ativos Intermediários
var biomass_stock_bruto = ee.Image(BASE_ASSET + 'biomass_stock_' + VERSION);
var fire_forest = ee.Image(BASE_ASSET + 'fire_forest_emissions_' + VERSION);
var fire_savanna = ee.Image(BASE_ASSET + 'fire_savanna_emissions_' + VERSION);
var fire_grassland = ee.Image(BASE_ASSET + 'fire_grassland_emissions_' + VERSION);
var logging = ee.Image(BASE_ASSET + 'logging_emissions_' + VERSION);

// =============================================================================
// 2. DATASETS DE ENTRADA
// =============================================================================
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var desf_reg = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var water_count = lulc.eq(33).reduce(ee.Reducer.sum());
var always_submerged = water_count.gte(38);

// --- 3a. Corrige classe 7 (outras transições) no desf/reg
var desf_corrected = ee.Image(YEARS_ALL.reduce(function (acc, year, i) {
  var curr = desf_reg.select('classification_' + year);
  if (i === 0) return curr.rename('classification_' + year);
  var prev = ee.Image(acc).slice(-1);
  return ee.Image(acc).addBands(prev.where(curr.neq(7), curr).rename('classification_' + year));
}, null));

// Propagação inversa (backward fill) para pixels que começam em 7
var desf_corrected_bwd = ee.Image(YEARS_ALL.slice().reverse().reduce(function (acc, year, i) {
  var curr = desf_corrected.select('classification_' + year);
  if (i === 0) return curr.rename('classification_' + year);
  var next = ee.Image(acc).slice(0, 1);
  return ee.Image(acc).addBands(next.where(curr.neq(7), curr).rename('classification_' + year));
}, null));

// Merge: usa o corrigido forward; onde ainda 7, usa backward
var desf_reg_corrected = desf_corrected.where(desf_corrected.eq(7), desf_corrected_bwd);

// =============================================================================
// 3. RECONSTRUÇÃO DO ATIVO FINAL (Lógica de Integração)
// =============================================================================
var pixel_area_ha = ee.Image.pixelArea().divide(10000);
var accumulated_degradation = ee.Image(0).rename('dummy');

var loss_fire_bands = ee.Image().select();
var loss_logging_bands = ee.Image().select();
var loss_convergence_bands = ee.Image().select();
var loss_grassland_bands = ee.Image().select();
var loss_deforestation_bands = ee.Image().select();
var gain_sec_veg_bands = ee.Image().select();
var stock_bands = ee.Image().select();

var past_stock = biomass_stock_bruto.select('biomass_stock_1985');

YEARS_FIRE.forEach(function (y, i) {
  var fire_forest_tC = fire_forest.select('CO2_tC_ha_' + y).unmask(0);
  var fire_savanna_tC = fire_savanna.select('CO2_tCO2e_ha_' + y).unmask(0).divide(TC_TO_TCO2);
  var logging_tC = (i >= YEARS_FIRE.indexOf('2017')) ? logging.select('logging_tC_ha_' + y).unmask(0) : ee.Image(0);

  var accum_prev = accumulated_degradation.slice(-1);
  var accum_y = accum_prev.subtract(fire_forest_tC).subtract(fire_savanna_tC).subtract(logging_tC).rename('accum_' + y);
  accumulated_degradation = accumulated_degradation.addBands(accum_y);

  var stock_bruto_y = biomass_stock_bruto.select('biomass_stock_' + y);
  var desf_y = desf_reg_corrected.select('classification_' + y);

  var stock_updated_y = stock_bruto_y.where(desf_y.eq(2), stock_bruto_y.add(accum_y.unmask(0))).rename('stock_' + y).float();
  var def_reg_balance_y = past_stock.subtract(stock_updated_y).multiply(TC_TO_TCO2);
  past_stock = stock_updated_y;

  loss_deforestation_bands = loss_deforestation_bands.addBands(def_reg_balance_y.max(0).multiply(pixel_area_ha).rename('loss_deforestation_' + y).float());
  var sec_veg_mask = desf_y.eq(3).or(desf_y.eq(5));
  gain_sec_veg_bands = gain_sec_veg_bands.addBands(def_reg_balance_y.min(0).multiply(sec_veg_mask).multiply(pixel_area_ha).rename('gain_secondary_vegetation_' + y).float());
  stock_bands = stock_bands.addBands(stock_updated_y);
});

var final_image = loss_deforestation_bands.addBands(gain_sec_veg_bands).addBands(stock_bands).updateMask(always_submerged.not()).float();

// =============================================================================
// 4. INTERFACE E INSPEÇÃO
// =============================================================================
var panel = ui.Panel({ style: {} });
var intro = ui.Label({ value: 'CCAL M3 — Auditoria Técnica', style: { fontWeight: 'bold', fontSize: '18px', color: '#2c3e50' } });
panel.add(intro);

// Variáveis de Estado
var is_transposed = true;
var last_data = null;

var config = {
  lulc_orig: true,
  lulc_corr: true,
  trans: true,
  stock_in: true,
  stock_out: true,
  fire_forest: true,
  fire_forest_co2: false, fire_forest_ch4: false, fire_forest_n2o: false,
  fire_savanna: true,
  fire_savanna_co2: false, fire_savanna_ch4: false, fire_savanna_n2o: false,
  fire_grassland: true,
  fire_grassland_ch4: false, fire_grassland_n2o: false,
  logging: true,
  defor: true,
  year: true,
  unit: 'tCO2e/ha'
};

var config_info = {
  lulc_orig: 'LULC MapBiomas (Coleção 10.1)',
  lulc_corr: 'LULC Corrigido (Máscaras)',
  trans: 'Transições (Classes 1-7)',
  stock_in: 'Estoque de Carbono Base (Entrada)',
  stock_out: 'Estoque de Carbono Final (Saída)',
  fire_forest: 'Fogo Floresta (Input)',
  logging: 'Madeira/Degradação (Input)',
  defor: 'Balanço de Carbono (Saída)'
};

var config_help = {
  trans: 'Classes: 1-Primária, 2-Desm, 3-SecVeg, 4-SupSec, 5-Recorrência, 6-RegNatural, 7-SupReg.',
  lulc_corr: 'LULC após aplicação de máscaras perenes e ajustes de consistência.',
  logging: 'Exploração seletiva. Dado bruto em tC/ha (apenas CO2).',
  defor: 'Saldo de emissão (+) ou remoção (-) por hectare.'
};

var inspector_results = ui.Panel();
panel.add(inspector_results);

var transpose_btn = ui.Button({
  label: '🔄 Inverter Matriz (Anos em Linhas/Colunas)',
  onClick: function () {
    is_transposed = !is_transposed;
    if (last_data) renderMatrix(last_data);
  },
  style: { stretch: 'horizontal', margin: '10px 0 5px 0' }
});
panel.add(transpose_btn);

var unit_panel = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal'), style: { margin: '0 0 10px 0' } });
unit_panel.add(ui.Label('Exibir em:', { fontSize: '11px', fontWeight: 'bold', margin: '8px 5px 0 0' }));
var unit_selector = ui.Select({
  items: ['tCO2e/ha', 'tC/ha', 'kgCO2e/ha', 'kgC/ha'],
  value: config.unit,
  onChange: function (val) {
    config.unit = val;
    if (last_data) renderMatrix(last_data);
  },
  style: { stretch: 'horizontal' }
});
unit_panel.add(unit_selector);
panel.add(unit_panel);

var matrix_outer = ui.Panel({
  style: { stretch: 'both', padding: '2px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6' }
});
panel.add(matrix_outer);

// Gaveta ao final
var gaveta_panel = ui.Panel({ style: { margin: '10px 0', border: '1px solid #eee', shown: false } });
var toggle_gaveta = ui.Button({
  label: '⚙️ Ajuda Técnica e Filtros',
  onClick: function () {
    var isShown = gaveta_panel.style().get('shown');
    gaveta_panel.style().set('shown', !isShown);
  },
  style: { stretch: 'horizontal', margin: '10px 0' }
});
panel.add(toggle_gaveta);
panel.add(gaveta_panel);

function updateLayers() {
  Map.layers().reset();
  Map.addLayer(biomas, {}, 'Brasil Biomas', false);
  if (config.lulc_orig) Map.addLayer(lulc.select('classification_2023'), { min: 0, max: 62, palette: paletaMapBiomas }, 'MapBiomas LULC 2023', false);
  if (config.stock_out) Map.addLayer(final_image.select('stock_2023'), { min: 0, max: 200, palette: ['white', 'green'] }, 'Estoque Final 2023');
}

function createConfigRow(key, label_text, is_sub) {
  var row = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal'), style: { margin: is_sub ? '1px 0 1px 20px' : '3px 0' } });
  var cb = ui.Checkbox({
    label: label_text,
    value: config[key],
    onChange: function (checked) {
      config[key] = checked;
      updateLayers();
      if (last_data) renderMatrix(last_data);
    },
    style: { fontSize: is_sub ? '10px' : '11px', fontWeight: is_sub ? 'normal' : 'bold', width: is_sub ? '110px' : '130px' }
  });
  row.add(cb);
  if (config_help[key]) {
    var help_btn = ui.Button({ style: { margin: '0px', color: '#3498db' }, imageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA0UlEQVR4nMXSQUoDQRQE0LfQuDGeIOo5RD2OhlxHAjmBJicQ8SxGBc0dzCqhoAVtepjZiLVp5vf86vpVnz/ANVbYYItPLHHZ13iABda4wQSH5bzFK+blvyYWeMRxx33qT4WkKful0byrvsd4a42zKrKHYIqHurgps+pREJwVY39hi9FAgiN8tRScDiQ4x0ddXJaohhDMcF8Xr0r+4x6CE7zjokFsXnKuSX42P+Ou4142LCTJOVHFkxgb1yM7L6e5cxO/kSVJzjEq6eTMzE3Z/489zV4rLYSBhc4AAAAASUVORK5CYII=" });
    var help_txt = ui.Label(config_help[key], { fontSize: '9px', color: '#7f8c8d', shown: false, margin: '2px 0 2px 25px' });
    help_btn.onClick(function () { help_txt.style().set('shown', !help_txt.style().get('shown')); });
    row.add(help_btn);
    gaveta_panel.add(row);
    gaveta_panel.add(help_txt);
  } else {
    gaveta_panel.add(row);
  }
}

gaveta_panel.add(ui.Label('Entradas (Inputs):', { fontSize: '10px', color: '#3498db' }));
createConfigRow('lulc_orig', 'LULC ORIG');
createConfigRow('lulc_corr', 'LULC CORR');
createConfigRow('trans', 'TRANSIÇÕES');
createConfigRow('stock_in', 'ESTOQUE BASE');
createConfigRow('logging', 'MADEIRA (Log)');

gaveta_panel.add(ui.Label('Saídas (Outputs):', { fontSize: '10px', color: '#27ae60', margin: '8px 0 2px 0' }));
createConfigRow('stock_out', 'ESTOQUE FINAL');
createConfigRow('defor', 'DESMAT. (Balanço)');

gaveta_panel.add(ui.Label('Fogo e Gases (Inputs):', { fontSize: '10px', color: '#e67e22', margin: '8px 0 2px 0' }));
createConfigRow('fire_forest', 'FOGO FLORESTA');
createConfigRow('fire_forest_co2', '↳ CO2 (tC)', true);
createConfigRow('fire_forest_ch4', '↳ CH4 (t)', true);
createConfigRow('fire_forest_n2o', '↳ N2O (t)', true);

createConfigRow('fire_savanna', 'FOGO SAVANA');
createConfigRow('fire_savanna_co2', '↳ CO2 (tCO2e)', true);
createConfigRow('fire_savanna_ch4', '↳ CH4 (t)', true);
createConfigRow('fire_savanna_n2o', '↳ N2O (t)', true);

createConfigRow('fire_grassland', 'FOGO CAMPESTRE');
createConfigRow('fire_grassland_ch4', '↳ CH4 (t)', true);
createConfigRow('fire_grassland_n2o', '↳ N2O (t)', true);

ui.root.insert(0, panel);

var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');

var row_titles = {
  'year': 'Year',
  'lulc_orig': 'LULC.O', 'lulc_corr': 'LULC.C', 'trans': 'TRANS', 'stock_in': 'Stk.In',
  'fire_forest': '🔥For', 'fire_forest_co2': 'co2', 'fire_forest_ch4': 'ch4', 'fire_forest_n2o': 'n2o',
  'fire_savanna': '🔥Sav', 'fire_savanna_co2': 'co2', 'fire_savanna_ch4': 'ch4', 'fire_savanna_n2o': 'n2o',
  'fire_grassland': '🔥Gra', 'fire_grassland_ch4': 'ch4', 'fire_grassland_n2o': 'n2o',
  'logging': '🪓Log', 'stock_out': 'Stk.Out', 'defor': '📉Def'
};

function convertValue(val_tC_ha, unit) {
  if (val_tC_ha === null || val_tC_ha === undefined) return 0;
  var factor = 1;
  if (unit.indexOf('CO2e') !== -1) factor *= TC_TO_TCO2;
  if (unit.indexOf('kg') !== -1) factor *= 1000;
  return val_tC_ha * factor;
}

function renderMatrix(obj) {
  matrix_outer.clear();
  var container = ui.Panel({
    layout: is_transposed ? ui.Panel.Layout.flow('vertical') : ui.Panel.Layout.flow('horizontal'),
    style: { stretch: 'horizontal' }
  });
  matrix_outer.add(container);

  var label_width = '55px';
  var label_margin = '1px';

  var active_keys = Object.keys(row_titles).filter(function (k) { return config[k] });
  var title_panel = ui.Panel({
    layout: is_transposed ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'),
    style: { backgroundColor: '#e9ecef', border: '1px solid #adb5bd', margin: label_margin }
  });
  
  active_keys.forEach(function (k) {
    var is_out = (k === 'stock_out' || k === 'defor');
    var is_sub = (k.indexOf('_co2') !== -1 || k.indexOf('_ch4') !== -1 || k.indexOf('_n2o') !== -1);
    
    title_panel.add(ui.Label(row_titles[k], {
      fontWeight: is_sub ? 'normal' : 'bold',
      fontSize: '8px', width: label_width, textAlign: 'center', margin: label_margin,
      backgroundColor: is_out ? '#d4edda' : (is_sub ? '#f8f9fa' : '#e9ecef'),
      color: is_sub ? '#7f8c8d' : '#000'
    }));
  });
  container.add(title_panel);

  YEARS_FIRE.forEach(function (year) {
    var subpanel = ui.Panel({
      layout: is_transposed ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'),
      style: { margin: label_margin, border: '1px solid #ced4da', textAlign: 'center' }
    });

    active_keys.forEach(function (k) {
      var val = '--';
      var style = { margin: label_margin, fontSize: '9px', width: label_width, textAlign: 'center' };

      if (k === 'lulc_orig' || k === 'lulc_corr') {
        var l_val = obj['classification_' + year];
        val = l_val ? ('00' + l_val).slice(-2) : '--';
        style.backgroundColor = paletaMapBiomas[l_val] || '#ffffff';
      } else if (k === 'trans') {
        val = obj['classification_' + year] || '--';
        style.fontWeight = 'bold';
        style.backgroundColor = (val == 2) ? '#ffccbc' : (val == 3 ? '#c8e6c9' : '#ffffff');
      } else if (k === 'year') {
        val = year.slice(-2);
        style.backgroundColor = '#f1f3f5';
      } else {
        var base_val = 0;
        if (k === 'stock_in') base_val = obj['biomass_stock_' + year];
        else if (k === 'stock_out') base_val = obj['stock_' + year];
        else if (k === 'logging') base_val = obj['logging_tC_ha_' + year];
        else if (k === 'defor') base_val = obj['loss_deforestation_' + year] / (0.09 * TC_TO_TCO2);
        
        else if (k.indexOf('fire_forest') !== -1) base_val = obj[k.replace('fire_forest','CO2_tC_ha').replace('_ch4','CH4_t_ha').replace('_n2o','N2O_t_ha')];
        else if (k.indexOf('fire_savanna') !== -1) {
           var b_name = k.replace('fire_savanna','CO2_tCO2e_ha').replace('_ch4','CH4_t_ha').replace('_n2o','N2O_t_ha');
           base_val = (k.indexOf('_co2') !== -1 || k==='fire_savanna') ? obj[b_name]/TC_TO_TCO2 : obj[b_name];
        } else if (k.indexOf('fire_grassland') !== -1) {
           base_val = obj[k.replace('fire_grassland','CH4_t_ha').replace('_n2o','N2O_t_ha')];
        }

        var is_gas = (k.indexOf('_ch4') !== -1 || k.indexOf('_n2o') !== -1);
        var converted = is_gas ? base_val : convertValue(base_val, config.unit);
        val = (converted > 0.0001 || converted < -0.0001) ? converted.toFixed(is_gas ? 3 : 1) : ' ';
        
        if (k.indexOf('stock') !== -1) style.color = '#27ae60';
        else if (k.indexOf('fire') !== -1) style.color = '#e67e22';
        else if (k === 'defor' || k === 'logging') style.color = '#c0392b';
        if (is_gas) style.color = '#7f8c8d';
      }
      subpanel.add(ui.Label(val, style));
    });
    container.add(subpanel);
  });
}

Map.onClick(function (coords) {
  inspector_results.clear();
  matrix_outer.clear();
  matrix_outer.add(ui.Label('Carregando...', { color: 'gray' }));

  var point = ee.Geometry.Point(coords.lon, coords.lat);
  var combined = final_image.addBands(biomass_stock_bruto).addBands(lulc).addBands(desf_reg)
    .addBands(fire_forest).addBands(fire_savanna).addBands(logging);

  combined.reduceRegion({ reducer: ee.Reducer.first(), geometry: point, scale: 30, maxPixels: 1e13 })
    .evaluate(function (obj) {
      if (!obj) return;
      inspector_results.clear();
      inspector_results.add(ui.Label('📍 ' + coords.lon.toFixed(4) + ', ' + coords.lat.toFixed(4), { fontWeight: 'bold' }));
      last_data = obj;
      renderMatrix(obj);
      var landsat = ee.ImageCollection('projects/nexgenmap/MapBiomas2/LANDSAT/BRAZIL/mosaics-2')
        .filter(ee.Filter.eq('year', 2023)).filterBounds(point).mosaic();
      Map.layers().insert(0, ui.Map.Layer(landsat, { bands: ['swir1_median_wet', 'nir_median_wet', 'red_median_wet'], gain: [0.08, 0.06, 0.2] }, 'Landsat 2023', false));
    });
});

updateLayers();
Map.style().set('cursor', 'crosshair');
// Map.centerObject(biomas, 4);
