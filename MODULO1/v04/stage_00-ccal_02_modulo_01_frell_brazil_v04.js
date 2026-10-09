// Módulo 1 FREL v04 — cálculo anual 2017–2024 com QCN SEEG14/Col. 11.
// Mantém EBA, PRODES, DETER, fatores e compartimentalização da v03.
var VERSION = 'v04';
var START_YEAR = 2017, END_YEAR = 2024, SCALE = 30, MAX_PIX = 1e13;
var BIOME_OUT = 'projects/ee-ipam/assets/CCAL/MODULO1/' + VERSION;
var QCN = ee.Image('projects/ee-ipam/assets/SEEG/SEEG14/RETIFICACAO/c_rect_col11');
var PRODES_BIG = ee.Image('users/celsojunior/prodes_brasil_2024_v20260407').unmask(0);
var PRODES_SMALL_RAW = ee.Image('projects/ee-celsojunior/assets/yearly_deforestation_smaller_than_625ha_biome');
var MANAGED = ee.Image('projects/ee-ipam/assets/Managed_Land_Brazil').unmask(0);
var BIOMES = ee.FeatureCollection('projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026');
var PRET = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2')
  .unmask(0).remap([1,2],[1,1],0);
var PRODES_RAW = ee.Image('projects/ee-ipam/assets/REDD/prodes_brasil_2023').unmask(0);
var NON_VEGETATION = PRODES_RAW.eq(91).or(PRODES_RAW.eq(101));
var small = PRODES_SMALL_RAW.multiply(0);
var smallFrom = [1,2,3,4,5,6,7,8,9], smallTo = [16,23,24,20,19,18,22,17,21];
for (var si=0; si<smallFrom.length; si++) small = small.where(PRODES_SMALL_RAW.eq(smallFrom[si]),smallTo[si]);
var prodesCodes = PRODES_BIG.blend(small);
var prodesYear = prodesCodes.multiply(0);
for (var pc=16; pc<=24; pc++) prodesYear = prodesYear.where(prodesCodes.eq(pc),2000+pc);
var forest2016 = PRET.eq(1).and(prodesCodes.gte(2).and(prodesCodes.lte(16)).not())
  .and(NON_VEGETATION.not());
var carbon = {
  agb: QCN.select('AGB'), bgb: QCN.select('BGB'),
  dw: QCN.select('CDW'), litter: QCN.select('LITTER')
};
var eba = {
  agb: ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_AB_30m'),
  bgb: ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_BB_30m'),
  dw: ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_DW_30m'),
  litter: ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_LI_30m')
};
var PREFIX = { 'Amazônia':'amz', 'Cerrado':'cerr', 'Pantanal':'pan', 'Pampa':'pam', 'Caatinga':'caa', 'Mata Atlântica':'ma' };
var F_BIOME = {amz:1.009,cerr:0.995,pan:1.002,pam:0.966,caa:1.019,ma:1.000};
var F_POST = {amz:0.042,cerr:0.088};
var PIXEL_HA = ee.Image.pixelArea().multiply(0.0001);
var C_TO_CO2 = 44/12, GWP_CH4 = 28, GWP_N2O = 265;
var DET_ROOT = 'projects/ee-ipam/assets/CCAL/DATASETS/PRODES/PRODES_ANO_CIVIL/';

function exportEmission(image, prefix, type, year, mask, bounds) {
  Export.image.toAsset({image:image.multiply(PIXEL_HA).multiply(F_BIOME[prefix])
    .rename('emission_tCO2e_pixel').updateMask(mask).float(),
    description:'WS_CCAL_M1V04-'+prefix+'_'+type+'_'+year,
    assetId:BIOME_OUT+'/'+prefix+'_'+type+'_'+year, region:bounds,
    crs:'EPSG:4326', crsTransform:[0.00026949458523585647,0,-180,0,-0.00026949458523585647,90],
    scale:SCALE,maxPixels:MAX_PIX,pyramidingPolicy:{'.default':'mean'},overwrite:true});
}
function exportStock(parts, prefix, year, mask, bounds) {
  var total=parts.agb.add(parts.bgb).add(parts.dw).add(parts.litter);
  var stacked=parts.agb.rename('agb').addBands(parts.bgb.rename('bgb'))
    .addBands(parts.dw.rename('dw')).addBands(parts.litter.rename('litter'))
    .addBands(total.rename('total')).updateMask(mask).float();
  Export.image.toAsset({image:stacked,description:'WS_CCAL_M1V04-'+prefix+'_stock_carbon_'+year,
    assetId:BIOME_OUT+'/'+prefix+'_stock_carbon_'+year,region:bounds,
    crs:'EPSG:4326',crsTransform:[0.00026949458523585647,0,-180,0,-0.00026949458523585647,90],
    scale:SCALE,maxPixels:MAX_PIX,pyramidingPolicy:{'.default':'mean'},overwrite:true});
}

function processBiome(name) {
  var fc=BIOMES.filter(ee.Filter.eq('Bioma',name));
  var mask=ee.Image().paint(fc).eq(0), bounds=fc.geometry().bounds(), prefix=PREFIX[name];
  var state={};
  Object.keys(carbon).forEach(function(k){
    var source=carbon[k];
    if(name==='Amazônia') source=source.blend(eba[k].updateMask(eba[k].gte(0)));
    state[k]=source.multiply(forest2016);
  });
  exportStock(state,prefix,START_YEAR-1,mask,bounds);

  for(var year=START_YEAR;year<=END_YEAR;year++){
    var forest=ee.Image(1);
    if(name==='Amazônia'){
      var fire=ee.Image(DET_ROOT+'DeterAnoProdes_'+year+'_fire').unmask(0).multiply(MANAGED).multiply(forest);
      var agbDwL=state.agb.add(state.dw).add(state.litter);
      var fireCO2=agbDwL.multiply(fire).multiply(0.368);
      var fireCH4=agbDwL.multiply(fire).multiply(1/0.47).multiply(0.368).multiply(6.8).multiply(0.001);
      var fireN2O=agbDwL.multiply(fire).multiply(1/0.47).multiply(0.368).multiply(0.2).multiply(0.001);
      exportEmission(fireCO2.multiply(C_TO_CO2),prefix,'emission_fire_co2',year,mask,bounds);
      exportEmission(fireCH4.multiply(GWP_CH4),prefix,'emission_fire_ch4',year,mask,bounds);
      exportEmission(fireN2O.multiply(GWP_N2O),prefix,'emission_fire_n2o',year,mask,bounds);
      state.agb=state.agb.subtract(state.agb.multiply(fire).multiply(0.368));
      state.dw=state.dw.subtract(state.dw.multiply(fire).multiply(0.368));
      state.litter=state.litter.subtract(state.litter.multiply(fire).multiply(0.368));
      var sl=ee.Image(DET_ROOT+'DeterAnoProdes_'+year+'_cs_disordered').unmask(0).multiply(forest);
      var slFrac=sl.remap([0,1,2,3,4,5,6,7,8,9,10],[0,0.29,0.27,0.26,0.22,0.22,0.22,0.22,0.22,0.22,0.22]);
      var slLoss=state.agb.multiply(slFrac);
      exportEmission(slLoss.multiply(C_TO_CO2),prefix,'emission_sl_co2',year,mask,bounds);
      state.agb=state.agb.subtract(slLoss);
    }
    var defMask=prodesYear.eq(year).and(forest2016);
    var total=state.agb.add(state.bgb).add(state.dw).add(state.litter);
    var defCO2=total.multiply(defMask).multiply(C_TO_CO2);
    var defCH4=state.agb.add(state.dw).add(state.litter).multiply(defMask)
      .multiply(1/0.47).multiply(name==='Cerrado'?0.379:0.368).multiply(6.8).multiply(0.001).multiply(GWP_CH4);
    var defN2O=state.agb.add(state.dw).add(state.litter).multiply(defMask)
      .multiply(1/0.47).multiply(name==='Cerrado'?0.379:0.368).multiply(0.2).multiply(0.001).multiply(GWP_N2O);
    var post=F_POST[prefix]||0;
    exportEmission(defCO2.multiply(1+post).add(defCH4.add(defN2O).multiply(post)),prefix,'emission_def_co2',year,mask,bounds);
    if(name==='Amazônia'||name==='Cerrado'){
      exportEmission(defCH4,prefix,'emission_def_ch4',year,mask,bounds);
      exportEmission(defN2O,prefix,'emission_def_n2o',year,mask,bounds);
    }
    Object.keys(state).forEach(function(k){state[k]=state[k].multiply(defMask.not());});
    exportStock(state,prefix,year,mask,bounds);
  }
}
Object.keys(PREFIX).forEach(processBiome);
print('Módulo 1 v04 — exports anuais configurados (2017–2024).');
