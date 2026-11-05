// CCAL Módulo 2 v03 — consolidação de florestas + savanas (2017–2024).
// Entrada: model_assets/ (gerada pela etapa de cálculo v03).
// Saídas: produto final, land cover e densidades sob MODULO2/v03.

var VERSION = 'v03';
var SRC = 'projects/ee-ipam/assets/CCAL/MODULO2/' + VERSION + '/model_assets';
var OUT = 'projects/ee-ipam/assets/CCAL/MODULO2/' + VERSION;
var FINAL_ASSET = OUT + '/CCAL_MODULO2-' + VERSION;
var EMISSION_YEARS = [];
var STOCK_YEARS = [];
for (var y = 2017; y <= 2024; y++) EMISSION_YEARS.push(y);
for (var sy = 2016; sy <= 2024; sy++) STOCK_YEARS.push(sy);
var CRS = 'EPSG:4326';
var TRANSFORM = [0.00026949458523585647, 0, -180, 0, -0.00026949458523585647, 90];
var SCALE = 30;
var MAX_PIX = 1e13;
var FLAG = 'WS_CCAL_M2V03-';
var pixelAreaHa = ee.Image.pixelArea().multiply(0.0001);
var biomes = ee.FeatureCollection('projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026');
var bounds = biomes.geometry().bounds();

function load(name) {
  return ee.Image(SRC + '/' + name).select(0).unmask(0);
}

var rawStock = ee.Image().select();
STOCK_YEARS.forEach(function (year) {
  rawStock = rawStock.addBands(
    load('florestas_stock_' + year).add(load('savanas_stock_' + year))
      .rename('stock_' + year));
});

var rawFire = ee.Image().select();
EMISSION_YEARS.forEach(function (year) {
  var fire = load('florestas_fire_co2_loss_comb_' + year)
    .add(load('florestas_fire_ch4_loss_comb_' + year))
    .add(load('florestas_fire_n2o_loss_comb_' + year))
    .add(load('savanas_fire_co2_loss_comb_' + year))
    .add(load('savanas_fire_ch4_loss_comb_' + year))
    .add(load('savanas_fire_n2o_loss_comb_' + year))
    .add(load('savanas_fire_co2_loss_late_' + year))
    .add(load('savanas_fire_co2_gain_late_' + year));
  rawFire = rawFire.addBands(fire.rename('loss_fire_' + year));
});

var rawLogging = ee.Image().select();
EMISSION_YEARS.forEach(function (year) {
  rawLogging = rawLogging.addBands(
    load('florestas_sl_co2_loss_other_' + year)
      .add(load('savanas_sl_co2_loss_other_' + year))
      .rename('loss_selective_logging_' + year));
});

var rawDeforestation = ee.Image().select();
EMISSION_YEARS.forEach(function (year) {
  var def = load('florestas_def_co2_loss_other_' + year)
    .add(load('florestas_def_ch4_loss_comb_' + year))
    .add(load('florestas_def_n2o_loss_comb_' + year))
    .add(load('savanas_def_co2_loss_other_' + year))
    .add(load('savanas_def_ch4_loss_comb_' + year))
    .add(load('savanas_def_n2o_loss_comb_' + year));
  rawDeforestation = rawDeforestation.addBands(def.rename('loss_deforestation_' + year));
});

var rawConvergence = ee.Image().select();
EMISSION_YEARS.forEach(function (year) {
  var fireYear = rawFire.select('loss_fire_' + year);
  var loggingYear = rawLogging.select('loss_selective_logging_' + year);
  var bothProcesses = fireYear.gt(0).and(loggingYear.gt(0));
  rawConvergence = rawConvergence.addBands(
    fireYear.add(loggingYear).updateMask(bothProcesses)
      .rename('loss_convergence_degradation_' + year));
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

var stockMask = rawStock.select('stock_.*').slice(1).gt(0);
var finalDegradation = applySpill(rawFire).updateMask(stockMask)
  .addBands(applySpill(rawLogging).updateMask(stockMask))
  .addBands(applySpill(rawConvergence).updateMask(stockMask));
var finalImage = finalDegradation
  .addBands(rawDeforestation.selfMask())
  .addBands(rawStock.select('stock_2016').selfMask())
  .addBands(rawStock.select('stock_.*').slice(1).selfMask())
  .set({module: 'CCAL_MODULO2', version: VERSION})
  .float();

var forestRef = rawStock.select('stock_2016').unmask(0).gt(0);
var landCover = ee.Image().select();
var wasDeforested = ee.Image(0);
var wasDegraded = ee.Image(0);
EMISSION_YEARS.forEach(function (year) {
  var previousStock = rawStock.select('stock_' + (year - 1));
  var currentStock = rawStock.select('stock_' + year);
  var defYear = previousStock.gt(0).and(currentStock.eq(0));
  var degradationYear = rawFire.select('loss_fire_' + year).gt(0)
    .or(rawLogging.select('loss_selective_logging_' + year).gt(0));
  wasDeforested = wasDeforested.or(defYear);
  wasDegraded = wasDegraded.or(degradationYear);
  var anthropic = forestRef.eq(0).or(wasDeforested.and(defYear.not()));
  var preserved = currentStock.gt(0).and(wasDegraded.not()).and(defYear.not());
  var degraded = currentStock.gt(0).and(wasDegraded).and(defYear.not());
  var mask = ee.Image(0).where(anthropic, 1).where(preserved, 2)
    .where(degraded, 3).where(defYear, 4);
  landCover = landCover.addBands(mask.rename('land_cover_' + year));
});

function exportAsset(image, name, assetId, pyramiding) {
  Export.image.toAsset({
    image: image,
    description: FLAG + name,
    assetId: assetId,
    region: bounds,
    crs: CRS,
    crsTransform: TRANSFORM,
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: {'.default': pyramiding || 'mean'},
    overwrite: true
  });
}

exportAsset(rawFire.select('loss_fire.*').divide(pixelAreaHa).float(),
  'loss_fire_t_ha', OUT + '/loss_fire_t_ha');
exportAsset(rawLogging.select('loss_selective_logging.*').divide(pixelAreaHa).float(),
  'loss_selective_logging_t_ha', OUT + '/loss_selective_logging_t_ha');
exportAsset(rawConvergence.select('loss_convergence_degradation.*').divide(pixelAreaHa).float(),
  'loss_convergence_degradation_t_ha', OUT + '/loss_convergence_degradation_t_ha');
exportAsset(rawDeforestation.select('loss_deforestation.*').divide(pixelAreaHa).float(),
  'loss_deforestation_t_ha', OUT + '/loss_deforestation_t_ha');
exportAsset(rawStock.select('stock.*').float(), 'stock_tC_ha', OUT + '/stock_tC_ha');
exportAsset(landCover.byte(), 'land_cover_masks', OUT + '/land_cover_masks', 'mode');
exportAsset(finalImage, 'ccal_modulo2_synthesis_v03', FINAL_ASSET, 'median');

print('Módulo 2 v03 — síntese configurada. Asset final:', FINAL_ASSET);
print('Bandas finais:', finalImage.bandNames());
