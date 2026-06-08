/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Export: Corte Seletivo)
 * VERSÃO: v037
 * SCRIPT: 05_export_logging.js
 * STAGE: 1 (Cálculos Paralelos)
 * DEPENDÊNCIAS: Stage 0 (forest_mask)
 * DESCRIÇÃO: Calcula e exporta emissões por corte seletivo.
 *            Exporta 1 asset: logging_forest_CO2 (tCO₂e/ha).
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

var VERSION = 'v037';
var BASE_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/';
var SCALE = 30;
var MAX_PIX = 1e13;

var YEARS_LOGGING = ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];

var forest_mask = ee.Image(BASE_ASSET + 'forest_mask');
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var amazon_mask = ee.Image(1).paint(biomas.filter(ee.Filter.eq('Bioma', 'Amazônia')), 1).eq(1);

var logging = require('users/workspaceipam/CCAL:MODULO3/v037/equations/05_logging');

print('⏳ Calculando emissões por corte seletivo...');

var result = logging.calcLoggingEmissions({
    agb: qcn.select('AGB'),
    forest_mask: forest_mask,
    amazon_mask: amazon_mask,
    loss_fraction: 0.196,
    years: YEARS_LOGGING
});

print('✅ Cálculo concluído!');
print('⏳ Iniciando export...');

Export.image.toAsset({
    image: result,
    description: 'logging_forest_CO2_' + VERSION,
    assetId: BASE_ASSET + 'logging_forest_CO2',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});

print('📤 Export: logging_forest_CO2');
print('📦 Asset: ' + BASE_ASSET + 'logging_forest_CO2');
print('📊 Bandas: 2017...2024 (tCO₂e/ha)');
