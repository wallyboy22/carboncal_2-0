/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Máscara de Degradação)
 * VERSÃO: v037
 * SCRIPT: 08_degradation_mask.js
 * DESCRIÇÃO: Cria máscara binária de degradação persistente.
 *            Rastreia quais pixels de vegetação primária sofreram degradação
 *            (fogo ou corte seletivo). Uma vez degradado, continua degradado
 *            até desmatamento.
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

/**
 * Cria máscara de degradação persistente.
 *
 * @param {Object} params - Parâmetros de entrada
 * @param {ee.Image} params.fire_forest_CO2 - Emissões CO2 fogo floresta (tCO₂e/ha)
 * @param {ee.Image} params.fire_savanna_CO2 - Emissões CO2 fogo savana (tCO₂e/ha)
 * @param {ee.Image} params.logging_forest_CO2 - Emissões CO2 corte seletivo (tCO₂e/ha)
 * @param {ee.Image} params.vegetation_mask - Máscara de vegetação primária
 * @param {string[]} params.years - Lista de anos
 * @returns {ee.Image} - Máscara binária (0/1), bandas: '1986'...'2024'
 */
exports.createDegradationMask = function (params) {

    var fire_forest_CO2 = params.fire_forest_CO2;
    var fire_savanna_CO2 = params.fire_savanna_CO2;
    var logging_forest_CO2 = params.logging_forest_CO2;
    var vegetation_mask = params.vegetation_mask;
    var years = params.years;

    var mask = ee.Image().select();
    var accumulated = ee.Image(0);

    years.forEach(function (y) {
        // Carrega emissões do ano (unmask 0 se não existir)
        var fire_f_y = fire_forest_CO2.select(y).unmask(0);
        var fire_s_y = fire_savanna_CO2.select(y).unmask(0);
        var log_y = logging_forest_CO2.select(y).unmask(0);
        var veg_y = vegetation_mask.select('.*_' + y);

        // Apenas perdas (valores negativos = degradação)
        // abs() converte para positivo para acumulação
        var loss_f = fire_f_y.lt(0).multiply(fire_f_y.abs());
        var loss_s = fire_s_y.lt(0).multiply(fire_s_y.abs());
        var loss_l = log_y.lt(0).multiply(log_y.abs());

        // Acumula perdas (nunca reseta, persistente)
        accumulated = accumulated.add(loss_f).add(loss_s).add(loss_l);

        // Máscara: acumulado > 0 E ainda é vegetação primária
        var mask_y = accumulated.gt(0).and(veg_y.eq(1)).rename(y);
        mask = mask.addBands(mask_y);
    });

    return mask;
};
