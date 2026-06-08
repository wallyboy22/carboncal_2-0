/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Emissões por Mudança de Uso e Degradação)
 * VERSÃO: v037
 * SCRIPT: 03_fire_savanna.js
 * DESCRIÇÃO: Algoritmo de emissões por fogo em savanas. Quantifica a queima de
 *            biomassa fina e lenhosa, ajustando os fatores de combustão de acordo
 *            com a recorrência do fogo e acúmulo de combustível vegetal.
 *            Reprodução fiel do modelo SEEG_13 como módulo exportável.
 *            Saídas em unidades originais: CO2 em tC/ha, demais em t/ha.
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
 * Calcula emissões por fogo em savanas.
 * Retorna 6 imagens separadas em unidades originais.
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
 * @returns {Object} - { CO2, CO2_gross, CH4, N2O, CO, NOX } (tC/ha ou t/ha)
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

    // Constantes e fatores
    var agb_to_fwd = 0.26;
    var combustion_fwd = 0.873;
    var combustion_cwd = 0.459;

    // Funções auxiliares (reprodução fiel da v035)
    var reclassifyFireFrequency = function(fire_freq_image) {
        var freq_mean = fire_freq_image.slice(1, 40).selfMask().reduce('mean');
        return freq_mean.multiply(0)
            .where(freq_mean.gte(1).and(freq_mean.lt(3)), 1)
            .where(freq_mean.gte(3).and(freq_mean.lt(5)), 2)
            .where(freq_mean.gte(5).and(freq_mean.lt(7)), 3)
            .where(freq_mean.gte(7), 4);
    };

    var reclassifyTimeSinceFire = function(tsf_image) {
        return tsf_image
            .where(tsf_image.gte(0).and(tsf_image.lt(4)), 4)
            .where(tsf_image.gte(4).and(tsf_image.lt(7)), 3)
            .where(tsf_image.gte(7).and(tsf_image.lt(10)), 2)
            .where(tsf_image.gte(10), 1);
    };

    var calculateEmissionFactors = function(fire_severity) {
        return fire_severity
            .where(fire_severity.gte(2).and(fire_severity.lte(3)), 0.021)
            .where(fire_severity.gt(3).and(fire_severity.lte(6)), -0.004)
            .where(fire_severity.gt(6), -0.02);
    };

    // Processamento principal
    var CO2_mosaic = ee.Image().select();
    var CO2_gross_mosaic = ee.Image().select();
    var CH4_mosaic = ee.Image().select();
    var N2O_mosaic = ee.Image().select();
    var CO_mosaic = ee.Image().select();
    var NOX_mosaic = ee.Image().select();

    var current_agb = agb;
    var current_agb_fwd = agb.multiply(agb_to_fwd);

    var freq_class = reclassifyFireFrequency(fire_frequency);
    var tsf_class = reclassifyTimeSinceFire(time_since_fire);

    years.forEach(function(year) {

        var burned_area = annual_burned.select('.*_' + year);
        var mask = savanna_mask.select('.*_' + year).selfMask();
        var pixel_mask = burned_area.multiply(mask);

        // Severidade: TSF_class + Freq_class (range 2-8)
        var fire_severity = tsf_class.select('.*_' + year).add(freq_class);
        var emission_factors = calculateEmissionFactors(fire_severity);

        // CO2 (AGB loss/gain por severidade) → tC/ha
        var co2_tC_ha = current_agb
            .multiply(pixel_mask)
            .multiply(emission_factors);

        CO2_mosaic = CO2_mosaic.addBands(
            co2_tC_ha.rename('CO2_tC_ha_' + year).float()
        );

        // CO2 gross (combustão bruta) → t/ha
        var comb_total = litter.multiply(combustion_fwd)
            .add(current_agb_fwd.multiply(combustion_fwd))
            .add(cdw.multiply(combustion_cwd));

        var co2_gross_t_ha = comb_total.multiply(pixel_mask).multiply(2000).multiply(1580).divide(1e6);
        CO2_gross_mosaic = CO2_gross_mosaic.addBands(
            co2_gross_t_ha.rename('CO2_gross_t_ha_' + year).float()
        );

        // CH4, N2O, CO, NOX → t/ha via IPCC
        CH4_mosaic = CH4_mosaic.addBands(
            comb_total.multiply(pixel_mask).multiply(2000).multiply(2.3).divide(1e6).rename('CH4_t_ha_' + year).float()
        );
        N2O_mosaic = N2O_mosaic.addBands(
            comb_total.multiply(pixel_mask).multiply(2000).multiply(0.21).divide(1e6).rename('N2O_t_ha_' + year).float()
        );
        CO_mosaic = CO_mosaic.addBands(
            comb_total.multiply(pixel_mask).multiply(2000).multiply(65).divide(1e6).rename('CO_t_ha_' + year).float()
        );
        NOX_mosaic = NOX_mosaic.addBands(
            comb_total.multiply(pixel_mask).multiply(2000).multiply(3.9).divide(1e6).rename('NOX_t_ha_' + year).float()
        );

        // Atualizar AGB (v035: agb.add(...) — pode ganhar ou perder)
        current_agb = current_agb.add(
            current_agb
                .multiply(pixel_mask)
                .multiply(emission_factors)
                .unmask(0)
        );

        current_agb_fwd = current_agb.multiply(agb_to_fwd);
    });

    return {
        CO2: CO2_mosaic,
        CO2_gross: CO2_gross_mosaic,
        CH4: CH4_mosaic,
        N2O: N2O_mosaic,
        CO: CO_mosaic,
        NOX: NOX_mosaic
    };
};
