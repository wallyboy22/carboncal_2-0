/** @description Estatisticas de emissao de CO2 e uso/cobertura por Bioma (IBGE 2026)
 *  MapBiomas Fogo / IPAM
 */

var versao = '_2026';
var description = 'csv-monitor-mensal-emissoes-biomas_col11' + versao;
var driverFolder = 'monitoramento-sentinel';

var scale = 30;

// Pixel em hectares
var area_ha = ee.Image.pixelArea().divide(10000);

// Emissoes convertidas para total por pixel
var monitor_emiss = ee.ImageCollection('projects/ee-ipam/assets/MAPBIOMAS/FIRE/MONITOR/FIRE_EMISS/v00')
  .map(function(img){
    return img.multiply(area_ha).float().copyProperties(img);
  });
print('monitor_emiss',monitor_emiss.limit(10))
// LULC Colecao 11 (* 100 para compor com o mes)
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_coverage_v3')
  .multiply(100);

// Proxy para 2026 usando o ultimo ano disponivel da Colecao 11
lulc = lulc.addBands(lulc.slice(-1).rename('classification_2026'));

// Biomas do Brasil (IBGE 2026)
var biomas = ee.FeatureCollection('projects/ee-ipam/assets/ORIGINAIS/IBGE/limite_biomas_IBGE_2026');
print('Biomas:', biomas);

var bounds = biomas.geometry().bounds();
var img_biomas = ee.Image().paint(biomas, 'GEOCODE').rename('bioma');
Map.addLayer(img_biomas.randomVisualizer(), {}, 'Biomas');

// Legenda de Biomas por GEOCODE
var biomas_legend = ee.Dictionary({
  '1': 'Amazônia',
  '2': 'Caatinga',
  '3': 'Cerrado',
  '4': 'Mata Atlântica',
  '5': 'Pampa',
  '6': 'Pantanal'
});

// Legendas auxiliares
var legends = require('users/geomapeamentoipam/MapBiomas__Fogo:00_Tools/Legends.js');

var situation = ee.Dictionary(legends.get('fogo_situation_month')),
    months_legend = ee.Dictionary(legends.get('fogo_months_str')),
    months_int_legend = ee.Dictionary(legends.get('fogo_months_int')),
    niveis = ee.Dictionary(legends.get('lulc_mbc11_niveis')),
    nivel_0 = ee.Dictionary(legends.get('lulc_mbc11_nivel_0')),
    nivel_1 = ee.Dictionary(legends.get('lulc_mbc11_nivel_1')),
    nivel_1_1 = ee.Dictionary(legends.get('lulc_mbc11_nivel_1_1')),
    nivel_2 = ee.Dictionary(legends.get('lulc_mbc11_nivel_2')),
    nivel_3 = ee.Dictionary(legends.get('lulc_mbc11_nivel_3')),
    nivel_4 = ee.Dictionary(legends.get('lulc_mbc11_nivel_4'));

// Converte os grupos da reducao de AREA em FeatureCollection
var convertAreaTable = function (obj) {
  obj = ee.Dictionary(obj);
  var biomeId = obj.getNumber('bioma').int();
  var biomeKey = biomeId.format();

  var classesAndAreas = ee.List(obj.get('groups'));

  var tableRows = classesAndAreas.map(function (classAndArea) {
    classAndArea = ee.Dictionary(classAndArea);

    var rawClass = classAndArea.getNumber('class').int();
    var month = rawClass.mod(100);
    var classId = rawClass.divide(100).int();
    var area_ha_val = classAndArea.getNumber('sum');
    var area_km2_val = area_ha_val.divide(100);

    var id = biomeKey.cat('_').cat(rawClass.format());

    return ee.Feature(null)
      .set('id', id)
      .set('bioma_id', biomeId)
      .set('Bioma', biomas_legend.get(biomeKey))
      .set('class_int', classId)
      .set('Níveis', niveis.get(classId))
      .set('Nível 0', nivel_0.get(classId))
      .set('Nível 1', nivel_1.get(classId))
      .set('Nível 1_1', nivel_1_1.get(classId))
      .set('Nível 2', nivel_2.get(classId))
      .set('Nível 3', nivel_3.get(classId))
      .set('Nível 4', nivel_4.get(classId))
      .set('Área ha', area_ha_val)
      .set('Área km²', area_km2_val)
      .set('Situação', situation.get(month))
      .set('Mês', months_legend.get(month))
      .set('mes', months_int_legend.get(month));
  });

  return ee.FeatureCollection(tableRows);
};

// Converte os grupos da reducao de EMISSOES em FeatureCollection
var convertEmissTable = function (obj) {
  obj = ee.Dictionary(obj);
  var biomeId = obj.getNumber('bioma').int();
  var biomeKey = biomeId.format();
  var classesAndAreas = ee.List(obj.get('groups'));

  var tableRows = classesAndAreas.map(function (classAndArea) {
    classAndArea = ee.Dictionary(classAndArea);

    var rawClass = classAndArea.getNumber('class').int();
    var emiss_val = classAndArea.getNumber('sum');

    var id = biomeKey.cat('_').cat(rawClass.format());

    return ee.Feature(null)
      .set('id', id)
      .set('Emissão CO2', emiss_val);
  });

  return ee.FeatureCollection(tableRows);
};

// Redutor agrupado por bioma e classe
var runReduction = function (valueImage, biomaImage, classImage, convertFn) {
  var reducer = ee.Reducer.sum().group(1, 'class').group(1, 'bioma');
  
  var imageToReduce = valueImage
    .addBands(biomaImage)
    .addBands(classImage.rename('class'));

  var reducedData = imageToReduce.reduceRegion({
    reducer: reducer,
    geometry: bounds,
    scale: scale,
    maxPixels: 1e12
  });

  var groups = ee.List(
    ee.Algorithms.If(reducedData.contains('groups'), reducedData.get('groups'), ee.List([]))
  );

  return ee.FeatureCollection(groups.map(convertFn)).flatten();
};

// Colunas a exportar
var exportSelectors = [
  'Ano', 'id', 'bioma_id', 'Bioma', 'class_int',
  'Níveis', 'Nível 0', 'Nível 1', 'Nível 1_1', 'Nível 2', 'Nível 3', 'Nível 4',
  'Área ha', 'Área km²', 'Emissão CO2', 'Situação', 'Mês', 'mes'
];

// Busca assincrona dos year_month disponiveis
monitor_emiss.aggregate_array('year_month').distinct().sort().evaluate(function(ymList) {
  
  if (!ymList || ymList.length === 0) {
    print('Aviso: Nenhum "year_month" encontrado na coleção monitor_emiss.');
    return;
  }
  
  print('Meses disponíveis no Monitor (year_month):', ymList);

  // Agrupa os meses existentes por ano em JavaScript
  var yearsMap = ymList.reduce(function(acc, ym) {
    var parts = ym.split('_');
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (!acc[y]) acc[y] = [];
    acc[y].push(m);
    return acc;
  }, {});

  print('Mapeamento dinâmico Ano -> Meses:', yearsMap);

  var availableYears = Object.keys(yearsMap).map(Number).sort();

  // Processa apenas os anos e meses reais
  var processYear = function (year) {
    var lulc_year = lulc.select('classification_' + year);
    var existingMonths = yearsMap[year];

    // Inicializa rasters mascarados de 1 banda
    var fire_month = ee.Image(0).selfMask().rename('month');
    var fire_emiss = ee.Image(0).selfMask().rename('emiss');

    existingMonths.forEach(function (month) {
      var ym_str = year + '_' + (month < 10 ? '0' + month : month);

      // Filtra diretamente pela propriedade year_month
      var temp_emiss = monitor_emiss
        .filter(ee.Filter.eq('year_month', ym_str))
        .mosaic();

      var fire_mask = temp_emiss.gt(0);
      temp_emiss = temp_emiss.updateMask(fire_mask);

      var temp_month = ee.Image(month).updateMask(fire_mask);

      fire_month = fire_month.blend(temp_month);
      fire_emiss = fire_emiss.blend(temp_emiss);
    });

    var fire_cover_month = fire_month.add(lulc_year).updateMask(fire_month.mask());
    var fire_area = area_ha.updateMask(fire_month.mask());

    // 1. Reducao de Area
    var areaFC = runReduction(fire_area, img_biomas, fire_cover_month, convertAreaTable);

    // 2. Reducao de Emissao
    var emissFC = runReduction(fire_emiss, img_biomas, fire_cover_month, convertEmissTable);

    // 3. Join por chave composta (bioma_classeMes)
    var filter = ee.Filter.equals({
      leftField: 'id',
      rightField: 'id'
    });

    var join = ee.Join.saveFirst({
      matchKey: 'match_emiss'
    });

    var joinedFC = join.apply(areaFC, emissFC, filter);

    var finalFC = joinedFC.map(function (feat) {
      var emissMatch = ee.Feature(feat.get('match_emiss'));
      var emissVal = ee.Algorithms.If(
        feat.get('match_emiss'),
        emissMatch.get('Emissão CO2'),
        0
      );

      return feat
        .set('Emissão CO2', emissVal)
        .set('Ano', year);
    });

    return finalFC;
  };

  var finalTable = ee.FeatureCollection(availableYears.map(processYear)).flatten();

  print('Amostra de 10 registros:', finalTable.limit(10));

  Export.table.toDrive({
    collection: finalTable,
    description: description,
    folder: driverFolder,
    fileNamePrefix: description,
    fileFormat: 'CSV',
    selectors: exportSelectors
  });
});