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
// CCAL Módulo 3 — v036
// toExport_modulo3.js
// Script principal: carrega dados, executa equações e exporta resultados.
// Regra: mapeamento da área emersa do Brasil (exclui água permanente).
// =============================================================================

// --- Módulos de equação (funções puras, sem Export.*)
var secVegMod = require('users/workspaceipam/CCAL:MODULO3/v036/equations/01_secondary_veg.js');
var fireForestMod = require('users/workspaceipam/CCAL:MODULO3/v036/equations/02_fire_forest.js');
var fireSavMod = require('users/workspaceipam/CCAL:MODULO3/v036/equations/03_fire_savanna.js');
var fireGraMod = require('users/workspaceipam/CCAL:MODULO3/v036/equations/04_fire_grassland.js');
var loggingMod = require('users/workspaceipam/CCAL:MODULO3/v036/equations/05_logging.js');

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

// --- QCN Retificada
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var agb = qcn.select('AGB');
var cdw = qcn.select('CDW');
var litter = qcn.select('LITTER');
var total = qcn.select('TOTAL');

// --- MapBiomas Fire Col 4.1
var annual_burned = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1').selfMask();
var fire_frequency = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1').slice(0, 40);
var time_since_fire = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1');
var accumulated_burned = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_accumulated_burned_v1').slice(0, 40);

// --- Auxiliares
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var brazil_bounds = biomas.geometry().bounds();

// =============================================================================
// 3. PREPARAÇÃO DO USO DO SOLO E MÁSCARAS
// =============================================================================

// --- 3a. Corrige classe 7 (outras transições) no desf/reg
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

// --- 3b. Reclassificação binária para incremento (1=Campo, 2=Floresta)
var grass_forest = lulc.multiply(0);
[3, 4, 5, 6, 49, 11, 12, 50, 29, 13].forEach(function (id, i) {
    var new_classes = [2, 2, 2, 2, 2, 1, 1, 1, 1, 1];
    grass_forest = grass_forest.where(lulc.eq(id), new_classes[i]);
});

// --- 3c. Máscaras por tipo de vegetação estável
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

// --- 3d. Máscara de área emersa
var water_count = lulc.eq(33).reduce(ee.Reducer.sum());
var always_submerged = water_count.gte(38);

// =============================================================================
// 4. ESTOQUE DE BIOMASSA ANUAL
// =============================================================================

var sec_veg_increment = secVegMod.calcSecondaryVegIncrement({
    desf_reg_corrected: desf_reg_corrected,
    grass_forest: grass_forest,
    total_carbon: total,
    biomas: biomas,
    years: YEARS_ALL
});

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

var fire_forest = fireForestMod.calcForestFireEmissions({
    annual_burned: annual_burned, fire_frequency: fire_frequency, time_since_fire: time_since_fire,
    agb: agb, cdw: cdw, litter: litter, forest_mask: forest_mask, biomas: biomas, years: YEARS_FIRE
});

var fire_savanna = fireSavMod.calcSavannaFireEmissions({
    annual_burned: annual_burned, fire_frequency: fire_frequency, time_since_fire: time_since_fire,
    agb: agb, cdw: cdw, litter: litter, savanna_mask: savanna_mask, years: YEARS_FIRE
});

var fire_grassland = fireGraMod.calcGrasslandFireEmissions({
    annual_burned: annual_burned, accumulated_burned: accumulated_burned,
    agb: agb, cdw: cdw, litter: litter, grassland_mask: grassland_mask, biomas: biomas, years: YEARS_FIRE
});

var logging = loggingMod.calcLoggingEmissions({
    agb: agb, forest_mask: forest_mask,
    amazon_mask: ee.Image(1).paint(biomas.filter(ee.Filter.equals('Bioma', 'Amazônia'))).neq(1),
    years: ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024']
});

// =============================================================================
// 6. INTEGRAÇÃO E BALANÇO FINAL
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
    var logging_tC = (i >= YEARS_FIRE.indexOf('2017')) ? logging.select('logging_tC_ha_' + y).unmask(0) : ee.Image(0);

    var accum_prev = accumulated_degradation.slice(-1);
    var accum_y = accum_prev.subtract(fire_forest_tC).subtract(fire_savanna_tC).subtract(logging_tC).rename('accum_' + y);
    accumulated_degradation = accumulated_degradation.addBands(accum_y);

    var stock_bruto_y = biomass_stock.select('biomass_stock_' + y);
    var desf_y = desf_reg_corrected.select('classification_' + y);

    var stock_updated_y = stock_bruto_y.where(desf_y.eq(2), stock_bruto_y.add(accum_y.unmask(0))).rename('stock_' + y).float();
    var def_reg_balance_y = past_stock.subtract(stock_updated_y).multiply(TC_TO_TCO2);
    past_stock = stock_updated_y;

    // Fogo CO2e (inclui Savana CH4/N2O agora em t/ha)
    var fire_co2e_y = fire_forest_tC.add(fire_savanna_tC).multiply(TC_TO_TCO2);
    var fire_ch4 = fire_forest.select('CH4_t_ha_' + y).unmask(0).add(fire_savanna.select('CH4_t_ha_' + y).unmask(0)).multiply(GWP_CH4);
    var fire_n2o = fire_forest.select('N2O_t_ha_' + y).unmask(0).add(fire_savanna.select('N2O_t_ha_' + y).unmask(0)).multiply(GWP_N2O);
    var fire_total_co2e = fire_co2e_y.add(fire_ch4).add(fire_n2o);

    loss_fire_bands = loss_fire_bands.addBands(fire_total_co2e.multiply(pixel_area_ha).rename('loss_fire_' + y).float());
    
    var log_co2e_y = logging_tC.multiply(TC_TO_TCO2);
    loss_logging_bands = loss_logging_bands.addBands(log_co2e_y.multiply(pixel_area_ha).rename('loss_selective_logging_' + y).float());
    loss_convergence_bands = loss_convergence_bands.addBands(fire_total_co2e.add(log_co2e_y).multiply(pixel_area_ha).rename('loss_convergence_degradation_' + y).float());

    var grass_ch4 = fire_grassland.select('CH4_t_ha_' + y).unmask(0).multiply(GWP_CH4);
    var grass_n2o = fire_grassland.select('N2O_t_ha_' + y).unmask(0).multiply(GWP_N2O);
    loss_grassland_bands = loss_grassland_bands.addBands(grass_ch4.add(grass_n2o).multiply(pixel_area_ha).rename('loss_grassland_' + y).float());

    loss_deforestation_bands = loss_deforestation_bands.addBands(def_reg_balance_y.max(0).multiply(pixel_area_ha).rename('loss_deforestation_' + y).float());
    
    var sec_veg_mask = desf_y.eq(3).or(desf_y.eq(5));
    gain_sec_veg_bands = gain_sec_veg_bands.addBands(def_reg_balance_y.min(0).multiply(sec_veg_mask).multiply(pixel_area_ha).rename('gain_secondary_vegetation_' + y).float());

    stock_bands = stock_bands.addBands(stock_updated_y);
});

// =============================================================================
// 7. PRODUTO FINAL E EXPORT MANAGEMENT
// =============================================================================

var final_image = loss_fire_bands.addBands(loss_logging_bands).addBands(loss_convergence_bands)
    .addBands(gain_sec_veg_bands).addBands(loss_grassland_bands).addBands(loss_deforestation_bands)
    .addBands(stock_bands).updateMask(always_submerged.not()).float();

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

    Export.image.toAsset({
        image: image.float(),
        description: 'WSilva-' + exportName,
        assetId: assetId,
        pyramidingPolicy: 'median',
        region: brazil_bounds,
        scale: SCALE,
        maxPixels: MAX_PIX,
    });
    
    Map.addLayer(image, {}, 'Ativo: ' + key, key === 'final_image');
});
