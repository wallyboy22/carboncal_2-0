// =============================================================================
// CCAL Módulo 4 — v01 (Stage 01: Final Consolidated Product & Land Cover)
// Brazil — all biomes | 1986–2024
// Applies degradation spill correction (active interval between first deg & defor)
// Exports:
//   1. MODULO4/v01/CCAL_MODULO4-v01 (Consolidated multi-band image)
//   2. CCAL/MODULO4/v01/land_cover_masks (Land cover 0-4 per year)
// =============================================================================

var VERSION = 'v01';
var STAGE_00_COLLECTION = 'projects/ee-ipam/assets/CCAL/MODULO4/v01/emissions_removals_v01';
var FINAL_OUT = 'projects/ee-ipam/assets/CCAL/MODULO4/v01';
var FINAL_ASSET_ID = FINAL_OUT + '/CCAL_MODULO4-' + VERSION;
var LANDCOVER_ASSET_ID = 'projects/ee-ipam/assets/CCAL/MODULO4/v01/land_cover_masks';

var YEARS = [];
for (var y = 1986; y <= 2024; y++) YEARS.push(y);

var DEFAULT_CRS = 'EPSG:4326';
var DEFAULT_TRANSFORM = [0.00026949458523585647, 0, -180, 0, -0.00026949458523585647, 90];
var SCALE = 30;
var MAX_PIX = 1e13;

var brazil = ee.FeatureCollection('users/celsohlsj/Biomas_250mil');

// Load time series ImageCollection from stage 00
var tsCol = ee.ImageCollection(STAGE_00_COLLECTION);

// Helper to build stacked band image across years
function buildStack(bandPrefix) {
  var stacked = ee.Image().select();
  YEARS.forEach(function(yr) {
    var img = ee.Image(STAGE_00_COLLECTION + '/' + yr);
    var b = img.select(bandPrefix + '_' + yr);
    stacked = stacked.addBands(b);
  });
  return stacked;
}

// 1. Load raw annual stacks
var rawStock = buildStack('stock');
var rawDefor = buildStack('loss_deforestation');
var rawDeforSec = buildStack('loss_deforestation_secondary');
var rawGainSec = buildStack('gain_secondary_vegetation');
var rawNetBal = buildStack('net_balance');
var rawAgc0 = buildStack('agc0_state');

// Degradation bands for spill correction
var degTypes = ['loss_edge', 'loss_selective_logging', 'loss_fire', 'loss_convergence_degradation'];
var finalDegradation = ee.Image().select();

degTypes.forEach(function(deg) {
  var img = buildStack(deg);

  // Spill: propagate values forward without new event
  var spilled = ee.Image(img.slice(1).bandNames().iterate(function(current, previous) {
    var bandname = ee.String(current);
    var prevImg   = ee.Image(previous);
    var spilledBand = prevImg
      .slice(-1)
      .rename(bandname)
      .multiply(0)
      .blend(img.select(bandname).selfMask());
    return prevImg.addBands(spilledBand);
  }, img.select(0).selfMask()));

  // Stock mask: active degradation interval where stock (agc0) > 0
  var activeDeg = spilled.updateMask(rawAgc0.gt(0));
  finalDegradation = finalDegradation.addBands(activeDeg);
});

// Assemble final consolidated image
var finalImage = ee.Image().select();

// Add corrected degradation bands
degTypes.forEach(function(deg) {
  YEARS.forEach(function(yr) {
    finalImage = finalImage.addBands(finalDegradation.select(deg + '_' + yr));
  });
});

// Add deforestation, gain, net balance, and stock bands
YEARS.forEach(function(yr) {
  finalImage = finalImage.addBands(rawDefor.select('loss_deforestation_' + yr).selfMask());
  finalImage = finalImage.addBands(rawDeforSec.select('loss_deforestation_secondary_' + yr).selfMask());
  finalImage = finalImage.addBands(rawGainSec.select('gain_secondary_vegetation_' + yr).selfMask());
  finalImage = finalImage.addBands(rawNetBal.select('net_balance_' + yr).selfMask());
  finalImage = finalImage.addBands(rawStock.select('stock_' + yr).selfMask());
});

finalImage = finalImage.float();

// 2. Build Land Cover Masks (0-4)
// 0=not observed, 1=anthropic, 2=preserved, 3=degraded, 4=deforested
// Reconstruct baseline primary forest reference (same as stage_00 / YbYrá-BR)
var brazilForests = ee.Image("projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2")
                      .unmask(0)
                      .remap([1, 2], [1, 1], 0)
                      .clip(brazil);
var mapbiomas = ee.Image(
  'projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1'
);
var mb1985       = mapbiomas.select('classification_1985');
var forestRef    = mb1985.eq(3).or(mb1985.eq(6)).multiply(brazilForests);

var landCover = ee.Image().select();
var wasDefed = ee.Image(0);
var wasDegraded = ee.Image(0);

YEARS.forEach(function(yr) {
  var prev = yr > 1986 ? yr - 1 : 1986;
  var isPrimary = rawAgc0.select('agc0_state_' + yr).gt(0);
  var defY = rawAgc0.select('agc0_state_' + prev).gt(0)
                .and(rawAgc0.select('agc0_state_' + yr).eq(0));
  var degY = finalDegradation.select('loss_convergence_degradation_' + yr).gt(0);

  wasDefed = wasDefed.or(defY);
  wasDegraded = wasDegraded.or(degY);

  var prevDefMask = wasDefed.and(defY.not());
  var anthropic  = forestRef.eq(0).or(prevDefMask);
  var preserved  = isPrimary.and(wasDegraded.not()).and(defY.not());
  var degraded   = isPrimary.and(wasDegraded).and(defY.not());

  var mask = ee.Image(0)
    .where(anthropic, 1)
    .where(preserved, 2)
    .where(degraded,  3)
    .where(defY,      4);

  landCover = landCover.addBands(mask.rename('land_cover_' + yr));
});
landCover = landCover.byte();

// Exports
Export.image.toAsset({
  image: finalImage,
  description: 'WS_CCAL_M4V01-ccal_brazil_modulo_4_v01',
  assetId: FINAL_ASSET_ID,
  region: brazil.geometry().bounds(),
  crs: DEFAULT_CRS,
  crsTransform: DEFAULT_TRANSFORM,
  scale: SCALE,
  maxPixels: MAX_PIX,
  pyramidingPolicy: { '.default': 'median' },
  overwrite: true
});

Export.image.toAsset({
  image: landCover,
  description: 'WS_CCAL_M4V01-land_cover_masks',
  assetId: LANDCOVER_ASSET_ID,
  region: brazil.geometry().bounds(),
  crs: DEFAULT_CRS,
  crsTransform: DEFAULT_TRANSFORM,
  scale: SCALE,
  maxPixels: MAX_PIX,
  pyramidingPolicy: { '.default': 'mode' },
  overwrite: true
});

print('CCAL Módulo 4 v01 Stage 01 configured. Exports ready for submission.');
