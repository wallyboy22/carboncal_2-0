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
// Emissões GHG por fogo em savanas não relatadas no desmatamento
// 2026/04/17 - organizado para a Calculadora de Carbono do Instituto de Pesquisa Ambiental da Amazônia.
// Creado por Celso Junior, Camila Silva e Wallace Silva, 
// Com o objetivo de atender as emissões referentes a área queimada do Modulo 3 para a CCAL

// referências: 
// Leticia Gomes et al (2024), acesse: https://www.mdpi.com/2571-6255/7/8/280
// Sabina Ribeiro et al. (2011)); https://doi.org/10.1016/j.foreco.2011.04.017
//_______________________________________________________________________________

// inputs:
// área queimada anual em savanas que nunca foram desmatadas
// quantidade de toneladas por hectare de carbono nos compartimentos de biomassa acima do solo, madeira morta e serrapilheira.
var fire = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1')
        .unmask(0)
        .multiply(stable_florest);

var fogo_ac = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1')
    .slice(1, 40)
    .selfMask();

var ysf = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1')
    .selfMask();

var c_rect = ee.Image("projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10");


function savanna_fire_emission_calculate (annual_fire,frequency_fire,time_after_fire,historic_carbon){
  
  var agb = historic_carbon.select("AGB");
  var agb26 = agb.multiply(0.26); // FWD (26% da agb / Ribeiro et al. (2011));
  var dw = historic_carbon.select("CDW");
  var litter = historic_carbon.select("LITTER");
  
  // Reclassificação da Frequência e do tempo desde o ultimo fogo para calcular o indice de severidade do fogo para savanas conservadas,
  // referencia: Gomes et al (2024

  var frequency_fire_mean = fogo_ac_sav
    .reduce("mean");
  var frequency_fire_reclassified = frequency_fire
    .where(frequency_fire_mean.gte(1).and(frequency_fire_mean.lt(3)), 1) // baixa severidade
    .where(frequency_fire_mean.gte(3).and(frequency_fire_mean.lt(5)), 2) // media-baixa
    .where(frequency_fire_mean.gte(5).and(frequency_fire_mean.lt(7)), 3) // media-alta
    .where(frequency_fire_mean.gte(7), 4); // alta
  
  var time_after_fire_reclassified = time_after_fire
      .where(time_after_fire.gte(0).and(time_after_fire.lt(4)), 4) // baixo tempo de recuperacao
      .where(time_after_fire.gte(4).and(time_after_fire.lt(7)), 3) // medio-baixo tempo
      .where(time_after_fire.gte(7).and(time_after_fire.lt(10)), 2) // medio-alto tempo
      .where(time_after_fire.gte(10), 1); // alto tempo
  
  var severity_fire_index = time_after_fire_reclassified.add(frequency_fire_reclassified);

  // Fator de perdas espacializados com base no regime do fogo
  var agb_loss = agb_loss
      .where(severity_fire.gte(2).and(severity_fire.lte(3)), 0.021) //
      .where(severity_fire.gt(3).and(severity_fire.lte(6)), -0.004)
      .where(severity_fire.gt(6), -0.02)
      .unmask(0);
  
  // Inicializar imagens com bandas
  var co2_bands = ee.Image().select();
  var co_bands = ee.Image().select();
  var ch4_bands = ee.Image().select();
  var n2o_bands = ee.Image().select();
  var nox_bands = ee.Image().select();
  
  function calculateCEmissions(Year) {
    
    /// Fatores de Emissão para o Ano "Year" ///
    var emission_factors_year = emission_factors.select('classification_' + Year);
    var fire_year = fire.select('burned_area_' + Year);
    
    // Tardias
    // CO2
    var fire_co2_late = agb.multiply(fire_year).multiply(emission_factors_year).multiply(44/12);
  
    // Combustão
    // CO fatores de combustão -> 0.873 e 0.459 || conteudo de carbono -> 1/0.47 || fator de emissão -> 65 || convertendo a unidade -> 0.0001
    var fire_co_comb_l = litter.multiply(fire_year).multiply(0.873).multiply(1/0.47).multiply(65).multiply(0.001);
    var fire_co_comb_agb26 = agb26.multiply(fire_year).multiply(0.873).multiply(1/0.47).multiply(65).multiply(0.001);
    var fire_co_comb_dw = dw.multiply(fire_year).multiply(0.459).multiply(1/0.47).multiply(65).multiply(0.001);
    
    // CH4
    var fire_ch4_comb_l = litter.multiply(fire_year).multiply(0.873).multiply(1/0.47).multiply(2.3).multiply(0.001);
    var fire_ch4_comb_agb26 = agb26.multiply(fire_year).multiply(0.873).multiply(1/0.47).multiply(2.3).multiply(0.001);
    var fire_ch4_comb_dw = dw.multiply(fire_year).multiply(0.459).multiply(1/0.47).multiply(2.3).multiply(0.001);
    
    // N2O
    var fire_n2o_comb_l = litter.multiply(fire_year).multiply(0.873).multiply(1/0.47).multiply(0.21).multiply(0.001);
    var fire_n2o_comb_agb26 = agb26.multiply(fire_year).multiply(0.873).multiply(1/0.47).multiply(0.21).multiply(0.001);
    var fire_n2o_comb_dw = dw.multiply(fire_year).multiply(0.459).multiply(1/0.47).multiply(0.21).multiply(0.001);
    
    // NOx
    var fire_nox_comb_l = litter.multiply(fire_year).multiply(0.873).multiply(1/0.47).multiply(3.9).multiply(0.001);
    var fire_nox_comb_agb26 = agb26.multiply(fire_year).multiply(0.873).multiply(1/0.47).multiply(3.9).multiply(0.001);
    var fire_nox_comb_dw = dw.multiply(fire_year).multiply(0.459).multiply(1/0.47).multiply(3.9).multiply(0.001);
    
    // Sum Non-CO2 Emissions
    var fire_co_comb = fire_co_comb_l.add(fire_co_comb_dw).add(fire_co_comb_agb26);  
    var fire_ch4_comb = fire_ch4_comb_l.add(fire_ch4_comb_dw).add(fire_ch4_comb_agb26);
    var fire_n2o_comb = fire_n2o_comb_l.add(fire_n2o_comb_dw).add(fire_n2o_comb_agb26);
    var fire_nox_comb = fire_nox_comb_l.add(fire_nox_comb_dw).add(fire_nox_comb_agb26);  
  
    // Atualizando os Compartimentos de Carbono
    agb = agb.add(agb.multiply(fire_year).multiply(emission_factors_year));
    agb26 = agb.multiply(0.26);
    
    // Adicionar bandas correspondentes ao ano
    co2_bands = co2_bands.addBands(emission_fire_co2_late.rename('CO2_ha_' + Year));
    co_bands = co_bands.addBands(emission_fire_co_comb.rename('CO_ha_' + Year));
    ch4_bands = ch4_bands.addBands(emission_fire_ch4_comb.rename('CH4_ha_' + Year));
    n2o_bands = n2o_bands.addBands(emission_fire_n2o_comb.rename('N2O_ha_' + Year));
    nox_bands = nox_bands.addBands(emission_fire_nox_comb.rename('NOx_ha_' + Year));
  
    return Year + 1; // Retorna o próximo ano
  }
  
  
  // Função para iterar através dos anos
  function iterateYears(startYear, endYear) {
    if (startYear < endYear) {
      var nextYear = calculateCEmissions(startYear);
      iterateYears(nextYear, endYear);
    }
  }
  // Chamando a função para calcular as emissões no período de 1986 a 2024
  iterateYears(1986, 2025); // O ano final é exclusivo, então este intervalo cobrirá 1986 a 2024. 

}

// Exportar imagens com bandas para cada gás
Export.image.toAsset({
    image: co2_bands.toFloat(),
    description: 'brasil_savanas_co2_all_years_v1',
    assetId: 'projects/ee-ipam/assets/CCAL/MODULO3/v035/FOGO/SAVANA/brasil_savanas_co2_all_years_v1',
    scale: 30,
    region: stable_florest.geometry().bounds(),
    maxPixels: 1e13
});

Export.image.toAsset({
    image: co_bands.toFloat(),
    description: 'brasil_savanas_co_all_years_v1',
    assetId: 'projects/ee-ipam/assets/CCAL/MODULO3/v035/FOGO/SAVANA/brasil_savanas_co_all_years_v1',
    scale: 30,
    region: stable_florest.geometry().bounds(),
    maxPixels: 1e13
});

Export.image.toAsset({
    image: ch4_bands.toFloat(),
    description: 'brasil_savanas_ch4_all_years_v1',
    assetId: 'projects/ee-ipam/assets/CCAL/MODULO3/v035/FOGO/SAVANA/brasil_savanas_ch4_all_years_v1',
    scale: 30,
    region: stable_florest.geometry().bounds(),
    maxPixels: 1e13
});

Export.image.toAsset({
    image: n2o_bands.toFloat(),
    description: 'brasil_savanas_n2o_all_years_v1',
    assetId: 'projects/ee-ipam/assets/CCAL/MODULO3/v035/FOGO/SAVANA/brasil_savanas_n2o_all_years_v1',
    scale: 30,
    region: stable_florest.geometry().bounds(),
    maxPixels: 1e13
});

Export.image.toAsset({
    image: nox_bands.toFloat(),
    description: 'brasil_savanas_nox_all_years_v1',
    assetId: 'projects/ee-ipam/assets/CCAL/MODULO3/v035/FOGO/SAVANA/brasil_savanas_nox_all_years_v1',
    scale: 30,
    region: stable_florest.geometry().bounds(),
    maxPixels: 1e13
});