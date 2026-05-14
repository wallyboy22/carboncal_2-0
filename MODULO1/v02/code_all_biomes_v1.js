/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var p_amz = ee.Image("users/celsojunior/prodes_amazonia_2025_v20260407"),
    p_brazil = ee.Image("users/celsojunior/prodes_brasil_2024_v20260407");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
p_brazil = p_brazil.multiply(p_amz.neq(101));

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
// Units:
//   Emission images : tCO2eq/pixel  (pixelArea applied inside exportEmissionImage)
//   Stock images    : tC/ha         (original QCN/EBA units preserved)
//
// Corrections applied:
//   Eq. 7 — post-deforestation removal added into defCO2_CO2eq:
//            Amazon (fPost=0.042) and Cerrado (fPost=0.088) only
//   Eq. 6 — f_biome scalar applied to ALL emission images
//            (def + fire + sl) across ALL biomes
//   Stocks — masked to forest2016: QCN vegetation, not deforested
//            up to 2016 (coded values 2–16), not PRODES non-forest (101)
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

var prodesGreaterThan625ha = p_brazil;
var prodesLessThan625ha    = ee.Image('projects/ee-celsojunior/assets/yearly_deforestation_smaller_than_625ha_biome');
var managedLandAmazon      = ee.Image('projects/ee-ipam/assets/Managed_Land_Brazil').unmask(0);

var vegetationMask = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2')
                       .unmask(0)
                       .remap([1, 2], [1, 1], 0);

var carbonStock = ee.ImageCollection('projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1');
var biomesBound = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');

var brazilRegion = biomesBound.geometry().bounds();

// ── Floresta remanescente em 2016 ─────────────────────────────────────
// Áreas de não-floresta PRODES (valor 101)
var prodesNonForest = ee.Image('projects/ee-ipam/assets/REDD/prodes_brasil_2023')
  .unmask(0).eq(101);

// prodesLessThan625ha reclassificado para encoding codificado
// (mesmo padrão de prodesGreaterThan625ha: ano - 2000)
var prodesSmall = prodesLessThan625ha
  .remap([1,2,3,4,5,6,7,8,9],
         [16,23,24,20,19,18,22,17,21]);

// Une os dois datasets; prodesGreaterThan625ha tem prioridade onde ambos têm valor
var prodesUnified = prodesGreaterThan625ha
  .unmask(0)
  .blend(prodesSmall);

// Desmatado ATÉ 2016: valores codificados 2–16 (d2000–d2016)
// Valores 17–24 (d2017–d2024) e 50–64 (r*) → não contam como desmatado em 2016
var deforestedUpTo2016 = prodesUnified.gte(2).and(prodesUnified.lte(16));

// Floresta em 2016 = QCN vegetation AND não desmatada até 2016 AND não não-floresta PRODES
var forest2016 = vegetationMask.eq(1)
  .and(deforestedUpTo2016.not())
  .and(prodesNonForest.not());
  
Map.centerObject(forest2016, 5); // Centraliza o mapa na sua imagem
Map.addLayer(
  forest2016,
  {min: 0, max: 1, palette: ['lightgray', 'darkgreen']},
  'Floresta Remanescente 2016'
);

// =================== EXPORT HELPERS ===================

// Eq. 6 applied inside — pixelArea conversion + fBiome before export
function exportEmissionImage(image, description, year, fBiome) {
  var tagged = image
    .multiply(ee.Image.pixelArea().multiply(0.0001))  // tCO2eq/ha → tCO2eq/pixel
    .multiply(fBiome)                                  // Eq. 6
    .rename('emission_tCO2e_pixel')
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

// Stock images preserved in original units (tC/ha)
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

// Stock images preserved in original units (tC/ha)
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
  var f2016   = forest2016.clip(biomeFC);
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

  // Initial carbon stocks masked to forest2016 (tC/ha)
  var agb    = carbonStock.select('cagb').mosaic().blend(agb1).multiply(f2016).clip(biomeFC);
  var bgb    = carbonStock.select('cbgb').mosaic().blend(bgb1).multiply(f2016).clip(biomeFC);
  var dw     = carbonStock.select('cdw').mosaic().blend(dw1).multiply(f2016).clip(biomeFC);
  var litter = carbonStock.select('clitter').mosaic().blend(litter1).multiply(f2016).clip(biomeFC);
  var agbDwL = agb.add(dw).add(litter);

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

    // Eq. 6 + pixelArea conversion inside exportEmissionImage
    exportEmissionImage(fireCO2.multiply(C_TO_CO2), prefix + '_emission_fire_co2_' + year, year, fBiome);
    exportEmissionImage(fireCH4.multiply(GWP_CH4),  prefix + '_emission_fire_ch4_' + year, year, fBiome);
    exportEmissionImage(fireN2O.multiply(GWP_N2O),  prefix + '_emission_fire_n2o_' + year, year, fBiome);

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

    // Eq. 6 + pixelArea conversion inside exportEmissionImage
    exportEmissionImage(slCO2.multiply(C_TO_CO2), prefix + '_emission_sl_co2_' + year, year, fBiome);

    // ---- Deforestation ----
    var defMask = prodesDeforestation.eq(year);
    var defCO2  = agbDwL.add(bgb).multiply(defMask);
    var defCH4  = agbDwL.multiply(defMask).multiply(1 / 0.47).multiply(0.368).multiply(6.8).multiply(0.001);
    var defN2O  = agbDwL.multiply(defMask).multiply(1 / 0.47).multiply(0.368).multiply(0.2).multiply(0.001);

    var defCO2_CO2eq = defCO2.multiply(C_TO_CO2);
    var defCH4_CO2eq = defCH4.multiply(GWP_CH4);
    var defN2O_CO2eq = defN2O.multiply(GWP_N2O);

    // Eq. 7 — postDefRemoval absorbed into defCO2_CO2eq (Amazon only)
    var postDefRemoval_CO2eq = defCO2_CO2eq.add(defCH4_CO2eq).add(defN2O_CO2eq)
                                 .multiply(fPost);
    defCO2_CO2eq = defCO2_CO2eq.add(postDefRemoval_CO2eq);

    // Eq. 6 + pixelArea conversion inside exportEmissionImage — applied after Eq. 7
    exportEmissionImage(defCO2_CO2eq, prefix + '_emission_def_co2_' + year, year, fBiome);
    exportEmissionImage(defCH4_CO2eq, prefix + '_emission_def_ch4_' + year, year, fBiome);
    exportEmissionImage(defN2O_CO2eq, prefix + '_emission_def_n2o_' + year, year, fBiome);

    agbDwL = agbDwL.multiply(defMask.neq(1));
    agb    = agb.multiply(defMask.neq(1));
    bgb    = bgb.multiply(defMask.neq(1));
    dw     = dw.multiply(defMask.neq(1));
    litter = litter.multiply(defMask.neq(1));

    exportStockImage(agb, bgb, dw, litter, prefix, year);

    iterate(year + 1);
  }

  iterate(START_YEAR);
}

processAmazon();

// ============================================================
//  CERRADO  |  prefix: cerr
//  Eq. 7: postDefRemoval added to defCO2_CO2eq
//  Eq. 6: applied to def
// ============================================================

function processCerrado() {

  var biomeFC = biomesBound.filter(ee.Filter.eq('Bioma', 'Cerrado'));
  var prefix  = 'cerr';
  var fBiome  = F_BIOME.cerr;
  var fPost   = F_POST_DEF.cerr;

  var f2016 = forest2016.clip(biomeFC);

  var prodesDeforestation = prodesGreaterThan625ha
    .unmask(0)
    .remap(PRODES_FROM, PRODES_TO, 0)
    .clip(biomeFC);

  // Initial carbon stocks masked to forest2016 (tC/ha)
  var agb    = carbonStock.select('cagb').mosaic().unmask(0).multiply(f2016).clip(biomeFC);
  var bgb    = carbonStock.select('cbgb').mosaic().unmask(0).multiply(f2016).clip(biomeFC);
  var dw     = carbonStock.select('cdw').mosaic().unmask(0).multiply(f2016).clip(biomeFC);
  var litter = carbonStock.select('clitter').mosaic().unmask(0).multiply(f2016).clip(biomeFC);
  var agbDwL = agb.add(dw).add(litter);

  exportStockImage(agb, bgb, dw, litter, prefix, START_YEAR - 1);

  function iterate(year) {
    if (year > END_YEAR) return;

    var defMask     = prodesDeforestation.eq(year);
    var totalCarbon = agb.add(bgb).add(dw).add(litter);
    var defCO2      = totalCarbon.multiply(defMask);
    var defCH4      = agbDwL.multiply(defMask).multiply(1 / 0.47).multiply(0.379).multiply(6.8).multiply(0.001);
    var defN2O      = agbDwL.multiply(defMask).multiply(1 / 0.47).multiply(0.379).multiply(0.2).multiply(0.001);

    var defCO2_CO2eq = defCO2.multiply(C_TO_CO2);
    var defCH4_CO2eq = defCH4.multiply(GWP_CH4);
    var defN2O_CO2eq = defN2O.multiply(GWP_N2O);

    // Eq. 7 — postDefRemoval absorbed into defCO2_CO2eq (Cerrado only)
    var postDefRemoval_CO2eq = defCO2_CO2eq.add(defCH4_CO2eq).add(defN2O_CO2eq)
                                 .multiply(fPost);
    defCO2_CO2eq = defCO2_CO2eq.add(postDefRemoval_CO2eq);

    // Eq. 6 + pixelArea conversion inside exportEmissionImage — applied after Eq. 7
    exportEmissionImage(defCO2_CO2eq, prefix + '_emission_def_co2_' + year, year, fBiome);
    exportEmissionImage(defCH4_CO2eq, prefix + '_emission_def_ch4_' + year, year, fBiome);
    exportEmissionImage(defN2O_CO2eq, prefix + '_emission_def_n2o_' + year, year, fBiome);

    agb    = agb.multiply(defMask.neq(1));
    bgb    = bgb.multiply(defMask.neq(1));
    dw     = dw.multiply(defMask.neq(1));
    litter = litter.multiply(defMask.neq(1));
    agbDwL = agb.add(dw).add(litter);

    exportStockImage(agb, bgb, dw, litter, prefix, year);

    iterate(year + 1);
  }

  iterate(START_YEAR);
}

processCerrado();

// ============================================================
//  SIMPLE BIOMES — Pantanal | Pampa | Caatinga | Atlantic Forest
//  Eq. 6 only (no Eq. 7 — no fire/sl, no postDefRemoval)
// ============================================================

function processSimpleBiome(biomeName, prefix) {

  var biomeFC = biomesBound.filter(ee.Filter.eq('Bioma', biomeName));
  var fBiome  = F_BIOME[prefix];
  var f2016   = forest2016.clip(biomeFC);

  var prodesDeforestation = prodesGreaterThan625ha
    .unmask(0)
    .multiply(f2016)
    .remap(PRODES_FROM, PRODES_TO, 0)
    .clip(biomeFC);

  // Initial carbon stock masked to forest2016 (tC/ha)
  var totalCarbon = carbonStock.select('total').mosaic().unmask(0).multiply(f2016).clip(biomeFC);

  exportStockImageSimple(totalCarbon, prefix, START_YEAR - 1);

  function iterate(year) {
    if (year > END_YEAR) return;

    var defMask = prodesDeforestation.eq(year);
    var defCO2  = totalCarbon.multiply(defMask);

    totalCarbon = totalCarbon.multiply(defMask.neq(1));

    // Eq. 6 + pixelArea conversion inside exportEmissionImage
    exportEmissionImage(defCO2.multiply(C_TO_CO2), prefix + '_emission_def_co2_' + year, year, fBiome);

    exportStockImageSimple(totalCarbon, prefix, year);

    iterate(year + 1);
  }

  iterate(START_YEAR);
}

processSimpleBiome('Pantanal',       'pan');
processSimpleBiome('Pampa',          'pam');
processSimpleBiome('Caatinga',       'caa');
processSimpleBiome('Mata Atlântica', 'ma');

/*
// ============================================================
//  MOSAIC — Brazil-wide assembly
//
//  Run ONLY after all biome export tasks have completed.
//  For each emission type / year, loads the six biome images,
//  applies .unmask(0) and .sum() to produce Brazil-wide images.
//  Units: tCO2eq/pixel (sum across pixels = total tCO2eq)
// ============================================================

var EMISSION_TYPES = [
  'emission_fire_co2', 'emission_fire_ch4', 'emission_fire_n2o',  // Amazon only
  'emission_sl_co2',                                               // Amazon only
  'emission_def_co2',  'emission_def_ch4',  'emission_def_n2o'    // all biomes
];

var BIOME_PREFIXES = ['amz', 'cerr', 'pan', 'pam', 'caa', 'ma'];

var biomeIC = ee.ImageCollection(EXPORT_ASSET_ROOT);

function mosaicEmissions() {
  for (var ei = 0; ei < EMISSION_TYPES.length; ei++) {
    var emType = EMISSION_TYPES[ei];

    for (var yi = START_YEAR; yi <= END_YEAR; yi++) {
      var year = yi;

      var biomeImages = ee.ImageCollection(
        BIOME_PREFIXES.map(function(pfx) {
          return biomeIC
            .filter(ee.Filter.eq('description', pfx + '_' + emType + '_' + year))
            .first()
            .unmask(0);
        })
      );

      var brazilMosaic = biomeImages
        .sum()
        .rename('emission_tCO2e_pixel')
        .set('system:time_start', ee.Date.fromYMD(year, 1, 1).millis())
        .set('year', year)
        .set('emission_type', emType);

      var desc = 'brazil_' + emType + '_' + year;
      Export.image.toAsset({
        image: brazilMosaic,
        description: desc,
        assetId: EXPORT_MOSAIC_ROOT + '/' + desc,
        region: brazilRegion,
        scale: SPATIAL_SCALE,
        maxPixels: 1e13,
        pyramidingPolicy: { '.default': 'mean' }
      });
    }
  }
}

function mosaicStocks() {
  for (var yi = START_YEAR - 1; yi <= END_YEAR; yi++) {
    var year = yi;

    var stockImages = ee.ImageCollection(
      BIOME_PREFIXES.map(function(pfx) {
        return biomeIC
          .filter(ee.Filter.eq('description', pfx + '_stock_carbon_' + year))
          .first()
          .select(['total'])
          .unmask(0);
      })
    );

    var brazilStock = stockImages
      .sum()
      .rename('total_tC_ha')
      .set('system:time_start', ee.Date.fromYMD(year, 1, 1).millis())
      .set('year', year);

    var desc = 'brazil_stock_carbon_' + year;
    Export.image.toAsset({
      image: brazilStock,
      description: desc,
      assetId: EXPORT_MOSAIC_ROOT + '/' + desc,
      region: brazilRegion,
      scale: SPATIAL_SCALE,
      maxPixels: 1e13,
      pyramidingPolicy: { '.default': 'mean' }
    });
  }
}

mosaicEmissions();
mosaicStocks();
*/