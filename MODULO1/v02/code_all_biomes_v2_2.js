// ============================================================
// BRAZIL NATIONAL FREL — Unified GEE Script (v2.1.3)
//
// Changelog v2.1.2 → v2.1.3:
//   FIX: ordem de operações em prodesDeforestation corrigida em
//        TODOS os biomas — remap() ANTES de .multiply(f2016).
//        Antes, o .multiply(f2016) convertia a imagem para float
//        ANTES do remap (que casa inteiros), zerando o desmatamento
//        em biomas com pouca cobertura (evidente no Pampa).
//        Aplicado em: processAmazon (prodes625), processCerrado,
//        processSimpleBiome.
//   Região de exportação: mantida brazilRegion (Brasil inteiro) —
//        Opção A, grade nacional comum p/ mosaico sem deslocamento.
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
var EXPORT_ASSET_ROOT  = 'projects/ee-ipam/assets/CCAL/MODULO1/biomes_v3';
var EXPORT_MOSAIC_ROOT = 'projects/ee-ipam/assets/CCAL/MODULO1/brazil_v3';

var PRODES_START       = 2016;
var PRODES_END         = 2024;

var C_TO_CO2           = 44 / 12;
var GWP_CH4            = 28;
var GWP_N2O            = 265;
var SPATIAL_SCALE      = 30;

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

var VIS_YEAR = 2022; // ← altere aqui para checar outro ano

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
var biomesBound = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var brazilRegion = biomesBound.geometry().bounds();

// ── Floresta remanescente em 2016 ────────────────────────

var prodesSmall = prodesLessThan625ha
  .remap([1,2,3,4,5,6,7,8,9],
         [16,23,24,20,19,18,22,17,21]);

var prodesUnified = prodesGreaterThan625ha
  .unmask(0)
  .blend(prodesSmall);

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

// =================== EXPORT HELPERS ===================

function exportEmissionImage(image, description, year, fBiome) {
  var tagged = image
    .multiply(ee.Image.pixelArea().multiply(0.0001))
    .multiply(fBiome)
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

// =================== MAPA DE VERIFICAÇÃO ===================

function addDefCheckLayer(defCO2image, biomeName, biomeFC) {
  var clipped = defCO2image
    .multiply(ee.Image.pixelArea().multiply(0.0001))
    .clipToCollection(biomeFC);
  Map.addLayer(clipped, visEmission,
    'Def CO2 ' + biomeName + ' ' + VIS_YEAR, true);
  print('Stats def CO2 ' + biomeName + ' ' + VIS_YEAR + ':',
    clipped.reduceRegion({
      reducer: ee.Reducer.sum().combine(ee.Reducer.max(), null, true),
      geometry: biomeFC.geometry(),
      scale: 1000,
      maxPixels: 1e11,
      bestEffort: true
    })
  );
}

// ============================================================
//  AMAZON
// ============================================================

function processAmazon() {

  var biomeFC = biomesBound.filter(ee.Filter.eq('Bioma', 'Amazônia'));
  var prefix  = 'amz';
  var fBiome  = F_BIOME.amz;
  var fPost   = F_POST_DEF.amz;

  var forests = vegetationMask.clip(biomeFC);
  var f2016   = forest2016.clip(biomeFC);
  var zeros   = ee.Image(0).clip(biomeFC);

  // FIX v2.1.3 — remap ANTES de multiply(f2016)
  var prodes625 = prodesGreaterThan625ha
    .unmask(0)
    .remap(PRODES_FROM, PRODES_TO, 0)
    .multiply(f2016)
    .clip(biomeFC);

  // prodesLessThan625ha já está em anos (16,17,...) após o remap próprio;
  // aplica-se f2016 após o blend, mantendo inteiros antes do remap final.
  var prodesDeforestation = prodes625
    .blend(prodesLessThan625ha.clip(biomeFC).remap(PRODES_TO, PRODES_TO, 0).multiply(f2016))
    .clip(biomeFC);

  var agb1    = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_AB_30m')
                  .updateMask(ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_AB_30m').gte(0));
  var bgb1    = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_BB_30m')
                  .updateMask(ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_BB_30m').gte(0));
  var dw1     = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_DW_30m')
                  .updateMask(ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_DW_30m').gte(0));
  var litter1 = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_LI_30m')
                  .updateMask(ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_LI_30m').gte(0));

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

    exportEmissionImage(slCO2.multiply(C_TO_CO2), prefix + '_emission_sl_co2_' + year, year, fBiome);

    // ---- Deforestation ----
    var defMask      = prodesDeforestation.eq(year);
    var defCO2       = agbDwL.add(bgb).multiply(defMask);
    var defCH4       = agbDwL.multiply(defMask).multiply(1 / 0.47).multiply(0.368).multiply(6.8).multiply(0.001);
    var defN2O       = agbDwL.multiply(defMask).multiply(1 / 0.47).multiply(0.368).multiply(0.2).multiply(0.001);

    var defCO2_CO2eq = defCO2.multiply(C_TO_CO2);
    var defCH4_CO2eq = defCH4.multiply(GWP_CH4);
    var defN2O_CO2eq = defN2O.multiply(GWP_N2O);

    // Eq. 7
    var postDefRemoval_CO2eq = defCO2_CO2eq.add(defCH4_CO2eq).add(defN2O_CO2eq).multiply(fPost);
    defCO2_CO2eq = defCO2_CO2eq.add(postDefRemoval_CO2eq);

    exportEmissionImage(defCO2_CO2eq, prefix + '_emission_def_co2_' + year, year, fBiome);
    exportEmissionImage(defCH4_CO2eq, prefix + '_emission_def_ch4_' + year, year, fBiome);
    exportEmissionImage(defN2O_CO2eq, prefix + '_emission_def_n2o_' + year, year, fBiome);

    // ── Mapa de verificação para VIS_YEAR ──
    if (year === VIS_YEAR) {
      addDefCheckLayer(defCO2, 'Amazônia', biomeFC);
    }

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
//  CERRADO — FIX v2.1.3: remap ANTES de multiply(f2016)
// ============================================================

function processCerrado() {

  var biomeFC = biomesBound.filter(ee.Filter.eq('Bioma', 'Cerrado'));
  var prefix  = 'cerr';
  var fBiome  = F_BIOME.cerr;
  var fPost   = F_POST_DEF.cerr;

  var f2016 = forest2016.clip(biomeFC);

  // FIX v2.1.3 — remap ANTES de multiply(f2016)
  var prodesDeforestation = prodesGreaterThan625ha
    .unmask(0)
    .remap(PRODES_FROM, PRODES_TO, 0)
    .multiply(f2016)
    .clip(biomeFC);

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

    // Eq. 7
    var postDefRemoval_CO2eq = defCO2_CO2eq.add(defCH4_CO2eq).add(defN2O_CO2eq).multiply(fPost);
    defCO2_CO2eq = defCO2_CO2eq.add(postDefRemoval_CO2eq);

    exportEmissionImage(defCO2_CO2eq, prefix + '_emission_def_co2_' + year, year, fBiome);
    exportEmissionImage(defCH4_CO2eq, prefix + '_emission_def_ch4_' + year, year, fBiome);
    exportEmissionImage(defN2O_CO2eq, prefix + '_emission_def_n2o_' + year, year, fBiome);

    // ── Mapa de verificação para VIS_YEAR ──
    if (year === VIS_YEAR) {
      addDefCheckLayer(defCO2, 'Cerrado', biomeFC);
    }

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
//  BIOMAS SIMPLES — Pantanal | Pampa | Caatinga | Mata Atlântica
//  FIX v2.1.3: remap ANTES de multiply(f2016)
// ============================================================

function processSimpleBiome(biomeName, prefix) {

  var biomeFC = biomesBound.filter(ee.Filter.eq('Bioma', biomeName));
  var fBiome  = F_BIOME[prefix];
  var f2016   = forest2016.clip(biomeFC);

  // FIX v2.1.3 — remap ANTES de multiply(f2016)
  var prodesDeforestation = prodesGreaterThan625ha
    .unmask(0)
    .remap(PRODES_FROM, PRODES_TO, 0)
    .multiply(f2016)
    .clip(biomeFC);

  var totalCarbon = carbonStock.select('total').mosaic().unmask(0).multiply(f2016).clip(biomeFC);

  exportStockImageSimple(totalCarbon, prefix, START_YEAR - 1);

  function iterate(year) {
    if (year > END_YEAR) return;

    var defMask = prodesDeforestation.eq(year);
    var defCO2  = totalCarbon.multiply(defMask);

    totalCarbon = totalCarbon.multiply(defMask.neq(1));

    exportEmissionImage(defCO2.multiply(C_TO_CO2), prefix + '_emission_def_co2_' + year, year, fBiome);

    // ── Mapa de verificação para VIS_YEAR ──
    if (year === VIS_YEAR) {
      addDefCheckLayer(defCO2, biomeName, biomeFC);
    }

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
//  MOSAIC — rodar APENAS após todos os exports de bioma concluírem
//  (inalterado em relação à v2.1.2)
// ============================================================

var EMISSION_TYPES = [
  'emission_fire_co2', 'emission_fire_ch4', 'emission_fire_n2o',
  'emission_sl_co2',
  'emission_def_co2',  'emission_def_ch4',  'emission_def_n2o'
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