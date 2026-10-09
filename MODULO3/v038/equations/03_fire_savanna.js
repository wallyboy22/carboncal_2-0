/**
 * Fogo em savanas v038: usa a banda de frequência acumulada desde 1985 até o
 * ano do evento (fire_frequency_1985_YYYY) e TSF anual da Collection 5.1.
 */
exports.calcSavannaFireEmissions = function (params) {
  var annualBurned = params.annual_burned;
  var fireFrequencyAnnual = params.fire_frequency_annual;
  var timeSinceFire = params.time_since_fire;
  var agb = params.agb;
  var cdw = params.cdw;
  var litter = params.litter;
  var savannaMask = params.savanna_mask;
  var years = params.years;
  var agbToFwd = 0.26;
  var combustionFwd = 0.873;
  var combustionCwd = 0.459;
  var currentAgb = agb;
  var outputs = {
    CO2: ee.Image().select(), CO2_gross: ee.Image().select(),
    CH4: ee.Image().select(), N2O: ee.Image().select(),
    CO: ee.Image().select(), NOX: ee.Image().select()
  };

  years.forEach(function (year) {
    var freq = fireFrequencyAnnual.select('fire_frequency_' + year);
    var freqClass = ee.Image(0)
      .where(freq.gte(1).and(freq.lt(3)), 1)
      .where(freq.gte(3).and(freq.lt(5)), 2)
      .where(freq.gte(5).and(freq.lt(7)), 3)
      .where(freq.gte(7), 4);
    var tsf = timeSinceFire.select('time_after_fire_' + year);
    var tsfClass = ee.Image(0)
      .where(tsf.gte(0).and(tsf.lt(4)), 4)
      .where(tsf.gte(4).and(tsf.lt(7)), 3)
      .where(tsf.gte(7).and(tsf.lt(10)), 2)
      .where(tsf.gte(10), 1);
    var severity = tsfClass.add(freqClass);
    var emissionFactor = ee.Image(0)
      .where(severity.gte(2).and(severity.lte(3)), 0.021)
      .where(severity.gt(3).and(severity.lte(6)), -0.004)
      .where(severity.gt(6), -0.02);
    var burned = annualBurned.select('burned_area_' + year).gt(0)
      .and(savannaMask.select('.*_' + year).gt(0));
    var fineWoody = currentAgb.multiply(agbToFwd);
    var combustion = litter.multiply(combustionFwd)
      .add(fineWoody.multiply(combustionFwd))
      .add(cdw.multiply(combustionCwd));

    outputs.CO2 = outputs.CO2.addBands(currentAgb.multiply(burned)
      .multiply(emissionFactor).rename('CO2_tC_ha_' + year).float());
    outputs.CO2_gross = outputs.CO2_gross.addBands(combustion.multiply(burned)
      .multiply(2000).multiply(1580).divide(1e6)
      .rename('CO2_gross_t_ha_' + year).float());
    outputs.CH4 = outputs.CH4.addBands(combustion.multiply(burned)
      .multiply(2000).multiply(2.3).divide(1e6)
      .rename('CH4_t_ha_' + year).float());
    outputs.N2O = outputs.N2O.addBands(combustion.multiply(burned)
      .multiply(2000).multiply(0.21).divide(1e6)
      .rename('N2O_t_ha_' + year).float());
    outputs.CO = outputs.CO.addBands(combustion.multiply(burned)
      .multiply(2000).multiply(65).divide(1e6)
      .rename('CO_t_ha_' + year).float());
    outputs.NOX = outputs.NOX.addBands(combustion.multiply(burned)
      .multiply(2000).multiply(3.9).divide(1e6)
      .rename('NOX_t_ha_' + year).float());

    currentAgb = currentAgb.add(currentAgb.multiply(burned)
      .multiply(emissionFactor).unmask(0));
  });

  return outputs;
};
