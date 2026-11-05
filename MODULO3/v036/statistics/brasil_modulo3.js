/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var geometry = 
    /* color: #d63000 */
    /* shown: false */
    ee.Geometry.Polygon(
        [[[-76.54780555077535, 6.702549891783329],
          [-76.54780555077535, -36.49659065368281],
          [-28.735305550775358, -36.49659065368281],
          [-28.735305550775358, 6.702549891783329]]], null, false);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/**
 * =============================================================================
 * PROJETO: CCAL - Modulo 3 (Estatisticas por Cobertura — Brasil)
 * VERSAO: v036
 * SCRIPT: 05_3_statistics_modulo3.js
 * DESCRICAO: Gera tabela de area (ha) e totais em toneladas de carbono
 *            estocado e gases emitidos, cruzando apenas classes de
 *            desmatamento e vegetacao secundaria (desf_reg_corrected)
 *            para todo o Brasil (sem quebra por territorio).
 *            Exporta CSV para o Google Drive.
 * -----------------------------------------------------------------------------
 * INSTITUICAO: IPAM Amazonia
 * EQUIPE CCAL: Wallace Silva, Barbara Zimbres, Manuela Padilha, Celso Silva Junior,
 *              Camila Silva, Aline Pontes, Edriano Souza, Livia Laureto,
 *              Paulo Moutinho, Ane Alencar
 * ATUALIZACAO: 2026-05-28
 * =============================================================================
 */


// 1. PARAMETROS
var VERSION = 'v036';
var FINAL_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/CCAL_MODULO3-' + VERSION;
var SCALE = 30;
var MAX_PIX = 1e13;

var YEARS_ALL = [
    '1985', '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];
var YEARS_STATS = YEARS_ALL.slice(1);

// 2. DATASETS
var final_image = ee.Image(FINAL_ASSET);
var desf_reg = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var bounds = biomas.geometry().bounds();

// 3. CORRECAO DO DESF_REG
var desf_corrected = ee.Image(YEARS_ALL.reduce(function (acc, year, i) {
    var curr = desf_reg.select('classification_' + year);
    if (i === 0) return curr.rename('classification_' + year);
    var prev = ee.Image(acc).slice(-1);
    return ee.Image(acc).addBands(prev.where(curr.neq(7), curr).rename('classification_' + year));
}, null));

var desf_corrected_bwd = ee.Image(YEARS_ALL.slice().reverse().reduce(function (acc, year, i) {
    var curr = desf_corrected.select('classification_' + year);
    if (i === 0) return curr.rename('classification_' + year);
    var next = ee.Image(acc).slice(0, 1);
    return ee.Image(acc).addBands(next.where(curr.neq(7), curr).rename('classification_' + year));
}, null));

var desf_reg_corrected = desf_corrected.where(desf_corrected.eq(7), desf_corrected_bwd);

// 4. LEGENDAS (sem territorio)
var desf_legends = ee.Dictionary({
    0: 'Não Observado',  
    1: 'Antropico', 2: 'Vegetacao Primaria', 3: 'Vegetacao Secundaria',
    4: 'Supressao de Veg. Primaria', 5: 'Regrowth de Veg. Secundaria',
    6: 'Supressao de Veg. Secundaria', 7: 'Outra Transicao'
});

// 5. PREPARACAO DAS METRICAS
var pixelAreaHa = ee.Image.pixelArea().divide(1e4);
var stock_bands = final_image.select('stock_.*');
var stock_total = stock_bands.multiply(pixelAreaHa);

var pixelTonelada = stock_total.rename(stock_bands.bandNames().map(function (s) {
        return ee.String('tons_stock_').cat(ee.String(s).slice(-4));
    }))
    .addBands(final_image.select('loss_fire_.*').rename(final_image.select('loss_fire_.*').bandNames().map(function (s) {
        return ee.String('tons_loss_fire_').cat(ee.String(s).slice(-4));
    })))
    .addBands(final_image.select('loss_grassland_.*').rename(final_image.select('loss_grassland_.*').bandNames().map(function (s) {
        return ee.String('tons_loss_grassland_').cat(ee.String(s).slice(-4));
    })))
    .addBands(final_image.select('loss_selective_logging_.*').rename(final_image.select('loss_selective_logging_.*').bandNames().map(function (s) {
        return ee.String('tons_loss_selective_logging_').cat(ee.String(s).slice(-4));
    })))
    .addBands(final_image.select('loss_deforestation_.*').rename(final_image.select('loss_deforestation_.*').bandNames().map(function (s) {
        return ee.String('tons_loss_deforestation_').cat(ee.String(s).slice(-4));
    })))
    .addBands(final_image.select('gain_secondary_vegetation_.*').rename(final_image.select('gain_secondary_vegetation_.*').bandNames().map(function (s) {
        return ee.String('tons_gain_secondary_vegetation_').cat(ee.String(s).slice(-4));
    })));

// 6. FUNCAO AUXILIAR (index = classe-ano, sem territorio)
function makeIndex(classe_int, year) {
    return ee.String(classe_int).cat('-').cat(year);
}

// 7. TABELA DE AREA (grupo unico: classe)
var table_area = ee.FeatureCollection(YEARS_STATS.map(function (year) {
    year = ee.String(year);

    var observed = ee.Image.pixelArea().divide(1e4)
        .addBands(desf_reg_corrected.select(ee.String('classification_').cat(year)));

    var groups = observed.reduceRegion({
        reducer: ee.Reducer.sum().group(1, 'classe'),
        geometry: bounds,
        scale: SCALE,
        maxPixels: MAX_PIX
    }).get('groups');

    var fc = ee.FeatureCollection(ee.List(groups).map(function (g) {
        g = ee.Dictionary(g);
        var classe_int = ee.Number(g.get('classe')).int();
        var area_ha = g.getNumber('sum');

        return ee.Feature(null).set({
            'index': makeIndex(classe_int, year),
            'Ano': year,
            'Area ha': area_ha,
            'Cobertura': desf_legends.get(classe_int),
            'Codigo': classe_int
        });
    }));

    return fc;
})).flatten();

var tableFinal = ee.FeatureCollection(table_area);

// 8. LOOP POR METRICA (grupo unico: classe)
var metric_prefixes = [
    'tons_stock', 'tons_loss_fire', 'tons_loss_grassland',
    'tons_loss_selective_logging', 'tons_loss_deforestation',
    'tons_gain_secondary_vegetation'
];

metric_prefixes.forEach(function (prefix) {
    var metricBands = pixelTonelada.select(ee.String(prefix).cat('_.*')).bandNames();

    var table_metric = ee.FeatureCollection(metricBands.map(function (bandname) {
        bandname = ee.String(bandname);
        var year = ee.String(bandname.slice(-4));

        var observed = pixelTonelada.select([bandname])
            .addBands(desf_reg_corrected.select(ee.String('classification_').cat(year)));

        var groups = observed.reduceRegion({
            reducer: ee.Reducer.sum().group(1, 'classe'),
            geometry: bounds,
            scale: SCALE,
            maxPixels: MAX_PIX
        }).get('groups');

        var fc = ee.FeatureCollection(ee.List(groups).map(function (g) {
            g = ee.Dictionary(g);
            var classe_int = ee.Number(g.get('classe')).int();
            var toneladas = g.getNumber('sum');

            return ee.Feature(null).set({
                'index': makeIndex(classe_int, year)
            }).set(prefix, toneladas);
        }));

        return fc;
    })).flatten();

    var join = ee.Join.saveFirst({ matchKey: 'secondary' });
    var filter_join = ee.Filter.equals({ leftField: 'index', rightField: 'index' });
    tableFinal = ee.FeatureCollection(join.apply(tableFinal, table_metric, filter_join)).map(function (f) {
        f = ee.Feature(f);
        var out = ee.Feature(null).copyProperties(f);
        var secondary = ee.Feature(f.get('secondary'));
        return ee.Algorithms.If(secondary, out.copyProperties(secondary), out);
    });
});

// 9. EXPORTAR CSV
Export.table.toDrive({
    collection: tableFinal,
    description: 'WSilva-CCAL_MODULO3_statistics_brasil_' + VERSION,
    fileNamePrefix: 'CCAL_MODULO3_statistics_brasil_' + VERSION,
    fileFormat: 'CSV',
    folder: 'CCAL_MODULO3',
    selectors: ['Ano', 'Codigo', 'Cobertura', 'Area ha'].concat(metric_prefixes)
});

print('Tabela final (previa):', tableFinal.limit(10));
