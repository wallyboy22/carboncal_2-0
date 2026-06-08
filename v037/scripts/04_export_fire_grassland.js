/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Export: Fogo em Campos)
 * VERSÃO: v037
 * SCRIPT: 04_export_fire_grassland.js
 * STAGE: 1 (Cálculos Paralelos)
 * DEPENDÊNCIAS: Stage 0 (grassland_mask)
 * DESCRIÇÃO: Calcula e exporta emissões por fogo em campos.
 *            Exporta 2 assets separados: CH4, N2O (tCO₂e/ha).
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

var grassland_mask = ee.Image(BASE_ASSET + 'grassland_mask');
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var fire_annual = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1').select('burned_area_.*');

var fireGrassland = require('users/workspaceipam/CCAL:MODULO3/v037/equations/04_fire_grassland');

print('⏳ Calculando emissões por fogo em campos...');

var result = fireGrassland.calcGrasslandFireEmissions({
    annual_burned: fire_annual,
    agb: qcn.select('AGB'),
    cdw: qcn.select('CDW'),
    litter: qcn.select('LITTER'),
    grassland_mask: grassland_mask,
    years: YEARS_FIRE
});

print('✅ Cálculo concluído!');
print('⏳ Iniciando exports...');

Export.image.toAsset({
    image: result.CH4,
    description: 'fire_grassland_CH4_' + VERSION,
    assetId: BASE_ASSET + 'fire_grassland_CH4',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});
print('📤 Export: fire_grassland_CH4');

Export.image.toAsset({
    image: result.N2O,
    description: 'fire_grassland_N2O_' + VERSION,
    assetId: BASE_ASSET + 'fire_grassland_N2O',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});
print('📤 Export: fire_grassland_N2O');

print('');
print('📦 Assets: ' + BASE_ASSET + 'fire_grassland_{CH4,N2O}');
print('📊 Bandas: 1986...2024 (tCO₂e/ha)');
