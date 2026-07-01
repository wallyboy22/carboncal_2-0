// ===================================================================
// CCAL MÓDULO 1 — FREL nacional (imagem multibanda) a partir de biomes_v3
//   1) Consolida biomes_v3 (gases + biomas) no PADRÃO DE BANDAS do FREL
//      loss_deforestation_*, loss_fire_*, loss_selective_logging_*,
//      loss_convergence_degradation_*, stock_*
//   2) Aplica a máscara de zero / intervalo de degradação ativa
//      (lógica idêntica ao script anexo)
//   3) Mostra um resultado no mapa para conferência
//   4) Exporta a imagem final mascarada
//
// biomes_v3 JÁ traz as correções embutidas POR PIXEL:
//   - Eq.6 (×fBiome): def + fire + sl, todos os biomas
//   - Eq.7 (fPost):   def de amz (0.042) e cerr (0.088)
//   => Aqui é só CONSOLIDAÇÃO + MÁSCARA. Não reaplicar fatores.
// Celso H. L. Silva Junior — IPAM / CCAL
// ===================================================================

var BIOMES_IC    = 'projects/ee-ipam/assets/CCAL/MODULO1/biomes_v3';
var OUTPUT_ASSET = 'projects/ee-ipam/assets/CCAL/public/ccal_02/ccal_02_brazil_modulo_1_frell_v3';

var START_YEAR  = 2017, END_YEAR  = 2024;   // emissões
var STOCK_START = 2016, STOCK_END = 2024;   // estoque (inclui ano base)
var SPATIAL_SCALE = 30;
var EXPORT_CRS    = 'EPSG:4674';

var ic           = ee.ImageCollection(BIOMES_IC);
var biomesBound  = ee.FeatureCollection('users/celsojunior/lm_bioma_250_cf');
var brazilRegion = biomesBound.geometry().bounds();

var BIOME_PREFIXES = ['amz', 'cerr', 'pan', 'pam', 'caa', 'ma'];
var GASES          = ['co2', 'ch4', 'n2o'];

// ===================================================================
// 1) CONSOLIDAÇÃO — soma todos os gases e biomas por distúrbio/ano
//    (resultado em tCO2eq/pixel, gases já em CO2-eq na biomes_v3)
// ===================================================================
function sumEmission(disturb, year){
  var ids = [];
  BIOME_PREFIXES.forEach(function(pfx){
    GASES.forEach(function(gas){
      ids.push(pfx + '_emission_' + disturb + '_' + gas + '_' + year);
    });
  });
  return ic.filter(ee.Filter.inList('system:index', ids))
           .map(function(img){ return img.select('emission_tCO2e_pixel').unmask(0); })
           .sum();
}

function sumStock(year){
  var ids = BIOME_PREFIXES.map(function(pfx){ return pfx + '_stock_carbon_' + year; });
  return ic.filter(ee.Filter.inList('system:index', ids))
           .map(function(img){ return img.select('total').unmask(0); })
           .sum();
}

var rawImage = ee.Image().select();
for (var y = START_YEAR; y <= END_YEAR; y++){
  rawImage = rawImage
    .addBands(sumEmission('def',  y).rename('loss_deforestation_'     + y))
    .addBands(sumEmission('fire', y).rename('loss_fire_'              + y))
    .addBands(sumEmission('sl',   y).rename('loss_selective_logging_' + y));
}
for (var s = STOCK_START; s <= STOCK_END; s++){
  rawImage = rawImage.addBands(sumStock(s).rename('stock_' + s));
}
print('Bandas CRUAS (consolidadas):', rawImage.bandNames());

// ===================================================================
// 2) MÁSCARA DE ZERO / INTERVALO DE DEGRADAÇÃO ATIVA
//    (idêntica ao script anexo)
//      - zero no intervalo ativo de degradação
//      - mascarado em vegetação primária não degradada e em áreas
//        desmatadas (para estimar a área degradada)
// ===================================================================
var image = rawImage;

// convergence_degradation = fire + sl (mascarados), renomeado p/ padrão da foto
var loss_convergence_degradation = image.select('loss_fire.*').selfMask()
  .add(image.select('loss_selective_logging_.*').selfMask())
  .selfMask()
  .rename(
    image.select('loss_fire.*').bandNames().map(function(str){
      return ee.String(str).replace('fire', 'convergence_degradation');
    }));

var emissions = [
  'loss_fire',
  'loss_selective_logging',
  'loss_convergence_degradation'
];

var final_image = ee.Image().select();
emissions.forEach(function(emission){
  var name = emission;
  var img  = image.select(emission + '.*');
  if (name === 'loss_convergence_degradation'){ img = loss_convergence_degradation; }

  // fundo-zero acumulado + selfMask (intervalo de degradação ativa)
  img = ee.Image(img.slice(1).bandNames().iterate(function(current, previous){
    var bandname = ee.String(current);
    var iterate  = ee.Image(previous);
    var newImage = iterate
      .slice(-1)
      .rename(bandname)
      .multiply(0)
      .blend(img.select(bandname).selfMask());
    return iterate.addBands(newImage);
  }, img.select(0).selfMask()));

  // mantém só onde há estoque (2017..2024), banda a banda
  img = img.updateMask(image.select('stock_.*').slice(1).gt(0));

  Map.addLayer(img, {}, name, false);
  final_image = final_image.addBands(img);
});

// desmatamento e estoque: apenas selfMask (sem lógica de intervalo)
final_image = final_image
  .addBands(image.select('loss_deforestation_.*').selfMask())
  .addBands(image.select('stock_.*').selfMask())
  .float();

print('Bandas FINAIS (mascaradas):', final_image.bandNames());
print('Nº de bandas:', final_image.bandNames().size());

// ===================================================================
// 3) CONFERÊNCIA NO MAPA — um resultado para checar
// ===================================================================
Map.centerObject(brazilRegion, 4);

Map.addLayer(
  final_image.select('loss_deforestation_2024'),
  {min: 0, max: 500, palette: ['ffffcc', 'fd8d3c', 'bd0026']},
  'loss_deforestation_2024 (tCO2e/pixel)'
);
Map.addLayer(
  final_image.select('loss_selective_logging_2022'),
  {min: 0, max: 200, palette: ['f7fcf5', '74c476', '00441b']},
  'loss_selective_logging_2022', false
);
Map.addLayer(
  final_image.select('stock_2024'),
  {min: 0, max: 200, palette: ['ffffff', '41ab5d', '005a32']},
  'stock_2024 (tC/ha)', false
);

// ===================================================================
// 4) EXPORTAR a imagem final mascarada
// ===================================================================
Export.image.toAsset({
  image: final_image,
  description: 'ccal_02_brazil_modulo_1_frell_v3',
  assetId: OUTPUT_ASSET,
  region: brazilRegion,
  scale: SPATIAL_SCALE,
  crs: EXPORT_CRS,
  maxPixels: 1e13,
  pyramidingPolicy: { '.default': 'mean' }
});