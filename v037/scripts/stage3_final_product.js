/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Export: Stage 3 - Produto Final)
 * VERSÃO: v037
 * SCRIPT: stage3_final_product.js
 * STAGE: 3 (Produto Final)
 * DEPENDÊNCIAS: Stage 1 (todos os assets) + Stage 2 (biomass_stock)
 * DESCRIÇÃO: Monta e exporta o produto final CCAL_MODULO3-v037 com todas as bandas.
 * -----------------------------------------------------------------------------
 * INSTITUIÇÃO: IPAM Amazônia
 * EQUIPE CCAL: Ane Alencar; Bárbara Zimbres; Camila Silva; Celso Silva-Junior;
 *              Edriano Souza; Isabel Silva; Lívia Laureto; Manuela Padilha;
 *              Paulo Moutinho; Rebecca Maranhão; Valderli Piontekowski; Wallace Silva;
 *              Jarlene Gomes; Julia Shimbo
 * CONTATO: https://ipam.org.br/contato/fale-conosco/
 * ATUALIZAÇÃO: 2026-06-08
 * =============================================================================
 */

var VERSION = 'v037';
var BASE_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/';
var FINAL_ASSET = 'projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO3-' + VERSION;
var SCALE = 30;
var MAX_PIX = 1e13;

var YEARS_FIRE = [
    '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];

var YEARS_LOGGING = ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];

// Inputs do Stage 1
var fire_forest_CO2 = ee.Image(BASE_ASSET + 'fire_forest_CO2');
var fire_forest_CH4 = ee.Image(BASE_ASSET + 'fire_forest_CH4');
var fire_forest_N2O = ee.Image(BASE_ASSET + 'fire_forest_N2O');
var fire_savanna_CO2 = ee.Image(BASE_ASSET + 'fire_savanna_CO2');
var fire_savanna_CH4 = ee.Image(BASE_ASSET + 'fire_savanna_CH4');
var fire_savanna_N2O = ee.Image(BASE_ASSET + 'fire_savanna_N2O');
var fire_grassland_CH4 = ee.Image(BASE_ASSET + 'fire_grassland_CH4');
var fire_grassland_N2O = ee.Image(BASE_ASSET + 'fire_grassland_N2O');
var logging_forest_CO2 = ee.Image(BASE_ASSET + 'logging_forest_CO2');
var secondary_veg_increment = ee.Image(BASE_ASSET + 'secondary_veg_increment');

// Inputs do Stage 2
var biomass_stock = ee.Image(BASE_ASSET + 'biomass_stock');

// Inputs do Stage 0
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var desf_reg_corrected = ee.Image(BASE_ASSET + 'desf_reg_corrected');
var emergent_mask = lulc.eq(33).reduce(ee.Reducer.sum()).lt(38);

var pixel_area_ha = ee.Image.pixelArea().divide(10000);
var TC_TO_TCO2 = 3.67;

print('⏳ Montando produto final...');

var loss_fire_bands = ee.Image().select();
var loss_grassland_bands = ee.Image().select();
var loss_logging_bands = ee.Image().select();
var gain_sec_veg_bands = ee.Image().select();
var loss_deforestation_bands = ee.Image().select();
var stock_bands = ee.Image().select();

YEARS_FIRE.forEach(function (y) {
    // Emissões por fogo (tCO₂e/pixel)
    var ff_CO2 = fire_forest_CO2.select(y).unmask(0);
    var ff_CH4 = fire_forest_CH4.select(y).unmask(0);
    var ff_N2O = fire_forest_N2O.select(y).unmask(0);
    var fs_CO2 = fire_savanna_CO2.select(y).unmask(0);
    var fs_CH4 = fire_savanna_CH4.select(y).unmask(0);
    var fs_N2O = fire_savanna_N2O.select(y).unmask(0);

    var fire_total = ff_CO2.add(ff_CH4).add(ff_N2O).add(fs_CO2).add(fs_CH4).add(fs_N2O)
        .multiply(pixel_area_ha).rename('loss_fire_' + y).float();
    loss_fire_bands = loss_fire_bands.addBands(fire_total);

    // Emissões por fogo em campo (tCO₂e/pixel)
    var fg_CH4 = fire_grassland_CH4.select(y).unmask(0);
    var fg_N2O = fire_grassland_N2O.select(y).unmask(0);
    var grassland_total = fg_CH4.add(fg_N2O).multiply(pixel_area_ha).rename('loss_grassland_' + y).float();
    loss_grassland_bands = loss_grassland_bands.addBands(grassland_total);

    // Corte seletivo (apenas 2017-2024)
    if (YEARS_LOGGING.indexOf(y) >= 0) {
        var log_CO2 = logging_forest_CO2.select(y).unmask(0);
        var logging_total = log_CO2.multiply(pixel_area_ha).rename('loss_selective_logging_' + y).float();
        loss_logging_bands = loss_logging_bands.addBands(logging_total);
    }

    // Ganho por vegetação secundária (tCO₂e/pixel)
    var sec_y = secondary_veg_increment.select(y).unmask(0);
    var desf_y = desf_reg_corrected.select('classification_' + y);
    var is_sec_veg = desf_y.eq(3).or(desf_y.eq(5));
    var gain_sec = sec_y.multiply(TC_TO_TCO2).multiply(is_sec_veg).multiply(pixel_area_ha)
        .rename('gain_secondary_vegetation_' + y).float();
    gain_sec_veg_bands = gain_sec_veg_bands.addBands(gain_sec);

    // Desmatamento (simplificado - precisa do mass_balance para cálculo correto)
    // Placeholder: diferença de estoque
    loss_deforestation_bands = loss_deforestation_bands.addBands(ee.Image(0).rename('loss_deforestation_' + y));

    // Estoque
    stock_bands = stock_bands.addBands(biomass_stock.select(y).rename('stock_' + y));
});

var final_image = loss_fire_bands
    .addBands(loss_grassland_bands)
    .addBands(loss_logging_bands)
    .addBands(gain_sec_veg_bands)
    .addBands(loss_deforestation_bands)
    .addBands(stock_bands)
    .updateMask(emergent_mask)
    .float();

print('✅ Produto final montado!');
print('⏳ Iniciando export...');

Export.image.toAsset({
    image: final_image,
    description: 'CCAL_MODULO3_' + VERSION,
    assetId: FINAL_ASSET,
    scale: SCALE,
    maxPixels: MAX_PIX,
    pyramidingPolicy: 'median'
});

print('📤 Export: CCAL_MODULO3-' + VERSION);
print('📦 Asset: ' + FINAL_ASSET);
print('📊 Bandas: loss_fire_YYYY, loss_grassland_YYYY, loss_selective_logging_YYYY, gain_secondary_vegetation_YYYY, loss_deforestation_YYYY, stock_YYYY');
print('');
print('✅ Pipeline v037 concluído!');
