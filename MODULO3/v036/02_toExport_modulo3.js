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

// Variáveis de estado que viajam no tempo
var out_bands = ee.Image().select();
var degr_acum_tC = ee.Image(0);      // Acumula perda (tC/ha) para abater do estoque nativo
var hist_deg_mask = ee.Image(0);     // Máscara histórica de áreas degradadas (cicatriz)

YEARS_FIRE.forEach(function (y, i) {
    // 1. IDENTIFICAÇÃO DO USO E COBERTURA
    var desf_y = desf_reg_corrected.select('classification_' + y);
    var is_native = desf_y.eq(2);
    var is_sec = desf_y.eq(3).or(desf_y.eq(5));
    var is_defor = desf_y.eq(4).or(desf_y.eq(6));

    // 2. CONSOLIDAÇÃO EXPLÍCITA DAS EMISSÕES DE FOGO (tCO2e/ha)
    // =========================================================
    
    // --- FLORESTA (CO2 + CH4 + N2O) ---
    var f_fl_co2 = fire_forest.select('.*CO2.*_' + y).unmask(0);
    var f_fl_ch4 = fire_forest.select('.*CH4.*_' + y).unmask(0).multiply(28);
    var f_fl_n2o = fire_forest.select('.*N2O.*_' + y).unmask(0).multiply(265);
    var f_fl_co2e = f_fl_co2.add(f_fl_ch4).add(f_fl_n2o);

    // --- SAVANA (CO2 + CH4 + N2O) ---
    var f_sv_co2 = fire_savanna.select('.*CO2.*_' + y).unmask(0);
    var f_sv_ch4 = fire_savanna.select('.*CH4.*_' + y).unmask(0).multiply(28);
    var f_sv_n2o = fire_savanna.select('.*N2O.*_' + y).unmask(0).multiply(265);
    var f_sv_co2e = f_sv_co2.add(f_sv_ch4).add(f_sv_n2o);

    // --- CAMPO / GRASSLAND (APENAS CH4 + N2O) ---
    // Conforme a v035, CO2 de grassland não é contabilizado (neutro)
    var f_gr_ch4 = fire_grassland.select('.*CH4.*_' + y).unmask(0).multiply(28);
    var f_gr_n2o = fire_grassland.select('.*N2O.*_' + y).unmask(0).multiply(265);
    var f_gr_co2e = f_gr_ch4.add(f_gr_n2o);

    // =========================================================

    // 2.1 TRATAMENTO DA MADEIRA (Vem em tC/ha, convertemos para CO2e para saída)
    var mad_tC = (i >= YEARS_FIRE.indexOf('2017')) ? logging.select('logging_tC_ha_' + y).unmask(0) : ee.Image(0);
    var mad_co2e = mad_tC.multiply(TC_TO_TCO2);

    // Agrupa o que é considerado DEGRADAÇÃO (Floresta + Savana)
    var fire_degr_co2e = f_fl_co2e.add(f_sv_co2e);

    // 3. CONVERGÊNCIA (Intersecção de degradação: Fogo Floresta/Savana + Madeira no mesmo ano)
    var is_convergence = f_fl_co2e.gt(0).and(mad_co2e.gt(0));
    var convergence_co2e = f_fl_co2e.add(mad_co2e).updateMask(is_convergence);

    // 4. ATUALIZAÇÃO DA CICATRIZ (Pixel Zero apenas para Degradação histórica)
    var has_degradation_now = fire_degr_co2e.gt(0).or(mad_co2e.gt(0));
    hist_deg_mask = hist_deg_mask.or(has_degradation_now).and(is_native);

    // 5. BALANÇO DE ESTOQUE (Matemática interna em tC/ha)
    var degr_current_tC = fire_degr_co2e.divide(TC_TO_TCO2).add(mad_tC);
    
    // Incremento da vegetação secundária (Delta do ano corrente)
    var incr_y = sec_veg_increment.select('sec_veg_increment_' + y).subtract(
        (i === 0) ? ee.Image(0) : sec_veg_increment.select('sec_veg_increment_' + YEARS_FIRE[i-1])
    ).unmask(0);

    degr_acum_tC = degr_acum_tC.add(incr_y).subtract(degr_current_tC);
    
    var stock_bruto_y = biomass_stock_bruto.select('biomass_stock_' + y);
    var stk_fin = stock_bruto_y.where(is_native, stock_bruto_y.add(degr_acum_tC));
    
    var past_stock_y = (i === 0) ? biomass_stock_bruto.select('biomass_stock_1985') : out_bands.select('stock_' + YEARS_FIRE[i - 1]);
    var delta_stock_tC = past_stock_y.subtract(stk_fin);

    // 6. CÁLCULO DAS SAÍDAS (Total por Pixel em tCO2e)
    var loss_defor_total = delta_stock_tC.subtract(degr_current_tC).max(0).multiply(TC_TO_TCO2).multiply(pixel_area_ha).multiply(is_defor);
    var gain_secveg_total = delta_stock_tC.min(0).abs().multiply(is_sec).multiply(TC_TO_TCO2).multiply(pixel_area_ha);
    
    // 7. EMPACOTAMENTO DAS BANDAS FINAIS
    out_bands = out_bands.addBands([
        stk_fin.rename('stock_' + y).float(), 
        gain_secveg_total.rename('gain_secondary_vegetation_' + y).float(),
        loss_defor_total.rename('loss_deforestation_' + y).float(),
        
        // Emissões de Degradação (Floresta/Savana/Madeira) com Pixel Zero na cicatriz
        fire_degr_co2e.multiply(pixel_area_ha).updateMask(hist_deg_mask).rename('loss_fire_' + y).float(),
        mad_co2e.multiply(pixel_area_ha).updateMask(hist_deg_mask).rename('loss_selective_logging_' + y).float(),
        convergence_co2e.multiply(pixel_area_ha).unmask(0).updateMask(hist_deg_mask).rename('loss_convergence_degradation_' + y).float(),
        
        // Fogo em Campo: Contabiliza apenas CH4+N2O no ano, sem cicatriz histórica (selfMask)
        f_gr_co2e.multiply(pixel_area_ha).selfMask().rename('loss_grassland_' + y).float()
    ]);
});

var final_image = out_bands.float();
final_image = final_image.select(final_image.bandNames().sort());

// 5. EXPORTAÇÃO
Export.image.toAsset({
    image: final_image,
    description: 'WSilva-CCAL_MODULO3_FINAL_' + VERSION,
    assetId: FINAL_ASSET,
    pyramidingPolicy: 'median',
    region: brazil_bounds,
    scale: SCALE,
    maxPixels: MAX_PIX,
    overwrite:true
});

// =============================================================================
// 6. ÁREA DE TESTE E VISUALIZAÇÃO (MAP.ADDLAYER)
// =============================================================================

// Parâmetros de Visualização (Paletas)
var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');
var paletaDesfReg = ["#ffffff", '#faf5d1', '#3f7849', '#5bcf20', '#ea1c1c', '#b4f792', '#fe9934', '#303149'];
var paletaEstoque = ["#440154", "#46327e", "#365c8d", "#277f8e", "#1fa187", "#4ac16d", "#a0da39", "#fde725"]; // Viridis
var paletaRegeneracao = ['#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c']; // Tons de Verde
var paletaFogo = ['#fee5d9','#fcae91','#fb6a4a','#de2d26','#a50f15']; // Tons de Vermelho
var paletaMadeira = ['#ffffd4','#fed98e','#fe9929','#d95f0e','#993404']; // Tons de Laranja/Marrom

// Ano alvo para visualização no mapa (O Inspector mostrará todos os anos!)
var anoVis = '2023';

// -----------------------------------------------------------------------------
// A. CAMADAS DE ENTRADA (INPUTS MAPBIOMAS)
// -----------------------------------------------------------------------------
Map.addLayer(lulc.select('classification_.*'), { bands: ['classification_' + anoVis], min: 0, max: 75, palette: paletaMapBiomas }, 'INPUT: LULC ' + anoVis, false);
Map.addLayer(desf_reg.select('classification_.*'), { bands: ['classification_' + anoVis], min: 0, max: 7, palette: paletaDesfReg }, 'INPUT: Desf/Reg Original ' + anoVis, false);
Map.addLayer(desf_reg_corrected.select('classification_.*'), { bands: ['classification_' + anoVis], min: 0, max: 7, palette: paletaDesfReg }, 'INPUT: Desf/Reg Corrigido (Sem classe 7) ' + anoVis, false);

// -----------------------------------------------------------------------------
// B. CAMADAS DE ENTRADA (ESTOQUE E REGENERAÇÃO - tC/ha)
// -----------------------------------------------------------------------------
Map.addLayer(biomass_stock_bruto.select('biomass_stock_.*'), { bands: ['biomass_stock_' + anoVis], min: 0, max: 250, palette: paletaEstoque }, 'INPUT: Estoque Bruto ' + anoVis, false);
Map.addLayer(sec_veg_increment.select('sec_veg_increment_.*'), { bands: ['sec_veg_increment_' + anoVis], min: 0, max: 50, palette: paletaRegeneracao }, 'INPUT: Incremento Veg. Secundária ' + anoVis, false);

// -----------------------------------------------------------------------------
// C. CAMADAS DE ENTRADA (DEGRADAÇÃO - tC/ha)
// -----------------------------------------------------------------------------
Map.addLayer(fire_forest.select('CO2_tC_ha_.*'), { bands: ['CO2_tC_ha_' + anoVis], min: 0, max: 30, palette: paletaFogo }, 'INPUT: Fogo Floresta ' + anoVis, false);
Map.addLayer(fire_savanna.select('CO2_tC_ha_.*'), { bands: ['CO2_tC_ha_' + anoVis], min: 0, max: 30, palette: paletaFogo }, 'INPUT: Fogo Savana ' + anoVis, false);
Map.addLayer(fire_grassland.select('CH4_t_ha_.*'), { bands: ['CH4_t_ha_' + anoVis], min: 0, max: 30, palette: paletaFogo }, 'INPUT: Fogo Campestre ' + anoVis, false);
Map.addLayer(logging.select('logging_tC_ha_.*'), { bands: ['logging_tC_ha_' + anoVis], min: 0, max: 30, palette: paletaMadeira }, 'INPUT: Extração Madeira ' + anoVis, false);

// -----------------------------------------------------------------------------
// D. CAMADAS DE SAÍDA (BALANÇO FINAL INTEGRADO - tCO2 e tC)
// -----------------------------------------------------------------------------
Map.addLayer(final_image.select('gain_secondary_vegetation_.*'), { bands: ['gain_secondary_vegetation_' + anoVis], min: 0, max: 50, palette: paletaRegeneracao }, 'OUTPUT: Ganho Veg. Secundária (tCO2) ' + anoVis, false);
Map.addLayer(final_image.select('loss_fire_.*'), { bands: ['loss_fire_' + anoVis], min: 0, max: 50, palette: paletaFogo }, 'OUTPUT: Emissão por Fogo (tCO2) ' + anoVis, false);
Map.addLayer(final_image.select('loss_selective_logging_.*'), { bands: ['loss_selective_logging_' + anoVis], min: 0, max: 50, palette: paletaMadeira }, 'OUTPUT: Emissão por Madeira (tCO2) ' + anoVis, false);
Map.addLayer(final_image.select('loss_deforestation_.*'), { bands: ['loss_deforestation_' + anoVis], min: 0, max: 150, palette: ['#ffffff', '#ff0000', '#800000'] }, 'OUTPUT: Emissão Desmatamento (tCO2) ' + anoVis, false);

// Esta é a única camada que já entra ligada por padrão no map
Map.addLayer(final_image.select('stock_.*'), { bands: ['stock_' + anoVis], min: 0, max: 250, palette: paletaEstoque }, 'OUTPUT FINAL: Estoque com Degradação/Balanço ' + anoVis, true);
Map.addLayer(final_image, {bands:['stock_2023'], min:0, max:250}, 'Balanço Final 2023');
