// =============================================================================
// YbYrá-BR | Emissions & Removals Pipeline
// Brazil — all biomes | 1986–2024
//
// VERSION v1.2 — CHANGELOG vs v1.1:
//   MODULE C — Selective logging emissions added (BEFORE fire in hierarchy)
//       → Asset: logging_frequency_v1  (ee.Image multi-band)
//       → Band prefix: 'logging_freq_YYYY' (e.g. 'logging_freq_1986')
//         *** DISTINCT from other assets which use 'classification_YYYY' ***
//       → Band value = cumulative recurrence order n where logged in that year;
//         0 elsewhere → loggingMask = band.gt(0)
//       → p(n) = 0.196 × exp(−0.0782 × (n − 1))
//           [selective_logging_emission_method.md; Lapola et al. 2023 Science 379;
//            Brasil 2024 FREL Nacional Tabela 12]
//       → E_logging  = AGC_pre_logging × p(n) × (44/12) × pixelAreaHa
//       → AGC_post_logging = AGC_pre_logging × (1 − p(n))
//       → AGC0 updated after logging (before fire)
//       → Disturbance hierarchy: edge → logging → fire → deforestation
//       → New bands: logging_co2, logging_co2_ha, mask_logging, logging_n
//       → total_primary_co2 = edge + logging + fire + defor
//       → net_balance = total_primary_co2 + defor_sf_co2 - removal_sf_co2
//
// All other assets, parameters, and logic are IDENTICAL to v1.1.
//
// MODULE A — Primary forest degradation & deforestation emissions
//   Disturbance hierarchy per pixel per year: edge → logging → fire → deforestation
//   Carbon pool: Aboveground Carbon only (AGC = AGB × 0.47, Mg C ha-1)
//
// MODULE B — Secondary forest carbon stock & deforestation emissions
//   Stock estimated via Chapman-Richards: AGC_sf = A × (1 − b×exp(−K×age))^(1/(1−m))
//   Removal: annual stock increment for ALL active SF pixels (age >= 1)
//   Emission: stock lost when secondary forest is cleared
//
// Output: single ImageCollection
//   projects/ee-redd-brazil/assets/ybyra-br-model/emissions_removals_v1_2/{year}
//
// Bands per year image:
//   PRIMARY EMISSIONS (Mg CO2 pixel-1 yr-1)
//     edge_co2          — edge effect
//     logging_co2       — selective logging          [NEW v1.2]
//     fire_co2          — fire
//     defor_co2         — primary forest deforestation
//     total_primary_co2 — sum of above four
//   PRIMARY EMISSIONS PER HA (Mg CO2 ha-1 yr-1)
//     edge_co2_ha
//     logging_co2_ha                                 [NEW v1.2]
//     fire_co2_ha
//     defor_co2_ha
//   SECONDARY FOREST (stock in Mg CO2 pixel-1; flux in Mg CO2 pixel-1 yr-1)
//     agc_sf_ha         — standing AGC stock (Mg C ha-1)
//     agc_sf_co2        — standing AGC stock (Mg CO2 pixel-1)
//     removal_sf_co2    — annual CO2 removal
//     removal_sf_co2_ha — annual CO2 removal per ha
//     defor_sf_co2      — CO2 emission from SF clearing
//     defor_sf_co2_ha   — emission per ha
//   MASKS (binary)
//     mask_edge
//     mask_logging                                   [NEW v1.2]
//     mask_fire
//     mask_defor
//     mask_sf
//     mask_sf_defor
//     mask_sf_new
//   DIAGNOSTICS
//     agc0_state        — primary forest reference stock entering next year
//     logging_n         — recurrence order n of logging event this year [NEW v1.2]
//     sf_age
//
// Author: IPAM/CCAL
// =============================================================================
 
 
// -----------------------------------------------------------------------------
// 1. REGION OF INTEREST
// -----------------------------------------------------------------------------
var brazil = ee.FeatureCollection('users/celsohlsj/Biomas_250mil');
 
 
// -----------------------------------------------------------------------------
// 2. MASKS
// -----------------------------------------------------------------------------
var brazilForests = ee.Image("projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2")
                      .unmask(0)
                      .remap([1, 2], [1, 1], 0)
                      .clip(brazil);
 
 
// -----------------------------------------------------------------------------
// 3. MAPBIOMAS COLLECTION 10.1
//    Baseline primary forest mask (1985): classes 3 + 6
// -----------------------------------------------------------------------------
var mapbiomas = ee.Image(
  'projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1'
);
 
var mb1985         = mapbiomas.select('classification_1985');
var forestMask1985 = mb1985.eq(3).or(mb1985.eq(6));
var baselineMask   = forestMask1985.multiply(brazilForests);
 
 
// -----------------------------------------------------------------------------
// 4. DISTURBANCE ASSETS
//    fireImg / deforImg / edgeImg / sfAgeImg → ee.Image multi-band,
//    band prefix 'classification_YYYY'
//
//    loggingImg → ee.Image multi-band,
//    band prefix 'logging_freq_YYYY'  *** DISTINCT prefix ***
// -----------------------------------------------------------------------------
var fireImg  = ee.Image("projects/ee-redd-brazil/assets/ybyra-br-model/forestFireAnnual_mb_c101_fire_c4_1986_2024_v2");
var deforImg = ee.Image("projects/ee-redd-brazil/assets/ybyra-br-model/deforestationAnnual_mb_c101_1986_2024_v2");
var edgeImg  = ee.Image("projects/ee-redd-brazil/assets/ybyra-br-model/edgesAge_mb_c101_390m_1986_2024_v2");
var sfAgeImg = ee.Image('projects/ee-redd-brazil/assets/ybyra-br-model/secondary_forest_age_collection10_1_v8_1')
                 .multiply(brazilForests)
                 .unmask(0)
                 .clip(brazil);
 
// [NEW v1.2] Selective logging frequency
var loggingImg = ee.Image('projects/ee-redd-brazil/assets/ybyra-br-model/logging_frequency_v1');
 
print('Fire bands:',    fireImg.bandNames());
print('Defor bands:',   deforImg.bandNames());
print('Edge bands:',    edgeImg.bandNames());
print('SF age bands:',  sfAgeImg.bandNames().slice(0, 5));
print('Logging bands:', loggingImg.bandNames().slice(0, 5));
 
// Band name helpers
var BAND_PREFIX         = 'classification_';
var bandName            = function(year) { return BAND_PREFIX + year; };
 
var LOGGING_BAND_PREFIX = 'logging_freq_';           // [NEW v1.2]
var loggingBandName     = function(year) { return LOGGING_BAND_PREFIX + year; };
 
 
// -----------------------------------------------------------------------------
// 5. INITIAL PRIMARY FOREST AGC (Mg C ha-1)
// -----------------------------------------------------------------------------
var AGC_INITIAL = ee.ImageCollection('projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1')
                    .select('cagb')
                    .mosaic()
                    .multiply(baselineMask)
                    .clip(brazil);
 
var AGC0 = AGC_INITIAL;
 
 
// -----------------------------------------------------------------------------
// 6. SECONDARY FOREST — CHAPMAN-RICHARDS PARAMETERS
//    AGC_sf(age) = A × (1 − b × exp(−K × age)) ^ (1/(1−m))
// -----------------------------------------------------------------------------
var CR_A = ee.ImageCollection('projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1')
             .select('cagb')
             .mosaic()
             .clip(brazil);
 
var CR_b   = ee.Image('projects/ee-ybyra-br-sf/assets/B_30m').clip(brazil);
var CR_K   = ee.Image('projects/ee-ybyra-br-sf/assets/K_30m').clip(brazil);
var CR_M   = 0.67;
var CR_EXP = 1.0 / (1.0 - CR_M);  // ≈ 3.0303
 
var chapmanRichards = function(age) {
  var negKAge = CR_K.multiply(age).multiply(-1);
  var inner   = ee.Image(1).subtract(CR_b.multiply(negKAge.exp()));
  return CR_A.multiply(inner.max(0).pow(CR_EXP));
};
 
 
// -----------------------------------------------------------------------------
// 7. EDGE EFFECT PARAMETERS (Non-degraded forests, Americas — Table 5.2)
//    Cumulative loss:   f(t)  = ALPHA × t / (t + BETA) / 100
//    Incremental loss: Δf(t) = ALPHA × BETA / [(t+BETA) × (t+BETA−1)] / 100
// -----------------------------------------------------------------------------
var ALPHA = 22.518;
var BETA  = 1.615;
 
var cumulativeLoss = function(edgeAge) {
  return edgeAge.multiply(ALPHA)
                .divide(edgeAge.add(BETA).multiply(100));
};
 
var incrementalLoss = function(edgeAge) {
  return ee.Image(ALPHA * BETA)
           .divide(edgeAge.add(BETA)
                          .multiply(edgeAge.add(BETA - 1))
                          .multiply(100));
};
 
 
// -----------------------------------------------------------------------------
// 8. FIRE ALLOMETRIC FUNCTION
//    AGC_post_fire = 0.07816 × AGC_pre_fire ^ 1.4702
// -----------------------------------------------------------------------------
var postFireAGC = function(agc_pre) {
  return agc_pre.pow(1.4702).multiply(0.07816);
};
 
 
// -----------------------------------------------------------------------------
// 8C. SELECTIVE LOGGING FRACTIONAL LOSS  [NEW v1.2]
//
//   p(n) = 0.196 × exp(−0.0782 × (n − 1))
//
//   n = recurrence order (1 = first event, 2 = second, ...)
//   Asset provides n directly as pixel value (0 where no event this year).
//
//   Event-based carbon accounting:
//     E_n  = C_{n-1} × p(n)           emission from n-th event
//     C_n  = C_{n-1} × (1 − p(n))     stock remaining after event n
//
//   References:
//     Lapola et al. (2023) Science 379, eabp8622
//     Brasil (2024) FREL Nacional — Tabela 12
//     selective_logging_emission_method.md (this project)
// -----------------------------------------------------------------------------
var LOGGING_P0    = 0.196;
var LOGGING_DECAY = 0.0782;
 
var loggingFractionalLoss = function(n) {
  return ee.Image(LOGGING_P0)
           .multiply(
             ee.Image(LOGGING_DECAY).multiply(n.subtract(1)).multiply(-1).exp()
           );
};
 
 
// -----------------------------------------------------------------------------
// 9. PIXEL AREA (ha)
// -----------------------------------------------------------------------------
var pixelAreaHa = ee.Image.pixelArea().multiply(0.0001);
 
 
// -----------------------------------------------------------------------------
// 10. OUTPUT COLLECTION
// -----------------------------------------------------------------------------
var OUTPUT_COLLECTION = 'projects/ee-redd-brazil/assets/ybyra-br-model/emissions_removals_v1_2';
// Create before running:
//   earthengine create collection projects/ee-redd-brazil/assets/ybyra-br-model/emissions_removals_v1_2
 
 
// -----------------------------------------------------------------------------
// 11. STATEFUL: secondary forest stock from previous year
// -----------------------------------------------------------------------------
var AGC_sf_prev = ee.Image(0).clip(brazil);
 
 
// -----------------------------------------------------------------------------
// 12. ANNUAL LOOP — 1986 to 2024
// -----------------------------------------------------------------------------
var START_YEAR = 1986;
var END_YEAR   = 2024;
 
for (var year = START_YEAR; year <= END_YEAR; year++) {
 
  var bn = bandName(year);   // 'classification_YYYY' — for fire/defor/edge/sfAge
 
  // ==========================================================================
  // MODULE A — PRIMARY FOREST DISTURBANCE MASKS
  // ==========================================================================
 
  // A.1a  Fire mask
  var fireMask = fireImg.select(bn)
                   .eq(100).multiply(brazilForests).unmask(0).clip(brazil);
 
  // A.1b  Deforestation mask
  var deforMask = deforImg.select(bn)
                    .eq(100).multiply(brazilForests).unmask(0).clip(brazil);
 
  // A.1c  Edge age (years since edge creation)
  var edgeAge = edgeImg.select(bn)
                  .multiply(brazilForests).unmask(0).clip(brazil);
 
  var edgeMask = edgeAge.gte(1);
 
  // ==========================================================================
  // A.2  EDGE EFFECT
  //      AGC_edge = AGC0 × (1 − cumLoss(edgeAge))
  //      E_edge   = AGC0 × ΔLoss(edgeAge)
  // ==========================================================================
  var dC       = incrementalLoss(edgeAge).multiply(edgeMask);
  var AGC_edge = AGC0.multiply(
                   ee.Image(1).subtract(cumulativeLoss(edgeAge).multiply(edgeMask))
                 );
 
  var E_edge = AGC0.multiply(dC).multiply(44.0 / 12.0).multiply(pixelAreaHa);
 
  // ==========================================================================
  // MODULE C — SELECTIVE LOGGING  [NEW v1.2]
  //   Position in hierarchy: edge → LOGGING → fire → deforestation
  //   Input stock: AGC_edge (post-edge, pre-logging)
  // ==========================================================================
 
  // C.1  Band and masks
  //      loggingImg uses prefix 'logging_freq_' (e.g. 'logging_freq_1986'),
  //      NOT 'classification_' like the other disturbance assets.
  var loggingBand = loggingImg.select(loggingBandName(year)).unmask(0).clip(brazil);
  var loggingMask = loggingBand.gt(0)
                               .multiply(brazilForests)
                               .multiply(deforMask.not());
  var loggingN    = loggingBand;   // n comes directly from asset pixel value
 
  // C.2  Pre-logging stock = post-edge stock
  var AGC_pre_logging = AGC_edge;
 
  // C.3  Fractional loss p(n) — zero where no logging event
  var p_n = loggingFractionalLoss(loggingN).multiply(loggingMask);
 
  // C.4  Emission (Mg CO2 pixel-1 yr-1)
  var E_logging = AGC_pre_logging
                    .multiply(p_n)
                    .multiply(44.0 / 12.0)
                    .multiply(pixelAreaHa);
 
  // C.5  Post-logging stock
  var AGC_post_logging = AGC_pre_logging.multiply(ee.Image(1).subtract(p_n));
 
  // C.6  Update AGC0: reduce stock in logged pixels, preserve elsewhere
  AGC0 = AGC0.multiply(loggingMask.not())
             .add(AGC_post_logging.multiply(loggingMask));
 
  // ==========================================================================
  // A.3  FIRE  (uses AGC0 already reduced by edge + logging)
  // ==========================================================================
  var AGC_pre_fire  = AGC_edge;
  var AGC_post_fire = postFireAGC(AGC_pre_fire);
 
  var E_fire = AGC_pre_fire.subtract(AGC_post_fire)
                           .multiply(44.0 / 12.0)
                           .multiply(pixelAreaHa)
                           .multiply(fireMask);
 
  AGC0 = AGC0.multiply(fireMask.not()).add(AGC_post_fire.multiply(fireMask));
 
  // ==========================================================================
  // A.4  DEFORESTATION (primary forest)
  //      AGC entering deforestation reflects edge + logging + fire
  // ==========================================================================
  var AGC_pre_defor = AGC_post_fire.multiply(fireMask)
                        .add(AGC_edge.multiply(fireMask.not()));
 
  var E_defor = AGC_pre_defor.multiply(44.0 / 12.0).multiply(pixelAreaHa).multiply(deforMask);
 
  AGC0 = AGC0.multiply(deforMask.not());
 
  // ==========================================================================
  // A.5  TOTAL PRIMARY CO2
  // ==========================================================================
  var E_total_primary = E_edge.add(E_logging).add(E_fire).add(E_defor);
 
  // ==========================================================================
  // MODULE B — SECONDARY FOREST STOCK & EMISSIONS  (unchanged from v1.1)
  // ==========================================================================
 
  // B.1  SF age this year
  var sfAge        = sfAgeImg.select(bn);
  var sfActiveMask = sfAge.gt(0);
  var sfNewMask    = sfAge.eq(1);
 
  // B.2  Chapman-Richards stock (Mg C ha-1)
  var AGC_sf = chapmanRichards(sfAge).multiply(sfActiveMask);
 
  // B.3  Annual increment = removal
  //      age=1: AGC_sf_prev=0 → increment = full first-year stock
  var AGC_sf_increment = AGC_sf.subtract(AGC_sf_prev).multiply(sfActiveMask);
  var R_sf_co2 = AGC_sf_increment.multiply(44.0 / 12.0).multiply(pixelAreaHa);
 
  // B.4  SF deforestation emission
  var sfDeforMask = AGC_sf_prev.gt(0).and(sfActiveMask.not());
  var E_sf_defor  = AGC_sf_prev
                      .multiply(44.0 / 12.0)
                      .multiply(pixelAreaHa)
                      .multiply(sfDeforMask);
 
  // B.5  Standing stock as CO2
  var AGC_sf_co2 = AGC_sf.multiply(44.0 / 12.0).multiply(pixelAreaHa);
 
  // Update stateful previous-year stock
  AGC_sf_prev = AGC_sf;
 
  // ==========================================================================
  // ASSEMBLE OUTPUT IMAGE
  // ==========================================================================
  var annualImage = E_edge              .rename('edge_co2')
    .addBands(E_logging                 .rename('logging_co2'))
    .addBands(E_fire                    .rename('fire_co2'))
    .addBands(E_defor                   .rename('defor_co2'))
    .addBands(E_total_primary           .rename('total_primary_co2'))
    .addBands(E_edge   .divide(pixelAreaHa).rename('edge_co2_ha'))
    .addBands(E_logging.divide(pixelAreaHa).rename('logging_co2_ha'))
    .addBands(E_fire   .divide(pixelAreaHa).rename('fire_co2_ha'))
    .addBands(E_defor  .divide(pixelAreaHa).rename('defor_co2_ha'))
    .addBands(AGC_sf                    .rename('agc_sf_ha'))
    .addBands(AGC_sf_co2                .rename('agc_sf_co2'))
    .addBands(R_sf_co2                  .rename('removal_sf_co2'))
    .addBands(R_sf_co2 .divide(pixelAreaHa).rename('removal_sf_co2_ha'))
    .addBands(E_sf_defor                .rename('defor_sf_co2'))
    .addBands(E_sf_defor.divide(pixelAreaHa).rename('defor_sf_co2_ha'))
    .addBands(edgeMask                  .rename('mask_edge'))
    .addBands(loggingMask               .rename('mask_logging'))
    .addBands(fireMask                  .rename('mask_fire'))
    .addBands(deforMask                 .rename('mask_defor'))
    .addBands(sfActiveMask              .rename('mask_sf'))
    .addBands(sfDeforMask               .rename('mask_sf_defor'))
    .addBands(sfNewMask                 .rename('mask_sf_new'))
    .addBands(AGC0                      .rename('agc0_state'))
    .addBands(loggingN                  .rename('logging_n'))
    .addBands(sfAge                     .rename('sf_age'));
 
  // --------------------------------------------------------------------------
  // METADATA PROPERTIES
  // --------------------------------------------------------------------------
  annualImage = annualImage.set({
    'year':                year,
    'system:time_start':   ee.Date.fromYMD(year, 1, 1).millis(),
    'system:time_end':     ee.Date.fromYMD(year, 12, 31).millis(),
    'version':             'v1.2',
    'biome':               'Brazil_all_biomes',
    'carbon_pool':         'AGC_aboveground_only',
    'agc_from_agb_x':      0.47,
    'emissions':           'CO2_only',
    'primary_method':      'sequential_edge_logging_fire_deforestation',
    'disturbance_order':   'edge -> logging -> fire -> deforestation',
    'edge_model':          'Michaelis-Menten_discrete_first_difference',
    'edge_alpha':          ALPHA,
    'edge_beta':           BETA,
    'edge_reference':      'Table_5.2_Non-degraded_Americas',
    'fire_model':          'AGC_post = 0.07816 * AGC_pre^1.4702',
    'logging_model':       'p(n)=0.196*exp(-0.0782*(n-1)); E=AGC_pre_logging*p(n)',
    'logging_p0':          LOGGING_P0,
    'logging_decay':       LOGGING_DECAY,
    'logging_source':      'logging_frequency_v1',
    'logging_band_prefix': 'logging_freq_',
    'logging_band_value':  'n=cumulative_recurrence_where_logged; 0=no_event',
    'logging_reference':   'selective_logging_emission_method.md; Lapola_et_al_2023_Science_379; Brasil_2024_FREL_Tab12',
    'agc_source':          'QCN_v2_30m',
    'agc_baseline_mask':   'MapBiomas_C10.1_1985_classes3+6_AND_brazilForests',
    'forest_mask':         'brazilForests_UKPact_MRV',
    'fire_source':         'forestFireAnnual_mb_c101_fire_c4_1986_2024_v2',
    'defor_source':        'deforestationAnnual_mb_c101_1986_2024_v2',
    'edge_source':         'edgesAge_mb_c101_390m_1986_2024_v2',
    'secondary_method':    'Chapman-Richards: y=A*(1-b*exp(-k*t))^(1/(1-m)), m=0.67',
    'CR_A_source':         'QCN_v2_cagb_mosaic',
    'CR_b_source':         'ee-ybyra-br-sf/assets/B_30m',
    'CR_K_source':         'ee-ybyra-br-sf/assets/K_30m',
    'sf_age_source':       'secondary_forest_age_collection10_1_v8_1',
    'sf_mask':             'brazilForests_UKPact_MRV',
    'removal_mask_v1_1':   'sfActiveMask (age>=1 — includes first-year cohorts)',
    'removal_note':        'increment=AGC_sf(t)-AGC_sf_prev(t-1); age=1 uses AGC_sf_prev=0',
    'net_balance_formula': 'total_primary_co2 + defor_sf_co2 - removal_sf_co2',
    'co2_c_ratio':         44/12,
    'units_co2':           'Mg_CO2_per_pixel_per_year',
    'units_co2_ha':        'Mg_CO2_per_ha_per_year',
    'units_stock_co2':     'Mg_CO2_per_pixel',
    'units_stock_ha':      'Mg_C_per_ha',
    'scale_m':             30,
  });
 
  // --------------------------------------------------------------------------
  // EXPORT TO ASSET
  // --------------------------------------------------------------------------
  Export.image.toAsset({
    image:       annualImage.toFloat(),
    description: 'emissions_removals_' + year + '_v1_2',
    assetId:     OUTPUT_COLLECTION + '/' + String(year),
    region:      brazil.geometry().bounds(),
    scale:       30,
    maxPixels:   1e13,
    pyramidingPolicy: { '.default': 'mean' }
  });
 
  // --------------------------------------------------------------------------
  // VISUALIZATION — last year only
  // --------------------------------------------------------------------------
  if (year === END_YEAR) {
    Map.addLayer(E_edge,       { min: 0, max: 5,   palette: ['white', '#1788b9'] },           'Edge CO2 '       + year);
    Map.addLayer(E_logging,    { min: 0, max: 10,  palette: ['white', '#8B4513'] },           'Logging CO2 '    + year);
    Map.addLayer(E_fire,       { min: 0, max: 20,  palette: ['white', '#D85A30'] },           'Fire CO2 '       + year);
    Map.addLayer(E_defor,      { min: 0, max: 100, palette: ['white', '#2d6a2d'] },           'Defor CO2 '      + year);
    Map.addLayer(loggingMask,  { min: 0, max: 1,   palette: ['white', '#8B4513'] },           'Logging mask '   + year);
    Map.addLayer(loggingN,     { min: 1, max: 5,   palette: ['#ffffb2','#fd8d3c','#bd0026'] },'Logging n '      + year);
    Map.addLayer(AGC_sf,       { min: 0, max: 150, palette: ['white','#74c476','#238b45'] },  'SF stock '       + year);
    Map.addLayer(R_sf_co2,     { min: 0, max: 5,   palette: ['white', '#1a9641'] },           'SF removal '     + year);
    Map.addLayer(E_sf_defor,   { min: 0, max: 50,  palette: ['white', '#d94801'] },           'SF defor CO2 '   + year);
    Map.addLayer(sfNewMask,    { min: 0, max: 1,   palette: ['white', '#f7dc6f'] },           'SF new (age=1) ' + year);
    Map.addLayer(AGC0,         { min: 0, max: 200, palette: ['white', 'darkgreen'] },         'AGC0 state '     + year);
    Map.addLayer(sfAge,        { min: 0, max: 38,  palette: ['white','yellow','green'] },     'SF age '         + year);
  }
 
} // end of year loop
 
 
// =============================================================================
// POST-EXPORT: QUANTIFY EMISSIONS & REMOVALS FOR ANY AREA
//   (uncomment and adapt to your region of interest)
//
//   var col = ee.ImageCollection(OUTPUT_COLLECTION);
//   var yourRegion = ee.FeatureCollection('...');
//
//   var table = col.map(function(img) {
//     var stats = img.select([
//       'edge_co2','logging_co2','fire_co2','defor_co2','total_primary_co2',
//       'agc_sf_co2','removal_sf_co2','defor_sf_co2'
//     ]).reduceRegion({
//       reducer:   ee.Reducer.sum(),
//       geometry:  yourRegion.geometry(),
//       scale:     30,
//       maxPixels: 1e13
//     });
//     return ee.Feature(null, stats).set('year', img.get('year'));
//   });
//
//   Export.table.toDrive({
//     collection:  ee.FeatureCollection(table),
//     description: 'emissions_removals_by_region_v1_2',
//     fileFormat:  'CSV'
//   });
//
//   Net balance per year:
//     net = total_primary_co2 + defor_sf_co2 - removal_sf_co2
// =============================================================================
 
print('YbYrá-BR Pipeline v1.2 configured. Output: ' + OUTPUT_COLLECTION);
print('Submit export tasks (1986–2024) from the Tasks tab.');
Map.centerObject(brazil, 5);