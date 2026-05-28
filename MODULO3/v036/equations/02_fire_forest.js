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
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Emissões por Mudança de Uso e Degradação)
 * VERSÃO: v036 (CORRIGIDA)
 * SCRIPT: 02_fire_forest.js
 * DESCRIÇÃO: Reprodução fiel do modelo FATE v2-1 (SEEG_12) como módulo exportável.
 *            Implementa o balanço integrado de carbono para florestas:
 *            - Mortalidade de árvores por fogo
 *            - Combustão imediata (single e multi-fire)
 *            - Decomposição de resíduos
 *            - Regeneração pós-fogo
 *
 *            Saídas (todos em t/ha):
 *            - CO2_tC_ha: balanço líquido (combustão + decomposição + regeneração)
 *            - CO2_gross_t_ha: combustão bruta (⚠️ não somar com balanço)
 *            - CO_t_ha: monóxido de carbono
 *            - CH4_t_ha: metano
 *            - N2O_t_ha: óxido nitroso
 *            - NOX_t_ha: óxidos de nitrogênio
 *
 * METODOLOGIA ORIGINAL: SEEG_12 (FATE Model v2-1)
 * AUTORES ORIGINAIS: Camila Silva, Aline Pontes, Wallace Silva
 * REFATORAÇÃO v036: 2026-04-30 | CORREÇÃO: 2026-05-27
 * =============================================================================
 */

exports.calcForestFireEmissions = function (params) {

    var annual_burned = params.annual_burned;
    var fire_frequency = params.fire_frequency;
    var time_since_fire = params.time_since_fire;
    var agb = params.agb;
    var cdw = params.cdw;
    var litter = params.litter;
    var forest_mask = params.forest_mask;
    var biomas = params.biomas;
    var years = params.years;

    // =========================================================================
    // LOOKUP TABLES — PARÂMETROS BIOFÍSICOS POR BIOMA
    // =========================================================================
    // Fonte: FATE Model v2-1 (SEEG_12)
    // Autores: Camila Silva, Aline Pontes, Wallace Silva

    var biome_dict = {
        'Amazônia': {
            AGBloss_lookup: [
                0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011,
                0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0
            ],
            turnover: 0.03,
            decomp_rate: 0.19,
            fwd_combf: 0.683,
            cwd_combf_single: 0.643,
            cwd_combf_multi: 0.824,
            cwd_part_multi: 0.757
        },
        'Caatinga': {
            AGBloss_lookup: [
                0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011,
                0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0
            ],
            turnover: 0.03,
            decomp_rate: 0.19,
            fwd_combf: 0.983,
            cwd_combf_single: 0.719,
            cwd_combf_multi: 0.824,
            cwd_part_multi: 0.757
        },
        'Cerrado': {
            AGBloss_lookup: [
                0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011,
                0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0
            ],
            turnover: 0.03,
            decomp_rate: 0.19,
            fwd_combf: 0.683,
            cwd_combf_single: 0.629,
            cwd_combf_multi: 0.824,
            cwd_part_multi: 0.757
        },
        'Mata Atlântica': {
            AGBloss_lookup: [
                0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011,
                0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0
            ],
            turnover: 0.03,
            decomp_rate: 0.19,
            fwd_combf: 0.683,
            cwd_combf_single: 0.643,
            cwd_combf_multi: 0.824,
            cwd_part_multi: 0.757
        },
        'Pampa': {
            AGBloss_lookup: [
                0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011,
                0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0
            ],
            turnover: 0.03,
            decomp_rate: 0.19,
            fwd_combf: 0.683,
            cwd_combf_single: 0.629,
            cwd_combf_multi: 0.824,
            cwd_part_multi: 0.757
        },
        'Pantanal': {
            AGBloss_lookup: [
                0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011,
                0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0
            ],
            turnover: 0.03,
            decomp_rate: 0.19,
            fwd_combf: 0.683,
            cwd_combf_single: 0.629,
            cwd_combf_multi: 0.824,
            cwd_part_multi: 0.757
        }
    };

    var biome_list = Object.keys(biome_dict);

    var tsfValues = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
        19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38
    ];

    // =========================================================================
    // PREPARAÇÃO DE DADOS COMUNS A TODOS OS BIOMAS
    // =========================================================================

    var annual_fire_freq_gte2 = annual_burned.updateMask(fire_frequency.gte(2)).gte(1);

    var tsf_edit = annual_burned
        .multiply(0)
        .slice(1)
        .blend(time_since_fire);

    // s_inAGNstock = necromassa inicial (litter + cdw)
    var s_inAGNstock = litter.add(cdw);

    // =========================================================================
    // INICIALIZA MOSAICOS DE SAÍDA (um por gás)
    // =========================================================================

    var co2_names = years.map(function (y) { return 'CO2_tC_ha_' + y; });
    var co2_gross_names = years.map(function (y) { return 'CO2_gross_t_ha_' + y; });
    var co_names = years.map(function (y) { return 'CO_t_ha_' + y; });
    var ch4_names = years.map(function (y) { return 'CH4_t_ha_' + y; });
    var n2o_names = years.map(function (y) { return 'N2O_t_ha_' + y; });
    var nox_names = years.map(function (y) { return 'NOX_t_ha_' + y; });

    var CO2_mosaic = ee.Image.constant(ee.List.repeat(0, co2_names.length)).rename(co2_names).float();
    var CO2_gross_mosaic = ee.Image.constant(ee.List.repeat(0, co2_gross_names.length)).rename(co2_gross_names).float();
    var CO_mosaic = ee.Image.constant(ee.List.repeat(0, co_names.length)).rename(co_names).float();
    var CH4_mosaic = ee.Image.constant(ee.List.repeat(0, ch4_names.length)).rename(ch4_names).float();
    var N2O_mosaic = ee.Image.constant(ee.List.repeat(0, n2o_names.length)).rename(n2o_names).float();
    var NOX_mosaic = ee.Image.constant(ee.List.repeat(0, nox_names.length)).rename(nox_names).float();

    // =========================================================================
    // PROCESSAR CADA BIOMA INDEPENDENTEMENTE (REPRODUÇÃO FIEL DA v035)
    // =========================================================================

    biome_list.forEach(function (biome_str) {
        var p = biome_dict[biome_str];

        var biome_img = ee.Image(0).paint(biomas.filter(ee.Filter.eq('Bioma', biome_str)), 1).eq(1);

        var AGBloss_lookup = p.AGBloss_lookup;
        var turnover = p.turnover;
        var aREF_decomposition = p.decomp_rate;
        var aREF_combF_fwd_sF = p.fwd_combf;
        var aREF_combF_cwd_sF = p.cwd_combf_single;
        var cwd_combf_multi = p.cwd_combf_multi;
        var cwd_part_multi = p.cwd_part_multi;

        // --- --- --- --- FATE MODEL ITERATION
        function model(year, previous_year) {
            year = ee.Number.parse(year);
            var year_prev = year.subtract(1);

            var tsf_year = tsf_edit.select(ee.String('.*_').cat(year));
            var annual_fire_freq_gte2_year = annual_fire_freq_gte2.select(ee.String('.*_').cat(year));

            var aRef_netAGBloss = tsf_year.remap(tsfValues, AGBloss_lookup).multiply(-1)
                .rename(ee.String('aRef_netAGBloss_').cat(year));
            var aRef_netAGNgain = tsf_year.remap(tsfValues, AGBloss_lookup)
                .rename(ee.String('aRef_netAGNgain_').cat(year));

            var fLeftAGB_prev = ee.Image(previous_year)
                .select(ee.String('fLeftAGB_').cat(year_prev));

            var s_inAGBstock_update = agb
                .updateMask(tsf_year.eq(0))
                .blend(fLeftAGB_prev)
                .rename(ee.String('s_inAGBstock_update_').cat(year));

            var fNetAGBloss = s_inAGBstock_update.multiply(aRef_netAGBloss)
                .rename(ee.String('fNetAGBloss_').cat(year));
            var fLeftAGB = s_inAGBstock_update.add(fNetAGBloss)
                .rename(ee.String('fLeftAGB_').cat(year));

            var fAGNinput_Mortality = s_inAGBstock_update.multiply(aRef_netAGNgain);
            var fAGNinput_TurnOver = s_inAGBstock_update.multiply(turnover);
            var fAGNinput = fAGNinput_Mortality.add(fAGNinput_TurnOver)
                .rename(ee.String('fAGNinput_').cat(year));

            var fAGNcomb_fwd = litter.multiply(aREF_combF_fwd_sF)
                .updateMask(tsf_year.eq(0));
            fAGNcomb_fwd = ee.Image(0).blend(fAGNcomb_fwd);

            var fAGNcomb_cwd = cdw.multiply(aREF_combF_cwd_sF)
                .updateMask(tsf_year.eq(0));
            fAGNcomb_cwd = ee.Image(0).blend(fAGNcomb_cwd);

            var fAGNcomb = fAGNcomb_fwd.add(fAGNcomb_cwd)
                .rename(ee.String('fAGNcomb_').cat(year));

            var fLeftAGN_prev = ee.Image(previous_year)
                .select(ee.String('fLeftAGN_').cat(year_prev));

            var s_inAGNstock_update = s_inAGNstock
                .updateMask(tsf_year.eq(0))
                .blend(fLeftAGN_prev)
                .rename(ee.String('s_inAGNstock_update_').cat(year));

            var fAGNcomb_fwd_M = s_inAGNstock_update.multiply(ee.Image(1).subtract(cwd_part_multi)).multiply(aREF_combF_fwd_sF)
                .updateMask(annual_fire_freq_gte2_year);
            var fAGNcomb_cwd_M = s_inAGNstock_update.multiply(cwd_part_multi).multiply(cwd_combf_multi)
                .updateMask(annual_fire_freq_gte2_year);
            fAGNcomb_cwd_M = ee.Image(0).blend(fAGNcomb_cwd_M);
            var fAGNcomb_M = fAGNcomb_fwd_M.add(fAGNcomb_cwd_M);

            fAGNcomb = fAGNcomb.blend(fAGNcomb_M)
                .rename(ee.String('fAGNcomb_').cat(year));

            var fLeftAGN = s_inAGNstock_update.add(fAGNinput).subtract(fAGNcomb)
                .multiply(1 - aREF_decomposition)
                .rename(ee.String('fLeftAGN_').cat(year));
            var fAGNdecomp = s_inAGNstock_update.add(fAGNinput).subtract(fAGNcomb)
                .multiply(aREF_decomposition)
                .rename(ee.String('fAGNdecomp_').cat(year));

            var fCBalance = fLeftAGB.subtract(s_inAGBstock_update).add(fLeftAGN.subtract(s_inAGNstock_update))
                .rename(ee.String('fCBalance_').cat(year));

            return ee.Image(previous_year)
                .addBands(aRef_netAGBloss)
                .addBands(aRef_netAGNgain)
                .addBands(fNetAGBloss)
                .addBands(fLeftAGB)
                .addBands(fAGNinput)
                .addBands(fAGNcomb)
                .addBands(fAGNdecomp)
                .addBands(fLeftAGN)
                .addBands(fCBalance)
                .addBands(s_inAGBstock_update)
                .addBands(s_inAGNstock_update);
        }

        var first = ee.Image().rename('fLeftAGB_1985')
            .addBands(ee.Image().rename('fLeftAGN_1985'));

        var data = ee.Image(ee.List(years).iterate(model, first)).float()
            .updateMask(biome_img);

        var fAGNcomb_b = data.select('fAGNcomb_.*');
        var fCBalance_b = data.select('fCBalance_.*');

        // --- CO2 balanço líquido: (comb × 0.099 + balanço) × (−1) → tC/ha
        var CO2_y = fAGNcomb_b.multiply(0.099).add(fCBalance_b).multiply(-1)
            .rename(years.map(function (y) { return 'CO2_tC_ha_' + y; }));

        // --- CO2 combustão bruta: comb × 2000 × 1580 / 1e6 → t CO2/ha
        var CO2_gross_y = fAGNcomb_b.multiply(2000).multiply(1580).divide(1e6)
            .rename(years.map(function (y) { return 'CO2_gross_t_ha_' + y; }));

        // --- CO: comb × 2000 × 104 / 1e6 → t CO/ha
        var CO_y = fAGNcomb_b.multiply(2000).multiply(104).divide(1e6)
            .rename(years.map(function (y) { return 'CO_t_ha_' + y; }));

        // --- CH4: comb × 2000 × 6.8 / 1e6 → t CH4/ha
        var CH4_y = fAGNcomb_b.multiply(2000).multiply(6.8).divide(1e6)
            .rename(years.map(function (y) { return 'CH4_t_ha_' + y; }));

        // --- N2O: comb × 2000 × 0.2 / 1e6 → t N2O/ha
        var N2O_y = fAGNcomb_b.multiply(2000).multiply(0.2).divide(1e6)
            .rename(years.map(function (y) { return 'N2O_t_ha_' + y; }));

        // --- NOX: comb × 2000 × 1.6 / 1e6 → t NOX/ha
        var NOX_y = fAGNcomb_b.multiply(2000).multiply(1.6).divide(1e6)
            .rename(years.map(function (y) { return 'NOX_t_ha_' + y; }));

        CO2_mosaic = CO2_mosaic.where(biome_img, CO2_y);
        CO2_gross_mosaic = CO2_gross_mosaic.where(biome_img, CO2_gross_y);
        CO_mosaic = CO_mosaic.where(biome_img, CO_y);
        CH4_mosaic = CH4_mosaic.where(biome_img, CH4_y);
        N2O_mosaic = N2O_mosaic.where(biome_img, N2O_y);
        NOX_mosaic = NOX_mosaic.where(biome_img, NOX_y);
    });

    // =========================================================================
    // APLICAR MÁSCARA DE FLORESTA ESTÁVEL
    // =========================================================================

    var fmask = forest_mask.slice(1);

    CO2_mosaic = CO2_mosaic.updateMask(fmask);
    CO2_gross_mosaic = CO2_gross_mosaic.updateMask(fmask);
    CO_mosaic = CO_mosaic.updateMask(fmask);
    CH4_mosaic = CH4_mosaic.updateMask(fmask);
    N2O_mosaic = N2O_mosaic.updateMask(fmask);
    NOX_mosaic = NOX_mosaic.updateMask(fmask);

    // =========================================================================
    // RETORNAR RESULTADO FINAL (Mosaico único multibanda)
    // =========================================================================

    return CO2_mosaic.selfMask()
        .addBands(CO2_gross_mosaic.selfMask())
        .addBands(CO_mosaic.selfMask())
        .addBands(CH4_mosaic.selfMask())
        .addBands(N2O_mosaic.selfMask())
        .addBands(NOX_mosaic.selfMask());
};


/**
 * =============================================================================
 * EXEMPLO DE USO E VALIDAÇÃO
 * =============================================================================
 * Descomente a seção abaixo para testar contra SEEG_12 original
 */

//
/*
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var fire_annual = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1');
var fire_freq = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1').slice(0, 40);
var fire_tsf = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1');
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');

// Padronizar fire_tsf: colocar 0 no primeiro ano (1986)
fire_tsf = fire_annual.slice(1).multiply(0).blend(fire_tsf);

// Máscara de floresta estável (LULC classe 3)
var forest_mask = lulc.eq(3).uint8();

var years = [
    '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];

var fire_emissions = exports.calcForestFireEmissions({
    annual_burned: fire_annual,
    fire_frequency: fire_freq,
    time_since_fire: fire_tsf,
    agb: qcn.select('AGB'),
    cdw: qcn.select('CDW'),
    litter: qcn.select('LITTER'),
    forest_mask: forest_mask,
    biomas: biomas,
    years: years
});

// Parâmetros de Visualização
var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');

// Camadas de Referência (Inputs)
Map.addLayer(lulc, { bands: ['classification_2023'], min: 0, max: 75, palette: paletaMapBiomas }, 'LULC 2023', false);
Map.addLayer(fire_annual.selfMask(), { bands: ['burned_area_2023'], palette: ['red'] }, 'Área Queimada 2023', false);
Map.addLayer(forest_mask.select('classification_2023').selfMask(), { palette: ['green'] }, 'Máscara Floresta 2023', false);

// Camadas de Saída (Emissões)
Map.addLayer(fire_emissions.select('CO2_tC_ha_.*'), { bands: ['CO2_tC_ha_2023'], min: 0, max: 50, palette: ['white', 'orange', 'red'] }, 'CO2 Floresta 2023 (tC/ha)');
Map.addLayer(fire_emissions.select('CH4_t_ha_.*'), { bands: ['CH4_t_ha_2023'], min: 0, max: 0.1, palette: ['white', 'purple'] }, 'CH4 Floresta 2023 (t/ha)');
Map.addLayer(fire_emissions.select('N2O_t_ha_.*'), { bands: ['N2O_t_ha_2023'], min: 0, max: 0.01, palette: ['white', 'cyan'] }, 'N2O Floresta 2023 (t/ha)');
Map.addLayer(fire_emissions.select('CO2_gross_t_ha_.*'), { bands: ['CO2_gross_t_ha_2023'], min: 0, max: 50, palette: ['white', 'orange', 'red'] }, 'CO2 Bruto Floresta 2023 (t/ha)');
Map.addLayer(fire_emissions.select('CO_t_ha_.*'), { bands: ['CO_t_ha_2023'], min: 0, max: 0.1, palette: ['white', 'blue'] }, 'CO Floresta 2023 (t/ha)');
Map.addLayer(fire_emissions.select('NOX_t_ha_.*'), { bands: ['NOX_t_ha_2023'], min: 0, max: 0.01, palette: ['white', 'yellow'] }, 'NOX Floresta 2023 (t/ha)');

print('Emissões Floresta v036:', fire_emissions);

// =========================================================================
// EXPORTAR RESULTADOS
// =========================================================================

Export.image.toAsset({
    image: fire_emissions.toFloat(),
    description: 'v036_floresta_fire_emissions_1986_2024',
    assetId: 'projects/ee-ipam/assets/CCAL/MODULO3/v036/FOGO/FLORESTA/v036_floresta_fire_emissions_1986_2024',
    scale: 30,
    region: forest_mask.geometry().bounds(),
    maxPixels: 1e13,
    pyramidingPolicy: 'mean',
    overwrite: true
});

//*/