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
 * SCRIPT: 01_toExport_modulo3.js
 * DESCRIÇÃO: Pipeline de produção para exportação dos ativos finais. Otimizado 
 *            para consumir componentes pré-processados (assets), realizando o 
 *            balanço de carbono líquido por pixel. Consolida os dados de 
 *            desmatamento, regeneração e degradação em um produto final integrado.
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


// 1. PARÂMETROS E ATIVOS
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
var YEARS_FIRE = YEARS_ALL.slice(1);
var TC_TO_TCO2 = 3.67;

// 2. CARREGAMENTO DOS COMPONENTES (ASSETS)
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var desf_reg = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');
var biomas = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');
var brazil_bounds = biomas.geometry().bounds();

var biomass_stock_bruto = ee.Image(BASE_ASSET + 'biomass_stock_' + VERSION);
var sec_veg_increment = ee.Image(BASE_ASSET + 'secondary_veg_increment_' + VERSION);
var fire_forest = ee.Image(BASE_ASSET + 'fire_forest_emissions_' + VERSION);
var fire_savanna = ee.Image(BASE_ASSET + 'fire_savanna_emissions_' + VERSION);
var fire_grassland = ee.Image(BASE_ASSET + 'fire_grassland_emissions_' + VERSION);
var logging = ee.Image(BASE_ASSET + 'logging_emissions_' + VERSION);

// 3. CORREÇÃO TÉCNICA (DESF_REG)
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

// 4. MOTOR DE BALANÇO (INTEGRAÇÃO)
var pixel_area_ha = ee.Image.pixelArea().divide(10000);
var degr_acum = ee.Image(0);
var out_bands = ee.Image().select();

YEARS_FIRE.forEach(function (y, i) {
    var desf_y = desf_reg_corrected.select('classification_' + y);
    var is_sec = desf_y.eq(3).or(desf_y.eq(5));
    
    // Componentes de Degradação (tC/ha)
    var f_fl_co2 = fire_forest.select('CO2_tC_ha_' + y).unmask(0);
    var f_sv_co2 = fire_savanna.select('CO2_tC_ha_' + y).unmask(0);
    var mad_tC = (i >= YEARS_FIRE.indexOf('2017')) ? logging.select('logging_tC_ha_' + y).unmask(0) : ee.Image(0);
    
    // Componente de Regeneração (tC/ha)
    var incr_y = sec_veg_increment.select('sec_veg_increment_' + y).subtract(
        (i === 0) ? ee.Image(0) : sec_veg_increment.select('sec_veg_increment_' + YEARS_FIRE[i-1])
    ).unmask(0);

    // Saldo de Degradação Acumulado no estoque nativo
    degr_acum = degr_acum.add(incr_y).subtract(f_fl_co2).subtract(f_sv_co2).subtract(mad_tC);

    var past_stock_y = (i === 0) ? biomass_stock_bruto.select('biomass_stock_1985') : out_bands.select('stock_' + YEARS_FIRE[i - 1]);
    var stock_bruto_y = biomass_stock_bruto.select('biomass_stock_' + y);
    
    // Ajusta o estoque apenas onde é Vegetação Nativa (classe 2 no desf_reg)
    var stk_fin = stock_bruto_y.where(desf_y.eq(2), stock_bruto_y.add(degr_acum));
    
    // Balanço Final (tC)
    var delta_stock_tC = past_stock_y.subtract(stk_fin);
    var degradation_tC_y = f_fl_co2.add(f_sv_co2).add(mad_tC);
    
    // Isolamento do Desmatamento (Conversão)
    var loss_defor_y = delta_stock_tC.subtract(degradation_tC_y).max(0).multiply(TC_TO_TCO2).multiply(pixel_area_ha);
    
    // Ganho por Vegetação Secundária
    var gain_secveg_y = delta_stock_tC.min(0).abs().multiply(is_sec).multiply(TC_TO_TCO2).multiply(pixel_area_ha);

    out_bands = out_bands.addBands([
        gain_secveg_y.rename('gain_secondary_vegetation_' + y).float(), 
        stk_fin.rename('stock_' + y).float(),
        f_fl_co2.add(f_sv_co2).multiply(TC_TO_TCO2).multiply(pixel_area_ha).rename('loss_fire_' + y).float(),
        mad_tC.multiply(TC_TO_TCO2).multiply(pixel_area_ha).rename('loss_selective_logging_' + y).float(),
        loss_defor_y.rename('loss_deforestation_' + y).float()
    ]);
});

var final_image = out_bands.float();

// 5. EXPORTAÇÃO
Export.image.toAsset({
    image: final_image,
    description: 'WSilva-CCAL_MODULO3_FINAL_' + VERSION,
    assetId: FINAL_ASSET,
    pyramidingPolicy: 'median',
    region: brazil_bounds,
    scale: SCALE,
    maxPixels: MAX_PIX
});

Map.addLayer(final_image, {bands:['stock_2023'], min:0, max:250}, 'Balanço Final 2023');
