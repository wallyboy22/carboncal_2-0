// ===================================================================
// CCAL MÓDULO 1 — Mosaicos nacionais (Brasil) a partir de biomes_v2
// Saída: projects/ee-ipam/assets/CCAL/MODULO1/brazil_v3
//   Gera 1 asset por tipo de emissão/ano + 1 asset de estoque/ano
//   Rodar SOMENTE depois que todas as tasks da biomes_v2 terminarem.
// Celso H. L. Silva Junior — IPAM / CCAL
// ===================================================================

var EXPORT_ASSET_ROOT  = 'projects/ee-ipam/assets/CCAL/MODULO1/biomes_v2';
var EXPORT_MOSAIC_ROOT = 'projects/ee-ipam/assets/CCAL/MODULO1/brazil_v3';

var START_YEAR    = 2017;   // emissões
var END_YEAR      = 2024;
var SPATIAL_SCALE = 30;

var biomesBound  = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil_old');
var brazilRegion = biomesBound.geometry().bounds();

var EMISSION_TYPES = [
  'emission_fire_co2', 'emission_fire_ch4', 'emission_fire_n2o',  // só Amazônia
  'emission_sl_co2',                                              // só Amazônia
  'emission_def_co2',  'emission_def_ch4',  'emission_def_n2o'    // todos os biomas
];

var BIOME_PREFIXES = ['amz', 'cerr', 'pan', 'pam', 'caa', 'ma'];

var biomeIC = ee.ImageCollection(EXPORT_ASSET_ROOT);

// ===================================================================
//  MOSAICO DE EMISSÕES — tCO2eq/pixel
//  Para cada tipo/ano: soma os biomas via inList + .select + .unmask(0)
//  (evita o null de .first() quando o tipo não existe naquele bioma)
// ===================================================================
function mosaicEmissions() {
  for (var ei = 0; ei < EMISSION_TYPES.length; ei++) {
    var emType = EMISSION_TYPES[ei];

    for (var yi = START_YEAR; yi <= END_YEAR; yi++) {
      var year = yi;

      var ids = BIOME_PREFIXES.map(function(pfx) {
        return pfx + '_' + emType + '_' + year;
      });

      var brazilMosaic = biomeIC
        .filter(ee.Filter.inList('system:index', ids))
        .map(function(img) {
          return img.select('emission_tCO2e_pixel').unmask(0);
        })
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

// ===================================================================
//  MOSAICO DE ESTOQUE — banda 'total' (tC/ha)
//  Inclui o ano-base START_YEAR - 1 (2016)
// ===================================================================
function mosaicStocks() {
  for (var yi = START_YEAR - 1; yi <= END_YEAR; yi++) {
    var year = yi;

    var ids = BIOME_PREFIXES.map(function(pfx) {
      return pfx + '_stock_carbon_' + year;
    });

    var brazilStock = biomeIC
      .filter(ee.Filter.inList('system:index', ids))
      .map(function(img) {
        return img.select('total').unmask(0);
      })
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