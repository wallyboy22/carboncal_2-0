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
// CCAL Módulo 3 — Auditoria Técnica v036 (COMPLETO)
// Reconstrução pixel-a-pixel com todas as camadas de inspeção.
// =============================================================================

// 1. PARÂMETROS E ATIVOS
var VERSAO = 'v036';
var ASSET_BASE = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSAO + '/';
var ANOS_SERIE = ['1985', '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
  '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
  '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
  '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];
var ANOS_FOGO = ANOS_SERIE.slice(1);

// Constantes de Emissão
var GWP_CH4 = 28, GWP_N2O = 265, TC_PARA_TCO2 = 3.67;

// 2. FUNÇÃO DE RECONSTRUÇÃO (BALANÇO M3)
function reconstruirBalancoM3(inputs) {
  var area_ha = ee.Image.pixelArea().divide(10000);
  var out_fogo = ee.Image().select(), out_mad = ee.Image().select();
  var out_def = ee.Image().select(), out_reg = ee.Image().select(), out_stk = ee.Image().select();

  var stk_ant = inputs.estoque_bruto.select('biomass_stock_1985');
  var degr_acum = ee.Image(0);

  ANOS_FOGO.forEach(function (ano, i) {
    var f_fl_co2 = inputs.fogo_floresta.select('CO2_tC_ha_' + ano).unmask(0);
    var f_sv_co2e = inputs.fogo_savana.select('CO2_tCO2e_ha_' + ano).unmask(0);
    var mad_tC = (i >= ANOS_FOGO.indexOf('2017')) ? inputs.madeira.select('logging_tC_ha_' + ano).unmask(0) : ee.Image(0);

    // Balanço de Biomassa (C)
    degr_acum = degr_acum.subtract(f_fl_co2).subtract(f_sv_co2e.divide(TC_PARA_TCO2)).subtract(mad_tC);
    var stk_bruto = inputs.estoque_bruto.select('biomass_stock_' + ano);
    var desf_y = inputs.transicao.select('classification_' + ano);
    var stk_atual = stk_bruto.where(desf_y.eq(2), stk_bruto.add(degr_acum)).rename('stock_' + ano);
    
    var balanco_y = stk_ant.subtract(stk_atual).multiply(TC_PARA_TCO2);
    stk_ant = stk_atual;

    // Totais tCO2e/px (GWP)
    var f_fl_ch4 = inputs.fogo_floresta.select('CH4_t_ha_' + ano).unmask(0);
    var f_fl_n2o = inputs.fogo_floresta.select('N2O_t_ha_' + ano).unmask(0);
    var f_sv_ch4 = inputs.fogo_savana.select('CH4_t_ha_' + ano).unmask(0);
    var f_sv_n2o = inputs.fogo_savana.select('N2O_t_ha_' + ano).unmask(0);
    var f_cp_ch4 = inputs.fogo_campo.select('CH4_t_ha_' + ano).unmask(0);
    var f_cp_n2o = inputs.fogo_campo.select('N2O_t_ha_' + ano).unmask(0);

    var fogo_gwp = f_fl_co2.multiply(TC_PARA_TCO2).add(f_fl_ch4.multiply(GWP_CH4)).add(f_fl_n2o.multiply(GWP_N2O))
                  .add(f_sv_co2e).add(f_sv_ch4.multiply(GWP_CH4)).add(f_sv_n2o.multiply(GWP_N2O))
                  .add(f_cp_ch4.multiply(GWP_CH4)).add(f_cp_n2o.multiply(GWP_N2O)).multiply(area_ha);

    out_fogo = out_fogo.addBands(fogo_gwp.rename('fogo_total_' + ano));
    out_mad = out_mad.addBands(mad_tC.multiply(TC_PARA_TCO2).multiply(area_ha).rename('madeira_total_' + ano));
    out_def = out_def.addBands(balanco_y.max(0).multiply(area_ha).rename('desmatamento_total_' + ano));
    out_reg = out_reg.addBands(balanco_y.min(0).multiply(desf_y.eq(3).or(desf_y.eq(5))).multiply(area_ha).rename('regeneracao_total_' + ano));
    out_stk = out_stk.addBands(stk_atual);
  });

  return out_fogo.addBands(out_mad).addBands(out_def).addBands(out_reg).addBands(out_stk).float();
}

// 3. CARREGAMENTO DOS ASSETS
var tech_inputs = {
  estoque_bruto: ee.Image(ASSET_BASE + 'biomass_stock_' + VERSAO),
  fogo_floresta: ee.Image(ASSET_BASE + 'fire_forest_emissions_' + VERSAO),
  fogo_savana: ee.Image(ASSET_BASE + 'fire_savanna_emissions_' + VERSAO),
  fogo_campo: ee.Image(ASSET_BASE + 'fire_grassland_emissions_' + VERSAO),
  madeira: ee.Image(ASSET_BASE + 'logging_emissions_' + VERSAO),
  lulc: ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1'),
  transicao: ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1'),
  fogo_anual: ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1'),
  fogo_freq: ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1'),
  fogo_tsf: ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1')
};

var balanco = reconstruirBalancoM3(tech_inputs);

// 4. INTERFACE E CAMADAS
var painel = ui.Panel({ style: { width: '500px', padding: '12px' } });
var m_container = ui.Panel({ style: { stretch: 'both', backgroundColor: '#f8f9fa', border: '1px solid #ddd' } });
var gaveta = ui.Panel({ style: { shown: false, margin: '10px 0' } });
var config = { unidade: 'tC/ha', ultimos_dados: null };

function addLayer(id, label, layer, shown) {
  var cb = ui.Checkbox({ label: label, value: shown, onChange: function(v) { layer.setShown(v); } });
  gaveta.add(cb); Map.add(layer); layer.setShown(shown);
}

var paletaMB = require('users/mapbiomas/modules:Palettes.js').get('brazil');
var ano_inspecao = '2023';

gaveta.add(ui.Label('Classificação (Mapas Base):', {fontWeight:'bold'}));
addLayer('lulc', 'Uso e Cobertura (MB)', ui.Map.Layer(tech_inputs.lulc, {bands:['classification_'+ano_inspecao], min:0, max:62, palette:paletaMB}, 'LULC'), true);
addLayer('fogo_anual', 'Área Queimada (Binária)', ui.Map.Layer(tech_inputs.fogo_anual.gt(0).selfMask(), {bands:['burned_area_'+ano_inspecao], palette:['red']}, 'Fogo Anual'), false);
addLayer('fogo_freq', 'Frequência de Fogo', ui.Map.Layer(tech_inputs.fogo_freq, {bands:['fire_frequency_1985_'+ano_inspecao], min:0, max:10, palette:['white','orange','red']}, 'Freq. Fogo'), false);
addLayer('fogo_tsf', 'Tempo após Fogo (TSF)', ui.Map.Layer(tech_inputs.fogo_tsf, {bands:['classification_'+ano_inspecao], min:0, max:40, palette:['red','yellow','green']}, 'TSF'), false);

gaveta.add(ui.Label('Entradas (Densidade):', {fontWeight:'bold', color:'#2980b9'}));
addLayer('stk_in', 'Estoque Inicial (C)', ui.Map.Layer(tech_inputs.estoque_bruto, {bands:['biomass_stock_'+ano_inspecao], min:0, max:200, palette:['white','green']}, 'Estoque Inicial'), false);
addLayer('mad_dens', 'Corte Seletivo (C)', ui.Map.Layer(tech_inputs.madeira, {bands:['logging_tC_ha_'+ano_inspecao], min:0, max:30, palette:['white','purple']}, 'Madeira Densidade'), false);

gaveta.add(ui.Label('Saídas (Massa Total tCO2e/px):', {fontWeight:'bold', color:'#27ae60'}));
addLayer('fogo_px', 'Queima Biomassa (CO2e)', ui.Map.Layer(balanco, {bands:['fogo_total_'+ano_inspecao], min:0, max:20, palette:['white','orange','red']}, 'Fogo Total'), true);
addLayer('mad_px', 'Corte Seletivo (CO2)', ui.Map.Layer(balanco, {bands:['madeira_total_'+ano_inspecao], min:0, max:20, palette:['white','purple']}, 'Madeira Total'), true);
addLayer('def_px', 'Desmatamento (CO2)', ui.Map.Layer(balanco, {bands:['desmatamento_total_'+ano_inspecao], min:0, max:50, palette:['white','red','black']}, 'Desmatamento'), true);
addLayer('stk_out', 'Estoque Final (C)', ui.Map.Layer(balanco, {bands:['stock_'+ano_inspecao], min:0, max:200, palette:['white','green']}, 'Estoque Final'), true);

painel.add(ui.Label('🔍 CCAL M3 Auditor Técnica v036', {fontWeight:'bold', fontSize:'20px'}));
painel.add(ui.Label('Clique no mapa para analisar o balanço de carbono anual.'));
var p_u = ui.Panel({layout:ui.Panel.Layout.flow('horizontal')});
p_u.add(ui.Label('Unidade na Matriz:'));
p_u.add(ui.Select({ items: ['tC/ha', 'tCO2e/ha', 't/pixel', 'tCO2e/pixel'], value: config.unidade, onChange: function(v){ config.unidade=v; if(config.ultimos_dados) renderMatriz(config.ultimos_dados); } }));
painel.add(p_u);
painel.add(m_container);
painel.add(ui.Button('⚙️ Configurar Camadas', function(){ gaveta.style().set('shown', !gaveta.style().get('shown')) }));
painel.add(gaveta);
ui.root.insert(0, painel);

// 5. MATRIZ DE AUDITORIA
var nomes_col = {
  ano: 'Ano', lulc: 'LULC', trans: 'Tr.', f_an: 'Fogo', stk_in: 'E.In(C)', mad_in: 'Mad(C)',
  f_co2: 'f_CO2', f_ch4: 'f_CH4', f_n2o: 'f_N2O', 
  stk_ot: 'E.Out(C)', f_tot: 'Q.CO2e', mad_ot: 'M.CO2', def_ot: 'D.CO2'
};

function renderMatriz(dados) {
  m_container.clear();
  var area = dados.area_pixel || 0.09;
  var sub = ui.Panel({ layout: ui.Panel.Layout.flow('vertical') });
  m_container.add(sub);
  
  var ids = ['ano', 'lulc', 'stk_in', 'f_co2', 'f_ch4', 'f_n2o', 'mad_in', 'stk_ot', 'f_tot', 'mad_ot', 'def_ot'];
  var h = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal'), style: {backgroundColor:'#eee'} });
  ids.forEach(function(id){ h.add(ui.Label(nomes_col[id], {fontWeight:'bold', fontSize:'8px', width:'42px', textAlign:'center'})); });
  sub.add(h);

  ANOS_FOGO.forEach(function(ano) {
    var l = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal') });
    ids.forEach(function(id) {
      var v = ' ', s = {fontSize:'8px', width:'42px', textAlign:'center'};
      if (id === 'ano') v = ano.slice(-2);
      else if (id === 'lulc') { v = dados['lulc_'+ano]; s.backgroundColor = paletaMB[v]; }
      else {
        var raw = 0;
        if (id === 'stk_in') raw = dados['stk_in_'+ano];
        else if (id === 'mad_in') raw = dados['mad_in_'+ano];
        else if (id === 'f_co2') raw = dados['f_fl_co2_'+ano];
        else if (id === 'f_ch4') raw = dados['f_fl_ch4_'+ano];
        else if (id === 'f_n2o') raw = dados['f_fl_n2o_'+ano];
        else if (id === 'stk_ot') raw = dados['stk_ot_'+ano];
        else if (id === 'f_tot') raw = dados['f_tot_'+ano];
        else if (id === 'mad_ot') raw = dados['mad_tot_'+ano];
        else if (id === 'def_ot') raw = dados['def_tot_'+ano];
        
        if (raw !== 0 && raw !== null) {
          // Lógica simplificada de conversão para matriz
          var fator = (config.unidade.indexOf('CO2e') !== -1 && id.indexOf('stk') !== -1) ? TC_PARA_TCO2 : 1;
          v = (raw * fator).toFixed(id.indexOf('ch4')!==-1 || id.indexOf('n2o')!==-1 ? 3 : 1);
        }
      }
      l.add(ui.Label(v, s));
    });
    sub.add(l);
  });
}

Map.onClick(function(c) {
  var p = ee.Geometry.Point(c.lon, c.lat);
  var img = balanco.rename(ANOS_FOGO.map(function(y){return 'f_tot_'+y}))
    .addBands(balanco.select('madeira_total_.*').rename(ANOS_FOGO.map(function(y){return 'mad_tot_'+y})))
    .addBands(balanco.select('desmatamento_total_.*').rename(ANOS_FOGO.map(function(y){return 'def_tot_'+y})))
    .addBands(balanco.select('stock_.*').rename(ANOS_FOGO.map(function(y){return 'stk_ot_'+y})))
    .addBands(tech_inputs.estoque_bruto.rename(ANOS_SERIE.map(function(y){return 'stk_in_'+y})))
    .addBands(tech_inputs.lulc.rename(ANOS_SERIE.map(function(y){return 'lulc_'+y})))
    .addBands(tech_inputs.madeira.rename(ANOS_FOGO.map(function(y){return 'mad_in_'+y})))
    .addBands(tech_inputs.fogo_floresta.select('CO2_tC_ha_.*').rename(ANOS_FOGO.map(function(y){return 'f_fl_co2_'+y})))
    .addBands(tech_inputs.fogo_floresta.select('CH4_t_ha_.*').rename(ANOS_FOGO.map(function(y){return 'f_fl_ch4_'+y})))
    .addBands(tech_inputs.fogo_floresta.select('N2O_t_ha_.*').rename(ANOS_FOGO.map(function(y){return 'f_fl_n2o_'+y})))
    .addBands(ee.Image.pixelArea().divide(10000).rename('area_pixel'));

  img.reduceRegion({ reducer: ee.Reducer.first(), geometry: p, scale: 30 }).evaluate(function(obj) {
    if (!obj) return; config.ultimos_dados = obj; renderMatriz(obj);
  });
});
Map.style().set('cursor', 'crosshair');
