/** Máscara persistente: incêndio e logging binário com convenções de sinal próprias. */
exports.createDegradationMask = function (p) {
  var mask = ee.Image().select();
  var accumulated = ee.Image(0);
  p.years.forEach(function (year) {
    var fireForest = p.fire_forest_CO2.select('CO2_tC_ha_' + year).unmask(0);
    var fireSavanna = p.fire_savanna_CO2.select('CO2_tC_ha_' + year).unmask(0);
    var logging = p.logging_forest_CO2.select('CO2_tC_ha_' + year).unmask(0);
    var vegetation = p.vegetation_mask.select('.*_' + year);

    // Fogo usa perdas negativas no balanço; logging retorna tC/ha perdido positivo.
    var lossForest = fireForest.lt(0).multiply(fireForest.abs());
    var lossSavanna = fireSavanna.lt(0).multiply(fireSavanna.abs());
    var lossLogging = logging.max(0);
    accumulated = accumulated.add(lossForest).add(lossSavanna).add(lossLogging);
    mask = mask.addBands(accumulated.gt(0).and(vegetation.eq(1))
      .rename('degradation_' + year));
  });
  return mask;
};
