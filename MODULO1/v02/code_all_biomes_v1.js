// ============================================================
// BRAZIL NATIONAL FREL — Unified GEE Script (v2.1)
//
// Reference:
//   Silva-Junior, C. H. L. et al. (2026). Increased deforestation
//   and forest degradation jeopardize Brazil's REDD+ results in 2022.
//   Nature Communications.
//
// Workflow:
//   1. Each biome processed independently, clipped, exported as images
//      into EXPORT_ASSET_ROOT
//   2. After all biome exports complete, run MOSAIC section to assemble
//      Brazil-wide images into EXPORT_MOSAIC_ROOT
//
// Corrections applied:
//   Eq. 7 — post-deforestation removal added into defCO2_CO2eq:
//            Amazon (fPost=0.042) and Cerrado (fPost=0.088) only
//   Eq. 6 — f_biome scalar applied to ALL emission images
//            (def + fire + sl) across ALL biomes
//   Stocks — unchanged by either correction
// ============================================================

// ====================================================================
//  CONFIGURATION
// ====================================================================

var START_YEAR         = 2017;
var END_YEAR           = 2024;
var EXPORT_ASSET_ROOT  = 'projects/ee-ipam/assets/CCAL/MODULO1/biomes';
var EXPORT_MOSAIC_ROOT = 'projects/ee-ipam/assets/CCAL/MODULO1/brazil';

var PRODES_START       = 2016;
var PRODES_END         = 2024;

var C_TO_CO2           = 44 / 12;
var GWP_CH4            = 28;
var GWP_N2O            = 265;
var SPATIAL_SCALE      = 30;

// Eq. 6 — correction factors by biome (Table 3, central value)
var F_BIOME = {
  amz:  1.009,
  cerr: 0.995,
  pan:  1.002,
  pam:  0.966,
  caa:  1.019,
  ma:   1.000
};

// Eq. 7 — post-deforestation removal factor (absolute value)
// Amazon: -0.042, Cerrado: -0.088 → stored positive, added to defCO2_CO2eq
var F_POST_DEF = {
  amz:  0.042,
  cerr: 0.088
};

// ====================================================================
//  END OF CONFIGURATION
// ====================================================================

var PRODES_FROM = [], PRODES_TO = [];
for (var _y = PRODES_START; _y <= PRODES_END; _y++) {
  PRODES_FROM.push(_y - 2000);
  PRODES_TO.push(_y);
}

// =================== SHARED ASSETS ===================

var prodesGreaterThan625ha = ee.Image('projects/ee-ipam/assets/REDD/prodes_brasil_2024');
var prodesLessThan625ha    = ee.Image('projects/ee-celsojunior/assets/yearly_deforestation_smaller_than_625ha_biome');
var managedLandAmazon      = ee.Image('projects/ee-ipam/assets/Managed_Land_Brazil').unmask(0);

var vegetationMask = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2')
                       .unmask(0)
                       .remap([1, 2], [1, 1], 0);

var carbonStock = ee.ImageCollection('projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1');
var biomesBound = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');

var brazilRegion = biomesBound.geometry().bounds();

// =================== EXPORT HELPERS ===================

// Eq. 6 applied inside — fBiome multiplied before export
function exportEmissionImage(image, description, year, fBiome) {
  var tagged = image
    .multiply(fBiome)
    .rename('emission_tCO2e_ha')
    .set('system:time_start', ee.Date.fromYMD(year, 1, 1).millis())
    .set('year', year)
    .set('description', description)
    .set('f_biome', fBiome);

  Export.image.toAsset({
    image: tagged,
    description: description,
    assetId: EXPORT_ASSET_ROOT + '/' + description,
    region: brazilRegion,
    scale: SPATIAL_SCALE,
    maxPixels: 1e13,
    pyramidingPolicy: { '.default': 'mean' }
  });
}

function exportStockImage(agb, bgb, dw, litter, prefix, year) {
  var total   = agb.add(bgb).add(dw).add(litter);
  var stacked = agb.rename('agb')
    .addBands(bgb.rename('bgb'))
    .addBands(dw.rename('dw'))
    .addBands(litter.rename('litter'))
    .addBands(total.rename('total'))
    .set('system:time_start', ee.Date.fromYMD(year, 1, 1).millis())
    .set('year', year)
    .set('biome', prefix);

  var desc = prefix + '_stock_carbon_' + year;
  Export.image.toAsset({
    image: stacked,
    description: desc,
    assetId: EXPORT_ASSET_ROOT + '/' + desc,
    region: brazilRegion,
    scale: SPATIAL_SCALE,
    maxPixels: 1e13,
    pyramidingPolicy: { '.default': 'mean' }
  });
}

function exportStockImageSimple(totalImage, prefix, year) {
  var tagged = totalImage
    .rename('total')
    .set('system:time_start', ee.Date.fromYMD(year, 1, 1).millis())
    .set('year', year)
    .set('biome', prefix);

  var desc = prefix + '_stock_carbon_' + year;
  Export.image.toAsset({
    image: tagged,
    description: desc,
    assetId: EXPORT_ASSET_ROOT + '/' + desc,
    region: brazilRegion,
    scale: SPATIAL_SCALE,
    maxPixels: 1e13,
    pyramidingPolicy: { '.default': 'mean' }
  });
}

// ============================================================
//  AMAZON  |  prefix: amz
//  Eq. 7: postDefRemoval added to defCO2_CO2eq
//  Eq. 6: applied to fire + sl + def
// ============================================================

function processAmazon() {

  var biomeFC = biomesBound.filter(ee.Filter.eq('Bioma', 'Amazônia'));
  var prefix  = 'amz';
  var fBiome  = F_BIOME.amz;
  var fPost   = F_POST_DEF.amz;

  var forests = vegetationMask.clip(biomeFC);
  var zeros   = ee.Image(0).clip(biomeFC);

  var prodes625 = prodesGreaterThan625ha
    .unmask(0)
    .remap(PRODES_FROM, PRODES_TO, 0)
    .clip(biomeFC);

  var prodesDeforestation = prodes625
    .blend(prodesLessThan625ha.clip(biomeFC))
    .remap(PRODES_TO, PRODES_TO, 0)
    .clip(biomeFC);

  var agb1    = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_AB_30m')
                  .updateMask(ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_AB_30m').gte(0));
  var bgb1    = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_BB_30m')
                  .updateMask(ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_BB_30m').gte(0));
  var dw1     = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_DW_30m')
                  .updateMask(ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_DW_30m').gte(0));
  var litter1 = ee.Image('projects/ee-ipam/assets/CCAL/DATASET