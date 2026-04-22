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
 * Emissões por corte seletivo em florestas da Amazônia.
 * Cobertura: Amazônia Legal, 2017–2024.
 *
 * CORREÇÃO v036: Remove o ×3.67 interno da v035.
 * Saída agora em tC/ha (não tCO₂/ha).
 * A conversão para CO₂ é feita no toExport_modulo3.js.
 *
 * Entradas (params):
 *   agb          — ee.Image, banda única "AGB" (tC/ha) — QCN retificada
 *   sl_dis       — ee.Image, bandas "sl_dis_YYYY" ou array de imagens (atividade desordenada MRV REDD+ Pará)
 *   sl_geo       — ee.Image, bandas "sl_geo_YYYY" ou array de imagens (atividade geométrica MRV REDD+ Pará)
 *   forest_mask  — ee.Image, bandas "classification_YYYY" (classe 2 do desf/reg = veg. primária E lulc=3)
 *   amazon_mask  — ee.Image, banda única (1 = dentro da Amazônia)
 *   loss_fraction — Number, fração de AGB perdida por evento (default: 0.196)
 *   years        — Array de Numbers, ex: [2017, 2018, ..., 2024]
 *
 * Retorna: ee.Image
 *   bandas: "logging_tC_ha_YYYY" em tC/ha (float)
 *   Zeros para anos fora do período 2017–2024.
 */
exports.calcLoggingEmissions = function(params) {

    var agb           = params.agb;
    var sl_dis        = params.sl_dis;
    var sl_geo        = params.sl_geo;
    var forest_mask   = params.forest_mask;
    var amazon_mask   = params.amazon_mask;
    var loss_fraction = params.loss_fraction !== undefined ? params.loss_fraction : 0.196;
    var years         = params.years || [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

    var agbUpdated      = agb; // AGB se atualiza a cada ano (efeito acumulativo)
    var result          = ee.Image().select(); // imagem vazia para acumular bandas

    years.forEach(function(year) {

        // Combina as duas fontes de atividade (disordenada + geométrica)
        var dis  = ee.Image('projects/ee-ipam/assets/MRV_REDD_PARA/0_Activity_Year/degradation_' + year + '_sl_disordered').unmask(0);
        var geo  = ee.Image('projects/ee-ipam/assets/MRV_REDD_PARA/0_Activity_Year/degradation_' + year + '_sl_geometric').unmask(0);

        var sl_year = ee.Image(0)
            .where(dis.eq(1), 1)
            .where(geo.eq(1), 1)
            // Restringe à floresta primária estável (Col 10.1) dentro da Amazônia
            .multiply(forest_mask.select('classification_' + year))
            .multiply(amazon_mask)
            .rename('logging_tC_ha_' + year)
            .selfMask();

        // Perda de AGB: fração × AGB atual × máscara de atividade
        // Unidade: tC/ha (SEM ×3.67 — correção v036)
        var logging_carbon_year = agbUpdated.multiply(sl_year).multiply(loss_fraction)
            .rename('logging_tC_ha_' + year)
            .float();

        // Atualiza o AGB subtraindo a perda (efeito cumulativo nos anos seguintes)
        agbUpdated = agbUpdated.subtract(logging_carbon_year.unmask(0));

        result = result.addBands(logging_carbon_year);
    });

    return result;
};
