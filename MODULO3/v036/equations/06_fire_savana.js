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
 * calcSavannaFireEmissions — CCAL Módulo 3 v036
 *
 * Emissões por fogo em savanas estáveis (fitofisionomias de Cerrado e afins).
 * Aplica modelo baseado em regime de fogo (frequência + tempo desde o fogo).
 *
 * CORREÇÃO v036: saída em tCO₂e/ha (densidade), não total por pixel.
 * A multiplicação por área é feita apenas no toExport_modulo3.js.
 *
 * Entradas (params):
 *   annual_burned   — ee.Image, bandas "burned_area_YYYY"
 *   fire_frequency  — ee.Image, bandas de frequência acumulada de fogo
 *   time_since_fire — ee.Image, bandas de anos desde o último fogo
 *   agb             — ee.Image, banda única "AGB" (tC/ha)
 *   cdw             — ee.Image, banda única "CDW" (tC/ha)
 *   litter          — ee.Image, banda única "LITTER" (tC/ha)
 *   savanna_mask    — ee.Image, bandas "classification_YYYY"
 *                     (1 = pixel estável como savana: desf_reg==2 AND lulc==4)
 *   years           — Array de strings, ex: ["1986", ..., "2024"]
 *
 * Retorna: ee.Image com bandas em tCO₂e/ha (para CO₂) ou g/ha (para não-CO₂):
 *   CO2_tCO2e_ha_YYYY — balanço líquido de CO₂ por fogo (tCO₂e/ha)
 *   CH4_g_ha_YYYY     — combustão CH4 (g/ha)
 *   N2O_g_ha_YYYY     — combustão N2O (g/ha)
 *   CO_g_ha_YYYY      — combustão CO (g/ha)
 *   NOX_g_ha_YYYY     — combustão NOx (g/ha)
 */
exports.calcSavannaFireEmissions = function(params) {

    var annual_burned   = params.annual_burned;
    var fire_frequency  = params.fire_frequency;
    var time_since_fire = params.time_since_fire;
    var agb             = params.agb;
    var cdw             = params.cdw;
    var litter          = params.litter;
    var savanna_mask    = params.savanna_mask;
    var years           = params.years;

    // Fatores de emissão IPCC — savanas (g/kg matéria seca queimada)
    var EF = { CO2: 1613, CO: 65, CH4: 2.3, N2O: 0.21, NOX: 3.9 };

    // Fatores de combustão (fração que realmente queima)
    var combf_fwd = 0.873; // Fine woody debris / litter
    var combf_cwd = 0.331; // Coarse woody debris + AGB

    // Tabela de emissão relativa de CO₂ por regime de fogo (YSF × frequência)
    // Fonte: Tabela QCN/SEEG para savanas brasileiras
    // Dimensões: [frequência 1..n][YSF 0..38]
    // Valor positivo = emissão, negativo = absorção
    var agb_factor_table = [
        // freq=1: primeiro fogo
        [0, 0.1, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01,
         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        // freq=2: segundo fogo (impacto maior)
        [0, 0.12, 0.11, 0.10, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03,
         0.02, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        // freq>=3: fogo recorrente
        [0, 0.15, 0.13, 0.11, 0.09, 0.07, 0.05, 0.03, 0.01,
         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];

    var tsf_values = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
        18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38
    ];

    // Prepara imagens de TSF e frequência alinhadas ao período de anos
    // O TSF do fire collection começa em 1986 (banda 0 = 1986)
    var tsf_edit = annual_burned.multiply(0).slice(1).blend(time_since_fire);

    var CO2_bands = ee.Image().select();
    var CH4_bands = ee.Image().select();
    var N2O_bands = ee.Image().select();
    var CO_bands  = ee.Image().select();
    var NOX_bands = ee.Image().select();

    var prev_agb = agb; // AGB se atualiza ano a ano

    years.forEach(function(year) {

        var fire_year  = annual_burned.select('burned_area_' + year);
        var tsf_year   = tsf_edit.select('burned_area_' + year);
        var freq_year  = fire_frequency.select('burned_area_' + year);
        var mask_year  = savanna_mask.select('classification_' + year);
        var pixel_mask = fire_year.multiply(mask_year);

        // Seleciona fator de emissão pelo regime: freq 1, 2, ≥3
        var factor = tsf_year.remap(tsf_values, agb_factor_table[0]); // freq=1 base
        factor = factor.where(freq_year.gte(2), tsf_year.remap(tsf_values, agb_factor_table[1]));
        factor = factor.where(freq_year.gte(3), tsf_year.remap(tsf_values, agb_factor_table[2]));

        // CO₂ tardio: AGB × fator × 3.67 → tCO₂e/ha (CORREÇÃO v036: sem ×pixel_area)
        var co2_year = prev_agb.multiply(factor).multiply(3.67)
            .multiply(pixel_mask)
            .rename('CO2_tCO2e_ha_' + year)
            .float();

        // Atualiza AGB subtraindo a perda
        prev_agb = prev_agb.subtract(prev_agb.multiply(factor).multiply(pixel_mask).unmask(0));

        // Biomassa combustível (tC/ha)
        var comb_fwd = litter.multiply(combf_fwd);
        var comb_cwd = cdw.add(agb.multiply(0.1)).multiply(combf_cwd); // 10% AGB como CWD superficial
        var comb_total = comb_fwd.add(comb_cwd);

        // Gases não-CO₂: tC/ha × 2000 (kg DM) × EF (g/kg) → g gás/ha
        var ch4_year = comb_total.multiply(2000).multiply(EF.CH4).multiply(pixel_mask).rename('CH4_g_ha_' + year).round().int32();
        var n2o_year = comb_total.multiply(2000).multiply(EF.N2O).multiply(pixel_mask).rename('N2O_g_ha_' + year).round().int32();
        var co_year  = comb_total.multiply(2000).multiply(EF.CO ).multiply(pixel_mask).rename('CO_g_ha_'  + year).round().int32();
        var nox_year = comb_total.multiply(2000).multiply(EF.NOX).multiply(pixel_mask).rename('NOX_g_ha_' + year).round().int32();

        CO2_bands = CO2_bands.addBands(co2_year);
        CH4_bands = CH4_bands.addBands(ch4_year);
        N2O_bands = N2O_bands.addBands(n2o_year);
        CO_bands  = CO_bands.addBands(co_year);
        NOX_bands = NOX_bands.addBands(nox_year);
    });

    return CO2_bands.addBands(CH4_bands).addBands(N2O_bands).addBands(CO_bands).addBands(NOX_bands);
};
