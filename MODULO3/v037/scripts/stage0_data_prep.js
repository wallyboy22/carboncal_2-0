/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Export: Preparação de Dados)
 * VERSÃO: v037
 * SCRIPT: stage0_data_prep.js
 * STAGE: 0 (Fundação)
 * DEPENDÊNCIAS: Nenhuma (inputs brutos)
 * DESCRIÇÃO: Corrige e prepara dados de entrada, exportando 5 assets separados
 *            para a pasta v037 no GEE.
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

// --- MapBiomas Col 10.1
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var desf_reg = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');

// =============================================================================
// 3. EQUAÇÕES
// =============================================================================

var prep = require('users/workspaceipam/CCAL:MODULO3/v037/equations/00_data_prep');

// =============================================================================
// 4. PREPARAÇÃO DE DADOS
// =============================================================================

print('⏳ Preparando dados...');

// 4a. Corrige desf_reg (classe 7 → forward-backward fill)
var desf_reg_corrected = prep.correctDesfReg(desf_reg, YEARS_ALL);
print('✅ desf_reg_corrected gerado');

// 4b. Classifica grass/forest
var grass_forest = prep.classifyGrassForest(lulc, YEARS_ALL);
print('✅ grass_forest gerado');

// 4c. Cria máscaras de cobertura
var masks = prep.createCoverageMasks(lulc, desf_reg_corrected, YEARS_ALL);
print('✅ Máscaras de cobertura geradas');

// 4d. Cria máscara de área emersa
var emergent_mask = prep.createEmergentMask(lulc, 38);
print('✅ emergent_mask gerado');

// =============================================================================
// 5. EXPORTAÇÃO DE ASSETS
// =============================================================================

print('⏳ Iniciando exports...');

// 5a. desf_reg_corrected
Export.image.toAsset({
    image: desf_reg_corrected,
    description: 'desf_reg_corrected_' + VERSION,
    assetId: BASE_ASSET + 'desf_reg_corrected',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'sample'
});
print('📤 Export: desf_reg_corrected');

// 5b. forest_mask
Export.image.toAsset({
    image: masks.forest_mask,
    description: 'forest_mask_' + VERSION,
    assetId: BASE_ASSET + 'forest_mask',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'sample'
});
print('📤 Export: forest_mask');

// 5c. savanna_mask
Export.image.toAsset({
    image: masks.savanna_mask,
    description: 'savanna_mask_' + VERSION,
    assetId: BASE_ASSET + 'savanna_mask',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'sample'
});
print('📤 Export: savanna_mask');

// 5d. grassland_mask
Export.image.toAsset({
    image: masks.grassland_mask,
    description: 'grassland_mask_' + VERSION,
    assetId: BASE_ASSET + 'grassland_mask',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'sample'
});
print('📤 Export: grassland_mask');

// 5e. grass_forest
Export.image.toAsset({
    image: grass_forest,
    description: 'grass_forest_' + VERSION,
    assetId: BASE_ASSET + 'grass_forest',
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'sample'
});
print('📤 Export: grass_forest');

// =============================================================================
// 6. RESUMO
// =============================================================================

print('✅ Stage 0 concluído!');
print('📦 Assets a serem exportados:');
print('   - ' + BASE_ASSET + 'desf_reg_corrected');
print('   - ' + BASE_ASSET + 'forest_mask');
print('   - ' + BASE_ASSET + 'savanna_mask');
print('   - ' + BASE_ASSET + 'grassland_mask');
print('   - ' + BASE_ASSET + 'grass_forest');
print('');
print('⏳ Aguarde a conclusão dos exports no GEE Task Manager.');
print('📋 Próximo passo: Rodar Stage 1 (scripts 01-05 em paralelo)');
