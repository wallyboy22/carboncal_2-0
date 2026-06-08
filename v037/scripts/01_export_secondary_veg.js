/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Export: Vegetação Secundária)
 * VERSÃO: v037
 * SCRIPT: 01_export_secondary_veg.js
 * STAGE: 1 (Cálculos Paralelos)
 * DEPENDÊNCIAS: Stage 0 (desf_reg_corrected, grass_forest)
 * DESCRIÇÃO: Calcula e exporta incremento anual de carbono em vegetação secundária.
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

// =============================================================================
// 2. INPUTS
// =============================================================================

// Assets do Stage 0
var desf_reg_corrected = ee.Image(BASE_ASSET + 'desf_reg_corrected');
var grass_forest = ee.Image(BASE_ASSET + 'grass_forest');

// Inputs externos
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');

// =============================================================================
// 3. EQUAÇÕES
// =============================================================================

var secVeg = require('users/workspaceipam/CCAL:MODULO3/v037/equations/01_secondary_veg');

// =============================================================================
// 4. CÁLCULO
// =============================================================================

print('⏳ Calculando incremento de vegetação secundária...');

var result = secVeg.calcSecondaryVegIncrement({
    desf_reg_corrected: desf_reg_corrected,
    grass_forest: grass_forest,
    total_carbon: qcn.select('TOTAL'),
    biomas: biomas,
    years: YEARS_ALL
});

print('✅ Cálculo concluído!');

// =============================================================================
// 5. EXPORT
// =============================================================================

print('⏳ Iniciando export...');

Export.image.toAsset({
    image: result,
    description: 'secondary_veg_increment_' + VERSION,
    assetId: BASE_ASSET + 'secondary_veg_increment',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});

print('📤 Export: secondary_veg_increment');
print('📦 Asset: ' + BASE_ASSET + 'secondary_veg_increment');
print('📊 Bandas: 1985...2024 (tC/ha)');
print('');
print('⏳ Aguarde a conclusão no GEE Task Manager.');
