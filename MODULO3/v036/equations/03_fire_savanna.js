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
 * SCRIPT: 03_fire_savanna.js
 * DESCRIÇÃO: Algoritmo de emissões por fogo em savanas e campos. Quantifica a 
 *            queima de biomassa fina e lenhosa, ajustando os fatores de combustão 
 *            de acordo com a recorrência do fogo e acúmulo de combustível vegetal.
 * -----------------------------------------------------------------------------
 * INSTITUIÇÃO: IPAM Amazônia
 * EQUIPE CCAL: Ane Alencar; Bárbara Zimbres; Camila Silva; Celso Silva-Junior; 
 *              Edriano Souza; Isabel Silva; Lívia Laureto; Manuela Padilha; 
 *              Paulo Moutinho; Rebecca Maranhão; Valderli Piontekowski; Wallace Silva
 * CONTATO: https://ipam.org.br/contato/fale-conosco/
 * ATUALIZAÇÃO: 2026-04-30
 * =============================================================================
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

    // Fatores de emissão IPCC — savanas (g/kg matéria seca queimada)
    var EF = { CH4: 2.3, N2O: 0.21, CO: 65, NOX: 3.9 };

    // Fatores de combustão (fração que realmente queima)
    var combf_fwd = 0.873; // Fine woody debris / litter
    var combf_cwd = 0.331; // Coarse woody debris + AGB

    // Tabela de emissão relativa de CO₂ por regime de fogo (YSF × frequência)
    var agb_factor_table = [
        // Frequência = 1: primeiro fogo
        [0, 0.10, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        // Frequência = 2: segundo fogo
        [0, 0.12, 0.11, 0.10, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        // Frequência >= 3: fogo recorrente
        [0, 0.15, 0.13, 0.11, 0.09, 0.07, 0.05, 0.03, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];

    var tsf_values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38];
    var tsf_edit = annual_burned.multiply(0).slice(1).blend(time_since_fire);

    var CO2_bands = ee.Image().select();
    var CH4_bands = ee.Image().select();
    var N2O_bands = ee.Image().select();

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

        var co2_year = prev_agb.multiply(factor).multiply(pixel_mask).rename('CO2_tC_ha_' + year).float();
        prev_agb = prev_agb.subtract(prev_agb.multiply(factor).multiply(pixel_mask).unmask(0));

        var comb_fwd = litter.multiply(combf_fwd);
        var comb_cwd = cdw.add(agb.multiply(0.1)).multiply(combf_cwd);
        var comb_total = comb_fwd.add(comb_cwd);

        var ch4_year = comb_total.multiply(2000).multiply(EF.CH4).divide(1e6).multiply(pixel_mask).rename('CH4_t_ha_' + year).float();
        var n2o_year = comb_total.multiply(2000).multiply(EF.N2O).divide(1e6).multiply(pixel_mask).rename('N2O_t_ha_' + year).float();

        CO2_bands = CO2_bands.addBands(co2_year);
        CH4_bands = CH4_bands.addBands(ch4_year);
        N2O_bands = N2O_bands.addBands(n2o_year);
    });

    return CO2_bands.addBands(CH4_bands).addBands(N2O_bands);
};

//
/*
// =============================================================================
// ÁREA DE TESTE (DESCOMENTE PARA VALIDAR)
// =============================================================================
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var fire_annual = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1').select('burned_area_.*');
var fire_freq = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1').select('fire_frequency_1985_.*');
var fire_tsf = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1').select('classification_.*');
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');

var savanna_mask = (function() {
    var out = lulc.multiply(0);
    [4].forEach(function(v) {
        out = out.where(lulc.eq(v), 1);
    });
    return out;
})();
var years = [
    '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];

var fire_emissions = exports.calcSavannaFireEmissions({
    annual_burned: fire_annual,
    fire_frequency: fire_freq,
    time_since_fire: fire_tsf,
    agb: qcn.select('AGB'),
    cdw: qcn.select('CDW'),
    litter: qcn.select('LITTER'),
    savanna_mask: savanna_mask,
    years: years
});

// Parâmetros de Visualização (Ref: v036/02_investigate_modulo3.js)
var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');

// Camadas de Referência (Inputs)
Map.addLayer(lulc, { bands: ['classification_2023'], min: 0, max: 75, palette: paletaMapBiomas }, 'LULC 2023', false);
Map.addLayer(fire_annual.selfMask(), { bands: ['burned_area_2023'], palette: ['red'] }, 'Área Queimada 2023', false);
Map.addLayer(savanna_mask.selfMask(), { bands: ['classification_2023'], palette: ['orange'] }, 'Máscara Savana 2023', false);

// Camadas de Saída
Map.addLayer(fire_emissions.select('CO2_tC_ha_.*'), { bands: ['CO2_tC_ha_2023'], min: 0, max: 50, palette: ['white', 'orange', 'red'] }, 'Total CO2 Savana (tC/ha)');
Map.addLayer(fire_emissions.select('CH4_t_ha_.*'), { bands: ['CH4_t_ha_2023'], min: 0, max: 0.1, palette: ['white', 'purple'] }, 'CH4 Savana (t/ha)');
Map.addLayer(fire_emissions.select('N2O_t_ha_.*'), { bands: ['N2O_t_ha_2023'], min: 0, max: 0.01, palette: ['white', 'cyan'] }, 'N2O Savana (t/ha)');
Map.addLayer(fire_emissions, { }, 'Resultado Bruto (Todas Bandas)', false);
//*/
