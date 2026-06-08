/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Emissões por Mudança de Uso e Degradação)
 * VERSÃO: v037
 * SCRIPT: 03_fire_savanna.js
 * DESCRIÇÃO: Algoritmo de emissões por fogo em savanas e campos. Quantifica a 
 *            queima de biomassa fina e lenhosa, ajustando os fatores de combustão 
 *            de acordo com a recorrência do fogo e acúmulo de combustível vegetal.
 *            Retorna 3 imagens separadas (CO2, CH4, N2O) em tCO₂e/ha.
 * -----------------------------------------------------------------------------
 * INSTITUIÇÃO: IPAM Amazônia
 * EQUIPE CCAL: Ane Alencar; Bárbara Zimbres; Camila Silva; Celso Silva-Junior; 
 *              Edriano Souza; Isabel Silva; Lívia Laureto; Manuela Padilha; 
 *              Paulo Moutinho; Rebecca Maranhão; Valderli Piontekowski; Wallace Silva;
 *              Jarlene Gomes; Julia Shimbo
 * CONTATO: https://ipam.org.br/contato/fale-conosco/
 * ATUALIZAÇÃO: 2026-06-08
 * =============================================================================
 */

// Constantes de conversão
var TC_TO_TCO2 = 3.67;
var GWP_CH4 = 28;
var GWP_N2O = 265;

/**
 * Calcula emissões por fogo em savanas.
 * Retorna 3 imagens separadas: CO2, CH4, N2O (todas em tCO₂e/ha).
 *
 * @param {Object} params - Parâmetros de entrada
 * @param {ee.Image} params.annual_burned - Área queimada anual
 * @param {ee.Image} params.fire_frequency - Frequência de fogo
 * @param {ee.Image} params.time_since_fire - Tempo desde fogo
 * @param {ee.Image} params.agb - AGB (tC/ha)
 * @param {ee.Image} params.cdw - CDW (tC/ha)
 * @param {ee.Image} params.litter - Litter (tC/ha)
 * @param {ee.Image} params.savanna_mask - Máscara de savana
 * @param {string[]} params.years - Lista de anos
 * @returns {Object} - { CO2: ee.Image, CH4: ee.Image, N2O: ee.Image } (tCO₂e/ha)
 */
exports.calcSavannaFireEmissions = function (params) {

    var annual_burned = params.annual_burned;
    var fire_frequency = params.fire_frequency;
    var time_since_fire = params.time_since_fire;
    var agb = params.agb;
    var cdw = params.cdw;
    var litter = params.litter;
    var savanna_mask = params.savanna_mask;
    var years = params.years;

    // Fatores de combustão
    var combf_fwd = 0.873;
    var combf_cwd = 0.331;

    // Tabela de emissão relativa de CO₂ por regime de fogo
    var agb_factor_table = [
        [0, 0.10, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0.12, 0.11, 0.10, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0.15, 0.13, 0.11, 0.09, 0.07, 0.05, 0.03, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];

    var tsf_values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38];
    var tsf_edit = annual_burned.multiply(0).slice(1).blend(time_since_fire);

    var CO2_mosaic = ee.Image().select();
    var CH4_mosaic = ee.Image().select();
    var N2O_mosaic = ee.Image().select();

    var prev_agb = agb;

    years.forEach(function (year) {
        var fire_year = annual_burned.select('.*_' + year);
        var tsf_year = tsf_edit.select('.*_' + year);
        var freq_year = fire_frequency.select('.*_' + year);
        var mask_year = savanna_mask.select('.*_' + year);
        var pixel_mask = fire_year.multiply(mask_year);

        var factor = tsf_year.remap(tsf_values, agb_factor_table[0]);
        factor = factor.where(freq_year.gte(2), tsf_year.remap(tsf_values, agb_factor_table[1]));
        factor = factor.where(freq_year.gte(3), tsf_year.remap(tsf_values, agb_factor_table[2]));

        // CO2: tC/ha → tCO₂e/ha (× 3.67)
        var co2_tC = prev_agb.multiply(factor).multiply(pixel_mask);
        var co2_CO2e = co2_tC.multiply(TC_TO_TCO2).rename(year);
        prev_agb = prev_agb.subtract(co2_tC.unmask(0));

        // CH4 e N2O: t/ha → tCO₂e/ha
        var comb_fwd = litter.multiply(combf_fwd);
        var comb_cwd = cdw.add(agb.multiply(0.1)).multiply(combf_cwd);
        var comb_total = comb_fwd.add(comb_cwd);

        var ch4_t = comb_total.multiply(2000).multiply(2.3).divide(1e6).multiply(pixel_mask);
        var ch4_CO2e = ch4_t.multiply(GWP_CH4).rename(year);

        var n2o_t = comb_total.multiply(2000).multiply(0.21).divide(1e6).multiply(pixel_mask);
        var n2o_CO2e = n2o_t.multiply(GWP_N2O).rename(year);

        CO2_mosaic = CO2_mosaic.addBands(co2_CO2e);
        CH4_mosaic = CH4_mosaic.addBands(ch4_CO2e);
        N2O_mosaic = N2O_mosaic.addBands(n2o_CO2e);
    });

    return {
        CO2: CO2_mosaic,
        CH4: CH4_mosaic,
        N2O: N2O_mosaic
    };
};
