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
 * PROJETO: CCAL - Modulo 3 (Estatisticas por Cobertura e Territorio)
 * VERSAO: v036
 * SCRIPT: 05_statistics_modulo3.js
 * DESCRICAO: Gera tabela de area (ha) e totais em toneladas de carbono
 *            estocado e gases emitidos, cruzando classes de desmatamento
 *            e vegetacao secundaria (desf_reg_corrected) com biomas e UFs.
 *            Exporta CSV para o Google Drive.
 * -----------------------------------------------------------------------------
 * INSTITUICAO: IPAM Amazonia
 * EQUIPE CCAL: Ane Alencar; Barbara Zimbres; Camila Silva; Celso Silva-Junior; 
 *              Edriano Souza; Isabel Silva; Livia Laureto; Manuela Padilha; 
 *              Paulo Moutinho; Rebecca Maranhao; Valderli Piontekowski; Wallace Silva
 * CONTATO: https://ipam.org.br/contato/fale-conosco/
 * ATUALIZACAO: 2026-05-28
 * =============================================================================
 */


// 1. PARAMETROS
var VERSION = 'v036';
var FINAL_ASSET = 'projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO3-' + VERSION;
var SCALE = 30;
var MAX_PIX = 1e13;

var YEARS_ALL = [
    '1985', '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];
var YEARS_STATS = YEARS_ALL.slice(1); // 1986-2024

// 2. DATASETS
var final_image = ee.Image(FINAL_ASSET);
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var desf_reg = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var estados = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/estados-2017')
    .map(function (f) { return f.set({ CD_GEOCUF: ee.Number.parse(f.get('CD_GEOCUF')) }); });

var bounds = biomas.geometry().bounds();

// 3. CORRECAO DO DESF_REG (Forward-Backward fill da classe 7)
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

// 4. TERRITORIO E LEGENDAS
var biomas_img = ee.Image().paint(biomas, 'CD_Bioma');
var estados_img = ee.Image().paint(estados, 'CD_GEOCUF');
var territory_img = biomas_img.add(estados_img.multiply(10));

var biomasClasses = ee.Dictionary({
    0: 'Nao observado', 1: 'Amazonia', 2: 'Caatinga', 3: 'Cerrado',
    4: 'Mata Atlantica', 5: 'Pampa', 6: 'Pantanal'
});

var unidadeFederativaClasses = ee.Dictionary({
    0: 'Nao observado', 11: 'Rondonia', 12: 'Acre', 13: 'Amazonas', 14: 'Roraima',
    15: 'Para', 16: 'Amapa', 17: 'Tocantins', 21: 'Maranhao', 22: 'Piaui',
    23: 'Ceara', 24: 'Rio Grande do Norte', 25: 'Paraiba', 26: 'Pernambuco',
    27: 'Alagoas', 28: 'Sergipe', 29: 'Bahia', 31: 'Minas Gerais',
    32: 'Espirito Santo', 33: 'Rio de Janeiro', 35: 'Sao Paulo', 41: 'Parana',
    42: 'Santa Catarina', 43: 'Rio Grande do Sul', 50: 'Mato Grosso do Sul',
    51: 'Mato Grosso', 52: 'Goias', 53: 'Distrito Federal'
});

var ufClasses = ee.Dictionary({
    0: 'Nao observado', 11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP',
    17: 'TO', 21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL',
    28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC',
    43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'
});

// Legendas do desf_reg (classes 1-7)
var desf_legends = ee.Dictionary({
    0: 'Não Observado',  
    1: 'Antropico',
    2: 'Vegetacao Primaria',
    3: 'Vegetacao Secundaria',
    4: 'Supressao de Veg. Primaria',
    5: 'Regrowth de Veg. Secundaria',
    6: 'Supressao de Veg. Secundaria',
    7: 'Outra Transicao'
});

// 5. PREPARACAO DAS METRICAS (converter stock de tC/ha para tC/pixel)
var pixelAreaHa = ee.Image.pixelArea().divide(1e4);

var stock_bands = final_image.select('stock_.*');
var stock_total = stock_bands.multiply(pixelAreaHa); // tC/ha → tC/pixel

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

print('Metricas disponiveis:', pixelTonelada.bandNames());

// 6. FUNCAO AUXILIAR: index = "classe-territorio-ano"
function makeIndex(classe_int, territory_int, year) {
    return ee.String(classe_int).cat('-').cat(territory_int).cat('-').cat(year);
}

// 7. TABELA DE AREA (todas as linhas)
var table_area = ee.FeatureCollection(YEARS_STATS.map(function (year) {
    year = ee.String(year);

    var observed = ee.Image.pixelArea().divide(1e4)
        .addBands(desf_reg_corrected.select(ee.String('classification_').cat(year)))
        .addBands(territory_img);

    var groups = observed.reduceRegion({
        reducer: ee.Reducer.sum().group(1, 'territory').group(1, 'classe'),
        geometry: bounds,
        scale: SCALE,
        maxPixels: MAX_PIX
    }).get('groups');

    var fc = ee.FeatureCollection(ee.List(groups).map(function (g1) {
        g1 = ee.Dictionary(g1);
        var classe_int = ee.Number(g1.get('classe')).int();

        return ee.FeatureCollection(ee.List(g1.get('groups')).map(function (g2) {
            g2 = ee.Dictionary(g2);
            var territory_int = ee.Number(g2.get('territory')).int();
            var area_ha = g2.getNumber('sum');

            return ee.Feature(null).set({
                'index': makeIndex(classe_int, territory_int, year),
                'Ano': year,
                'Area ha': area_ha,
                'Cobertura': desf_legends.get(classe_int),
                'Codigo': classe_int,
                'Bioma': biomasClasses.get(territory_int.mod(10)),
                'Unidade Federativa': unidadeFederativaClasses.get(territory_int.divide(10).int()),
                'UF': ufClasses.get(territory_int.divide(10).int())
            });
        }));
    })).flatten();

    return fc;
})).flatten();

var tableFinal = ee.FeatureCollection(table_area);

// 8. LOOP POR METRICA: junta totais em toneladas
var metric_prefixes = [
    'tons_stock',
    'tons_loss_fire',
    'tons_loss_grassland',
    'tons_loss_selective_logging',
    'tons_loss_deforestation',
    'tons_gain_secondary_vegetation'
];

metric_prefixes.forEach(function (prefix) {
    var metricBands = pixelTonelada.select(ee.String(prefix).cat('_.*')).bandNames();

    var table_metric = ee.FeatureCollection(metricBands.map(function (bandname) {
        bandname = ee.String(bandname);
        var year = ee.String(bandname.slice(-4));

        var observed = pixelTonelada.select([bandname])
            .addBands(desf_reg_corrected.select(ee.String('classification_').cat(year)))
            .addBands(territory_img);

        var groups = observed.reduceRegion({
            reducer: ee.Reducer.sum().group(1, 'territory').group(1, 'classe'),
            geometry: bounds,
            scale: SCALE,
            maxPixels: MAX_PIX
        }).get('groups');

        var fc = ee.FeatureCollection(ee.List(groups).map(function (g1) {
            g1 = ee.Dictionary(g1);
            var classe_int = ee.Number(g1.get('classe')).int();

            return ee.FeatureCollection(ee.List(g1.get('groups')).map(function (g2) {
                g2 = ee.Dictionary(g2);
                var territory_int = ee.Number(g2.get('territory')).int();
                var toneladas = g2.getNumber('sum');

                return ee.Feature(null).set({
                    'index': makeIndex(classe_int, territory_int, year)
                }).set(prefix, toneladas);
            }));
        })).flatten();

        return fc;
    })).flatten();

    // Join com tabela de area
    var join = ee.Join.saveFirst({ matchKey: 'secondary' });
    var filter_join = ee.Filter.equals({ leftField: 'index', rightField: 'index' });
    var joined = join.apply(tableFinal, table_metric, filter_join);

    tableFinal = ee.FeatureCollection(joined).map(function (f) {
        f = ee.Feature(f);
        var out = ee.Feature(null).copyProperties(f);
        var secondary = ee.Feature(f.get('secondary'));
        return ee.Algorithms.If(secondary, out.copyProperties(secondary), out);
    });
});

// 9. EXPORTAR CSV
var selectors = ['Ano', 'Codigo', 'Cobertura', 'Bioma', 'UF', 'Unidade Federativa', 'Area ha'].concat(metric_prefixes);

Export.table.toDrive({
    collection: tableFinal,
    description: 'WSilva-CCAL_MODULO3_statistics_' + VERSION,
    fileNamePrefix: 'CCAL_MODULO3_statistics_' + VERSION,
    fileFormat: 'CSV',
    folder: 'CCAL_MODULO3',
    selectors: selectors
});

// 10. VISUALIZACAO RAPIDA
Map.addLayer(final_image.select('stock_2023'), { min: 0, max: 250, palette: ['#440154', '#46327e', '#365c8d', '#277f8e', '#1fa187', '#4ac16d', '#a0da39', '#fde725'] }, 'Estoque 2023 (tC/ha)', false);
Map.addLayer(final_image.select('loss_fire_2023'), { min: 0, max: 50, palette: ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'] }, 'Emissao Fogo 2023 (tCO2e/pixel)', false);
Map.addLayer(desf_reg_corrected.select('classification_2023'), { min: 1, max: 7, palette: ['#ffffff', '#faf5d1', '#3f7849', '#5bcf20', '#ea1c1c', '#b4f792', '#fe9934', '#303149'] }, 'Desf/Reg Corrigido 2023', false);

print('Tabela final (previa):', tableFinal.limit(10));
print('Colunas exportadas:', selectors);
