/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Export: Stage 1 - Cálculos de Emissão e Regeneração)
 * VERSÃO: v037
 * SCRIPT: 01_export_stage1.js
 * STAGE: 1 (Cálculos Paralelos)
 * DEPENDÊNCIAS: Stage 0 (desf_reg_corrected, forest_mask, savanna_mask, grassland_mask, grass_forest)
 * DESCRIÇÃO: Calcula e exporta todos os assets de emissão, regeneração e máscara de degradação.
 *            Exporta 11 assets separados em um único task.
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
var SCALE = 30;
var MAX_PIX = 1e13;

var YEARS_ALL = [
    '1985', '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];

var YEARS_FIRE = YEARS_ALL.slice(1); // 1986-2024
var YEARS_LOGGING = ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];

// =============================================================================
// 2. INPUTS
// =============================================================================

// Assets do Stage 0
var desf_reg_corrected = ee.Image(BASE_ASSET + 'desf_reg_corrected');
var forest_mask = ee.Image(BASE_ASSET + 'forest_mask');
var savanna_mask = ee.Image(BASE_ASSET + 'savanna_mask');
var grassland_mask = ee.Image(BASE_ASSET + 'grassland_mask');
var grass_forest = ee.Image(BASE_ASSET + 'grass_forest');

// Inputs externos
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var amazon_mask = ee.Image(1).paint(biomas.filter(ee.Filter.eq('Bioma', 'Amazônia')), 1).eq(1);

var fire_annual = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1').select('burned_area_.*');
var fire_freq = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1').select('fire_frequency_1985_.*');
var fire_tsf = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1').select('classification_.*');

// =============================================================================
// 3. EQUAÇÕES
// =============================================================================

var secVeg = require('users/workspaceipam/CCAL:MODULO3/v037/equations/01_secondary_veg');
var fireForest = require('users/workspaceipam/CCAL:MODULO3/v037/equations/02_fire_forest');
var fireSavanna = require('users/workspaceipam/CCAL:MODULO3/v037/equations/03_fire_savanna');
var fireGrassland = require('users/workspaceipam/CCAL:MODULO3/v037/equations/04_fire_grassland');
var logging = require('users/workspaceipam/CCAL:MODULO3/v037/equations/05_logging');
var degradationMask = require('users/workspaceipam/CCAL:MODULO3/v037/equations/08_degradation_mask');

// =============================================================================
// 4. CÁLCULOS
// =============================================================================

print('⏳ Iniciando cálculos do Stage 1...');

// 4a. Vegetação Secundária
print('  ⏳ Calculando vegetação secundária...');
var sec_veg = secVeg.calcSecondaryVegIncrement({
    desf_reg_corrected: desf_reg_corrected,
    grass_forest: grass_forest,
    total_carbon: qcn.select('TOTAL'),
    biomas: biomas,
    years: YEARS_ALL
});
print('  ✅ secondary_veg_increment concluído');

// 4b. Fogo em Florestas
print('  ⏳ Calculando fogo em florestas (FATE)...');
var fire_f = fireForest.calcForestFireEmissions({
    annual_burned: fire_annual,
    fire_frequency: fire_freq,
    time_since_fire: fire_tsf,
    agb: qcn.select('AGB'),
    cdw: qcn.select('CDW'),
    litter: qcn.select('LITTER'),
    forest_mask: forest_mask,
    biomas: biomas,
    years: YEARS_FIRE
});
print('  ✅ fire_forest {CO2, CH4, N2O} concluído');

// 4c. Fogo em Savanas
print('  ⏳ Calculando fogo em savanas...');
var fire_s = fireSavanna.calcSavannaFireEmissions({
    annual_burned: fire_annual,
    fire_frequency: fire_freq,
    time_since_fire: fire_tsf,
    agb: qcn.select('AGB'),
    cdw: qcn.select('CDW'),
    litter: qcn.select('LITTER'),
    savanna_mask: savanna_mask,
    years: YEARS_FIRE
});
print('  ✅ fire_savanna {CO2, CH4, N2O} concluído');

// 4d. Fogo em Campos
print('  ⏳ Calculando fogo em campos...');
var fire_g = fireGrassland.calcGrasslandFireEmissions({
    annual_burned: fire_annual,
    agb: qcn.select('AGB'),
    cdw: qcn.select('CDW'),
    litter: qcn.select('LITTER'),
    grassland_mask: grassland_mask,
    years: YEARS_FIRE
});
print('  ✅ fire_grassland {CH4, N2O} concluído');

// 4e. Corte Seletivo
print('  ⏳ Calculando corte seletivo...');
var log = logging.calcLoggingEmissions({
    agb: qcn.select('AGB'),
    forest_mask: forest_mask,
    amazon_mask: amazon_mask,
    loss_fraction: 0.196,
    years: YEARS_LOGGING
});
print('  ✅ logging_forest_CO2 concluído');

// 4f. Máscara de Degradação
print('  ⏳ Calculando máscara de degradação...');
var deg_mask = degradationMask.createDegradationMask({
    fire_forest_CO2: fire_f.CO2,
    fire_savanna_CO2: fire_s.CO2,
    logging_forest_CO2: log,
    vegetation_mask: forest_mask,
    years: YEARS_FIRE
});
print('  ✅ degradation_mask concluído');

print('✅ Todos os cálculos do Stage 1 concluídos!');

// =============================================================================
// 5. EXPORTS (11 assets)
// =============================================================================

print('⏳ Iniciando exports...');

// Biomassa
Export.image.toAsset({
    image: sec_veg,
    description: 'secondary_veg_increment_' + VERSION,
    assetId: BASE_ASSET + 'secondary_veg_increment',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});

// Fogo Floresta (3 assets)
Export.image.toAsset({
    image: fire_f.CO2,
    description: 'fire_forest_CO2_' + VERSION,
    assetId: BASE_ASSET + 'fire_forest_CO2',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});

Export.image.toAsset({
    image: fire_f.CH4,
    description: 'fire_forest_CH4_' + VERSION,
    assetId: BASE_ASSET + 'fire_forest_CH4',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});

Export.image.toAsset({
    image: fire_f.N2O,
    description: 'fire_forest_N2O_' + VERSION,
    assetId: BASE_ASSET + 'fire_forest_N2O',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});

// Fogo Savana (3 assets)
Export.image.toAsset({
    image: fire_s.CO2,
    description: 'fire_savanna_CO2_' + VERSION,
    assetId: BASE_ASSET + 'fire_savanna_CO2',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});

Export.image.toAsset({
    image: fire_s.CH4,
    description: 'fire_savanna_CH4_' + VERSION,
    assetId: BASE_ASSET + 'fire_savanna_CH4',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});

Export.image.toAsset({
    image: fire_s.N2O,
    description: 'fire_savanna_N2O_' + VERSION,
    assetId: BASE_ASSET + 'fire_savanna_N2O',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});

// Fogo Campo (2 assets)
Export.image.toAsset({
    image: fire_g.CH4,
    description: 'fire_grassland_CH4_' + VERSION,
    assetId: BASE_ASSET + 'fire_grassland_CH4',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});

Export.image.toAsset({
    image: fire_g.N2O,
    description: 'fire_grassland_N2O_' + VERSION,
    assetId: BASE_ASSET + 'fire_grassland_N2O',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});

// Corte Seletivo
Export.image.toAsset({
    image: log,
    description: 'logging_forest_CO2_' + VERSION,
    assetId: BASE_ASSET + 'logging_forest_CO2',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});

// Máscara de Degradação
Export.image.toAsset({
    image: deg_mask,
    description: 'degradation_mask_' + VERSION,
    assetId: BASE_ASSET + 'degradation_mask',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'sample'
});

// =============================================================================
// 6. RESUMO
// =============================================================================

print('✅ Stage 1 concluído!');
print('📦 11 assets a serem exportados:');
print('   - secondary_veg_increment (tC/ha)');
print('   - fire_forest_CO2 (tCO₂e/ha)');
print('   - fire_forest_CH4 (tCO₂e/ha)');
print('   - fire_forest_N2O (tCO₂e/ha)');
print('   - fire_savanna_CO2 (tCO₂e/ha)');
print('   - fire_savanna_CH4 (tCO₂e/ha)');
print('   - fire_savanna_N2O (tCO₂e/ha)');
print('   - fire_grassland_CH4 (tCO₂e/ha)');
print('   - fire_grassland_N2O (tCO₂e/ha)');
print('   - logging_forest_CO2 (tCO₂e/ha)');
print('   - degradation_mask (0/1)');
print('');
print('⏳ Aguarde a conclusão no GEE Task Manager.');
print('📋 Próximo passo: Rodar Stage 2 (06_export_mass_balance.js)');
