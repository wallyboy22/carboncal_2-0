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
 * DESCRIÇÃO: Reprodução fiel do modelo SEEG_13 para emissões por fogo em campos.
 *            Estima a liberação imediata de CH4, N2O, CO e NOX provenientes da
 *            combustão de gramíneas e biomassa herbácea.
 *            Saídas padronizadas em t/ha.
 * -----------------------------------------------------------------------------
 * INSTITUIÇÃO: IPAM Amazônia
 * EQUIPE CCAL: Ane Alencar; Bárbara Zimbres; Camila Silva; Celso Silva-Junior; 
 *              Edriano Souza; Isabel Silva; Lívia Laureto; Manuela Padilha; 
 *              Paulo Moutinho; Rebecca Maranhão; Valderli Piontekowski; Wallace Silva
 * CONTATO: https://ipam.org.br/contato/fale-conosco/
 * ATUALIZAÇÃO: 2026-04-30 | CORREÇÃO: 2026-05-27
 * =============================================================================
 */

exports.calcGrasslandFireEmissions = function (params) {

    var annual_burned = params.annual_burned;
    var agb = params.agb; var cdw = params.cdw; var litter = params.litter;
    var grassland_mask = params.grassland_mask;
    var years = params.years;

    var combf_fwd = 0.883;
    var combf_cwd = 0.331;

    var CH4_bands = ee.Image().select();
    var N2O_bands = ee.Image().select();
    var CO_bands = ee.Image().select();
    var NOX_bands = ee.Image().select();

    years.forEach(function (y) {
        var fire_y = annual_burned.select('.*_' + y);
        var mask_y = grassland_mask.select('.*_' + y);
        var pixel_mask = fire_y.multiply(mask_y);

        // comb_total = litter×0.883 + (agb+cdw)×0.331  [tC/ha]
        var comb_total = litter.multiply(combf_fwd)
            .add(agb.add(cdw).multiply(combf_cwd));

        // CH4, N2O, CO, NOX → t/ha via IPCC (×2000×EF/1e6)
        CH4_bands = CH4_bands.addBands(comb_total.multiply(pixel_mask).multiply(2000).multiply(2.3).divide(1e6).rename('CH4_t_ha_' + y).float());
        N2O_bands = N2O_bands.addBands(comb_total.multiply(pixel_mask).multiply(2000).multiply(0.21).divide(1e6).rename('N2O_t_ha_' + y).float());
        CO_bands  = CO_bands.addBands(comb_total.multiply(pixel_mask).multiply(2000).multiply(65).divide(1e6).rename('CO_t_ha_' + y).float());
        NOX_bands = NOX_bands.addBands(comb_total.multiply(pixel_mask).multiply(2000).multiply(3.9).divide(1e6).rename('NOX_t_ha_' + y).float());
    });

    return CH4_bands
        .addBands(N2O_bands)
        .addBands(CO_bands)
        .addBands(NOX_bands);
};

exports.description = '## CCAL M3: Emissões por Fogo em Campos\n\n' +
    '**Modelo**: Combustão simples — apenas gases não-CO₂ (CO₂ é neutro).\n' +
    '**Combustão**: litter×0.883 + (AGB+CDW)×0.331.\n' +
    '**AGB**: Não atualizado (campo se recupera integralmente após fogo).\n\n' +
    '**Bandas** (4 gases, 1986–2024, 39 anos cada):\n' +
    '- `CH4_t_ha_[ANO]` — Metano (t/ha)\n' +
    '- `N2O_t_ha_[ANO]` — Óxido nitroso (t/ha)\n' +
    '- `CO_t_ha_[ANO]` — Monóxido de carbono (t/ha)\n' +
    '- `NOX_t_ha_[ANO]` — Óxidos de nitrogênio (t/ha)\n\n' +
    '```javascript\n' +
    '// Plot simples\n' +
    'Map.addLayer(fire_grassland.select("CH4_t_ha_2023"),\n' +
    '  { min: 0, max: 0.1, palette: ["white","purple"] }, "CH4 Campo 2023 (t/ha)");\n' +
    'Map.addLayer(fire_grassland.select("NOX_t_ha_2023"),\n' +
    '  { min: 0, max: 0.01, palette: ["white","yellow"] }, "NOX Campo 2023 (t/ha)");\n' +
    '```';

//
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

// Parâmetros de Visualização (Ref: v036/02_investigate_modulo3.js)
var paletaMapBiomas = require('users/mapbiomas/modules:Palettes.js').get('brazil');

// Camadas de Referência (Inputs)
Map.addLayer(lulc, { bands: ['classification_2023'], min: 0, max: 75, palette: paletaMapBiomas }, 'LULC 2023', false);
Map.addLayer(fire_annual.selfMask(), { bands: ['burned_area_2023'], palette: ['red'] }, 'Área Queimada 2023', false);
Map.addLayer(grassland_mask.selfMask(), { bands: ['classification_2023'], palette: ['yellow'] }, 'Máscara Campo 2023', false);

// Camadas de Saída
Map.addLayer(fire_emissions, { bands: ['CH4_t_ha_2023'], min: 0, max: 0.1, palette: ['white', 'purple'] }, 'CH4 Campo (t/ha)');
Map.addLayer(fire_emissions, { bands: ['N2O_t_ha_2023'], min: 0, max: 0.01, palette: ['white', 'cyan'] }, 'N2O Campo (t/ha)');
Map.addLayer(fire_emissions, { bands: ['CO_t_ha_2023'], min: 0, max: 0.1, palette: ['white', 'blue'] }, 'CO Campo (t/ha)');
Map.addLayer(fire_emissions, { bands: ['NOX_t_ha_2023'], min: 0, max: 0.01, palette: ['white', 'yellow'] }, 'NOX Campo (t/ha)');
Map.addLayer(fire_emissions, { }, 'Resultado Bruto (Todas Bandas)', false);
//*/
