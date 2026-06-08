/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Export: Máscara de Degradação)
 * VERSÃO: v037
 * SCRIPT: 08_export_degradation_mask.js
 * STAGE: 1.5 (Máscara de Degradação)
 * DEPENDÊNCIAS: Stage 1 (fire_forest_CO2, fire_savanna_CO2, logging_forest_CO2)
 * DESCRIÇÃO: Cria e exporta máscara binária de degradação persistente.
 *            Rastreia pixels degradados (fogo ou corte) até desmatamento.
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

var YEARS_FIRE = [
    '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];

var forest_mask = ee.Image(BASE_ASSET + 'forest_mask');
var fire_forest_CO2 = ee.Image(BASE_ASSET + 'fire_forest_CO2');
var fire_savanna_CO2 = ee.Image(BASE_ASSET + 'fire_savanna_CO2');
var logging_forest_CO2 = ee.Image(BASE_ASSET + 'logging_forest_CO2');

var degradationMask = require('users/workspaceipam/CCAL:MODULO3/v037/equations/08_degradation_mask');

print('⏳ Calculando máscara de degradação...');

var result = degradationMask.createDegradationMask({
    fire_forest_CO2: fire_forest_CO2,
    fire_savanna_CO2: fire_savanna_CO2,
    logging_forest_CO2: logging_forest_CO2,
    vegetation_mask: forest_mask,
    years: YEARS_FIRE
});

print('✅ Cálculo concluído!');
print('⏳ Iniciando export...');

Export.image.toAsset({
    image: result,
    description: 'degradation_mask_' + VERSION,
    assetId: BASE_ASSET + 'degradation_mask',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'sample'
});

print('📤 Export: degradation_mask');
print('📦 Asset: ' + BASE_ASSET + 'degradation_mask');
print('📊 Bandas: 1986...2024 (0=não degradado, 1=degradado)');
print('');
print('💡 Uso: gt(0) calcula área degradada (exclui ganhos de savana)');
