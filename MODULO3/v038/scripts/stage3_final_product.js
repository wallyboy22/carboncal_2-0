/** Stage 3 — monta e exporta o produto final CCAL_MODULO3-v038. */
var VERSION = 'v038';
var BASE_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/';
var FINAL_ASSET = 'projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO3-' + VERSION;
var YEARS_ALL = [];
for (var y = 1985; y <= 2024; y++) YEARS_ALL.push(String(y));
var YEARS_FIRE = YEARS_ALL.slice(1);

var desfReg = ee.Image(BASE_ASSET + 'desf_reg_corrected');
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection11/' +
  'mapbiomas_brazil_collection11_coverage_v3');
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG14/RETIFICACAO/c_rect_col11');
var secondaryIncrement = ee.Image(BASE_ASSET + 'secondary_veg_increment');
var rawStock = ee.Image().select();
YEARS_ALL.forEach(function (year) {
  var desf = desfReg.select('classification_' + year);
  var secondary = secondaryIncrement.select('sec_veg_increment_' + year).unmask(0);
  rawStock = rawStock.addBands(ee.Image(0)
    .where(desf.eq(2), qcn.select('TOTAL'))
    .where(desf.eq(3).or(desf.eq(5)), secondary)
    .rename('sec_veg_increment_' + year).float());
});

var massBalance = require('users/workspaceipam/CCAL:MODULO3/v038/equations/06_mass_balance.js');
var result = massBalance.calcMassBalance({
  desf_reg_corrected: desfReg,
  biomass_stock_bruto: rawStock,
  fire_forest_CO2: ee.Image(BASE_ASSET + 'fire_forest_CO2'),
  fire_forest_CH4: ee.Image(BASE_ASSET + 'fire_forest_CH4'),
  fire_forest_N2O: ee.Image(BASE_ASSET + 'fire_forest_N2O'),
  fire_savanna_CO2: ee.Image(BASE_ASSET + 'fire_savanna_CO2'),
  fire_savanna_CH4: ee.Image(BASE_ASSET + 'fire_savanna_CH4'),
  fire_savanna_N2O: ee.Image(BASE_ASSET + 'fire_savanna_N2O'),
  fire_grassland_CH4: ee.Image(BASE_ASSET + 'fire_grassland_CH4'),
  fire_grassland_N2O: ee.Image(BASE_ASSET + 'fire_grassland_N2O'),
  logging_forest_CO2: ee.Image(BASE_ASSET + 'logging_forest_CO2'),
  years_all: YEARS_ALL,
  years_fire: YEARS_FIRE
});

function applySpill(image) {
  return ee.Image(image.slice(1).bandNames().iterate(function (current, previous) {
    var name = ee.String(current);
    var prev = ee.Image(previous);
    var next = prev.slice(-1).rename(name).multiply(0)
      .blend(image.select(name).selfMask());
    return prev.addBands(next);
  }, image.select(0).selfMask()));
}

var stockMask = result.biomass_stock.select('stock_.*').slice(1).gt(0);
var fire = applySpill(result.loss_fire).updateMask(stockMask);
var logging = applySpill(result.loss_logging).updateMask(stockMask);
var convergence = applySpill(result.loss_convergence_degradation).updateMask(stockMask);
var finalImage = fire.addBands(logging).addBands(convergence)
  .addBands(result.loss_deforestation.selfMask())
  .addBands(result.gain_sec_veg.selfMask())
  .addBands(result.loss_grassland.selfMask())
  .addBands(result.biomass_stock.selfMask())
  .updateMask(lulc.select('classification_1985').neq(0))
  .float();

Export.image.toAsset({
  image: finalImage,
  description: 'WS_CCAL_M3V038-CCAL_MODULO3-v038',
  assetId: FINAL_ASSET,
  region: lulc.geometry().bounds(),
  scale: 30,
  maxPixels: 1e13,
  pyramidingPolicy: 'median',
  overwrite: true
});

print('Módulo 3 v038 — produto final configurado:', FINAL_ASSET);
print('Bandas:', finalImage.bandNames());
