// =============================================================================
// CCAL Módulo 4 — v02 (Stage 00: time series emissions & removals)
// Brazil — all biomes | 1986–2024
// Método v01; atualiza fontes compatíveis e separa convergências exclusivas.
// =============================================================================

var VERSION = 'v02';
var START_YEAR = 1986;
var END_YEAR = 2024;
var EXPORT_COLLECTION = 'projects/ee-ipam/assets/CCAL/MODULO4/v02/emissions_removals_v02';
var DEFAULT_CRS = 'EPSG:4326';
var DEFAULT_TRANSFORM = [0.00026949458523585647, 0, -180, 0, -0.00026949458523585647, 90];
var FLAG = 'WS_CCAL_modulo4-v02-';

var brazil = ee.FeatureCollection('projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026');
var brazilForests = ee.Image(
  'projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2'
).unmask(0).remap([1, 2], [1, 1], 0).clip(brazil);

// Collection 11 replaces the C10.1 coverage base; the class selection is unchanged.
var mapbiomas = ee.Image(
  'projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_coverage_v3'
);
var mb1985 = mapbiomas.select('classification_1985');
var forestMask1985 = mb1985.eq(3).or(mb1985.eq(6));
var baselineMask = forestMask1985.multiply(brazilForests);

// Current same-lineage YbYrá derivatives remain the latest available for 1986–2024.
var edgeImg = ee.Image(
  'projects/ee-redd-brazil/assets/ybyra-br-model/edgesAge_mb_c101_390m_1986_2024_v2'
);
var sfAgeImg = ee.Image(
  'projects/ee-redd-brazil/assets/ybyra-br-model/secondary_forest_age_collection10_1_v8_1'
).multiply(brazilForests).unmask(0).clip(brazil);
var loggingImg = ee.Image(
  'projects/ee-redd-brazil/assets/ybyra-br-model/logging_frequency_v1'
);

// Newer native inputs, kept in the same annual event/class form expected by v01.
var fireAnnual = ee.Image(
  'projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_annual_burned_v1'
);
var deforestationReg = ee.Image(
  'projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_deforestation_secondary_vegetation_by_coverage_v1'
);
var legacyDeforestation = ee.Image(
  'projects/ee-redd-brazil/assets/ybyra-br-model/deforestationAnnual_mb_c101_1986_2024_v2'
);

var QCN = ee.ImageCollection(
  'projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1'
).select('cagb').mosaic();
var CR_B = ee.Image('projects/ee-ybyra-br-sf/assets/B_30m').clip(brazil);
var CR_K = ee.Image('projects/ee-ybyra-br-sf/assets/K_30m').clip(brazil);
var CR_M = 0.67;
var CR_EXP = 1.0 / (1.0 - CR_M);

var ALPHA = 22.518;
var BETA = 1.615;
var LOGGING_P0 = 0.196;
var LOGGING_DECAY = 0.0782;
var pixelAreaHa = ee.Image.pixelArea().multiply(0.0001);
var AGC0 = QCN.multiply(baselineMask).clip(brazil);
var AGC_sf_prev = ee.Image(0).clip(brazil);

var YEARS = [];
for (var y = START_YEAR; y <= END_YEAR; y++) YEARS.push(String(y));
var YEARS_C11_TRANSITION = [];
for (var ty = 1987; ty <= END_YEAR; ty++) YEARS_C11_TRANSITION.push(String(ty));
var c11Deforestation = deforestationReg.select(YEARS_C11_TRANSITION.map(function (year) {
  return 'classification_' + year;
}));
var prep = require('users/workspaceipam/CCAL:MODULO3/v037/equations/00_data_prep.js');
var c11DeforestationCorrected = prep.correctDesfReg(c11Deforestation, YEARS_C11_TRANSITION);

var BAND_PREFIX = 'classification_';
var loggingBandName = function (year) { return 'logging_freq_' + year; };

function cumulativeLoss(edgeAge) {
  return edgeAge.multiply(ALPHA).divide(edgeAge.add(BETA).multiply(100));
}

function incrementalLoss(edgeAge) {
  return ee.Image(ALPHA * BETA).divide(
    edgeAge.add(BETA).multiply(edgeAge.add(BETA - 1)).multiply(100)
  );
}

function postFireAGC(agcPreFire) {
  return agcPreFire.pow(1.4702).multiply(0.07816);
}

function loggingFractionalLoss(n) {
  return ee.Image(LOGGING_P0).multiply(
    ee.Image(LOGGING_DECAY).multiply(n.subtract(1)).multiply(-1).exp()
  );
}

function getPrimaryDeforestationMask(year, bandName) {
  // The C11 transition series begins in 1987; retain the v01 source for 1986 only.
  if (year === 1986) {
    return legacyDeforestation.select(bandName).eq(100)
      .multiply(brazilForests).unmask(0).clip(brazil);
  }
  return c11DeforestationCorrected.select(bandName).eq(4)
    .multiply(brazilForests).unmask(0).clip(brazil);
}

function addConvergenceBands(image, year, components, masks) {
  var edgeLoggingOnly = masks.edge.and(masks.logging).and(masks.fire.not());
  var edgeFireOnly = masks.edge.and(masks.fire).and(masks.logging.not());
  var loggingFireOnly = masks.logging.and(masks.fire).and(masks.edge.not());
  var allThree = masks.edge.and(masks.logging).and(masks.fire);

  var edgeLogging = components.edge.add(components.logging).updateMask(edgeLoggingOnly);
  var edgeFire = components.edge.add(components.fire).updateMask(edgeFireOnly);
  var loggingFire = components.logging.add(components.fire).updateMask(loggingFireOnly);
  var allDegradations = components.edge.add(components.logging).add(components.fire)
    .updateMask(allThree);
  var anyConvergence = edgeLoggingOnly.or(edgeFireOnly).or(loggingFireOnly).or(allThree);
  var convergence = edgeLogging.unmask(0).add(edgeFire.unmask(0))
    .add(loggingFire.unmask(0)).add(allDegradations.unmask(0))
    .updateMask(anyConvergence);

  return image
    .addBands(convergence.rename('loss_convergence_degradation_' + year))
    .addBands(edgeLogging.rename('loss_convergence_edge_logging_' + year))
    .addBands(edgeFire.rename('loss_convergence_edge_fire_' + year))
    .addBands(loggingFire.rename('loss_convergence_logging_fire_' + year))
    .addBands(allDegradations.rename('loss_convergence_edge_logging_fire_' + year))
    .addBands(anyConvergence.rename('mask_convergence_' + year).unmask(0))
    .addBands(edgeLoggingOnly.rename('mask_convergence_edge_logging_' + year).unmask(0))
    .addBands(edgeFireOnly.rename('mask_convergence_edge_fire_' + year).unmask(0))
    .addBands(loggingFireOnly.rename('mask_convergence_logging_fire_' + year).unmask(0))
    .addBands(allThree.rename('mask_convergence_edge_logging_fire_' + year).unmask(0));
}

for (var year = START_YEAR; year <= END_YEAR; year++) {
  var bandName = BAND_PREFIX + year;
  var fireMask = fireAnnual.select('burned_area_' + year).gt(0)
    .multiply(brazilForests).unmask(0).clip(brazil);
  var deforMask = getPrimaryDeforestationMask(year, bandName);
  var edgeAge = edgeImg.select(bandName).multiply(brazilForests).unmask(0).clip(brazil);
  var edgeMask = edgeAge.gte(1);

  // Effect of edge — unchanged v01 formula.
  var dC = incrementalLoss(edgeAge).multiply(edgeMask);
  var AGC_edge = AGC0.multiply(ee.Image(1).subtract(cumulativeLoss(edgeAge).multiply(edgeMask)));
  var E_edge = AGC0.multiply(dC).multiply(44.0 / 12.0).multiply(pixelAreaHa);

  // Selective logging — unchanged v01 recurrence and loss equation.
  var loggingBand = loggingImg.select(loggingBandName(year)).unmask(0).clip(brazil);
  var loggingMask = loggingBand.gt(0).multiply(brazilForests).multiply(deforMask.not());
  var pN = loggingFractionalLoss(loggingBand).multiply(loggingMask);
  var E_logging = AGC_edge.multiply(pN).multiply(44.0 / 12.0).multiply(pixelAreaHa);
  var AGC_post_logging = AGC_edge.multiply(ee.Image(1).subtract(pN));
  AGC0 = AGC0.multiply(loggingMask.not()).add(AGC_post_logging.multiply(loggingMask));

  // Fire uses the C5.1 annual burned-area mask; the v01 allometric equation is unchanged.
  var AGC_pre_fire = AGC_edge;
  var AGC_post_fire = postFireAGC(AGC_pre_fire);
  var E_fire = AGC_pre_fire.subtract(AGC_post_fire).multiply(44.0 / 12.0)
    .multiply(pixelAreaHa).multiply(fireMask);
  AGC0 = AGC0.multiply(fireMask.not()).add(AGC_post_fire.multiply(fireMask));

  // Primary deforestation; secondary-forest loss remains derived from sfAge as in v01.
  var AGC_pre_defor = AGC_post_fire.multiply(fireMask).add(AGC_edge.multiply(fireMask.not()));
  var E_defor = AGC_pre_defor.multiply(44.0 / 12.0).multiply(pixelAreaHa).multiply(deforMask);
  AGC0 = AGC0.multiply(deforMask.not());

  // Exclusive same-pixel/year combinations; each process must have positive emissions.
  var edgeActive = edgeMask.and(E_edge.gt(0));
  var loggingActive = loggingMask.and(E_logging.gt(0));
  var fireActive = fireMask.and(E_fire.gt(0));
  var components = {edge: E_edge, logging: E_logging, fire: E_fire};
  var masks = {edge: edgeActive, logging: loggingActive, fire: fireActive};

  // Secondary forest — unchanged Chapman-Richards equation.
  var sfAge = sfAgeImg.select(bandName);
  var sfActiveMask = sfAge.gt(0);
  var sfNewMask = sfAge.eq(1);
  var AGC_sf = CR_A(sfAge).multiply(sfActiveMask);
  var AGC_sf_increment = AGC_sf.subtract(AGC_sf_prev).multiply(sfActiveMask);
  var R_sf_co2 = AGC_sf_increment.multiply(44.0 / 12.0).multiply(pixelAreaHa);
  var sfDeforMask = AGC_sf_prev.gt(0).and(sfActiveMask.not());
  var E_sf_defor = AGC_sf_prev.multiply(44.0 / 12.0).multiply(pixelAreaHa).multiply(sfDeforMask);
  AGC_sf_prev = AGC_sf;

  var E_total_primary = E_edge.add(E_logging).add(E_fire).add(E_defor);
  var netBalance = E_total_primary.add(E_sf_defor).subtract(R_sf_co2);
  var totalStock = AGC0.add(AGC_sf);

  var annualImage = E_edge.rename('loss_edge_' + year)
    .addBands(E_logging.rename('loss_selective_logging_' + year))
    .addBands(E_fire.rename('loss_fire_' + year))
    .addBands(E_defor.rename('loss_deforestation_' + year))
    .addBands(E_sf_defor.rename('loss_deforestation_secondary_' + year))
    .addBands(R_sf_co2.rename('gain_secondary_vegetation_' + year))
    .addBands(netBalance.rename('net_balance_' + year))
    .addBands(totalStock.rename('stock_' + year))
    .addBands(E_edge.divide(pixelAreaHa).rename('loss_edge_ha_' + year))
    .addBands(E_logging.divide(pixelAreaHa).rename('loss_selective_logging_ha_' + year))
    .addBands(E_fire.divide(pixelAreaHa).rename('loss_fire_ha_' + year))
    .addBands(E_defor.divide(pixelAreaHa).rename('loss_deforestation_ha_' + year))
    .addBands(E_sf_defor.divide(pixelAreaHa).rename('loss_deforestation_secondary_ha_' + year))
    .addBands(R_sf_co2.divide(pixelAreaHa).rename('gain_secondary_vegetation_ha_' + year))
    .addBands(edgeMask.rename('mask_edge_' + year))
    .addBands(loggingMask.rename('mask_logging_' + year))
    .addBands(fireMask.rename('mask_fire_' + year))
    .addBands(deforMask.rename('mask_defor_' + year))
    .addBands(sfActiveMask.rename('mask_sf_' + year))
    .addBands(sfDeforMask.rename('mask_sf_defor_' + year))
    .addBands(sfNewMask.rename('mask_sf_new_' + year))
    .addBands(AGC0.rename('agc0_state_' + year))
    .addBands(loggingBand.rename('logging_n_' + year))
    .addBands(sfAge.rename('sf_age_' + year));

  annualImage = addConvergenceBands(annualImage, year, components, masks);

  var convNames = [
    'loss_convergence_degradation_',
    'loss_convergence_edge_logging_',
    'loss_convergence_edge_fire_',
    'loss_convergence_logging_fire_',
    'loss_convergence_edge_logging_fire_'
  ];
  convNames.forEach(function (prefix) {
    annualImage = annualImage.addBands(
      annualImage.select(prefix + year).divide(pixelAreaHa).rename(prefix + 'ha_' + year)
    );
  });

  annualImage = annualImage.set({
    year: year,
    'system:time_start': ee.Date.fromYMD(year, 1, 1).millis(),
    'system:time_end': ee.Date.fromYMD(year, 12, 31).millis(),
    version: VERSION,
    module: 'CCAL_MODULO4',
    convergence_definition: 'exclusive same-pixel same-year combinations of edge, logging, fire'
  }).float();

  Export.image.toAsset({
    image: annualImage,
    description: FLAG + 'emissions_removals_' + year,
    assetId: EXPORT_COLLECTION + '/' + year,
    region: brazil.geometry().bounds(),
    crs: DEFAULT_CRS,
    crsTransform: DEFAULT_TRANSFORM,
    scale: 30,
    maxPixels: 1e13,
    pyramidingPolicy: {'.default': 'mean'},
    overwrite: true
  });
}

function CR_A(age) {
  var negKAge = CR_K.multiply(age).multiply(-1);
  var inner = ee.Image(1).subtract(CR_B.multiply(negKAge.exp()));
  return QCN.multiply(inner.max(0).pow(CR_EXP));
}

print('CCAL Módulo 4 v02 Stage 00 configured. Submit exports (1986–2024).');
