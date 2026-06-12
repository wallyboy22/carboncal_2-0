// ===================================================================
// CCAL_02 FRELL v2 — degradação ativa + estoque "total" (stock) + export nacional
// ===================================================================

var assetId = 'projects/ee-ipam/assets/CCAL/public/ccal_02/ccal_02_brazil_modulo_1_frell_v2';
var image   = ee.Image(assetId);

print('Bandas do asset:', image.bandNames());

// Estoque "total" = bandas stock_<ano> (2016..2024). 2016 é o ano base.
var stockBands     = image.select('stock.*');         // 9 bandas: 2016..2024
var stockForMask   = stockBands.slice(1);             // 8 bandas: 2017..2024 (alinha c/ emissões)

// --- 1. Convergência fogo + corte seletivo (degradação) ---
var loss_convergence_degradation = image.select('loss_fire.*').selfMask()
  .add(image.select('loss_selective_logging_.*').selfMask())
  .selfMask()
  .rename(
    image.select('loss_fire.*').bandNames()
      .map(function(str){
        // loss_fire_2017 -> loss_convergence_degradation_2017
        return ee.String(str).replace('fire','convergence_degradation');
      }));

// --- 2. Processamento intermediário: intervalo ativo de degradação ---
var emissions = [
  'loss_fire',
  'loss_selective_logging',
  'loss_convergence_degradation',
  'loss_deforestation'
];

var final_image = ee.Image().select();

emissions.forEach(function(emission){
  var name = emission;
  var img  = image.select(emission + '.*');
  if (name === 'loss_convergence_degradation'){ img = loss_convergence_degradation; }

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

  // máscara pelo estoque (anos 2017..2024), alinhada banda a banda
  img = img.updateMask(stockForMask.gt(0));

  Map.addLayer(img, {}, name);
  print(name, img);
  final_image = final_image.addBands(img);
});

// --- 3. Anexa o estoque (stock_2016..2024) mascarado ---
final_image = final_image
  .addBands(stockBands.selfMask())
  .float();

Map.addLayer(final_image, {}, 'final_image');

// --- 4. Projeção do ASSET ORIGINAL + região nacional (limite Brasil) ---
var proj   = image.select(0).projection();
var scale  = proj.nominalScale();

var region = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na','Brazil'))
  .geometry().bounds();

print('Escala (m):', scale);
print('Bandas finais:', final_image.bandNames());
Map.centerObject(region, 4);

// --- 5. Exportar para Asset ---
Export.image.toAsset({
  image: final_image,
  description: 'ccal_02_brazil_modulo_1_frell_v2_2',
  assetId: 'projects/ee-ipam/assets/CCAL/public/ccal_02/ccal_02_brazil_modulo_1_frell_v2_2',
  region: region,
  crs: proj.crs(),
  crsTransform: ee.List(proj.getInfo().transform),
  maxPixels: 1e13
});