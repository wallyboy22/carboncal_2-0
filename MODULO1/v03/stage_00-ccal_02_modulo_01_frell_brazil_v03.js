// ============================================================
// BRAZIL NATIONAL FREL — Unified GEE Script (v03)
//
// Changelog v02 → v03:
//   REPLACE: iterate() recursivo → ee.List.iterate() server-side
//   REPLACE: remap() → where() loop (type-safe, imune a int/float)
//   REPLACE: .clip(biomeFC) → updateMask(biome_mask) + region:biome_bounds
//   ADD:    crs + crsTransform explícito nos exports
//   ADD:    .float() em todas as saídas
//   ADD:    overwrite:true, flag prefix, VIS_YEAR, addDefCheckLayer
//   FIX:    remap/where ANTES de multiply(forest2016) em todos biomas
//
// Reference:
//   Silva-Junior, C. H. L. et al. (2026). Increased deforestation
//   and forest degradation jeopardize Brazil's REDD+ results in 2022.
//   Nature Communications.
// ============================================================

// ====================================================================
//  CONFIGURATION
// ====================================================================

var START_YEAR         = 2017;
var END_YEAR           = 2024;
var EXPORT_ASSET_ROOT  = 'projects/ee-ipam/assets/CCAL/MODULO1/biomes_v5';
var EXPORT_MOSAIC_ROOT = 'projects/ee-ipam/assets/CCAL/MODULO1/brazil_v5';

var PRODES_START       = 2016;
var PRODES_END         = 2024;

var C_TO_CO2           = 44 / 12;
var GWP_CH4            = 28;
var GWP_N2O            = 265;
var SPATIAL_SCALE      = 30;

var YEARS = [];
for (var _y = START_YEAR; _y <= END_YEAR; _y++) YEARS.push(_y);

var F_BIOME = {
  amz:  1.009,
  cerr: 0.995,
  pan:  1.002,
  pam:  0.966,
  caa:  1.019,
  ma:   1.000
};

var F_POST_DEF = {
  amz:  0.042,
  cerr: 0.088
};

// ====================================================================
//  VISUALIZAÇÃO — ano de referência para checar antes de exportar
// ====================================================================

var VIS_YEAR = 2022;

var visEmission = {
  min: 0, max: 10,
  palette: ['ffffcc','fed976','fd8d3c','e31a1c','800026']
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

var prodesGreaterThan625ha = ee.Image('users/celsojunior/prodes_brasil_2024_v20260407');
var prodesLessThan625ha    = ee.Image('projects/ee-celsojunior/assets/yearly_deforestation_smaller_than_625ha_biome');
var managedLandAmazon      = ee.Image('projects/ee-ipam/assets/Managed_Land_Brazil').unmask(0);

var vegetationMask = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2')
                       .unmask(0)
                       .remap([1, 2], [1, 1], 0);

var carbonStock = ee.ImageCollection('projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1');
var biomesBound = ee.FeatureCollection('projects/ee-ipam/assets/ORIGINAIS/IBGE/limite_biomas_IBGE_2026');
var brazilRegion = biomesBound.geometry().bounds();

// ── Floresta remanescente em 2016 ────────────────────────

var prodesLessImg = prodesLessThan625ha.unmask(0);
var prodesSmallFroms = [1,2,3,4,5,6,7,8,9];
var prodesSmallTos   = [16,23,24,20,19,18,22,17,21];
var prodesSmall = prodesLessImg.multiply(0);
for (var _si = 0; _si < prodesSmallFroms.length; _si++) {
  prodesSmall = prodesSmall.where(prodesLessImg.eq(prodesSmallFroms[_si]), prodesSmallTos[_si]);
}

var prodesUnified = prodesGreaterThan625ha.unmask(0).blend(prodesSmall);
var deforestedUpTo2016 = prodesUnified.gte(2).and(prodesUnified.lte(16));

var prodesRaw = ee.Image('projects/ee-ipam/assets/REDD/prodes_brasil_2023').unmask(0);
var prodesNonVegetation = prodesRaw.eq(91).or(prodesRaw.eq(101));

var forest2016 = vegetationMask.eq(1)
  .and(deforestedUpTo2016.not())
  .and(prodesNonVegetation.not());

Map.centerObject(biomesBound, 4);
Map.addLayer(
  forest2016,
  {min: 0, max: 1, palette: ['lightgray', 'darkgreen']},
  'Floresta Remanescente 2016', false
);

// ── prodes via where (substitui remap) ────────────────────

var prodesImg = prodesGreaterThan625ha.unmask(0);
var prodesWhere = prodesImg.multiply(0);
for (var _pi = 0; _pi < PRODES_FROM.length; _pi++) {
  prodesWhere = prodesWhere.where(prodesImg.eq(PRODES_FROM[_pi]), PRODES_TO[_pi]);
}

// =================== EXPORT HELPERS ===================

var flag = 'WS_CCAL_modulo1-';

var DEFAULT_CRS = 'EPSG:4326';
var DEFAULT_TRANSFORM = [0.00026949458523585647, 0, -180, 0, -0.00026949458523585647, 90];

function exportEmissionImage(image, description, year, fBiome, mask, bounds) {
  var tagged = image
    .multiply(ee.Image.pixelArea().multiply(0.0001))
    .multiply(fBiome)
    .rename('emission_tCO2e_pixel')
    .set('system:time_start', ee.Date.fromYMD(year, 1, 1).millis())
    .set('year', year)
    .set('description', description)
    .set('f_biome', fBiome)
    .updateMask(mask)
    .float();

  Export.image.toAsset({
    image: tagged,
    description: flag + description,
    assetId: EXPORT_ASSET_ROOT + '/' + description,
    region: bounds,
    crs: DEFAULT_CRS,
    crsTransform: DEFAULT_TRANSFORM,
    scale: SPATIAL_SCALE,
    maxPixels: 1e13,
    pyramidingPolicy: { '.default': 'mean' },
    overwrite: true
  });
}

function exportStockImage(agb, bgb, dw, litter, prefix, year, mask, bounds) {
  var total   = agb.add(bgb).add(dw).add(litter);
  var stacked = agb.rename('agb')
    .addBands(bgb.rename('bgb'))
    .addBands(dw.rename('dw'))
    .addBands(litter.rename('litter'))
    .addBands(total.rename('total'))
    .set('system:time_start', ee.Date.fromYMD(year, 1, 1).millis())
    .set('year', year)
    .set('biome', prefix)
    .updateMask(mask)
    .float();

  var desc = prefix + '_stock_carbon_' + year;
  Export.image.toAsset({
    image: stacked,
    description: flag + desc,
    assetId: EXPORT_ASSET_ROOT + '/' + desc,
    region: bounds,
    crs: DEFAULT_CRS,
    crsTransform: DEFAULT_TRANSFORM,
    scale: SPATIAL_SCALE,
    maxPixels: 1e13,
    pyramidingPolicy: { '.default': 'mean' },
    overwrite: true
  });
}

function exportStockImageSimple(totalImage, prefix, year, mask, bounds) {
  var tagged = totalImage
    .rename('total')
    .set('system:time_start', ee.Date.fromYMD(year, 1, 1).millis())
    .set('year', year)
    .set('biome', prefix)
    .updateMask(mask)
    .float();

  var desc = prefix + '_stock_carbon_' + year;
  Export.image.toAsset({
    image: tagged,
    description: flag + desc,
    assetId: EXPORT_ASSET_ROOT + '/' + desc,
    region: bounds,
    crs: DEFAULT_CRS,
    crsTransform: DEFAULT_TRANSFORM,
    scale: SPATIAL_SCALE,
    maxPixels: 1e13,
    pyramidingPolicy: { '.default': 'mean' },
    overwrite: true
  });
}

// =================== MAPA DE VERIFICAÇÃO ===================

function addDefCheckLayer(defCO2image, biomeName, mask, bounds) {
  var clipped = defCO2image
    .multiply(ee.Image.pixelArea().multiply(0.0001))
    .updateMask(mask);
  Map.addLayer(clipped, visEmission,
    'Def CO2 ' + biomeName + ' ' + VIS_YEAR, true);
  print('Stats def CO2 ' + biomeName + ' ' + VIS_YEAR + ':',
    clipped.reduceRegion({
      reducer: ee.Reducer.sum().combine(ee.Reducer.max(), null, true),
      geometry: bounds,
      scale: 1000,
      maxPixels: 1e11,
      bestEffort: true
    })
  );
}

// ============================================================
//  AMAZON — ee.List.iterate() + where
// ============================================================

function processAmazon() {

  var biomeFC      = biomesBound.filter(ee.Filter.eq('Bioma', 'Amazônia'));
  var biome_mask   = ee.Image().paint(biomeFC).eq(0);
  var biome_bounds = biomeFC.geometry().bounds();

  var prefix  = 'amz';
  var fBiome  = F_BIOME.amz;
  var fPost   = F_POST_DEF.amz;

  var forests = vegetationMask;
  var zeros   = ee.Image(0);

  // prodesDeforestation (where + forest2016 após)
  var prodesDeforestation = prodesWhere.multiply(forest2016);

  var agb1    = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_AB_30m')
                  .updateMask(ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_AB_30m').gte(0));
  var bgb1    = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_BB_30m')
                  .updateMask(ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_BB_30m').gte(0));
  var dw1     = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_DW_30m')
                  .updateMask(ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_DW_30m').gte(0));
  var litter1 = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_LI_30m')
                  .updateMask(ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_LI_30m').gte(0));

  var agb0    = carbonStock.select('cagb').mosaic().blend(agb1).multiply(forest2016);
  var bgb0    = carbonStock.select('cbgb').mosaic().blend(bgb1).multiply(forest2016);
  var dw0     = carbonStock.select('cdw').mosaic().blend(dw1).multiply(forest2016);
  var litter0 = carbonStock.select('clitter').mosaic().blend(litter1).multiply(forest2016);

  exportStockImage(agb0, bgb0, dw0, litter0, prefix, START_YEAR - 1, biome_mask, biome_bounds);

  // ── Pré-carrega fire e SL em listas p/ acesso no iterate ──
  // Concatena um zero no final p/ o slNext do último ano não estourar
  var fireList = ee.List(YEARS.map(function(y) {
    return zeros.blend(
      ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/PRODES/PRODES_ANO_CIVIL/DeterAnoProdes_'
               + y + '_fire')
        .multiply(forests)
        .multiply(managedLandAmazon)
    );
  }).concat([zeros]));

  var slList = ee.List(YEARS.map(function(y) {
    return zeros.blend(
      ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/PRODES/PRODES_ANO_CIVIL/DeterAnoProdes_'
               + y + '_cs_disordered')
        .multiply(forests)
    );
  }).concat([zeros]));

  // slLayer inicial (ano START_YEAR)
  var slLayer0 = slList.get(0);

  // ── ee.List.iterate() ─────────────────────────────────────
  var first = ee.Image(agb0.rename('agb'))
    .addBands(bgb0.rename('bgb'))
    .addBands(dw0.rename('dw'))
    .addBands(litter0.rename('litter'))
    .addBands(ee.Image(slLayer0).rename('slLayer'))
    .addBands(agb0.add(bgb0).add(dw0).add(litter0).rename('stock_' + (START_YEAR - 1)));

  var sequence = ee.List.sequence(START_YEAR, END_YEAR);

  var result = ee.Image(sequence.iterate(function(yr, prev) {
    yr   = ee.Number(yr);
    prev = ee.Image(prev);
    var yearStr = yr.format('%d');
    var idx     = yr.subtract(START_YEAR);

    var agbPrev    = prev.select('agb');
    var bgbPrev    = prev.select('bgb');
    var dwPrev     = prev.select('dw');
    var litterPrev = prev.select('litter');
    var slPrev     = prev.select('slLayer');

    var agbDwL = agbPrev.add(dwPrev).add(litterPrev);

    // ---- Fire ----
    var fireLayer = ee.Image(fireList.get(idx));
    var fireCO2 = agbDwL.multiply(fireLayer).multiply(0.368);
    var fireCH4 = agbDwL.multiply(fireLayer).multiply(1 / 0.47).multiply(0.368).multiply(6.8).multiply(0.001);
    var fireN2O = agbDwL.multiply(fireLayer).multiply(1 / 0.47).multiply(0.368).multiply(0.2).multiply(0.001);

    var agbTmp    = agbPrev.subtract(agbPrev.multiply(fireLayer).multiply(0.368));
    var dwTmp     = dwPrev.subtract(dwPrev.multiply(fireLayer).multiply(0.368));
    var litterTmp = litterPrev.subtract(litterPrev.multiply(fireLayer).multiply(0.368));

    // ---- Selective Logging ----
    var slNext = ee.Image(slList.get(idx.add(1)));
    var slFactor = slPrev.remap(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [0, 0.29, 0.27, 0.26, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22]
    );
    var slCO2 = agbTmp.multiply(slFactor);
    var slLayerNew = slPrev.add(slNext).multiply(slNext).multiply(forests);

    var agbAfterSL = agbTmp.subtract(slCO2);
    var agbDwLUpdate = agbAfterSL.add(dwTmp).add(litterTmp);

    // ---- Deforestation ----
    var defMask = prodesDeforestation.eq(yr);
    var defCO2  = agbDwLUpdate.add(bgbPrev).multiply(defMask);
    var defCH4  = agbDwLUpdate.multiply(defMask).multiply(1 / 0.47).multiply(0.368).multiply(6.8).multiply(0.001);
    var defN2O  = agbDwLUpdate.multiply(defMask).multiply(1 / 0.47).multiply(0.368).multiply(0.2).multiply(0.001);

    var defCO2_CO2eq = defCO2.multiply(C_TO_CO2);
    var defCH4_CO2eq = defCH4.multiply(GWP_CH4);
    var defN2O_CO2eq = defN2O.multiply(GWP_N2O);

    var postDefRemoval = defCO2_CO2eq.add(defCH4_CO2eq).add(defN2O_CO2eq).multiply(fPost);
    var defCO2e = defCO2_CO2eq.add(postDefRemoval);

    // Stock após desmatamento
    var agbFin    = agbAfterSL.multiply(defMask.neq(1));
    var bgbFin    = bgbPrev.multiply(defMask.neq(1));
    var dwFin     = dwTmp.multiply(defMask.neq(1));
    var litterFin = litterTmp.multiply(defMask.neq(1));
    var stockCurr = agbFin.add(bgbFin).add(dwFin).add(litterFin);

    return prev
      .addBands(agbFin.rename('agb'), ['agb'], true)
      .addBands(bgbFin.rename('bgb'), ['bgb'], true)
      .addBands(dwFin.rename('dw'), ['dw'], true)
      .addBands(litterFin.rename('litter'), ['litter'], true)
      .addBands(slLayerNew.rename('slLayer'), ['slLayer'], true)
      .addBands(fireCO2.multiply(C_TO_CO2).rename(ee.String('fire_co2_density_').cat(yearStr)))
      .addBands(fireCH4.multiply(GWP_CH4).rename(ee.String('fire_ch4_density_').cat(yearStr)))
      .addBands(fireN2O.multiply(GWP_N2O).rename(ee.String('fire_n2o_density_').cat(yearStr)))
      .addBands(slCO2.multiply(C_TO_CO2).rename(ee.String('sl_co2_density_').cat(yearStr)))
      .addBands(defCO2e.rename(ee.String('def_co2_density_').cat(yearStr)))
      .addBands(defCH4_CO2eq.rename(ee.String('def_ch4_density_').cat(yearStr)))
      .addBands(defN2O_CO2eq.rename(ee.String('def_n2o_density_').cat(yearStr)))
      .addBands(stockCurr.rename(ee.String('stock_').cat(yearStr)));
  }, first));

  // ── Exporta cada ano (client-side) ─────────────────────────
  YEARS.forEach(function(year) {
    var yr = String(year);

    exportEmissionImage(
      result.select('fire_co2_density_' + yr), prefix + '_emission_fire_co2_' + year,
      year, fBiome, biome_mask, biome_bounds);
    exportEmissionImage(
      result.select('fire_ch4_density_' + yr), prefix + '_emission_fire_ch4_' + year,
      year, fBiome, biome_mask, biome_bounds);
    exportEmissionImage(
      result.select('fire_n2o_density_' + yr), prefix + '_emission_fire_n2o_' + year,
      year, fBiome, biome_mask, biome_bounds);
    exportEmissionImage(
      result.select('sl_co2_density_' + yr), prefix + '_emission_sl_co2_' + year,
      year, fBiome, biome_mask, biome_bounds);
    exportEmissionImage(
      result.select('def_co2_density_' + yr), prefix + '_emission_def_co2_' + year,
      year, fBiome, biome_mask, biome_bounds);
    exportEmissionImage(
      result.select('def_ch4_density_' + yr), prefix + '_emission_def_ch4_' + year,
      year, fBiome, biome_mask, biome_bounds);
    exportEmissionImage(
      result.select('def_n2o_density_' + yr), prefix + '_emission_def_n2o_' + year,
      year, fBiome, biome_mask, biome_bounds);

    exportStockImageSimple(
      result.select('stock_' + yr), prefix, year, biome_mask, biome_bounds);

    if (year === VIS_YEAR) {
      var defCO2 = result.select('def_co2_density_' + yr);
      addDefCheckLayer(defCO2, 'Amazônia', biome_mask, biome_bounds);
    }
  });
}

processAmazon();

// ============================================================
//  CERRADO — ee.List.iterate() + where
// ============================================================

function processCerrado() {

  var biomeFC      = biomesBound.filter(ee.Filter.eq('Bioma', 'Cerrado'));
  var biome_mask   = ee.Image().paint(biomeFC).eq(0);
  var biome_bounds = biomeFC.geometry().bounds();

  var prefix  = 'cerr';
  var fBiome  = F_BIOME.cerr;
  var fPost   = F_POST_DEF.cerr;

  var prodesDeforestation = prodesWhere.multiply(forest2016);

  var agb0    = carbonStock.select('cagb').mosaic().unmask(0).multiply(forest2016);
  var bgb0    = carbonStock.select('cbgb').mosaic().unmask(0).multiply(forest2016);
  var dw0     = carbonStock.select('cdw').mosaic().unmask(0).multiply(forest2016);
  var litter0 = carbonStock.select('clitter').mosaic().unmask(0).multiply(forest2016);

  exportStockImage(agb0, bgb0, dw0, litter0, prefix, START_YEAR - 1, biome_mask, biome_bounds);

  // ── ee.List.iterate() ─────────────────────────────────────
  var first = ee.Image(agb0.rename('agb'))
    .addBands(bgb0.rename('bgb'))
    .addBands(dw0.rename('dw'))
    .addBands(litter0.rename('litter'))
    .addBands(agb0.add(bgb0).add(dw0).add(litter0).rename('stock_' + (START_YEAR - 1)));

  var sequence = ee.List.sequence(START_YEAR, END_YEAR);

  var result = ee.Image(sequence.iterate(function(yr, prev) {
    yr   = ee.Number(yr);
    prev = ee.Image(prev);
    var yearStr = yr.format('%d');

    var agbPrev    = prev.select('agb');
    var bgbPrev    = prev.select('bgb');
    var dwPrev     = prev.select('dw');
    var litterPrev = prev.select('litter');

    var agbDwL = agbPrev.add(dwPrev).add(litterPrev);

    var defMask     = prodesDeforestation.eq(yr);
    var totalCarbon = agbPrev.add(bgbPrev).add(dwPrev).add(litterPrev);
    var defCO2      = totalCarbon.multiply(defMask);
    var defCH4      = agbDwL.multiply(defMask).multiply(1 / 0.47).multiply(0.379).multiply(6.8).multiply(0.001);
    var defN2O      = agbDwL.multiply(defMask).multiply(1 / 0.47).multiply(0.379).multiply(0.2).multiply(0.001);

    var defCO2_CO2eq = defCO2.multiply(C_TO_CO2);
    var defCH4_CO2eq = defCH4.multiply(GWP_CH4);
    var defN2O_CO2eq = defN2O.multiply(GWP_N2O);

    var postDefRemoval = defCO2_CO2eq.add(defCH4_CO2eq).add(defN2O_CO2eq).multiply(fPost);
    var defCO2e = defCO2_CO2eq.add(postDefRemoval);

    var agbFin    = agbPrev.multiply(defMask.neq(1));
    var bgbFin    = bgbPrev.multiply(defMask.neq(1));
    var dwFin     = dwPrev.multiply(defMask.neq(1));
    var litterFin = litterPrev.multiply(defMask.neq(1));
    var stockCurr = agbFin.add(bgbFin).add(dwFin).add(litterFin);

    return prev
      .addBands(agbFin.rename('agb'), ['agb'], true)
      .addBands(bgbFin.rename('bgb'), ['bgb'], true)
      .addBands(dwFin.rename('dw'), ['dw'], true)
      .addBands(litterFin.rename('litter'), ['litter'], true)
      .addBands(defCO2e.rename(ee.String('def_co2_density_').cat(yearStr)))
      .addBands(defCH4_CO2eq.rename(ee.String('def_ch4_density_').cat(yearStr)))
      .addBands(defN2O_CO2eq.rename(ee.String('def_n2o_density_').cat(yearStr)))
      .addBands(stockCurr.rename(ee.String('stock_').cat(yearStr)));
  }, first));

  // ── Exporta cada ano ───────────────────────────────────────
  YEARS.forEach(function(year) {
    var yr = String(year);

    exportEmissionImage(
      result.select('def_co2_density_' + yr), prefix + '_emission_def_co2_' + year,
      year, fBiome, biome_mask, biome_bounds);
    exportEmissionImage(
      result.select('def_ch4_density_' + yr), prefix + '_emission_def_ch4_' + year,
      year, fBiome, biome_mask, biome_bounds);
    exportEmissionImage(
      result.select('def_n2o_density_' + yr), prefix + '_emission_def_n2o_' + year,
      year, fBiome, biome_mask, biome_bounds);

    exportStockImageSimple(
      result.select('stock_' + yr), prefix, year, biome_mask, biome_bounds);

    if (year === VIS_YEAR) {
      addDefCheckLayer(result.select('def_co2_density_' + yr), 'Cerrado', biome_mask, biome_bounds);
    }
  });
}

processCerrado();

// ============================================================
//  BIOMAS SIMPLES — Pantanal | Pampa | Caatinga | Mata Atlântica
//  ee.List.iterate() + where
// ============================================================

function processSimpleBiome(biomeName, prefix) {

  var biomeFC      = biomesBound.filter(ee.Filter.eq('Bioma', biomeName));
  var biome_mask   = ee.Image().paint(biomeFC).eq(0);
  var biome_bounds = biomeFC.geometry().bounds();
  var fBiome       = F_BIOME[prefix];

  var prodesDeforestation = prodesWhere.multiply(forest2016);
  var totalCarbon = carbonStock.select('total').mosaic().unmask(0).multiply(forest2016);

  exportStockImageSimple(totalCarbon, prefix, START_YEAR - 1, biome_mask, biome_bounds);

  // ── ee.List.iterate() ─────────────────────────────────────
  var first = ee.Image(totalCarbon.rename('total'))
    .addBands(totalCarbon.rename('stock_' + (START_YEAR - 1)));

  var sequence = ee.List.sequence(START_YEAR, END_YEAR);

  var result = ee.Image(sequence.iterate(function(yr, prev) {
    yr   = ee.Number(yr);
    prev = ee.Image(prev);
    var yearStr = yr.format('%d');

    var totalPrev = prev.select('total');
    var defMask   = prodesDeforestation.eq(yr);
    var defCO2    = totalPrev.multiply(defMask);
    var totalNew  = totalPrev.multiply(defMask.neq(1));

    return prev
      .addBands(totalNew.rename('total'), ['total'], true)
      .addBands(defCO2.multiply(C_TO_CO2).rename(ee.String('def_co2_density_').cat(yearStr)))
      .addBands(totalNew.rename(ee.String('stock_').cat(yearStr)));
  }, first));

  // ── Exporta cada ano ───────────────────────────────────────
  YEARS.forEach(function(year) {
    var yr = String(year);

    exportEmissionImage(
      result.select('def_co2_density_' + yr), prefix + '_emission_def_co2_' + year,
      year, fBiome, biome_mask, biome_bounds);

    exportStockImageSimple(
      result.select('stock_' + yr), prefix, year, biome_mask, biome_bounds);

    if (year === VIS_YEAR) {
      addDefCheckLayer(result.select('def_co2_density_' + yr), biomeName, biome_mask, biome_bounds);
    }
  });
}

processSimpleBiome('Pantanal',       'pan');
processSimpleBiome('Pampa',          'pam');
processSimpleBiome('Caatinga',       'caa');
processSimpleBiome('Mata Atlântica', 'ma');
