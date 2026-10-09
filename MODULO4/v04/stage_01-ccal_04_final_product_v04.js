// =============================================================================
// CCAL Módulo 4 — v04 (Stage 01: consolidated product & land cover)
// Brazil — all biomes | 1986–2024
// =============================================================================

var VERSION = 'v04';
var STAGE_00_COLLECTION = 'projects/ee-ipam/assets/CCAL/MODULO4/v04/emissions_removals_v04';
var FINAL_OUT = 'projects/ee-ipam/assets/CCAL/MODULO4/v04';
var FINAL_ASSET_ID = FINAL_OUT + '/CCAL_MODULO4-' + VERSION;
var LANDCOVER_ASSET_ID = FINAL_OUT + '/land_cover_masks';
var YEARS = [];
for (var year = 1986; year <= 2024; year++) YEARS.push(year);

var DEFAULT_CRS = 'EPSG:4326';
var DEFAULT_TRANSFORM = [0.00026949458523585647, 0, -180, 0, -0.00026949458523585647, 90];
var SCALE = 30;
var MAX_PIX = 1e13;
var brazil = ee.FeatureCollection('projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026');

function buildStack(bandPrefix) {
  var stacked = ee.Image().select();
  YEARS.forEach(function (year) {
    var annual = ee.Image(STAGE_00_COLLECTION + '/' + year);
    stacked = stacked.addBands(annual.select(bandPrefix + '_' + year));
  });
  return stacked;
}

var rawStock = buildStack('stock');
var rawDefor = buildStack('loss_deforestation');
var rawDeforSec = buildStack('loss_deforestation_secondary');
var rawGainSec = buildStack('gain_secondary_vegetation');
var rawNetBal = buildStack('net_balance');
var rawAgc0 = buildStack('agc0_state');
var rawEdge = buildStack('loss_edge');
var rawLogging = buildStack('loss_selective_logging');
var rawFire = buildStack('loss_fire');
var rawEdgeMask = buildStack('mask_edge');
var rawLoggingMask = buildStack('mask_logging');
var rawFireMask = buildStack('mask_fire');

// Convergence is diagnostics for overlap; component losses remain the balance inputs.
var degTypes = [
  'loss_edge',
  'loss_selective_logging',
  'loss_fire',
  'loss_convergence_edge_logging',
  'loss_convergence_edge_fire',
  'loss_convergence_logging_fire',
  'loss_convergence_edge_logging_fire',
  'loss_convergence_degradation'
];
var finalDegradation = ee.Image().select();

degTypes.forEach(function (type) {
  var annualStack = buildStack(type);
  var spilled = ee.Image(annualStack.slice(1).bandNames().iterate(function (current, previous) {
    var bandName = ee.String(current);
    var prev = ee.Image(previous);
    var next = prev.slice(-1).rename(bandName).multiply(0)
      .blend(annualStack.select(bandName).selfMask());
    return prev.addBands(next);
  }, annualStack.select(0).selfMask()));
  finalDegradation = finalDegradation.addBands(spilled.updateMask(rawAgc0.gt(0)));
});

var finalImage = ee.Image().select();
degTypes.forEach(function (type) {
  YEARS.forEach(function (year) {
    finalImage = finalImage.addBands(finalDegradation.select(type + '_' + year));
  });
});

YEARS.forEach(function (year) {
  finalImage = finalImage.addBands(rawDefor.select('loss_deforestation_' + year).selfMask());
  finalImage = finalImage.addBands(rawDeforSec.select('loss_deforestation_secondary_' + year).selfMask());
  finalImage = finalImage.addBands(rawGainSec.select('gain_secondary_vegetation_' + year).selfMask());
  finalImage = finalImage.addBands(rawNetBal.select('net_balance_' + year).selfMask());
  finalImage = finalImage.addBands(rawStock.select('stock_' + year).selfMask());
});
finalImage = finalImage.float();

// A pixel is degraded if any process occurs; convergence is not the land-cover test.
var mapbiomas = ee.Image(
  'projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_coverage_v3'
);
var forestReference = mapbiomas.select('classification_1985').eq(3)
  .or(mapbiomas.select('classification_1985').eq(6))
  .multiply(ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2')
    .unmask(0).remap([1, 2], [1, 1], 0));
var landCover = ee.Image().select();
var wasDeforested = ee.Image(0);
var wasDegraded = ee.Image(0);

YEARS.forEach(function (year) {
  var previousYear = year > 1986 ? year - 1 : 1986;
  var isPrimary = rawAgc0.select('agc0_state_' + year).gt(0);
  var defYear = rawAgc0.select('agc0_state_' + previousYear).gt(0)
    .and(rawAgc0.select('agc0_state_' + year).eq(0));
  var eventDegradation = rawEdgeMask.select('mask_edge_' + year).gt(0)
    .or(rawLoggingMask.select('mask_logging_' + year).gt(0))
    .or(rawFireMask.select('mask_fire_' + year).gt(0));

  wasDeforested = wasDeforested.or(defYear);
  wasDegraded = wasDegraded.or(eventDegradation);
  var anthropic = forestReference.eq(0).or(wasDeforested.and(defYear.not()));
  var preserved = isPrimary.and(wasDegraded.not()).and(defYear.not());
  var degraded = isPrimary.and(wasDegraded).and(defYear.not());
  var mask = ee.Image(0).where(anthropic, 1).where(preserved, 2)
    .where(degraded, 3).where(defYear, 4);
  landCover = landCover.addBands(mask.rename('land_cover_' + year));
});
landCover = landCover.byte();

function exportAsset(image, description, assetId, pyramidingPolicy) {
  Export.image.toAsset({
    image: image,
    description: description,
    assetId: assetId,
    region: brazil.geometry().bounds(),
    crs: DEFAULT_CRS,
    crsTransform: DEFAULT_TRANSFORM,
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: {'.default': pyramidingPolicy || 'mean'},
    overwrite: true
  });
}

// Per-ha products retain current band convention. Convergence breakdowns are diagnostics;
// do not add them to component losses or net_balance (that would double count emissions).
degTypes.forEach(function (type) {
  exportAsset(buildStack(type).divide(ee.Image.pixelArea().multiply(0.0001)).float(),
    type + '_t_ha', FINAL_OUT + '/' + type + '_t_ha');
});
exportAsset(rawStock.float(), 'stock_tC_ha', FINAL_OUT + '/stock_tC_ha');
exportAsset(landCover, 'land_cover_masks', LANDCOVER_ASSET_ID, 'mode');
exportAsset(finalImage, 'ccal_brazil_modulo_4_v04', FINAL_ASSET_ID, 'median');

print('CCAL Módulo 4 v04 Stage 01 configured:', FINAL_ASSET_ID);
print('Convergence bands:', degTypes.slice(3));
