

/*
// ===================================================================
// CCAL MÓDULO 1 — Consolidar biomes_v2 em imagem única do Brasil
// Saída: ccal_02_brazil_modulo_1_frell_v2 (multibanda)
// ===================================================================

var BIOMES_IC   = 'projects/ee-ipam/assets/CCAL/MODULO1/biomes_v2';
var OUTPUT_ASSET = 'projects/ee-ipam/assets/CCAL/public/ccal_02/ccal_02_brazil_modulo_1_frell_v2';

var START_YEAR = 2017, END_YEAR = 2024;   // emissões
var STOCK_START = 2016, STOCK_END = 2024; // estoque (inclui ano base 2016)

var SPATIAL_SCALE = 30;
var EXPORT_CRS    = 'EPSG:4674';

var ic = ee.ImageCollection(BIOMES_IC);
var biomesBound = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var brazilRegion = biomesBound.geometry().bounds();

var BIOME_PREFIXES = ['amz','cerr','pan','pam','caa','ma'];
var GASES          = ['co2','ch4','n2o'];

// ---- helper: soma de um tipo de distúrbio (todos gases, todos biomas) em um ano ----
function sumDisturbance(disturb, year) {
  var imgs = [];
  BIOME_PREFIXES.forEach(function(pfx){
    GASES.forEach(function(gas){
      var id = pfx + '_emission_' + disturb + '_' + gas + '_' + year;
      // pega a imagem se existir na coleção; senão, zero
      var img = ic.filter(ee.Filter.eq('system:index', id)).first();
      img = ee.Image(ee.Algorithms.If(img, ee.Image(img).select('emission_tCO2e_pixel'), ee.Image(0)));
      imgs.push(img.unmask(0));
    });
  });
  return ee.ImageCollection(imgs).sum();
}

// ---- helper: soma do estoque (banda total) de todos os biomas em um ano ----
function sumStock(year) {
  var imgs = [];
  BIOME_PREFIXES.forEach(function(pfx){
    var id  = pfx + '_stock_carbon_' + year;
    var img = ic.filter(ee.Filter.eq('system:index', id)).first();
    img = ee.Image(ee.Algorithms.If(img, ee.Image(img).select('total'), ee.Image(0)));
    imgs.push(img.unmask(0));
  });
  return ee.ImageCollection(imgs).sum();
}

// ===================================================================
// Monta a imagem multibanda
// ===================================================================
var final_image = ee.Image().select();

for (var year = START_YEAR; year <= END_YEAR; year++){
  var defAll  = sumDisturbance('def',  year).rename('loss_deforestation_'      + year);
  var fireAll = sumDisturbance('fire', year).rename('loss_fire_'               + year);
  var slAll   = sumDisturbance('sl',   year).rename('loss_selective_logging_'  + year);

  // convergência da degradação = fogo + corte seletivo
  var convDeg = fireAll.add(slAll).rename('loss_convergence_degradation_' + year);

  final_image = final_image
    .addBands(defAll)
    .addBands(fireAll)
    .addBands(slAll)
    .addBands(convDeg);
}

// estoque (2016..2024)
for (var sy = STOCK_START; sy <= STOCK_END; sy++){
  var stockAll = sumStock(sy).rename('stock_' + sy);
  final_image = final_image.addBands(stockAll);
}

final_image = final_image.float();

print('Bandas finais:', final_image.bandNames());
print('Nº de bandas:', final_image.bandNames().size());

Map.centerObject(biomesBound, 4);
Map.addLayer(final_image.select('loss_deforestation_2022').selfMask(),
  {min:0, max:10, palette:['ffffcc','fd8d3c','bd0026']}, 'def 2022 (check)');

// ===================================================================
// Exportar para Asset
// ===================================================================
Export.image.toAsset({
  image: final_image,
  description: 'ccal_02_brazil_modulo_1_frell_v2',
  assetId: OUTPUT_ASSET,
  region: brazilRegion,
  scale: SPATIAL_SCALE,
  crs: EXPORT_CRS,
  maxPixels: 1e13,
  pyramidingPolicy: { '.default': 'mean' }
});
*/