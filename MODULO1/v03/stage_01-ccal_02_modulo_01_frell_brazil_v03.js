/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var geometry = 
    /* color: #d63000 */
    /* shown: false */
    ee.Geometry.Polygon(
        [[[-76.54780555077535, 6.702549891783329],
          [-76.54780555077535, -36.49659065368281],
          [-28.735305550775358, -36.49659065368281],
          [-28.735305550775358, 6.702549891783329]]], null, false);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// ============================================================
// CCAL MODULO1 — Stage 01 (v03)
// Mosaico + Agregação + Spill + Land Cover → Produto Final
//
// Entrada: stage_00 (biomes_v5/)
// Saída:   7 assets (5 densidade t/ha + 1 land cover + 1 consolidado)
//
// Referência:
//   Silva-Junior, C. H. L. et al. (2026). Nature Communications.
// ============================================================

// ====================================================================
// 1. PARÂMETROS
// ====================================================================

var VERSION = 'v03';
var STAGE_00_ROOT = 'projects/ee-ipam/assets/CCAL/MODULO1/biomes_v5';
var BASE_OUT = 'projects/ee-ipam/assets/CCAL/MODULO1/' + VERSION;
var FINAL_OUT = 'projects/ee-ipam/assets/CCAL/public/ccal_02';
var FINAL_ASSET_ID = FINAL_OUT + '/ccal_02_brazil_modulo_1_frell_v3';
var SCALE = 30;
var MAX_PIX = 1e13;

var BIOME_PREFIXES = ['amz', 'cerr', 'pan', 'pam', 'caa', 'ma'];
var YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
var STOCK_YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

var DEFAULT_CRS = 'EPSG:4326';
var DEFAULT_TRANSFORM = [0.00026949458523585647, 0, -180, 0, -0.00026949458523585647, 90];

var pixelAreaHa = ee.Image.pixelArea().multiply(0.0001);

// ====================================================================
// 2. MAPEAMENTO — quais biomas exportam cada tipo de emissão
// ====================================================================

var EMISSION_BIOMES = {
  'emission_fire_co2':  ['amz'],
  'emission_fire_ch4':  ['amz'],
  'emission_fire_n2o':  ['amz'],
  'emission_sl_co2':    ['amz'],
  'emission_def_co2':   BIOME_PREFIXES,
  'emission_def_ch4':   ['amz', 'cerr'],
  'emission_def_n2o':   ['amz', 'cerr'],
  'stock_carbon':       BIOME_PREFIXES
};

// ====================================================================
// 3. FUNÇÕES DE MOSAICO E AGREGAÇÃO
// ====================================================================

function loadEmissionBand(type, year) {
  var biomes = EMISSION_BIOMES[type];
  var sum = ee.Image(0);
  biomes.forEach(function(pfx) {
    var assetId = STAGE_00_ROOT + '/' + pfx + '_' + type + '_' + year;
    sum = sum.add(ee.Image(assetId).select(0).unmask(0));
  });
  return sum;
}

function buildAggregatedBand(types, year, bandName) {
  var sum = ee.Image(0);
  types.forEach(function(t) { sum = sum.add(loadEmissionBand(t, year)); });
  return sum.rename(bandName + year);
}

// ====================================================================
// 4. MONTAGEM DA IMAGEM CONSOLIDADA PRÉ-SPILL
// ====================================================================

var rawImage = ee.Image(loadEmissionBand('stock_carbon', 2016).rename('stock_2016'));

// --- Fire (CO2 + CH4 + N2O) ---
var fireTypes = ['emission_fire_co2', 'emission_fire_ch4', 'emission_fire_n2o'];
YEARS.forEach(function(y) {
  var band = buildAggregatedBand(fireTypes, y, 'loss_fire_');
  rawImage = rawImage.addBands(band);
});

// --- Selective Logging ---
YEARS.forEach(function(y) {
  var band = buildAggregatedBand(['emission_sl_co2'], y, 'loss_selective_logging_');
  rawImage = rawImage.addBands(band);
});

// --- Deforestation (CO2 + CH4 + N2O) ---
var defTypes = ['emission_def_co2', 'emission_def_ch4', 'emission_def_n2o'];
YEARS.forEach(function(y) {
  var band = buildAggregatedBand(defTypes, y, 'loss_deforestation_');
  rawImage = rawImage.addBands(band);
});

// --- Stock (2017–2024) ---
STOCK_YEARS.slice(1).forEach(function(y) {
  var band = loadEmissionBand('stock_carbon', y).rename('stock_' + y);
  rawImage = rawImage.addBands(band);
});

// ====================================================================
// 5. LOSS_CONVERGENCE_DEGRADATION (interseção fire ∩ SL)
// ====================================================================

var convergence = rawImage.select('loss_fire_.*').selfMask()
  .add(rawImage.select('loss_selective_logging_.*').selfMask())
  .selfMask()
  .rename(
    rawImage.select('loss_fire_.*').bandNames().map(function(str) {
      return ee.String(str).replace('loss_fire', 'loss_convergence_degradation');
    })
  );

rawImage = rawImage.addBands(convergence);

// ====================================================================
// 6. SPILL TEMPORAL + STOCK MASK → IMAGEM FINAL
// ====================================================================

var emissionTypes = ['loss_fire', 'loss_selective_logging', 'loss_convergence_degradation'];

var finalDegradation = ee.Image().select();
emissionTypes.forEach(function(emission) {
  var img = rawImage.select(emission + '.*');

  // Spill: propaga valores para anos seguintes sem evento
  img = ee.Image(img.slice(1).bandNames().iterate(function(current, previous) {
    var bandname = ee.String(current);
    var prevImg   = ee.Image(previous);
    var spilledBand = prevImg
      .slice(-1)
      .rename(bandname)
      .multiply(0)
      .blend(img.select(bandname).selfMask());
    return prevImg.addBands(spilledBand);
  }, img.select(0).selfMask()));

  // Stock mask: só mostra degradação onde stock > 0 (pós ano 2017)
  img = img.updateMask(rawImage.select('stock_.*').slice(1).gt(0));

  finalDegradation = finalDegradation.addBands(img);
});

// Deforestation + Stock: selfMask sem spill
var finalImage = finalDegradation
  .addBands(rawImage.select('loss_deforestation_.*').selfMask())
  .addBands(rawImage.select('stock_.*').selfMask())
  .float();

// ====================================================================
// 7. LAND COVER MASKS (0–4)
// ====================================================================

// Reconstrói forest2016 para a classificação
var vegetationMask = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2')
                       .unmask(0).remap([1, 2], [1, 1], 0);

var prodesLessImg = ee.Image('projects/ee-celsojunior/assets/yearly_deforestation_smaller_than_625ha_biome').unmask(0);
var prodesSmallFroms = [1,2,3,4,5,6,7,8,9];
var prodesSmallTos   = [16,23,24,20,19,18,22,17,21];
var prodesSmall = prodesLessImg.multiply(0);
for (var _si = 0; _si < prodesSmallFroms.length; _si++) {
  prodesSmall = prodesSmall.where(prodesLessImg.eq(prodesSmallFroms[_si]), prodesSmallTos[_si]);
}

var prodesGT = ee.Image('users/celsojunior/prodes_brasil_2024_v20260407').unmask(0);
var prodesUnified = prodesGT.blend(prodesSmall);
var deforestedUpTo2016 = prodesUnified.gte(2).and(prodesUnified.lte(16));
var prodesRaw = ee.Image('projects/ee-ipam/assets/REDD/prodes_brasil_2023').unmask(0);
var prodesNonVegetation = prodesRaw.eq(91).or(prodesRaw.eq(101));

var forest2016 = vegetationMask.eq(1)
  .and(deforestedUpTo2016.not())
  .and(prodesNonVegetation.not());

// Classificação anual
var landCover = ee.Image().select();
var wasDefed = ee.Image(0);
var wasDegraded = ee.Image(0);

STOCK_YEARS.forEach(function(y) {
  var isForest = forest2016.eq(1);
  var isStock  = rawImage.select('stock_' + y).gt(0);

  var defY = ee.Image(0);
  var fireY = ee.Image(0);
  var slY   = ee.Image(0);

  if (y >= 2017) {
    var stockPrev = rawImage.select('stock_' + (y - 1));
    defY = stockPrev.gt(0).and(rawImage.select('stock_' + y).eq(0)).and(isForest);
    fireY = rawImage.select('loss_fire_' + y).gt(0);
    slY   = rawImage.select('loss_selective_logging_' + y).gt(0);
  }

  wasDefed    = wasDefed.or(defY);
  wasDegraded = wasDegraded.or(fireY).or(slY);

  var prevDefMask = wasDefed.and(defY.not());
  var anthropic  = forest2016.eq(0).or(prevDefMask);
  var preserved  = isStock.and(wasDegraded.not()).and(defY.not());
  var degraded   = isStock.and(wasDegraded).and(defY.not());

  var mask = ee.Image(0)
    .where(anthropic, 1)
    .where(preserved, 2)
    .where(degraded,  3)
    .where(defY,      4);

  landCover = landCover.addBands(mask.rename('land_cover_' + y));
});
landCover = landCover.byte();

// ====================================================================
// 8. SAÍDAS EM DENSIDADE (t/ha) — valleys não-spill, sem máscara
// ====================================================================

var fireDensity  = rawImage.select('loss_fire_.*').divide(pixelAreaHa).float();
var slDensity    = rawImage.select('loss_selective_logging_.*').divide(pixelAreaHa).float();
var convDensity  = rawImage.select('loss_convergence_degradation_.*').divide(pixelAreaHa).float();
var defDensity   = rawImage.select('loss_deforestation_.*').divide(pixelAreaHa).float();
var stockDensity = rawImage.select('stock_.*').float();

// ====================================================================
// 9. EXPORTS
// ====================================================================

function doExport(image, bounds, description, assetId, extra) {
  extra = extra || {};
  Export.image.toAsset({
    image: image,
    description: description,
    assetId: assetId,
    crs: extra.crs || DEFAULT_CRS,
    crsTransform: extra.crsTransform || DEFAULT_TRANSFORM,
    // region: image.geometry().bounds(),
    region: bounds,
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: { '.default': extra.pyramiding || 'mean' },
    overwrite: true
  });
}

var bounds = ee.FeatureCollection('projects/ee-ipam/assets/ORIGINAIS/IBGE/limite_biomas_IBGE_2026')
  .geometry()
  .bounds();

// 1–5: Densidade
doExport(fireDensity,  bounds,  'WS_CCAL_modulo1-loss_fire_t_ha',                BASE_OUT + '/loss_fire_t_ha',                {});
doExport(slDensity,    bounds,  'WS_CCAL_modulo1-loss_selective_logging_t_ha',   BASE_OUT + '/loss_selective_logging_t_ha',   {});
doExport(convDensity,  bounds,  'WS_CCAL_modulo1-loss_convergence_degradation_t_ha', BASE_OUT + '/loss_convergence_degradation_t_ha', {});
doExport(defDensity,   bounds,  'WS_CCAL_modulo1-loss_deforestation_t_ha',       BASE_OUT + '/loss_deforestation_t_ha',       {});
doExport(stockDensity, bounds,  'WS_CCAL_modulo1-stock_tC_ha',                   BASE_OUT + '/stock_tC_ha',                   {});

// 6: Land Cover
doExport(landCover, bounds,  'WS_CCAL_modulo1-land_cover_masks', BASE_OUT + '/land_cover_masks', { pyramiding: 'mode' });

// 7: Produto final consolidado
doExport(finalImage, bounds,  'WS_CCAL_modulo1-ccal_02_brazil_modulo_1_frell_v3', FINAL_ASSET_ID, {});

// ====================================================================
// 10. MAPA DE VERIFICAÇÃO
// ====================================================================

var checkYear = '2022';

Map.addLayer(rawImage.select('stock_.*'), {bands: ['stock_' + checkYear], min: 0, max: 250,
  palette: ['#440154','#46327e','#365c8d','#277f8e','#1fa187','#4ac16d','#a0da39','#fde725']},
  'Stock ' + checkYear + ' (tC/ha)', false);

Map.addLayer(finalImage.select('loss_fire_.*'), {bands: ['loss_fire_' + checkYear], min: 0, max: 50,
  palette: ['#fee5d9','#fcae91','#fb6a4a','#de2d26','#a50f15']},
  'Fire ' + checkYear + ' (tCO2e/pixel)', false);

Map.addLayer(finalImage.select('loss_deforestation_.*'), {bands: ['loss_deforestation_' + checkYear], min: 0, max: 150,
  palette: ['#ffffff','#ff0000','#800000']},
  'Deforestation ' + checkYear + ' (tCO2e/pixel)', false);

Map.addLayer(landCover.select('land_cover_.*'), {bands: ['land_cover_' + checkYear], min: 0, max: 4,
  palette: ['#808080','#ffffcc','#1f7849','#fe9934','#ea1c1c']},
  'Land Cover ' + checkYear + ' (0=não obs, 1=antrópico, 2=preservada, 3=degradada, 4=desmatamento)', true);

Map.centerObject(forest2016, 4);

print('Bandas final:', finalImage.bandNames());
print('Bandas landCover:', landCover.bandNames());
print('Bandas densidade fire:', fireDensity.bandNames());
