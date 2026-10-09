// =============================================================================
// CCAL Módulo 4 — v01 (Stage 00: Time Series Emissions & Removals)
// Brazil — all biomes | 1986–2024
// Aligned with CCAL output naming standards (Module 1 & Module 3)
// =============================================================================

var START_YEAR = 1986;
var END_YEAR   = 2024;
var EXPORT_COLLECTION = 'projects/ee-ipam/assets/CCAL/MODULO4/v01/emissions_removals_v01';

var DEFAULT_CRS = 'EPSG:4326';
var DEFAULT_TRANSFORM = [0.00026949458523585647, 0, -180, 0, -0.00026949458523585647, 90];
var FLAG = 'WS_CCAL_modulo4-';

// Region of interest
var brazil = ee.FeatureCollection('users/celsohlsj/Biomas_250mil');

// Masks
var brazilForests = ee.Image("projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2")
                      .unmask(0)
                      .remap([1, 2], [1, 1], 0)
                      .clip(brazil);

// MapBiomas Collection 10.1
var mapbiomas = ee.Image(
  'projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1'
);
var mb1985         = mapbiomas.select('classification_1985');
var forestMask1985 = mb1985.eq(3).or(mb1985.eq(6));
var baselineMask   = forestMask1985.multiply(brazilForests);

// Disturbance Assets
var fireImg  = ee.Image("projects/ee-redd-brazil/assets/ybyra-br-model/forestFireAnnual_mb_c101_fire_c4_1986_2024_v2");
var deforImg = ee.Image("projects/ee-redd-brazil/assets/ybyra-br-model/deforestationAnnual_mb_c101_1986_2024_v2");
var edgeImg  = ee.Image("projects/ee-redd-brazil/assets/ybyra-br-model/edgesAge_mb_c101_390m_1986_2024_v2");
var sfAgeImg = ee.Image('projects/ee-redd-brazil/assets/ybyra-br-model/secondary_forest_age_collection10_1_v8_1')
                 .multiply(brazilForests)
                 .unmask(0)
                 .clip(brazil);
var loggingImg = ee.Image('projects/ee-redd-brazil/assets/ybyra-br-model/logging_frequency_v1');

var BAND_PREFIX         = 'classification_';
var bandName            = function(year) { return BAND_PREFIX + year; };
var LOGGING_BAND_PREFIX = 'logging_freq_';
var loggingBandName     = function(year) { return LOGGING_BAND_PREFIX + year; };

// Initial Primary Forest AGC (Mg C ha-1)
var AGC_INITIAL = ee.ImageCollection('projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1')
                    .select('cagb')
                    .mosaic()
                    .multiply(baselineMask)
                    .clip(brazil);
var AGC0 = AGC_INITIAL;

// Secondary Forest — Chapman-Richards
var CR_A = ee.ImageCollection('projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1')
             .select('cagb')
             .mosaic()
             .clip(brazil);
var CR_b   = ee.Image('projects/ee-ybyra-br-sf/assets/B_30m').clip(brazil);
var CR_K   = ee.Image('projects/ee-ybyra-br-sf/assets/K_30m').clip(brazil);
var CR_M   = 0.67;
var CR_EXP = 1.0 / (1.0 - CR_M);

var chapmanRichards = function(age) {
  var negKAge = CR_K.multiply(age).multiply(-1);
  var inner   = ee.Image(1).subtract(CR_b.multiply(negKAge.exp()));
  return CR_A.multiply(inner.max(0).pow(CR_EXP));
};

// Edge Effect
var ALPHA = 22.518;
var BETA  = 1.615;

var cumulativeLoss = function(edgeAge) {
  return edgeAge.multiply(ALPHA).divide(edgeAge.add(BETA).multiply(100));
};

var incrementalLoss = function(edgeAge) {
  return ee.Image(ALPHA * BETA).divide(edgeAge.add(BETA).multiply(edgeAge.add(BETA - 1)).multiply(100));
};

// Fire Allometric
var postFireAGC = function(agc_pre) {
  return agc_pre.pow(1.4702).multiply(0.07816);
};

// Selective Logging
var LOGGING_P0    = 0.196;
var LOGGING_DECAY = 0.0782;

var loggingFractionalLoss = function(n) {
  return ee.Image(LOGGING_P0).multiply(
           ee.Image(LOGGING_DECAY).multiply(n.subtract(1)).multiply(-1).exp()
         );
};

var pixelAreaHa = ee.Image.pixelArea().multiply(0.0001);
var AGC_sf_prev = ee.Image(0).clip(brazil);

for (var year = START_YEAR; year <= END_YEAR; year++) {
  var bn = bandName(year);

  // Fire mask
  var fireMask = fireImg.select(bn).eq(100).multiply(brazilForests).unmask(0).clip(brazil);
  // Defor mask
  var deforMask = deforImg.select(bn).eq(100).multiply(brazilForests).unmask(0).clip(brazil);
  // Edge age
  var edgeAge = edgeImg.select(bn).multiply(brazilForests).unmask(0).clip(brazil);
  var edgeMask = edgeAge.gte(1);

  // Edge Effect
  var dC       = incrementalLoss(edgeAge).multiply(edgeMask);
  var AGC_edge = AGC0.multiply(ee.Image(1).subtract(cumulativeLoss(edgeAge).multiply(edgeMask)));
  var E_edge   = AGC0.multiply(dC).multiply(44.0 / 12.0).multiply(pixelAreaHa);

  // Selective Logging
  var loggingBand = loggingImg.select(loggingBandName(year)).unmask(0).clip(brazil);
  var loggingMask = loggingBand.gt(0).multiply(brazilForests).multiply(deforMask.not());
  var loggingN    = loggingBand;

  var AGC_pre_logging = AGC_edge;
  var p_n = loggingFractionalLoss(loggingN).multiply(loggingMask);
  var E_logging = AGC_pre_logging.multiply(p_n).multiply(44.0 / 12.0).multiply(pixelAreaHa);
  var AGC_post_logging = AGC_pre_logging.multiply(ee.Image(1).subtract(p_n));

  AGC0 = AGC0.multiply(loggingMask.not()).add(AGC_post_logging.multiply(loggingMask));

  // Fire
  var AGC_pre_fire  = AGC_edge;
  // var AGC_pre_fire  = AGC_post_logging // aplicar para uma v02
  var AGC_post_fire = postFireAGC(AGC_pre_fire);
  var E_fire = AGC_pre_fire.subtract(AGC_post_fire)
                           .multiply(44.0 / 12.0)
                           .multiply(pixelAreaHa)
                           .multiply(fireMask);

  AGC0 = AGC0.multiply(fireMask.not()).add(AGC_post_fire.multiply(fireMask));

  // Deforestation (primary)
  var AGC_pre_defor = AGC_post_fire.multiply(fireMask).add(AGC_edge.multiply(fireMask.not()));
  var E_defor = AGC_pre_defor.multiply(44.0 / 12.0).multiply(pixelAreaHa).multiply(deforMask);

  AGC0 = AGC0.multiply(deforMask.not());

  // Convergence degradation = edge + logging + fire
  var E_convergence = E_edge.add(E_logging).add(E_fire);

  // Secondary Forest
  var sfAge        = sfAgeImg.select(bn);
  var sfActiveMask = sfAge.gt(0);
  var sfNewMask    = sfAge.eq(1);

  var AGC_sf = chapmanRichards(sfAge).multiply(sfActiveMask);
  var AGC_sf_increment = AGC_sf.subtract(AGC_sf_prev).multiply(sfActiveMask);
  var R_sf_co2 = AGC_sf_increment.multiply(44.0 / 12.0).multiply(pixelAreaHa);

  var sfDeforMask = AGC_sf_prev.gt(0).and(sfActiveMask.not());
  var E_sf_defor  = AGC_sf_prev.multiply(44.0 / 12.0).multiply(pixelAreaHa).multiply(sfDeforMask);
  var AGC_sf_co2  = AGC_sf.multiply(44.0 / 12.0).multiply(pixelAreaHa);

  AGC_sf_prev = AGC_sf;

  var E_total_primary = E_edge.add(E_logging).add(E_fire).add(E_defor);
  var netBalance = E_total_primary.add(E_sf_defor).subtract(R_sf_co2);
  var totalStock = AGC0.add(AGC_sf); // tC/ha density

  // Assemble Annual CCAL-aligned Image
  var annualImage = E_edge                  .rename('loss_edge_' + year)
    .addBands(E_logging                     .rename('loss_selective_logging_' + year))
    .addBands(E_fire                        .rename('loss_fire_' + year))
    .addBands(E_convergence                 .rename('loss_convergence_degradation_' + year))
    .addBands(E_defor                       .rename('loss_deforestation_' + year))
    .addBands(E_sf_defor                    .rename('loss_deforestation_secondary_' + year))
    .addBands(R_sf_co2                      .rename('gain_secondary_vegetation_' + year))
    .addBands(netBalance                    .rename('net_balance_' + year))
    .addBands(totalStock                    .rename('stock_' + year))
    // Densities (tCO2e/ha or tC/ha)
    .addBands(E_edge.divide(pixelAreaHa)               .rename('loss_edge_ha_' + year))
    .addBands(E_logging.divide(pixelAreaHa)            .rename('loss_selective_logging_ha_' + year))
    .addBands(E_fire.divide(pixelAreaHa)               .rename('loss_fire_ha_' + year))
    .addBands(E_convergence.divide(pixelAreaHa)        .rename('loss_convergence_degradation_ha_' + year))
    .addBands(E_defor.divide(pixelAreaHa)              .rename('loss_deforestation_ha_' + year))
    .addBands(E_sf_defor.divide(pixelAreaHa)           .rename('loss_deforestation_secondary_ha_' + year))
    .addBands(R_sf_co2.divide(pixelAreaHa)             .rename('gain_secondary_vegetation_ha_' + year))
    // Masks & Diagnostics
    .addBands(edgeMask                      .rename('mask_edge_' + year))
    .addBands(loggingMask                   .rename('mask_logging_' + year))
    .addBands(fireMask                      .rename('mask_fire_' + year))
    .addBands(deforMask                     .rename('mask_defor_' + year))
    .addBands(sfActiveMask                  .rename('mask_sf_' + year))
    .addBands(sfDeforMask                   .rename('mask_sf_defor_' + year))
    .addBands(sfNewMask                     .rename('mask_sf_new_' + year))
    .addBands(AGC0                          .rename('agc0_state_' + year))
    .addBands(loggingN                      .rename('logging_n_' + year))
    .addBands(sfAge                         .rename('sf_age_' + year))
    .set({
      'year': year,
      'system:time_start': ee.Date.fromYMD(year, 1, 1).millis(),
      'system:time_end': ee.Date.fromYMD(year, 12, 31).millis(),
      'version': 'v01',
      'module': 'CCAL_MODULO4',
      'alignment': 'CCAL_MODULO3_and_MODULO1'
    })
    .float();

  Export.image.toAsset({
    image: annualImage,
    description: FLAG + 'emissions_removals_' + year + '_v01',
    assetId: EXPORT_COLLECTION + '/' + year,
    region: brazil.geometry().bounds(),
    crs: DEFAULT_CRS,
    crsTransform: DEFAULT_TRANSFORM,
    scale: 30,
    maxPixels: 1e13,
    pyramidingPolicy: { '.default': 'mean' },
    overwrite: true
  });
}

print('CCAL Módulo 4 v01 Stage 00 configured. Submit export tasks (1986–2024).');
