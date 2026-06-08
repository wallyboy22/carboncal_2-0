/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Auditoria e Visualização)
 * VERSÃO: v037
 * SCRIPT: audit_all_data.js
 * DESCRIÇÃO: Carrega e visualiza todos os assets do pipeline v037 para auditoria.
 *            Plota máscaras, emissões, biomassa e produto final.
 * -----------------------------------------------------------------------------
 * INSTITUIÇÃO: IPAM Amazônia
 * EQUIPE CCAL: Ane Alencar; Bárbara Zimbres; Camila Silva; Celso Silva-Junior;
 *              Edriano Souza; Isabel Silva; Lívia Laureto; Manuela Padilha;
 *              Paulo Moutinho; Rebecca Maranhão; Valderli Piontekowski; Wallace Silva;
 *              Jarlene Gomes; Julia Shimbo
 * CONTATO: https://ipam.org.br/contato/fale-conosco/
 * ATUALIZAÇÃO: 2026-06-08
 * =============================================================================
 */

// =============================================================================
// 1. CONFIGURAÇÃO
// =============================================================================

var VERSION = 'v037';
var BASE_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/';
var TARGET_YEAR = '2023';

// Paletas
var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');
var paletaStock = ["#440154", "#46327e", "#365c8d", "#277f8e", "#1fa187", "#4ac16d", "#a0da39", "#fde725"];
var paletaEmissions = ["#ffffff", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#bd0026", "#800026"];
var paletaBinary = ["#ffffff", "#ff0000"];

// =============================================================================
// 2. INPUTS EXTERNOS
// =============================================================================

var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');

// =============================================================================
// 3. ASSETS DO STAGE 0 (Prep/Cobertura)
// =============================================================================

print('📊 Carregando assets do Stage 0...');

var desf_reg_corrected = ee.Image(BASE_ASSET + 'desf_reg_corrected');
var forest_mask = ee.Image(BASE_ASSET + 'forest_mask');
var savanna_mask = ee.Image(BASE_ASSET + 'savanna_mask');
var grassland_mask = ee.Image(BASE_ASSET + 'grassland_mask');
var grass_forest = ee.Image(BASE_ASSET + 'grass_forest');

Map.addLayer(lulc, { bands: ['classification_' + TARGET_YEAR], min: 0, max: 75, palette: paletaMapBiomas }, 'LULC ' + TARGET_YEAR, false);
Map.addLayer(qcn, { bands: ['TOTAL'], min: 0, max: 250, palette: paletaStock }, 'QCN Total (tC/ha)', false);

Map.addLayer(desf_reg_corrected, { bands: ['classification_' + TARGET_YEAR], min: 0, max: 8, palette: ['white', 'gray', 'green', 'lime', 'orange', 'yellow', 'red', 'purple', 'black'] }, 'desf_reg_corrected ' + TARGET_YEAR, false);
Map.addLayer(forest_mask, { bands: ['classification_' + TARGET_YEAR], palette: paletaBinary }, 'forest_mask ' + TARGET_YEAR, false);
Map.addLayer(savanna_mask, { bands: ['classification_' + TARGET_YEAR], palette: paletaBinary }, 'savanna_mask ' + TARGET_YEAR, false);
Map.addLayer(grassland_mask, { bands: ['classification_' + TARGET_YEAR], palette: paletaBinary }, 'grassland_mask ' + TARGET_YEAR, false);
Map.addLayer(grass_forest, { bands: ['classification_' + TARGET_YEAR], min: 0, max: 2, palette: ['yellow', 'green'] }, 'grass_forest ' + TARGET_YEAR, false);

// =============================================================================
// 4. ASSETS DO STAGE 1 (Emissões + Degradação)
// =============================================================================

print('📊 Carregando assets do Stage 1...');

var secondary_veg = ee.Image(BASE_ASSET + 'secondary_veg_increment');
var fire_f_CO2 = ee.Image(BASE_ASSET + 'fire_forest_CO2');
var fire_f_CH4 = ee.Image(BASE_ASSET + 'fire_forest_CH4');
var fire_f_N2O = ee.Image(BASE_ASSET + 'fire_forest_N2O');
var fire_s_CO2 = ee.Image(BASE_ASSET + 'fire_savanna_CO2');
var fire_s_CH4 = ee.Image(BASE_ASSET + 'fire_savanna_CH4');
var fire_s_N2O = ee.Image(BASE_ASSET + 'fire_savanna_N2O');
var fire_g_CH4 = ee.Image(BASE_ASSET + 'fire_grassland_CH4');
var fire_g_N2O = ee.Image(BASE_ASSET + 'fire_grassland_N2O');
var logging = ee.Image(BASE_ASSET + 'logging_forest_CO2');
var deg_mask = ee.Image(BASE_ASSET + 'degradation_mask');

Map.addLayer(secondary_veg, { bands: [TARGET_YEAR], min: 0, max: 100, palette: paletaStock }, 'secondary_veg_increment ' + TARGET_YEAR, false);

Map.addLayer(fire_f_CO2, { bands: [TARGET_YEAR], min: 0, max: 50, palette: paletaEmissions }, 'fire_forest_CO2 ' + TARGET_YEAR, false);
Map.addLayer(fire_f_CH4, { bands: [TARGET_YEAR], min: 0, max: 0.5, palette: paletaEmissions }, 'fire_forest_CH4 ' + TARGET_YEAR, false);
Map.addLayer(fire_f_N2O, { bands: [TARGET_YEAR], min: 0, max: 0.05, palette: paletaEmissions }, 'fire_forest_N2O ' + TARGET_YEAR, false);

Map.addLayer(fire_s_CO2, { bands: [TARGET_YEAR], min: 0, max: 50, palette: paletaEmissions }, 'fire_savanna_CO2 ' + TARGET_YEAR, false);
Map.addLayer(fire_s_CH4, { bands: [TARGET_YEAR], min: 0, max: 0.5, palette: paletaEmissions }, 'fire_savanna_CH4 ' + TARGET_YEAR, false);
Map.addLayer(fire_s_N2O, { bands: [TARGET_YEAR], min: 0, max: 0.05, palette: paletaEmissions }, 'fire_savanna_N2O ' + TARGET_YEAR, false);

Map.addLayer(fire_g_CH4, { bands: [TARGET_YEAR], min: 0, max: 0.5, palette: paletaEmissions }, 'fire_grassland_CH4 ' + TARGET_YEAR, false);
Map.addLayer(fire_g_N2O, { bands: [TARGET_YEAR], min: 0, max: 0.05, palette: paletaEmissions }, 'fire_grassland_N2O ' + TARGET_YEAR, false);

Map.addLayer(logging, { bands: ['2023'], min: 0, max: 10, palette: paletaEmissions }, 'logging_forest_CO2 2023', false);

Map.addLayer(deg_mask, { bands: [TARGET_YEAR], palette: paletaBinary }, 'degradation_mask ' + TARGET_YEAR, false);

// =============================================================================
// 5. ASSETS DO STAGE 2 (Balanço)
// =============================================================================

print('📊 Carregando assets do Stage 2...');

var biomass_stock = ee.Image(BASE_ASSET + 'biomass_stock');

Map.addLayer(biomass_stock, { bands: [TARGET_YEAR], min: 0, max: 250, palette: paletaStock }, 'biomass_stock ' + TARGET_YEAR, false);

// =============================================================================
// 6. ASSETS DO STAGE 3 (Produto Final)
// =============================================================================

print('📊 Carregando produto final...');

var final_product = ee.Image('projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO3-' + VERSION);

Map.addLayer(final_product, { bands: ['loss_fire_' + TARGET_YEAR], min: 0, max: 10000, palette: paletaEmissions }, 'loss_fire ' + TARGET_YEAR, false);
Map.addLayer(final_product, { bands: ['loss_deforestation_' + TARGET_YEAR], min: 0, max: 50000, palette: paletaEmissions }, 'loss_deforestation ' + TARGET_YEAR, false);
Map.addLayer(final_product, { bands: ['gain_secondary_vegetation_' + TARGET_YEAR], min: 0, max: 10000, palette: ['#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c'] }, 'gain_secondary_vegetation ' + TARGET_YEAR, false);
Map.addLayer(final_product, { bands: ['stock_' + TARGET_YEAR], min: 0, max: 250, palette: paletaStock }, 'stock ' + TARGET_YEAR, false);

// =============================================================================
// 7. RESUMO
// =============================================================================

print('✅ Auditoria carregada!');
print('📊 Camadas disponíveis no Map Viewer:');
print('   Stage 0: desf_reg_corrected, forest_mask, savanna_mask, grassland_mask, grass_forest');
print('   Stage 1: secondary_veg, fire_forest_{CO2,CH4,N2O}, fire_savanna_{CO2,CH4,N2O}, fire_grassland_{CH4,N2O}, logging, degradation_mask');
print('   Stage 2: biomass_stock');
print('   Stage 3: loss_fire, loss_deforestation, gain_secondary_vegetation, stock');
print('');
print('💡 Ano alvo: ' + TARGET_YEAR);
print('💡 Ative/desative camadas no painel esquerdo do GEE');
