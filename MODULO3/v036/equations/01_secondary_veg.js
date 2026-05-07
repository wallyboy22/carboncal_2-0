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
 * PROJETO: CCAL - Módulo 3 (Emissões por Mudança de Uso e Degradação)
 * VERSÃO: v036
 * SCRIPT: 01_secondary_veg.js
 * DESCRIÇÃO: Módulo de cálculo para regeneração natural. Estima o incremento anual 
 *            do estoque de carbono em áreas de vegetação secundária, utilizando 
 *            curvas de crescimento diferenciadas por bioma e idade do pixel.
 * -----------------------------------------------------------------------------
 * INSTITUIÇÃO: IPAM Amazônia
 * EQUIPE CCAL: Ane Alencar; Bárbara Zimbres; Camila Silva; Celso Silva-Junior; 
 *              Edriano Souza; Isabel Silva; Lívia Laureto; Manuela Padilha; 
 *              Paulo Moutinho; Rebecca Maranhão; Valderli Piontekowski; Wallace Silva
 * CONTATO: https://ipam.org.br/contato/fale-conosco/
 * ATUALIZAÇÃO: 2026-04-30
 * =============================================================================
 */

exports.calcSecondaryVegIncrement = function (params) {

    var desf_reg = params.desf_reg_corrected;
    var gf = params.grass_forest;
    var total = params.total_carbon;
    var biomas = params.biomas;
    var years = params.years;

    var incr_table = {
        "Amazônia": { "F": { "gte20": 1.1698, "lt20": 4.7841 }, "G": { "gte20": 0, "lt20": 1.7000 } },
        "Caatinga": { "F": { "gte20": 0.5928, "lt20": 2.4378 }, "G": { "gte20": 0, "lt20": 0.6000 } },
        "Cerrado": { "F": { "gte20": 0.9484, "lt20": 3.8789 }, "G": { "gte20": 0, "lt20": 1.7000 } },
        "Mata Atlântica": { "F": { "gte20": 0.7780, "lt20": 3.1690 }, "G": { "gte20": 0, "lt20": 0.6000 } },
        "Pampa": { "F": { "gte20": 0.7340, "lt20": 2.9896 }, "G": { "gte20": 0, "lt20": 1.7000 } },
        "Pantanal": { "F": { "gte20": 0.9622, "lt20": 3.9159 }, "G": { "gte20": 0, "lt20": 1.7000 } }
    };

    var biome_list = ['Amazônia', 'Caatinga', 'Cerrado', 'Mata Atlântica', 'Pampa', 'Pantanal'];
    var biome_images = {};
    biome_list.forEach(function (b) {
        biome_images[b] = ee.Image(0).paint(biomas.filter(ee.Filter.eq('Bioma', b)), 1).eq(1);
    });

    var is_sec_veg = desf_reg.eq(3).or(desf_reg.eq(5));
    var age_stack = ee.Image(0);
    var stock_stack = ee.Image().select();

    years.forEach(function (year, i) {
        var sec_year = is_sec_veg.select('.*_' + year);
        var gf_year = gf.select('.*_' + year);
        var age_prev = age_stack.slice(-1);
        var age_year = age_prev.add(1).multiply(sec_year);
        age_stack = i === 0 ? age_year : age_stack.addBands(age_year);

        var lt20 = age_year.lt(20).and(age_year.gte(0));
        var gte20 = age_year.gte(20);
        var prev_stock = (i === 0) ? ee.Image(0) : stock_stack.slice(-1).unmask();
        var increment_year = ee.Image(0).rename('sec_veg_increment_' + year);
        
        // Se for 1, é campestre. Se não for 1 (pode ser 2 ou 0), assume incremento florestal.
        var is_grass = gf_year.eq(1);
        var is_forest = gf_year.neq(1);
        
        biome_list.forEach(function (b) {
            var bm = biome_images[b];
            var f_lt20 = ee.Image(incr_table[b]['F'].lt20);
            var f_gte20 = ee.Image(incr_table[b]['F'].gte20);
            var g_lt20 = ee.Image(incr_table[b]['G'].lt20);
            var g_gte20 = ee.Image(incr_table[b]['G'].gte20);
            
            var result_biome = prev_stock.rename('sec_veg_increment_' + year)
                .where(is_forest.and(lt20).and(bm), prev_stock.add(f_lt20))
                .where(is_forest.and(gte20).and(bm), prev_stock.add(f_gte20))
                .where(is_grass.and(lt20).and(bm), prev_stock.add(g_lt20))
                .where(is_grass.and(gte20).and(bm), prev_stock.add(g_gte20));

            increment_year = increment_year.where(bm.and(sec_year), result_biome);
        });

        increment_year = increment_year.updateMask(sec_year).where(increment_year.gt(total), total).float();
        stock_stack = stock_stack.addBands(increment_year);
    });

    return stock_stack;
};

///*
// =============================================================================
// ÁREA DE TESTE (DESCOMENTE PARA VALIDAR)
// =============================================================================
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var desf_reg = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');

var years = [
    '1985', '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];

var sec_veg_result = exports.calcSecondaryVegIncrement({
    desf_reg_corrected: desf_reg,
    grass_forest: (function() {
        var out = lulc.multiply(0);
        [3, 4, 11, 12, 13].forEach(function(v, i) {
            out = out.where(lulc.eq(v), [2, 2, 1, 1, 1][i]);
        });
        return out;
    })(),
    total_carbon: qcn.select('TOTAL'),
    biomas: biomas,
    years: years
});

// Parâmetros de Visualização (Ref: v036/02_investigate_modulo3.js)
var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');
var paletaTrans = ["#ffffff", '#faf5d1', '#3f7849', '#5bcf20', '#ea1c1c', '#b4f792', '#fe9934', '#303149'];
var paletaStock = ["#440154", "#46327e", "#365c8d", "#277f8e", "#1fa187", "#4ac16d", "#a0da39", "#fde725"];

// Camadas de Referência (Inputs)
Map.addLayer(lulc, { bands: ['classification_2023'], min: 0, max: 75, palette: paletaMapBiomas }, 'LULC 2023', false);
Map.addLayer(desf_reg, { bands: ['classification_2023'], min: 0, max: 7, palette: paletaTrans }, 'Desf/Reg 2023', false);
Map.addLayer(qcn, { bands: ['TOTAL'], min: 0, max: 250, palette: paletaStock }, 'Carbono QCN (tC/ha)', false);

// Camadas de Saída
Map.addLayer(sec_veg_result.select('sec_veg_increment_.*'), { bands: ['sec_veg_increment_2023'], min: 0, max: 100, palette: ['#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c'] }, 'Estoque Regeneração 2023 (tC/ha)');
Map.addLayer(sec_veg_result, { }, 'Resultado Bruto (Todas Bandas)', false);
//*/
