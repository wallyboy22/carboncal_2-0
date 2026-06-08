/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Emissões por Mudança de Uso e Degradação)
 * VERSÃO: v037
 * SCRIPT: 02_fire_forest.js
 * DESCRIÇÃO: Motor de cálculo para degradação por fogo em formações florestais.
 *            Implementa o modelo FATE para estimar a mortalidade de árvores e a
 *            liberação gradual de carbono e gases de efeito estufa.
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
 * Calcula emissões por fogo em florestas (modelo FATE).
 * Retorna 6 imagens separadas em unidades originais.
 *
 * @param {Object} params - Parâmetros de entrada
 * @param {ee.Image} params.annual_burned - Área queimada anual
 * @param {ee.Image} params.fire_frequency - Frequência de fogo
 * @param {ee.Image} params.time_since_fire - Tempo desde fogo
 * @param {ee.Image} params.agb - AGB (tC/ha)
 * @param {ee.Image} params.cdw - CDW (tC/ha)
 * @param {ee.Image} params.litter - Litter (tC/ha)
 * @param {ee.Image} params.forest_mask - Máscara de floresta
 * @param {ee.FeatureCollection} params.biomas - Biomas IBGE
 * @param {string[]} params.years - Lista de anos
 * @returns {Object} - { CO2, CO2_gross, CH4, N2O, CO, NOX } (tC/ha ou t/ha)
 */
exports.calcForestFireEmissions = function (params) {

    var annual_burned = params.annual_burned;
    var fire_frequency = params.fire_frequency;
    var time_since_fire = params.time_since_fire;
    var agb = params.agb; var cdw = params.cdw; var litter = params.litter;
    var forest_mask = params.forest_mask; var biomas = params.biomas; var years = params.years;

    var BIOME_DICT = {
        'Amazônia': {
            AGBloss_lookup: [0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011, 0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            turnover: 0.03, decomp: 0.19, fwd_combf: 0.683, cwd_combf_s: 0.643, cwd_combf_m: 0.824, cwd_part_m: 0.757
        },
        'Caatinga': {
            AGBloss_lookup: [0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011, 0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            turnover: 0.03, decomp: 0.19, fwd_combf: 0.983, cwd_combf_s: 0.719, cwd_combf_m: 0.824, cwd_part_m: 0.757
        },
        'Cerrado': {
            AGBloss_lookup: [0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011, 0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            turnover: 0.03, decomp: 0.19, fwd_combf: 0.683, cwd_combf_s: 0.629, cwd_combf_m: 0.824, cwd_part_m: 0.757
        },
        'Mata Atlântica': {
            AGBloss_lookup: [0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011, 0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            turnover: 0.03, decomp: 0.19, fwd_combf: 0.683, cwd_combf_s: 0.643, cwd_combf_m: 0.824, cwd_part_m: 0.757
        },
        'Pampa': {
            AGBloss_lookup: [0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011, 0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            turnover: 0.03, decomp: 0.19, fwd_combf: 0.683, cwd_combf_s: 0.629, cwd_combf_m: 0.824, cwd_part_m: 0.757
        },
        'Pantanal': {
            AGBloss_lookup: [0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011, 0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            turnover: 0.03, decomp: 0.19, fwd_combf: 0.683, cwd_combf_s: 0.629, cwd_combf_m: 0.824, cwd_part_m: 0.757
        }
    };

    var tsf_values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38];
    var annual_fire_freq_gte2 = annual_burned.updateMask(fire_frequency.gte(2)).gte(1);
    var tsf_edit = annual_burned.multiply(0).slice(1).blend(time_since_fire);

    var firstBiome = true;

    Object.keys(BIOME_DICT).forEach(function (biome_str) {
        var p = BIOME_DICT[biome_str];
        var biome_mask = ee.Image(0).paint(biomas.filter(ee.Filter.eq('Bioma', biome_str)), 1).eq(1);
        var first = ee.Image(0).rename('fLeftAGB_1985').addBands(ee.Image(0).rename('fLeftAGN_1985'));

        var data = ee.Image(ee.List(years).iterate(function (year, previous_year) {
            year = ee.Number.parse(year);
            var year_prev = year.subtract(1);
            var year_str = year.format('%d');
            var prev_str = year_prev.format('%d');

            var tsf_y = tsf_edit.select(ee.String('.*_').cat(year_str));
            var freq_gte2_y = annual_fire_freq_gte2.select(ee.String('.*_').cat(year_str));

            var aRef_loss = tsf_y.remap(tsf_values, p.AGBloss_lookup).multiply(-1);
            var aRef_gain = tsf_y.remap(tsf_values, p.AGBloss_lookup);

            var fLeftAGB_prev = ee.Image(previous_year).select(ee.String('fLeftAGB_').cat(prev_str));
            var agb_update = agb.updateMask(tsf_y.eq(0)).blend(fLeftAGB_prev);
            var fNetAGBloss = agb_update.multiply(aRef_loss);
            var fLeftAGB = agb_update.add(fNetAGBloss);

            var fAGNinput = agb_update.multiply(aRef_gain).add(agb_update.multiply(p.turnover));
            var agn_prev = ee.Image(previous_year).select(ee.String('fLeftAGN_').cat(prev_str));
            var agn_update = litter.add(cdw).updateMask(tsf_y.eq(0)).blend(agn_prev);

            var fAGNcomb = ee.Image(0)
                .blend(litter.multiply(p.fwd_combf).updateMask(tsf_y.eq(0)))
                .add(ee.Image(0).blend(cdw.multiply(p.cwd_combf_s).updateMask(tsf_y.eq(0))));

            fAGNcomb = fAGNcomb.blend(
                ee.Image(0).blend(agn_update.multiply(1 - p.cwd_part_m).multiply(p.fwd_combf).updateMask(freq_gte2_y))
                    .add(ee.Image(0).blend(agn_update.multiply(p.cwd_part_m).multiply(p.cwd_combf_m).updateMask(freq_gte2_y)))
            );

            var fLeftAGN = agn_update.add(fAGNinput).subtract(fAGNcomb).multiply(1 - p.decomp);
            var fCBalance = fLeftAGB.subtract(agb_update).add(fLeftAGN.subtract(agn_update)).rename(ee.String('fCBalance_').cat(year_str));

            return ee.Image(previous_year)
                .addBands(fLeftAGB.rename(ee.String('fLeftAGB_').cat(year_str)))
                .addBands(fLeftAGN.rename(ee.String('fLeftAGN_').cat(year_str)))
                .addBands(fAGNcomb.rename(ee.String('fAGNcomb_').cat(year_str)))
                .addBands(fCBalance);
        }, first)).float().updateMask(biome_mask);

        var fAGNcomb_b = data.select('fAGNcomb_.*');
        var fCBalance_b = data.select('fCBalance_.*');

        // CO2 balanço líquido: (comb × 0.099 + balanço) × (−1) → tC/ha
        var CO2_y = fAGNcomb_b.multiply(0.099).add(fCBalance_b).multiply(-1)
            .rename(years.map(function (y) { return 'CO2_tC_ha_' + y; }));

        // CO2 combustão bruta: comb × 2000 × 1580 / 1e6 → t CO2/ha
        var CO2_gross_y = fAGNcomb_b.multiply(2000).multiply(1580).divide(1e6)
            .rename(years.map(function (y) { return 'CO2_gross_t_ha_' + y; }));

        // CO: comb × 2000 × 104 / 1e6 → t CO/ha
        var CO_y = fAGNcomb_b.multiply(2000).multiply(104).divide(1e6)
            .rename(years.map(function (y) { return 'CO_t_ha_' + y; }));

        // CH4: comb × 2000 × 6.8 / 1e6 → t CH4/ha
        var CH4_y = fAGNcomb_b.multiply(2000).multiply(6.8).divide(1e6)
            .rename(years.map(function (y) { return 'CH4_t_ha_' + y; }));

        // N2O: comb × 2000 × 0.2 / 1e6 → t N2O/ha
        var N2O_y = fAGNcomb_b.multiply(2000).multiply(0.2).divide(1e6)
            .rename(years.map(function (y) { return 'N2O_t_ha_' + y; }));

        // NOX: comb × 2000 × 1.6 / 1e6 → t NOX/ha
        var NOX_y = fAGNcomb_b.multiply(2000).multiply(1.6).divide(1e6)
            .rename(years.map(function (y) { return 'NOX_t_ha_' + y; }));

        // Primeiro bioma: atribui diretamente (blend nao aceita 0 bandas)
        // Biomas seguintes: blend para preencher apenas pixels do bioma
        if (firstBiome) {
            CO2_mosaic = CO2_y;
            CO2_gross_mosaic = CO2_gross_y;
            CH4_mosaic = CH4_y;
            N2O_mosaic = N2O_y;
            CO_mosaic = CO_y;
            NOX_mosaic = NOX_y;
            firstBiome = false;
        } else {
            CO2_mosaic = CO2_mosaic.blend(CO2_y);
            CO2_gross_mosaic = CO2_gross_mosaic.blend(CO2_gross_y);
            CH4_mosaic = CH4_mosaic.blend(CH4_y);
            N2O_mosaic = N2O_mosaic.blend(N2O_y);
            CO_mosaic = CO_mosaic.blend(CO_y);
            NOX_mosaic = NOX_mosaic.blend(NOX_y);
        }
    });

    // Aplicar máscara de floresta estável
    var fmask = forest_mask.slice(1);

    return {
        CO2: CO2_mosaic.updateMask(fmask),
        CO2_gross: CO2_gross_mosaic.updateMask(fmask),
        CH4: CH4_mosaic.updateMask(fmask),
        N2O: N2O_mosaic.updateMask(fmask),
        CO: CO_mosaic.updateMask(fmask),
        NOX: NOX_mosaic.updateMask(fmask)
    };
};
