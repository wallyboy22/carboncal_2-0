/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Export: Fogo em Florestas)
 * VERSÃO: v037
 * SCRIPT: 02_export_fire_forest.js
 * STAGE: 1 (Cálculos Paralelos)
 * DEPENDÊNCIAS: Stage 0 (forest_mask)
 * DESCRIÇÃO: Calcula e exporta emissões por fogo em florestas (modelo FATE).
 *            Exporta 3 assets separados: CO2, CH4, N2O (tCO₂e/ha).
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

var YEARS_FIRE = [
    '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];

// =============================================================================
// 2. INPUTS
// =============================================================================

// Assets do Stage 0
var forest_mask = ee.Image(BASE_ASSET + 'forest_mask');

// Inputs externos
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var fire_annual = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1').select('burned_area_.*');
var fire_freq = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1').select('fire_frequency_1985_.*');
var fire_tsf = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1').select('classification_.*');

// =============================================================================
// 3. EQUAÇÕES
// =============================================================================

var fireForest = require('users/workspaceipam/CCAL:MODULO3/v037/equations/02_fire_forest');

// =============================================================================
// 4. CÁLCULO
// =============================================================================

print('⏳ Calculando emissões por fogo em florestas (FATE)...');

var result = fireForest.calcForestFireEmissions({
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

print('✅ Cálculo concluído!');

// =============================================================================
// 5. EXPORT (3 assets separados)
// =============================================================================

print('⏳ Iniciando exports...');

// CO2
Export.image.toAsset({
    image: result.CO2,
    description: 'fire_forest_CO2_' + VERSION,
    assetId: BASE_ASSET + 'fire_forest_CO2',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});
print('📤 Export: fire_forest_CO2');

// CH4
Export.image.toAsset({
    image: result.CH4,
    description: 'fire_forest_CH4_' + VERSION,
    assetId: BASE_ASSET + 'fire_forest_CH4',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});
print('📤 Export: fire_forest_CH4');

// N2O
Export.image.toAsset({
    image: result.N2O,
    description: 'fire_forest_N2O_' + VERSION,
    assetId: BASE_ASSET + 'fire_forest_N2O',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});
print('📤 Export: fire_forest_N2O');

print('');
print('📦 Assets:');
print('   - ' + BASE_ASSET + 'fire_forest_CO2');
print('   - ' + BASE_ASSET + 'fire_forest_CH4');
print('   - ' + BASE_ASSET + 'fire_forest_N2O');
print('📊 Bandas: 1986...2024 (tCO₂e/ha)');
print('');
print('⏳ Aguarde a conclusão no GEE Task Manager.');
