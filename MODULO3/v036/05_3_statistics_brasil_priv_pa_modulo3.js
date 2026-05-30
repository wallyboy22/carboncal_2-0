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
 * 
 * =============================================================================
 * +New features
 * Vamos ter que realizar os cálculos para o asset projetos privados
 * asset: projects/ee-souza759/assets/CO2_proj_priv/proj_priv_sf_pa_v1
 * WSilva: Acredito que encapsulamos, fazemos os cálculos para cada feature e
 * flatten para juntar por cada uma das features do asset
 * Implementado: E
 *  * ATUALIZACAO: 2026-05-29
 * 
 * =============================================================================
 * 
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
            'index'    : makeIndex(classe_int, year),
            'Ano'      : year,
            'Area ha'  : area_ha,
            'Cobertura': desf_legends.get(classe_int),
            'Codigo'   : classe_int
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

// 9. EXPORTAR CSV — Brasil
Export.table.toDrive({
    collection    : tableFinal,
    description   : 'WSilva-CCAL_MODULO3_statistics_brasil_' + VERSION,
    fileNamePrefix: 'CCAL_MODULO3_statistics_brasil_' + VERSION,
    fileFormat    : 'CSV',
    folder        : 'CCAL_MODULO3',
    selectors     : ['Ano', 'Codigo', 'Cobertura', 'Area ha'].concat(metric_prefixes)
});

print('Tabela final Brasil (previa):', tableFinal.limit(1));

// =============================================================================
// 10. ESTATISTICAS POR PROJETO PRIVADO (v3 — join server-side via ee.Join)
// =============================================================================

var proj_priv = ee.FeatureCollection(
    'projects/ee-souza759/assets/CO2_proj_priv/proj_priv_sf_pa_v1'
);

// Garante que ID_OK seja Int32 no asset (para bater com a imagem rasterizada)
var proj_priv_int = proj_priv.map(function (f) {
    return f.set('ID_OK', ee.Number(f.get('ID_OK')).toInt32());
});

// Rasteriza ID_OK para usar como banda de agrupamento
var proj_priv_id_img = proj_priv_int
    .filter(ee.Filter.notNull(['ID_OK']))
    .reduceToImage(['ID_OK'], ee.Reducer.first())
    .rename('proj_id')
    .toInt32();

// Bounding box cobrindo todos os projetos
var proj_bounds = proj_priv.geometry().bounds();

// ----- Reducer duplo: sum agrupado por classe (banda 1) e proj_id (banda 2) -----
function reduceDouble(valueImg, classeImg) {
    var stacked = valueImg
        .addBands(classeImg.rename('classe'))
        .addBands(proj_priv_id_img);

    var result = stacked.reduceRegion({
        reducer  : ee.Reducer.sum()
                             .group({ groupField: 1, groupName: 'classe' })
                             .group({ groupField: 2, groupName: 'proj_id' }),
        geometry : proj_bounds,
        scale    : SCALE,
        maxPixels: MAX_PIX
    });

    return ee.List(result.get('groups')); // lista de { proj_id, groups: [{classe, sum}] }
}

// ----- Tabela de area -----
var rows_area = ee.FeatureCollection(YEARS_STATS.map(function (year) {
    year = ee.String(year);

    var areaImg   = ee.Image.pixelArea().divide(1e4);
    var classeImg = desf_reg_corrected.select(ee.String('classification_').cat(year));

    var groups_proj = reduceDouble(areaImg, classeImg);

    return ee.FeatureCollection(groups_proj.map(function (gp) {
        gp = ee.Dictionary(gp);
        var proj_id      = ee.Number(gp.get('proj_id')).toInt32();
        var groups_class = ee.List(gp.get('groups'));

        return ee.FeatureCollection(groups_class.map(function (gc) {
            gc = ee.Dictionary(gc);
            var classe_int = ee.Number(gc.get('classe')).int();
            return ee.Feature(null).set({
                'index'    : ee.String(proj_id).cat('-').cat(makeIndex(classe_int, year)),
                'proj_id'  : proj_id,
                'Ano'      : year,
                'Area ha'  : gc.getNumber('sum'),
                'Cobertura': desf_legends.get(classe_int),
                'Codigo'   : classe_int
            });
        }));
    })).flatten();
})).flatten();

var tblFinal_priv = rows_area;

// ----- Loop por metrica -----
metric_prefixes.forEach(function (prefix) {
    var metricBands = pixelTonelada.select(ee.String(prefix).cat('_.*')).bandNames();

    var tbl_metric = ee.FeatureCollection(metricBands.map(function (bandname) {
        bandname = ee.String(bandname);
        var year = ee.String(bandname.slice(-4));

        var valueImg  = pixelTonelada.select([bandname]);
        var classeImg = desf_reg_corrected.select(ee.String('classification_').cat(year));

        var groups_proj = reduceDouble(valueImg, classeImg);

        return ee.FeatureCollection(groups_proj.map(function (gp) {
            gp = ee.Dictionary(gp);
            var proj_id      = ee.Number(gp.get('proj_id')).toInt32();
            var groups_class = ee.List(gp.get('groups'));

            return ee.FeatureCollection(groups_class.map(function (gc) {
                gc = ee.Dictionary(gc);
                var classe_int = ee.Number(gc.get('classe')).int();
                return ee.Feature(null)
                    .set('index', ee.String(proj_id).cat('-').cat(makeIndex(classe_int, year)))
                    .set(prefix, gc.getNumber('sum'));
            }));
        })).flatten();
    })).flatten();

    var join        = ee.Join.saveFirst({ matchKey: 'secondary' });
    var filter_join = ee.Filter.equals({ leftField: 'index', rightField: 'index' });

    tblFinal_priv = ee.FeatureCollection(
        join.apply(tblFinal_priv, tbl_metric, filter_join)
    ).map(function (f) {
        f = ee.Feature(f);
        var out       = ee.Feature(null).copyProperties(f);
        var secondary = ee.Feature(f.get('secondary'));
        return ee.Algorithms.If(secondary, out.copyProperties(secondary), out);
    });
});

// ----- Anexa propriedades do projeto via ee.Join server-side -----
// Prepara proj_priv com ID_OK como string para bater com proj_id das stats
var proj_priv_for_join = proj_priv_int.map(function (f) {
    return f.set('proj_id_join', ee.Number(f.get('ID_OK')).toInt32());
});

// Adiciona proj_id_join nas stats tambem
tblFinal_priv = tblFinal_priv.map(function (f) {
    return ee.Feature(f).set('proj_id_join', ee.Number(ee.Feature(f).get('proj_id')).toInt32());
});

// Join: cada row de stats recebe as propriedades do projeto correspondente
var join_proj   = ee.Join.saveFirst({ matchKey: 'proj_feature' });
var filter_proj = ee.Filter.equals({ leftField: 'proj_id_join', rightField: 'proj_id_join' });

tblFinal_priv = ee.FeatureCollection(
    join_proj.apply(tblFinal_priv, proj_priv_for_join, filter_proj)
).map(function (f) {
    f = ee.Feature(f);
    var out          = ee.Feature(null).copyProperties(f);
    var proj_feature = ee.Feature(f.get('proj_feature'));
    // Copia todas as propriedades do projeto; exclui a chave auxiliar de join
    return out.copyProperties(proj_feature).set('proj_feature', null).set('proj_id_join', null);
});

// ----- Export via evaluate para resolver selectors no cliente -----
proj_priv.first().propertyNames()
    .remove('system:index')
    .evaluate(function (cols) {

        var proj_cols = cols.filter(function (c) {
            return c !== 'ID_OK' && c !== 'Name';
        });

        var base_cols = ['ID_OK', 'Name']
            .concat(proj_cols)
            .concat(['Ano', 'Codigo', 'Cobertura', 'Area ha'])
            .concat(metric_prefixes);

        Export.table.toDrive({
            collection    : tblFinal_priv,
            description   : 'WSilva-CCAL_MODULO3_statistics_projPriv_' + VERSION,
            fileNamePrefix: 'CCAL_MODULO3_statistics_projPriv_' + VERSION,
            fileFormat    : 'CSV',
            folder        : 'CCAL_MODULO3',
            selectors     : base_cols
        });

        print('Tabela Projetos Privados (previa):', tblFinal_priv.limit(10));
    });