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
// Script de auditoria técnica e inspeção pixel-a-pixel.
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

// Ativos Intermediários (Inputs Técnicos)
var biomass_stock_bruto = ee.Image(BASE_ASSET + 'biomass_stock_' + VERSION);
var fire_forest = ee.Image(BASE_ASSET + 'fire_forest_emissions_' + VERSION);
var fire_savanna = ee.Image(BASE_ASSET + 'fire_savanna_emissions_' + VERSION);
var fire_grassland = ee.Image(BASE_ASSET + 'fire_grassland_emissions_' + VERSION);
var logging = ee.Image(BASE_ASSET + 'logging_emissions_' + VERSION);

// Datasets Originais (Inputs Externos)
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var desf_reg = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');

// Fire Context Assets
var fire_freq = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/fire_frequency_v1');
var fire_tsf = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/time_after_fire_v1');

// Paletas
var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');
var paletaTrans = ['#000000', '#27ae60', '#c8e6c9', '#e74c3c', '#ffccbc', '#c0392b', '#ffffff'];

// =============================================================================
// 2. CORREÇÃO TÉCNICA (DESF_REG)
// =============================================================================
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

// =============================================================================
// 3. RECONSTRUÇÃO DO PRODUTO FINAL (Lógica SEEG/CCAL)
// =============================================================================
var pixel_area_ha = ee.Image.pixelArea().divide(10000);
var accumulated_degradation = ee.Image(0).rename('dummy');
var loss_fire_bands = ee.Image().select();
var loss_logging_bands = ee.Image().select();
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

  // Saídas Finais (tCO2e por pixel)
  loss_fire_bands = loss_fire_bands.addBands(fire_forest_tC.multiply(TC_TO_TCO2).add(fire_savanna_tC.multiply(TC_TO_TCO2)).multiply(pixel_area_ha).rename('loss_fire_' + y).float());
  loss_logging_bands = loss_logging_bands.addBands(logging_tC.multiply(TC_TO_TCO2).multiply(pixel_area_ha).rename('loss_logging_' + y).float());
  loss_deforestation_bands = loss_deforestation_bands.addBands(def_reg_balance_y.max(0).multiply(pixel_area_ha).rename('loss_deforestation_' + y).float());
  var sec_veg_mask = desf_y.eq(3).or(desf_y.eq(5));
  gain_sec_veg_bands = gain_sec_veg_bands.addBands(def_reg_balance_y.min(0).multiply(sec_veg_mask).multiply(pixel_area_ha).rename('gain_secveg_' + y).float());
  stock_bands = stock_bands.addBands(stock_updated_y);
});

var final_image = loss_fire_bands.addBands(loss_logging_bands).addBands(loss_deforestation_bands).addBands(gain_sec_veg_bands).addBands(stock_bands).float();

// =============================================================================
// 4. INTERFACE E CONFIGURAÇÃO
// =============================================================================
var panel = ui.Panel({ style: { width: '480px', padding: '8px' } });
var is_transposed = true;
var last_data = null;
var target_year = '2023';

var config = {
  lulc_orig: true, trans_orig: true, trans_adj: true, fire_freq: false, fire_tsf: false, stock_in: false,
  fire_forest: false, fire_forest_co2: false, fire_forest_ch4: false, fire_forest_n2o: false,
  fire_savanna: false, fire_savanna_co2: false, fire_savanna_ch4: false, fire_savanna_n2o: false,
  fire_grassland: false, fire_grassland_ch4: false, fire_grassland_n2o: false,
  logging_raw: false,
  out_stock: true, out_fire: false, out_logging: false, out_secveg: false, out_defor: true,
  year: true, unit: 'tCO2e/ha'
};

var config_info = {
  lulc_orig: 'Uso e Cobertura (MB)',
  trans_orig: 'Desm/VegSec Original (MB)',
  trans_adj: 'Desm/VegSec Ajustado',
  fire_freq: 'Frequência de Fogo',
  fire_tsf: 'TSF (Anos)',
  stock_in: 'Estoque Base (tC/ha)',
  logging_raw: 'Corte Seletivo (DETER - tC/ha)',
  out_stock: 'Estoque Final (tC/ha)',
  out_fire: 'Fogo Total (tCO2e/px)',
  out_logging: 'Madeira Total (tCO2e/px)',
  out_secveg: 'Regeneração Total (tCO2e/px)',
  out_defor: 'Balanço Desmat. (tCO2e/px)'
};

var config_help = {
  intro: 'O Módulo 3 da plataforma CCAL monitora estoques de carbono e emissões/remoções líquidas associadas a distúrbios e regeneração.',
  fire_freq: 'Número total de cicatrizes de fogo entre 1985 e o ano analisado.',
  fire_tsf: 'Anos desde a última cicatriz de fogo mapeada.',
  logging_raw: 'Dado de entrada de exploração seletiva em densidade (tC/ha).',
  out_fire: 'Emissão total por pixel (tCO2e) incluindo florestas e savanas.',
  out_secveg: 'Remoção líquida negativa (-) por ganho de biomassa secundária.',
  out_defor: 'Saldo final de carbono por pixel (tCO2e). Evita dupla contagem ao descontar a degradação prévia.'
};

// --- Header ---
panel.add(ui.Label({ value: 'CCAL M3 — Auditoria Técnica', style: { fontWeight: 'bold', fontSize: '18px', color: '#2c3e50' } }));

var inspector_results = ui.Panel();
panel.add(inspector_results);

// --- Controles de Matriz ---
panel.add(ui.Button({
  label: '🔄 Inverter Matriz (Anos em Linhas/Colunas)',
  onClick: function () { is_transposed = !is_transposed; if (last_data) renderMatrix(last_data); },
  style: { stretch: 'horizontal', margin: '5px 0' }
}));

var unit_panel = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal'), style: { margin: '0 0 10px 0' } });
unit_panel.add(ui.Label('Exibir em:', { fontSize: '11px', fontWeight: 'bold', margin: '8px 5px 0 0' }));
unit_panel.add(ui.Select({
  items: ['tCO2e/ha', 'tC/ha', 'kgCO2e/ha', 'kgC/ha'],
  value: config.unit,
  onChange: function (val) { config.unit = val; if (last_data) renderMatrix(last_data); },
  style: { stretch: 'horizontal' }
}));
panel.add(unit_panel);

var matrix_outer = ui.Panel({ style: { stretch: 'both', padding: '2px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6' } });
panel.add(matrix_outer);

// --- Gaveta Principal ---
var gaveta_panel = ui.Panel({ style: { margin: '10px 0', border: '1px solid #eee', shown: false } });
panel.add(ui.Button({
  label: '⚙️ Camadas e Ajuda Técnica',
  onClick: function () { var isShown = gaveta_panel.style().get('shown'); gaveta_panel.style().set('shown', !isShown); },
  style: { stretch: 'horizontal', margin: '10px 0' }
}));
panel.add(gaveta_panel);

// --- Sub-gaveta Intro ---
var info_panel = ui.Panel({ style: { margin: '2px 0 10px 0', border: '1px solid #3498db', padding: '5px', shown: false, backgroundColor: '#ebf5fb' } });
info_panel.add(ui.Label('Sobre o Módulo 3:', { fontWeight: 'bold', fontSize: '12px' }));
info_panel.add(ui.Label(config_help.intro, { fontSize: '10px' }));
info_panel.add(ui.Label('• Entra: LULC, Estoque Base, Queimadas, Corte Seletivo.\n• Sai: Estoque Dinâmico, Balanço de Desmatamento e Regeneração.', { fontSize: '9px', whiteSpace: 'pre' }));
gaveta_panel.add(ui.Button({
  label: 'ℹ️ O que entra e o que sai (Módulo 3)',
  onClick: function () { info_panel.style().set('shown', !info_panel.style().get('shown')); },
  style: { stretch: 'horizontal', margin: '2px 0' }
}));
gaveta_panel.add(info_panel);

function updateLayers() {
  Map.layers().reset();
  Map.addLayer(biomas, {}, 'Brasil Biomas', false);
  if (config.lulc_orig) Map.addLayer(lulc.select('classification_' + target_year), { min: 0, max: 62, palette: paletaMapBiomas }, 'LULC');
  if (config.trans_orig) Map.addLayer(desf_reg.select('classification_' + target_year), { min: 1, max: 7, palette: paletaTrans }, 'TRANS.O');
  if (config.trans_adj) Map.addLayer(desf_reg_corrected.select('classification_' + target_year), { min: 1, max: 7, palette: paletaTrans }, 'TRANS.C');
  if (config.fire_freq) Map.addLayer(fire_freq.select('fire_frequency_1985_2023'), { min: 0, max: 10, palette: ['white', 'orange', 'red'] }, 'FREQ');
  if (config.fire_tsf) Map.addLayer(fire_tsf.select('time_after_fire_' + target_year), { min: 0, max: 40, palette: ['red', 'yellow', 'green'] }, 'TSF');
  if (config.stock_in) Map.addLayer(biomass_stock_bruto.select('biomass_stock_' + target_year), { min: 0, max: 200, palette: ['white', 'green'] }, 'Stk Base');
  if (config.logging_raw) Map.addLayer(logging.select('logging_tC_ha_' + target_year), { min: 0, max: 20, palette: ['white', 'red'] }, 'Logging tC/ha');
  
  if (config.out_stock) Map.addLayer(final_image.select('stock_' + target_year), { min: 0, max: 200, palette: ['white', 'green'] }, 'Estoque Final');
  if (config.out_fire) Map.addLayer(final_image.select('loss_fire_' + target_year), { min: 0, max: 20, palette: ['white', 'orange'] }, 'Fogo Total tCO2e');
  if (config.out_logging) Map.addLayer(final_image.select('loss_logging_' + target_year), { min: 0, max: 20, palette: ['white', 'red'] }, 'Logging Total tCO2e');
  if (config.out_secveg) Map.addLayer(final_image.select('gain_secveg_' + target_year), { min: -20, max: 0, palette: ['green', 'white'] }, 'Regen Total tCO2e');
  if (config.out_defor) Map.addLayer(final_image.select('loss_deforestation_' + target_year), { min: 0, max: 50, palette: ['white', 'red'] }, 'Desmat Total tCO2e');
}

function createConfigRow(key, label_text, is_sub, target_panel) {
  var row = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal'), style: { margin: is_sub ? '1px 0 1px 20px' : '3px 0' } });
  row.add(ui.Checkbox({
    label: label_text, value: config[key],
    onChange: function (checked) { config[key] = checked; updateLayers(); if (last_data) renderMatrix(last_data); },
    style: { fontSize: is_sub ? '10px' : '11px', fontWeight: is_sub ? 'normal' : 'bold', width: is_sub ? '135px' : '160px' }
  }));
  var help_btn = ui.Button({ style: { margin: '0px', color: '#3498db' }, imageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA0UlEQVR4nMXSQUoDQRQE0LfQuDGeIOo5RD2OhlxHAjmBJicQ8SxGBc0dzCqhoAVtepjZiLVp5vf86vpVnz/ANVbYYItPLHHZ13iABda4wQSH5bzFK+blvyYWeMRxx33qT4WkKful0byrvsd4a42zKrKHYIqHurgps+pREJwVY39hi9FAgiN8tRScDiQ4x0ddXJaohhDMcF8Xr0r+4x6CE7zjokFsXnKuSX42P+Ou4142LCTJOVHFkxgb1yM7L6e5cxO/kSVJzjEq6eTMzE3Z/489zV4rLYSBhc4AAAAASUVORK5CYII=" });
  var help_txt = ui.Label(config_help[key] || 'Descrição derivada do README.', { fontSize: '9px', color: '#7f8c8d', shown: false, margin: '2px 0 2px 25px' });
  help_btn.onClick(function () { help_txt.style().set('shown', !help_txt.style().get('shown')); });
  row.add(help_btn);
  target_panel.add(row);
  target_panel.add(help_txt);
}

// --- Seção Entradas ---
var inputs_panel = ui.Panel();
gaveta_panel.add(ui.Label('Entradas (Inputs):', { fontSize: '10px', color: '#3498db', fontWeight: 'bold' }));
gaveta_panel.add(inputs_panel);
createConfigRow('lulc_orig', config_info.lulc_orig, false, inputs_panel);
createConfigRow('trans_orig', 'TRANS (Original)', false, inputs_panel);
createConfigRow('trans_adj', 'TRANS (Ajustado)', false, inputs_panel);
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

// --- Seção Saídas ---
var outputs_panel = ui.Panel();
gaveta_panel.add(ui.Label('Saídas (Produto Final - tCO2e total):', { fontSize: '10px', color: '#27ae60', margin: '8px 0 2px 0', fontWeight: 'bold' }));
gaveta_panel.add(outputs_panel);
createConfigRow('out_stock', config_info.out_stock, false, outputs_panel);
createConfigRow('out_fire', config_info.out_fire, false, outputs_panel);
createConfigRow('out_logging', config_info.out_logging, false, outputs_panel);
createConfigRow('out_secveg', config_info.out_secveg, false, outputs_panel);
createConfigRow('out_defor', config_info.out_defor, false, outputs_panel);

ui.root.insert(0, panel);

// --- Lógica de Matriz ---
var row_titles = {
  'year': 'Year', 'lulc_orig': 'LULC', 'trans_orig': 'TRANS.O', 'trans_adj': 'TRANS.C', 'fire_freq': 'FREQ', 'fire_tsf': 'TSF', 'stock_in': 'Stk.In',
  'fire_forest': '🔥For', 'fire_forest_co2': 'co2', 'fire_forest_ch4': 'ch4', 'fire_forest_n2o': 'n2o',
  'fire_savanna': '🔥Sav', 'fire_savanna_co2': 'co2', 'fire_savanna_ch4': 'ch4', 'fire_savanna_n2o': 'n2o',
  'fire_grassland': '🔥Gra', 'fire_grassland_ch4': 'ch4', 'fire_grassland_n2o': 'n2o',
  'logging_raw': '🪓Log', 'out_stock': 'Stk.Out', 'out_fire': 'Loss.F', 'out_logging': 'Loss.L', 'out_secveg': 'Gain.V', 'out_defor': '📉Def'
};

function renderMatrix(obj) {
  matrix_outer.clear();
  var container = ui.Panel({ layout: is_transposed ? ui.Panel.Layout.flow('vertical') : ui.Panel.Layout.flow('horizontal'), style: { stretch: 'horizontal' } });
  matrix_outer.add(container);
  var label_width = '55px', label_margin = '1px';
  var active_keys = Object.keys(row_titles).filter(function (k) { return config[k] });
  var title_panel = ui.Panel({ layout: is_transposed ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'), style: { backgroundColor: '#e9ecef', border: '1px solid #adb5bd', margin: label_margin } });
  active_keys.forEach(function (k) {
    var is_out = k.indexOf('out_') !== -1;
    var is_sub = (k.indexOf('_co2') !== -1 || k.indexOf('_ch4') !== -1 || k.indexOf('_n2o') !== -1);
    title_panel.add(ui.Label(row_titles[k], { fontWeight: is_sub ? 'normal' : 'bold', fontSize: '8px', width: label_width, textAlign: 'center', margin: label_margin, backgroundColor: is_out ? '#d4edda' : (is_sub ? '#f8f9fa' : '#e9ecef'), color: is_sub ? '#7f8c8d' : '#000' }));
  });
  container.add(title_panel);
  YEARS_FIRE.forEach(function (year) {
    var subpanel = ui.Panel({ layout: is_transposed ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'), style: { margin: label_margin, border: '1px solid #ced4da', textAlign: 'center' } });
    active_keys.forEach(function (k) {
      var val = '--', style = { margin: label_margin, fontSize: '9px', width: label_width, textAlign: 'center' };
      if (k === 'lulc_orig') { var l_val = obj['lulc_' + year]; val = l_val ? ('00' + l_val).slice(-2) : '--'; style.backgroundColor = paletaMapBiomas[l_val] || '#ffffff'; }
      else if (k === 'trans_orig' || k === 'trans_adj') { val = (k === 'trans_orig') ? obj['trans_o_' + year] : obj['trans_c_' + year]; val = val || '--'; style.fontWeight = 'bold'; style.backgroundColor = (val == 2) ? '#ffccbc' : (val == 3 ? '#c8e6c9' : '#ffffff'); }
      else if (k === 'fire_freq') { val = obj['fire_freq_' + year] || '0'; }
      else if (k === 'fire_tsf') { val = obj['fire_tsf_' + year] || '--'; }
      else if (k === 'year') { val = year.slice(-2); style.backgroundColor = '#f1f3f5'; }
      else {
        var base_val = 0;
        if (k === 'stock_in') base_val = obj['biomass_stock_' + year];
        else if (k === 'logging_raw') base_val = obj['logging_tC_ha_' + year];
        else if (k === 'out_stock') base_val = obj['stock_' + year];
        else if (k === 'out_fire') base_val = obj['loss_fire_' + year];
        else if (k === 'out_logging') base_val = obj['loss_logging_' + year];
        else if (k === 'out_secveg') base_val = obj['gain_secveg_' + year];
        else if (k === 'out_defor') base_val = obj['loss_deforestation_' + year];
        else if (k.indexOf('fire_forest') !== -1) base_val = obj[k.replace('fire_forest', 'CO2_tC_ha').replace('_ch4', 'CH4_t_ha').replace('_n2o', 'N2O_t_ha')];
        else if (k.indexOf('fire_savanna') !== -1) { var b_name = k.replace('fire_savanna', 'CO2_tCO2e_ha').replace('_ch4', 'CH4_t_ha').replace('_n2o', 'N2O_t_ha'); base_val = (k.indexOf('_co2') !== -1 || k === 'fire_savanna') ? obj[b_name] / TC_TO_TCO2 : obj[b_name]; }
        else if (k.indexOf('fire_grassland') !== -1) base_val = obj[k.replace('fire_grassland', 'CH4_t_ha').replace('_n2o', 'N2O_t_ha')];
        var is_gas = (k.indexOf('_ch4') !== -1 || k.indexOf('_n2o') !== -1), is_final = k.indexOf('out_') !== -1;
        var converted = (is_gas || is_final) ? base_val : convertValue(base_val, config.unit);
        val = (converted > 0.0001 || converted < -0.0001) ? converted.toFixed(is_gas ? 3 : 1) : ' ';
        if (k.indexOf('stock') !== -1) style.color = '#27ae60'; else if (k.indexOf('fire') !== -1) style.color = '#e67e22'; else if (k.indexOf('out_') !== -1) style.color = '#27ae60'; else if (k === 'out_defor' || k === 'logging_raw') style.color = '#c0392b'; if (is_gas) style.color = '#7f8c8d';
      }
      subpanel.add(ui.Label(val, style));
    });
    container.add(subpanel);
  });
}

Map.onClick(function (coords) {
  inspector_results.clear(); matrix_outer.clear(); matrix_outer.add(ui.Label('Carregando...', { color: 'gray' }));
  var point = ee.Geometry.Point(coords.lon, coords.lat);
  var combined = final_image.addBands(biomass_stock_bruto).addBands(lulc.rename(YEARS_ALL.map(function(y){return 'lulc_'+y}))).addBands(desf_reg.rename(YEARS_ALL.map(function(y){return 'trans_o_'+y}))).addBands(desf_reg_corrected.rename(YEARS_ALL.map(function(y){return 'trans_c_'+y}))).addBands(fire_freq.rename(YEARS_ALL.map(function(y){return 'fire_freq_'+y}))).addBands(fire_tsf.rename(YEARS_ALL.map(function(y){return 'fire_tsf_'+y}))).addBands(fire_forest).addBands(fire_savanna).addBands(logging);
  combined.reduceRegion({ reducer: ee.Reducer.first(), geometry: point, scale: 30, maxPixels: 1e13 }).evaluate(function (obj) { if (!obj) return; inspector_results.add(ui.Label('📍 ' + coords.lon.toFixed(4) + ', ' + coords.lat.toFixed(4), { fontWeight: 'bold' })); last_data = obj; renderMatrix(obj); var landsat = ee.ImageCollection('projects/nexgenmap/MapBiomas2/LANDSAT/BRAZIL/mosaics-2').filter(ee.Filter.eq('year', 2023)).filterBounds(point).mosaic(); Map.layers().insert(0, ui.Map.Layer(landsat, { bands: ['swir1_median_wet', 'nir_median_wet', 'red_median_wet'], gain: [0.08, 0.06, 0.2] }, 'Landsat 2023', false)); });
});

updateLayers(); Map.style().set('cursor', 'crosshair');
