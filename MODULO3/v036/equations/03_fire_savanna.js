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
 * SCRIPT: 03_fire_savanna.js
 * DESCRIÇÃO: Algoritmo de emissões por fogo em savanas e campos. Quantifica a 
 *            queima de biomassa fina e lenhosa, ajustando os fatores de combustão 
 *            de acordo com a recorrência do fogo e acúmulo de combustível vegetal.
 *            
 *            Reprodução fiel do modelo SEEG_13 como módulo exportável.
 *            Saídas padronizadas em t/ha (CO2 em tC/ha).
 *
 * METODOLOGIA ORIGINAL: SEEG_13
 * AUTORES ORIGINAIS: Celso Junior, Camila Silva
 * REFATORAÇÃO: v036 (2026-04-30) | CORREÇÃO: 2026-05-27
 * =============================================================================
 */

exports.calcSavannaFireEmissions = function (params) {

    var annual_burned = params.annual_burned;       // Imagem: área queimada anual
    var fire_frequency = params.fire_frequency;     // Imagem: frequência acumulada de fogo
    var time_since_fire = params.time_since_fire;   // Imagem: anos desde último fogo
    var agb = params.agb;                           // Imagem: biomassa aérea (tC/ha)
    var cdw = params.cdw;                           // Imagem: madeira morta (tC/ha)
    var litter = params.litter;                     // Imagem: serapilheira (tC/ha)
    var savanna_mask = params.savanna_mask;         // Imagem: máscara de savana (0/1)
    var years = params.years;                       // Array: lista de anos

    // =========================================================================
    // CONSTANTES E FATORES
    // =========================================================================

    var agb_to_fwd = 0.26;         // 26% da AGB vira FWD (Ribeiro et al. 2011)
    var combustion_fwd = 0.873;    // Fator combustão: serapilheira e FWD
    var combustion_cwd = 0.459;    // Fator combustão: madeira morta grossa

    // =========================================================================
    // FUNÇÕES AUXILIARES (REPRODUÇÃO FIEL DA v035)
    // =========================================================================

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

    // =========================================================================
    // PROCESSAMENTO PRINCIPAL
    // =========================================================================

    var CO2_bands = ee.Image().select();
    var CH4_bands = ee.Image().select();
    var N2O_bands = ee.Image().select();
    var CO_bands = ee.Image().select();
    var NOX_bands = ee.Image().select();

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

        // --- CO2 (AGB loss/gain por severidade) → tC/ha
        var co2_tC_ha = current_agb
            .multiply(pixel_mask)
            .multiply(emission_factors);

        CO2_bands = CO2_bands.addBands(
            co2_tC_ha.rename('CO2_tC_ha_' + year).float()
        );

        // --- Combustão (CH4, N2O, CO, NOX) → t/ha via IPCC
        // comb_total = litter×0.873 + agb26×0.873 + cdw×0.459  [tC/ha]
        var comb_total = litter.multiply(combustion_fwd)
            .add(current_agb_fwd.multiply(combustion_fwd))
            .add(cdw.multiply(combustion_cwd));

        // CH4: comb_total × 2000 × EF / 1e6
        CH4_bands = CH4_bands.addBands(
            comb_total.multiply(pixel_mask).multiply(2000).multiply(2.3).divide(1e6).rename('CH4_t_ha_' + year).float()
        );
        N2O_bands = N2O_bands.addBands(
            comb_total.multiply(pixel_mask).multiply(2000).multiply(0.21).divide(1e6).rename('N2O_t_ha_' + year).float()
        );
        CO_bands = CO_bands.addBands(
            comb_total.multiply(pixel_mask).multiply(2000).multiply(65).divide(1e6).rename('CO_t_ha_' + year).float()
        );
        NOX_bands = NOX_bands.addBands(
            comb_total.multiply(pixel_mask).multiply(2000).multiply(3.9).divide(1e6).rename('NOX_t_ha_' + year).float()
        );

        // --- Atualizar AGB (v035: agb.add(...) — pode ganhar ou perder)
        current_agb = current_agb.add(
            current_agb
                .multiply(pixel_mask)
                .multiply(emission_factors)
                .unmask(0)
        );

        current_agb_fwd = current_agb.multiply(agb_to_fwd);
    });

    // =========================================================================
    // RETORNAR TODAS AS EMISSÕES
    // =========================================================================

    return CO2_bands
        .addBands(CH4_bands)
        .addBands(N2O_bands)
        .addBands(CO_bands)
        .addBands(NOX_bands);
};


/**
 * =============================================================================
 * EXEMPLO DE USO E VALIDAÇÃO
 * =============================================================================
 * 
 * Descomente a seção abaixo para testar e validar contra SEEG_13
 */

//
/*
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var fire_annual = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1');
var fire_freq = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1');
var fire_tsf = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1');
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');

fire_tsf = fire_annual.slice(1).multiply(0).blend(fire_tsf);

// Máscara de savana (LULC classe 4)
var savanna_mask = lulc.eq(4).uint8();

var years = [
    '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];

// Chamar função
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

// Visualizar resultados
var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');

Map.addLayer(lulc.selfMask(), { bands: ['classification_2023'], min: 0, max: 75, palette: paletaMapBiomas }, 'LULC 2023', false);
Map.addLayer(savanna_mask.selfMask().reduce("sum"), { min: 0, max: 1, palette: ["aacc80"] }, 'savanna_mask 2023', false);
Map.addLayer(savanna_mask.selfMask(), { bands: ['classification_2023'], min: 0, max: 1, palette: ["aacc80"] }, 'savanna_mask 2023', false);
Map.addLayer(fire_annual.selfMask(), { bands: ['burned_area_2023'], min: 0, max: 1, palette: [] }, 'fire 2023', false);
Map.addLayer(fire_freq.selfMask().slice(0,40), { bands: ['fire_frequency_1985_2023'], min: 0, max: 75, palette: paletaMapBiomas }, 'freq 2023', false);
Map.addLayer(fire_tsf, { bands: ['burned_area_2023'], min: 0, max: 40, palette: [] }, 'tsf 2023', false);
Map.addLayer(fire_emissions.select('CO2_tC_ha_.*'), {bands:['CO2_tC_ha_2023'], min: 0, max: 50, palette: ['white', 'orange', 'red'] }, 'CO2 Savana 2023 (tC/ha)');
Map.addLayer(fire_emissions.select('CH4_t_ha_.*'), {bands:['CH4_t_ha_2023'], min: 0, max: 0.1, palette: ['white', 'purple'] }, 'CH4 Savana 2023 (t/ha)');
Map.addLayer(fire_emissions.select('N2O_t_ha_.*'), {bands:['N2O_t_ha_2023'], min: 0, max: 0.01, palette: ['white', 'cyan'] }, 'N2O Savana 2023 (t/ha)');
Map.addLayer(fire_emissions.select('CO_t_ha_.*'), {bands:['CO_t_ha_2023'], min: 0, max: 0.1, palette: ['white', 'blue'] }, 'CO Savana 2023 (t/ha)');
Map.addLayer(fire_emissions.select('NOX_t_ha_.*'), {bands:['NOX_t_ha_2023'], min: 0, max: 0.01, palette: ['white', 'cyan'] }, 'NOX Savana 2023 (t/ha)');

// Exportar
Export.image.toAsset({
    image: fire_emissions.select('CO2.*').toFloat(),
    description: 'v036_savana_co2_1986_2024',
    assetId: 'projects/ee-ipam/assets/CCAL/MODULO3/v036/fire_savanna_emissions_v036',
    scale: 30,
    region: savanna_mask.geometry().bounds(),
    maxPixels: 1e13,
    overwrite:true
});

//*/