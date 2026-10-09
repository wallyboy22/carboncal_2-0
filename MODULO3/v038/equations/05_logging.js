/** Corte seletivo binário com recorrência anual por pixel (v038). */
exports.calcLoggingEmissions = function (params) {
  var agb = params.agb;
  var forestMask = params.forest_mask;
  var amazonMask = params.amazon_mask;
  var logging = params.logging_binary;
  var years = params.years;
  var lossP0 = params.loss_p0 === undefined ? 0.196 : params.loss_p0;
  var lossDecay = params.loss_decay === undefined ? 0.0782 : params.loss_decay;

  var agbUpdated = agb;
  var cumulativeEvents = ee.Image(0);
  var result = ee.Image().select();

  years.forEach(function (year) {
    var event = logging.select('logging_' + year).unmask(0).gt(0)
      .and(forestMask.select('.*_' + year).gt(0))
      .and(amazonMask);

    cumulativeEvents = cumulativeEvents.add(event.unmask(0));
    var lossFraction = ee.Image(lossP0).multiply(
      ee.Image(lossDecay).multiply(cumulativeEvents.subtract(1)).multiply(-1).exp()
    ).multiply(event);

    var lossTC = agbUpdated.multiply(lossFraction)
      .rename('CO2_tC_ha_' + year).float();
    agbUpdated = agbUpdated.subtract(lossTC.unmask(0));
    result = result.addBands(lossTC);
  });

  return result;
};
