/**
 * =============================================================================
 * PROJETO: CCAL - Modulo 3 (Painel de Referencias Bibliograficas)
 * VERSAO: v037
 * SCRIPT: referencias_gee.js
 * DESCRICAO: Painel interativo com referencias bibliograficas do Modulo 3.
 *            Use este script para adicionar um painel de referencias na
 *            interface do Google Earth Engine Code Editor.
 * -----------------------------------------------------------------------------
 * INSTITUICAO: IPAM Amazonia
 * EQUIPE CCAL: Wallace Silva, Barbara Zimbres, Manuela Padilha, Celso Silva Junior,
 *              Camila Silva, Aline Pontes, Edriano Souza, Livia Loreto,
 *              Paulo Moutinho, Ane Alencar
 * ATUALIZACAO: 2026-06-08
 * =============================================================================
 */

// =============================================================================
// PAINEL DE REFERENCIAS - CCAL Modulo 3
// =============================================================================

var referencias = {
  'MANUAL CCAL': [
    'ALENCAR et al. (2025). Nota metodologica: Estimativa de emissoes de GEE por corte raso, fogo e corte seletivo via plataforma CCAL. Versao 2.0. IPAM.',
  ],
  'ARTIGOS CIENTIFICOS': [
    '[1] ANDERSON et al. (2003). Sensor MODIS: uma abordagem geral. INPE.\n    http://mtc-m12.sid.inpe.br/col/sid.inpe.br/marciana/2003/12.11.08.55/doc/publicacao.pdf',
    '[2] BACCINI et al. (2012). Carbon emissions from tropical deforestation. Nature Climate Change.\n    https://doi.org/10.1038/NCLIMATE1354',
    '[3] COLE (1986). The savannas: biogeography and geobotany. Academic Press.',
    '[4] DUNCANSON et al. (2022). GEDI lidar biomass density models. Remote Sensing of Environment.',
    '[5] GOMES et al. (2020). Fire effects in Cerrado grasslands, savannas, forests. Forest Ecology and Management.\n    https://doi.org/10.1016/j.foreco.2019.117804',
    '[6] GOMES et al. (2024). Fire frequency & net CO2 emissions in Cerrado. Fire, v.7, n.8.\n    https://doi.org/10.3390/fire7080280',
    '[7] LAPOLA et al. (2023). Drivers and impacts of Amazon forest degradation. Science.\n    https://doi.org/10.1126/science.abp8622',
    '[8] MALHI et al. (2008). Climate change, deforestation, and the fate of the Amazon. Science.\n    https://doi.org/10.1126/science.1146961',
    '[9] NEPSTAD et al. (2009). The end of deforestation in the Brazilian Amazon. Science.\n    https://doi.org/10.1126/science.1182108',
    '[10] OMETTO et al. (2023). Amazon biomass map from multisource remote sensing. Scientific Data.',
    '[11] OMETTO et al. (2015). Amazon biomass density maps & uncertainty. Springer.',
    '[12] PINTO et al. (2009). Climate change impact on agroclimatological zones in Brazil. Climatic Change.\n    https://doi.org/10.1007/s10584-008-9513-z',
    '[13] RIBEIRO et al. (2011). Above- and belowground biomass in Brazilian Cerrado. Forest Ecology and Management.\n    https://doi.org/10.1016/j.foreco.2011.04.006',
    '[14] SAATCHI et al. (2007). Aboveground biomass distribution in Amazon basin. Global Change Biology.\n    https://doi.org/10.1111/j.1365-2486.2007.01323.x',
    '[15] SILVA et al. (2023). Forest biomass recovery after logging in Amazon. Forest Ecology and Management.\n    https://doi.org/10.1016/j.foreco.2023.119572',
  ],
  'DADOS OFICIAIS': [
    '[16] MCTI (2020). Quarta Comunicacao Nacional do Brasil a UNFCCC.\n    https://repositorio.mcti.gov.br/handle/MCTIC/4782',
    '[17] MMA (2023). FREL Nacional do Brasil.\n    https://redd.unfccc.int/media/brazil-national-frel_modified_v3_clean-13-mar-2024.pdf',
    '[18] IBGE (2017). Mapa de vegetacao do Brasil.',
    '[19] IPCC (2006). Guidelines for National GHG Inventories.\n    https://www.ipcc-nggip.iges.or.jp/public/2006gl/',
    '[20] SEEG (2024). Sistema de Estimativas de Emissoes de GEE.\n    https://seeg.eco.br',
  ],
  'LEGISLACAO': [
    '[21] CNJ (2024). Protocolo para julgamento de acoes ambientais: danos a flora.',
    '[22] TJMG (2024). Protocolo para mensuracao do impacto do dano climatico.\n    https://www.tjmg.jus.br',
  ],
};

// =============================================================================
// FUNCOES AUXILIARES
// =============================================================================

function createSectionPanel(title, items) {
  var sectionPanel = ui.Panel({
    layout: ui.Panel.Layout.Flow('vertical'),
    style: { margin: '4px 0', padding: '6px', backgroundColor: '#f5f5f5', borderRadius: '4px' }
  });

  sectionPanel.add(ui.Label(title, {
    fontWeight: 'bold',
    fontSize: '13px',
    color: '#2e7d32',
    margin: '0 0 4px 0'
  }));

  items.forEach(function(item) {
    sectionPanel.add(ui.Label(item, {
      fontSize: '11px',
      fontFamily: 'monospace',
      whiteSpace: 'pre-wrap',
      margin: '2px 0'
    }));
  });

  return sectionPanel;
}

// =============================================================================
// MONTAGEM DO PAINEL PRINCIPAL
// =============================================================================

var headerPanel = ui.Panel({
  widgets: [
    ui.Label('REFERENCIAS - CCAL Modulo 3 (v037)', {
      fontWeight: 'bold',
      fontSize: '15px',
      color: '#1b5e20',
      margin: '0 0 2px 0'
    }),
    ui.Label('IPAM Amazonia | Manual CCAL v2.0 (Outubro 2025)', {
      fontSize: '11px',
      fontStyle: 'italic',
      color: '#666',
      margin: '0 0 8px 0'
    })
  ],
  layout: ui.Panel.Layout.Flow('vertical'),
  style: { padding: '8px', backgroundColor: '#e8f5e9', borderRadius: '4px' }
});

var scrollPanel = ui.Panel({
  layout: ui.Panel.Layout.Flow('vertical'),
  style: { stretch: 'both', padding: '4px' }
});

Object.keys(referencias).forEach(function(section) {
  scrollPanel.add(createSectionPanel(section, referencias[section]));
});

var mainPanel = ui.Panel({
  widgets: [headerPanel, scrollPanel],
  layout: ui.Panel.Layout.Flow('vertical'),
  style: {
    width: '450px',
    maxHeight: '600px',
    padding: '8px',
    backgroundColor: '#ffffff',
    border: '1px solid #ccc',
    borderRadius: '6px'
  }
});

// =============================================================================
// ADICIONAR AO MAPA
// =============================================================================

// Descomente a linha abaixo para adicionar o painel ao mapa:
// Map.add(mainPanel);

// Ou use como painel flutuante:
// ui.root.insert(0, mainPanel);

print('Painel de Referencias CCAL Modulo 3 carregado.');
print('Para adicionar ao mapa, descomente: Map.add(mainPanel)');
