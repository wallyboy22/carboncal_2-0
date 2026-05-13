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
 * DESCRIÇÃO: Motor de cálculo para degradação por fogo em formações florestais.
 *            Implementa o modelo FATE (Integrated Carbon Balance Model) para estimar:
 *            - Mortalidade de árvores por fogo
 *            - Combustão imediata
 *            - Decomposição de resíduos
 *            - Regeneração e emissões associadas (CO2, CH4, N2O)
 *
 *            Esta versão refatora SEEG_12 mantendo a mesma metodologia,
 *            mas padronizando as saídas em tC/ha.
 *
 * METODOLOGIA ORIGINAL: SEEG_12 (FATE Model v2-1)
 * AUTORES ORIGINAIS: Camila Silva, Aline Pontes, Wallace Silva
 * REFATORAÇÃO v036: 2026-04-30
 * =============================================================================
 */

exports.calcForestFireEmissions = function (params) {

    var annual_burned = params.annual_burned;       // Imagem: área queimada anual
    var fire_frequency = params.fire_frequency;     // Imagem: frequência de fogo
    var time_since_fire = params.time_since_fire;   // Imagem: anos desde último fogo
    var agb = params.agb;                           // Imagem: biomassa aérea (tC/ha)
    var cdw = params.cdw;                           // Imagem: madeira morta (tC/ha)
    var litter = params.litter;                     // Imagem: serapilheira (tC/ha)
    var forest_mask = params.forest_mask;           // Imagem: máscara de floresta estável
    var biomas = params.biomas;                     // FeatureCollection: limites dos biomas
    var years = params.years;                       // Array: lista de anos como strings

    // =========================================================================
    // DICIONÁRIO DE PARÂMETROS POR BIOMA
    // =========================================================================
    // Baseado em literatura científica e calibração com dados de fogo na Amazônia

    var BIOME_DICT = {
        'Amazônia': {
            // Taxa de perda de AGB como função do tempo desde fogo (TSF)
            // Baseado em Chambers et al. (1999) e estudos posteriores
            AGBloss_lookup: [
                0,      0.104,  0.080,  0.060,  0.044,  0.032,  0.023,  0.016,  0.011,
                0.008,  0.006,  0.004,  0.003,  0.002,  0.001,  0.001,  0.001,  0,
                0,      0,      0,      0,      0,      0,      0,      0,      0,
                0,      0,      0,      0,      0,      0,      0,      0,      0,
                0,      0,      0
            ],
            turnover: 0.03,         // Taxa de renovação de AGB (3% ao ano)
            decomp: 0.19,           // Taxa de decomposição (19% ao ano)
            fwd_combf: 0.683,       // Fator de combustão: fine woody debris
            cwd_combf_s: 0.643,     // Fator de combustão: coarse woody debris (single fire)
            cwd_combf_m: 0.824,     // Fator de combustão: CWD (multi-fire)
            cwd_part_m: 0.757       // Proporção CWD em multi-fire events
        },

        'Caatinga': {
            AGBloss_lookup: [
                0,      0.104,  0.080,  0.060,  0.044,  0.032,  0.023,  0.016,  0.011,
                0.008,  0.006,  0.004,  0.003,  0.002,  0.001,  0.001,  0.001,  0,
                0,      0,      0,      0,      0,      0,      0,      0,      0,
                0,      0,      0,      0,      0,      0,      0,      0,      0,
                0,      0,      0
            ],
            turnover: 0.03,
            decomp: 0.19,
            fwd_combf: 0.983,
            cwd_combf_s: 0.719,
            cwd_combf_m: 0.824,
            cwd_part_m: 0.757
        },

        'Cerrado': {
            AGBloss_lookup: [
                0,      0.104,  0.080,  0.060,  0.044,  0.032,  0.023,  0.016,  0.011,
                0.008,  0.006,  0.004,  0.003,  0.002,  0.001,  0.001,  0.001,  0,
                0,      0,      0,      0,      0,      0,      0,      0,      0,
                0,      0,      0,      0,      0,      0,      0,      0,      0,
                0,      0,      0
            ],
            turnover: 0.03,
            decomp: 0.19,
            fwd_combf: 0.683,
            cwd_combf_s: 0.629,
            cwd_combf_m: 0.824,
            cwd_part_m: 0.757
        },

        'Mata Atlântica': {
            AGBloss_lookup: [
                0,      0.104,  0.080,  0.060,  0.044,  0.032,  0.023,  0.016,  0.011,
                0.008,  0.006,  0.004,  0.003,  0.002,  0.001,  0.001,  0.001,  0,
                0,      0,      0,      0,      0,      0,      0,      0,      0,
                0,      0,      0,      0,      0,      0,      0,      0,      0,
                0,      0,      0
            ],
            turnover: 0.03,
            decomp: 0.19,
            fwd_combf: 0.683,
            cwd_combf_s: 0.643,
            cwd_combf_m: 0.824,
            cwd_part_m: 0.757
        },

        'Pampa': {
            AGBloss_lookup: [
                0,      0.104,  0.080,  0.060,  0.044,  0.032,  0.023,  0.016,  0.011,
                0.008,  0.006,  0.004,  0.003,  0.002,  0.001,  0.001,  0.001,  0,
                0,      0,      0,      0,      0,      0,      0,      0,      0,
                0,      0,      0,      0,      0,      0,      0,      0,      0,
                0,      0,      0
            ],
            turnover: 0.03,
            decomp: 0.19,
            fwd_combf: 0.683,
            cwd_combf_s: 0.629,
            cwd_combf_m: 0.824,
            cwd_part_m: 0.757
        },

        'Pantanal': {
            AGBloss_lookup: [
                0,      0.104,  0.080,  0.060,  0.044,  0.032,  0.023,  0.016,  0.011,
                0.008,  0.006,  0.004,  0.003,  0.002,  0.001,  0.001,  0.001,  0,
                0,      0,      0,      0,      0,      0,      0,      0,      0,
                0,      0,      0,      0,      0,      0,      0,      0,      0,
                0,      0,      0
            ],
            turnover: 0.03,
            decomp: 0.19,
            fwd_combf: 0.683,
            cwd_combf_s: 0.629,
            cwd_combf_m: 0.824,
            cwd_part_m: 0.757
        }
    };

    // =========================================================================
    // PREPARAÇÃO DE DADOS
    // =========================================================================

    // Valores de TSF para lookup table (0-38 anos)
    var tsf_values = [
        0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
        19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38
    ];

    // Máscara para múltiplos incêndios (frequência >= 2)
    var annual_fire_freq_gte2 = annual_burned.updateMask(fire_frequency.gte(2)).gte(1);

    // Preparar TSF: colocar 0 para primeiro ano (sem dados históricos), depois mesclar com série temporal
    // Isso garante que o primeiro fogo tenha TSF=0 (sem recuperação prévia)
    var tsf_edit = annual_burned
        .slice(1)  // Remove banda de 1985 (se existir) para alinhar com anos de 1986 em diante
        .multiply(0)  // Inicia com 0
        .blend(time_since_fire);  // Mescla com dados reais de TSF

    // =========================================================================
    // FUNÇÃO MODELO FATE (Iterada sobre anos)
    // =========================================================================

    /**
     * Modelo FATE (Forest Fire Dynamics and Carbon Balance)
     * Calcula balanço de carbono para cada ano considerando:
     * 1. Mortalidade de árvores
     * 2. Combustão de combustíveis
     * 3. Decomposição gradual
     * 4. Regeneração
     */
    var fateModel = function (year_input, previous_year_image) {
        year_input = ee.Number.parse(year_input);
        var year_str = year_input.int();
        var year_prev = year_input.subtract(1).int();

        // Selecionar dados do ano
        var tsf_year = tsf_edit.select(ee.String('.*_').cat(year_str));
        var freq_gte2_year = annual_fire_freq_gte2.select(ee.String('.*_').cat(year_str));

        // =====================================================================
        // ESTRUTURA RECURSIVA: inicializar imagem vazia para acumular bandas
        // =====================================================================
        var output_image = ee.Image(previous_year_image);

        // =====================================================================
        // ITERAR POR BIOMA
        // =====================================================================

        Object.keys(BIOME_DICT).forEach(function (biome_name) {
            var p = BIOME_DICT[biome_name];

            // Máscara do bioma
            var biome_mask = ee.Image(1).paint(biomas.filter(ee.Filter.eq('Bioma', biome_name)), 1).neq(1);

            // --- Taxa de perda de AGB como função de TSF
            var aRef_netAGBloss = tsf_year
                .remap(tsf_values, p.AGBloss_lookup)
                .multiply(-1)  // Negativo porque é perda
                .rename(ee.String('aRef_netAGBloss_').cat(year_str));

            var aRef_netAGNgain = tsf_year
                .remap(tsf_values, p.AGBloss_lookup)
                .rename(ee.String('aRef_netAGNgain_').cat(year_str));

            // --- AGB no início do ano (se primeiro fogo, usar AGB inicial; senão, usar AGB do ano anterior)
            var fLeftAGB_prev = ee.Image(output_image).select(
                ee.String('fLeftAGB_').cat(year_prev), null
            );

            var s_inAGBstock_update = agb
                .updateMask(tsf_year.eq(0))  // AGB original apenas se TSF=0 (primeiro fogo)
                .blend(fLeftAGB_prev);        // Senão, usar AGB residual do ano anterior

            // --- Perda de AGB por mortalidade
            var fNetAGBloss = s_inAGBstock_update
                .multiply(aRef_netAGBloss)
                .rename(ee.String('fNetAGBloss_').cat(year_str));

            // --- AGB restante após mortalidade
            var fLeftAGB = s_inAGBstock_update
                .add(fNetAGBloss)  // fNetAGBloss é negativo
                .rename(ee.String('fLeftAGB_').cat(year_str));

            // --- ================================================================
            // --- NECROMASSA (Entradas)
            // --- ================================================================

            // Entrada por mortalidade
            var fAGNinput_Mortality = s_inAGBstock_update.multiply(aRef_netAGNgain);

            // Entrada por renovação natural (turnover)
            var fAGNinput_TurnOver = s_inAGBstock_update.multiply(p.turnover);

            // Total de entradas
            var fAGNinput = fAGNinput_Mortality
                .add(fAGNinput_TurnOver)
                .rename(ee.String('fAGNinput_').cat(year_str));

            // --- ================================================================
            // --- NECROMASSA (Saídas: Combustão)
            // --- ================================================================

            // Preparar estoque de necromassa do ano anterior
            var fLeftAGN_prev = ee.Image(output_image).select(
                ee.String('fLeftAGN_').cat(year_prev), null
            );

            var s_inAGNstock_update = litter
                .add(cdw)
                .updateMask(tsf_year.eq(0))  // Estoque original se TSF=0
                .blend(fLeftAGN_prev);        // Senão, usar estoque do ano anterior

            // --- COMBUSTÃO: Primeiro Incêndio (TSF = 0)
            var fAGNcomb_fwd_S = fwd
                .multiply(p.fwd_combf)
                .updateMask(tsf_year.eq(0));  // Apenas quando há primeiro fogo

            fAGNcomb_fwd_S = ee.Image(0).blend(fAGNcomb_fwd_S);

            var fAGNcomb_cwd_S = cdw
                .multiply(p.cwd_combf_s)
                .updateMask(tsf_year.eq(0));  // Apenas quando há primeiro fogo

            fAGNcomb_cwd_S = ee.Image(0).blend(fAGNcomb_cwd_S);

            var fAGNcomb_single = fAGNcomb_fwd_S.add(fAGNcomb_cwd_S);

            // --- COMBUSTÃO: Incêndios Recorrentes (frequência >= 2)
            // Em incêndios subsequentes, a necromassa já parcialmente decomposta queima
            var fAGNcomb_fwd_M = s_inAGNstock_update
                .multiply(ee.Image(1).subtract(p.cwd_part_m))
                .multiply(p.fwd_combf)
                .updateMask(freq_gte2_year);  // Apenas em incêndios múltiplos

            var fAGNcomb_cwd_M = s_inAGNstock_update
                .multiply(p.cwd_part_m)
                .multiply(p.cwd_combf_m)
                .updateMask(freq_gte2_year);  // Apenas em incêndios múltiplos

            fAGNcomb_cwd_M = ee.Image(0).blend(fAGNcomb_cwd_M);

            var fAGNcomb_multi = fAGNcomb_fwd_M.add(fAGNcomb_cwd_M);

            // Mesclar single e multi-fire combustion
            var fAGNcomb = fAGNcomb_single
                .blend(fAGNcomb_multi)
                .rename(ee.String('fAGNcomb_').cat(year_str));

            // --- ================================================================
            // --- NECROMASSA (Saídas: Decomposição)
            // --- ================================================================

            // Necromassa restante após combustão e decomposição
            var fLeftAGN = s_inAGNstock_update
                .add(fAGNinput)
                .subtract(fAGNcomb)
                .multiply(1 - p.decomp)  // Multiplicar por (1 - taxa decomposição)
                .rename(ee.String('fLeftAGN_').cat(year_str));

            // Necromassa que se decompõe (emissões não-combustão)
            var fAGNdecomp = s_inAGNstock_update
                .add(fAGNinput)
                .subtract(fAGNcomb)
                .multiply(p.decomp)
                .rename(ee.String('fAGNdecomp_').cat(year_str));

            // --- ================================================================
            // --- BALANÇO FINAL DE CARBONO
            // --- ================================================================
            // Mudança em AGB + mudança em AGN

            var fCBalance = fLeftAGB
                .subtract(s_inAGBstock_update)
                .add(fLeftAGN.subtract(s_inAGNstock_update))
                .rename(ee.String('fCBalance_').cat(year_str));

            // --- Adicionar bandas ao output (mascarado para o bioma)
            output_image = output_image
                .addBands(aRef_netAGBloss.where(biome_mask, 0))
                .addBands(aRef_netAGNgain.where(biome_mask, 0))
                .addBands(fNetAGBloss.where(biome_mask, 0))
                .addBands(fLeftAGB.where(biome_mask, 0))
                .addBands(fAGNinput.where(biome_mask, 0))
                .addBands(fAGNcomb.where(biome_mask, 0))
                .addBands(fAGNdecomp.where(biome_mask, 0))
                .addBands(fLeftAGN.where(biome_mask, 0))
                .addBands(fCBalance.where(biome_mask, 0));
        });

        return output_image;
    };

    // =========================================================================
    // EXECUTAR MODELO FATE PARA TODOS OS ANOS
    // =========================================================================

    var first_image = ee.Image()
        .rename('fLeftAGB_1985')
        .addBands(ee.Image().rename('fLeftAGN_1985'));

    var final_data = ee.Image(ee.List(years).iterate(fateModel, first_image));

    // =========================================================================
    // EXTRAIR OUTPUTS FINAIS
    // =========================================================================

    var fAGNcomb_bands = final_data.select('fAGNcomb_.*');
    var fCBalance_bands = final_data.select('fCBalance_.*');
    
    // =========================================================================
    // CRIAR MÁSCARA DE DEGRADAÇÃO (apenas áreas com fogo)
    // =========================================================================
    // Garante que emissões apareçam apenas em áreas que queimaram pelo menos uma vez
    
    var degradation_masks = ee.Image().select();
    years.forEach(function(year) {
        var year_str = ee.Number.parse(year).format('%d');
        var year_mask = fire_frequency
            .gte(1)
            .select(ee.String('.*_').cat(year_str))
            .selfMask()
            .multiply(0)  // Cria máscara 0/null
            .rename(ee.String('degradation_').cat(year_str));
        degradation_masks = degradation_masks.addBands(year_mask);
    });

    // =========================================================================
    // CONVERTER PARA EMISSÕES: tC/ha (padrão v036)
    // =========================================================================

    /**
     * CONVERSÃO DE UNIDADES
     *
     * SEEG_12 original:
     *   CO2: fAGNcomb × 0.099 + fCBalance × 1 → Mg CO2/ha
     *   CH4: fAGNcomb × 2000 × 6.8 → g CH4/ha
     *   N2O: fAGNcomb × 2000 × 0.2 → g N2O/ha
     *
     * v036 (padronizado):
     *   CO2: resultado em tC/ha (equivalente a Mg C/ha)
     *   CH4: resultado em t/ha (= kg/ha / 1000)
     *   N2O: resultado em t/ha
     *
     * Fator 0.099: proporção de carbono em CH4 + CO (calculado a partir de pesos moleculares)
     * Fator 2000: conversão de tC a kg de matéria seca (assumindo 50% de C em madeira seca)
     * Fatores de emissão: IPCC GHG emissions factors (g/kg de matéria seca queimada)
     *   CH4: 6.8 g/kg
     *   N2O: 0.2 g/kg
     */

    // CO2 em tC/ha
    // Balanço de carbono: combustão (considerando gases não-CO2) + decomposição + regeneração
    var CO2_bands = fAGNcomb_bands
        .multiply(0.099)                  // Descontar proporção perdida em CH4 e CO
        .add(fCBalance_bands)             // Adicionar balanço líquido (mortalidade - regeneração)
        .multiply(-1)                     // Converter para emissões (negativo = emissão)
        .multiply(3.67);                  // Converter tC a tCO2 (razão peso molecular)

    // Renomear bandas CO2
    var co2_band_names = years.map(function (y) { return 'CO2_tC_ha_' + y; });
    var CO2_final = CO2_bands.rename(years.map(function (y) { return 'fCBalance_' + y; }), co2_band_names);
    
    // Aplicar máscara de degradação (apenas áreas com fogo)
    var CO2_degradation = degradation_masks.select('degradation_.*');
    CO2_final = CO2_degradation.blend(CO2_final.selfMask());

    // CH4 em t/ha
    // fAGNcomb: tC/ha
    // matéria seca = tC × 2 (assumindo 50% C)
    // = tC × 2 × 1000 kg/t = tC × 2000 kg/ha
    // CH4 = matéria seca × 6.8 g/kg = tC × 2000 × 6.8 g/ha
    // = tC × 2000 × 6.8 × 10^-6 t/ha = tC × 0.0136 t/ha
    var CH4_bands = fAGNcomb_bands
        .multiply(2000)                   // Converter tC a kg de matéria seca
        .multiply(6.8)                    // IPCC EF para CH4 (g/kg)
        .divide(1e6);                     // Converter g/ha para t/ha

    var ch4_band_names = years.map(function (y) { return 'CH4_t_ha_' + y; });
    var CH4_final = CH4_bands.rename(years.map(function (y) { return 'fAGNcomb_' + y; }), ch4_band_names);
    
    // Aplicar máscara de degradação (apenas áreas com fogo)
    var CH4_degradation = degradation_masks.select('degradation_.*');
    CH4_final = CH4_degradation.blend(CH4_final.selfMask());

    // N2O em t/ha
    var N2O_bands = fAGNcomb_bands
        .multiply(2000)                   // Converter tC a kg de matéria seca
        .multiply(0.2)                    // IPCC EF para N2O (g/kg)
        .divide(1e6);                     // Converter g/ha para t/ha

    var n2o_band_names = years.map(function (y) { return 'N2O_t_ha_' + y; });
    var N2O_final = N2O_bands.rename(years.map(function (y) { return 'fAGNcomb_' + y; }), n2o_band_names);
    
    // Aplicar máscara de degradação (apenas áreas com fogo)
    var N2O_degradation = degradation_masks.select('degradation_.*');
    N2O_final = N2O_degradation.blend(N2O_final.selfMask());

    // =========================================================================
    // APLICAR MÁSCARA DE FLORESTA ESTÁVEL
    // =========================================================================

    CO2_final = CO2_final.updateMask(forest_mask.slice(1));  // slice(1) para remover banda de 1985
    CH4_final = CH4_final.updateMask(forest_mask.slice(1));
    N2O_final = N2O_final.updateMask(forest_mask.slice(1));

    // =========================================================================
    // RETORNAR RESULTADO FINAL
    // =========================================================================

    return CO2_final
        .addBands(CH4_final)
        .addBands(N2O_final);
};


/**
 * =============================================================================
 * EXEMPLO DE USO E VALIDAÇÃO
 * =============================================================================
 * Descomente a seção abaixo para testar contra SEEG_12 original
 */

///*
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var fire_annual = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1');
var fire_freq = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1').slice(0.40);
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
Map.addLayer(forest_mask.selfMask(), { palette: ['green'] }, 'Máscara Floresta', false);

// Camadas de Saída (Emissões)
Map.addLayer(fire_emissions.select('CO2_tC_ha_.*'), { bands: ['CO2_tC_ha_2023'], min: 0, max: 50, palette: ['white', 'orange', 'red'] }, 'CO2 Floresta 2023 (tC/ha)');
Map.addLayer(fire_emissions.select('CH4_t_ha_.*'), { bands: ['CH4_t_ha_2023'], min: 0, max: 0.1, palette: ['white', 'purple'] }, 'CH4 Floresta 2023 (t/ha)');
Map.addLayer(fire_emissions.select('N2O_t_ha_.*'), { bands: ['N2O_t_ha_2023'], min: 0, max: 0.01, palette: ['white', 'cyan'] }, 'N2O Floresta 2023 (t/ha)');

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