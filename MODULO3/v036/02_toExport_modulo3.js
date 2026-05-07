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
var TC_TO_TCO2 = 3.67;

// Variáveis de estado que viajam no tempo
var out_bands = ee.Image().select();
var degr_acum_tC = ee.Image(0);      // Acumula perda para abater do estoque nativo
var hist_deg_mask = ee.Image(0);     // A grande sacada: Máscara histórica de áreas degradadas

YEARS_FIRE.forEach(function (y, i) {
    // 1. IDENTIFICAÇÃO DO USO E COBERTURA
    var desf_y = desf_reg_corrected.select('classification_' + y);
    var is_native = desf_y.eq(2);
    var is_sec = desf_y.eq(3).or(desf_y.eq(5));
    var is_defor = desf_y.eq(4).or(desf_y.eq(6));

    // 2. ENTRADAS DE DEGRADAÇÃO (Já em t/ha. Assumindo que você já aplicou os GWP 28 e 265 antes)
    var f_fl_co2e = fire_forest_co2e.select('.*_' + y).unmask(0);
    var f_sv_co2e = fire_savanna_co2e.select('.*_' + y).unmask(0);
    var f_gr_co2e = fire_grassland_co2e.select('.*_' + y).unmask(0);
    var mad_co2e = (i >= YEARS_FIRE.indexOf('2017')) ? logging_co2e.select('.*_' + y).unmask(0) : ee.Image(0);

    var fire_co2e = f_fl_co2e.add(f_sv_co2e);

    // 3. CONVERGÊNCIA (Apenas intersecção no mesmo ano)
    var is_convergence = f_fl_co2e.gt(0).and(mad_co2e.gt(0));
    var convergence_co2e = f_fl_co2e.add(mad_co2e).updateMask(is_convergence);

    // 4. ATUALIZAÇÃO DA MÁSCARA HISTÓRICA (A Regra do Pixel Zero)
    // Se teve alguma degradação hoje (fogo ou madeira), vira 1.
    var has_degradation_now = fire_co2e.gt(0).or(mad_co2e.gt(0));
    
    // O pixel mantém o status de "Área Degradada" (1) SE já era degradado antes OU degradou agora,
    // DESDE QUE ainda seja Vegetação Nativa. Se for desmatado, ele perde o status.
    hist_deg_mask = hist_deg_mask.or(has_degradation_now).and(is_native);

    // 5. BALANÇO DE ESTOQUE (Matemática interna em tC/ha)
    // Transforma CO2e de volta em Carbono para abater do estoque nativo
    var degr_current_tC = fire_co2e.add(mad_co2e).divide(TC_TO_TCO2);
    
    // ... Aqui entra o incremento da vegetação secundária (como fizemos antes)
    var incr_y = sec_veg_increment.select('sec_veg_increment_' + y).subtract(
        (i === 0) ? ee.Image(0) : sec_veg_increment.select('sec_veg_increment_' + YEARS_FIRE[i-1])
    ).unmask(0);

    degr_acum_tC = degr_acum_tC.add(incr_y).subtract(degr_current_tC);
    
    var stock_bruto_y = biomass_stock_bruto.select('biomass_stock_' + y);
    var stk_fin = stock_bruto_y.where(is_native, stock_bruto_y.add(degr_acum_tC));
    
    var past_stock_y = (i === 0) ? biomass_stock_bruto.select('biomass_stock_1985') : out_bands.select('stock_' + YEARS_FIRE[i - 1]);
    var delta_stock_tC = past_stock_y.subtract(stk_fin);

    // 6. CÁLCULO DE EXPORTAÇÃO E MULTIPLICAÇÃO DE ÁREA (Total de tCO2e no pixel)
    var loss_defor_total = delta_stock_tC.subtract(degr_current_tC).max(0).multiply(TC_TO_TCO2).multiply(pixel_area_ha).multiply(is_defor);
    var gain_secveg_total = delta_stock_tC.min(0).abs().multiply(is_sec).multiply(TC_TO_TCO2).multiply(pixel_area_ha);
    
    // 7. EMPACOTAMENTO DAS BANDAS (Aplicando o "Pixel Zero")
    out_bands = out_bands.addBands([
        stk_fin.rename('stock_' + y).float(), // Estoque permanece em tC/ha
        gain_secveg_total.rename('gain_secondary_vegetation_' + y).float(),
        loss_defor_total.rename('loss_deforestation_' + y).float(),
        
        // Emissões de degradação: Usamos .updateMask(hist_deg_mask)
        // Isso garante que áreas que foram degradadas no passado e continuam nativas 
        // receberão "0", enquanto o restante do mapa será mascarado.
        fire_co2e.multiply(pixel_area_ha).updateMask(hist_deg_mask).rename('loss_fire_' + y).float(),
        mad_co2e.multiply(pixel_area_ha).updateMask(hist_deg_mask).rename('loss_selective_logging_' + y).float(),
        convergence_co2e.multiply(pixel_area_ha).unmask(0).updateMask(hist_deg_mask).rename('loss_convergence_degradation_' + y).float(),
        
        // Grassland fire é tratado a parte
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
    overwriter:true
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
Map.addLayer(fire_grassland.select('CO2_tC_ha_.*'), { bands: ['CO2_tC_ha_' + anoVis], min: 0, max: 30, palette: paletaFogo }, 'INPUT: Fogo Campestre ' + anoVis, false);
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
