/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Export: Stage 3 All-in-Memory)
 * VERSÃO: v037
 * SCRIPT: stage3_all_in_memory_hard.js
 * STAGE: 3 (Produto Final - All-in-Memory)
 * DEPENDÊNCIAS: Nenhuma (executa todo o pipeline em memória)
 * DESCRIÇÃO: Executa todo o pipeline v037 em memória com um único export final.
 *            Ideal para testes rápidos ou quando não se quer depender de assets
 *            intermediários.
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
var EXPORT_FLAG = 'WS_IPAM';
var FINAL_ASSET = 'projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO3-' + VERSION;
var SCALE = 30;
var MAX_PIX = 1e13;

var YEARS_ALL = [
    '1985', '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];

var YEARS_FIRE = YEARS_ALL.slice(1);
var YEARS_LOGGING = ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];

// =============================================================================
// 2. INPUTS BRUTOS (assets Stage 0 pré-calculados)
// =============================================================================

print('⏳ Carregando inputs brutos e assets Stage 0...');

// --- Raw inputs (comentados: agora usa assets Stage 0) ---
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
// var desf_reg_raw = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var amazon_mask = ee.Image(1).paint(biomas.filter(ee.Filter.eq('Bioma', 'Amazônia')), 1).eq(1);

// var fire_annual = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1').select('burned_area_.*');
// var fire_freq = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1').select('fire_frequency_1985_.*');
// var fire_tsf = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1').select('classification_.*');

// var emergent_mask = lulc.eq(33).reduce(ee.Reducer.sum()).lt(38);

// --- Assets Stage 0 ---
var BASE_STAGE0 = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/';
var desf_reg_corrected = ee.Image(BASE_STAGE0 + 'desf_reg_corrected');
var grass_forest = ee.Image(BASE_STAGE0 + 'grass_forest');
var forest_mask = ee.Image(BASE_STAGE0 + 'forest_mask');
var savanna_mask = ee.Image(BASE_STAGE0 + 'savanna_mask');
var grassland_mask = ee.Image(BASE_STAGE0 + 'grassland_mask');
var emergent_mask = lulc.eq(33).reduce(ee.Reducer.sum()).lt(38);

print('✅ Inputs brutos e assets Stage 0 carregados!');

// =============================================================================
// 3. EQUAÇÕES
// =============================================================================

// var prep = require('users/workspaceipam/CCAL:MODULO3/v037/equations/00_data_prep.js');
var secVeg = require('users/workspaceipam/CCAL:MODULO3/v037/equations/01_secondary_veg.js');
var fireForest = require('users/workspaceipam/CCAL:MODULO3/v037/equations/02_fire_forest.js');
var fireSavanna = require('users/workspaceipam/CCAL:MODULO3/v037/equations/03_fire_savanna.js');
var fireGrassland = require('users/workspaceipam/CCAL:MODULO3/v037/equations/04_fire_grassland.js');
var logging = require('users/workspaceipam/CCAL:MODULO3/v037/equations/05_logging.js');
var massBalance = require('users/workspaceipam/CCAL:MODULO3/v037/equations/06_mass_balance.js');
var degradationMask = require('users/workspaceipam/CCAL:MODULO3/v037/equations/08_degradation_mask.js');

// =============================================================================
// 4. STAGE 0 — PREPARAÇÃO DE DADOS (comentado: usa assets Stage 0)
// =============================================================================

// print('⏳ Stage 0: Preparação de dados...');
// var prep_result = prep.prepareAll({
//     lulc: lulc,
//     desf_reg: desf_reg_raw,
//     years: YEARS_ALL,
//     submerged_threshold: 38
// });
// print('✅ Stage 0 concluído!');

// =============================================================================
// 5. STAGE 1 — EMISSÕES E DEGRADAÇÃO (em memória, com dados Stage 0)
// =============================================================================

print('⏳ Stage 1: Calculando emissões e degradação...');

// 5a. Vegetação Secundária
var sec_veg = secVeg.calcSecondaryVegIncrement({
    desf_reg_corrected: desf_reg_corrected,
    grass_forest: grass_forest,
    total_carbon: qcn.select('TOTAL'),
    biomas: biomas,
    years: YEARS_ALL
});

// 5b. Fogo em Florestas
var fire_f = fireForest.calcForestFireEmissions({
    annual_burned: ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1').select('burned_area_.*'),
    fire_frequency: ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1').select('fire_frequency_1985_.*'),
    time_since_fire: ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1').select('classification_.*'),
    agb: qcn.select('AGB'),
    cdw: qcn.select('CDW'),
    litter: qcn.select('LITTER'),
    forest_mask: forest_mask,
    biomas: biomas,
    years: YEARS_FIRE
});

// 5c. Fogo em Savanas
var fire_s = fireSavanna.calcSavannaFireEmissions({
    annual_burned: ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1').select('burned_area_.*'),
    fire_frequency: ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1').select('fire_frequency_1985_.*'),
    time_since_fire: ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1').select('classification_.*'),
    agb: qcn.select('AGB'),
    cdw: qcn.select('CDW'),
    litter: qcn.select('LITTER'),
    savanna_mask: savanna_mask,
    years: YEARS_FIRE
});

// 5d. Fogo em Campos
var fire_g = fireGrassland.calcGrasslandFireEmissions({
    annual_burned: ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1').select('burned_area_.*'),
    agb: qcn.select('AGB'),
    cdw: qcn.select('CDW'),
    litter: qcn.select('LITTER'),
    grassland_mask: grassland_mask,
    years: YEARS_FIRE
});

// 5e. Corte Seletivo
var log = logging.calcLoggingEmissions({
    agb: qcn.select('AGB'),
    forest_mask: forest_mask,
    amazon_mask: amazon_mask,
    loss_fraction: 0.196,
    years: YEARS_LOGGING
});

// 5f. Máscara de Degradação
var deg_mask = degradationMask.createDegradationMask({
    fire_forest_CO2: fire_f.CO2,
    fire_savanna_CO2: fire_s.CO2,
    logging_forest_CO2: log,
    vegetation_mask: forest_mask,
    years: YEARS_FIRE
});

print('✅ Stage 1 concluído!');

// =============================================================================
// 6. STAGE 2 — BALANÇO DE MASSA (em memória)
// =============================================================================

print('⏳ Stage 2: Calculando balanço de massa...');

// Cria estoque bruto: primária (QCN TOTAL) + secundária (incremento)
var biomass_stock_bruto = ee.Image().select();
YEARS_ALL.forEach(function (y) {
    var desf_y = desf_reg_corrected.select('classification_' + y);
    var sec_y = sec_veg.select('sec_veg_increment_' + y).unmask(0);
    var stock_y = ee.Image(0)
        .where(desf_y.eq(2), qcn.select('TOTAL'))
        .where(desf_y.eq(3).or(desf_y.eq(5)), sec_y)
        .rename('sec_veg_increment_' + y)
        .float();
    biomass_stock_bruto = biomass_stock_bruto.addBands(stock_y);
});

var balance = massBalance.calcMassBalance({
    desf_reg_corrected: desf_reg_corrected,
    biomass_stock_bruto: biomass_stock_bruto,
    fire_forest_CO2: fire_f.CO2,
    fire_forest_CO2_gross: fire_f.CO2_gross,
    fire_forest_CH4: fire_f.CH4,
    fire_forest_N2O: fire_f.N2O,
    fire_forest_CO: fire_f.CO,
    fire_forest_NOX: fire_f.NOX,
    fire_savanna_CO2: fire_s.CO2,
    fire_savanna_CO2_gross: fire_s.CO2_gross,
    fire_savanna_CH4: fire_s.CH4,
    fire_savanna_N2O: fire_s.N2O,
    fire_savanna_CO: fire_s.CO,
    fire_savanna_NOX: fire_s.NOX,
    fire_grassland_CH4: fire_g.CH4,
    fire_grassland_N2O: fire_g.N2O,
    fire_grassland_CO: fire_g.CO,
    fire_grassland_NOX: fire_g.NOX,
    logging_forest_CO2: log,
    emergent_mask: emergent_mask,
    years_all: YEARS_ALL,
    years_fire: YEARS_FIRE
});

print('✅ Stage 2 concluído!');

// =============================================================================
// 7. STAGE 3 — PRODUTO FINAL (em memória)
// =============================================================================

print('⏳ Stage 3: Montando produto final...');

var final_image = balance.loss_fire
    .addBands(balance.loss_grassland)
    .addBands(balance.loss_logging)
    .addBands(balance.loss_convergence_degradation)
    .addBands(balance.loss_deforestation)
    .addBands(balance.gain_sec_veg)
    .addBands(balance.biomass_stock)
    .updateMask(emergent_mask)
    .float();

print('✅ Produto final montado!');

// =============================================================================
// 8. EXPORT
// =============================================================================

print('⏳ Iniciando export...');

Export.image.toAsset({
    image: final_image,
    description: EXPORT_FLAG + '_CCAL_MODULO3_' + VERSION,
    assetId: FINAL_ASSET,
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});

print('📤 Export: CCAL_MODULO3-' + VERSION);
print('📦 Asset: ' + FINAL_ASSET);
print('📊 Bandas:');
print('   - loss_fire_YYYY (tCO₂e/pixel)');
print('   - loss_grassland_YYYY (tCO₂e/pixel)');
print('   - loss_selective_logging_YYYY (tCO₂e/pixel)');
print('   - loss_convergence_degradation_YYYY (tCO₂e/pixel)');
print('   - loss_deforestation_YYYY (tCO₂e/pixel)');
print('   - gain_secondary_vegetation_YYYY (tCO₂e/pixel)');
print('   - stock_YYYY (tC/ha)');
print('');
print('✅ Pipeline v037 all-in-memory concluído!');
print('💡 Este script usa assets Stage 0 em vez de recalcular inputs brutos.');
print('💡 Para debug, use o pipeline multi-stage (stage0-3).');
