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
 * VERSÃO: v036
 * SCRIPT: 02_fire_forest.js
 * DESCRIÇÃO: Motor de cálculo para degradação por fogo em formações florestais. 
 *            Implementa o modelo FATE para estimar a mortalidade de árvores e a 
 *            liberação gradual de carbono e gases de efeito estufa (CO2, CH4, N2O).
 * -----------------------------------------------------------------------------
 * INSTITUIÇÃO: IPAM Amazônia
 * EQUIPE CCAL: Ane Alencar; Bárbara Zimbres; Camila Silva; Celso Silva-Junior; 
 *              Edriano Souza; Isabel Silva; Lívia Laureto; Manuela Padilha; 
 *              Paulo Moutinho; Rebecca Maranhão; Valderli Piontekowski; Wallace Silva
 * CONTATO: https://ipam.org.br/contato/fale-conosco/
 * ATUALIZAÇÃO: 2026-04-30
 * =============================================================================
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

    var co2_names = years.map(function (y) { return 'CO2_tC_ha_' + y });
    var ch4_names = years.map(function (y) { return 'CH4_t_ha_' + y });
    var n2o_names = years.map(function (y) { return 'N2O_t_ha_' + y });

    var CO2_mosaic = ee.Image.constant(ee.List.repeat(0, co2_names.length)).rename(co2_names).float();
    var CH4_mosaic = ee.Image.constant(ee.List.repeat(0, ch4_names.length)).rename(ch4_names).float();
    var N2O_mosaic = ee.Image.constant(ee.List.repeat(0, n2o_names.length)).rename(n2o_names).float();

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

        var CO2_y = fAGNcomb_b.multiply(0.099).add(fCBalance_b).multiply(-1).rename(years.map(function (y) { return 'CO2_tC_ha_' + y }));
        var CH4_y = fAGNcomb_b.multiply(2000).multiply(6.8).divide(1e6).rename(years.map(function (y) { return 'CH4_t_ha_' + y }));
        var N2O_y = fAGNcomb_b.multiply(2000).multiply(0.2).divide(1e6).rename(years.map(function (y) { return 'N2O_t_ha_' + y }));

        CO2_mosaic = CO2_mosaic.where(biome_mask, CO2_y);
        CH4_mosaic = CH4_mosaic.where(biome_mask, CH4_y);
        N2O_mosaic = N2O_mosaic.where(biome_mask, N2O_y);
    });
    
    CO2_mosaic = CO2_mosaic.updateMask(forest_mask.slice(1));
    CH4_mosaic = CH4_mosaic.updateMask(forest_mask.slice(1));
    N2O_mosaic = N2O_mosaic.updateMask(forest_mask.slice(1));
    
    
    return CO2_mosaic.selfMask().addBands(CH4_mosaic.selfMask()).addBands(N2O_mosaic.selfMask());
};

///* 
// =============================================================================
// ÁREA DE TESTE (DESCOMENTE PARA VALIDAR)
// =============================================================================
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var fire_annual = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1').select('burned_area_.*');
var fire_freq = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1').select('fire_frequency_1985_.*');
var fire_tsf = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1').select('classification_.*');
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var desf_reg = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');

var years = [
    '1985','1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];


// --- 3a. Corrige classe 7 (outras transições) no desf/reg via Forward-Backward
var desf_corrected = ee.Image(years.reduce(function (acc, year, i) {
    var curr = desf_reg.select('classification_' + year);
    if (i === 0) return curr.rename('classification_' + year);
    var prev = ee.Image(acc).slice(-1);
    return ee.Image(acc).addBands(prev.where(curr.neq(7), curr).rename('classification_' + year));
}, null));

var desf_corrected_bwd = ee.Image(years.slice().reverse().reduce(function (acc, year, i) {
    var curr = desf_corrected.select('classification_' + year);
    if (i === 0) return curr.rename('classification_' + year);
    var next = ee.Image(acc).slice(0, 1);
    return ee.Image(acc).addBands(next.where(curr.neq(7), curr).rename('classification_' + year));
}, null));

var desf_reg_corrected = desf_corrected.where(desf_corrected.eq(7), desf_corrected_bwd);

var forest_mask = lulc.multiply(0).where(lulc.eq(3).and(desf_reg_corrected.eq(2)), 1);


var fire_emissions = exports.calcForestFireEmissions({
    annual_burned: fire_annual,
    fire_frequency: fire_freq,
    time_since_fire: fire_tsf,
    agb: qcn.select('AGB'),
    cdw: qcn.select('CDW'),
    litter: qcn.select('LITTER'),
    forest_mask: forest_mask,
    biomas: biomas,
    years: years.slice(1)
});

// Parâmetros de Visualização (Ref: v036/02_investigate_modulo3.js)
var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');

// Camadas de Referência (Inputs)
Map.addLayer(lulc, { bands: ['classification_2023'], min: 0, max: 75, palette: paletaMapBiomas }, 'LULC 2023', false);
Map.addLayer(fire_annual.selfMask(), { bands: ['burned_area_2023'], palette: ['red'] }, 'Área Queimada 2023', false);
Map.addLayer(fire_annual.reduce("sum").selfMask(), { palette: ['yellow','red'],min:1,max:30}, 'Frequencia do fogo', false);
Map.addLayer(forest_mask.selfMask(), { bands: ['classification_2023'], palette: ['green'] }, 'Máscara Floresta 2023', false);

// Camadas de Saída (Emissões)
Map.addLayer(fire_emissions.select('CO2_tC_ha.*'), { bands: ['CO2_tC_ha_2023'], min: 0, max: 50, palette: ['white', 'orange', 'red'] }, 'Total CO2 (tC/ha)');
Map.addLayer(fire_emissions.select('CH4_t_ha_.*'), { bands: ['CH4_t_ha_2023'], min: 0, max: 0.1, palette: ['white', 'purple'] }, 'Total CH4 (t/ha)');
Map.addLayer(fire_emissions.select('N2O_t_ha_.*'), { bands: ['N2O_t_ha_2023'], min: 0, max: 0.01, palette: ['white', 'cyan'] }, 'Total N2O (t/ha)');
Map.addLayer(fire_emissions, { }, 'Resultado Bruto (Todas Bandas)', false);
//*/
