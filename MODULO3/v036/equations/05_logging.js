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
 * SCRIPT: 05_logging.js
 * DESCRIÇÃO: Módulo de estimativa de degradação por exploração madeireira. 
 *            Utiliza cicatrizes de corte seletivo e fatores de dano (MRV REDD+) 
 *            para quantificar a redução do estoque de carbono florestal.
 * -----------------------------------------------------------------------------
 * INSTITUIÇÃO: IPAM Amazônia
 * EQUIPE CCAL: Ane Alencar; Bárbara Zimbres; Camila Silva; Celso Silva-Junior; 
 *              Edriano Souza; Isabel Silva; Lívia Laureto; Manuela Padilha; 
 *              Paulo Moutinho; Rebecca Maranhão; Valderli Piontekowski; Wallace Silva
 * CONTATO: https://ipam.org.br/contato/fale-conosco/
 * ATUALIZAÇÃO: 2026-04-30
 * =============================================================================
 */

exports.calcLoggingEmissions = function (params) {

    var agb = params.agb;
    var forest_mask = params.forest_mask;
    var amazon_mask = params.amazon_mask;
    var loss_fraction = params.loss_fraction !== undefined ? params.loss_fraction : 0.196;
    var years = params.years;

    var agbUpdated = agb;
    var result = ee.Image().select();

    years.forEach(function (year) {
        var dis = ee.Image('projects/ee-ipam/assets/MRV_REDD_PARA/0_Activity_Year/degradation_' + year + '_sl_disordered').unmask(0);
        var geo = ee.Image('projects/ee-ipam/assets/MRV_REDD_PARA/0_Activity_Year/degradation_' + year + '_sl_geometric').unmask(0);

        var sl_year = ee.Image(0)
            .where(dis.eq(1), 1)
            .where(geo.eq(1), 1)
            .multiply(forest_mask.select('.*_' + year))
            .multiply(amazon_mask)
            .rename('logging_tC_ha_' + year)
            .selfMask();

        var logging_carbon_year = agbUpdated.multiply(sl_year).multiply(loss_fraction)
            .rename('logging_tC_ha_' + year)
            .float();

        agbUpdated = agbUpdated.subtract(logging_carbon_year.unmask(0));
        result = result.addBands(logging_carbon_year);
    });

    return result;
};

///*
// =============================================================================
// ÁREA DE TESTE (DESCOMENTE PARA VALIDAR)
// =============================================================================
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');

var desf_reg = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');

var years = [
    '1985','1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];


// --- 3a. Corrige classe 7 (outras transições) no desf/reg via Forward-Backward
var desf_corrected = ee.Image(years.reduce(function (acc, year, i) {
    var curr = desf_reg.select('classification_' + year);
    if (i === 0) return curr.rename('classification_' + year);
    var prev = ee.Image(acc).slice(-1);
    return ee.Image(acc).addBands(prev.where(curr.neq(7), curr).rename('classification_' + year));
}, null));

var desf_corrected_bwd = ee.Image(years.slice().reverse().reduce(function (acc, year, i) {
    var curr = desf_corrected.select('classification_' + year);
    if (i === 0) return curr.rename('classification_' + year);
    var next = ee.Image(acc).slice(0, 1);
    return ee.Image(acc).addBands(next.where(curr.neq(7), curr).rename('classification_' + year));
}, null));

var desf_reg_corrected = desf_corrected.where(desf_corrected.eq(7), desf_corrected_bwd);

var forest_mask = lulc.multiply(0).where(lulc.eq(3).and(desf_reg_corrected.eq(2)), 1);

var amazon_mask = ee.Image(0).paint(biomas.filter(ee.Filter.eq('Bioma', 'Amazônia')), 1).eq(1);
var years = ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];

var logging_result = exports.calcLoggingEmissions({
    agb: qcn.select('AGB'),
    forest_mask: forest_mask,
    amazon_mask: amazon_mask,
    loss_fraction: 0.196,
    years: years
});

// Parâmetros de Visualização (Ref: v036/02_investigate_modulo3.js)
var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');

// Camadas de Referência (Inputs)
Map.addLayer(lulc, { bands: ['classification_2023'], min: 0, max: 75, palette: paletaMapBiomas }, 'LULC 2023', false);
Map.addLayer(amazon_mask.updateMask(amazon_mask), { palette: ['blue'] }, 'Máscara Amazônia', false);
Map.addLayer(forest_mask.selfMask(), { bands: ['classification_2023'], palette: ['green'] }, 'Máscara Floresta 2023', false);

// Camadas de Saída
Map.addLayer(logging_result, { bands: ['logging_tC_ha_2023'], min: 0, max: 10, palette: ['white', 'brown'] }, 'Corte Seletivo 2023 (tC/ha)');
Map.addLayer(logging_result, { }, 'Resultado Bruto (Todas Bandas)', false);
//*/
