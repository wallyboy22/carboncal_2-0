/** Stage 0 — preparação das entradas v038 (MapBiomas Collection 11). */
var VERSION = 'v038';
var BASE_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/';
var SCALE = 30;
var MAX_PIX = 1e13;
var YEARS_ALL = [];
for (var y = 1985; y <= 2024; y++) YEARS_ALL.push(String(y));

var lulc = ee.Image(
  'projects/mapbiomas-public/assets/brazil/lulc/collection11/' +
  'mapbiomas_brazil_collection11_coverage_v3'
);
var desfRegRaw = ee.Image(
  'projects/mapbiomas-public/assets/brazil/lulc/collection11/' +
  'mapbiomas_brazil_collection11_deforestation_secondary_vegetation_v4'
);

// O raster de transições começa em 1987. Inicializa 1985/1986 com a classe de 1987.
var desfReg = ee.Image(desfRegRaw.select('classification_1987')
  .rename('classification_1985'))
  .addBands(desfRegRaw.select('classification_1987').rename('classification_1986'))
  .addBands(desfRegRaw);

var prep = require('users/workspaceipam/CCAL:MODULO3/v037/equations/00_data_prep.js');
var desfRegCorrected = prep.correctDesfReg(desfReg, YEARS_ALL);
var grassForest = prep.classifyGrassForest(lulc, YEARS_ALL);
var masks = prep.createCoverageMasks(lulc, desfRegCorrected, YEARS_ALL);

var exports = [
  ['desf_reg_corrected', desfRegCorrected, 'sample'],
  ['forest_mask', masks.forest_mask, 'sample'],
  ['savanna_mask', masks.savanna_mask, 'sample'],
  ['grassland_mask', masks.grassland_mask, 'sample'],
  ['grass_forest', grassForest, 'sample']
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

print('Módulo 3 v038 — Stage 0 configurado', desfRegCorrected.bandNames());
