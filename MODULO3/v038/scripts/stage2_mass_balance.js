/** Stage 2 — estoque de carbono dinâmico v038. */
var VERSION = 'v038';
var BASE_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/';
var YEARS_ALL = [];
for (var y = 1985; y <= 2024; y++) YEARS_ALL.push(String(y));
var YEARS_FIRE = YEARS_ALL.slice(1);

var desfReg = ee.Image(BASE_ASSET + 'desf_reg_corrected');
var secondaryIncrement = ee.Image(BASE_ASSET + 'secondary_veg_increment');
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection11/' +
  'mapbiomas_brazil_collection11_coverage_v3');
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG14/RETIFICACAO/c_rect_col11');
var rawStock = ee.Image().select();
YEARS_ALL.forEach(function (year) {
  var desf = desfReg.select('classification_' + year);
  var secondary = secondaryIncrement.select('sec_veg_increment_' + year).unmask(0);
  var stock = ee.Image(0).where(desf.eq(2), qcn.select('TOTAL'))
    .where(desf.eq(3).or(desf.eq(5)), secondary)
    .rename('sec_veg_increment_' + year).float();
  rawStock = rawStock.addBands(stock);
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

Export.image.toAsset({
  image: result.biomass_stock.float(),
  description: 'WS_CCAL_M3V038-biomass_stock',
  assetId: BASE_ASSET + 'biomass_stock',
  scale: 30,
  maxPixels: 1e13,
  pyramidingPolicy: 'median',
  overwrite: true
});
print('Módulo 3 v038 — Stage 2 configurado; bandas:', result.biomass_stock.bandNames());
