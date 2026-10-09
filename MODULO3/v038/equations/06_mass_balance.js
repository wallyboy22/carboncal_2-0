/** Balanço de massa v038; inclui logging a partir de 1988. */
var TC_TO_TCO2 = 3.67;
var GWP_CH4 = 28;
var GWP_N2O = 265;

exports.calcMassBalance = function (p) {
  var pixelAreaHa = ee.Image.pixelArea().divide(10000);
  var accum = ee.Image(0).rename('dummy');
  var pastStock = p.biomass_stock_bruto.select('sec_veg_increment_' + p.years_all[0]);
  var outputs = {
    biomass_stock: ee.Image().select(), loss_fire: ee.Image().select(),
    loss_logging: ee.Image().select(), loss_deforestation: ee.Image().select(),
    gain_sec_veg: ee.Image().select(), loss_grassland: ee.Image().select(),
    loss_convergence_degradation: ee.Image().select()
  };

  p.years_fire.forEach(function (year) {
    var ffc = p.fire_forest_CO2.select('CO2_tC_ha_' + year).unmask(0);
    var ffm = p.fire_forest_CH4.select('CH4_t_ha_' + year).unmask(0);
    var ffn = p.fire_forest_N2O.select('N2O_t_ha_' + year).unmask(0);
    var fsc = p.fire_savanna_CO2.select('CO2_tC_ha_' + year).unmask(0);
    var fsm = p.fire_savanna_CH4.select('CH4_t_ha_' + year).unmask(0);
    var fsn = p.fire_savanna_N2O.select('N2O_t_ha_' + year).unmask(0);
    var fgm = p.fire_grassland_CH4.select('CH4_t_ha_' + year).unmask(0);
    var fgn = p.fire_grassland_N2O.select('N2O_t_ha_' + year).unmask(0);
    var logTC = Number(year) >= 1988
      ? p.logging_forest_CO2.select('CO2_tC_ha_' + year).unmask(0)
      : ee.Image(0);

    var accumY = accum.slice(-1).subtract(ffc).subtract(fsc).subtract(logTC)
      .rename('accum_' + year);
    accum = accum.addBands(accumY);
    var stockGross = p.biomass_stock_bruto.select('sec_veg_increment_' + year);
    var desf = p.desf_reg_corrected.select('classification_' + year);
    var stockUpdated = stockGross.where(desf.eq(2), stockGross.add(accumY.unmask(0)))
      .rename('stock_' + year).float();
    var deltaStock = pastStock.subtract(stockUpdated);
    var degradationTC = ffc.add(fsc).add(logTC);
    var isDeforestation = desf.eq(4).or(desf.eq(6));
    var deforTC = deltaStock.subtract(degradationTC).max(0);
    var defor = deforTC.multiply(TC_TO_TCO2).multiply(pixelAreaHa)
      .multiply(isDeforestation).rename('loss_deforestation_' + year).float();
    var isSecondary = desf.eq(3).or(desf.eq(5));
    var gain = deltaStock.min(0).abs().multiply(isSecondary).multiply(TC_TO_TCO2)
      .multiply(pixelAreaHa).rename('gain_secondary_vegetation_' + year).float();

    var forestFireCO2e = ffc.multiply(TC_TO_TCO2).add(ffm.multiply(GWP_CH4))
      .add(ffn.multiply(GWP_N2O));
    var savannaFireCO2e = fsc.multiply(TC_TO_TCO2).add(fsm.multiply(GWP_CH4))
      .add(fsn.multiply(GWP_N2O));
    var fireTotal = forestFireCO2e.add(savannaFireCO2e);
    var loggingCO2e = logTC.multiply(TC_TO_TCO2);
    var grassland = fgm.multiply(GWP_CH4).add(fgn.multiply(GWP_N2O))
      .multiply(pixelAreaHa).selfMask().rename('loss_grassland_' + year).float();
    var convergence = fireTotal.add(loggingCO2e)
      .updateMask(fireTotal.gt(0).and(loggingCO2e.gt(0)))
      .multiply(pixelAreaHa).rename('loss_convergence_degradation_' + year).float();

    outputs.loss_fire = outputs.loss_fire.addBands(
      fireTotal.multiply(pixelAreaHa).rename('loss_fire_' + year).float());
    outputs.loss_logging = outputs.loss_logging.addBands(
      loggingCO2e.multiply(pixelAreaHa).rename('loss_selective_logging_' + year).float());
    outputs.loss_deforestation = outputs.loss_deforestation.addBands(defor);
    outputs.gain_sec_veg = outputs.gain_sec_veg.addBands(gain);
    outputs.loss_grassland = outputs.loss_grassland.addBands(grassland);
    outputs.loss_convergence_degradation = outputs.loss_convergence_degradation.addBands(convergence);
    outputs.biomass_stock = outputs.biomass_stock.addBands(stockUpdated);
    pastStock = stockUpdated;
  });
  return outputs;
};
