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
 *            Esta versão refatora SEEG_13 mantendo a mesma metodologia,
 *            mas padronizando as saídas em tC/ha.
 * 
 * METODOLOGIA ORIGINAL: SEEG_13
 * AUTORES ORIGINAIS: Celso Junior, Camila Silva
 * REFATORAÇÃO: v036 (2026-04-30)
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

    // Fatores de emissão IPCC para savanas (g/kg de biomassa seca queimada)
    var EF = {
        CH4: 2.3,    // Metano
        N2O: 0.21,   // Óxido nitroso
        CO: 65,      // Monóxido de carbono
        NOX: 3.9     // Óxidos de nitrogênio
    };

    // Fatores de combustão (fração que efetivamente queima)
    var combustion_fwd = 0.873;   // Resíduos finos e serapilheira
    var combustion_cwd = 0.459;   // Resíduos lenhosos grossos

    // Conteúdo de carbono em madeira seca (47% de carbono)
    var carbon_content = 1 / 0.47;

    // Proporção de AGB convertida em fine woody debris (Ribeiro et al. 2011)
    var agb_to_fwd = 0.26;

    // Conversão de unidades
    var co2_conversion = 44 / 12;  // Conversão de C para CO2
    var ef_conversion = 0.001;     // g/kg → conversão para unidades corretas


    // =========================================================================
    // FUNÇÕES AUXILIARES
    // =========================================================================

    /**
     * Reclassifica frequência de fogo em 4 classes de severidade
     * Baseado em: Reclassificação da Frequência de Fogo (SEEG_13)
     */
    var reclassifyFireFrequency = function(fire_freq_image) {
        var freq_mean = fire_freq_image.reduce('mean');
        
        return freq_mean.multiply(0)
            .where(freq_mean.gte(1).and(freq_mean.lt(3)), 1)   // 1-3: Baixa frequência
            .where(freq_mean.gte(3).and(freq_mean.lt(5)), 2)   // 3-5: Média-baixa
            .where(freq_mean.gte(5).and(freq_mean.lt(7)), 3)   // 5-7: Média-alta
            .where(freq_mean.gte(7), 4);                       // 7+:  Alta frequência
    };

    /**
     * Reclassifica tempo desde fogo em 4 classes de recuperação
     * Baseado em: Reclassificação de YSF (SEEG_13)
     */
    var reclassifyTimeSinceFire = function(tsf_image) {
        return tsf_image
            .where(tsf_image.gte(0).and(tsf_image.lt(4)), 4)   // 0-4 anos:  Baixo tempo (sem recuperação)
            .where(tsf_image.gte(4).and(tsf_image.lt(7)), 3)   // 4-7 anos:  Médio-baixo
            .where(tsf_image.gte(7).and(tsf_image.lt(10)), 2)  // 7-10 anos: Médio-alto
            .where(tsf_image.gte(10), 1);                      // 10+ anos:  Alto tempo (recuperação)
    };

    /**
     * Calcula fatores de emissão de CO2 baseado em severidade de fogo
     * Baseado em: calcularMudanca (SEEG_13)
     * 
     * fire_severity = TSF_reclassificado + Frequência_reclassificada
     * Varia de 2 (baixa severidade) a 8 (alta severidade)
     */
    var calculateEmissionFactors = function(fire_severity) {
        return fire_severity
            .where(fire_severity.gte(2).and(fire_severity.lte(3)), 0.021)    // Severidade baixa-média
            .where(fire_severity.gt(3).and(fire_severity.lte(6)), -0.004)    // Severidade média
            .where(fire_severity.gt(6), -0.02);                             // Severidade alta
    };

    /**
     * Calcula emissões de um gás (CH4, N2O, CO, NOX)
     * Baseado em: Fatores de combustão (SEEG_13)
     */
    var calculateCombustionEmissions = function(litter_img, cdw_img, agb_fwd_img, 
                                               emission_factor, pixel_mask_img) {
        var fwd_component = litter_img
            .multiply(pixel_mask_img)
            .multiply(combustion_fwd)
            .multiply(carbon_content)
            .multiply(emission_factor)
            .multiply(ef_conversion);

        var agb_fwd_component = agb_fwd_img
            .multiply(pixel_mask_img)
            .multiply(combustion_fwd)
            .multiply(carbon_content)
            .multiply(emission_factor)
            .multiply(ef_conversion);

        var cwd_component = cdw_img
            .multiply(pixel_mask_img)
            .multiply(combustion_cwd)
            .multiply(carbon_content)
            .multiply(emission_factor)
            .multiply(ef_conversion);

        return fwd_component.add(agb_fwd_component).add(cwd_component);
    };


    // =========================================================================
    // PROCESSAMENTO PRINCIPAL
    // =========================================================================

    // Inicializar coleções de bandas por gás
    var CO2_bands = ee.Image().select();
    var CH4_bands = ee.Image().select();
    var N2O_bands = ee.Image().select();
    var CO_bands = ee.Image().select();
    var NOX_bands = ee.Image().select();

    // AGB atual (será atualizado a cada ano)
    var current_agb = agb;
    var current_agb_fwd = agb.multiply(agb_to_fwd);

    // Reclassificar frequência e tempo desde fogo uma única vez
    var freq_class = reclassifyFireFrequency(fire_frequency);
    var tsf_class = reclassifyTimeSinceFire(time_since_fire);

    // Iterar através dos anos
    years.forEach(function(year) {

        // Selecionar dados do ano
        var burned_area = annual_burned.select('.*_' + year);
        var mask = savanna_mask.select('.*_' + year);
        var pixel_mask = burned_area.multiply(mask);

        // Calcular severidade do fogo e fatores de emissão
        var fire_severity = tsf_class.select('.*_' + year).add(freq_class);
        var emission_factors = calculateEmissionFactors(fire_severity);

        // =====================================================================
        // EMISSÕES DE CO2 (Tardias)
        // =====================================================================
        // Metodologia SEEG_13: agb × burned_area × emission_factor × (44/12)
        // Resultado: tC/ha (CO2)

        var co2_tC_ha = current_agb
            .multiply(pixel_mask)
            .multiply(emission_factors)
            .multiply(co2_conversion);

        CO2_bands = CO2_bands.addBands(
            co2_tC_ha.rename('CO2_tC_ha_' + year).float()
        );

        // =====================================================================
        // EMISSÕES DE COMBUSTÃO (CO, CH4, N2O, NOX)
        // =====================================================================

        // CO (Monóxido de carbono)
        var co_year = calculateCombustionEmissions(
            litter, cdw, current_agb_fwd,
            EF.CO,
            pixel_mask
        );

        CO_bands = CO_bands.addBands(
            co_year.rename('CO_tC_ha_' + year).float()
        );

        // CH4 (Metano)
        var ch4_year = calculateCombustionEmissions(
            litter, cdw, current_agb_fwd,
            EF.CH4,
            pixel_mask
        );

        CH4_bands = CH4_bands.addBands(
            ch4_year.rename('CH4_tC_ha_' + year).float()
        );

        // N2O (Óxido nitroso)
        var n2o_year = calculateCombustionEmissions(
            litter, cdw, current_agb_fwd,
            EF.N2O,
            pixel_mask
        );

        N2O_bands = N2O_bands.addBands(
            n2o_year.rename('N2O_tC_ha_' + year).float()
        );

        // NOX (Óxidos de nitrogênio)
        var nox_year = calculateCombustionEmissions(
            litter, cdw, current_agb_fwd,
            EF.NOX,
            pixel_mask
        );

        NOX_bands = NOX_bands.addBands(
            nox_year.rename('NOX_tC_ha_' + year).float()
        );

        // =====================================================================
        // ATUALIZAR BIOMASSA PARA PRÓXIMO ANO (CORREÇÃO DO BUG)
        // =====================================================================
        // SEEG_13 original usava: agb.add(...) [ERRADO - somava]
        // Correto: agb.subtract(...) [fogo reduz biomassa]

        current_agb = current_agb.subtract(
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

///*
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

Map.addLayer(fire_annual.selfMask(), { bands: ['burned_area_2023'], min: 0, max: 1, palette: [] }, 'fire 2023', false);
Map.addLayer(fire_freq.selfMask().slice(0,40), { bands: ['fire_frequency_1985_2023'], min: 0, max: 75, palette: paletaMapBiomas }, 'freq 2023', false);
Map.addLayer(fire_tsf, { bands: ['burned_area_2023'], min: 0, max: 40, palette: [] }, 'tsf 2023', false);
Map.addLayer(fire_emissions.select('CO2_tC_ha_.*'), {bands:['CO2_tC_ha_2023'], min: 0, max: 50, palette: ['white', 'orange', 'red'] }, 'CO2 Savana 2023 (tC/ha)');
Map.addLayer(fire_emissions.select('CH4_tC_ha_.*'), {bands:['CH4_tC_ha_2023'], min: 0, max: 0.1, palette: ['white', 'purple'] }, 'CH4 Savana 2023 (tC/ha)');
Map.addLayer(fire_emissions.select('N2O_tC_ha_.*'), {bands:['N2O_tC_ha_2023'], min: 0, max: 0.01, palette: ['white', 'cyan'] }, 'N2O Savana 2023 (tC/ha)');

// Exportar
Export.image.toAsset({
    image: fire_emissions.select('CO2.*').toFloat(),
    description: 'v036_savana_co2_1986_2024',
    assetId: 'projects/ee-ipam/assets/CCAL/MODULO3/v036/FOGO/SAVANA/v036_savana_co2_1986_2024',
    scale: 30,
    region: savanna_mask.geometry().bounds(),
    maxPixels: 1e13
});

//*/