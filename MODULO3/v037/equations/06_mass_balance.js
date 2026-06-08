/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Balanço de Massa)
 * VERSÃO: v037
 * SCRIPT: 06_mass_balance.js
 * DESCRIÇÃO: Calcula o balanço de massa integrando todas as emissões e remoções.
 *            Atualiza o estoque de carbono dinâmico e calcula desmatamento líquido
 *            evitando dupla contagem com degradação.
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

// Constantes
var TC_TO_TCO2 = 3.67;
var GWP_CH4 = 28;
var GWP_N2O = 265;

/**
 * Calcula balanço de massa e estoque de biomassa dinâmico.
 *
 * @param {Object} params - Parâmetros de entrada
 * @param {ee.Image} params.desf_reg_corrected - Desf/reg corrigido
 * @param {ee.Image} params.biomass_stock_bruto - Estoque bruto (primária + secundária)
 * @param {ee.Image} params.fire_forest_CO2 - CO2 fogo floresta (tCO₂e/ha)
 * @param {ee.Image} params.fire_forest_CH4 - CH4 fogo floresta (tCO₂e/ha)
 * @param {ee.Image} params.fire_forest_N2O - N2O fogo floresta (tCO₂e/ha)
 * @param {ee.Image} params.fire_savanna_CO2 - CO2 fogo savana (tCO₂e/ha)
 * @param {ee.Image} params.fire_savanna_CH4 - CH4 fogo savana (tCO₂e/ha)
 * @param {ee.Image} params.fire_savanna_N2O - N2O fogo savana (tCO₂e/ha)
 * @param {ee.Image} params.fire_grassland_CH4 - CH4 fogo campo (tCO₂e/ha)
 * @param {ee.Image} params.fire_grassland_N2O - N2O fogo campo (tCO₂e/ha)
 * @param {ee.Image} params.logging_forest_CO2 - CO2 corte seletivo (tCO₂e/ha)
 * @param {ee.Image} params.emergent_mask - Máscara de área emersa
 * @param {string[]} params.years_all - Todos os anos (1985-2024)
 * @param {string[]} params.years_fire - Anos de fogo (1986-2024)
 * @returns {Object} - { biomass_stock, loss_fire, loss_logging, loss_deforestation, gain_sec_veg, loss_grassland }
 */
exports.calcMassBalance = function (params) {

    var desf_reg_corrected = params.desf_reg_corrected;
    var biomass_stock_bruto = params.biomass_stock_bruto;
    var fire_forest_CO2 = params.fire_forest_CO2;
    var fire_forest_CH4 = params.fire_forest_CH4;
    var fire_forest_N2O = params.fire_forest_N2O;
    var fire_savanna_CO2 = params.fire_savanna_CO2;
    var fire_savanna_CH4 = params.fire_savanna_CH4;
    var fire_savanna_N2O = params.fire_savanna_N2O;
    var fire_grassland_CH4 = params.fire_grassland_CH4;
    var fire_grassland_N2O = params.fire_grassland_N2O;
    var logging_forest_CO2 = params.logging_forest_CO2;
    var emergent_mask = params.emergent_mask;
    var years_all = params.years_all;
    var years_fire = params.years_fire;

    var pixel_area_ha = ee.Image.pixelArea().divide(10000);

    // Converte emissões de tCO₂e/ha para tC/ha (÷ 3.67) para balanço de massa
    var fire_forest_CO2_tC = fire_forest_CO2.divide(TC_TO_TCO2);
    var fire_savanna_CO2_tC = fire_savanna_CO2.divide(TC_TO_TCO2);
    var logging_CO2_tC = logging_forest_CO2.divide(TC_TO_TCO2);

    var accumulated_degradation = ee.Image(0).rename('dummy');
    var loss_fire_bands = ee.Image().select();
    var loss_logging_bands = ee.Image().select();
    var loss_deforestation_bands = ee.Image().select();
    var gain_sec_veg_bands = ee.Image().select();
    var loss_grassland_bands = ee.Image().select();
    var stock_bands = ee.Image().select();

    var past_stock = biomass_stock_bruto.select(years_all[0]);

    years_fire.forEach(function (y, i) {
        // Dados em tC/ha (convertidos de tCO₂e/ha)
        var f_forest_CO2_tC = fire_forest_CO2_tC.select(y).unmask(0);
        var f_forest_CH4_CO2e = fire_forest_CH4.select(y).unmask(0);
        var f_forest_N2O_CO2e = fire_forest_N2O.select(y).unmask(0);

        var f_savanna_CO2_tC = fire_savanna_CO2_tC.select(y).unmask(0);
        var f_savanna_CH4_CO2e = fire_savanna_CH4.select(y).unmask(0);
        var f_savanna_N2O_CO2e = fire_savanna_N2O.select(y).unmask(0);

        var f_grass_CH4_CO2e = fire_grassland_CH4.select(y).unmask(0);
        var f_grass_N2O_CO2e = fire_grassland_N2O.select(y).unmask(0);

        var logging_tC = (i >= years_fire.indexOf('2017'))
            ? logging_CO2_tC.select(y).unmask(0)
            : ee.Image(0);

        // Balanço de Carbono (para atualizar estoque dinâmico)
        var accum_prev = accumulated_degradation.slice(-1);
        var accum_y = accum_prev
            .subtract(f_forest_CO2_tC)
            .subtract(f_savanna_CO2_tC)
            .subtract(logging_tC)
            .rename('accum_' + y);

        accumulated_degradation = accumulated_degradation.addBands(accum_y);

        var stock_bruto_y = biomass_stock_bruto.select(y);
        var desf_y = desf_reg_corrected.select('classification_' + y);
        var stock_updated_y = stock_bruto_y.where(desf_y.eq(2), stock_bruto_y.add(accum_y.unmask(0))).rename('stock_' + y).float();

        // CÁLCULO DO BALANÇO ANUAL
        // 1. Mudança de estoque bruto no ano (tC/ha)
        var delta_stock_tC = past_stock.subtract(stock_updated_y);

        // 2. Degradação total no ano (tC/ha)
        var degradation_tC_y = f_forest_CO2_tC.add(f_savanna_CO2_tC).add(logging_tC);

        // 3. Desmatamento Líquido (tC/ha -> tCO₂e/pixel)
        var net_deforestation_tC = delta_stock_tC.subtract(degradation_tC_y).max(0);
        var loss_deforestation_y = net_deforestation_tC.multiply(TC_TO_TCO2).multiply(pixel_area_ha);

        // 4. Ganho por Vegetação Secundária (tC/ha -> tCO₂e/pixel)
        var is_sec_veg = desf_y.eq(3).or(desf_y.eq(5));
        var gain_sec_veg_y = delta_stock_tC.min(0).abs().multiply(is_sec_veg).multiply(TC_TO_TCO2).multiply(pixel_area_ha);

        // Bandas de perda (tCO₂e/pixel)
        var fire_forest_total_tCO2e = f_forest_CO2_tC.multiply(TC_TO_TCO2)
            .add(f_forest_CH4_CO2e)
            .add(f_forest_N2O_CO2e);

        var fire_savanna_total_tCO2e = f_savanna_CO2_tC.multiply(TC_TO_TCO2)
            .add(f_savanna_CH4_CO2e)
            .add(f_savanna_N2O_CO2e);

        loss_fire_bands = loss_fire_bands.addBands(
            fire_forest_total_tCO2e.add(fire_savanna_total_tCO2e)
                .multiply(pixel_area_ha).rename('loss_fire_' + y).float()
        );

        loss_grassland_bands = loss_grassland_bands.addBands(
            f_grass_CH4_CO2e.add(f_grass_N2O_CO2e)
                .multiply(pixel_area_ha).rename('loss_grassland_' + y).float()
        );

        loss_logging_bands = loss_logging_bands.addBands(
            logging_tC.multiply(TC_TO_TCO2).multiply(pixel_area_ha).rename('loss_selective_logging_' + y).float()
        );

        loss_deforestation_bands = loss_deforestation_bands.addBands(
            loss_deforestation_y.rename('loss_deforestation_' + y).float()
        );

        gain_sec_veg_bands = gain_sec_veg_bands.addBands(
            gain_sec_veg_y.rename('gain_secondary_vegetation_' + y).float()
        );

        past_stock = stock_updated_y;
        stock_bands = stock_bands.addBands(stock_updated_y);
    });

    return {
        biomass_stock: stock_bands,
        loss_fire: loss_fire_bands,
        loss_logging: loss_logging_bands,
        loss_deforestation: loss_deforestation_bands,
        gain_sec_veg: gain_sec_veg_bands,
        loss_grassland: loss_grassland_bands
    };
};
