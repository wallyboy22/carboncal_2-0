/**
 * =============================================================================
 * PROJETO: CCAL - Toolkit de Comparação de Versões
 * MÓDULO: catalog.js
 * -----------------------------------------------------------------------------
 * DESCRIÇÃO: Catálogo de schemas dos assets finais do SEEG espacializado
 *            (v00, v02, v03, v04, v06) e dos Módulos CCAL (01, 02, 03, 04).
 *            Fornece loaders, mapeamento de bandas para nomes padronizados,
 *            metadados de unidade (CO2e|C, ha|px) e conversores de unidades.
 *            NÃO usa Map/ui/print — é um módulo require-ável no Code Editor.
 * -----------------------------------------------------------------------------
 * USO:
 *   var catalog = require('users/workspaceipam/CCAL:TOOLS/compare/catalog.js');
 * -----------------------------------------------------------------------------
 * CONVENÇÃO DE BANDAS:
 *   Cada variável recebe uma CHAVE CURTA sem prefixo colidente:
 *     net (líquido/balanço) | emis | rem | def | defs | lf | lg | sl | conv |
 *     edge | fco2 | fch4 | fn2o | svi | gain | stock | swd | swg
 *   load() renormaliza as bandas do asset para  <chave>_<ano>.
 *   buildCombined() devolve um mosaico multibanda <prefixo><chave>_<ano>
 *   + <prefixo>pixel_area_ha (padrão do investigate_modulo3.js).
 * =============================================================================
 */

var TC_TO_TCO2 = 3.67;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function yearsRange(a, b) {
  var out = [];
  for (var y = a; y <= b; y++) out.push(String(y));
  return out;
}

// Renormaliza as bandas de um asset: <fromPrefix><ano> -> <toKey>_<ano>
// O padrão de seleção ancora no primeiro dígito do ano ('[0-9]') para não
// colidir com prefixos-irmãos (ex.: loss_deforestation vs loss_deforestation_secondary).
function renamePrefix(img, fromPrefix, toKey) {
  var sel = img.select(fromPrefix + '[0-9].*');
  return sel.rename(sel.bandNames().map(function (n) {
    return ee.String(toKey).cat('_').cat(ee.String(n).replace(fromPrefix, ''));
  }));
}

function varDef(key, label, asset, fromPrefix, kind, per) {
  return {
    key: key,
    label: label,
    asset: asset,
    fromPrefix: fromPrefix,
    kind: kind,   // 'CO2e' | 'C'
    per: per      // 'ha' | 'px'
  };
}

// -----------------------------------------------------------------------------
// SEEG ESPACIALIZADO
// -----------------------------------------------------------------------------

var SEEG_BASE = 'projects/ee-ipam/assets/SEEG/SEEG13/ESPACIALIZADO/';
var SEEG_YEARS = yearsRange(1990, 2024);

var V00_FOLDER = SEEG_BASE + 'v00/collection';
var V00_GRIDS = [
  'NA-19', 'NA-20', 'NA-21', 'NA-22', 'NB-20', 'NB-21', 'NB-22', 'SA-19',
  'SA-20', 'SA-21', 'SA-22', 'SA-23', 'SA-24', 'SB-18', 'SB-19', 'SB-20',
  'SB-21', 'SB-22', 'SB-23', 'SB-24', 'SB-25', 'SC-18', 'SC-19', 'SC-20',
  'SC-21', 'SC-22', 'SC-23', 'SC-24', 'SC-25', 'SD-20', 'SD-21', 'SD-22',
  'SD-23', 'SD-24', 'SE-20', 'SE-21', 'SE-22', 'SE-23', 'SE-24', 'SF-21',
  'SF-22', 'SF-23', 'SF-24', 'SG-21', 'SG-22', 'SG-23', 'SH-21', 'SH-22',
  'SI-22'
];

var SEEG = {
  v00: {
    label: 'v00 — original (mosaico 50 grids)',
    years: SEEG_YEARS,
    load: function () {
      var imgs = V00_GRIDS.map(function (g) {
        return ee.Image(V00_FOLDER + '/Emissons_Removals_' + g);
      });
      return renamePrefix(ee.ImageCollection.fromImages(imgs).mosaic(), 'emissions_removals_', 'net');
    },
    variables: [
      varDef('net', 'Líquido (emissões/remoções)', null, 'emissions_removals_', 'CO2e', 'ha')
    ]
  },
  v02: {
    label: 'v02 — espacializado',
    years: SEEG_YEARS,
    load: function () {
      return renamePrefix(ee.Image(SEEG_BASE + 'v02/emissions_removals_spatial_brasil_v02'), 'emissions_removals_', 'net');
    },
    variables: [
      varDef('net', 'Líquido (emissões/remoções)', null, 'emissions_removals_', 'CO2e', 'ha')
    ]
  },
  v03: {
    label: 'v03 — espacializado + decomposição',
    years: SEEG_YEARS,
    load: function () {
      var base = SEEG_BASE + 'v03/';
      return renamePrefix(ee.Image(base + 'emissions_removals_brasil_v03'), 'emissions_removals_', 'net')
        .addBands(renamePrefix(ee.Image(base + 'emissions_only_brasil_v03'), 'emissions_', 'emis'))
        .addBands(renamePrefix(ee.Image(base + 'removals_only_brasil_v03'), 'removals_', 'rem'))
        .addBands(renamePrefix(ee.Image(base + 'carbon_stock_brasil_v03'), 'stock_', 'stock'));
    },
    variables: [
      varDef('net', 'Líquido (emissões/remoções)', null, 'emissions_removals_', 'CO2e', 'ha'),
      varDef('emis', 'Emissões', null, 'emissions_', 'CO2e', 'ha'),
      varDef('rem', 'Remoções', null, 'removals_', 'CO2e', 'ha'),
      varDef('stock', 'Estoque (carbono)', null, 'stock_', 'C', 'ha')
    ]
  },
  v04: {
    label: 'v04 — balanço de massa',
    years: SEEG_YEARS,
    load: function () {
      var base = SEEG_BASE + 'v04/';
      return renamePrefix(ee.Image(base + 'net_emissions_removals'), 'net_emissions_removals_', 'net')
        .addBands(renamePrefix(ee.Image(base + 'emission_deforestation'), 'emission_deforestation_', 'def'))
        .addBands(renamePrefix(ee.Image(base + 'emission_fire_carbon_dioxide'), 'emission_fire_carbon_dioxide_', 'fco2'))
        .addBands(renamePrefix(ee.Image(base + 'emission_fire_methane'), 'emission_fire_methane_', 'fch4'))
        .addBands(renamePrefix(ee.Image(base + 'emission_fire_nitrous_oxide'), 'emission_fire_nitrous_oxide_', 'fn2o'))
        .addBands(renamePrefix(ee.Image(base + 'emission_selective_logging'), 'emission_selective_logging_', 'sl'))
        .addBands(renamePrefix(ee.Image(base + 'secondary_veg_increment'), 'sec_veg_increment_', 'svi'))
        .addBands(renamePrefix(ee.Image(base + 'carbon_stock_without_degradation'), 'stock_without_degradation_', 'swd'))
        .addBands(renamePrefix(ee.Image(base + 'carbon_stock_with_degradation'), 'stock_with_degradation_', 'swg'));
    },
    variables: [
      varDef('net', 'Líquido', null, 'net_emissions_removals_', 'CO2e', 'ha'),
      varDef('def', 'Desmatamento', null, 'emission_deforestation_', 'CO2e', 'ha'),
      varDef('fco2', 'Fogo CO2', null, 'emission_fire_carbon_dioxide_', 'CO2e', 'ha'),
      varDef('fch4', 'Fogo CH4 (CO2e)', null, 'emission_fire_methane_', 'CO2e', 'ha'),
      varDef('fn2o', 'Fogo N2O (CO2e)', null, 'emission_fire_nitrous_oxide_', 'CO2e', 'ha'),
      varDef('sl', 'Corte seletivo', null, 'emission_selective_logging_', 'CO2e', 'ha'),
      varDef('svi', 'Incremento veg. secundária', null, 'sec_veg_increment_', 'C', 'ha'),
      varDef('swd', 'Estoque sem degradação', null, 'stock_without_degradation_', 'C', 'ha'),
      varDef('swg', 'Estoque com degradação', null, 'stock_with_degradation_', 'C', 'ha')
    ]
  },
  v06: {
    label: 'v06 — balanço de massa + borda',
    years: SEEG_YEARS,
    load: function () {
      var base = SEEG_BASE + 'v06/';
      return renamePrefix(ee.Image(base + 'net_emissions_removals'), 'net_emissions_removals_', 'net')
        .addBands(renamePrefix(ee.Image(base + 'emission_deforestation'), 'emission_deforestation_', 'def'))
        .addBands(renamePrefix(ee.Image(base + 'emission_fire_carbon_dioxide'), 'emission_fire_carbon_dioxide_', 'fco2'))
        .addBands(renamePrefix(ee.Image(base + 'emission_fire_methane'), 'emission_fire_methane_', 'fch4'))
        .addBands(renamePrefix(ee.Image(base + 'emission_fire_nitrous_oxide'), 'emission_fire_nitrous_oxide_', 'fn2o'))
        .addBands(renamePrefix(ee.Image(base + 'emission_selective_logging'), 'emission_selective_logging_', 'sl'))
        .addBands(renamePrefix(ee.Image(base + 'emission_edge'), 'emission_edge_', 'edge'))
        .addBands(renamePrefix(ee.Image(base + 'secondary_veg_increment'), 'sec_veg_increment_', 'svi'))
        .addBands(renamePrefix(ee.Image(base + 'carbon_stock_without_degradation'), 'stock_without_degradation_', 'swd'))
        .addBands(renamePrefix(ee.Image(base + 'carbon_stock_with_degradation'), 'stock_with_degradation_', 'swg'));
    },
    variables: [
      varDef('net', 'Líquido', null, 'net_emissions_removals_', 'CO2e', 'ha'),
      varDef('def', 'Desmatamento', null, 'emission_deforestation_', 'CO2e', 'ha'),
      varDef('fco2', 'Fogo CO2', null, 'emission_fire_carbon_dioxide_', 'CO2e', 'ha'),
      varDef('fch4', 'Fogo CH4 (CO2e)', null, 'emission_fire_methane_', 'CO2e', 'ha'),
      varDef('fn2o', 'Fogo N2O (CO2e)', null, 'emission_fire_nitrous_oxide_', 'CO2e', 'ha'),
      varDef('sl', 'Corte seletivo', null, 'emission_selective_logging_', 'CO2e', 'ha'),
      varDef('edge', 'Borda', null, 'emission_edge_', 'CO2e', 'ha'),
      varDef('svi', 'Incremento veg. secundária', null, 'sec_veg_increment_', 'C', 'ha'),
      varDef('swd', 'Estoque sem degradação', null, 'stock_without_degradation_', 'C', 'ha'),
      varDef('swg', 'Estoque com degradação', null, 'stock_with_degradation_', 'C', 'ha')
    ]
  }
};

// -----------------------------------------------------------------------------
// CCAL — MÓDULOS
// -----------------------------------------------------------------------------

var CCAL_ROOT = 'projects/ee-ipam/assets/CCAL/';

var CCAL = {
  M1: {
    label: 'Módulo 1 (v3) — fogo + corte seletivo + desmatamento',
    years: yearsRange(2017, 2024),
    load: function () {
      var src = ee.Image('projects/ee-ipam/assets/CCAL/public/ccal_02/ccal_02_brazil_modulo_1_frell_v3');
      return ee.Image().select()
        .addBands(renamePrefix(src, 'loss_fire_', 'lf'))
        .addBands(renamePrefix(src, 'loss_selective_logging_', 'sl'))
        .addBands(renamePrefix(src, 'loss_convergence_degradation_', 'conv'))
        .addBands(renamePrefix(src, 'loss_deforestation_', 'def'))
        .addBands(renamePrefix(src, 'stock_', 'stock'));
    },
    variables: [
      varDef('lf', 'Fogo', null, 'loss_fire_', 'CO2e', 'px'),
      varDef('sl', 'Corte seletivo', null, 'loss_selective_logging_', 'CO2e', 'px'),
      varDef('conv', 'Convergência (fogo∩SL)', null, 'loss_convergence_degradation_', 'CO2e', 'px'),
      varDef('def', 'Desmatamento', null, 'loss_deforestation_', 'CO2e', 'px'),
      varDef('stock', 'Estoque (carbono)', null, 'stock_', 'C', 'ha')
    ]
  },
  M2: {
    label: 'Módulo 2 (v02) — síntese',
    years: yearsRange(2017, 2023),
    load: function () {
      var src = ee.Image(CCAL_ROOT + 'MODULO2/v02/CCAL_MODULO2-v02');
      return ee.Image().select()
        .addBands(renamePrefix(src, 'loss_fire_', 'lf'))
        .addBands(renamePrefix(src, 'loss_selective_logging_', 'sl'))
        .addBands(renamePrefix(src, 'loss_convergence_degradation_', 'conv'))
        .addBands(renamePrefix(src, 'loss_deforestation_', 'def'))
        .addBands(renamePrefix(src, 'stock_', 'stock'));
    },
    variables: [
      varDef('lf', 'Fogo', null, 'loss_fire_', 'CO2e', 'px'),
      varDef('sl', 'Corte seletivo', null, 'loss_selective_logging_', 'CO2e', 'px'),
      varDef('conv', 'Convergência (fogo∩SL)', null, 'loss_convergence_degradation_', 'CO2e', 'px'),
      varDef('def', 'Desmatamento', null, 'loss_deforestation_', 'CO2e', 'px'),
      varDef('stock', 'Estoque (carbono)', null, 'stock_', 'C', 'ha')
    ]
  },
  M3: {
    label: 'Módulo 3 (v037) — balanço de massa',
    years: yearsRange(1985, 2024),
    load: function () {
      var src = ee.Image(CCAL_ROOT + 'MODULO3/v037/CCAL_MODULO3-v037');
      return ee.Image().select()
        .addBands(renamePrefix(src, 'loss_fire_', 'lf'))
        .addBands(renamePrefix(src, 'loss_grassland_', 'lg'))
        .addBands(renamePrefix(src, 'loss_selective_logging_', 'sl'))
        .addBands(renamePrefix(src, 'loss_convergence_degradation_', 'conv'))
        .addBands(renamePrefix(src, 'loss_deforestation_', 'def'))
        .addBands(renamePrefix(src, 'gain_secondary_vegetation_', 'gain'))
        .addBands(renamePrefix(src, 'stock_', 'stock'));
    },
    variables: [
      varDef('lf', 'Fogo', null, 'loss_fire_', 'CO2e', 'px'),
      varDef('lg', 'Fogo campestre', null, 'loss_grassland_', 'CO2e', 'px'),
      varDef('sl', 'Corte seletivo', null, 'loss_selective_logging_', 'CO2e', 'px'),
      varDef('conv', 'Convergência (fogo∩SL)', null, 'loss_convergence_degradation_', 'CO2e', 'px'),
      varDef('def', 'Desmatamento', null, 'loss_deforestation_', 'CO2e', 'px'),
      varDef('gain', 'Ganho veg. secundária', null, 'gain_secondary_vegetation_', 'CO2e', 'px'),
      varDef('stock', 'Estoque (carbono)', null, 'stock_', 'C', 'ha')
    ]
  },
  M4: {
    label: 'Módulo 4 (v01) — balanço de massa + borda + secundária',
    years: yearsRange(1986, 2024),
    load: function () {
      var src = ee.Image(CCAL_ROOT + 'MODULO4/v01/CCAL_MODULO4-v01');
      return ee.Image().select()
        .addBands(renamePrefix(src, 'loss_edge_', 'edge'))
        .addBands(renamePrefix(src, 'loss_fire_', 'lf'))
        .addBands(renamePrefix(src, 'loss_selective_logging_', 'sl'))
        .addBands(renamePrefix(src, 'loss_convergence_degradation_', 'conv'))
        .addBands(renamePrefix(src, 'loss_deforestation_secondary_', 'defs'))
        .addBands(renamePrefix(src, 'loss_deforestation_', 'def'))
        .addBands(renamePrefix(src, 'gain_secondary_vegetation_', 'gain'))
        .addBands(renamePrefix(src, 'net_balance_', 'net'))
        .addBands(renamePrefix(src, 'stock_', 'stock'));
    },
    variables: [
      varDef('edge', 'Borda', null, 'loss_edge_', 'CO2e', 'px'),
      varDef('lf', 'Fogo', null, 'loss_fire_', 'CO2e', 'px'),
      varDef('sl', 'Corte seletivo', null, 'loss_selective_logging_', 'CO2e', 'px'),
      varDef('conv', 'Convergência (fogo∩SL)', null, 'loss_convergence_degradation_', 'CO2e', 'px'),
      varDef('def', 'Desmatamento', null, 'loss_deforestation_', 'CO2e', 'px'),
      varDef('defs', 'Desmat. secundária', null, 'loss_deforestation_secondary_', 'CO2e', 'px'),
      varDef('gain', 'Ganho veg. secundária', null, 'gain_secondary_vegetation_', 'CO2e', 'px'),
      varDef('net', 'Balanço líquido', null, 'net_balance_', 'CO2e', 'px'),
      varDef('stock', 'Estoque (carbono)', null, 'stock_', 'C', 'ha')
    ]
  }
};

var SCHEMAS = { SEEG: SEEG, CCAL: CCAL };

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

exports.getModes = function () {
  return Object.keys(SCHEMAS);
};

exports.getVersions = function (mode) {
  if (!SCHEMAS[mode]) throw new Error('Modo desconhecido: ' + mode);
  return Object.keys(SCHEMAS[mode]);
};

exports.getLabel = function (mode, version) {
  return SCHEMAS[mode][version].label;
};

exports.getYears = function (mode, version) {
  return SCHEMAS[mode][version].years;
};

exports.getVariables = function (mode, version) {
  return SCHEMAS[mode][version].variables;
};

// Imagem com as bandas renomeadas para <chave>_<ano> (todas as variáveis do schema)
exports.load = function (mode, version) {
  return SCHEMAS[mode][version].load();
};

// Mosaico multibanda padronizado para o inspector:
//   <prefixo><chave>_<ano>  +  <prefixo>pixel_area_ha
exports.buildCombined = function (mode, version, prefix) {
  prefix = prefix || '';
  var def = SCHEMAS[mode][version];
  var img = def.load();
  var combined = ee.Image(0).rename(prefix + 'base_zero')
    .addBands(ee.Image.pixelArea().divide(10000).rename(prefix + 'pixel_area_ha'));

  def.variables.forEach(function (v) {
    var sel = img.select(v.key + '_.*');
    sel = sel.rename(sel.bandNames().map(function (n) {
      return ee.String(prefix).cat(ee.String(n));
    }));
    combined = combined.addBands(sel.unmask(0));
  });

  return combined;
};

// Converte um valor nativo (valor, kind, per) para a unidade alvo.
// nativeKind: 'CO2e' | 'C' ; nativePer: 'ha' | 'px'
// unit: 'tCO2e/ha' | 'tC/ha' | 'kgCO2e/ha' | 'kgC/ha' | 'tCO2e/px' | 'tC/px' | ...
exports.convertValue = function (val, nativeKind, nativePer, unit, areaFact) {
  var base = (nativeKind === 'CO2e') ? (val / TC_TO_TCO2) : val;
  if (nativePer === 'px') base = base / (areaFact || 0.09);

  var f_massa = (unit.indexOf('kg') !== -1) ? 1000 : 1;
  var f_quimico = (unit.indexOf('CO2e') !== -1) ? TC_TO_TCO2 : 1;
  var f_area = (unit.indexOf('/px') !== -1) ? (areaFact || 0.09) : 1;
  return base * f_massa * f_quimico * f_area;
};

exports.TC_TO_TCO2 = TC_TO_TCO2;
