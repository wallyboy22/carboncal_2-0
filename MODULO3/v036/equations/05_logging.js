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
 * calcLoggingEmissions — CCAL Módulo 3 v036 (05)
 *
 * Calcula a perda de estoque de carbono por corte seletivo na Amazônia
 * baseado em alertas do DETER e frações de perda (MRV REDD+).
 */

exports.calcLoggingEmissions = function (params) {

    var agb = params.agb;
    var forest_mask = params.forest_mask;
    var amazon_mask = params.amazon_mask;
    var loss_fraction = params.loss_fraction !== undefined ? params.loss_fraction : 0.196;
    var years = params.years || [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

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
