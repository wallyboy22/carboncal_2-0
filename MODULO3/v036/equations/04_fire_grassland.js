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
 * SCRIPT: 04_fire_grassland.js
 * DESCRIÇÃO: Cálculo simplificado de emissões por queima de biomassa campestre. 
 *            Estima a liberação imediata de CH4 e N2O proveniente da combustão de 
 *            gramíneas e biomassa herbácea em pastagens e campos nativos.
 * -----------------------------------------------------------------------------
 * INSTITUIÇÃO: IPAM Amazônia
 * EQUIPE CCAL: Ane Alencar; Bárbara Zimbres; Camila Silva; Celso Silva-Junior; 
 *              Edriano Souza; Isabel Silva; Lívia Laureto; Manuela Padilha; 
 *              Paulo Moutinho; Rebecca Maranhão; Valderli Piontekowski; Wallace Silva
 * CONTATO: https://ipam.org.br/contato/fale-conosco/
 * ATUALIZAÇÃO: 2026-04-30
 * =============================================================================
 */

exports.calcGrasslandFireEmissions = function (params) {

    var annual_burned = params.annual_burned;
    var agb = params.agb; var cdw = params.cdw; var litter = params.litter;
    var grassland_mask = params.grassland_mask;
    var years = params.years;

    var EF = { CH4: 2.3, N2O: 0.21 };
    var combf = 0.883;

    var CH4_bands = ee.Image().select();
    var N2O_bands = ee.Image().select();

    years.forEach(function (y) {
        var fire_y = annual_burned.select('.*_' + y);
        var mask_y = grassland_mask.select('.*_' + y);
        var comb_total = litter.add(agb).add(cdw).multiply(combf);
        var pixel_mask = fire_y.multiply(mask_y);

        CH4_bands = CH4_bands.addBands(comb_total.multiply(2000).multiply(EF.CH4).divide(1e6).multiply(pixel_mask).rename('CH4_t_ha_' + y).float());
        N2O_bands = N2O_bands.addBands(comb_total.multiply(2000).multiply(EF.N2O).divide(1e6).multiply(pixel_mask).rename('N2O_t_ha_' + y).float());
    });

    return CH4_bands.addBands(N2O_bands);
};

/*
// =============================================================================
// ÁREA DE TESTE (DESCOMENTE PARA VALIDAR)
// =============================================================================
var qcn = ee.Image('projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10');
var fire_annual = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1').select('burned_area_.*');
var lulc = ee.Image('projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1');

var grassland_mask = (function() {
    var out = lulc.multiply(0);
    [11, 12, 50].forEach(function(v) {
        out = out.where(lulc.eq(v), 1);
    });
    return out;
})();
var years = [
    '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994',
    '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004',
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];

var fire_emissions = exports.calcGrasslandFireEmissions({
    annual_burned: fire_annual,
    agb: qcn.select('AGB'),
    cdw: qcn.select('CDW'),
    litter: qcn.select('LITTER'),
    grassland_mask: grassland_mask,
    years: years
});

// Camadas de Referência (Inputs)
Map.addLayer(lulc, { bands: ['classification_2023'], }, 'LULC 2023', false);
Map.addLayer(fire_annual.selfMask(), { bands: ['burned_area_2023'], palette: 'red' }, 'Área Queimada 2023', false);
Map.addLayer(grassland_mask, { bands: ['classification_2023'], palette: 'yellow' }, 'Máscara Campo 2023', false);

// Camadas de Saída
Map.addLayer(fire_emissions, { bands: ['CH4_t_ha_2023'], min: 0, max: 0.1, palette: ['white', 'blue'] }, 'CH4 Campo (t/ha)');
Map.addLayer(fire_emissions, { }, 'Resultado Bruto (Todas Bandas)', false);
*/
