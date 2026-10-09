/** Stage 1 — emissões, regeneração e máscara de degradação v038. */
var VERSION = 'v038';
var BASE_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/';
var SCALE = 30;
var MAX_PIX = 1e13;
var YEARS_ALL = [];
for (var y = 1985; y <= 2024; y++) YEARS_ALL.push(String(y));
var YEARS_FIRE = YEARS_ALL.slice(1);
var YEARS_LOGGING = [];
for (var ly = 1988; ly <= 2024; ly++) YEARS_LOGGING.push(String(ly));

var desfReg = ee.Image(BASE_ASSET + 'desf_reg_corrected');
var forestMask = ee.Image(BASE_ASSET + 'forest_mask');
var savannaMask = ee.Image(BASE_ASSET + 'savanna_mask');
var grasslandMask = ee.Image(BASE_ASSET + 'grassland_mask');
var grassForest = ee.Image(BASE_ASSET + 'grass_forest');
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG14/RETIFICACAO/c_rect_col11');
var biomas = ee.FeatureCollection('projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026');
var amazonMask = ee.Image(1).paint(
  biomas.filter(ee.Filter.eq('Bioma', 'Amazônia')), 1
).eq(1);

var fireAnnualRaw = ee.Image(
  'projects/mapbiomas-public/assets/brazil/fire/collection5_1/' +
  'mapbiomas_fire_collection51_annual_burned_v1'
);
var fireFrequencyRaw = ee.Image(
  'projects/mapbiomas-public/assets/brazil/fire/collection5_1/' +
  'mapbiomas_fire_collection51_fire_frequency_v1'
);
var fireAnnual = ee.Image().select();
var fireAnnualForest = fireAnnualRaw.select('burned_area_1985');
var fireFrequencyAnnual = ee.Image().select();
var fireFrequencyForest = fireFrequencyRaw.select('fire_frequency_1985_1985')
  .rename('burned_area_1985');
YEARS_FIRE.forEach(function (year) {
  var burnedYear = fireAnnualRaw.select('burned_area_' + year);
  fireAnnual = fireAnnual.addBands(burnedYear);
  fireAnnualForest = fireAnnualForest.addBands(burnedYear);
  var cumulativeFreq = fireFrequencyRaw.select('fire_frequency_1985_' + year);
  fireFrequencyAnnual = fireFrequencyAnnual.addBands(
    cumulativeFreq.rename('fire_frequency_' + year));
  // O motor FATE mascara stacks por nomes de bandas; alinhar frequência e queima.
  fireFrequencyForest = fireFrequencyForest.addBands(
    cumulativeFreq.rename('burned_area_' + year));
});
var fireTimeSince = ee.Image(
  'projects/mapbiomas-public/assets/brazil/fire/collection5_1/' +
  'mapbiomas_fire_collection51_time_after_fire_v1'
).select(YEARS_FIRE.map(function (year) { return 'time_after_fire_' + year; }));

var secVegEquation = require('users/workspaceipam/CCAL:MODULO3/v037/equations/01_secondary_veg.js');
var forestFireEquation = require('users/workspaceipam/CCAL:MODULO3/v037/equations/02_fire_forest.js');
var savannaFireEquation = require('users/workspaceipam/CCAL:MODULO3/v038/equations/03_fire_savanna.js');
var grassFireEquation = require('users/workspaceipam/CCAL:MODULO3/v037/equations/04_fire_grassland.js');
var loggingEquation = require('users/workspaceipam/CCAL:MODULO3/v038/equations/05_logging.js');
var degradationEquation = require('users/workspaceipam/CCAL:MODULO3/v038/equations/08_degradation_mask.js');

var secVeg = secVegEquation.calcSecondaryVegIncrement({
  desf_reg_corrected: desfReg,
  grass_forest: grassForest,
  total_carbon: qcn.select('TOTAL'),
  biomas: biomas,
  years: YEARS_ALL
});

var fireForest = forestFireEquation.calcForestFireEmissions({
  annual_burned: fireAnnualForest,
  fire_frequency: fireFrequencyForest,
  time_since_fire: fireTimeSince,
  agb: qcn.select('AGB'),
  cdw: qcn.select('CDW'),
  litter: qcn.select('LITTER'),
  forest_mask: forestMask,
  biomas: biomas,
  years: YEARS_FIRE
});

var fireSavanna = savannaFireEquation.calcSavannaFireEmissions({
  annual_burned: fireAnnual,
  fire_frequency_annual: fireFrequencyAnnual,
  time_since_fire: fireTimeSince,
  agb: qcn.select('AGB'),
  cdw: qcn.select('CDW'),
  litter: qcn.select('LITTER'),
  savanna_mask: savannaMask,
  years: YEARS_FIRE
});

var fireGrassland = grassFireEquation.calcGrasslandFireEmissions({
  annual_burned: fireAnnual,
  agb: qcn.select('AGB'),
  cdw: qcn.select('CDW'),
  litter: qcn.select('LITTER'),
  grassland_mask: grasslandMask,
  years: YEARS_FIRE
});

var loggingInput = ee.Image(
  'projects/mapbiomas-public/assets/brazil/lulc/collection10_1/' +
  'mapbiomas_brazil_collection10_1_degradation_logging_v2'
);
var logging = loggingEquation.calcLoggingEmissions({
  agb: qcn.select('AGB'),
  forest_mask: forestMask,
  amazon_mask: amazonMask,
  logging_binary: loggingInput,
  years: YEARS_LOGGING,
  loss_p0: 0.196,
  loss_decay: 0.0782
});

// A equação de máscara percorre todos os anos de fogo; 1986/1987 não têm logging.
var loggingForMask = ee.Image(0).rename('CO2_tC_ha_1986')
  .addBands(ee.Image(0).rename('CO2_tC_ha_1987'))
  .addBands(logging);
var degradationMask = degradationEquation.createDegradationMask({
  fire_forest_CO2: fireForest.CO2,
  fire_savanna_CO2: fireSavanna.CO2,
  logging_forest_CO2: loggingForMask,
  vegetation_mask: forestMask,
  years: YEARS_FIRE
});

var exports = [
  ['secondary_veg_increment', secVeg, 'median'],
  ['fire_forest_CO2', fireForest.CO2, 'median'],
  ['fire_forest_CO2_gross', fireForest.CO2_gross, 'median'],
  ['fire_forest_CH4', fireForest.CH4, 'median'],
  ['fire_forest_N2O', fireForest.N2O, 'median'],
  ['fire_forest_CO', fireForest.CO, 'median'],
  ['fire_forest_NOX', fireForest.NOX, 'median'],
  ['fire_savanna_CO2', fireSavanna.CO2, 'median'],
  ['fire_savanna_CO2_gross', fireSavanna.CO2_gross, 'median'],
  ['fire_savanna_CH4', fireSavanna.CH4, 'median'],
  ['fire_savanna_N2O', fireSavanna.N2O, 'median'],
  ['fire_savanna_CO', fireSavanna.CO, 'median'],
  ['fire_savanna_NOX', fireSavanna.NOX, 'median'],
  ['fire_grassland_CH4', fireGrassland.CH4, 'median'],
  ['fire_grassland_N2O', fireGrassland.N2O, 'median'],
  ['fire_grassland_CO', fireGrassland.CO, 'median'],
  ['fire_grassland_NOX', fireGrassland.NOX, 'median'],
  ['logging_forest_CO2', logging, 'median'],
  ['degradation_mask', degradationMask, 'sample']
];
exports.forEach(function (item) {
  Export.image.toAsset({
    image: item[1],
    description: 'WS_CCAL_M3V038-' + item[0],
    assetId: BASE_ASSET + item[0],
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: item[2],
    overwrite: true
  });
});

print('Módulo 3 v038 — Stage 1 configurado; exports:', exports.length);
