/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var geometry = 
    /* color: #d63000 */
    /* shown: false */
    ee.Geometry.Polygon(
        [[[-76.54780555077535, 6.702549891783329],
          [-76.54780555077535, -36.49659065368281],
          [-28.735305550775358, -36.49659065368281],
          [-28.735305550775358, 6.702549891783329]]], null, false);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/**
 * calcGrasslandFireEmissions — CCAL Módulo 3 v036 (04)
 *
 * Calcula emissões para áreas de campo/pastagem (LULC classes 11, 12, 50).
 * Considera apenas queima imediata de biomassa fina.
 */

exports.calcGrasslandFireEmissions = function (params) {

    var annual_burned = params.annual_burned;
    var accumulated_burned = params.accumulated_burned;
    var agb = params.agb;
    var cdw = params.cdw;
    var litter = params.litter;
    var grassland_mask = params.grassland_mask;
    var biomas = params.biomas;
    var years = params.years;

    var BIOME_DICT = {
        'Amazônia': { fwd_combf: 0.883, cwd_combf: 0.331 },
        'Caatinga': { fwd_combf: 0.883, cwd_combf: 0.331 },
        'Cerrado': { fwd_combf: 0.883, cwd_combf: 0.331 },
        'Mata Atlântica': { fwd_combf: 0.883, cwd_combf: 0.331 },
        'Pampa': { fwd_combf: 0.883, cwd_combf: 0.331 },
        'Pantanal': { fwd_combf: 0.883, cwd_combf: 0.331 },
    };

    var EF = { CO: 65, CH4: 2.3, N2O: 0.21, NOX: 3.9 };
    var agb_plus_cdw = agb.add(cdw);

    var CO_bands = ee.Image().select();
    var CH4_bands = ee.Image().select();
    var N2O_bands = ee.Image().select();
    var NOX_bands = ee.Image().select();

    years.forEach(function (year) {
        var fire_year = annual_burned.select('.*_' + year);
        var mask_year = grassland_mask.select('.*_' + year);

        var CO_year = ee.Image(0).rename('CO_t_ha_' + year);
        var CH4_year = ee.Image(0).rename('CH4_t_ha_' + year);
        var N2O_year = ee.Image(0).rename('N2O_t_ha_' + year);
        var NOX_year = ee.Image(0).rename('NOX_t_ha_' + year);

        Object.keys(BIOME_DICT).forEach(function (biome_str) {
            var combf_fwd = BIOME_DICT[biome_str].fwd_combf;
            var combf_cwd = BIOME_DICT[biome_str].cwd_combf;

            var biome_mask = ee.Image(1).paint(biomas.filter(ee.Filter.equals('Bioma', biome_str))).neq(1);

            var comb_fwd = litter.multiply(combf_fwd);
            var comb_cwdplusagb = agb_plus_cdw.multiply(combf_cwd);
            var comb_total = comb_fwd.add(comb_cwdplusagb);

            var pixel_mask = fire_year.multiply(mask_year).multiply(biome_mask);

            CO_year = CO_year.add(comb_total.multiply(2000).multiply(EF.CO).divide(1e6).multiply(pixel_mask).rename('CO_t_ha_' + year));
            CH4_year = CH4_year.add(comb_total.multiply(2000).multiply(EF.CH4).divide(1e6).multiply(pixel_mask).rename('CH4_t_ha_' + year));
            N2O_year = N2O_year.add(comb_total.multiply(2000).multiply(EF.N2O).divide(1e6).multiply(pixel_mask).rename('N2O_t_ha_' + year));
            NOX_year = NOX_year.add(comb_total.multiply(2000).multiply(EF.NOX).divide(1e6).multiply(pixel_mask).rename('NOX_t_ha_' + year));
        });

        CO_bands = CO_bands.addBands(CO_year.float());
        CH4_bands = CH4_bands.addBands(CH4_year.float());
        N2O_bands = N2O_bands.addBands(N2O_year.float());
        NOX_bands = NOX_bands.addBands(NOX_year.float());
    });

    return CO_bands.addBands(CH4_bands).addBands(N2O_bands).addBands(NOX_bands);
};
