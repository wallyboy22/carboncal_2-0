// CCAL Módulo 2 v03 — calcula as séries florestal e savânica 2016–2024.
// Método/base de carbono da MODULO2/v01; atualiza dados de fogo para C5.1 e PRODES até 2024.
// Exporta assets anuais em MODULO2/v03/model_assets para a síntese v03.

var VERSION = 'v03';
var RAW = 'projects/ee-ipam/assets/CCAL/MODULO2/v03/model_assets';
var START_YEAR = 2017;
var END_YEAR = 2024;
var MAX_PIX = 1e13;
var SCALE = 30;
var aoi = ee.Geometry.Polygon(
  [[[-74.95293871838383, 10.634746454667736],
    [-74.95293871838383, -34.61869995524019],
    [-32.94121996838384, -34.61869995524019],
    [-32.94121996838384, 10.634746454667736]]], null, false);

var qcn = ee.ImageCollection('projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1').mosaic();
var biomes = ee.FeatureCollection('projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026');
// Usa a extensão do FeatureCollection atualizado como região dos exports.
aoi = biomes.geometry().bounds();
var cFactor = ee.Image('projects/ee-ipam/assets/BRAZIL_CF_BIOMES_QCN_FREL');
var managedLand = ee.Image('projects/ee-ipam/assets/Managed_Land_Brazil').unmask(0);
var pret = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2')
  .unmask(0);
var prodesLarge = ee.Image('users/celsojunior/prodes_brasil_2024_v20260407').unmask(0);
var prodesSmallRaw = ee.Image(
  'projects/ee-celsojunior/assets/yearly_deforestation_smaller_than_625ha_biome'
);
var prodesSmall = prodesSmallRaw.multiply(0);
var smallFrom = [1,2,3,4,5,6,7,8,9];
var smallTo = [16,23,24,20,19,18,22,17,21];
for (var si = 0; si < smallFrom.length; si++) {
  prodesSmall = prodesSmall.where(prodesSmallRaw.eq(smallFrom[si]), smallTo[si]);
}
var prodesCodes = prodesLarge.blend(prodesSmall);
var deforestedThrough2016 = prodesCodes.gte(2).and(prodesCodes.lte(16));
var prodesMapped = prodesCodes.multiply(0);
for (var code = 16; code <= 24; code++) {
  prodesMapped = prodesMapped.where(prodesCodes.eq(code), 2000 + code);
}
var prodes = prodesMapped;
var prodesRaw = ee.Image('projects/ee-ipam/assets/REDD/prodes_brasil_2023').unmask(0);
var nonVegetation = prodesRaw.eq(91).or(prodesRaw.eq(101));
var forest2016 = pret.eq(1).and(deforestedThrough2016.not()).and(nonVegetation.not());
var savanna2016 = pret.eq(2).and(deforestedThrough2016.not()).and(nonVegetation.not());
var prodesDeforestation = prodes;

var fireAnnual = ee.Image(
  'projects/mapbiomas-public/assets/brazil/fire/collection5_1/' +
  'mapbiomas_fire_collection51_annual_burned_v1'
);
var fireFrequency = ee.Image(
  'projects/mapbiomas-public/assets/brazil/fire/collection5_1/' +
  'mapbiomas_fire_collection51_fire_frequency_v1'
);
var timeSinceFire = ee.Image(
  'projects/mapbiomas-public/assets/brazil/fire/collection5_1/' +
  'mapbiomas_fire_collection51_time_after_fire_v1'
);
var deterRoot = 'projects/ee-ipam/assets/CCAL/DATASETS/PRODES/PRODES_ANO_CIVIL/';
var ebaRoot = 'projects/ee-ipam/assets/CCAL/DATASETS/FREL/';
var pixelAreaHa = ee.Image.pixelArea().multiply(0.0001);

function exportRaw(image, name, year) {
  var assetName = name + '_' + year;
  Export.image.toAsset({
    image: image.float(),
    description: 'WS_CCAL_M2V03-' + assetName,
    assetId: RAW + '/' + assetName,
    region: aoi,
    scale: SCALE,
    crs: 'EPSG:4326',
    maxPixels: MAX_PIX,
    pyramidingPolicy: {'.default': 'mean'},
    overwrite: true
  });
}

function getDeterLogging(year, vegetationMask) {
  var dis = ee.Image(deterRoot + 'DeterAnoProdes_' + year + '_cs_disordered')
    .multiply(vegetationMask).clip(aoi);
  var geo = ee.Image(deterRoot + 'DeterAnoProdes_' + year + '_cs_geometric')
    .multiply(vegetationMask).clip(aoi);
  return ee.Image(0).clip(aoi).blend(dis).blend(geo);
}

function makeLoggingLayers(vegetationMask) {
  var layers = [];
  for (var year = START_YEAR; year <= END_YEAR; year++) {
    layers.push(getDeterLogging(year, vegetationMask));
  }
  layers.push(ee.Image(0).clip(aoi));
  return layers;
}

function loggingFraction(intensity) {
  return intensity.remap([0,1,2,3,4,5,6,7,8,9,10],
    [0,0.29,0.27,0.26,0.22,0.22,0.22,0.22,0.22,0.22,0.22], 0);
}

function makeCompartments(mask) {
  // Mantém o blend QCN + EBA da v01 nos ramos florestal e savânico.
  var agb = qcn.select('cagb')
    .blend(ee.Image(ebaRoot + 'EBA_AB_30m').updateMask(ee.Image(ebaRoot + 'EBA_AB_30m').gte(0)))
    .multiply(mask);
  var bgb = qcn.select('cbgb')
    .blend(ee.Image(ebaRoot + 'EBA_BB_30m').updateMask(ee.Image(ebaRoot + 'EBA_BB_30m').gte(0)))
    .multiply(mask);
  var dw = qcn.select('cdw')
    .blend(ee.Image(ebaRoot + 'EBA_DW_30m').updateMask(ee.Image(ebaRoot + 'EBA_DW_30m').gte(0)))
    .multiply(mask);
  var litter = qcn.select('clitter')
    .blend(ee.Image(ebaRoot + 'EBA_LI_30m').updateMask(ee.Image(ebaRoot + 'EBA_LI_30m').gte(0)))
    .multiply(mask);
  return {agb: agb, bgb: bgb, dw: dw, litter: litter};
}

function runBiome(mask, prefix, isForest) {
  var c = makeCompartments(mask);
  var agb = c.agb;
  var bgb = c.bgb;
  var dw = c.dw;
  var litter = c.litter;
  var vegetationClass = pret.eq(isForest ? 1 : 2);
  var loggingLayers = makeLoggingLayers(vegetationClass);
  var loggingLayer = loggingLayers[0];
  var agb26 = agb.multiply(0.26);
  exportRaw(agb.add(bgb).add(dw).add(litter), prefix + '_stock', 2016);

  for (var year = START_YEAR; year <= END_YEAR; year++) {
    var fire = fireAnnual.select('burned_area_' + year).gt(0).multiply(mask).unmask(0);
    var def = prodesDeforestation.eq(year).and(mask);
    var slFraction = loggingFraction(loggingLayer);
    var slCO2 = agb.multiply(slFraction);

    if (isForest) {
      var agbDwL = agb.add(dw).add(litter);
      var fireCO2 = agb.multiply(fire).multiply(cFactor);
      var fireCH4 = agbDwL.multiply(fire).multiply(1 / 0.47).multiply(cFactor).multiply(6.8).multiply(0.001);
      var fireN2O = agbDwL.multiply(fire).multiply(1 / 0.47).multiply(cFactor).multiply(0.2).multiply(0.001);
      exportRaw(fireCO2.multiply(pixelAreaHa).multiply(44 / 12), prefix + '_fire_co2_loss_comb', year);
      exportRaw(fireCH4.multiply(pixelAreaHa).multiply(28), prefix + '_fire_ch4_loss_comb', year);
      exportRaw(fireN2O.multiply(pixelAreaHa).multiply(265), prefix + '_fire_n2o_loss_comb', year);
      agb = agb.subtract(agb.multiply(fire).multiply(cFactor));
      dw = dw.subtract(dw.multiply(fire).multiply(cFactor));
      litter = litter.subtract(litter.multiply(fire).multiply(cFactor));
    } else {
      var freq = fireFrequency.select('fire_frequency_1985_' + year);
      var freqClass = ee.Image(0).where(freq.gte(1).and(freq.lt(3)), 1)
        .where(freq.gte(3).and(freq.lt(5)), 2).where(freq.gte(5).and(freq.lt(7)), 3)
        .where(freq.gte(7), 4);
      var tsf = timeSinceFire.select('time_after_fire_' + year);
      var tsfClass = ee.Image(0).where(tsf.gte(0).and(tsf.lt(4)), 4)
        .where(tsf.gte(4).and(tsf.lt(7)), 3).where(tsf.gte(7).and(tsf.lt(10)), 2)
        .where(tsf.gte(10), 1);
      var severity = tsfClass.add(freqClass);
      var fireFactor = ee.Image(0).where(severity.gte(2).and(severity.lte(3)), 0.021)
        .where(severity.gt(3).and(severity.lte(6)), -0.004).where(severity.gt(6), -0.02);
      var combustionCO2 = litter.multiply(fire).multiply(0.873).multiply(44 / 12)
        .add(dw.multiply(fire).multiply(0.459).multiply(44 / 12));
      var combustionCH4 = litter.multiply(fire).multiply(0.873).multiply(1 / 0.47)
        .multiply(6.8).multiply(0.001)
        .add(agb26.multiply(fire).multiply(0.873).multiply(1 / 0.47).multiply(6.8).multiply(0.001))
        .add(dw.multiply(fire).multiply(0.459).multiply(1 / 0.47).multiply(6.8).multiply(0.001));
      var combustionN2O = litter.multiply(fire).multiply(0.873).multiply(1 / 0.47)
        .multiply(0.2).multiply(0.001)
        .add(agb26.multiply(fire).multiply(0.873).multiply(1 / 0.47).multiply(0.2).multiply(0.001))
        .add(dw.multiply(fire).multiply(0.459).multiply(1 / 0.47).multiply(0.2).multiply(0.001));
      // fireFactor describes the change in AGB: positive increases stock.
      // Emissions have the opposite sign: removals negative, losses positive.
      var lateCO2 = agb.multiply(fire).multiply(fireFactor).multiply(-44 / 12);
      exportRaw(combustionCO2.multiply(pixelAreaHa),
        prefix + '_fire_co2_loss_comb', year);
      exportRaw(combustionCH4.multiply(pixelAreaHa).multiply(28),
        prefix + '_fire_ch4_loss_comb', year);
      exportRaw(combustionN2O.multiply(pixelAreaHa).multiply(265),
        prefix + '_fire_n2o_loss_comb', year);
      exportRaw(lateCO2.max(0).multiply(pixelAreaHa), prefix + '_fire_co2_loss_late', year);
      exportRaw(lateCO2.min(0).multiply(pixelAreaHa), prefix + '_fire_co2_gain_late', year);
      agb = agb.add(agb.multiply(fire).multiply(fireFactor).unmask(0));
      agb26 = agb.multiply(0.26);
    }

    exportRaw(slCO2.multiply(pixelAreaHa).multiply(44 / 12), prefix + '_sl_co2_loss_other', year);
    agb = agb.subtract(slCO2);
    var loggingNext = loggingLayers[year - START_YEAR + 1];
    loggingLayer = loggingLayer.add(loggingNext).multiply(loggingNext).clip(aoi);
    var carbonTotal = agb.add(bgb).add(dw).add(litter);
    var defCO2 = carbonTotal.multiply(def).multiply(pixelAreaHa).multiply(44 / 12);
    var defCH4 = agb.add(dw).add(litter).multiply(def).multiply(1 / 0.47).multiply(0.368)
      .multiply(6.8).multiply(0.001).multiply(pixelAreaHa).multiply(28);
    var defN2O = agb.add(dw).add(litter).multiply(def).multiply(1 / 0.47).multiply(0.368)
      .multiply(0.2).multiply(0.001).multiply(pixelAreaHa).multiply(265);
    exportRaw(defCO2, prefix + '_def_co2_loss_other', year);
    exportRaw(defCH4, prefix + '_def_ch4_loss_comb', year);
    exportRaw(defN2O, prefix + '_def_n2o_loss_comb', year);
    agb = agb.multiply(def.not());
    bgb = bgb.multiply(def.not());
    dw = dw.multiply(def.not());
    litter = litter.multiply(def.not());
    exportRaw(agb.add(bgb).add(dw).add(litter), prefix + '_stock', year);
  }
}

runBiome(forest2016, 'florestas', true);
runBiome(savanna2016, 'savanas', false);
print('Módulo 2 v03 — exports anuais configurados (2017–2024).');
