// ============================================================
// BRAZIL NATIONAL FREL — Unified GEE Script (v2)
//
// Reference:
//   Silva-Junior, C. H. L. et al. (2026). Increased deforestation
//   and forest degradation jeopardize Brazil's REDD+ results in 2022.
//   Nature Communications.
//
// Changes from v1:
//   - Outputs exported as GEE Assets (ImageCollection) instead of CSV
//   - Export region is always Brazil-wide (all images co-registered)
//   - Carbon stock snapshots exported at each time step;
//     initial snapshot assigned to START_YEAR - 1
// ============================================================

// ====================================================================
//  CONFIGURATION
// ====================================================================

var START_YEAR        = 2017;
var END_YEAR          = 2023;
var EXPORT_ASSET_ROOT = 'projects/ee-ipam/assets/CCAL/FREL_V2'; // must exist as ImageCollection

var PRODES_START      = 2016;
var PRODES_END        = 2023;

var C_TO_CO2          = 44 / 12;
var GWP_CH4           = 28;
var GWP_N2O           = 265;
var SPATIAL_SCALE     = 30;

// ====================================================================
//  END OF CONFIGURATION
// ====================================================================

var PRODES_FROM = [], PRODES_TO = [];
for (var _y = PRODES_START; _y <= PRODES_END; _y++) {
  PRODES_FROM.push(_y - 2000);
  PRODES_TO.push(_y);
}

// =================== SHARED ASSETS ===================

var prodesGreaterThan625ha = ee.Image('projects/ee-ipam/assets/REDD/prodes_brasil_2023');
var prodesLessThan625ha    = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/PRODES/yearly_deforestation_smaller_than_625ha_biome');
var managedLandAmazon      = ee.Image('projects/ee-ipam/assets/Managed_Land_Brazil').unmask(0);

var vegetationMask = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2')
                       .unmask(0)
                       .remap([1, 2], [1, 1], 0);

var carbonStock = ee.ImageCollection('projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1');
var biomesBound = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');

// ── Brazil-wide export region (used by ALL exports) ──────────────────
// Single geometry shared across all biome functions so every image
// has identical extent and can be stacked as an ImageCollection.
var brazilRegion = biomesBound.geometry().bounds();

// =================== EXPORT HELPERS ===================

/**
 * Export a single-band emission image to the asset ImageCollection.
 * Region is always brazilRegion (Brazil-wide).
 */
function exportEmissionImage(image, description, year) {
  var tagged = image
    .rename('emission_tCO2e_ha')
    .set('system:time_start', ee.Date.fromYMD(year, 1, 1).millis())
    .set('year', year)
    .set('description', description);

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

/**
 * Export a multi-band carbon stock snapshot (Amazon, Cerrado).
 * Bands: agb, bgb, dw, litter, total (tC/ha).
 * year = START_YEAR - 1 for initial state; processing year otherwise.
 */
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

/**
 * Export a single-band carbon stock snapshot (simple biomes).
 * Band: total (tC/ha).
 */
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
// ============================================================

function processAmazon() {

  var biomeFC = biomesBound.filter(ee.Filter.eq('Bioma', 'Amazônia'));
  var prefix  = 'amz';

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
  var litter1 = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_LI_30m')
                  .updateMask(ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_LI_30m').gte(0));

  var agb    = carbonStock.select('cagb').mosaic().blend(agb1).multiply(forests).clip(biomeFC);
  var bgb    = carbonStock.select('cbgb').mosaic().blend(bgb1).multiply(forests).clip(biomeFC);
  var dw     = carbonStock.select('cdw').mosaic().blend(dw1).multiply(forests).clip(biomeFC);
  var litter = carbonStock.select('clitter').mosaic().blend(litter1).multiply(forests).clip(biomeFC);
  var agbDwL = agb.add(dw).add(litter);

  // ── Initial stock → START_YEAR - 1 ───────────────────────────────
  exportStockImage(agb, bgb, dw, litter, prefix, START_YEAR - 1);

  var slLayer = zeros.blend(
    ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/PRODES/PRODES_ANO_CIVIL/DeterAnoProdes_'
             + START_YEAR + '_cs_disordered')
      .multiply(forests)
      .clip(biomeFC)
  ).clip(biomeFC);

  function iterate(year) {
    if (year > END_YEAR) return;

    // ---- Fire ----
    var fireLayer = zeros.blend(
      ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/PRODES/PRODES_ANO_CIVIL/DeterAnoProdes_'
               + year + '_fire')
        .multiply(forests)
        .multiply(managedLandAmazon)
        .clip(biomeFC)
    );

    var fireCO2 = agbDwL.multiply(fireLayer).multiply(0.368);
    var fireCH4 = agbDwL.multiply(fireLayer).multiply(1 / 0.47).multiply(0.368).multiply(6.8).multiply(0.001);
    var fireN2O = agbDwL.multiply(fireLayer).multiply(1 / 0.47).multiply(0.368).multiply(0.2).multiply(0.001);

    agb    = agb.subtract(agb.multiply(fireLayer).multiply(0.368));
    dw     = dw.subtract(dw.multiply(fireLayer).multiply(0.368));
    litter = litter.subtract(litter.multiply(fireLayer).multiply(0.368));

    exportEmissionImage(fireCO2.multiply(C_TO_CO2), prefix + '_emission_fire_co2_' + year, year);
    exportEmissionImage(fireCH4.multiply(GWP_CH4),  prefix + '_emission_fire_ch4_' + year, year);
    exportEmissionImage(fireN2O.multiply(GWP_N2O),  prefix + '_emission_fire_n2o_' + year, year);

    // ---- Selective Logging ----
    var slFactor = slLayer.remap(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [0, 0.29, 0.27, 0.26, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22]
    );
    var slCO2 = agb.multiply(slFactor);

    var slNext = zeros.blend(
      ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/PRODES/PRODES_ANO_CIVIL/DeterAnoProdes_'
               + (year + 1) + '_cs_disordered')
        .unmask(0)
        .multiply(forests)
        .clip(biomeFC)
    );
    slLayer = slLayer.add(slNext).multiply(slNext).multiply(forests).clip(biomeFC);

    agb    = agb.subtract(slCO2);
    agbDwL = agb.add(dw).add(litter);

    exportEmissionImage(slCO2.multiply(C_TO_CO2), prefix + '_emission_sl_co2_' + year, year);

    // ---- Deforestation ----
    var defMask = prodesDeforestation.eq(year);
    var defCO2  = agbDwL.add(bgb).multiply(defMask);
    var defCH4  = agbDwL.multiply(defMask).multiply(1 / 0.47).multiply(0.368).multiply(6.8).multiply(0.001);
    var defN2O  = agbDwL.multiply(defMask).multiply(1 / 0.47).multiply(0.368).multiply(0.2).multiply(0.001);

    agbDwL = agbDwL.multiply(defMask.neq(1));
    agb    = agb.multiply(defMask.neq(1));
    bgb    = bgb.multiply(defMask.neq(1));
    dw     = dw.multiply(defMask.neq(1));
    litter = litter.multiply(defMask.neq(1));

    exportEmissionImage(defCO2.multiply(C_TO_CO2), prefix + '_emission_def_co2_' + year, year);
    exportEmissionImage(defCH4.multiply(GWP_CH4),  prefix + '_emission_def_ch4_' + year, year);
    exportEmissionImage(defN2O.multiply(GWP_N2O),  prefix + '_emission_def_n2o_' + year, year);

    // ── Updated stock (end-of-year, after fire → sl → def) ──────────
    exportStockImage(agb, bgb, dw, litter, prefix, year);

    iterate(year + 1);
  }

  iterate(START_YEAR);
}

processAmazon();

// ============================================================
//  CERRADO  |  prefix: cerr
// ============================================================

function processCerrado() {

  var biomeFC = biomesBound.filter(ee.Filter.eq('Bioma', 'Cerrado'));
  var prefix  = 'cerr';

  var forests = vegetationMask.clip(biomeFC);

  var prodesDeforestation = prodesGreaterThan625ha
    .unmask(0)
    .remap(PRODES_FROM, PRODES_TO, 0)
    .clip(biomeFC);

  var agb    = carbonStock.select('cagb').mosaic().unmask(0).multiply(forests).clip(biomeFC);
  var bgb    = carbonStock.select('cbgb').mosaic().unmask(0).multiply(forests).clip(biomeFC);
  var dw     = carbonStock.select('cdw').mosaic().unmask(0).multiply(forests).clip(biomeFC);
  var litter = carbonStock.select('clitter').mosaic().unmask(0).multiply(forests).clip(biomeFC);
  var agbDwL = agb.add(dw).add(litter);

  // ── Initial stock → START_YEAR - 1 ───────────────────────────────
  exportStockImage(agb, bgb, dw, litter, prefix, START_YEAR - 1);

  function iterate(year) {
    if (year > END_YEAR) return;

    var defMask     = prodesDeforestation.eq(year);
    var totalCarbon = agb.add(bgb).add(dw).add(litter);
    var defCO2      = totalCarbon.multiply(defMask);
    var defCH4      = agbDwL.multiply(defMask).multiply(1 / 0.47).multiply(0.379).multiply(6.8).multiply(0.001);
    var defN2O      = agbDwL.multiply(defMask).multiply(1 / 0.47).multiply(0.379).multiply(0.2).multiply(0.001);

    agb    = agb.multiply(defMask.neq(1));
    bgb    = bgb.multiply(defMask.neq(1));
    dw     = dw.multiply(defMask.neq(1));
    litter = litter.multiply(defMask.neq(1));
    agbDwL = agb.add(dw).add(litter);

    exportEmissionImage(defCO2.multiply(C_TO_CO2), prefix + '_emission_def_co2_' + year, year);
    exportEmissionImage(defCH4.multiply(GWP_CH4),  prefix + '_emission_def_ch4_' + year, year);
    exportEmissionImage(defN2O.multiply(GWP_N2O),  prefix + '_emission_def_n2o_' + year, year);

    // ── Updated stock ────────────────────────────────────────────────
    exportStockImage(agb, bgb, dw, litter, prefix, year);

    iterate(year + 1);
  }

  iterate(START_YEAR);
}

processCerrado();

// ============================================================
//  SIMPLE BIOMES — Pantanal | Pampa | Caatinga | Atlantic Forest
// ============================================================

function processSimpleBiome(biomeName, prefix) {

  var biomeFC = biomesBound.filter(ee.Filter.eq('Bioma', biomeName));

  var forests = vegetationMask.clip(biomeFC);

  var prodesDeforestation = prodesGreaterThan625ha
    .unmask(0)
    .multiply(forests)
    .remap(PRODES_FROM, PRODES_TO, 0)
    .clip(biomeFC);

  var totalCarbon = carbonStock.select('total').mosaic().unmask(0).multiply(forests).clip(biomeFC);

  // ── Initial stock → START_YEAR - 1 ───────────────────────────────
  exportStockImageSimple(totalCarbon, prefix, START_YEAR - 1);

  function iterate(year) {
    if (year > END_YEAR) return;

    var defMask = prodesDeforestation.eq(year);
    var defCO2  = totalCarbon.multiply(defMask);

    totalCarbon = totalCarbon.multiply(defMask.neq(1));

    exportEmissionImage(defCO2.multiply(C_TO_CO2), prefix + '_emission_def_co2_' + year, year);

    // ── Updated stock ────────────────────────────────────────────────
    exportStockImageSimple(totalCarbon, prefix, year);

    iterate(year + 1);
  }

  iterate(START_YEAR);
}

processSimpleBiome('Pantanal',       'pan');
processSimpleBiome('Pampa',          'pam');
processSimpleBiome('Caatinga',       'caa');
processSimpleBiome('Mata Atlântica', 'ma');