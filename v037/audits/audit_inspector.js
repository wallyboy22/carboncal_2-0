/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Inspeção Pontual)
 * VERSÃO: v037
 * SCRIPT: audit_inspector.js
 * DESCRIÇÃO: Ferramenta de diagnóstico e auditoria técnica. Interface interativa
 *            para análise pontual da série histórica de emissões.
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

var YEARS_ALL = [
    '1985', '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];

// =============================================================================
// CARREGA TODOS OS ASSETS
// =============================================================================

print('⏳ Carregando assets para auditoria...');

var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');

var assets = {
    // Stage 0
    'desf_reg_corrected': ee.Image(BASE_ASSET + 'desf_reg_corrected'),
    'forest_mask': ee.Image(BASE_ASSET + 'forest_mask'),
    'savanna_mask': ee.Image(BASE_ASSET + 'savanna_mask'),
    'grassland_mask': ee.Image(BASE_ASSET + 'grassland_mask'),
    'grass_forest': ee.Image(BASE_ASSET + 'grass_forest'),
    // Stage 1
    'secondary_veg_increment': ee.Image(BASE_ASSET + 'secondary_veg_increment'),
    'fire_forest_CO2': ee.Image(BASE_ASSET + 'fire_forest_CO2'),
    'fire_forest_CH4': ee.Image(BASE_ASSET + 'fire_forest_CH4'),
    'fire_forest_N2O': ee.Image(BASE_ASSET + 'fire_forest_N2O'),
    'fire_savanna_CO2': ee.Image(BASE_ASSET + 'fire_savanna_CO2'),
    'fire_savanna_CH4': ee.Image(BASE_ASSET + 'fire_savanna_CH4'),
    'fire_savanna_N2O': ee.Image(BASE_ASSET + 'fire_savanna_N2O'),
    'fire_grassland_CH4': ee.Image(BASE_ASSET + 'fire_grassland_CH4'),
    'fire_grassland_N2O': ee.Image(BASE_ASSET + 'fire_grassland_N2O'),
    'logging_forest_CO2': ee.Image(BASE_ASSET + 'logging_forest_CO2'),
    'degradation_mask': ee.Image(BASE_ASSET + 'degradation_mask'),
    // Stage 2
    'biomass_stock': ee.Image(BASE_ASSET + 'biomass_stock'),
};

print('✅ Assets carregados!');

// =============================================================================
// FUNÇÃO DE INSPEÇÃO
// =============================================================================

function inspectPixel(coords) {
    var point = ee.Geometry.Point(coords);
    
    print('📍 Inspeção em: ' + coords);
    print('---');
    
    // LULC
    var lulc_vals = lulc.reduceRegion(ee.Reducer.first(), point, 30);
    print('🗺️ LULC:', lulc_vals);
    
    // QCN
    var qcn_vals = qcn.reduceRegion(ee.Reducer.first(), point, 30);
    print('📦 QCN:', qcn_vals);
    
    // Assets do pipeline
    Object.keys(assets).forEach(function(name) {
        var img = assets[name];
        var bands = img.bandNames();
        var sampleBands = bands.slice(0, ee.Number.min(5, bands.length()));
        
        var vals = img.select(sampleBands).reduceRegion(ee.Reducer.first(), point, 30);
        print('📊 ' + name + ':', vals);
    });
    
    print('---');
}

// =============================================================================
// INTERFACE
// =============================================================================

var inspector_panel = ui.Panel({
    widgets: [
        ui.Label('🔍 Auditoria Pontual - CCAL Módulo 3 v037', {
            fontWeight: 'bold', fontSize: '16px', color: '#1b5e20'
        }),
        ui.Label('Clique no mapa para inspecionar um pixel', {
            fontSize: '12px', fontStyle: 'italic'
        })
    ],
    layout: ui.Panel.Layout.Flow('vertical'),
    style: { padding: '10px', backgroundColor: '#e8f5e9' }
});

Map.add(inspector_panel);

Map.onClick(function(coords) {
    inspector_panel.clear();
    inspector_panel.add(ui.Label('🔍 Auditoria Pontual - CCAL Módulo 3 v037', {
        fontWeight: 'bold', fontSize: '16px', color: '#1b5e20'
    }));
    inspector_panel.add(ui.Label('📍 Coordenadas: ' + coords, {
        fontSize: '12px', fontWeight: 'bold'
    }));
    
    inspectPixel(coords);
});

print('✅ Inspector pronto! Clique no mapa para inspecionar pixels.');
