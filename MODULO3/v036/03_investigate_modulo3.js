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
/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Emissões por Mudança de Uso e Degradação)
 * VERSÃO: v036
 * SCRIPT: 02_investigate_modulo3.js
 * DESCRIÇÃO: Ferramenta de diagnóstico e auditoria técnica (Inspector). Interface 
 *            interativa para análise pontual da série histórica de emissões. 
 *            Permite validar a consistência espacial e temporal do balanço de 
 *            carbono e a dinâmica de acúmulo de biomassa na vegetação secundária.
 * -----------------------------------------------------------------------------
 * INSTITUIÇÃO: IPAM Amazônia
 * EQUIPE CCAL: Ane Alencar; Bárbara Zimbres; Camila Silva; Celso Silva-Junior; 
 *              Edriano Souza; Isabel Silva; Lívia Laureto; Manuela Padilha; 
 *              Paulo Moutinho; Rebecca Maranhão; Valderli Piontekowski; Wallace Silva
 * ORGANIZAÇÃO: Bárbara Zimbres e Wallace Silva
 * CONTATO: https://ipam.org.br/contato/fale-conosco/
 * ATUALIZAÇÃO: 2026-04-30
 * =============================================================================
 */


// 1. PARÂMETROS E ATIVOS
var VERSION = 'v036';
var BASE_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/';
var FINAL_ASSET = 'projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO3-' + VERSION;
var YEARS_ALL = ['1985', '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
  '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
  '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
  '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];
var YEARS_FIRE = YEARS_ALL.slice(1);
var GWP_CH4 = 28, GWP_N2O = 265, TC_TO_TCO2 = 3.67;

// Ativos
var biomass_stock_bruto = ee.Image(BASE_ASSET + 'biomass_stock_' + VERSION);
var sec_veg_increment = ee.Image(BASE_ASSET + 'secondary_veg_increment_' + VERSION);
var fire_forest = ee.Image(BASE_ASSET + 'fire_forest_emissions_' + VERSION);
var fire_savanna = ee.Image(BASE_ASSET + 'fire_savanna_emissions_' + VERSION);
// linha temporaria ate a correcao do dataset de emissão por fogo em savana
fire_savanna = fire_savanna.select(fire_savanna.bandNames(), fire_savanna.bandNames().map(function (s) { return ee.String(s).replace('CO2_tCO2e_ha_', 'CO2_tC_ha_') }));

var fire_grassland = ee.Image(BASE_ASSET + 'fire_grassland_emissions_' + VERSION);
var logging = ee.Image(BASE_ASSET + 'logging_emissions_' + VERSION);

var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var desf_reg = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var fire_annual = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1').select('burned_area_.*');
var fire_freq = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1').select('fire_frequency_1985_.*');
var fire_tsf = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1').select('classification_.*');

print('--- Validação de Ativos (Bands) ---');
print('LULC bands:', lulc.bandNames().length());
print('Desf/Reg bands:', desf_reg.bandNames().length());
print('Fire Annual bands:', fire_annual.bandNames().length());
print('Fire Freq bands:', fire_freq.bandNames().length());
print('Fire TSF bands:', fire_tsf.bandNames().length());
print('Biomass Stock bands:', biomass_stock_bruto.bandNames().length());
print('Fire Forest bands:', fire_forest.bandNames().length());
print('Logging bands:', logging.bandNames().length());

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

// 3. MOTOR DE CÁLCULO (BALANÇO VIA ASSETS)
var pixel_area_ha = ee.Image.pixelArea().divide(10000);
var age_acum = ee.Image(0);
var degr_acum = ee.Image(0);
var out_bands = ee.Image().select();

YEARS_FIRE.forEach(function (y, i) {
  var desf_y = desf_reg_corrected.select('classification_' + y);
  var is_sec = desf_y.eq(3).or(desf_y.eq(5));

  // Cálculo da Idade (acumulada no auditor)
  age_acum = age_acum.add(1).multiply(is_sec);

  // Componentes via Assets
  var f_fl_co2 = fire_forest.select('CO2_tC_ha_' + y).unmask(0);
  var f_sv_co2 = fire_savanna.select('CO2_tC_ha_' + y).unmask(0);

  var mad_tC = (i >= YEARS_FIRE.indexOf('2017')) ? logging.select('logging_tC_ha_' + y).unmask(0) : ee.Image(0);

  var incr_y = sec_veg_increment.select('sec_veg_increment_' + y).subtract(
    (i === 0) ? ee.Image(0) : sec_veg_increment.select('sec_veg_increment_' + YEARS_FIRE[i - 1])
  ).unmask(0);

  degr_acum = degr_acum.add(incr_y).subtract(f_fl_co2).subtract(f_sv_co2).subtract(mad_tC);

  var past_stock_y = (i === 0) ? biomass_stock_bruto.select('biomass_stock_1985') : out_bands.select('stock_' + YEARS_FIRE[i - 1]);
  var stock_bruto_y = biomass_stock_bruto.select('biomass_stock_' + y);
  var stk_fin = stock_bruto_y.where(desf_y.eq(2), stock_bruto_y.add(degr_acum));

  var delta_stock_tC = past_stock_y.subtract(stk_fin);
  var degradation_tC_y = f_fl_co2.add(f_sv_co2).add(mad_tC);

  var loss_defor_y = delta_stock_tC.subtract(degradation_tC_y).max(0).multiply(TC_TO_TCO2).multiply(pixel_area_ha);
  var gain_secveg_y = delta_stock_tC.min(0).abs().multiply(is_sec).multiply(TC_TO_TCO2).multiply(pixel_area_ha);

  out_bands = out_bands.addBands([
    gain_secveg_y.rename('gain_secondary_vegetation_' + y),
    stk_fin.rename('stock_' + y),
    f_fl_co2.add(f_sv_co2).multiply(TC_TO_TCO2).multiply(pixel_area_ha).rename('loss_fire_' + y),
    mad_tC.multiply(TC_TO_TCO2).multiply(pixel_area_ha).rename('loss_selective_logging_' + y),
    loss_defor_y.rename('loss_deforestation_' + y),
    age_acum.rename('age_secveg_' + y)
  ]);
});
var final_image = out_bands.float();

// 4. INTERFACE E CONFIGURAÇÃO
var panel = ui.Panel({ style: { padding: '8px' } });
var is_transposed = true, last_data = null, target_year = '2023';

var config = {
  lulc_orig: true, trans_orig: false, trans_adj: true, age_secveg: false, fire_annual: false, fire_freq: false, fire_tsf: false, stock_in: false,
  fire_forest: false, fire_forest_co2: false, fire_forest_ch4: false, fire_forest_n2o: false,
  fire_savanna: false, fire_savanna_co2: false, fire_savanna_ch4: false, fire_savanna_n2o: false,
  fire_grassland: false, fire_grassland_ch4: false, fire_grassland_n2o: false,
  logging_raw: false, out_stock: true, out_fire: true, out_logging: true, out_secveg: true, out_defor: true,
  year: true, unit: 'tCO2e/ha'
};

var row_titles = {
  'year': 'Year', 'lulc_orig': 'LULC', 'trans_orig': 'TRANS.O', 'trans_adj': 'TRANS.C', 'age_secveg': 'Idade SV', 'fire_annual': 'BURN', 'fire_freq': 'FREQ', 'fire_tsf': 'TSF', 'stock_in': 'Stk.In',
  'fire_forest': '🔥For', 'fire_forest_co2': 'co2', 'fire_forest_ch4': 'ch4', 'fire_forest_n2o': 'n2o',
  'fire_savanna': '🔥Sav', 'fire_savanna_co2': 'co2', 'fire_savanna_ch4': 'ch4', 'fire_savanna_n2o': 'n2o',
  'fire_grassland': '🔥Gra', 'fire_grassland_ch4': 'ch4', 'fire_grassland_n2o': 'n2o',
  'logging_raw': '🪓Log', 'out_stock': 'Estoque Final', 'out_fire': 'Fogo Total', 'out_logging': 'Madeira Total', 'out_secveg': 'Regeneração Total', 'out_defor': 'Balanço Desmat.'
};

var click_layer = ui.Map.Layer(ee.Geometry.Point([0, 0]), { color: 'FF00FF' }, '📍 Ponto Selecionado', false);

function updateLayerVisibility(key, shown) {
  var ly = getLayerInstance(key);
  if (!ly) return;
  if (shown) {
    Map.add(ly);
  } else {
    Map.layers().remove(ly);
  }
  // Garante que o ponto de clique esteja sempre no topo
  Map.layers().remove(click_layer);
  Map.layers().add(click_layer);
}

var layers = {};
function getLayerInstance(key) {
  if (layers[key]) return layers[key];
  var img, vis, name = row_titles[key] || key;
  var b_name = '';

  switch (key) {
    case 'lulc_orig':
      img = lulc;
      vis = { bands: ['classification_' + target_year], min: 0, max: 75, palette: paletaMapBiomas };
      break;
    case 'trans_adj':
      img = desf_reg_corrected;
      vis = { bands: ['classification_' + target_year], min: 0, max: 7, palette: paletaTrans };
      break;
    case 'trans_orig':
      img = desf_reg;
      vis = { bands: ['classification_' + target_year], min: 0, max: 7, palette: paletaTrans };
      break;
    case 'age_secveg':
      img = final_image;
      vis = { bands: ['age_secveg_' + target_year], min: 1, max: 40, palette: ['#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c'] };
      break;
    case 'out_stock':
      img = final_image;
      vis = { bands: ['stock_' + target_year], min: 0, max: 250, palette: paletaStock };
      break;
    case 'out_defor':
      b_name = 'loss_deforestation_' + target_year;
      img = final_image.updateMask(final_image.select(b_name).neq(0));
      vis = { bands: [b_name], min: 0, max: 100, palette: ['white', 'red'] };
      break;
    case 'out_secveg':
      b_name = 'gain_secondary_vegetation_' + target_year;
      img = final_image.updateMask(final_image.select(b_name).neq(0));
      vis = { bands: [b_name], min: 0, max: 10, palette: ['white', 'green'] };
      break;
    case 'out_fire':
      b_name = 'loss_fire_' + target_year;
      img = final_image.updateMask(final_image.select(b_name).neq(0));
      vis = { bands: [b_name], min: 0, max: 50, palette: ['white', 'orange', 'red'] };
      break;
    case 'out_logging':
      b_name = 'loss_selective_logging_' + target_year;
      img = final_image.updateMask(final_image.select(b_name).neq(0));
      vis = { bands: [b_name], min: 0, max: 50, palette: ['white', 'brown'] };
      break;
    case 'fire_annual':
      b_name = 'burned_area_' + target_year;
      img = fire_annual.updateMask(fire_annual.select(b_name).neq(0));
      vis = { bands: [b_name], palette: ['red'] };
      break;
    case 'fire_freq':
      img = fire_freq;
      vis = { bands: ['fire_frequency_1985_' + target_year], min: 1, max: 20, palette: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'] };
      break;
    case 'fire_tsf':
      img = fire_tsf;
      vis = { bands: ['classification_' + target_year], min: 1, max: 40, palette: ['#ffffd4', '#fed98e', '#fe9929', '#d95f0e', '#993404'] };
      break;
    case 'stock_in':
      img = biomass_stock_bruto;
      vis = { bands: ['biomass_stock_' + target_year], min: 0, max: 250, palette: paletaStock };
      break;
    case 'logging_raw':
      b_name = 'logging_tC_ha_' + target_year;
      img = logging.updateMask(logging.select(b_name).neq(0));
      vis = { bands: [b_name], min: 0, max: 10, palette: ['white', 'brown'] };
      break;
    case 'fire_forest':
    case 'fire_forest_co2':
      b_name = 'CO2_tC_ha_' + target_year;
      img = fire_forest.updateMask(fire_forest.select(b_name).neq(0));
      vis = { bands: [b_name], min: 0, max: 50, palette: ['white', 'orange', 'red'] };
      break;
    case 'fire_savanna':
    case 'fire_savanna_co2':
      b_name = 'CO2_tC_ha_' + target_year;
      img = fire_savanna.updateMask(fire_savanna.select(b_name).neq(0));
      vis = { bands: [b_name], min: 0, max: 50, palette: ['white', 'orange', 'red'] };
      break;
    case 'fire_grassland':
    case 'fire_grassland_ch4':
      b_name = 'CH4_t_ha_' + target_year;
      img = fire_grassland.updateMask(fire_grassland.select(b_name).neq(0));
      vis = { bands: [b_name], min: 0, max: 0.1, palette: ['white', 'purple'] };
      break;
    case 'fire_forest_ch4':
      b_name = 'CH4_t_ha_' + target_year;
      img = fire_forest.updateMask(fire_forest.select(b_name).neq(0));
      vis = { bands: [b_name], min: 0, max: 0.1, palette: ['white', 'purple'] };
      break;
    case 'fire_forest_n2o':
      b_name = 'N2O_t_ha_' + target_year;
      img = fire_forest.updateMask(fire_forest.select(b_name).neq(0));
      vis = { bands: [b_name], min: 0, max: 0.01, palette: ['white', 'cyan'] };
      break;
    case 'fire_savanna_ch4':
      b_name = 'CH4_t_ha_' + target_year;
      img = fire_savanna.updateMask(fire_savanna.select(b_name).neq(0));
      vis = { bands: [b_name], min: 0, max: 0.1, palette: ['white', 'purple'] };
      break;
    case 'fire_savanna_n2o':
      b_name = 'N2O_t_ha_' + target_year;
      img = fire_savanna.updateMask(fire_savanna.select(b_name).neq(0));
      vis = { bands: [b_name], min: 0, max: 0.01, palette: ['white', 'cyan'] };
      break;
    case 'fire_grassland_n2o':
      b_name = 'N2O_t_ha_' + target_year;
      img = fire_grassland.updateMask(fire_grassland.select(b_name).neq(0));
      vis = { bands: [b_name], min: 0, max: 0.01, palette: ['white', 'cyan'] };
      break;
    default:
      return null;
  }
  layers[key] = ui.Map.Layer(img, vis, name);
  return layers[key];
}

function convertValue(val, unit, area_fact) {
  var f_massa = (unit.indexOf('kg') !== -1) ? 1000 : 1;
  var f_quimico = (unit.indexOf('CO2e') !== -1) ? TC_TO_TCO2 : 1;
  var f_area = (unit.indexOf('/px') !== -1) ? (area_fact || 0.09) : 1;
  return val * f_massa * f_quimico * f_area;
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
unit_panel.add(ui.Select({
  items: ['tCO2e/ha', 'tC/ha', 'kgCO2e/ha', 'kgC/ha', 'tCO2e/px', 'tC/px', 'kgCO2e/px', 'kgC/px'],
  value: config.unit,
  onChange: function (v) { config.unit = v; if (last_data) renderMatrix(last_data); },
  style: { stretch: 'horizontal' }
}));
panel.add(unit_panel);

var matrix_outer = ui.Panel({ style: { stretch: 'both', padding: '2px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6' } });
panel.add(matrix_outer);

var gaveta_panel = ui.Panel({ layout: ui.Panel.Layout.flow('vertical'), style: { margin: '10px 0', border: '1px solid #eee', shown: false } });
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
      updateLayerVisibility(key, c);
      if (last_data) renderMatrix(last_data);
    },
    style: { fontSize: is_sub ? '10px' : '11px', width: is_sub ? '135px' : '160px' }
  });
  row.add(cb); target_panel.add(row);
}

var inputs_panel = ui.Panel();
gaveta_panel.add(ui.Label('Entradas (Inputs):', { fontSize: '10px', color: '#3498db', fontWeight: 'bold' }));
gaveta_panel.add(inputs_panel);
createConfigRow('lulc_orig', 'LULC (MapBiomas)', false, inputs_panel);
createConfigRow('trans_orig', 'TRANS (Original)', false, inputs_panel);
createConfigRow('trans_adj', 'TRANS (Ajustado)', false, inputs_panel);
createConfigRow('age_secveg', 'IDADE SECUNDÁRIA', false, inputs_panel);
createConfigRow('fire_annual', 'ÁREA QUEIMADA', false, inputs_panel);
createConfigRow('fire_freq', 'FREQ. FOGO', false, inputs_panel);
createConfigRow('fire_tsf', 'TSF (Anos)', false, inputs_panel);
createConfigRow('stock_in', 'ESTOQUE BASE', false, inputs_panel);
createConfigRow('logging_raw', 'MADEIRA (Raw tC/ha)', false, inputs_panel);
createConfigRow('fire_forest', 'FOGO FLORESTA', false, inputs_panel);
createConfigRow('fire_forest_co2', '↳ CO2 (tC)', true, inputs_panel);
createConfigRow('fire_forest_ch4', '↳ CH4 (t)', true, inputs_panel);
// createConfigRow('fire_forest_n2o', '↳ N2O (t)', true, inputs_panel);
createConfigRow('fire_savanna', 'FOGO SAVANA', false, inputs_panel);
createConfigRow('fire_savanna_co2', '↳ CO2 (tC)', true, inputs_panel);
createConfigRow('fire_savanna_ch4', '↳ CH4 (t)', true, inputs_panel);
// createConfigRow('fire_savanna_n2o', '↳ N2O (t)', true, inputs_panel);
createConfigRow('fire_grassland', 'FOGO CAMPESTRE', false, inputs_panel);
createConfigRow('fire_grassland_ch4', '↳ CH4 (t)', true, inputs_panel);
// createConfigRow('fire_grassland_n2o', '↳ N2O (t)', true, inputs_panel);

var outputs_panel = ui.Panel();
gaveta_panel.add(ui.Label('Saídas (Produto Final):', { fontSize: '10px', color: '#27ae60', fontWeight: 'bold' }));
gaveta_panel.add(outputs_panel);
createConfigRow('out_stock', 'Estoque Final', false, outputs_panel);
createConfigRow('out_fire', 'Fogo Total', false, outputs_panel);
createConfigRow('out_logging', 'Madeira Total', false, outputs_panel);
createConfigRow('out_secveg', 'Regeneração Total', false, outputs_panel);
createConfigRow('out_defor', 'Balanço Desmat.', false, outputs_panel);

ui.root.insert(0, panel);

function getColor(key, val) {
  if (val === null || val === undefined || isNaN(val) || val === 0 || val === ' ') return '#ffffff';
  var palette = [];
  var color = '#ffffff';
  if (key === 'lulc_orig') color = paletaMapBiomas[val];
  else if (key === 'trans_orig' || key === 'trans_adj') color = paletaTrans[val];
  else if (key === 'stock_in' || key === 'out_stock') {
    palette = paletaStock;
    var i = Math.min(palette.length - 1, Math.max(0, Math.floor((val / 250) * (palette.length - 1))));
    color = palette[i];
  } else if (key === 'fire_annual') color = val > 0 ? '#ea1c1c' : '#ffffff';
  else if (key === 'fire_freq' || key === 'fire_tsf' || key === 'age_secveg') {
    palette = (key === 'age_secveg') ? ['#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c'] : ['#ffffcc', '#fed976', '#fd8d3c', '#fc4e2a', '#e31a1c', '#800026'];
    var i = Math.min(palette.length - 1, Math.max(0, Math.floor((val / 40) * (palette.length - 1))));
    color = palette[i];
  } else if (key === 'out_defor') color = val > 0 ? '#ffcccc' : '#ffffff';
  else if (key === 'out_secveg') color = val > 0 ? '#ccffcc' : '#ffffff';
  else if (key === 'out_fire') color = val > 0 ? '#ffddbb' : '#ffffff';
  else if (key === 'out_logging') color = val > 0 ? '#eeddcc' : '#ffffff';
  return color;
}

function getContrastColor(hexColor) {
  if (!hexColor || hexColor.length < 7) return '#000000';
  var r = parseInt(hexColor.substring(1, 3), 16);
  var g = parseInt(hexColor.substring(3, 5), 16);
  var b = parseInt(hexColor.substring(5, 7), 16);
  var brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return (brightness > 125) ? '#000000' : '#ffffff';
}

function renderMatrix(obj) {
  matrix_outer.clear();
  var container = ui.Panel({ layout: is_transposed ? ui.Panel.Layout.flow('vertical') : ui.Panel.Layout.flow('horizontal') });
  matrix_outer.add(container);
  var l_w = '55px', l_m = '1px', active_keys = Object.keys(row_titles).filter(function (k) { return config[k] });

  var title_panel = ui.Panel({ layout: is_transposed ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'), style: { backgroundColor: '#e9ecef', border: '1px solid #adb5bd', margin: l_m } });
  active_keys.forEach(function (k) {
    title_panel.add(ui.Label(row_titles[k], { fontWeight: 'bold', fontSize: '8px', width: l_w, textAlign: 'center', margin: l_m }));
  });
  container.add(title_panel);

  YEARS_FIRE.forEach(function (year) {
    var sub = ui.Panel({ layout: is_transposed ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'), style: { border: '1px solid #ced4da', margin: l_m } });
    active_keys.forEach(function (k) {
      var val = '--', style = { margin: l_m, fontSize: '9px', width: l_w, textAlign: 'center' };
      if (k === 'lulc_orig') {
        var l = obj['lulc_' + year];
        val = l ? ('00' + l).slice(-2) : '--';
        style.backgroundColor = paletaMapBiomas[l] || '#ffffff';
        style.color = getContrastColor(style.backgroundColor);
      }
      else if (k === 'year') val = year.slice(-2);
      else {
        var base = 0;
        if (k === 'stock_in') base = obj['biomass_stock_' + year];
        else if (k === 'trans_orig') base = obj['trans_o_' + year];
        else if (k === 'trans_adj') base = obj['trans_c_' + year];
        else if (k === 'age_secveg') base = obj['age_secveg_' + year];
        else if (k === 'out_stock') base = obj['stock_' + year];
        else if (k === 'out_fire' || k === 'out_defor' || k === 'out_logging' || k === 'out_secveg') {
          var area_fact = obj.pixel_area_ha || 0.09;
          var raw_pixel = obj['loss_fire_' + year] || obj['loss_selective_logging_' + year] || obj['loss_deforestation_' + year] || obj['gain_secondary_vegetation_' + year] || 0;
          if (k === 'out_fire') raw_pixel = obj['loss_fire_' + year] || 0;
          if (k === 'out_logging') raw_pixel = obj['loss_selective_logging_' + year] || 0;
          if (k === 'out_defor') raw_pixel = obj['loss_deforestation_' + year] || 0;
          if (k === 'out_secveg') raw_pixel = obj['gain_secondary_vegetation_' + year] || 0;
          base = (raw_pixel / area_fact) / TC_TO_TCO2;
        }
        else if (k === 'fire_annual') base = obj['burn_' + year];
        else if (k === 'fire_freq') base = obj['freq_' + year];
        else if (k === 'fire_tsf') base = obj['tsf_' + year];
        else if (k === 'logging_raw') base = obj['log_logging_tC_ha_' + year];
        else if (k.indexOf('fire_forest') !== -1) base = obj['ff_' + (k.indexOf('_ch4') !== -1 ? 'CH4_t_ha_' : k.indexOf('_n2o') !== -1 ? 'N2O_t_ha_' : 'CO2_tC_ha_') + year];
        else if (k.indexOf('fire_savanna') !== -1) base = obj['fs_' + (k.indexOf('_ch4') !== -1 ? 'CH4_t_ha_' : k.indexOf('_n2o') !== -1 ? 'N2O_t_ha_' : 'CO2_tC_ha_') + year];
        else if (k.indexOf('fire_grassland') !== -1) base = obj['fg_' + (k.indexOf('_n2o') !== -1 ? 'N2O_t_ha_' : 'CH4_t_ha_') + year];

        var is_gas = (k.indexOf('_ch4') !== -1 || k.indexOf('_n2o') !== -1);
        if (['trans_orig', 'trans_adj', 'fire_annual', 'fire_freq', 'fire_tsf', 'age_secveg'].indexOf(k) !== -1) {
          val = (base !== null && base !== undefined) ? base.toFixed(0) : '--';
        } else {
          var area_fact = obj.pixel_area_ha || 0.09;
          var conv = is_gas ? (base || 0) : convertValue(base || 0, config.unit, area_fact);
          val = (conv > 0.0001 || conv < -0.0001) ? conv.toFixed(is_gas ? 3 : 1) : ' ';
          base = conv;
        }
        style.backgroundColor = getColor(k, parseFloat(base)) || '#ffffff';
        style.color = getContrastColor(style.backgroundColor);
      }
      sub.add(ui.Label(String(val), style));
    });
    container.add(sub);
  });
}

Map.onClick(function (coords) {
  print('Click detected at:', coords);
  inspector_results.clear();
  matrix_outer.clear();
  matrix_outer.add(ui.Label('Auditando pixel (aguarde)...', { color: 'gray', fontSize: '12px' }));

  var point = ee.Geometry.Point(coords.lon, coords.lat);
  click_layer.setEeObject(point);
  click_layer.setShown(true);

  print('Iniciando montagem do mosaico multibanda...');
  var combined = ee.Image(0).rename('base_zero')
    .addBands(ee.Image.pixelArea().divide(10000).rename('pixel_area_ha'))
    .addBands(final_image.unmask(0))
    .addBands(biomass_stock_bruto.unmask(0))
    .addBands(lulc.select('classification_.*').unmask(0).rename(YEARS_ALL.map(function (y) { return 'lulc_' + y })))
    .addBands(desf_reg.select('classification_.*').unmask(0).rename(YEARS_ALL.map(function (y) { return 'trans_o_' + y })))
    .addBands(desf_reg_corrected.select('classification_.*').unmask(0).rename(YEARS_ALL.map(function (y) { return 'trans_c_' + y })))
    .addBands(fire_annual.select('burned_area_.*').unmask(0).rename(YEARS_ALL.map(function (y) { return 'burn_' + y })))
    .addBands(fire_freq.select('fire_frequency_1985_.*').unmask(0).rename(YEARS_ALL.map(function (y) { return 'freq_' + y })))
    .addBands(fire_tsf.select('classification_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'tsf_' + y })))
    .addBands(fire_forest.select('CO2_tC_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'ff_CO2_tC_ha_' + y })))
    .addBands(fire_forest.select('CH4_t_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'ff_CH4_t_ha_' + y })))
    .addBands(fire_forest.select('N2O_t_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'ff_N2O_t_ha_' + y })))
    .addBands(fire_savanna.select('CO2_tC_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'fs_CO2_tC_ha_' + y })))
    // .addBands(fire_savanna.select('CH4_t_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'fs_CH4_t_ha_' + y })))
    // .addBands(fire_savanna.select('N2O_t_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'fs_N2O_t_ha_' + y })))
    .addBands(fire_grassland.select('CH4_t_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'fg_CH4_t_ha_' + y })))
    .addBands(fire_grassland.select('N2O_t_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'fg_N2O_t_ha_' + y })))
    .addBands(logging.select('logging_tC_ha_.*').unmask(0).rename(['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'].map(function (y) { return 'log_logging_tC_ha_' + y })));

  print('Executando reduceRegion no ponto...');
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
      matrix_outer.add(ui.Label(err, { fontSize: '10px', color: 'red' }));
      return;
    }

    if (!obj) {
      print('⚠️ Objeto de resultado vazio/nulo');
      matrix_outer.clear();
      matrix_outer.add(ui.Label('Erro de clique: resultado vazio.', { color: 'red' }));
      return;
    }

    print('✅ Resultado recebido com sucesso. Renderizando matriz...');
    last_data = obj;
    renderMatrix(obj);
  });
});
Map.style().set('cursor', 'crosshair');

// 5. INICIALIZAÇÃO DE CAMADAS ATIVAS
Object.keys(config).forEach(function (key) {
  if (config[key] === true && key !== 'year' && key !== 'unit') {
    updateLayerVisibility(key, true);
  }
});
