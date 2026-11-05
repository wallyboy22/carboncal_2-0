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
 * SCRIPT: 04_simple_investigate_modulo3.js
 * DESCRIÇÃO: Visualização simples de todas as camadas do Módulo 3.
 *            Sem interface interativa — apenas Map.addLayer para inspeção
 *            tradicional via Inspector do Earth Engine.
 * -----------------------------------------------------------------------------
 * INSTITUIÇÃO: IPAM Amazônia
 * EQUIPE CCAL: Ane Alencar; Bárbara Zimbres; Camila Silva; Celso Silva-Junior; 
 *              Edriano Souza; Isabel Silva; Lívia Laureto; Manuela Padilha; 
 *              Paulo Moutinho; Rebecca Maranhão; Valderli Piontekowski; Wallace Silva
 * CONTATO: https://ipam.org.br/contato/fale-conosco/
 * ATUALIZAÇÃO: 2026-05-28
 * =============================================================================
 */


// 1. PARÂMETROS E ATIVOS
var VERSION = 'v036';
var BASE_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/';
var FINAL_ASSET = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSION + '/CCAL_MODULO3-' + VERSION;
var YEARS_ALL = ['1985', '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
  '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
  '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
  '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];
var YEARS_FIRE = YEARS_ALL.slice(1);
var GWP_CH4 = 28, GWP_N2O = 265, TC_TO_TCO2 = 3.67;
var TARGET = '2023';

// Ativos
var biomass_stock_bruto = ee.Image(BASE_ASSET + 'biomass_stock_' + VERSION);
var sec_veg_increment = ee.Image(BASE_ASSET + 'secondary_veg_increment_' + VERSION);
var fire_forest = ee.Image(BASE_ASSET + 'fire_forest_emissions_' + VERSION);
var fire_savanna = ee.Image(BASE_ASSET + 'fire_savanna_emissions_' + VERSION);
fire_savanna = fire_savanna.select(fire_savanna.bandNames(), fire_savanna.bandNames().map(function (s) { return ee.String(s).replace('CO2_tCO2e_ha_', 'CO2_tC_ha_') }));
var fire_grassland = ee.Image(BASE_ASSET + 'fire_grassland_emissions_' + VERSION);
var logging = ee.Image(BASE_ASSET + 'logging_emissions_' + VERSION);

var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var desf_reg = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');
var fire_annual = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1').select('burned_area_.*');
var fire_freq = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1').select('fire_frequency_1985_.*');
var fire_tsf = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1').select('classification_.*');

// Paletas
var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');
var paletaTrans = ["#ffffff", '#faf5d1', '#3f7849', '#5bcf20', '#ea1c1c', '#b4f792', '#fe9934', '#303149'];
var paletaStock = ["#440154", "#46327e", "#365c8d", "#277f8e", "#1fa187", "#4ac16d", "#a0da39", "#fde725"];

// 2. CORREÇÃO TÉCNICA (DESF_REG)
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

// 3. PRODUTO FINAL
// Usa o asset ja exportado. Para recalcular o balanco via assets
// intermediarios, descomente o bloco comentado abaixo.
var final_image = ee.Image(FINAL_ASSET);

/*
// --- MOTOR DE BALANCO (via assets intermediarios) ---
var pixel_area_ha = ee.Image.pixelArea().divide(10000);
var age_acum = ee.Image(0);
var degr_acum = ee.Image(0);
var out_bands = ee.Image().select();

YEARS_FIRE.forEach(function (y, i) {
  var desf_y = desf_reg_corrected.select('classification_' + y);
  var is_sec = desf_y.eq(3).or(desf_y.eq(5));
  age_acum = age_acum.add(1).multiply(is_sec);

  var f_fl_co2 = fire_forest.select('CO2_tC_ha_' + y).unmask(0);
  var f_sv_co2 = fire_savanna.select('CO2_tC_ha_' + y).unmask(0);
  var mad_tC = (i >= YEARS_FIRE.indexOf('2017')) ? logging.select('logging_tC_ha_' + y).unmask(0) : ee.Image(0);

  var incr_y = sec_veg_increment.select('sec_veg_increment_' + y).subtract(
    (i === 0) ? ee.Image(0) : sec_veg_increment.select('sec_veg_increment_' + YEARS_FIRE[i - 1])
  ).unmask(0);

  degr_acum = degr_acum.add(incr_y).subtract(f_fl_co2).subtract(f_sv_co2).subtract(mad_tC);

  var past_stock_y = (i === 0) ? biomass_stock_bruto.select('biomass_stock_1985') : out_bands.select('stock_' + YEARS_FIRE[i - 1]);
  var stock_bruto_y = biomass_stock_bruto.select('biomass_stock_' + y);
  var stk_fin = stock_bruto_y.where(desf_y.eq(2), stock_bruto_y.add(degr_acum));

  var delta_stock_tC = past_stock_y.subtract(stk_fin);
  var degradation_tC_y = f_fl_co2.add(f_sv_co2).add(mad_tC);

  var loss_defor_y = delta_stock_tC.subtract(degradation_tC_y).max(0).multiply(TC_TO_TCO2).multiply(pixel_area_ha);
  var gain_secveg_y = delta_stock_tC.min(0).abs().multiply(is_sec).multiply(TC_TO_TCO2).multiply(pixel_area_ha);

  out_bands = out_bands.addBands([
    gain_secveg_y.rename('gain_secondary_vegetation_' + y),
    stk_fin.rename('stock_' + y),
    f_fl_co2.add(f_sv_co2).multiply(TC_TO_TCO2).multiply(pixel_area_ha).rename('loss_fire_' + y),
    mad_tC.multiply(TC_TO_TCO2).multiply(pixel_area_ha).rename('loss_selective_logging_' + y),
    loss_defor_y.rename('loss_deforestation_' + y),
    age_acum.rename('age_secveg_' + y)
  ]);
});
var final_image = out_bands.float();
*/

// Idade da veg. secundaria (nao esta no asset final, calculada separado)
var age_acum = ee.Image(0);
var age_img = ee.Image().select();
YEARS_FIRE.forEach(function (y, i) {
  var desf_y = desf_reg_corrected.select('classification_' + y);
  var is_sec = desf_y.eq(3).or(desf_y.eq(5));
  age_acum = age_acum.add(1).multiply(is_sec);
  age_img = age_img.addBands(age_acum.rename('age_secveg_' + y));
});
final_image = final_image.addBands(age_img);

// =============================================================================
// 4. MAP.ADDLAYER — TODAS AS CAMADAS
// =============================================================================

// --- Produto final bruto (todas bandas, sem filtro)
Map.addLayer(final_image, {}, 'Produto Final (todas bandas)', false);

// --- Referência
Map.addLayer(lulc.select('classification_.*'), { bands: ['classification_' + TARGET], min: 0, max: 75, palette: paletaMapBiomas }, 'LULC ' + TARGET, false);
Map.addLayer(desf_reg.select('classification_.*'), { bands: ['classification_' + TARGET], min: 0, max: 7, palette: paletaTrans }, 'Desf/Reg Original ' + TARGET, false);
Map.addLayer(desf_reg_corrected.select('classification_.*'), { bands: ['classification_' + TARGET], min: 0, max: 7, palette: paletaTrans }, 'Desf/Reg Corrigido ' + TARGET, false);

// --- Fogo (entradas)
Map.addLayer(fire_annual.select('burned_area_.*').selfMask(), { bands: ['burned_area_' + TARGET], palette: ['red'] }, 'Area Queimada ' + TARGET, false);
Map.addLayer(fire_freq, { bands: ['fire_frequency_1985_' + TARGET], min: 1, max: 20, palette: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'] }, 'Frequencia Fogo ' + TARGET, false);
Map.addLayer(fire_tsf, { bands: ['classification_' + TARGET], min: 1, max: 40, palette: ['#ffffd4', '#fed98e', '#fe9929', '#d95f0e', '#993404'] }, 'TSF ' + TARGET, false);

// --- Estoque
Map.addLayer(biomass_stock_bruto.select('biomass_stock_.*'), { bands: ['biomass_stock_' + TARGET], min: 0, max: 250, palette: paletaStock }, 'Estoque Base ' + TARGET, false);
Map.addLayer(sec_veg_increment.select('sec_veg_increment_.*').selfMask(), { bands: ['sec_veg_increment_' + TARGET], min: 0, max: 100, palette: ['#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c'] }, 'Incremento Veg. Sec. ' + TARGET, false);
Map.addLayer(final_image.select('age_secveg_.*').selfMask(), { bands: ['age_secveg_' + TARGET], min: 1, max: 40, palette: ['#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c'] }, 'Idade Veg. Sec. ' + TARGET, false);

// --- Floresta (6 gases)
Map.addLayer(fire_forest.select('CO2_tC_ha_.*').selfMask(), { bands: ['CO2_tC_ha_' + TARGET], min: 0, max: 50, palette: ['white', 'orange', 'red'] }, 'CO2 Floresta ' + TARGET + ' (tC/ha)', false);
Map.addLayer(fire_forest.select('CO2_gross_t_ha_.*').selfMask(), { bands: ['CO2_gross_t_ha_' + TARGET], min: 0, max: 50, palette: ['white', 'orange', 'red'] }, 'CO2 Bruto Floresta ' + TARGET + ' (t/ha)', false);
Map.addLayer(fire_forest.select('CH4_t_ha_.*').selfMask(), { bands: ['CH4_t_ha_' + TARGET], min: 0, max: 0.1, palette: ['white', 'purple'] }, 'CH4 Floresta ' + TARGET + ' (t/ha)', false);
Map.addLayer(fire_forest.select('N2O_t_ha_.*').selfMask(), { bands: ['N2O_t_ha_' + TARGET], min: 0, max: 0.01, palette: ['white', 'cyan'] }, 'N2O Floresta ' + TARGET + ' (t/ha)', false);
Map.addLayer(fire_forest.select('CO_t_ha_.*').selfMask(), { bands: ['CO_t_ha_' + TARGET], min: 0, max: 0.1, palette: ['white', 'blue'] }, 'CO Floresta ' + TARGET + ' (t/ha)', false);
Map.addLayer(fire_forest.select('NOX_t_ha_.*').selfMask(), { bands: ['NOX_t_ha_' + TARGET], min: 0, max: 0.01, palette: ['white', 'yellow'] }, 'NOX Floresta ' + TARGET + ' (t/ha)', false);

// --- Savana (5 gases)
Map.addLayer(fire_savanna.select('CO2_tC_ha_.*').selfMask(), { bands: ['CO2_tC_ha_' + TARGET], min: 0, max: 50, palette: ['white', 'orange', 'red'] }, 'CO2 Savana ' + TARGET + ' (tC/ha)', false);
Map.addLayer(fire_savanna.select('CH4_t_ha_.*').selfMask(), { bands: ['CH4_t_ha_' + TARGET], min: 0, max: 0.1, palette: ['white', 'purple'] }, 'CH4 Savana ' + TARGET + ' (t/ha)', false);
Map.addLayer(fire_savanna.select('N2O_t_ha_.*').selfMask(), { bands: ['N2O_t_ha_' + TARGET], min: 0, max: 0.01, palette: ['white', 'cyan'] }, 'N2O Savana ' + TARGET + ' (t/ha)', false);
Map.addLayer(fire_savanna.select('CO_t_ha_.*').selfMask(), { bands: ['CO_t_ha_' + TARGET], min: 0, max: 0.1, palette: ['white', 'blue'] }, 'CO Savana ' + TARGET + ' (t/ha)', false);
Map.addLayer(fire_savanna.select('NOX_t_ha_.*').selfMask(), { bands: ['NOX_t_ha_' + TARGET], min: 0, max: 0.01, palette: ['white', 'yellow'] }, 'NOX Savana ' + TARGET + ' (t/ha)', false);

// --- Campo (4 gases)
Map.addLayer(fire_grassland.select('CH4_t_ha_.*').selfMask(), { bands: ['CH4_t_ha_' + TARGET], min: 0, max: 0.1, palette: ['white', 'purple'] }, 'CH4 Campo ' + TARGET + ' (t/ha)', false);
Map.addLayer(fire_grassland.select('N2O_t_ha_.*').selfMask(), { bands: ['N2O_t_ha_' + TARGET], min: 0, max: 0.01, palette: ['white', 'cyan'] }, 'N2O Campo ' + TARGET + ' (t/ha)', false);
Map.addLayer(fire_grassland.select('CO_t_ha_.*').selfMask(), { bands: ['CO_t_ha_' + TARGET], min: 0, max: 0.1, palette: ['white', 'blue'] }, 'CO Campo ' + TARGET + ' (t/ha)', false);
Map.addLayer(fire_grassland.select('NOX_t_ha_.*').selfMask(), { bands: ['NOX_t_ha_' + TARGET], min: 0, max: 0.01, palette: ['white', 'yellow'] }, 'NOX Campo ' + TARGET + ' (t/ha)', false);

// --- Corte Seletivo
Map.addLayer(logging.select('logging_tC_ha_.*').selfMask(), { bands: ['logging_tC_ha_' + TARGET], min: 0, max: 10, palette: ['white', 'brown'] }, 'Corte Seletivo ' + TARGET + ' (tC/ha)', false);

// --- Saídas (com select por serie)
Map.addLayer(final_image.select('stock_.*').selfMask(), { bands: ['stock_' + TARGET], min: 0, max: 250, palette: paletaStock }, 'Estoque Final ' + TARGET + ' (tC/ha)', true);
Map.addLayer(final_image.select('loss_fire_.*').selfMask(), { bands: ['loss_fire_' + TARGET], min: 0, max: 50, palette: ['white', 'orange', 'red'] }, 'Fogo Total ' + TARGET + ' (tCO2e/pixel)', false);
Map.addLayer(final_image.select('loss_selective_logging_.*').selfMask(), { bands: ['loss_selective_logging_' + TARGET], min: 0, max: 50, palette: ['white', 'brown'] }, 'Corte Sel. Total ' + TARGET + ' (tCO2e/pixel)', false);
Map.addLayer(final_image.select('gain_secondary_vegetation_.*').selfMask(), { bands: ['gain_secondary_vegetation_' + TARGET], min: 0, max: 10, palette: ['white', 'green'] }, 'Regeneracao Total ' + TARGET + ' (tCO2e/pixel)', false);
Map.addLayer(final_image.select('loss_deforestation_.*').selfMask(), { bands: ['loss_deforestation_' + TARGET], min: 0, max: 100, palette: ['white', 'red'] }, 'Desmatamento ' + TARGET + ' (tCO2e/pixel)', false);
