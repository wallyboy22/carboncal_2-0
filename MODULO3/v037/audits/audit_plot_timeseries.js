/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Plot de Séries Temporais)
 * VERSÃO: v037
 * SCRIPT: audit_plot_timeseries.js
 * DESCRIÇÃO: Plota gráficos de série temporal para todos os assets do pipeline.
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

var YEARS_FIRE = YEARS_ALL.slice(1);

// =============================================================================
// CARREGA ASSETS
// =============================================================================

print('⏳ Carregando assets para plot...');

var secondary_veg = ee.Image(BASE_ASSET + 'secondary_veg_increment');
var fire_f_CO2 = ee.Image(BASE_ASSET + 'fire_forest_CO2');
var fire_f_CH4 = ee.Image(BASE_ASSET + 'fire_forest_CH4');
var fire_f_N2O = ee.Image(BASE_ASSET + 'fire_forest_N2O');
var fire_s_CO2 = ee.Image(BASE_ASSET + 'fire_savanna_CO2');
var fire_s_CH4 = ee.Image(BASE_ASSET + 'fire_savanna_CH4');
var fire_s_N2O = ee.Image(BASE_ASSET + 'fire_savanna_N2O');
var fire_g_CH4 = ee.Image(BASE_ASSET + 'fire_grassland_CH4');
var fire_g_N2O = ee.Image(BASE_ASSET + 'fire_grassland_N2O');
var logging = ee.Image(BASE_ASSET + 'logging_forest_CO2');
var biomass_stock = ee.Image(BASE_ASSET + 'biomass_stock');
var deg_mask = ee.Image(BASE_ASSET + 'degradation_mask');

print('✅ Assets carregados!');

// =============================================================================
// FUNÇÃO DE PLOT
// =============================================================================

function plotTimeseries(image, name, years, title, unit) {
    print('📈 ' + title);
    
    var chart = ui.Chart.image.series({
        imageCollection: ee.ImageCollection(years.map(function(y) {
            return image.select(y).rename('value').set('year', ee.Number.parse(y));
        })),
        region: ee.Geometry.Rectangle(-75, -35, -35, 5),
        reducer: ee.Reducer.mean(),
        scale: 30,
        xProperty: 'year'
    })
    .setOptions({
        title: title + ' (Média Brasil)',
        hAxis: { title: 'Ano' },
        vAxis: { title: unit },
        lineWidth: 2,
        pointSize: 4,
        colors: ['#1b5e20']
    });
    
    print(chart);
}

// =============================================================================
// PLOTS
// =============================================================================

print('=== SÉRIES TEMPORAIS - CCAL Módulo 3 v037 ===');
print('');

// Stage 1 - Biomassa
plotTimeseries(secondary_veg, 'secondary_veg', YEARS_ALL,
    'Vegetação Secundária - Incremento Acumulado', 'tC/ha');

// Stage 1 - Fogo Floresta
plotTimeseries(fire_f_CO2, 'fire_f_CO2', YEARS_FIRE,
    'Fogo Floresta - CO₂', 'tCO₂e/ha');

plotTimeseries(fire_f_CH4, 'fire_f_CH4', YEARS_FIRE,
    'Fogo Floresta - CH₄', 'tCO₂e/ha');

plotTimeseries(fire_f_N2O, 'fire_f_N2O', YEARS_FIRE,
    'Fogo Floresta - N₂O', 'tCO₂e/ha');

// Stage 1 - Fogo Savana
plotTimeseries(fire_s_CO2, 'fire_s_CO2', YEARS_FIRE,
    'Fogo Savana - CO₂', 'tCO₂e/ha');

plotTimeseries(fire_s_CH4, 'fire_s_CH4', YEARS_FIRE,
    'Fogo Savana - CH₄', 'tCO₂e/ha');

plotTimeseries(fire_s_N2O, 'fire_s_N2O', YEARS_FIRE,
    'Fogo Savana - N₂O', 'tCO₂e/ha');

// Stage 1 - Fogo Campo
plotTimeseries(fire_g_CH4, 'fire_g_CH4', YEARS_FIRE,
    'Fogo Campo - CH₄', 'tCO₂e/ha');

plotTimeseries(fire_g_N2O, 'fire_g_N2O', YEARS_FIRE,
    'Fogo Campo - N₂O', 'tCO₂e/ha');

// Stage 1 - Logging
plotTimeseries(logging, 'logging', ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'],
    'Corte Seletivo - CO₂', 'tCO₂e/ha');

// Stage 2 - Biomass Stock
plotTimeseries(biomass_stock, 'biomass_stock', YEARS_ALL,
    'Estoque de Biomassa', 'tC/ha');

print('✅ Todos os plots gerados!');
