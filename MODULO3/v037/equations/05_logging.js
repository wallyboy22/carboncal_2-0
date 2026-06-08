/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Emissões por Mudança de Uso e Degradação)
 * VERSÃO: v037
 * SCRIPT: 05_logging.js
 * DESCRIÇÃO: Módulo de estimativa de degradação por exploração madeireira.
 *            Utiliza cicatrizes de corte seletivo e fatores de dano (MRV REDD+)
 *            para quantificar a redução do estoque de carbono florestal.
 *            Saída em unidades originais: tC/ha.
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
 * Calcula emissões por corte seletivo.
 * Retorna CO2 em tC/ha (unidade original).
 *
 * @param {Object} params - Parâmetros de entrada
 * @param {ee.Image} params.agb - AGB (tC/ha)
 * @param {ee.Image} params.forest_mask - Máscara de floresta
 * @param {ee.Image} params.amazon_mask - Máscara da Amazônia
 * @param {number} params.loss_fraction - Fração de perda (default: 0.196)
 * @param {string[]} params.years - Lista de anos (2017-2024)
 * @returns {ee.Image} - logging_forest_CO2 (tC/ha), bandas: 'CO2_tC_ha_2017'...'CO2_tC_ha_2024'
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
            .selfMask();

        // tC/ha (unidade original, sem conversão)
        var logging_tC = agbUpdated.multiply(sl_year).multiply(loss_fraction)
            .rename('CO2_tC_ha_' + year)
            .float();

        agbUpdated = agbUpdated.subtract(logging_tC.unmask(0));
        result = result.addBands(logging_tC);
    });

    return result;
};
