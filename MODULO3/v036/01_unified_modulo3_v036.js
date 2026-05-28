/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Emissões por Mudança de Uso e Degradação)
 * VERSÃO: v036 (MODULAR)
 * SCRIPT: 01_unified_modulo3_v036.js
 * DESCRIÇÃO: Orquestrador central do Módulo 3 — consome os módulos de equação
 *            via require(). Integra o processamento completo de emissões por
 *            mudança de uso da terra e degradação florestal.
 * -----------------------------------------------------------------------------
 * INSTITUIÇÃO: IPAM Amazônia
 * EQUIPE CCAL: Ane Alencar; Bárbara Zimbres; Camila Silva; Celso Silva-Junior; 
 *              Edriano Souza; Isabel Silva; Lívia Laureto; Manuela Padilha; 
 *              Paulo Moutinho; Rebecca Maranhão; Valderli Piontekowski; Wallace Silva
 * ORGANIZAÇÃO: Bárbara Zimbres e Wallace Silva
 * CONTATO: https://ipam.org.br/contato/fale-conosco/
 * ATUALIZAÇÃO: 2026-05-28
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

// --- Módulos de equação (require)
var secVeg  = require('users/workspaceipam/CCAL:MODULO3/v036/equations/01_secondary_veg');
var fireFor = require('users/workspaceipam/CCAL:MODULO3/v036/equations/02_fire_forest');
var fireSav = require('users/workspaceipam/CCAL:MODULO3/v036/equations/03_fire_savanna');
var fireGra = require('users/workspaceipam/CCAL:MODULO3/v036/equations/04_fire_grassland');
var loggM   = require('users/workspaceipam/CCAL:MODULO3/v036/equations/05_logging');

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
var sec_veg_increment = secVeg.calcSecondaryVegIncrement({
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

var fire_forest = fireFor.calcForestFireEmissions({
    annual_burned: annual_burned,
    fire_frequency: fire_frequency,
    time_since_fire: time_since_fire,
    agb: agb, cdw: cdw, litter: litter,
    forest_mask: forest_mask,
    biomas: biomas,
    years: YEARS_FIRE
});

var fire_savanna = fireSav.calcSavannaFireEmissions({
    annual_burned: annual_burned,
    fire_frequency: fire_frequency,
    time_since_fire: time_since_fire,
    agb: agb, cdw: cdw, litter: litter,
    savanna_mask: savanna_mask,
    years: YEARS_FIRE
});

var fire_grassland = fireGra.calcGrasslandFireEmissions({
    annual_burned: annual_burned,
    agb: agb, cdw: cdw, litter: litter,
    grassland_mask: grassland_mask,
    biomas: biomas,
    years: YEARS_FIRE
});

var logging = loggM.calcLoggingEmissions({
    agb: agb,
    forest_mask: forest_mask,
    amazon_mask: ee.Image(0).paint(biomas.filter(ee.Filter.equals('Bioma', 'Amazônia')), 1).eq(1),
    loss_fraction: 0.196,
    years: ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024']
});

// =============================================================================
// 6. INTEGRAÇÃO E BALANÇO FINAL
// =============================================================================

var pixel_area_ha = ee.Image.pixelArea().divide(10000);
var accumulated_degradation = ee.Image(0).rename('dummy');
var hist_deg_mask = ee.Image(0);

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

    var fire_degr_co2e = fire_forest_total_tCO2e.add(fire_savanna_total_tCO2e);
    var logging_co2e = logging_tC.multiply(TC_TO_TCO2);

    // Cicatriz de degradação: pixel fica marcado se degradado ao menos 1x, zera se desmatado
    var has_degradation_now = fire_degr_co2e.gt(0).or(logging_co2e.gt(0));
    hist_deg_mask = hist_deg_mask.or(has_degradation_now).and(desf_y.eq(2));

    // Convergência no mesmo ano (fogo floresta/savana + corte seletivo)
    var is_convergence = fire_forest_total_tCO2e.gt(0).and(logging_co2e.gt(0));
    var convergence_co2e = fire_forest_total_tCO2e.add(logging_co2e).updateMask(is_convergence);

    loss_fire_bands = loss_fire_bands.addBands(
        fire_degr_co2e.multiply(pixel_area_ha).updateMask(hist_deg_mask).rename('loss_fire_' + y).float()
    );

    loss_grassland_bands = loss_grassland_bands.addBands(
        f_grass_CH4_t.multiply(GWP_CH4).add(f_grass_N2O_t.multiply(GWP_N2O))
            .multiply(pixel_area_ha).selfMask().rename('loss_grassland_' + y).float()
    );

    loss_logging_bands = loss_logging_bands.addBands(
        logging_co2e.multiply(pixel_area_ha).updateMask(hist_deg_mask).rename('loss_selective_logging_' + y).float()
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
