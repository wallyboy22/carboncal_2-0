// ===================================================================
// TESTE PAMPA — reproduz processSimpleBiome com ordem corrigida
// (remap ANTES de multiply f2016) + checagem visual
// ===================================================================

// ---------- Config (igual ao gerador v2.1.2) ----------
var START_YEAR = 2017, END_YEAR = 2024;
var PRODES_START = 2016, PRODES_END = 2024;
var C_TO_CO2 = 44/12;
var F_BIOME_PAM = 0.966;

var PRODES_FROM = [], PRODES_TO = [];
for (var _y = PRODES_START; _y <= PRODES_END; _y++){
  PRODES_FROM.push(_y - 2000);
  PRODES_TO.push(_y);
}

// ---------- Assets compartilhados ----------
var prodesGreaterThan625ha = ee.Image('users/celsojunior/prodes_brasil_2024_v20260407');
var prodesLessThan625ha    = ee.Image('projects/ee-celsojunior/assets/yearly_deforestation_smaller_than_625ha_biome');
var vegetationMask = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2')
                       .unmask(0).remap([1,2],[1,1],0);
var carbonStock = ee.ImageCollection('projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1');
var biomesBound = ee.FeatureCollection('projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil');

// ---------- forest2016 (igual ao gerador) ----------
var prodesSmall = prodesLessThan625ha.remap([1,2,3,4,5,6,7,8,9],[16,23,24,20,19,18,22,17,21]);
var prodesUnified = prodesGreaterThan625ha.unmask(0).blend(prodesSmall);
var deforestedUpTo2016 = prodesUnified.gte(2).and(prodesUnified.lte(16));
var prodesRaw = ee.Image('projects/ee-ipam/assets/REDD/prodes_brasil_2023').unmask(0);
var prodesNonVegetation = prodesRaw.eq(91).or(prodesRaw.eq(101));
var forest2016 = vegetationMask.eq(1)
  .and(deforestedUpTo2016.not())
  .and(prodesNonVegetation.not());

// ===================================================================
// PAMPA
// ===================================================================
var biomeFC = biomesBound.filter(ee.Filter.eq('Bioma','Pampa'));
var f2016   = forest2016.clip(biomeFC);

Map.centerObject(biomeFC, 6);
Map.addLayer(biomeFC, {color:'black'}, 'Limite Pampa', false);

// --- DIAGNÓSTICO 1: f2016 e PRODES bruto têm pixels no Pampa? ---
print('Pixels floresta2016 no Pampa:',
  f2016.selfMask().reduceRegion({reducer: ee.Reducer.count(),
    geometry: biomeFC.geometry(), scale: 1000, maxPixels: 1e11, bestEffort: true}));

print('Pixels PRODES def (sem f2016) no Pampa:',
  prodesGreaterThan625ha.remap(PRODES_FROM, PRODES_TO, 0).gt(0).clip(biomeFC).selfMask()
    .reduceRegion({reducer: ee.Reducer.count(),
      geometry: biomeFC.geometry(), scale: 1000, maxPixels: 1e11, bestEffort: true}));

// --- prodesDeforestation: ORDEM CORRIGIDA (remap -> multiply) ---
var prodesDeforestation = prodesGreaterThan625ha
  .unmask(0)
  .remap(PRODES_FROM, PRODES_TO, 0)   // primeiro (inteiros)
  .multiply(f2016)                    // depois (máscara floresta)
  .clip(biomeFC);

// versão SEM f2016, para comparar visualmente
var prodesDefNoMask = prodesGreaterThan625ha
  .unmask(0)
  .remap(PRODES_FROM, PRODES_TO, 0)
  .clip(biomeFC);

Map.addLayer(prodesDeforestation.selfMask(),
  {min:2017, max:2024, palette:['#ffffcc','#fd8d3c','#bd0026']},
  'Ano desmat. (COM f2016) — corrigido', true);
Map.addLayer(prodesDefNoMask.selfMask(),
  {min:2017, max:2024, palette:['#deebf7','#3182bd','#08306b']},
  'Ano desmat. (SEM f2016)', false);

// --- Estoque (total) ---
var totalCarbon = carbonStock.select('total').mosaic().unmask(0).multiply(f2016).clip(biomeFC);

// --- Emissão def CO2 por ano + soma ---
var vis = {min:0, max:10, palette:['#ffffcc','#fed976','#fd8d3c','#e31a1c','#800026']};
var somaDef = ee.Image(0).clip(biomeFC);

for (var year = START_YEAR; year <= END_YEAR; year++){
  var defMask = prodesDeforestation.eq(year);
  // emissão em tCO2e/pixel (igual ao exportEmissionImage: área*ha * fBiome)
  var defCO2 = totalCarbon.multiply(defMask)
                 .multiply(C_TO_CO2)
                 .multiply(ee.Image.pixelArea().multiply(0.0001))
                 .multiply(F_BIOME_PAM);

  totalCarbon = totalCarbon.multiply(defMask.neq(1)); // baixa o estoque
  somaDef = somaDef.add(defCO2.unmask(0));

  Map.addLayer(defCO2.selfMask(), vis, 'def CO2 Pampa ' + year, false);
}

// soma de todos os anos (camada principal p/ enxergar onde há emissão)
Map.addLayer(somaDef.selfMask(),
  {min:0, max:30, palette:['#ffffcc','#fd8d3c','#bd0026']},
  'def CO2 Pampa — SOMA 2017–2024', true);

// estatística final
print('Soma total def CO2 no Pampa (tCO2e):',
  somaDef.reduceRegion({reducer: ee.Reducer.sum(),
    geometry: biomeFC.geometry(), scale: 1000, maxPixels: 1e11, bestEffort: true}));