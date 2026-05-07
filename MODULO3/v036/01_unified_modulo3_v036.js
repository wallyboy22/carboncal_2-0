/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Emissões por Mudança de Uso e Degradação)
 * VERSÃO: v036
 * SCRIPT: 00_unified_modulo3_v036.js
 * DESCRIÇÃO: Orquestrador central do Módulo 3. Integra o processamento completo de 
 *            emissões por mudança de uso da terra e degradação florestal. Contém 
 *            a lógica de orquestração temporal e espacial, permitindo a execução 
 *            modular das equações de fogo, regeneração e exploração madeireira.
 * -----------------------------------------------------------------------------
 * INSTITUIÇÃO: IPAM Amazônia
 * EQUIPE CCAL: Ane Alencar; Bárbara Zimbres; Camila Silva; Celso Silva-Junior; 
 *              Edriano Souza; Isabel Silva; Lívia Laureto; Manuela Padilha; 
 *              Paulo Moutinho; Rebecca Maranhão; Valderli Piontekowski; Wallace Silva
 * ORGANIZAÇÃO: Bárbara Zimbres e Wallace Silva
 * CONTATO: https://ipam.org.br/contato/fale-conosco/
 * ATUALIZAÇÃO: 2026-04-30
 * =============================================================================
 */


// 1. PARÂMETROS GLOBAIS
var VERSION = 'v036';
var BASE_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/';
var FINAL_ASSET = 'projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO3-' + VERSION;
var SCALE = 30;
var MAX_PIX = 1e13;

var YEARS_ALL = [
    '1985', '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];

var YEARS_FIRE = YEARS_ALL.slice(1); // 1986–2024 (fogo começa em 1986)
var GWP_CH4 = 28;
var GWP_N2O = 265;
var TC_TO_TCO2 = 3.67;

// =============================================================================
// 2. DATASETS DE ENTRADA
// =============================================================================

// --- MapBiomas Col 10.1
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var desf_reg = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');

// --- QCN Retificada
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var agb = qcn.select('AGB');     // tC/ha
var bgb = qcn.select('BGB');     // tC/ha
var cdw = qcn.select('CDW');     // tC/ha
var litter = qcn.select('LITTER');  // tC/ha
var total = qcn.select('TOTAL');   // tC/ha

// --- MapBiomas Fire Col 4.1
var annual_burned = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1').select('burned_area_.*'); // 1985 - 2024
var fire_frequency = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1').select('fire_frequency_1985_.*'); // 1985 - 2024
var time_since_fire = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1').select('classification_.*'); // 1986 - 2024
var accumulated_burned = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_accumulated_burned_v1').select('fire_accumulated_1985_.*'); // 1985 - 2024

// --- Auxiliares
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var brazil_bounds = biomas.geometry().bounds();

// =============================================================================
// 3. PREPARAÇÃO DO USO DO SOLO E MÁSCARAS
// =============================================================================

// --- 3a. Corrige classe 7 (outras transições) no desf/reg via Forward-Backward
var desf_corrected = ee.Image(YEARS_ALL.reduce(function (acc, year, i) {
    var curr = desf_reg.select('classification_' + year);
    if (i === 0) return curr.rename('classification_' + year);
    var prev = ee.Image(acc).slice(-1);
    return ee.Image(acc).addBands(prev.where(curr.neq(7), curr).rename('classification_' + year));
}, null));

var desf_corrected_bwd = ee.Image(YEARS_ALL.slice().reverse().reduce(function (acc, year, i) {
    var curr = desf_corrected.select('classification_' + year);
    if (i === 0) return curr.rename('classification_' + year);
    var next = ee.Image(acc).slice(0, 1);
    return ee.Image(acc).addBands(next.where(curr.neq(7), curr).rename('classification_' + year));
}, null));

var desf_reg_corrected = desf_corrected.where(desf_corrected.eq(7), desf_corrected_bwd);

// --- 3b. Reclassificação binária do LULC (1=Antrópico, 2=Nativo)
var veg_classes = [3, 4, 5, 6, 49, 11, 12, 50, 29, 13];
var antr_classes = [15, 19, 39, 20, 40, 62, 41, 46, 47, 35, 48, 9, 21, 23, 24, 30, 25, 31];
var water_classes = [33];
var all_from = veg_classes.concat(antr_classes).concat(water_classes);
var all_to = veg_classes.map(function () { return 2; })
    .concat(antr_classes.map(function () { return 1; }))
    .concat(water_classes.map(function () { return 0; }));

var simple_lulc = lulc.multiply(0);
all_from.forEach(function (id, i) {
    simple_lulc = simple_lulc.where(lulc.eq(id), all_to[i]);
});

// --- 3c. Tipo de cobertura: 1=Campo, 2=Floresta
var grass_forest = lulc.multiply(0);
[3, 4, 5, 6, 49, 11, 12, 50, 29, 13].forEach(function (id, i) {
    var new_classes = [2, 2, 2, 2, 2, 1, 1, 1, 1, 1];
    grass_forest = grass_forest.where(lulc.eq(id), new_classes[i]);
});

// --- 3d. Máscaras de vegetação primária (classe 2 no desf_reg)
var forest_mask = ee.Image().select();
var savanna_mask = ee.Image().select();
var grassland_mask = ee.Image().select();

YEARS_ALL.forEach(function (y) {
    var prim = desf_reg_corrected.select('classification_' + y).eq(2);
    var lulc_y = lulc.select('classification_' + y);

    forest_mask = forest_mask.addBands(prim.and(lulc_y.eq(3)).rename('classification_' + y));
    savanna_mask = savanna_mask.addBands(prim.and(lulc_y.eq(4)).rename('classification_' + y));
    grassland_mask = grassland_mask.addBands(prim.and(lulc_y.eq(11).or(lulc_y.eq(12)).or(lulc_y.eq(50))).rename('classification_' + y));
});

// --- 3e. Máscara de área emersa (exclui pixels permanentemente submersos)
var always_submerged = lulc.eq(33).reduce(ee.Reducer.sum()).gte(38);

// =============================================================================
// 4. ESTOQUE DE BIOMASSA DINÂMICO
// =============================================================================

// --- 4a. Incremento de veg. secundária (age-based)
var sec_veg_increment = calcSecondaryVegIncrement({
    desf_reg_corrected: desf_reg_corrected,
    grass_forest: grass_forest,
    total_carbon: total,
    biomas: biomas,
    years: YEARS_ALL
});

// --- 4b. Estoque anual base (densidade tC/ha)
var biomass_stock = ee.Image().select();
YEARS_ALL.forEach(function (y) {
    var desf_y = desf_reg_corrected.select('classification_' + y);
    var sec_y = sec_veg_increment.select('sec_veg_increment_' + y).unmask(0);
    var stock_y = ee.Image(0)
        .where(desf_y.eq(2), total)
        .where(desf_y.eq(3).or(desf_y.eq(5)), sec_y)
        .updateMask(always_submerged.not())
        .rename('biomass_stock_' + y)
        .float();

    biomass_stock = biomass_stock.addBands(stock_y);
});

// =============================================================================
// 5. EMISSÕES POR DEGRADAÇÃO
// =============================================================================

var fire_forest = calcForestFireEmissions({
    annual_burned: annual_burned,
    fire_frequency: fire_frequency,
    time_since_fire: time_since_fire,
    agb: agb, cdw: cdw, litter: litter,
    forest_mask: forest_mask,
    biomas: biomas,
    years: YEARS_FIRE
});

var fire_savanna = calcSavannaFireEmissions({
    annual_burned: annual_burned,
    fire_frequency: fire_frequency,
    time_since_fire: time_since_fire,
    agb: agb, cdw: cdw, litter: litter,
    savanna_mask: savanna_mask,
    years: YEARS_FIRE
});

var fire_grassland = calcGrasslandFireEmissions({
    annual_burned: annual_burned,
    agb: agb, cdw: cdw, litter: litter,
    grassland_mask: grassland_mask,
    biomas: biomas,
    years: YEARS_FIRE
});

var logging = calcLoggingEmissions({
    agb: agb,
    forest_mask: forest_mask,
    amazon_mask: ee.Image(1).paint(biomas.filter(ee.Filter.equals('Bioma', 'Amazônia')), 1).eq(1),
    loss_fraction: 0.196,
    years: ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024']
});

// =============================================================================
// 6. INTEGRAÇÃO E BALANÇO FINAL
// =============================================================================

var pixel_area_ha = ee.Image.pixelArea().divide(10000);
var accumulated_degradation = ee.Image(0).rename('dummy');

var loss_fire_bands = ee.Image().select();
var loss_logging_bands = ee.Image().select();
var loss_deforestation_bands = ee.Image().select();
var gain_sec_veg_bands = ee.Image().select();
var loss_grassland_bands = ee.Image().select();
var stock_bands = ee.Image().select();

var past_stock = biomass_stock.select('biomass_stock_1985');

YEARS_FIRE.forEach(function (y, i) {
    // --- Dados em Densidade (t/ha ou tC/ha)
    var f_forest_CO2_tC = fire_forest.select('CO2_tC_ha_' + y).unmask(0);
    var f_forest_CH4_t = fire_forest.select('CH4_t_ha_' + y).unmask(0);
    var f_forest_N2O_t = fire_forest.select('N2O_t_ha_' + y).unmask(0);

    var f_savanna_CO2_tC = fire_savanna.select('CO2_tC_ha_' + y).unmask(0);
    var f_savanna_CH4_t = fire_savanna.select('CH4_t_ha_' + y).unmask(0);
    var f_savana_N2O_t = fire_savanna.select('N2O_t_ha_' + y).unmask(0);

    var f_grass_CH4_t = fire_grassland.select('CH4_t_ha_' + y).unmask(0);
    var f_grass_N2O_t = fire_grassland.select('N2O_t_ha_' + y).unmask(0);

    var logging_tC = (i >= YEARS_FIRE.indexOf('2017'))
        ? logging.select('logging_tC_ha_' + y).unmask(0)
        : ee.Image(0);

    // --- Balanço de Carbono (para atualizar estoque dinâmico)
    var accum_prev = accumulated_degradation.slice(-1);
    var accum_y = accum_prev
        .subtract(f_forest_CO2_tC)
        .subtract(f_savanna_CO2_tC)
        .subtract(logging_tC)
        .rename('accum_' + y);

    accumulated_degradation = accumulated_degradation.addBands(accum_y);

    var stock_bruto_y = biomass_stock.select('biomass_stock_' + y);
    var desf_y = desf_reg_corrected.select('classification_' + y);
    var stock_updated_y = stock_bruto_y.where(desf_y.eq(2), stock_bruto_y.add(accum_y.unmask(0))).rename('stock_' + y).float();

    // --- CÁLCULO DO BALANÇO ANUAL (Lógica Refinada)
    // 1. Mudança de estoque bruto no ano (tC/ha)
    var delta_stock_tC = past_stock.subtract(stock_updated_y);

    // 2. Degradação total no ano (tC/ha) - Apenas o componente CO2/Massa
    var degradation_tC_y = f_forest_CO2_tC.add(f_savanna_CO2_tC).add(logging_tC);

    // 3. Desmatamento Líquido (tC/ha -> tCO2e/pixel)
    // Subtraímos a degradação do balanço para evitar dupla contagem no mesmo ano
    var net_deforestation_tC = delta_stock_tC.subtract(degradation_tC_y).max(0);
    var is_deforestation = desf_y.eq(4).or(desf_y.eq(6));
    var loss_deforestation_y = net_deforestation_tC.multiply(TC_TO_TCO2).multiply(pixel_area_ha).multiply(is_deforestation);

    // 4. Ganho por Vegetação Secundária (tC/ha -> tCO2e/pixel)
    // O delta é negativo quando há ganho (Past < Current). Invertemos para positivo.
    var is_sec_veg = desf_y.eq(3).or(desf_y.eq(5));
    var gain_sec_veg_y = delta_stock_tC.min(0).abs().multiply(is_sec_veg).multiply(TC_TO_TCO2).multiply(pixel_area_ha);

    // --- Salvando as Bandas
    var fire_forest_total_tCO2e = f_forest_CO2_tC.multiply(TC_TO_TCO2)
        .add(f_forest_CH4_t.multiply(GWP_CH4))
        .add(f_forest_N2O_t.multiply(GWP_N2O));

    var fire_savanna_total_tCO2e = f_savanna_CO2_tC.multiply(TC_TO_TCO2)
        .add(f_savanna_CH4_t.multiply(GWP_CH4))
        .add(f_savana_N2O_t.multiply(GWP_N2O));

    loss_fire_bands = loss_fire_bands.addBands(
        fire_forest_total_tCO2e.add(fire_savanna_total_tCO2e)
            .multiply(pixel_area_ha).rename('loss_fire_' + y).float()
    );

    loss_grassland_bands = loss_grassland_bands.addBands(
        f_grass_CH4_t.multiply(GWP_CH4).add(f_grass_N2O_t.multiply(GWP_N2O))
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

    past_stock = stock_updated_y; // Atualiza para o próximo ano

    stock_bands = stock_bands.addBands(stock_updated_y);
});

var final_image = loss_fire_bands
    .addBands(loss_grassland_bands)
    .addBands(loss_logging_bands)
    .addBands(gain_sec_veg_bands)
    .addBands(loss_deforestation_bands)
    .addBands(stock_bands)
    .updateMask(always_submerged.not())
    .float();

// =============================================================================
// 7. EXPORT MANAGEMENT
// =============================================================================

function getMarkdownDescription(key) {
    var desc = '';
    switch (key) {
        case 'biomass_stock':
            desc = '## CCAL Módulo 3: Estoque de Biomassa\n\n' +
                '**Unidade**: `tC/ha`\n' +
                '**Descrição**: Estoque de carbono atualizado ano a ano, contabilizando crescimento secundário e perdas por degradação (fogo e extração madeireira) para áreas de vegetação natural.\n' +
                '**Bandas**: `biomass_stock_[ANO]`';
            break;
        case 'secondary_veg_increment':
            desc = '## CCAL Módulo 3: Incremento de Vegetação Secundária\n\n' +
                '**Unidade**: `tC/ha`\n' +
                '**Descrição**: Incremento anual de carbono para áreas de vegetação secundária, baseado na idade da vegetação (MapBiomas) e equações específicas por bioma.\n' +
                '**Bandas**: `sec_veg_increment_[ANO]`';
            break;
        case 'fire_forest_emissions':
            desc = '## CCAL Módulo 3: Emissões por Fogo em Florestas\n\n' +
                '**Unidades**: `tC/ha` (para CO2), `t/ha` (para CH4 e N2O)\n' +
                '**Descrição**: Emissões de gases de efeito estufa derivadas de queimadas em áreas florestais, incluindo biomassa acima do solo, liteira e madeira morta.\n' +
                '**Bandas**: `CO2_tC_ha_[ANO]`, `CH4_t_ha_[ANO]`, `N2O_t_ha_[ANO]`';
            break;
        case 'fire_savanna_emissions':
            desc = '## CCAL Módulo 3: Emissões por Fogo em Formações Savânicas\n\n' +
                '**Unidades**: `tC/ha` (para CO2), `t/ha` (para CH4 e N2O)\n' +
                '**Descrição**: Emissões de gases de efeito estufa derivadas de queimadas em áreas de savana (Cerrado, Caatinga, etc).\n' +
                '**Bandas**: `CO2_tC_ha_[ANO]`, `CH4_t_ha_[ANO]`, `N2O_t_ha_[ANO]`';
            break;
        case 'fire_grassland_emissions':
            desc = '## CCAL Módulo 3: Emissões por Fogo em Formações Campestres\n\n' +
                '**Unidades**: `t/ha` (para CH4 e N2O)\n' +
                '**Descrição**: Emissões de gases de efeito estufa (CH4 e N2O) derivadas de queimadas em áreas campestres. Assume-se que o CO2 é reabsorvido rapidamente.\n' +
                '**Bandas**: `CH4_t_ha_[ANO]`, `N2O_t_ha_[ANO]`';
            break;
        case 'logging_emissions':
            desc = '## CCAL Módulo 3: Emissões por Extração Madeireira Seletiva\n\n' +
                '**Unidade**: `tC/ha`\n' +
                '**Descrição**: Emissões por extração de madeira (geométrica e desordenada) na Amazônia, resultando na perda de biomassa.\n' +
                '**Bandas**: `logging_tC_ha_[ANO]`';
            break;
        case 'final_image':
            desc = '## CCAL Módulo 3: Balanço Consolidado de Carbono (' + VERSION + ')\n\n' +
                '**Unidades**: Várias (veja abaixo)\n' +
                '**Descrição**: Produto final unificado contendo todas as transições de uso e cobertura e suas emissões ou remoções totais por pixel.\n\n' +
                '### Bandas:\n' +
                '- `loss_deforestation_[ANO]`: Emissões líquidas por desmatamento (**tCO2e / pixel**)\n' +
                '- `loss_fire_[ANO]`: Emissões totais (CO2, CH4, N2O em GWP) por fogo em floresta e savana (**tCO2e / pixel**)\n' +
                '- `loss_grassland_[ANO]`: Emissões totais (CH4, N2O em GWP) por fogo em campo (**tCO2e / pixel**)\n' +
                '- `loss_selective_logging_[ANO]`: Emissões por extração madeireira (**tCO2e / pixel**)\n' +
                '- `gain_secondary_vegetation_[ANO]`: Remoção por crescimento de vegetação secundária (**tCO2e / pixel**)\n' +
                '- `stock_[ANO]`: Estoque dinâmico de carbono remanescente (**tC / ha**)';
            break;
        default:
            desc = 'Descrição não disponível para ' + key;
    }
    return desc;
}

var export_assets = {
    'biomass_stock': biomass_stock,
    'secondary_veg_increment': sec_veg_increment,
    'fire_forest_emissions': fire_forest,
    'fire_savanna_emissions': fire_savanna,
    'fire_grassland_emissions': fire_grassland,
    'logging_emissions': logging,
    'final_image': final_image
};

Object.keys(export_assets).forEach(function (key) {
    var image = export_assets[key];
    var exportName = key === 'final_image' ? 'CCAL_MODULO3_' + VERSION : key + '_' + VERSION;
    var assetId = key === 'final_image' ? FINAL_ASSET : BASE_ASSET + exportName;

    var image_to_export = image.float().set({
        'description': getMarkdownDescription(key)
    });

    Map.addLayer(image, {}, exportName, false);

    Export.image.toAsset({
        image: image_to_export,
        description: 'WSilva-' + exportName,
        assetId: assetId,
        region: brazil_bounds,
        scale: SCALE,
        maxPixels: MAX_PIX,
        pyramidingPolicy: key === 'final_image' ? 'median' : 'mean',
        overwrite: true
    });
    print('Task created for: ' + key);
});

// =============================================================================
// 10. EQUAÇÕES (FUNÇÕES PURAS)
// =============================================================================

function calcSecondaryVegIncrement(params) {
    var desf_reg = params.desf_reg_corrected;
    var gf = params.grass_forest;
    var total = params.total_carbon;
    var biomas = params.biomas;
    var years = params.years;

    var incr_table = {
        "Amazônia": { "F": { "gte20": 1.1698, "lt20": 4.7841 }, "G": { "gte20": 0, "lt20": 1.7000 } },
        "Caatinga": { "F": { "gte20": 0.5928, "lt20": 2.4378 }, "G": { "gte20": 0, "lt20": 0.6000 } },
        "Cerrado": { "F": { "gte20": 0.9484, "lt20": 3.8789 }, "G": { "gte20": 0, "lt20": 1.7000 } },
        "Mata Atlântica": { "F": { "gte20": 0.7780, "lt20": 3.1690 }, "G": { "gte20": 0, "lt20": 0.6000 } },
        "Pampa": { "F": { "gte20": 0.7340, "lt20": 2.9896 }, "G": { "gte20": 0, "lt20": 1.7000 } },
        "Pantanal": { "F": { "gte20": 0.9622, "lt20": 3.9159 }, "G": { "gte20": 0, "lt20": 1.7000 } }
    };

    var biome_list = ['Amazônia', 'Caatinga', 'Cerrado', 'Mata Atlântica', 'Pampa', 'Pantanal'];
    var biome_images = {};
    biome_list.forEach(function (b) {
        biome_images[b] = ee.Image(0).paint(biomas.filter(ee.Filter.eq('Bioma', b)), 1).eq(1);
    });

    var is_sec_veg = desf_reg.eq(3).or(desf_reg.eq(5));
    var age_stack = ee.Image(0);
    var stock_stack = ee.Image().select();

    years.forEach(function (year, i) {
        var sec_year = is_sec_veg.select('.*_' + year);
        var gf_year = gf.select('.*_' + year);
        var age_prev = age_stack.slice(-1);
        var age_year = age_prev.add(1).multiply(sec_year);

        age_stack = (i === 0) ? age_year : age_stack.addBands(age_year);

        var lt20 = age_year.lt(20).and(age_year.gt(0)), gte20 = age_year.gte(20);
        var prev_stock = (i === 0) ? ee.Image(0) : stock_stack.slice(-1).unmask(0);
        var increment_year = ee.Image(0).rename('sec_veg_increment_' + year);
        
        var is_forest = gf_year.neq(1);
        var is_grass = gf_year.eq(1);
        
        biome_list.forEach(function (b) {
            var bm = biome_images[b];
            var result_biome = prev_stock.rename('sec_veg_increment_' + year)
                .where(is_forest.and(lt20).and(bm), prev_stock.add(incr_table[b]['F'].lt20))
                .where(is_forest.and(gte20).and(bm), prev_stock.add(incr_table[b]['F'].gte20))
                .where(is_grass.and(lt20).and(bm), prev_stock.add(incr_table[b]['G'].lt20))
                .where(is_grass.and(gte20).and(bm), prev_stock.add(incr_table[b]['G'].gte20));

            increment_year = increment_year.where(bm.and(sec_year), result_biome);
        });

        increment_year = increment_year.where(increment_year.gt(total), total).float();
        stock_stack = stock_stack.addBands(increment_year);
    });

    return stock_stack;
}

function calcForestFireEmissions(params) {
    var annual_burned = params.annual_burned;
    var fire_frequency = params.fire_frequency;
    var time_since_fire = params.time_since_fire;
    var agb = params.agb; var cdw = params.cdw; var litter = params.litter;
    var forest_mask = params.forest_mask; var biomas = params.biomas; var years = params.years;

    var BIOME_DICT = {
        'Amazônia': { AGBloss_lookup: [0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011, 0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], turnover: 0.03, decomp: 0.19, fwd_combf: 0.683, cwd_combf_s: 0.643, cwd_combf_m: 0.824, cwd_part_m: 0.757 },
        'Caatinga': { AGBloss_lookup: [0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011, 0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], turnover: 0.03, decomp: 0.19, fwd_combf: 0.983, cwd_combf_s: 0.719, cwd_combf_m: 0.824, cwd_part_m: 0.757 },
        'Cerrado': { AGBloss_lookup: [0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011, 0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], turnover: 0.03, decomp: 0.19, fwd_combf: 0.683, cwd_combf_s: 0.629, cwd_combf_m: 0.824, cwd_part_m: 0.757 },
        'Mata Atlântica': { AGBloss_lookup: [0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011, 0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], turnover: 0.03, decomp: 0.19, fwd_combf: 0.683, cwd_combf_s: 0.643, cwd_combf_m: 0.824, cwd_part_m: 0.757 },
        'Pampa': { AGBloss_lookup: [0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011, 0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], turnover: 0.03, decomp: 0.19, fwd_combf: 0.683, cwd_combf_s: 0.629, cwd_combf_m: 0.824, cwd_part_m: 0.757 },
        'Pantanal': { AGBloss_lookup: [0, 0.104, 0.080, 0.060, 0.044, 0.032, 0.023, 0.016, 0.011, 0.008, 0.006, 0.004, 0.003, 0.002, 0.001, 0.001, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], turnover: 0.03, decomp: 0.19, fwd_combf: 0.683, cwd_combf_s: 0.629, cwd_combf_m: 0.824, cwd_part_m: 0.757 }
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
        // Filtro rigoroso conforme confirmado pelo usuário
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
}

function calcSavannaFireEmissions(params) {
    var annual_burned = params.annual_burned;
    var time_since_fire = params.time_since_fire;
    var fire_frequency = params.fire_frequency;
    var agb = params.agb; var litter = params.litter; var cdw = params.cdw;
    var mask = params.savanna_mask; var years = params.years;

    var EF = { CO2: 1613, CH4: 2.3, N2O: 0.21 };
    var combf_fwd = 0.873, combf_cwd = 0.331;

    var agb_factor_table = [
        [0, 0.10, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0.12, 0.11, 0.10, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0.15, 0.13, 0.11, 0.09, 0.07, 0.05, 0.03, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];

    var tsf_values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38];
    var tsf_edit = annual_burned.multiply(0).slice(1).blend(time_since_fire);

    var CO2_b = ee.Image().select();
    var CH4_b = ee.Image().select();
    var N2O_b = ee.Image().select();
    var prev_agb = agb;

    years.forEach(function (y) {
        var fire_y = annual_burned.select('.*_' + y);
        var tsf_y = tsf_edit.select('.*_' + y);
        var freq_y = fire_frequency.select('.*_' + y);
        var pixel_mask = fire_y.multiply(mask.select('.*_' + y));

        var factor = tsf_y.remap(tsf_values, agb_factor_table[0])
            .where(freq_y.gte(2), tsf_y.remap(tsf_values, agb_factor_table[1]))
            .where(freq_y.gte(3), tsf_y.remap(tsf_values, agb_factor_table[2]));

        var co2_y = prev_agb.multiply(factor).multiply(pixel_mask).rename('CO2_tC_ha_' + y).float();
        prev_agb = prev_agb.subtract(prev_agb.multiply(factor).multiply(pixel_mask).unmask(0));

        var comb_total = litter.multiply(combf_fwd).add(cdw.add(agb.multiply(0.1)).multiply(combf_cwd));
        CH4_b = CH4_b.addBands(comb_total.multiply(2000).multiply(EF.CH4).divide(1e6).multiply(pixel_mask).rename('CH4_t_ha_' + y).float());
        N2O_b = N2O_b.addBands(comb_total.multiply(2000).multiply(EF.N2O).divide(1e6).multiply(pixel_mask).rename('N2O_t_ha_' + y).float());
        CO2_b = CO2_b.addBands(co2_y);
    });
    return CO2_b.addBands(CH4_b).addBands(N2O_b);
}

function calcGrasslandFireEmissions(params) {
    var annual_burned = params.annual_burned;
    var agb = params.agb; var cdw = params.cdw; var litter = params.litter;
    var mask = params.grassland_mask; var biomas = params.biomas; var years = params.years;

    var EF = { CH4: 2.3, N2O: 0.21 };
    var combf = 0.883;

    var CH4_b = ee.Image().select();
    var N2O_b = ee.Image().select();

    years.forEach(function (y) {
        var fire_y = annual_burned.select('.*_' + y);
        var mask_y = mask.select('.*_' + y);
        var comb_total = litter.add(agb).add(cdw).multiply(combf);
        var pixel_mask = fire_y.multiply(mask_y);

        CH4_b = CH4_b.addBands(comb_total.multiply(2000).multiply(EF.CH4).divide(1e6).multiply(pixel_mask).rename('CH4_t_ha_' + y).float());
        N2O_b = N2O_b.addBands(comb_total.multiply(2000).multiply(EF.N2O).divide(1e6).multiply(pixel_mask).rename('N2O_t_ha_' + y).float());
    });
    return CH4_b.addBands(N2O_b);
}

function calcLoggingEmissions(params) {
    var agb = params.agb;
    var forest_mask = params.forest_mask;
    var amazon_mask = params.amazon_mask;
    var loss_fraction = params.loss_fraction;
    var years = params.years;

    var agbUpdated = agb;
    var result = ee.Image().select();

    years.forEach(function (year) {
        var dis = ee.Image('projects/ee-ipam/assets/MRV_REDD_PARA/0_Activity_Year/degradation_' + year + '_sl_disordered').unmask(0);
        var geo = ee.Image('projects/ee-ipam/assets/MRV_REDD_PARA/0_Activity_Year/degradation_' + year + '_sl_geometric').unmask(0);
        var sl_year = dis.eq(1).or(geo.eq(1)).multiply(forest_mask.select('.*_' + year)).multiply(amazon_mask);

        var logging_carbon_year = agbUpdated.multiply(sl_year).multiply(loss_fraction).rename('logging_tC_ha_' + year).float();
        agbUpdated = agbUpdated.subtract(logging_carbon_year.unmask(0));
        result = result.addBands(logging_carbon_year);
    });
    return result;
}

/**
 * =============================================================================
 * AUDITOR TÉCNICO PREMIUM (v036)
 * =============================================================================
 * Para ativar o auditor, descomente a linha abaixo.
 */
// initCCALInspector(final_image, {
//   lulc: lulc, desf_reg: desf_reg_corrected, fire_annual: annual_burned, 
//   fire_freq: fire_frequency.slice(0,40), fire_tsf: time_since_fire, 
//   stock_in: biomass_stock, fire_forest: fire_forest, 
//   fire_savanna: fire_savanna, fire_grassland: fire_grassland, logging: logging
// });

function initCCALInspector(final_image, tech_assets) {
    var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');
    var paletaTrans = ["#ffffff", '#faf5d1', '#3f7849', '#5bcf20', '#ea1c1c', '#b4f792', '#fe9934', '#303149'];
    var paletaStock = ["#440154", "#46327e", "#365c8d", "#277f8e", "#1fa187", "#4ac16d", "#a0da39", "#fde725"];

    var config = {
        lulc_orig: true, trans_orig: false, trans_adj: true, fire_annual: false, fire_freq: false, fire_tsf: false, stock_in: false,
        fire_forest: false, fire_forest_co2: false, fire_forest_ch4: false, fire_forest_n2o: false,
        fire_savanna: false, fire_savanna_co2: false, fire_savanna_ch4: false, fire_savanna_n2o: false,
        fire_grassland: false, fire_grassland_ch4: false, fire_grassland_n2o: false,
        logging_raw: false, out_stock: true, out_fire: false, out_logging: false, out_secveg: false, out_defor: true,
        year: true, unit: 'tCO2e/ha', is_transposed: true, last_data: null
    };

    var row_titles = {
        'year': 'Year', 'lulc_orig': 'LULC', 'trans_orig': 'TRANS.O', 'trans_adj': 'TRANS.C', 'fire_annual': 'BURN', 'fire_freq': 'FREQ', 'fire_tsf': 'TSF', 'stock_in': 'Stk.In',
        'logging_raw': 'Log.Raw', 'fire_forest': '🔥For', 'fire_forest_co2': '↳ CO2', 'fire_forest_ch4': '↳ CH4', 'fire_forest_n2o': '↳ N2O',
        'fire_savanna': '🔥Sav', 'fire_savanna_co2': '↳ CO2', 'fire_savanna_ch4': '↳ CH4', 'fire_savanna_n2o': '↳ N2O',
        'fire_grassland': '🔥Gra', 'fire_grassland_ch4': '↳ CH4', 'fire_grassland_n2o': '↳ N2O',
        'out_stock': 'Stk.Out', 'out_fire': 'Loss.F', 'out_logging': 'Loss.L', 'out_secveg': 'Gain.V', 'out_defor': '📉Def'
    };

    function convertValue(val, unit) {
        var f_massa = (unit.indexOf('kg') !== -1) ? 1000 : 1;
        var f_quimico = (unit.indexOf('CO2e') !== -1) ? TC_TO_TCO2 : 1;
        return val * f_massa * f_quimico;
    }

    function getColor(key, val) {
        if (val === null || val === undefined || isNaN(val) || val === 0 || val === ' ') return '#ffffff';
        var palette = []; var color = '#ffffff';
        if (key === 'lulc_orig') color = paletaMapBiomas[val];
        else if (key === 'trans_orig' || key === 'trans_adj') color = paletaTrans[val];
        else if (key === 'stock_in' || key === 'out_stock') {
            palette = paletaStock;
            var i = Math.min(palette.length - 1, Math.max(0, Math.floor((val / 250) * (palette.length - 1))));
            color = palette[i];
        }
        else if (key === 'fire_annual') color = val > 0 ? '#ea1c1c' : '#ffffff';
        else if (key === 'fire_freq') {
            palette = ['#ffffcc', '#fed976', '#fd8d3c', '#fc4e2a', '#e31a1c', '#800026'];
            var i = Math.min(palette.length - 1, Math.max(0, Math.floor((val / 20) * (palette.length - 1))));
            color = palette[i];
        }
        else if (key === 'fire_tsf') {
            palette = ['#ffffd4', '#fed98e', '#fe9929', '#d95f0e', '#993404'];
            var i = Math.min(palette.length - 1, Math.max(0, Math.floor((val / 40) * (palette.length - 1))));
            color = palette[i];
        }
        else if (key === 'out_defor') color = val > 0 ? '#ffcccc' : '#ffffff';
        else if (key === 'out_secveg') color = val > 0 ? '#ccffcc' : '#ffffff';
        else if (key === 'out_fire') color = val > 0 ? '#ffddbb' : '#ffffff';
        else if (key === 'out_logging') color = val > 0 ? '#eeddcc' : '#ffffff';

        if (!color) return '#ffffff';
        if (typeof color === 'string' && color.indexOf('#') !== 0) return '#' + color;
        return typeof color === 'string' ? color : '#ffffff';
    }

    var panel = ui.Panel({ style: { padding: '8px', width: '350px' } });
    var inspector_results = ui.Panel();
    var matrix_outer = ui.Panel({ style: { stretch: 'both', padding: '2px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6' } });

    panel.add(ui.Label('CCAL M3 Auditor v036', { fontWeight: 'bold', fontSize: '18px', color: '#2c3e50' }));
    panel.add(inspector_results);
    panel.add(ui.Button({ label: '🔄 Inverter Matriz', onClick: function () { config.is_transposed = !config.is_transposed; if (config.last_data) renderMatrix(config.last_data); }, style: { stretch: 'horizontal' } }));

    var unit_panel = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal'), style: { margin: '5px 0' } });
    unit_panel.add(ui.Label('Exibir em:', { fontSize: '11px', fontWeight: 'bold' }));
    unit_panel.add(ui.Select({ items: ['tCO2e/ha', 'tC/ha', 'kgCO2e/ha', 'kgC/ha'], value: config.unit, onChange: function (v) { config.unit = v; if (config.last_data) renderMatrix(config.last_data); } }));
    panel.add(unit_panel);
    panel.add(matrix_outer);

    function renderMatrix(obj) {
        matrix_outer.clear();
        var container = ui.Panel({ layout: config.is_transposed ? ui.Panel.Layout.flow('vertical') : ui.Panel.Layout.flow('horizontal') });
        matrix_outer.add(container);
        var l_w = '55px', l_m = '1px', active_keys = Object.keys(row_titles).filter(function (k) { return config[k] });

        var title_panel = ui.Panel({ layout: config.is_transposed ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'), style: { backgroundColor: '#e9ecef', border: '1px solid #adb5bd', margin: l_m } });
        active_keys.forEach(function (k) { title_panel.add(ui.Label(row_titles[k], { fontWeight: 'bold', fontSize: '8px', width: l_w, textAlign: 'center', margin: l_m })); });
        container.add(title_panel);

        YEARS_ALL.forEach(function (year) {
            var sub = ui.Panel({ layout: config.is_transposed ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'), style: { borderBottom: '1px solid #eee' } });
            active_keys.forEach(function (k) {
                var val = '--', style = { margin: l_m, fontSize: '9px', width: l_w, textAlign: 'center' };
                if (k === 'lulc_orig') {
                    var l = obj['lulc_' + year]; val = l ? ('00' + l).slice(-2) : '--';
                    var c = paletaMapBiomas[l];
                    style.backgroundColor = c ? (c.indexOf('#') === 0 ? c : '#' + c) : '#ffffff';
                }
                else if (k === 'year') val = year.slice(-2);
                else {
                    var base = 0;
                    if (k === 'stock_in') base = obj['stock_in_' + year] || 0;
                    else if (k === 'trans_orig') base = obj['trans_orig_' + year] || 0;
                    else if (k === 'trans_adj') base = obj['trans_adj_' + year] || 0;
                    else if (k === 'out_stock') base = obj['stock_' + year] || 0;
                    else if (k === 'out_fire' || k === 'out_defor' || k === 'out_logging' || k === 'out_secveg') {
                        var area_fact = obj.pixel_area_ha || 0.09;
                        var raw_px = (k === 'out_fire') ? (obj['loss_fire_' + year] || 0) : (k === 'out_logging') ? (obj['loss_selective_logging_' + year] || 0) : (k === 'out_defor') ? (obj['loss_deforestation_' + year] || 0) : (obj['gain_secondary_vegetation_' + year] || 0);
                        base = (raw_px / area_fact) / TC_TO_TCO2;
                    }
                    else if (k === 'fire_annual') base = obj['burn_' + year] || 0;
                    else if (k === 'fire_freq') base = obj['freq_' + year] || 0;
                    else if (k === 'fire_tsf') base = obj['tsf_' + year] || 0;
                    else if (k === 'logging_raw') base = obj['log_logging_tC_ha_' + year] || 0;
                    else if (k.indexOf('fire_forest') !== -1) {
                        var p = 'ff_CO2_tC_ha'; if (k.indexOf('_ch4') !== -1) p = 'ff_CH4_t_ha'; if (k.indexOf('_n2o') !== -1) p = 'ff_N2O_t_ha';
                        base = obj[p + '_' + year] || 0;
                    }
                    else if (k.indexOf('fire_savanna') !== -1) {
                        var p = 'fs_CO2_tC_ha'; if (k.indexOf('_ch4') !== -1) p = 'fs_CH4_t_ha'; if (k.indexOf('_n2o') !== -1) p = 'fs_N2O_t_ha';
                        base = obj[p + '_' + year] || 0;
                    }
                    else if (k.indexOf('fire_grassland') !== -1) {
                        var p = 'fg_CH4_t_ha'; if (k.indexOf('_n2o') !== -1) p = 'fg_N2O_t_ha';
                        base = obj[p + '_' + year] || 0;
                    }

                    var is_gas = (k.indexOf('_ch4') !== -1 || k.indexOf('_n2o') !== -1);
                    var is_class = ['trans_orig', 'trans_adj', 'fire_annual', 'fire_freq', 'fire_tsf'].indexOf(k) !== -1;
                    if (is_class) val = (base !== null && base !== undefined) ? base.toFixed(0) : '--';
                    else {
                        var conv = is_gas ? (base || 0) : convertValue(base || 0, config.unit);
                        val = (conv > 0.0001 || conv < -0.0001) ? conv.toFixed(is_gas ? 3 : 1) : ' ';
                        base = conv;
                    }
                    style.color = '#000000'; style.backgroundColor = getColor(k, parseFloat(base)) || '#ffffff';
                    var hex = style.backgroundColor;
                    if (hex && hex.indexOf('#') === 0) {
                        var h = hex.replace('#', ''), r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
                        if ((r * 0.299 + g * 0.587 + b * 0.114) < 128) style.color = '#ffffff';
                    }
                }
                sub.add(ui.Label(String(val), style));
            });
            container.add(sub);
        });
    }

    Map.onClick(function (coords) {
        matrix_outer.clear(); matrix_outer.add(ui.Label('Auditando pixel...'));
        var point = ee.Geometry.Point(coords.lon, coords.lat);
        var combined = ee.Image(0).rename('base_zero')
            .addBands(ee.Image.pixelArea().divide(10000).rename('pixel_area_ha'))
            .addBands(final_image.unmask(0))
            .addBands(tech_assets.stock_in.unmask(0).rename(YEARS_ALL.map(function (y) { return 'stock_in_' + y })))
            .addBands(tech_assets.lulc.select('classification_.*').unmask(0).rename(YEARS_ALL.map(function (y) { return 'lulc_' + y })))
            .addBands(tech_assets.desf_reg.select('classification_.*').unmask(0).rename(YEARS_ALL.map(function (y) { return 'trans_orig_' + y })))
            .addBands(tech_assets.fire_annual.select('burned_area_.*').unmask(0).rename(YEARS_ALL.map(function (y) { return 'burn_' + y })))
            .addBands(tech_assets.fire_freq.select('fire_frequency_1985_.*').unmask(0).rename(YEARS_ALL.map(function (y) { return 'freq_' + y })))
            .addBands(tech_assets.fire_tsf.select('classification_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'tsf_' + y })))
            .addBands(tech_assets.fire_forest.select('CO2_tC_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'ff_CO2_tC_ha_' + y })))
            .addBands(tech_assets.fire_forest.select('CH4_t_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'ff_CH4_t_ha_' + y })))
            .addBands(tech_assets.fire_forest.select('N2O_t_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'ff_N2O_t_ha_' + y })))
            .addBands(tech_assets.fire_savanna.select('CO2_tC_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'fs_CO2_tC_ha_' + y })))
            .addBands(tech_assets.fire_savanna.select('CH4_t_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'fs_CH4_t_ha_' + y })))
            .addBands(tech_assets.fire_savanna.select('N2O_t_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'fs_N2O_t_ha_' + y })))
            .addBands(tech_assets.fire_grassland.select('CH4_t_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'fg_CH4_t_ha_' + y })))
            .addBands(tech_assets.fire_grassland.select('N2O_t_ha_.*').unmask(0).rename(YEARS_FIRE.map(function (y) { return 'fg_N2O_t_ha_' + y })))
            .addBands(tech_assets.logging.select('logging_tC_ha_.*').unmask(0).rename(['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'].map(function (y) { return 'log_logging_tC_ha_' + y })));

        combined.reduceRegion({ reducer: ee.Reducer.mean(), geometry: point.buffer(10), scale: 30 }).evaluate(function (obj) {
            if (!obj) return; config.last_data = obj; renderMatrix(obj);
        });
    });
    ui.root.insert(0, panel); Map.style().set('cursor', 'crosshair');
}
