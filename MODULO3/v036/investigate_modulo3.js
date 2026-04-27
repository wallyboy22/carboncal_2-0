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

// Carregamento dos Ativos Intermediários (Exportados com sucesso)
var biomass_stock_bruto = ee.Image(BASE_ASSET + 'biomass_stock_' + VERSION);
var fire_forest = ee.Image(BASE_ASSET + 'fire_forest_emissions_' + VERSION);
var fire_savanna = ee.Image(BASE_ASSET + 'fire_savanna_emissions_' + VERSION);
var fire_grassland = ee.Image(BASE_ASSET + 'fire_grassland_emissions_' + VERSION);
var logging = ee.Image(BASE_ASSET + 'logging_emissions_' + VERSION);

// =============================================================================
// 2. DATASETS DE ENTRADA (Para Investigação e Máscaras)
// =============================================================================
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var desf_reg = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var total_carbon = qcn.select('TOTAL');

var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var water_count = lulc.eq(33).reduce(ee.Reducer.sum());
var always_submerged = water_count.gte(38);

// --- Correção de LULC (Simples para a máscara de balanço)
var desf_reg_corrected = desf_reg; // Pode-se replicar a lógica de correção se necessário

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

  // Fogo CO2e
  var fire_co2e_y = fire_forest_tC.add(fire_savanna_tC).multiply(TC_TO_TCO2);
  var fire_ch4 = fire_forest.select('CH4_t_ha_' + y).unmask(0).add(fire_savanna.select('CH4_t_ha_' + y).unmask(0)).multiply(GWP_CH4);
  var fire_n2o = fire_forest.select('N2O_t_ha_' + y).unmask(0).add(fire_savanna.select('N2O_t_ha_' + y).unmask(0)).multiply(GWP_N2O);
  var fire_total_co2e = fire_co2e_y.add(fire_ch4).add(fire_n2o);

  loss_fire_bands = loss_fire_bands.addBands(fire_total_co2e.multiply(pixel_area_ha).rename('loss_fire_' + y).float());

  var log_co2e_y = logging_tC.multiply(TC_TO_TCO2);
  loss_logging_bands = loss_logging_bands.addBands(log_co2e_y.multiply(pixel_area_ha).rename('loss_selective_logging_' + y).float());
  loss_convergence_bands = loss_convergence_bands.addBands(fire_total_co2e.add(log_co2e_y).multiply(pixel_area_ha).rename('loss_convergence_degradation_' + y).float());

  var grass_ch4 = fire_grassland.select('CH4_t_ha_' + y).unmask(0).multiply(GWP_CH4);
  var grass_n2o = fire_grassland.select('N2O_t_ha_' + y).unmask(0).multiply(GWP_N2O);
  loss_grassland_bands = loss_grassland_bands.addBands(grass_ch4.add(grass_n2o).multiply(pixel_area_ha).rename('loss_grassland_' + y).float());

  loss_deforestation_bands = loss_deforestation_bands.addBands(def_reg_balance_y.max(0).multiply(pixel_area_ha).rename('loss_deforestation_' + y).float());

  var sec_veg_mask = desf_y.eq(3).or(desf_y.eq(5));
  gain_sec_veg_bands = gain_sec_veg_bands.addBands(def_reg_balance_y.min(0).multiply(sec_veg_mask).multiply(pixel_area_ha).rename('gain_secondary_vegetation_' + y).float());

  stock_bands = stock_bands.addBands(stock_updated_y);
});

var final_image = loss_fire_bands.addBands(loss_logging_bands).addBands(loss_convergence_bands)
  .addBands(gain_sec_veg_bands).addBands(loss_grassland_bands).addBands(loss_deforestation_bands)
  .addBands(stock_bands).updateMask(always_submerged.not()).float();

// =============================================================================
// 4. EXPORTAÇÃO DO ATIVO FINAL
// =============================================================================
Export.image.toAsset({
  image: final_image,
  description: 'WSilva-CCAL_MODULO3_' + VERSION,
  assetId: FINAL_ASSET,
  pyramidingPolicy: 'median',
  region: biomas.geometry().bounds(),
  scale: 30,
  maxPixels: 1e13,
});

// =============================================================================
// 5. INTERFACE E INSPEÇÃO (Map.onClick)
// =============================================================================
var panel = ui.Panel({ style: { width: '480px', padding: '8px' } });
var intro = ui.Label({ value: 'Inspeção Temporal — CCAL M3', style: { fontWeight: 'bold', fontSize: '18px', color: '#2c3e50' } });
panel.add(intro);

// Configuração de visibilidade, Unidades e Ajuda
var config = {
  lulc: true,
  stock: true,
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
  lulc: 'Uso e Cobertura (MapBiomas Col 10.1)',
  stock: 'Estoque de Carbono (QCN Retificado)',
  fire_forest: 'Emissões Totais: Floresta',
  fire_forest_co2: 'CO2 Floresta (tC)',
  fire_forest_ch4: 'CH4 Floresta (t)',
  fire_forest_n2o: 'N2O Floresta (t)',
  fire_savanna: 'Emissões Totais: Savana',
  fire_savanna_co2: 'CO2 Savana (tCO2e)',
  fire_savanna_ch4: 'CH4 Savana (t)',
  fire_savanna_n2o: 'N2O Savana (t)',
  fire_grassland: 'Emissões Totais: Campestre',
  fire_grassland_ch4: 'CH4 Campestre (t)',
  fire_grassland_n2o: 'N2O Campestre (t)',
  logging: 'Degradação por Exploração Seletiva',
  defor: 'Balanço de Carbono por LULC'
};

var config_help = {
  lulc: 'Dados do MapBiomas. Identifica transições para cálculo de desmatamento/recuperação.',
  stock: 'Estoque acima/abaixo do solo. Integrado com degradação acumulada em áreas de regeneração.',
  fire_forest: 'Emissões por queima de biomassa. CO2 (tC) + CH4 + N2O convertido para tCO2e.',
  logging: 'Dados Simex/Detex. Aplicado apenas em áreas de floresta a partir de 2017.',
  defor: 'Diferença de estoque entre anos. Positivo = Emissão por Desmatamento.'
};

// Gaveta de Configurações
var gaveta_panel = ui.Panel({
  style: { margin: '5px 0', border: '1px solid #eee', shown: false }
});

var toggle_gaveta = ui.Button({
  label: '⚙️ Configurações e Ajuda Técnica',
  onClick: function () {
    var isShown = gaveta_panel.style().get('shown');
    gaveta_panel.style().set('shown', !isShown);
  },
  style: { stretch: 'horizontal', margin: '5px 0' }
});
panel.add(toggle_gaveta);
panel.add(gaveta_panel);

// Seletor de Unidades
var unit_selector = ui.Select({
  items: ['tCO2e/ha', 'tC/ha', 'kgCO2e/ha', 'kgC/ha'],
  value: config.unit,
  onChange: function(val) {
    config.unit = val;
    if (last_data) renderMatrix(last_data);
  },
  style: { stretch: 'horizontal' }
});
gaveta_panel.add(ui.Label('Unidade de Exibição:', {fontWeight: 'bold', fontSize: '11px'}));
gaveta_panel.add(unit_selector);

function createConfigRow(key, label_text, is_sub) {
  var row = ui.Panel({layout: ui.Panel.Layout.flow('horizontal'), style: {margin: is_sub ? '1px 0 1px 20px' : '3px 0'}});
  
  var cb = ui.Checkbox({
    label: label_text,
    value: config[key],
    onChange: function(checked) {
      config[key] = checked;
      updateLayers();
      if (last_data) renderMatrix(last_data);
    },
    style: {fontSize: is_sub ? '10px' : '11px', fontWeight: is_sub ? 'normal' : 'bold', width: is_sub ? '110px' : '130px'}
  });
  row.add(cb);

  if (config_help[key]) {
    var help_btn = ui.Label('ⓘ', {margin: '5px 0 0 5px', color: '#3498db';    var help_txt = ui.Label(config_help[key], {fontSize: '9px', color: '#7f8c8d', shown: false, margin: '2px 0 2px 25px'});
    help_btn.onClick(function() { help_txt.style().set('shown', !help_txt.style().get('shown')); });
    row.add(help_btn);
    gaveta_panel.add(row);
    gaveta_panel.add(help_txt);
  } else {
    gaveta_panel.add(row);
  }
}

gaveta_panel.add(ui.Label('Variáveis Principais:', {fontWeight: 'bold', fontSize: '11px', margin: '10px 0 2px 0'}));
createConfigRow('lulc', 'LULC');
createConfigRow('stock', 'ESTOQUE');
createConfigRow('defor', 'DESMAT.');
createConfigRow('logging', 'MADEIRA (Log)');

gaveta_panel.add(ui.Label('Emissões por Fogo (Gases):', {fontWeight: 'bold', fontSize: '11px', margin: '10px 0 2px 0'}));
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

function updateLayers() {
  Map.layers().reset();
  Map.addLayer(biomas, {}, 'Brasil Biomas', false);
  if (config.lulc) Map.addLayer(lulc.select('classification_2023'), { min: 0, max: 62, palette: paletaMapBiomas }, 'MapBiomas LULC 2023', false);
  if (config.stock) Map.addLayer(stock_bands.select('stock_2023'), { min: 0, max: 200, palette: ['white', 'green'] }, 'Estoque 2023');
}

var inspector_results = ui.Panel();
panel.add(inspector_results);

// Controle de Transposição
var is_transposed = true;
var last_data = null;

var transpose_btn = ui.Button({
  label: '🔄 Inverter Matriz (Anos em Linhas/Colunas)',
  onClick: function () {
    is_transposed = !is_transposed;
    if (last_data) renderMatrix(last_data);
  },
  style: { stretch: 'horizontal', margin: '10px 0' }
});
panel.add(transpose_btn);

var matrix_outer = ui.Panel({
  style: { stretch: 'both', padding: '2px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6' }
});
panel.add(matrix_outer);

ui.root.insert(0, panel);

// Paleta MapBiomas
var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');

var row_titles = {
  'lulc': 'LULC', 'stock': 'Stock', 'defor': '📉Def', 'logging': '🪓Log', 'year': 'Year',
  'fire_forest': '🔥For', 'fire_forest_co2': 'co2', 'fire_forest_ch4': 'ch4', 'fire_forest_n2o': 'n2o',
  'fire_savanna': '🔥Sav', 'fire_savanna_co2': 'co2', 'fire_savanna_ch4': 'ch4', 'fire_savanna_n2o': 'n2o',
  'fire_grassland': '🔥Gra', 'fire_grassland_ch4': 'ch4', 'fire_grassland_n2o': 'n2o'
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

  var active_keys = Object.keys(row_titles).filter(function(k){return config[k]});
  var title_panel = ui.Panel({
    layout: is_transposed ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'),
    style: { backgroundColor: '#e9ecef', border: '1px solid #adb5bd', margin: label_margin }
  });
  active_keys.forEach(function(k) {
    var is_sub = (k.indexOf('_co2') !== -1 || k.indexOf('_ch4') !== -1 || k.indexOf('_n2o') !== -1);
    title_panel.add(ui.Label(row_titles[k], { 
      fontWeight: is_sub ? 'normal' : 'bold', 
      fontSize: '8px', width: label_width, textAlign: 'center', margin: label_margin,
      color: is_sub ? '#7f8c8d' : '#000'
    }));
  });
  container.add(title_panel);

  YEARS_FIRE.forEach(function (year) {
    var subpanel = ui.Panel({
      layout: is_transposed ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'),
      style: { margin: label_margin, border: '1px solid #ced4da', textAlign: 'center' }
    });

    active_keys.forEach(function(k) {
      var val = '--';
      var style = { margin: label_margin, fontSize: '9px', width: label_width, textAlign: 'center' };
      
      if (k === 'lulc') {
        var l_val = obj['classification_' + year];
        val = l_val ? ('00' + l_val).slice(-2) : '--';
        style.backgroundColor = paletaMapBiomas[l_val] || '#ffffff';
        style.fontWeight = 'bold';
      } else if (k === 'year') {
        val = year.slice(-2);
        style.backgroundColor = '#f1f3f5';
      } else {
        var base_val = 0;
        if (k === 'stock') base_val = obj['stock_' + year];
        else if (k === 'logging') base_val = obj['logging_tC_ha_' + year];
        else if (k === 'defor') base_val = obj['loss_deforestation_' + year] / (0.09 * TC_TO_TCO2);
        
        else if (k === 'fire_forest') base_val = obj['CO2_tC_ha_' + year]; 
        else if (k === 'fire_forest_co2') base_val = obj['CO2_tC_ha_' + year];
        else if (k === 'fire_forest_ch4') base_val = obj['CH4_t_ha_' + year];
        else if (k === 'fire_forest_n2o') base_val = obj['N2O_t_ha_' + year];
        
        else if (k === 'fire_savanna') base_val = obj['CO2_tCO2e_ha_' + year] / TC_TO_TCO2;
        else if (k === 'fire_savanna_co2') base_val = obj['CO2_tCO2e_ha_' + year] / TC_TO_TCO2;
        else if (k === 'fire_savanna_ch4') base_val = obj['CH4_t_ha_' + year];
        else if (k === 'fire_savanna_n2o') base_val = obj['N2O_t_ha_' + year];
        
        else if (k === 'fire_grassland') base_val = 0;
        else if (k === 'fire_grassland_ch4') base_val = obj['CH4_t_ha_' + year];
        else if (k === 'fire_grassland_n2o') base_val = obj['N2O_t_ha_' + year];

        var is_gas = (k.indexOf('_ch4') !== -1 || k.indexOf('_n2o') !== -1);
        var converted = is_gas ? base_val : convertValue(base_val, config.unit); 
        val = (converted > 0.0001 || converted < -0.0001) ? converted.toFixed(is_gas ? 3 : 1) : ' ';
        style.color = (k === 'stock') ? '#27ae60' : (k.indexOf('fire') !== -1 ? '#e67e22' : '#c0392b');
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
  matrix_outer.add(ui.Label('Carregando matriz...', { color: 'gray' }));

  var point = ee.Geometry.Point(coords.lon, coords.lat);
  var combined = final_image.addBands(biomass_stock_bruto).addBands(lulc)
    .addBands(fire_forest).addBands(fire_savanna).addBands(fire_grassland).addBands(logging);
  
  combined.reduceRegion({
    reducer: ee.Reducer.first(),
    geometry: point,
    scale: 30,
    maxPixels: 1e13
  }).evaluate(function (obj) {
    inspector_results.clear();
    if (!obj) {
      inspector_results.add(ui.Label('Sem dados no local.'));
      return;
    }
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
