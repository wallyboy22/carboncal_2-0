// =============================================================================
// CCAL Módulo 2 — v02 (Stage 01: Síntese no formato CCAL)
// Brazil — florestas + savanas | Emissões 2017–2023 | Estoque 2016–2023
//
// Consolida os assets de CCAL_MODULO_2_V1 (florestas/savanas × gás) no padrão
// de saída CCAL (M1/M3):
//   loss_fire_YYYY, loss_selective_logging_YYYY,
//   loss_convergence_degradation_YYYY, loss_deforestation_YYYY, stock_YYYY
//
// Aplica a correção de spill (intervalo ativo de degradação entre a primeira
// degradação e o desmatamento), como M1 stage01 / M3 stage3 / M4 stage01.
//
// Exports:
//   1. CCAL_MODELOS/CCAL_MODULO2-v02        (consolidado, float32, median)
//   2. CCAL/MODULO2/v02/land_cover_masks    (classe 0–4, separado, mode)
//   3. CCAL/MODULO2/v02/{loss_*_t_ha, stock_tC_ha} (densidades)
// =============================================================================

var VERSION = 'v02';
var SRC = 'projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO_2_V1';
var FINAL_ASSET_ID = 'projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO2-' + VERSION;
var V02_ROOT = 'projects/ee-ipam/assets/CCAL/MODULO2/' + VERSION;
var LANDCOVER_ASSET_ID = V02_ROOT + '/land_cover_masks';

var EMISSION_YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023];
var STOCK_YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];

var DEFAULT_CRS = 'EPSG:4326';
var DEFAULT_TRANSFORM = [0.00026949458523585647, 0, -180, 0, -0.00026949458523585647, 90];
var SCALE = 30;
var MAX_PIX = 1e13;
var FLAG = 'WS_CCAL_M2V02-';

var pixelAreaHa = ee.Image.pixelArea().multiply(0.0001);
var biomes = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var bounds = biomes.geometry().bounds();

// Helper: carrega um asset de emissão/estoque do M2 V1 (banda única)
function load(asset) {
  return ee.Image(SRC + '/' + asset).select(0).unmask(0);
}

// =============================================================================
// 1. AGREGAÇÃO FLORESTAS + SAVANAS → BANDAS CCAL
// =============================================================================

// --- Stock (tC/ha, densidade) ---
var rawStock = ee.Image().select();
STOCK_YEARS.forEach(function(y) {
  var b = load('florestas_stock_' + y).add(load('savanas_stock_' + y));
  rawStock = rawStock.addBands(b.rename('stock_' + y));
});

// --- Fogo (tCO2e/pixel) ---
// Florestas: comb (CO2+CH4+N2O). Savanas: comb (CO2+CH4+N2O) + tardias (loss − gain).
// O ganho tardio de savana é NEGATIVO → somado reduz a perda líquida.
var rawFire = ee.Image().select();
EMISSION_YEARS.forEach(function(y) {
  var b = load('florestas_fire_co2_loss_comb_' + y)
    .add(load('florestas_fire_ch4_loss_comb_' + y))
    .add(load('florestas_fire_n2o_loss_comb_' + y))
    .add(load('savanas_fire_co2_loss_comb_' + y))
    .add(load('savanas_fire_ch4_loss_comb_' + y))
    .add(load('savanas_fire_n2o_loss_comb_' + y))
    .add(load('savanas_fire_co2_loss_late_' + y))
    .add(load('savanas_fire_co2_gain_late_' + y));
  rawFire = rawFire.addBands(b.rename('loss_fire_' + y));
});

// --- Corte seletivo (tCO2e/pixel) ---
var rawSl = ee.Image().select();
EMISSION_YEARS.forEach(function(y) {
  var b = load('florestas_sl_co2_loss_other_' + y).add(load('savanas_sl_co2_loss_other_' + y));
  rawSl = rawSl.addBands(b.rename('loss_selective_logging_' + y));
});

// --- Desmatamento (tCO2e/pixel) ---
var rawDefor = ee.Image().select();
EMISSION_YEARS.forEach(function(y) {
  var b = load('florestas_def_co2_loss_other_' + y)
    .add(load('florestas_def_ch4_loss_comb_' + y))
    .add(load('florestas_def_n2o_loss_comb_' + y))
    .add(load('savanas_def_co2_loss_other_' + y))
    .add(load('savanas_def_ch4_loss_comb_' + y))
    .add(load('savanas_def_n2o_loss_comb_' + y));
  rawDefor = rawDefor.addBands(b.rename('loss_deforestation_' + y));
});

// --- Convergência de degradação (fogo + corte seletivo; M2 não tem borda) ---
var rawConv = ee.Image().select();
EMISSION_YEARS.forEach(function(y) {
  var c = rawFire.select('loss_fire_' + y).add(rawSl.select('loss_selective_logging_' + y));
  rawConv = rawConv.addBands(c.rename('loss_convergence_degradation_' + y));
});

// =============================================================================
// 2. CORREÇÃO DE SPILL — INTERVALO ATIVO DE DEGRADAÇÃO
// =============================================================================

function applySpill(img) {
  return ee.Image(img.slice(1).bandNames().iterate(function(current, previous) {
    var bandname = ee.String(current);
    var prevImg = ee.Image(previous);
    var spilledBand = prevImg
      .slice(-1)
      .rename(bandname)
      .multiply(0)
      .blend(img.select(bandname).selfMask());
    return prevImg.addBands(spilledBand);
  }, img.select(0).selfMask()));
}

// Estoque > 0 nos anos de emissão (2017–2023) → corta o intervalo no desmatamento
var stockMask = rawStock.select('stock_.*').slice(1).gt(0);

var degTypes = ['loss_fire', 'loss_selective_logging', 'loss_convergence_degradation'];
var degStacks = {
  'loss_fire': rawFire,
  'loss_selective_logging': rawSl,
  'loss_convergence_degradation': rawConv
};

var finalDegradation = ee.Image().select();
degTypes.forEach(function(deg) {
  var img = applySpill(degStacks[deg]);
  finalDegradation = finalDegradation.addBands(img.updateMask(stockMask));
});

// =============================================================================
// 3. IMAGEM CONSOLIDADA
// =============================================================================

var finalImage = ee.Image().select();

degTypes.forEach(function(deg) {
  EMISSION_YEARS.forEach(function(y) {
    finalImage = finalImage.addBands(finalDegradation.select(deg + '_' + y));
  });
});
EMISSION_YEARS.forEach(function(y) {
  finalImage = finalImage.addBands(rawDefor.select('loss_deforestation_' + y).selfMask());
});
STOCK_YEARS.forEach(function(y) {
  finalImage = finalImage.addBands(rawStock.select('stock_' + y).selfMask());
});

finalImage = finalImage
  .set({
    'module': 'CCAL_MODULO2',
    'version': VERSION,
    'alignment': 'CCAL_MODULO1_and_MODULO3'
  })
  .float();

// =============================================================================
// 4. DENSIDADES (tCO2e/ha e tC/ha) — valores brutos, sem spill (como M1 stage01)
// =============================================================================

var fireDensity  = rawFire.select('loss_fire.*').divide(pixelAreaHa).float();
var slDensity    = rawSl.select('loss_selective_logging.*').divide(pixelAreaHa).float();
var convDensity  = rawConv.select('loss_convergence_degradation.*').divide(pixelAreaHa).float();
var defDensity   = rawDefor.select('loss_deforestation.*').divide(pixelAreaHa).float();
var stockDensity = rawStock.select('stock.*').float();

// =============================================================================
// 5. LAND COVER (0–4) — ASSET SEPARADO
// =============================================================================

var forestRef = rawStock.select('stock_2016').unmask(0).gt(0);

var landCover = ee.Image().select();
var wasDefed = ee.Image(0);
var wasDegraded = ee.Image(0);

EMISSION_YEARS.forEach(function(yr) {
  var prev = yr - 1;
  var isPrimary = rawStock.select('stock_' + yr).gt(0);
  var defY = rawStock.select('stock_' + prev).gt(0).and(rawStock.select('stock_' + yr).eq(0));
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

// =============================================================================
// 6. EXPORTS
// =============================================================================

function doExport(image, description, assetId, extra) {
  extra = extra || {};
  Export.image.toAsset({
    image: image,
    description: FLAG + description,
    assetId: assetId,
    region: bounds,
    crs: DEFAULT_CRS,
    crsTransform: DEFAULT_TRANSFORM,
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: { '.default': extra.pyramiding || 'mean' },
    overwrite: true
  });
}

// 1–5: Densidades
doExport(fireDensity,  'loss_fire_t_ha',                V02_ROOT + '/loss_fire_t_ha',                {});
doExport(slDensity,    'loss_selective_logging_t_ha',   V02_ROOT + '/loss_selective_logging_t_ha',   {});
doExport(convDensity,  'loss_convergence_degradation_t_ha', V02_ROOT + '/loss_convergence_degradation_t_ha', {});
doExport(defDensity,   'loss_deforestation_t_ha',       V02_ROOT + '/loss_deforestation_t_ha',       {});
doExport(stockDensity, 'stock_tC_ha',                   V02_ROOT + '/stock_tC_ha',                   {});

// 6: Land cover (separado)
doExport(landCover, 'land_cover_masks', LANDCOVER_ASSET_ID, { pyramiding: 'mode' });

// 7: Produto final consolidado
doExport(finalImage, 'ccal_modulo2_synthesis_v02', FINAL_ASSET_ID, { pyramiding: 'median' });

print('Bandas final:', finalImage.bandNames());
print('Bandas landCover:', landCover.bandNames());
print('CCAL Módulo 2 v02 Stage 01 configured. Exports ready for submission.');