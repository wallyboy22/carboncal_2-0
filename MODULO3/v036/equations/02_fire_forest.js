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
 * calcForestFireEmissions — Modelo FATE v2-1 — CCAL Módulo 3 v036 (02)
 *
 * Emissões por fogo em florestas primárias estáveis.
 * Modelo integrado: combustão + mortalidade + decomposição + regeneração.
 *
 * MUDANÇAS v036 vs referência (fire_forest_emissions.js):
 *   - CO₂ retorna em tC/ha (remove ×3.67 final) — conversão feita no integrador
 *   - Usa forest_mask (Col 10.1 classe 2 AND lulc==3) em vez do SEEG mask_stable
 *   - Retorna mosaic de todos os biomas em uma única ee.Image
 *   - Sem Export.* ou Map.addLayer
 *
 * Entradas (params):
 *   annual_burned   — ee.Image, bandas "burned_area_YYYY" (selfMask aplicado)
 *   fire_frequency  — ee.Image, bandas "burned_area_YYYY" (frequência acumulada)
 *   time_since_fire — ee.Image, bandas "burned_area_YYYY" (anos desde último fogo)
 *   agb             — ee.Image, banda única "AGB" (tC/ha) — QCN retificada
 *   cdw             — ee.Image, banda única "CDW" (tC/ha)
 *   litter          — ee.Image, banda única "LITTER" (tC/ha)
 *   forest_mask     — ee.Image, bandas "classification_YYYY"
 *                     (1 = floresta primária estável: desf_reg==2 AND lulc==3)
 *   biomas          — ee.FeatureCollection (biomas_IBGE_250mil)
 *   years           — Array de strings, ex: ["1986", ..., "2024"]
 *
 * Retorna: ee.Image com bandas:
 *   CO2_tC_ha_YYYY  — balanço líquido de C por fogo (tC/ha, negativo=emissão)
 *   CH4_g_ha_YYYY   — combustão CH4 (g/ha)
 *   N2O_g_ha_YYYY   — combustão N2O (g/ha)
 *   CO_g_ha_YYYY    — combustão CO (g/ha)
 *   NOX_g_ha_YYYY   — combustão NOx (g/ha)
 */
exports.calcForestFireEmissions = function(params) {

    var annual_burned   = params.annual_burned;
    var fire_frequency  = params.fire_frequency;
    var time_since_fire = params.time_since_fire;
    var agb             = params.agb;
    var cdw             = params.cdw;
    var litter          = params.litter;
    var forest_mask     = params.forest_mask;
    var biomas          = params.biomas;
    var years           = params.years;

    // Parâmetros do modelo FATE por bioma
    var BIOME_DICT = {
        'Amazônia':      { AGBloss_lookup: [0,0.104,0.080,0.060,0.044,0.032,0.023,0.016,0.011,0.008,0.006,0.004,0.003,0.002,0.001,0.001,0.001,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], turnover:0.03, decomp:0.19, fwd_combf:0.683, cwd_combf_s:0.643, cwd_combf_m:0.824, cwd_part_m:0.757 },
        'Caatinga':      { AGBloss_lookup: [0,0.104,0.080,0.060,0.044,0.032,0.023,0.016,0.011,0.008,0.006,0.004,0.003,0.002,0.001,0.001,0.001,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], turnover:0.03, decomp:0.19, fwd_combf:0.983, cwd_combf_s:0.719, cwd_combf_m:0.824, cwd_part_m:0.757 },
        'Cerrado':       { AGBloss_lookup: [0,0.104,0.080,0.060,0.044,0.032,0.023,0.016,0.011,0.008,0.006,0.004,0.003,0.002,0.001,0.001,0.001,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], turnover:0.03, decomp:0.19, fwd_combf:0.683, cwd_combf_s:0.629, cwd_combf_m:0.824, cwd_part_m:0.757 },
        'Mata Atlântica':{ AGBloss_lookup: [0,0.104,0.080,0.060,0.044,0.032,0.023,0.016,0.011,0.008,0.006,0.004,0.003,0.002,0.001,0.001,0.001,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], turnover:0.03, decomp:0.19, fwd_combf:0.683, cwd_combf_s:0.643, cwd_combf_m:0.824, cwd_part_m:0.757 },
        'Pampa':         { AGBloss_lookup: [0,0.104,0.080,0.060,0.044,0.032,0.023,0.016,0.011,0.008,0.006,0.004,0.003,0.002,0.001,0.001,0.001,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], turnover:0.03, decomp:0.19, fwd_combf:0.683, cwd_combf_s:0.629, cwd_combf_m:0.824, cwd_part_m:0.757 },
        'Pantanal':      { AGBloss_lookup: [0,0.104,0.080,0.060,0.044,0.032,0.023,0.016,0.011,0.008,0.006,0.004,0.003,0.002,0.001,0.001,0.001,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], turnover:0.03, decomp:0.19, fwd_combf:0.683, cwd_combf_s:0.629, cwd_combf_m:0.824, cwd_part_m:0.757 }
    };

    var tsf_values = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38];

    // Frequência ≥2: pixels com múltiplos fogos
    var annual_fire_freq_gte2 = annual_burned.updateMask(fire_frequency.gte(2)).gte(1);

    // TSF editado: zera o primeiro ano de fogo (base para o modelo)
    var tsf_edit = annual_burned.multiply(0).slice(1).blend(time_since_fire);

    // Mosaico final de saída (1 por bioma, unido no final)
    var CO2_mosaic = ee.Image().select();
    var CH4_mosaic = ee.Image().select();
    var N2O_mosaic = ee.Image().select();
    var CO_mosaic  = ee.Image().select();
    var NOX_mosaic = ee.Image().select();

    Object.keys(BIOME_DICT).forEach(function(biome_str) {

        var p           = BIOME_DICT[biome_str];
        var biome_geom  = biomas.filter(ee.Filter.inList('Bioma', [biome_str]));
        var biome_mask  = ee.Image(1).paint(biome_geom).neq(1);

        // Modelo FATE — iteração por ano via ee.List.iterate
        var first = ee.Image().rename('fLeftAGB_1985').addBands(ee.Image().rename('fLeftAGN_1985'));

        var data = ee.Image(ee.List(years).iterate(function(year, previous_year) {

            year            = ee.Number.parse(year);
            var year_prev   = year.subtract(1);
            var year_str    = year.format('%d');
            var prev_str    = year_prev.format('%d');

            var tsf_y   = tsf_edit.select(ee.String('burned_area_').cat(year_str));
            var freq_gte2_y = annual_fire_freq_gte2.select(ee.String('burned_area_').cat(year_str));
            var mask_y  = forest_mask.select(ee.String('classification_').cat(year_str));

            var aRef_loss = tsf_y.remap(tsf_values, p.AGBloss_lookup).multiply(-1)
                .rename(ee.String('aRef_netAGBloss_').cat(year_str));
            var aRef_gain = tsf_y.remap(tsf_values, p.AGBloss_lookup)
                .rename(ee.String('aRef_netAGNgain_').cat(year_str));

            var fLeftAGB_prev = ee.Image(previous_year).select(ee.String('fLeftAGB_').cat(prev_str));
            var agb_update    = agb.updateMask(tsf_y.eq(0)).blend(fLeftAGB_prev)
                .rename(ee.String('s_inAGBstock_update_').cat(year_str));

            var fNetAGBloss = agb_update.multiply(aRef_loss).rename(ee.String('fNetAGBloss_').cat(year_str));
            var fLeftAGB    = agb_update.add(fNetAGBloss).rename(ee.String('fLeftAGB_').cat(year_str));

            var fAGNinput = agb_update.multiply(aRef_gain).add(agb_update.multiply(p.turnover))
                .rename(ee.String('fAGNinput_').cat(year_str));

            // Necromassa: combustão (single vs multi)
            var fAGN_s   = litter.add(cdw);
            var agn_prev = ee.Image(previous_year).select(ee.String('fLeftAGN_').cat(prev_str));
            var agn_update = fAGN_s.updateMask(tsf_y.eq(0)).blend(agn_prev)
                .rename(ee.String('s_inAGNstock_update_').cat(year_str));

            var comb_fwd_s = litter.multiply(p.fwd_combf).updateMask(tsf_y.eq(0));
            var comb_cwd_s = cdw.multiply(p.cwd_combf_s).updateMask(tsf_y.eq(0));
            var fAGNcomb   = ee.Image(0).blend(comb_fwd_s).add(ee.Image(0).blend(comb_cwd_s));

            var comb_fwd_m = agn_update.multiply(1 - p.cwd_part_m).multiply(p.fwd_combf).updateMask(freq_gte2_y);
            var comb_cwd_m = agn_update.multiply(p.cwd_part_m).multiply(p.cwd_combf_m).updateMask(freq_gte2_y);
            fAGNcomb = fAGNcomb.blend(ee.Image(0).blend(comb_fwd_m).add(ee.Image(0).blend(comb_cwd_m)))
                .rename(ee.String('fAGNcomb_').cat(year_str));

            var fLeftAGN  = agn_update.add(fAGNinput).subtract(fAGNcomb).multiply(1 - p.decomp)
                .rename(ee.String('fLeftAGN_').cat(year_str));
            var fAGNdecomp = agn_update.add(fAGNinput).subtract(fAGNcomb).multiply(p.decomp)
                .rename(ee.String('fAGNdecomp_').cat(year_str));

            // Balanço líquido de C: negativo = emissão líquida
            var fCBalance  = fLeftAGB.subtract(agb_update).add(fLeftAGN.subtract(agn_update))
                .rename(ee.String('fCBalance_').cat(year_str));

            return ee.Image(previous_year)
                .addBands(fLeftAGB).addBands(fLeftAGN).addBands(fAGNcomb)
                .addBands(fCBalance).addBands(agb_update).addBands(agn_update);

        }, first));

        data = ee.Image(data).float().updateMask(biome_mask);

        var fAGNcomb  = data.select('fAGNcomb_(.*)');
        var fCBalance = data.select('fCBalance_(.*)');

        // CO₂ líquido em tC/ha — CORREÇÃO v036: SEM ×3.67
        // fórmula: (fAGNcomb × 0.099 + fCBalance)
        // 0.099 = fração de C emitida como CO e CH₄ (não como CO₂)
        var CO2_tC_ha = fAGNcomb.multiply(0.099).add(fCBalance)
            .multiply(-1) // positivo = emissão
            .updateMask(forest_mask.reduce(ee.Reducer.anyNonZero()));

        var oldBands = CO2_tC_ha.bandNames();
        var newBands = oldBands.map(function(b) {
            return ee.String(b).replace('fCBalance', 'CO2_tC_ha');
        });
        CO2_tC_ha = CO2_tC_ha.select(oldBands, newBands).float();

        // Gases não-CO₂: tC × 2000 kg/t × EF g/kg → g/ha
        var CH4_y = fAGNcomb.multiply(2000).multiply(6.8).updateMask(forest_mask.reduce(ee.Reducer.anyNonZero()));
        var N2O_y = fAGNcomb.multiply(2000).multiply(0.2).updateMask(forest_mask.reduce(ee.Reducer.anyNonZero()));
        var CO_y  = fAGNcomb.multiply(2000).multiply(104 ).updateMask(forest_mask.reduce(ee.Reducer.anyNonZero()));
        var NOX_y = fAGNcomb.multiply(2000).multiply(1.6 ).updateMask(forest_mask.reduce(ee.Reducer.anyNonZero()));

        var rename = function(img, prefix) {
            var old = img.bandNames();
            var neu = old.map(function(b) { return ee.String(b).replace('fAGNcomb', prefix); });
            return img.select(old, neu).round().int32();
        };

        CO2_mosaic = CO2_mosaic.bandNames().size().eq(0)
            ? CO2_tC_ha : CO2_mosaic.unmask(0).add(CO2_tC_ha.unmask(0));
        CH4_mosaic = CH4_mosaic.bandNames().size().eq(0)
            ? rename(CH4_y,'CH4_g_ha') : CH4_mosaic.unmask(0).add(rename(CH4_y,'CH4_g_ha').unmask(0));
        N2O_mosaic = N2O_mosaic.bandNames().size().eq(0)
            ? rename(N2O_y,'N2O_g_ha') : N2O_mosaic.unmask(0).add(rename(N2O_y,'N2O_g_ha').unmask(0));
        CO_mosaic  = CO_mosaic.bandNames().size().eq(0)
            ? rename(CO_y, 'CO_g_ha' ) : CO_mosaic.unmask(0).add(rename(CO_y,'CO_g_ha').unmask(0));
        NOX_mosaic = NOX_mosaic.bandNames().size().eq(0)
            ? rename(NOX_y,'NOX_g_ha') : NOX_mosaic.unmask(0).add(rename(NOX_y,'NOX_g_ha').unmask(0));
    });

    return CO2_mosaic.addBands(CH4_mosaic).addBands(N2O_mosaic).addBands(CO_mosaic).addBands(NOX_mosaic);
};
