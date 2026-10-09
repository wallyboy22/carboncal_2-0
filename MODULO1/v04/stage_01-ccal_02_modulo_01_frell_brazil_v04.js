// CCAL Módulo 1 v04 — mosaico, spill, land cover e produto consolidado.
var VERSION='v04';
var SRC='projects/ee-ipam/assets/CCAL/MODULO1/biomes_v6';
var OUT='projects/ee-ipam/assets/CCAL/MODULO1/v04';
var FINAL='projects/ee-ipam/assets/CCAL/public/ccal_02/ccal_02_brazil_modulo_1_frell_v4';
var PREFIXES=['amz','cerr','pan','pam','caa','ma'];
var YEARS=[], STOCK_YEARS=[];
for(var y=2017;y<=2024;y++)YEARS.push(y);
for(var sy=2016;sy<=2024;sy++)STOCK_YEARS.push(sy);
var BIOMES=ee.FeatureCollection('projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026');
var BOUNDS=BIOMES.geometry().bounds();
var PIXEL_HA=ee.Image.pixelArea().multiply(0.0001);
var CRS='EPSG:4326';
var TRANSFORM=[0.00026949458523585647,0,-180,0,-0.00026949458523585647,90];

function load(type,year,prefix){
  var im=ee.Image(SRC+'/'+prefix+'_'+type+'_'+year);
  return type==='stock_carbon'?im.select('total'):im.select(0);
}
function mosaic(type,year,prefixes){
  var sum=ee.Image(0);
  prefixes.forEach(function(prefix){sum=sum.add(load(type,year,prefix).unmask(0));});
  return sum;
}
function exportAsset(image,name,asset,pyramiding){
  Export.image.toAsset({image:image.float(),description:'WS_CCAL_M1V04-'+name,
    assetId:asset,region:BOUNDS,crs:CRS,crsTransform:TRANSFORM,scale:30,maxPixels:1e13,
    pyramidingPolicy:{'.default':pyramiding||'mean'},overwrite:true});
}

var raw=ee.Image(mosaic('stock_carbon',2016,PREFIXES).rename('stock_2016'));
YEARS.forEach(function(year){
  raw=raw.addBands(mosaic('emission_fire_co2',year,['amz']).add(
    mosaic('emission_fire_ch4',year,['amz'])).add(mosaic('emission_fire_n2o',year,['amz']))
    .rename('loss_fire_'+year));
  raw=raw.addBands(mosaic('emission_sl_co2',year,['amz']).rename('loss_selective_logging_'+year));
  var def=mosaic('emission_def_co2',year,PREFIXES)
    .add(mosaic('emission_def_ch4',year,['amz','cerr']))
    .add(mosaic('emission_def_n2o',year,['amz','cerr']));
  raw=raw.addBands(def.rename('loss_deforestation_'+year));
  raw=raw.addBands(mosaic('stock_carbon',year,PREFIXES).rename('stock_'+year));
});

var convergence=ee.Image().select();
YEARS.forEach(function(year){
  convergence=convergence.addBands(raw.select('loss_fire_'+year)
    .add(raw.select('loss_selective_logging_'+year))
    .updateMask(raw.select('loss_fire_'+year).gt(0)
      .and(raw.select('loss_selective_logging_'+year).gt(0)))
    .rename('loss_convergence_degradation_'+year));
});
raw=raw.addBands(convergence);

function applySpill(image){
  return ee.Image(image.slice(1).bandNames().iterate(function(current,previous){
    var name=ee.String(current),prev=ee.Image(previous);
    var next=prev.slice(-1).rename(name).multiply(0).blend(image.select(name).selfMask());
    return prev.addBands(next);
  },image.select(0).selfMask()));
}
var stockMask=raw.select('stock_.*').slice(1).gt(0);
var finalDeg=applySpill(raw.select('loss_fire_.*')).updateMask(stockMask)
  .addBands(applySpill(raw.select('loss_selective_logging_.*')).updateMask(stockMask))
  .addBands(applySpill(raw.select('loss_convergence_degradation_.*')).updateMask(stockMask));
var finalImage=finalDeg.addBands(raw.select('loss_deforestation_.*').selfMask())
  .addBands(raw.select('stock_.*').selfMask()).float();

var landCover=ee.Image().select();
var wasDeforested=ee.Image(0),wasDegraded=ee.Image(0);
var forestReference=raw.select('stock_2016').unmask(0).gt(0);
STOCK_YEARS.forEach(function(year){
  var stock=raw.select('stock_'+year),defYear=ee.Image(0),fire=ee.Image(0),logging=ee.Image(0);
  if(year>=2017){
    var previous=raw.select('stock_'+(year-1));
    defYear=previous.gt(0).and(stock.eq(0));
    fire=raw.select('loss_fire_'+year).gt(0);
    logging=raw.select('loss_selective_logging_'+year).gt(0);
  }
  wasDeforested=wasDeforested.or(defYear);
  wasDegraded=wasDegraded.or(fire).or(logging);
  var anthropic=forestReference.not().or(wasDeforested.and(defYear.not()));
  var preserved=stock.gt(0).and(wasDegraded.not()).and(defYear.not());
  var degraded=stock.gt(0).and(wasDegraded).and(defYear.not());
  var mask=ee.Image(0).where(anthropic,1).where(preserved,2).where(degraded,3).where(defYear,4);
  landCover=landCover.addBands(mask.rename('land_cover_'+year));
});

var types=['loss_fire','loss_selective_logging','loss_convergence_degradation','loss_deforestation'];
types.forEach(function(type){
  var density=raw.select(type+'.*').divide(PIXEL_HA).float();
  exportAsset(density,type+'_t_ha',OUT+'/'+type+'_t_ha');
});
exportAsset(raw.select('stock_.*').float(),'stock_tC_ha',OUT+'/stock_tC_ha');
exportAsset(landCover.byte(),'land_cover_masks',OUT+'/land_cover_masks','mode');
exportAsset(finalImage,'ccal_02_brazil_modulo_1_frell_v4',FINAL,'median');
print('Módulo 1 v04 — produto final configurado:',FINAL);
print('Bandas:',finalImage.bandNames());
