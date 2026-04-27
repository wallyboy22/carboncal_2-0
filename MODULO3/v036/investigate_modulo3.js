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
// investigate_modulo3.js
// Auditoria técnica e inspeção pixel-a-pixel.
// =============================================================================

// =============================================================================
// 1. PARÂMETROS E ATIVOS
// =============================================================================
var VERSAO = 'v036';
var ASSET_BASE = 'projects/ee-ipam/assets/CCAL/MODULO3/' + VERSAO + '/';
var ASSET_FINAL = 'projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO3-' + VERSAO;

var ANOS_SERIE = ['1985', '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
  '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
  '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
  '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];
var ANOS_FOGO = ANOS_SERIE.slice(1);

// Constantes Físicas e Conversões
var GWP_CH4 = 28;
var GWP_N2O = 265;
var TC_PARA_TCO2 = 3.67;

// Ativos Intermediários (Inputs Técnicos)
var estoque_biomassa_bruto = ee.Image(ASSET_BASE + 'biomass_stock_' + VERSAO);
var fogo_floresta = ee.Image(ASSET_BASE + 'fire_forest_emissions_' + VERSAO);
var fogo_savana = ee.Image(ASSET_BASE + 'fire_savanna_emissions_' + VERSAO);
var fogo_campo = ee.Image(ASSET_BASE + 'fire_grassland_emissions_' + VERSAO);
var madeira_deter = ee.Image(ASSET_BASE + 'logging_emissions_' + VERSAO);

// Datasets Originais (Bases Externas)
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var desf_reg = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1');
var biomas_ibge = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');

// Contexto de Fogo (MapBiomas Fogo 4.1)
var fogo_anual = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1');
var fogo_frequencia = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1');
var fogo_tempo_recuperacao = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1');

// Paletas de Cores
var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');
var paletaTransicoes = ['#000000', '#27ae60', '#c8e6c9', '#e74c3c', '#ffccbc', '#c0392b', '#ffffff'];

// =============================================================================
// 2. PROCESSAMENTO E CORREÇÕES TÉCNICAS
// =============================================================================

// --- 2a. Correção da Classe 7 (Outras Transições) no Desf/Reg ---
// Aplica Forward Fill (preenchimento para frente)
var desf_corrigido_fwd = ee.Image(ANOS_SERIE.reduce(function (acc, ano, i) {
  var atual = desf_reg.select('classification_' + ano);
  if (i === 0) return atual.rename('classification_' + ano);
  var anterior = ee.Image(acc).slice(-1);
  return ee.Image(acc).addBands(anterior.where(atual.neq(7), atual).rename('classification_' + ano));
}, null));

// Aplica Backward Fill (preenchimento para trás) para lacunas iniciais
var desf_corrigido_bwd = ee.Image(ANOS_SERIE.slice().reverse().reduce(function (acc, ano, i) {
  var atual = desf_corrigido_fwd.select('classification_' + ano);
  if (i === 0) return atual.rename('classification_' + ano);
  var proximo = ee.Image(acc).slice(0, 1);
  return ee.Image(acc).addBands(proximo.where(atual.neq(7), atual).rename('classification_' + ano));
}, null));

var desf_reg_estavel = desf_corrigido_fwd.where(desf_corrigido_fwd.eq(7), desf_corrigido_bwd);

// --- 2b. Reconstrução da Lógica do Produto Final ---
var area_pixel_ha = ee.Image.pixelArea().divide(10000);
var emissao_fogo_bandas = ee.Image().select();
var emissao_madeira_bandas = ee.Image().select();
var emissao_desmatamento_bandas = ee.Image().select();
var remocao_secundaria_bandas = ee.Image().select();
var estoque_dinamico_bandas = ee.Image().select();

var estoque_anterior = estoque_biomassa_bruto.select('biomass_stock_1985');
var degradacao_acumulada = ee.Image(0);

ANOS_FOGO.forEach(function (ano, i) {
  var f_floresta_tC = fogo_floresta.select('CO2_tC_ha_' + ano).unmask(0);
  var f_savana_tC = fogo_savana.select('CO2_tCO2e_ha_' + ano).unmask(0).divide(TC_PARA_TCO2);
  var madeira_tC = (i >= ANOS_FOGO.indexOf('2017')) ? madeira_deter.select('logging_tC_ha_' + ano).unmask(0) : ee.Image(0);

  // Atualização da degradação acumulada
  degradacao_acumulada = degradacao_acumulada.subtract(f_floresta_tC).subtract(f_savana_tC).subtract(madeira_tC);

  var estoque_bruto_ano = estoque_biomassa_bruto.select('biomass_stock_' + ano);
  var desf_ano = desf_reg_estavel.select('classification_' + ano);

  // Estoque atualizado (desconta degradação apenas em vegetação estável/primária)
  var estoque_atualizado = estoque_bruto_ano.where(desf_ano.eq(2), estoque_bruto_ano.add(degradacao_acumulada)).rename('estoque_' + ano).float();
  var balanco_ano = estoque_anterior.subtract(estoque_atualizado).multiply(TC_PARA_TCO2);
  estoque_anterior = estoque_atualizado;

  // Saídas Finais em tCO2e Totais por Pixel
  emissao_fogo_bandas = emissao_fogo_bandas.addBands(f_floresta_tC.add(f_savana_tC).multiply(TC_PARA_TCO2).multiply(area_pixel_ha).rename('fogo_total_' + ano));
  emissao_madeira_bandas = emissao_madeira_bandas.addBands(madeira_tC.multiply(TC_PARA_TCO2).multiply(area_pixel_ha).rename('madeira_total_' + ano));
  emissao_desmatamento_bandas = emissao_desmatamento_bandas.addBands(balanco_ano.max(0).multiply(area_pixel_ha).rename('desmatamento_total_' + ano));
  
  var mascara_secundaria = desf_ano.eq(3).or(desf_ano.eq(5));
  remocao_secundaria_bandas = remocao_secundaria_bandas.addBands(balanco_ano.min(0).multiply(mascara_secundaria).multiply(area_pixel_ha).rename('regeneracao_total_' + ano));
  estoque_dinamico_bandas = estoque_dinamico_bandas.addBands(estoque_atualizado);
});

var imagem_final = emissao_fogo_bandas.addBands(emissao_madeira_bandas).addBands(emissao_desmatamento_bandas).addBands(remocao_secundaria_bandas).addBands(estoque_dinamico_bandas).float();

// =============================================================================
// 3. INTERFACE E CONFIGURAÇÃO
// =============================================================================
var painel = ui.Panel({ style: { width: '500px', padding: '12px' } });
var transposta = true;
var ultimos_dados = null;
var ano_alvo = '2023';

// Estado de visualização das camadas
var config = {
  lulc_base: true, trans_original: false, trans_estavel: true,
  fogo_anual: false, fogo_frequencia: false, fogo_recuperacao: false,
  estoque_base: false, madeira_densidade: false,
  fogo_floresta: false, f_floresta_ch4: false, f_floresta_n2o: false,
  fogo_savana: false, f_savana_ch4: false, f_savana_n2o: false,
  fogo_campo: false, f_campo_ch4: false, f_campo_n2o: false,
  saida_estoque: true, saida_fogo: false, saida_madeira: false, saida_regeneracao: false, saida_desmatamento: true,
  unidade: 'tCO2e/ha'
};

var nomes_camadas = {
  lulc_base: 'Uso e Cobertura (MapBiomas)',
  trans_original: 'Transição Bruta (Com Classe 7)',
  trans_estavel: 'Transição Corrigida (Estável)',
  fogo_anual: 'Área Queimada (Cicatriz)',
  fogo_frequencia: 'Frequência de Fogo (Acumulada)',
  fogo_recuperacao: 'Tempo após Fogo (Recuperação)',
  estoque_base: 'Estoque Inicial (Densidade tC/ha)',
  madeira_densidade: 'Corte Seletivo (Densidade tC/ha)',
  saida_estoque: 'Estoque Final (Densidade tC/ha)',
  saida_fogo: 'Emissão Fogo (Total tCO2e/px)',
  saida_madeira: 'Emissão Madeira (Total tCO2e/px)',
  saida_regeneracao: 'Remoção Regeneração (Total tCO2e/px)',
  saida_desmatamento: 'Balanço Desmatamento (Total tCO2e/px)'
};

// --- Dicionário de Camadas do Mapa (ui.Map.Layer) ---
var mapa_layers = {
  lulc_base: ui.Map.Layer(lulc, { bands: ['classification_' + ano_alvo], min: 0, max: 62, palette: paletaMapBiomas }, 'LULC ' + ano_alvo, config.lulc_base),
  trans_original: ui.Map.Layer(desf_reg, { bands: ['classification_' + ano_alvo], min: 1, max: 7, palette: paletaTransicoes }, 'Transição Bruta', config.trans_original),
  trans_estavel: ui.Map.Layer(desf_reg_estavel, { bands: ['classification_' + ano_alvo], min: 1, max: 7, palette: paletaTransicoes }, 'Transição Estável', config.trans_estavel),
  fogo_anual: ui.Map.Layer(fogo_anual, { bands: ['burned_area_' + ano_alvo], min: 0, max: 12, palette: ['white', 'orange', 'red'] }, 'Área Queimada', config.fogo_anual),
  fogo_frequencia: ui.Map.Layer(fogo_frequencia, { bands: ['fire_frequency_1985_' + ano_alvo], min: 0, max: 10, palette: ['white', 'yellow', 'red'] }, 'Freq. Fogo', config.fogo_frequencia),
  fogo_recuperacao: ui.Map.Layer(fogo_tempo_recuperacao, { bands: ['time_after_fire_' + ano_alvo], min: 0, max: 40, palette: ['red', 'yellow', 'green'] }, 'Tempo Recuperação', config.fogo_recuperacao),
  estoque_base: ui.Map.Layer(estoque_biomassa_bruto, { bands: ['biomass_stock_' + ano_alvo], min: 0, max: 200, palette: ['white', 'green'] }, 'Estoque Base', config.estoque_base),
  madeira_densidade: ui.Map.Layer(madeira_deter, { bands: ['logging_tC_ha_' + ano_alvo], min: 0, max: 30, palette: ['white', 'purple'] }, 'Densidade Madeira', config.madeira_densidade),
  saida_estoque: ui.Map.Layer(imagem_final, { bands: ['estoque_' + ano_alvo], min: 0, max: 200, palette: ['white', 'green'] }, 'Estoque Final', config.saida_estoque),
  saida_fogo: ui.Map.Layer(imagem_final, { bands: ['fogo_total_' + ano_alvo], min: 0, max: 20, palette: ['white', 'orange', 'red'] }, 'Fogo Total', config.saida_fogo),
  saida_madeira: ui.Map.Layer(imagem_final, { bands: ['madeira_total_' + ano_alvo], min: 0, max: 20, palette: ['white', 'red'] }, 'Madeira Total', config.saida_madeira),
  saida_regeneracao: ui.Map.Layer(imagem_final, { bands: ['regeneracao_total_' + ano_alvo], min: -20, max: 0, palette: ['darkgreen', 'white'] }, 'Regeneração Total', config.saida_regeneracao),
  saida_desmatamento: ui.Map.Layer(imagem_final, { bands: ['desmatamento_total_' + ano_alvo], min: 0, max: 50, palette: ['white', 'red', 'black'] }, 'Balanço Desmatamento', config.saida_desmatamento)
};

// Inicializa o mapa com as camadas ativas
Map.layers().reset();
Object.keys(mapa_layers).forEach(function(k) { Map.add(mapa_layers[k]); });

// --- Funções de Interface ---
function criarLinhaConfig(id, label, sub, painel_alvo) {
  var linha = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal'), style: { margin: sub ? '1px 0 1px 20px' : '4px 0' } });
  
  var cb = ui.Checkbox({
    label: label,
    value: config[id],
    onChange: function(checked) {
      config[id] = checked;
      if (mapa_layers[id]) mapa_layers[id].setShown(checked);
      if (ultimos_dados) renderizarMatriz(ultimos_dados);
    },
    style: { fontSize: sub ? '10px' : '11px', fontWeight: sub ? 'normal' : 'bold', width: '250px' }
  });
  
  linha.add(cb);
  painel_alvo.add(linha);
}

// --- Layout Principal ---
painel.add(ui.Label('CCAL M3 — Auditoria Técnica Pixel-a-Pixel', { fontWeight: 'bold', fontSize: '18px', color: '#2c3e50' }));

var painel_resultados = ui.Panel();
painel.add(painel_resultados);

var botao_transpor = ui.Button({
  label: '🔄 Alternar Eixos (Anos em Colunas/Linhas)',
  onClick: function() { transposta = !transposta; if (ultimos_dados) renderizarMatriz(ultimos_dados); },
  style: { stretch: 'horizontal' }
});
painel.add(botao_transpor);

var painel_unidade = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal'), style: { margin: '5px 0' } });
painel_unidade.add(ui.Label('Exibir Densidade em:', { fontSize: '11px', margin: '8px 5px 0 0' }));
painel_unidade.add(ui.Select({
  items: ['tCO2e/ha', 'tC/ha', 'kgCO2e/ha', 'kgC/ha'],
  value: config.unidade,
  onChange: function(v) { config.unidade = v; if (ultimos_dados) renderizarMatriz(ultimos_dados); }
}));
painel.add(painel_unidade);

var matriz_container = ui.Panel({ style: { stretch: 'both', backgroundColor: '#f8f9fa', border: '1px solid #ddd' } });
painel.add(matriz_container);

// --- Gaveta de Camadas ---
var gaveta = ui.Panel({ style: { margin: '10px 0', border: '1px solid #eee', shown: false } });
painel.add(ui.Button({
  label: '⚙️ Configurar Camadas e Metodologia',
  onClick: function() { gaveta.style().set('shown', !gaveta.style().get('shown')); },
  style: { stretch: 'horizontal' }
}));
painel.add(gaveta);

// Seção de Categorias (Classificação)
gaveta.add(ui.Label('Categorias (Classificação):', { fontWeight: 'bold', color: '#34495e', fontSize: '12px' }));
var p_class = ui.Panel(); gaveta.add(p_class);
criarLinhaConfig('lulc_base', 'Uso e Cobertura (MB)', false, p_class);
criarLinhaConfig('trans_original', 'Transição Original', false, p_class);
criarLinhaConfig('trans_estavel', 'Transição Corrigida', false, p_class);

// Seção de Entradas (Densidade)
gaveta.add(ui.Label('Entradas (Densidade - tC/ha):', { fontWeight: 'bold', color: '#2980b9', fontSize: '12px', margin: '10px 0 2px 0' }));
var p_in = ui.Panel(); gaveta.add(p_in);
criarLinhaConfig('fogo_anual', 'Mês da Queima', false, p_in);
criarLinhaConfig('fogo_frequencia', 'Frequência de Fogo', false, p_in);
criarLinhaConfig('fogo_recuperacao', 'Tempo Recuperação', false, p_in);
criarLinhaConfig('estoque_base', 'Estoque Inicial', false, p_in);
criarLinhaConfig('madeira_densidade', 'Corte Seletivo', false, p_in);

// Gases de Fogo Floresta
criarLinhaConfig('fogo_floresta', 'Fogo Floresta (CO2)', false, p_in);
criarLinhaConfig('f_floresta_ch4', '↳ Metano (CH4)', true, p_in);
criarLinhaConfig('f_floresta_n2o', '↳ Óxido Nitroso (N2O)', true, p_in);

// Seção de Saídas (Totais por Pixel)
gaveta.add(ui.Label('Saídas (Total tCO2e/pixel):', { fontWeight: 'bold', color: '#27ae60', fontSize: '12px', margin: '10px 0 2px 0' }));
var p_out = ui.Panel(); gaveta.add(p_out);
criarLinhaConfig('saida_estoque', 'Estoque Final (Densidade)', false, p_out);
criarLinhaConfig('saida_fogo', 'Fogo (Total)', false, p_out);
criarLinhaConfig('saida_madeira', 'Madeira (Total)', false, p_out);
criarLinhaConfig('saida_regeneracao', 'Regeneração (Total)', false, p_out);
criarLinhaConfig('saida_desmatamento', 'Balanço Desmatamento (Total)', false, p_out);

ui.root.insert(0, painel);

// =============================================================================
// 4. LÓGICA DA MATRIZ DE AUDITORIA
// =============================================================================
var titulos_matriz = {
  'ano': 'Ano',
  'lulc_base': 'LULC', 'trans_original': 'Tr.O', 'trans_estavel': 'Tr.C',
  'fogo_anual': 'Mes', 'fogo_frequencia': 'Freq', 'fogo_recuperacao': 'TSF',
  'estoque_base': 'Est.In', 'madeira_densidade': 'Madeira',
  'fogo_floresta': 'Fogo', 'f_floresta_ch4': 'ch4', 'f_floresta_n2o': 'n2o',
  'saida_estoque': 'Est.Out', 'saida_fogo': 'Perda.F', 'saida_madeira': 'Perda.M', 
  'saida_regeneracao': 'Ganho.V', 'saida_desmatamento': 'Balanço'
};

function formatarValor(val, id) {
  if (val === null || val === undefined) return ' ';
  if (id === 'ano') return val.slice(-2);
  
  var eh_saida = id.indexOf('saida_') !== -1 && id !== 'saida_estoque';
  var eh_gas = id.indexOf('_ch4') !== -1 || id.indexOf('_n2o') !== -1;
  
  if (eh_saida || eh_gas) return val.toFixed(eh_gas ? 3 : 1);
  
  // Conversão de unidades para densidade
  var fator = 1;
  if (config.unidade.indexOf('CO2e') !== -1) fator *= TC_PARA_TCO2;
  if (config.unidade.indexOf('kg') !== -1) fator *= 1000;
  return (val * fator).toFixed(1);
}

function renderizarMatriz(dados) {
  matriz_container.clear();
  var sub = ui.Panel({ layout: transposta ? ui.Panel.Layout.flow('vertical') : ui.Panel.Layout.flow('horizontal') });
  matriz_container.add(sub);

  var colunas_ativas = Object.keys(titulos_matriz).filter(function(k) { 
    return k === 'ano' || config[k]; 
  });

  // Cabeçalho
  var p_titulos = ui.Panel({ 
    layout: transposta ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'),
    style: { backgroundColor: '#eee', border: '1px solid #ccc' }
  });
  colunas_ativas.forEach(function(k) {
    p_titulos.add(ui.Label(titulos_matriz[k], { fontWeight: 'bold', fontSize: '9px', width: '55px', textAlign: 'center' }));
  });
  sub.add(p_titulos);

  // Dados por Ano
  ANOS_FOGO.forEach(function(ano) {
    var p_ano = ui.Panel({ layout: transposta ? ui.Panel.Layout.flow('horizontal') : ui.Panel.Layout.flow('vertical'), style: { border: '1px solid #f0f0f0' } });
    colunas_ativas.forEach(function(k) {
      var val_bruto = null;
      var style = { fontSize: '9px', width: '55px', textAlign: 'center', margin: '1px' };

      if (k === 'ano') val_bruto = ano;
      else if (k === 'lulc_base') { val_bruto = dados['lulc_'+ano]; style.backgroundColor = paletaMapBiomas[val_bruto]; }
      else if (k === 'trans_original' || k === 'trans_estavel') {
        val_bruto = (k === 'trans_original') ? dados['trans_o_'+ano] : dados['trans_c_'+ano];
        if (val_bruto == 2) style.backgroundColor = '#ffccbc'; else if (val_bruto == 3) style.backgroundColor = '#c8e6c9';
      }
      else if (k === 'fogo_anual') val_bruto = dados['fogo_anual_'+ano];
      else if (k === 'fogo_frequencia') val_bruto = dados['fire_freq_'+ano];
      else if (k === 'fogo_recuperacao') val_bruto = dados['fire_tsf_'+ano];
      else if (k === 'estoque_base') val_bruto = dados['biomass_stock_'+ano];
      else if (k === 'madeira_densidade') val_bruto = dados['madeira_tC_ha_'+ano];
      else if (k === 'fogo_floresta') val_bruto = dados['fogo_floresta_co2_'+ano];
      else if (k === 'f_floresta_ch4') val_bruto = dados['fogo_floresta_ch4_'+ano];
      else if (k === 'f_floresta_n2o') val_bruto = dados['fogo_floresta_n2o_'+ano];
      else if (k === 'saida_estoque') val_bruto = dados['estoque_'+ano];
      else if (k === 'saida_fogo') val_bruto = dados['fogo_total_'+ano];
      else if (k === 'saida_madeira') val_bruto = dados['madeira_total_'+ano];
      else if (k === 'saida_regeneracao') val_bruto = dados['regeneracao_total_'+ano];
      else if (k === 'saida_desmatamento') val_bruto = dados['desmatamento_total_'+ano];

      p_ano.add(ui.Label(formatarValor(val_bruto, k), style));
    });
    sub.add(p_ano);
  });
}

Map.onClick(function(c) {
  painel_resultados.clear(); matriz_container.clear();
  matriz_container.add(ui.Label('Buscando pixels...', { color: '#7f8c8d' }));
  var ponto = ee.Geometry.Point(c.lon, c.lat);

  // Consolidação de todas as bandas para extração única
  var amostra = imagem_final
    .addBands(estoque_biomassa_bruto)
    .addBands(lulc.rename(ANOS_SERIE.map(function(y){return 'lulc_'+y})))
    .addBands(desf_reg.rename(ANOS_SERIE.map(function(y){return 'trans_o_'+y})))
    .addBands(desf_reg_estavel.rename(ANOS_SERIE.map(function(y){return 'trans_c_'+y})))
    .addBands(fogo_anual.rename(ANOS_SERIE.map(function(y){return 'fogo_anual_'+y})))
    .addBands(fogo_frequencia.rename(ANOS_SERIE.map(function(y){return 'fire_freq_'+y})))
    .addBands(fogo_tempo_recuperacao.rename(ANOS_SERIE.map(function(y){return 'fire_tsf_'+y})))
    .addBands(madeira_deter.rename(ANOS_SERIE.map(function(y){return 'madeira_tC_ha_'+y})))
    .addBands(fogo_floresta.select('CO2_tC_ha_.*', ANOS_FOGO.map(function(y){return 'fogo_floresta_co2_'+y})))
    .addBands(fogo_floresta.select('CH4_t_ha_.*', ANOS_FOGO.map(function(y){return 'fogo_floresta_ch4_'+y})))
    .addBands(fogo_floresta.select('N2O_t_ha_.*', ANOS_FOGO.map(function(y){return 'fogo_floresta_n2o_'+y})));

  amostra.reduceRegion({ reducer: ee.Reducer.first(), geometry: ponto, scale: 30 }).evaluate(function(obj) {
    if (!obj) return;
    painel_resultados.clear();
    painel_resultados.add(ui.Label('📍 Coordenadas: ' + c.lon.toFixed(5) + ', ' + c.lat.toFixed(5), { fontWeight: 'bold' }));
    ultimos_dados = obj;
    renderizarMatriz(obj);
  });
});

Map.style().set('cursor', 'crosshair');
