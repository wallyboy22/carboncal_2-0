/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Export: Stage 3 - Produto Final)
 * VERSÃO: v037
 * SCRIPT: stage3_final_product.js
 * STAGE: 3 (Produto Final)
 * DEPENDÊNCIAS: Stage 0 (desf_reg_corrected) + Stage 1 (todos os assets)
 * DESCRIÇÃO: Calcula balanço de massa e exporta o produto final CCAL_MODULO3-v037
 *            com todas as bandas: loss_fire, loss_logging, loss_deforestation,
 *            gain_secondary_vegetation, loss_grassland, stock.
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
var EXPORT_FLAG = 'WS_IPAM';
var BASE_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/';
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

// =============================================================================
// INPUTS
// =============================================================================

// Stage 0
var desf_reg_corrected = ee.Image(BASE_ASSET + 'desf_reg_corrected');

// Stage 1
var fire_forest_CO2 = ee.Image(BASE_ASSET + 'fire_forest_CO2');
var fire_forest_CH4 = ee.Image(BASE_ASSET + 'fire_forest_CH4');
var fire_forest_N2O = ee.Image(BASE_ASSET + 'fire_forest_N2O');
var fire_savanna_CO2 = ee.Image(BASE_ASSET + 'fire_savanna_CO2');
var fire_savanna_CH4 = ee.Image(BASE_ASSET + 'fire_savanna_CH4');
var fire_savanna_N2O = ee.Image(BASE_ASSET + 'fire_savanna_N2O');
var fire_grassland_CH4 = ee.Image(BASE_ASSET + 'fire_grassland_CH4');
var fire_grassland_N2O = ee.Image(BASE_ASSET + 'fire_grassland_N2O');
var logging_forest_CO2 = ee.Image(BASE_ASSET + 'logging_forest_CO2');
var secondary_veg_increment = ee.Image(BASE_ASSET + 'secondary_veg_increment');

// Externos
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var emergent_mask = lulc.eq(33).reduce(ee.Reducer.sum()).lt(38);

// Cria estoque bruto: primária (QCN TOTAL) + secundária (incremento)
var biomass_stock_bruto = ee.Image().select();
YEARS_ALL.forEach(function (y) {
    var desf_y = desf_reg_corrected.select('classification_' + y);
    var sec_y = secondary_veg_increment.select('sec_veg_increment_' + y).unmask(0);
    var stock_y = ee.Image(0)
        .where(desf_y.eq(2), qcn.select('TOTAL'))
        .where(desf_y.eq(3).or(desf_y.eq(5)), sec_y)
        .rename('sec_veg_increment_' + y)
        .float();
    biomass_stock_bruto = biomass_stock_bruto.addBands(stock_y);
});

// =============================================================================
// EQUAÇÕES
// =============================================================================

var massBalance = require('users/workspaceipam/CCAL:MODULO3/v037/equations/06_mass_balance.js');

// =============================================================================
// CÁLCULO
// =============================================================================

print('⏳ Calculando balanço de massa para produto final...');

var result = massBalance.calcMassBalance({
    desf_reg_corrected: desf_reg_corrected,
    biomass_stock_bruto: biomass_stock_bruto,
    fire_forest_CO2: fire_forest_CO2,
    fire_forest_CH4: fire_forest_CH4,
    fire_forest_N2O: fire_forest_N2O,
    fire_savanna_CO2: fire_savanna_CO2,
    fire_savanna_CH4: fire_savanna_CH4,
    fire_savanna_N2O: fire_savanna_N2O,
    fire_grassland_CH4: fire_grassland_CH4,
    fire_grassland_N2O: fire_grassland_N2O,
    logging_forest_CO2: logging_forest_CO2,
    emergent_mask: emergent_mask,
    years_all: YEARS_ALL,
    years_fire: YEARS_FIRE
});

print('✅ Cálculo concluído!');

// =============================================================================
// MONTAGEM DO PRODUTO FINAL
// =============================================================================

print('⏳ Montando produto final...');




var loss_fire = result.loss_fire
var loss_grassland = result.loss_grassland
var loss_logging = result.loss_logging
var loss_convergence_degradation = result.loss_convergence_degradation
var loss_deforestation = result.loss_deforestation




var emissions = [ 
  ['loss_grassland',loss_grassland],
  ['loss_logging',loss_logging,31],  
  ['loss_convergence_degradation',loss_convergence_degradation], 
  ['loss_deforestation',loss_deforestation]
];

print('desf_reg_corrected',desf_reg_corrected);

var final_image = ee.Image().select();
emissions.forEach(function(list){
  
  var name = list[0];
  var image = list[1];
  var slice = list[2];

  image = ee.Image(image.slice(1).bandNames().iterate(function(current,previous){
    var bandname = ee.String(current);
    var iterate = ee.Image(previous);
    var newImage = iterate
      .slice(-1)
      .rename(bandname)
      .multiply(0)
      .blend(image.select(bandname).gt(0).selfMask());
    
    return iterate.addBands(newImage);
  },image.select(0).gt(0).selfMask()));
    image = image.updateMask(desf_reg_corrected.slice(1).eq(2));
    if(slice){
      image = image.slice(slice);
    }
    
    // Map.addLayer(image,{},name);
    // print(name,image);
    final_image = final_image.addBands(image);
  
});

final_image = final_image
    .addBands(result.gain_sec_veg)
    .addBands(result.biomass_stock)
    .updateMask(emergent_mask)
    .float()
    .updateMask(desf_reg_corrected.select(0).gt(0));

print('✅ Produto final montado!');
print('⏳ Iniciando export...');

Export.image.toAsset({
    image: final_image,
    description: EXPORT_FLAG + '_CCAL_MODULO3_' + VERSION,
    assetId: FINAL_ASSET,
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median',
    region:desf_reg_corrected.geometry(),
    overwrite:true
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
print('✅ Pipeline v037 concluído!');
