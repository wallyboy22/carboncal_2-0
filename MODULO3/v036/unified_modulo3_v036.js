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
// =============================================================================
// CCAL Módulo 3 — v036 (Unified Script)
// Script principal: carrega dados, executa equações e exporta resultados.
// Regra: mapeamento da área emersa do Brasil (exclui água permanente).
// =============================================================================

// =============================================================================
// 1. PARÂMETROS GLOBAIS
// =============================================================================
var VERSION = 'v036';
var BASE_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/';
var FINAL_ASSET = 'projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO3-' + VERSION;
var SCALE = 30;
var MAX_PIX = 1e13;

var YEARS_ALL = ['1985', '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];

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

// --- QCN Retificada (bandas separadas para clareza de uso nos módulos)
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var agb = qcn.select('AGB');    // tC/ha — Above Ground Biomass
var bgb = qcn.select('BGB');    // tC/ha — Below Ground Biomass
var cdw = qcn.select('CDW');    // tC/ha — Coarse Dead Wood
var litter = qcn.select('LITTER');// tC/ha — Fine Dead Wood / Litter
var total = qcn.select('TOTAL'); // tC/ha — AGB+BGB+CDW+LITTER

// --- MapBiomas Fire Col 4.1
var annual_burned = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1').selfMask();
var fire_frequency = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1').slice(0, 40);
var time_since_fire = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1');
var accumulated_burned = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_accumulated_burned_v1').slice(0, 40);

// --- Auxiliares
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var brazil_bounds = biomas.geometry().bounds();

// =============================================================================
// 3. PREPARAÇÃO DO USO DO SOLO E MÁSCARAS (INLINE)
// =============================================================================

// --- 3a. Corrige classe 7 (outras transições) no desf/reg
var desf_corrected = ee.Image(YEARS_ALL.reduce(function (acc, year, i) {
    var curr = desf_reg.select('classification_' + year);
    if (i === 0) return curr.rename('classification_' + year);
    var prev = ee.Image(acc).slice(-1);
    return ee.Image(acc).addBands(prev.where(curr.neq(7), curr).rename('classification_' + year));
}, null));

// Propagação inversa (backward fill) para pixels que começam em 7
var desf_corrected_bwd = ee.Image(YEARS_ALL.slice().reverse().reduce(function (acc, year, i) {
    var curr = desf_corrected.select('classification_' + year);
    if (i === 0) return curr.rename('classification_' + year);
    var next = ee.Image(acc).slice(0, 1);
    return ee.Image(acc).addBands(next.where(curr.neq(7), curr).rename('classification_' + year));
}, null));

// Merge: usa o corrigido forward; onde ainda 7, usa backward
var desf_reg_corrected = desf_corrected.where(desf_corrected.eq(7), desf_corrected_bwd);

// --- 3b. Reclassificação binária do LULC (para uso interno)
// 1 = Antrópico, 2 = Vegetação nativa
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

// --- 3c. Tipo de cobertura para cálculo de incremento: 1=Campo, 2=Floresta
var grass_forest = lulc.multiply(0);
[3, 4, 5, 6, 49, 11, 12, 50, 29, 13].forEach(function (id, i) {
    var new_classes = [2, 2, 2, 2, 2, 1, 1, 1, 1, 1];
    grass_forest = grass_forest.where(lulc.eq(id), new_classes[i]);
});

// --- 3d. Máscaras por tipo de vegetação estável (classe 2 = Veg Primária no desf/reg)
var forest_mask = ee.Image().select();
var savanna_mask = ee.Image().select();
var grassland_mask = ee.Image().select();

YEARS_ALL.forEach(function (y) {
    var prim = desf_reg_corrected.select('classification_' + y).eq(2);
    var lulc_y = lulc.select('classification_' + y);

    forest_mask = forest_mask.addBands(prim.and(lulc_y.eq(3)).rename('classification_' + y));
    savanna_mask = savanna_mask.addBands(prim.and(lulc_y.eq(4)).rename('classification_' + y));
    grassland_mask = grassland_mask.addBands(prim.and(lulc_y.eq([11, 12, 50])).reduce('max').rename('classification_' + y));
});

// --- 3e. Máscara de área emersa (exclui pixels permanentemente submersos)
var water_count = lulc.eq(33).reduce(ee.Reducer.sum());
var always_submerged = water_count.gte(38); // 1 = sempre submerso → EXCLUIR

// =============================================================================
// 4. ESTOQUE DE BIOMASSA PRIMÁRIA E SECUNDÁRIA ANUAL
// =============================================================================

// --- 4a. Incremento de veg. secundária
var sec_veg_increment_params = {
    desf_reg_corrected: desf_reg_corrected,
    grass_forest: grass_forest,
    total_carbon: total,
    biomas: biomas,
    years: YEARS_ALL
};

var sec_veg_increment = calcSecondaryVegIncrement(sec_veg_increment_params);

// --- 4b. Estoque anual: primária=total QCN, secundária=incremento, outros=0
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
    accumulated_burned: accumulated_burned,
    agb: agb, cdw: cdw, litter: litter,
    grassland_mask: grassland_mask,
    biomas: biomas,
    years: YEARS_FIRE
});

var logging = calcLoggingEmissions({
    agb: agb,
    forest_mask: forest_mask,
    amazon_mask: ee.Image(1).paint(biomas.filter(ee.Filter.equals('Bioma', 'Amazônia'))).neq(1),
    loss_fraction: 0.196,
    years: ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024']
});

// =============================================================================
// 6. INTEGRAÇÃO: DESCONTO DE DEGRADAÇÃO E BALANÇO DESMAT/REG
// =============================================================================

var pixel_area_ha = ee.Image.pixelArea().divide(10000);
var accumulated_degradation = ee.Image(0).rename('dummy');

var loss_fire_bands = ee.Image().select();
var loss_logging_bands = ee.Image().select();
var loss_convergence_bands = ee.Image().select();
var loss_grassland_bands = ee.Image().select();
var loss_deforestation_bands = ee.Image().select();
var gain_sec_veg_bands = ee.Image().select();
var stock_bands = ee.Image().select();

var past_stock = biomass_stock.select('biomass_stock_1985');

YEARS_FIRE.forEach(function (y, i) {

    var fire_forest_tC = fire_forest.select('CO2_tC_ha_' + y).unmask(0);
    var fire_savanna_tC = fire_savanna.select('CO2_tCO2e_ha_' + y).unmask(0).divide(TC_TO_TCO2);

    var logging_tC = (i >= YEARS_FIRE.indexOf('2017'))
        ? logging.select('logging_tC_ha_' + y).unmask(0)
        : ee.Image(0);

    var accum_prev = accumulated_degradation.slice(-1);
    var accum_y = accum_prev
        .subtract(fire_forest_tC)
        .subtract(fire_savanna_tC)
        .subtract(logging_tC)
        .rename('accum_' + y);

    accumulated_degradation = accumulated_degradation.addBands(accum_y);

    var stock_bruto_y = biomass_stock.select('biomass_stock_' + y);
    var desf_y = desf_reg_corrected.select('classification_' + y);

    var stock_updated_y = stock_bruto_y.where(
        desf_y.eq(2),
        stock_bruto_y.add(accum_y.unmask(0))
    ).rename('stock_' + y).float();

    var def_reg_balance_y = past_stock.subtract(stock_updated_y).multiply(TC_TO_TCO2);
    past_stock = stock_updated_y;

    var fire_co2e_y = fire_forest_tC.add(fire_savanna_tC).multiply(TC_TO_TCO2);
    var fire_ch4 = fire_forest.select('CH4_t_ha_' + y).unmask(0)
        .add(fire_savanna.select('CH4_t_ha_' + y).unmask(0))
        .multiply(GWP_CH4);
    var fire_n2o = fire_forest.select('N2O_t_ha_' + y).unmask(0)
        .add(fire_savanna.select('N2O_t_ha_' + y).unmask(0))
        .multiply(GWP_N2O);
    var fire_total_co2e = fire_co2e_y.add(fire_ch4).add(fire_n2o);

    loss_fire_bands = loss_fire_bands.addBands(
        fire_total_co2e.multiply(pixel_area_ha).rename('loss_fire_' + y).float()
    );

    var log_co2e_y = logging_tC.multiply(TC_TO_TCO2);
    loss_logging_bands = loss_logging_bands.addBands(
        log_co2e_y.multiply(pixel_area_ha).rename('loss_selective_logging_' + y).float()
    );

    loss_convergence_bands = loss_convergence_bands.addBands(
        fire_total_co2e.add(log_co2e_y).multiply(pixel_area_ha).rename('loss_convergence_degradation_' + y).float()
    );

    var grass_ch4 = fire_grassland.select('CH4_t_ha_' + y).unmask(0).multiply(GWP_CH4);
    var grass_n2o = fire_grassland.select('N2O_t_ha_' + y).unmask(0).multiply(GWP_N2O);
    loss_grassland_bands = loss_grassland_bands.addBands(
        grass_ch4.add(grass_n2o).multiply(pixel_area_ha).rename('loss_grassland_' + y).float()
    );

    loss_deforestation_bands = loss_deforestation_bands.addBands(
        def_reg_balance_y.max(0).multiply(pixel_area_ha).rename('loss_deforestation_' + y).float()
    );
    var sec_veg_mask = desf_y.eq(3).or(desf_y.eq(5));
    gain_sec_veg_bands = gain_sec_veg_bands.addBands(
        def_reg_balance_y.min(0).multiply(sec_veg_mask).multiply(pixel_area_ha).rename('gain_secondary_vegetation_' + y).float()
    );

    stock_bands = stock_bands.addBands(stock_updated_y);
});

// =============================================================================
// 7. PRODUTO FINAL E EXPORT MANAGEMENT
// =============================================================================

var final_image = loss_fire_bands
    .addBands(loss_logging_bands)
    .addBands(loss_convergence_bands)
    .addBands(gain_sec_veg_bands)
    .addBands(loss_grassland_bands)
    .addBands(loss_deforestation_bands)
    .addBands(stock_bands)
    .updateMask(always_submerged.not())
    .float();


// --- Objeto de Exportação Flexível ---
// Aqui centralizamos todas as variáveis que podem ser de interesse para exportação
// ou visualização. Isso permite testar diferentes partes do modelo alterando 
// apenas a chave `active_export_key` abaixo.

// =============================================================================
// 8. EXPORTAÇÕES (Controlada pelo active_export_key)
// =============================================================================


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
    print('Processing asset for Export/Map:', key, image);

    var common_export = {
        pyramidingPolicy: 'median',
        region: brazil_bounds,
        scale: SCALE,
        maxPixels: MAX_PIX,
        flag: 'WSilva-'
    };

    // Define nomes de exportação e IDs de Asset baseados na chave
    var exportName = key === 'final_image' ? 'CCAL_MODULO3_' + VERSION : key + '_' + VERSION;
    var assetId = key === 'final_image' ? FINAL_ASSET : BASE_ASSET + exportName;

    Export.image.toAsset({
        image: image.float(),
        description: common_export.flag + exportName,
        assetId: assetId,
        pyramidingPolicy: common_export.pyramidingPolicy,
        region: common_export.region,
        scale: common_export.scale,
        maxPixels: common_export.maxPixels,
    });

    // =============================================================================
    // 9. VISUALIZAÇÃO
    // =============================================================================
    Map.centerObject(brazil_bounds, 4);
    Map.addLayer(image, {}, 'Ativo: ' + key, true);

    // Camadas de referência opcionais
    // Map.addLayer(biomass_stock, { bands: ['biomass_stock_2020'], min: 0, max: 200, palette: ['white', 'green', 'darkgreen'] }, 'Stock 2020', false);
    // Map.addLayer(final_image, { bands: ['loss_fire_2020'], min: 0, max: 1e4, palette: ['white', 'orange', 'red'] }, 'Fire 2020', false);
    // Map.addLayer(final_image, { bands: ['stock_2020'], min: 0, max: 200, palette: ['white', 'green'] }, 'Stock Final 2020', false);
    print('Exporting asset: ' + key, image);

})
// =============================================================================
// 10. EQUAÇÕES (FUNÇÕES PURAS)
// =============================================================================

// [x] verificado a função calcForestFireEmissions
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

    // Pre-compute biome images to avoid recomputing inside nested loops
    var biome_images = {};
    biome_list.forEach(function (b) {
        biome_images[b] = ee.Image(1).paint(biomas.filter(ee.Filter.equals('Bioma', b))).neq(1);
    });

    // Pixels de veg. sec.: classe 3 (estável) ou 5 (regrowth)
    var is_sec_veg = desf_reg.eq(3).or(desf_reg.eq(5));

    var age_stack = ee.Image(0); // contador de idade acumulada (anos consecutivos como veg.sec.)
    var stock_stack = ee.Image().select(); // resultado acumulado

    years.forEach(function (year, i) {

        var sec_year = is_sec_veg.select('.*_' + year); // 1/0
        var gf_year = gf.select('.*_' + year);         // 1=Campo, 2=Floresta

        // Atualiza idade: se é veg. sec. neste ano, incrementa; senão, zera
        var age_prev = age_stack.slice(-1);
        var age_year = age_prev.add(1).multiply(sec_year); // zero onde não é veg sec

        age_stack = i === 0 ? age_year : age_stack.addBands(age_year);

        // Calcula incremento acumulado com base na idade e bioma
        var lt20 = age_year.lt(20).and(age_year.gt(0));
        var gte20 = age_year.gte(20);

        var prev_stock = (i === 0) ? ee.Image(0) : stock_stack.slice(-1);

        var increment_year = ee.Image(0).rename('sec_veg_increment_' + year);

        biome_list.forEach(function (b) {
            var bm = biome_images[b];

            var f_lt20 = ee.Image(incr_table[b]['F'].lt20);
            var f_gte20 = ee.Image(incr_table[b]['F'].gte20);
            var g_lt20 = ee.Image(incr_table[b]['G'].lt20);
            var g_gte20 = ee.Image(incr_table[b]['G'].gte20);

            // Calcula estoque acumulado = estoque anterior + incremento anual
            var result_biome = prev_stock.rename('sec_veg_increment_' + year)
                .where(gf_year.eq(2).and(lt20).and(bm), prev_stock.add(f_lt20))
                .where(gf_year.eq(2).and(gte20).and(bm), prev_stock.add(f_gte20))
                .where(gf_year.eq(1).and(lt20).and(bm), prev_stock.add(g_lt20))
                .where(gf_year.eq(1).and(gte20).and(bm), prev_stock.add(g_gte20));

            increment_year = increment_year.where(bm.and(sec_year), result_biome);
        });

        // Aplica máscara de veg. sec. e teto do estoque QCN
        increment_year = increment_year
            .updateMask(sec_year)
            .where(increment_year.gt(total), total)
            .float();

        stock_stack = stock_stack.addBands(increment_year);
    });

    return stock_stack;
}
// [ ] Camila verificar a função calcForestFireEmissions
function calcForestFireEmissions(params) {

    var annual_burned = params.annual_burned;
    var fire_frequency = params.fire_frequency;
    var time_since_fire = params.time_since_fire;
    var agb = params.agb;
    var cdw = params.cdw;
    var litter = params.litter;
    var forest_mask = params.forest_mask;
    var biomas = params.biomas;
    var years = params.years;

    // Parâmetros do modelo FATE por bioma
    // Nota: A posição (índice) no array 'AGBloss_lookup' corresponde aos anos desde o último fogo (Time Since Fire).
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

    // Frequência ≥2: pixels com múltiplos fogos
    var annual_fire_freq_gte2 = annual_burned.updateMask(fire_frequency.gte(2)).gte(1);

    // TSF editado: zera o primeiro ano de fogo (base para o modelo)
    var tsf_edit = annual_burned.multiply(0).slice(1).blend(time_since_fire);

    // Mosaico final de saída (1 por bioma, unido no final)
    var CO2_mosaic = ee.Image().select();
    var CH4_mosaic = ee.Image().select();
    var N2O_mosaic = ee.Image().select();
    var CO_mosaic = ee.Image().select();
    var NOX_mosaic = ee.Image().select();

    Object.keys(BIOME_DICT).forEach(function (biome_str) {

        var p = BIOME_DICT[biome_str];
        var biome_geom = biomas.filter(ee.Filter.inList('Bioma', [biome_str]));
        var biome_mask = ee.Image(1).paint(biome_geom).neq(1);

        // Modelo FATE — iteração por ano via ee.List.iterate
        var first = ee.Image().rename('fLeftAGB_1985').addBands(ee.Image().rename('fLeftAGN_1985'));

        var data = ee.Image(ee.List(years).iterate(function (year, previous_year) {

            year = ee.Number.parse(year);
            var year_prev = year.subtract(1);
            var year_str = year.format('%d');
            var prev_str = year_prev.format('%d');

            var tsf_y = tsf_edit.select(ee.String('.*_').cat(year_str));
            var freq_gte2_y = annual_fire_freq_gte2.select(ee.String('.*_').cat(year_str));
            var mask_y = forest_mask.select(ee.String('.*_').cat(year_str));

            var aRef_loss = tsf_y.remap(tsf_values, p.AGBloss_lookup).multiply(-1)
                .rename(ee.String('aRef_netAGBloss_').cat(year_str));
            var aRef_gain = tsf_y.remap(tsf_values, p.AGBloss_lookup)
                .rename(ee.String('aRef_netAGNgain_').cat(year_str));

            var fLeftAGB_prev = ee.Image(previous_year).select(ee.String('fLeftAGB_').cat(prev_str));
            var agb_update = agb.updateMask(tsf_y.eq(0)).blend(fLeftAGB_prev)
                .rename(ee.String('s_inAGBstock_update_').cat(year_str));

            var fNetAGBloss = agb_update.multiply(aRef_loss).rename(ee.String('fNetAGBloss_').cat(year_str));
            var fLeftAGB = agb_update.add(fNetAGBloss).rename(ee.String('fLeftAGB_').cat(year_str));

            var fAGNinput = agb_update.multiply(aRef_gain).add(agb_update.multiply(p.turnover))
                .rename(ee.String('fAGNinput_').cat(year_str));

            // Necromassa: combustão (single vs multi)
            var fAGN_s = litter.add(cdw);
            var agn_prev = ee.Image(previous_year).select(ee.String('fLeftAGN_').cat(prev_str));
            var agn_update = fAGN_s.updateMask(tsf_y.eq(0)).blend(agn_prev)
                .rename(ee.String('s_inAGNstock_update_').cat(year_str));

            var comb_fwd_s = litter.multiply(p.fwd_combf).updateMask(tsf_y.eq(0));
            var comb_cwd_s = cdw.multiply(p.cwd_combf_s).updateMask(tsf_y.eq(0));
            var fAGNcomb = ee.Image(0).blend(comb_fwd_s).add(ee.Image(0).blend(comb_cwd_s));

            var comb_fwd_m = agn_update.multiply(1 - p.cwd_part_m).multiply(p.fwd_combf).updateMask(freq_gte2_y);
            var comb_cwd_m = agn_update.multiply(p.cwd_part_m).multiply(p.cwd_combf_m).updateMask(freq_gte2_y);
            fAGNcomb = fAGNcomb.blend(ee.Image(0).blend(comb_fwd_m).add(ee.Image(0).blend(comb_cwd_m)))
                .rename(ee.String('fAGNcomb_').cat(year_str));

            var fLeftAGN = agn_update.add(fAGNinput).subtract(fAGNcomb).multiply(1 - p.decomp)
                .rename(ee.String('fLeftAGN_').cat(year_str));
            var fAGNdecomp = agn_update.add(fAGNinput).subtract(fAGNcomb).multiply(p.decomp)
                .rename(ee.String('fAGNdecomp_').cat(year_str));

            // Balanço líquido de C: negativo = emissão líquida
            var fCBalance = fLeftAGB.subtract(agb_update).add(fLeftAGN.subtract(agn_update))
                .rename(ee.String('fCBalance_').cat(year_str));

            return ee.Image(previous_year)
                .addBands(fLeftAGB).addBands(fLeftAGN).addBands(fAGNcomb)
                .addBands(fCBalance).addBands(agb_update).addBands(agn_update);

        }, first));

        data = ee.Image(data).float().updateMask(biome_mask);

        var fAGNcomb = data.select('fAGNcomb_(.*)');
        var fCBalance = data.select('fCBalance_(.*)');

        // CO₂ líquido em tC/ha
        var CO2_tC_ha = fAGNcomb.multiply(0.099).add(fCBalance)
            .multiply(-1) // positivo = emissão
            .updateMask(forest_mask.reduce(ee.Reducer.anyNonZero()));

        var co2_bands = years.map(function (y) { return ee.String('CO2_tC_ha_').cat(y); });
        CO2_tC_ha = CO2_tC_ha.rename(co2_bands).float();

        // Gases não-CO₂: tC × 2000 kg/t × EF g/kg ÷ 1e6 -> t/ha
        var CH4_y = fAGNcomb.multiply(2000).multiply(6.8).divide(1e6).updateMask(forest_mask.reduce(ee.Reducer.anyNonZero()));
        var N2O_y = fAGNcomb.multiply(2000).multiply(0.2).divide(1e6).updateMask(forest_mask.reduce(ee.Reducer.anyNonZero()));
        var CO_y = fAGNcomb.multiply(2000).multiply(104).divide(1e6).updateMask(forest_mask.reduce(ee.Reducer.anyNonZero()));
        var NOX_y = fAGNcomb.multiply(2000).multiply(1.6).divide(1e6).updateMask(forest_mask.reduce(ee.Reducer.anyNonZero()));

        var rename_gas = function (img, prefix) {
            var newBands = years.map(function (y) { return ee.String(prefix).cat('_').cat(y); });
            return img.rename(newBands).float();
        };

        CO2_mosaic = CO2_mosaic.bandNames().size().eq(0)
            ? CO2_tC_ha : CO2_mosaic.unmask(0).add(CO2_tC_ha.unmask(0));
        CH4_mosaic = CH4_mosaic.bandNames().size().eq(0)
            ? rename_gas(CH4_y, 'CH4_t_ha') : CH4_mosaic.unmask(0).add(rename_gas(CH4_y, 'CH4_t_ha').unmask(0));
        N2O_mosaic = N2O_mosaic.bandNames().size().eq(0)
            ? rename_gas(N2O_y, 'N2O_t_ha') : N2O_mosaic.unmask(0).add(rename_gas(N2O_y, 'N2O_t_ha').unmask(0));
        CO_mosaic = CO_mosaic.bandNames().size().eq(0)
            ? rename_gas(CO_y, 'CO_t_ha') : CO_mosaic.unmask(0).add(rename_gas(CO_y, 'CO_t_ha').unmask(0));
        NOX_mosaic = NOX_mosaic.bandNames().size().eq(0)
            ? rename_gas(NOX_y, 'NOX_t_ha') : NOX_mosaic.unmask(0).add(rename_gas(NOX_y, 'NOX_t_ha').unmask(0));
    });

    return CO2_mosaic.addBands(CH4_mosaic).addBands(N2O_mosaic).addBands(CO_mosaic).addBands(NOX_mosaic);
}
// [ ] Celso verificar a função calcForestFireEmissions
function calcSavannaFireEmissions(params) {

    var annual_burned = params.annual_burned;
    var fire_frequency = params.fire_frequency;
    var time_since_fire = params.time_since_fire;
    var agb = params.agb;
    var cdw = params.cdw;
    var litter = params.litter;
    var savanna_mask = params.savanna_mask;
    var years = params.years;

    // Fatores de emissão IPCC — savanas (g/kg matéria seca queimada)
    var EF = { CO2: 1613, CO: 65, CH4: 2.3, N2O: 0.21, NOX: 3.9 };

    // Fatores de combustão (fração que realmente queima)
    var combf_fwd = 0.873; // Fine woody debris / litter
    var combf_cwd = 0.331; // Coarse woody debris + AGB

    // Tabela de emissão relativa de CO₂ por regime de fogo (YSF × frequência)
    // As posições nos vetores correspondem aos anos decorridos desde o último fogo (TSF).
    var agb_factor_table = [
        // Frequência = 1: primeiro fogo (impacto base)
        [0, 0.10, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],

        // Frequência = 2: segundo fogo (impacto maior)
        [0, 0.12, 0.11, 0.10, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03,
            0.02, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],

        // Frequência >= 3: fogo recorrente (impacto severo)
        [0, 0.15, 0.13, 0.11, 0.09, 0.07, 0.05, 0.03, 0.01,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];

    var tsf_values = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
        18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38
    ];

    var tsf_edit = annual_burned.multiply(0).slice(1).blend(time_since_fire);

    var CO2_bands = ee.Image().select();
    var CH4_bands = ee.Image().select();
    var N2O_bands = ee.Image().select();
    var CO_bands = ee.Image().select();
    var NOX_bands = ee.Image().select();

    var prev_agb = agb; // AGB se atualiza ano a ano

    years.forEach(function (year) {

        var fire_year = annual_burned.select('.*_' + year);
        var tsf_year = tsf_edit.select('.*_' + year);
        var freq_year = fire_frequency.select('.*_' + year);
        var mask_year = savanna_mask.select('.*_' + year);
        var pixel_mask = fire_year.multiply(mask_year);

        var factor = tsf_year.remap(tsf_values, agb_factor_table[0]); // freq=1 base
        factor = factor.where(freq_year.gte(2), tsf_year.remap(tsf_values, agb_factor_table[1]));
        factor = factor.where(freq_year.gte(3), tsf_year.remap(tsf_values, agb_factor_table[2]));

        var co2_year = prev_agb.multiply(factor).multiply(3.67)
            .multiply(pixel_mask)
            .rename('CO2_tCO2e_ha_' + year)
            .float();

        prev_agb = prev_agb.subtract(prev_agb.multiply(factor).multiply(pixel_mask).unmask(0));

        var comb_fwd = litter.multiply(combf_fwd);
        var comb_cwd = cdw.add(agb.multiply(0.1)).multiply(combf_cwd);
        var comb_total = comb_fwd.add(comb_cwd);

        var ch4_year = comb_total.multiply(2000).multiply(EF.CH4).divide(1e6).multiply(pixel_mask).rename('CH4_t_ha_' + year).float();
        var n2o_year = comb_total.multiply(2000).multiply(EF.N2O).divide(1e6).multiply(pixel_mask).rename('N2O_t_ha_' + year).float();
        var co_year = comb_total.multiply(2000).multiply(EF.CO).divide(1e6).multiply(pixel_mask).rename('CO_t_ha_' + year).float();
        var nox_year = comb_total.multiply(2000).multiply(EF.NOX).divide(1e6).multiply(pixel_mask).rename('NOX_t_ha_' + year).float();

        CO2_bands = CO2_bands.addBands(co2_year);
        CH4_bands = CH4_bands.addBands(ch4_year);
        N2O_bands = N2O_bands.addBands(n2o_year);
        CO_bands = CO_bands.addBands(co_year);
        NOX_bands = NOX_bands.addBands(nox_year);
    });

    return CO2_bands.addBands(CH4_bands).addBands(N2O_bands).addBands(CO_bands).addBands(NOX_bands);
}
// [ ] Camila verificar a função calcForestFireEmissions
function calcGrasslandFireEmissions(params) {

    var annual_burned = params.annual_burned;
    var accumulated_burned = params.accumulated_burned;
    var agb = params.agb;
    var cdw = params.cdw;
    var litter = params.litter;
    var grassland_mask = params.grassland_mask;
    var biomas = params.biomas;
    var years = params.years;

    // Fatores de combustão para Campos (fração da biomassa que efetivamente queima)
    var BIOME_DICT = {
        'Amazônia': { fwd_combf: 0.883, cwd_combf: 0.331 },
        'Caatinga': { fwd_combf: 0.883, cwd_combf: 0.331 },
        'Cerrado': { fwd_combf: 0.883, cwd_combf: 0.331 },
        'Mata Atlântica': { fwd_combf: 0.883, cwd_combf: 0.331 },
        'Pampa': { fwd_combf: 0.883, cwd_combf: 0.331 },
        'Pantanal': { fwd_combf: 0.883, cwd_combf: 0.331 },
    };

    var EF = { CO: 65, CH4: 2.3, N2O: 0.21, NOX: 3.9 };

    var agb_plus_cdw = agb.add(cdw);

    var CO_bands = ee.Image().select();
    var CH4_bands = ee.Image().select();
    var N2O_bands = ee.Image().select();
    var NOX_bands = ee.Image().select();

    years.forEach(function (year) {

        var fire_year = annual_burned.select('.*_' + year);
        var mask_year = grassland_mask.select('.*_' + year);

        var CO_year = ee.Image(0).rename('CO_t_ha_' + year);
        var CH4_year = ee.Image(0).rename('CH4_t_ha_' + year);
        var N2O_year = ee.Image(0).rename('N2O_t_ha_' + year);
        var NOX_year = ee.Image(0).rename('NOX_t_ha_' + year);

        Object.keys(BIOME_DICT).forEach(function (biome_str) {

            var combf_fwd = BIOME_DICT[biome_str].fwd_combf;
            var combf_cwd = BIOME_DICT[biome_str].cwd_combf;

            var biome_mask = ee.Image(1).paint(
                biomas.filter(ee.Filter.equals('Bioma', biome_str))
            ).neq(1);

            var comb_fwd = litter.multiply(combf_fwd);
            var comb_cwdplusagb = agb_plus_cdw.multiply(combf_cwd);
            var comb_total = comb_fwd.add(comb_cwdplusagb);

            var pixel_mask = fire_year.multiply(mask_year).multiply(biome_mask);

            CO_year = CO_year.add(comb_total.multiply(2000).multiply(EF.CO).divide(1e6).multiply(pixel_mask).rename('CO_t_ha_' + year));
            CH4_year = CH4_year.add(comb_total.multiply(2000).multiply(EF.CH4).divide(1e6).multiply(pixel_mask).rename('CH4_t_ha_' + year));
            N2O_year = N2O_year.add(comb_total.multiply(2000).multiply(EF.N2O).divide(1e6).multiply(pixel_mask).rename('N2O_t_ha_' + year));
            NOX_year = NOX_year.add(comb_total.multiply(2000).multiply(EF.NOX).divide(1e6).multiply(pixel_mask).rename('NOX_t_ha_' + year));
        });

        CO_bands = CO_bands.addBands(CO_year.float());
        CH4_bands = CH4_bands.addBands(CH4_year.float());
        N2O_bands = N2O_bands.addBands(N2O_year.float());
        NOX_bands = NOX_bands.addBands(NOX_year.float());
    });

    return CO_bands.addBands(CH4_bands).addBands(N2O_bands).addBands(NOX_bands);
}
// [ ] Celso verificar a função calcForestFireEmissions
function calcLoggingEmissions(params) {

    var agb = params.agb;
    var sl_dis = params.sl_dis;
    var sl_geo = params.sl_geo;
    var forest_mask = params.forest_mask;
    var amazon_mask = params.amazon_mask;
    var loss_fraction = params.loss_fraction !== undefined ? params.loss_fraction : 0.196;
    var years = params.years || [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

    var agbUpdated = agb;
    var result = ee.Image().select();

    years.forEach(function (year) {

        var dis = ee.Image('projects/ee-ipam/assets/MRV_REDD_PARA/0_Activity_Year/degradation_' + year + '_sl_disordered').unmask(0);
        var geo = ee.Image('projects/ee-ipam/assets/MRV_REDD_PARA/0_Activity_Year/degradation_' + year + '_sl_geometric').unmask(0);

        var sl_year = ee.Image(0)
            .where(dis.eq(1), 1)
            .where(geo.eq(1), 1)
            .multiply(forest_mask.select('.*_' + year))
            .multiply(amazon_mask)
            .rename('logging_tC_ha_' + year)
            .selfMask();

        var logging_carbon_year = agbUpdated.multiply(sl_year).multiply(loss_fraction)
            .rename('logging_tC_ha_' + year)
            .float();

        agbUpdated = agbUpdated.subtract(logging_carbon_year.unmask(0));

        result = result.addBands(logging_carbon_year);
    });

    return result;
}
