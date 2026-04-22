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
 * calcSecondaryVegIncrement — CCAL Módulo 3 v036
 *
 * Calcula o estoque de carbono acumulado da vegetação secundária
 * com base na idade dos pixels e nas tabelas de incremento por bioma.
 *
 * Entradas (params):
 *   desf_reg_corrected — ee.Image, bandas "classification_YYYY"
 *                        1=Antrópico, 2=Veg.Primária, 3=Veg.Sec.,
 *                        4=Supressão Prim., 5=Regrowth Sec., 6=Supressão Sec.
 *   grass_forest       — ee.Image, bandas "classification_YYYY"
 *                        1=Campo, 2=Floresta (por bioma)
 *   total_carbon       — ee.Image, banda única TOTAL do QCN (tC/ha) — teto do incremento
 *   incrementos        — ee.FeatureCollection {Bioma, Classe, Ctotal_ate20, Ctotal_mais20}
 *   biomas             — ee.FeatureCollection (biomas_IBGE_250mil)
 *   years              — Array de strings, ex: ["1985", "1986", ..., "2024"]
 *
 * Retorna: ee.Image
 *   bandas: "sec_veg_increment_YYYY" (tC/ha, float32)
 *   Somente pixels de veg. sec. têm valores; restante é masked.
 */
exports.calcSecondaryVegIncrement = function(params) {

    var desf_reg = params.desf_reg_corrected;
    var gf       = params.grass_forest;
    var total    = params.total_carbon;
    var incr     = params.incrementos;
    var biomas   = params.biomas;
    var years    = params.years;

    var biome_list = ['Amazônia', 'Caatinga', 'Cerrado', 'Mata Atlântica', 'Pampa', 'Pantanal'];

    // Pre-compute biome images to avoid recomputing inside nested loops
    var biome_images = {};
    biome_list.forEach(function(b) {
        biome_images[b] = ee.Image(1).paint(biomas.filter(ee.Filter.equals('Bioma', b))).neq(1);
    });

    // Pre-compute increment table: {bioma: {F: {lt20, gte20}, G: {lt20, gte20}}}
    var incr_table = {};
    biome_list.forEach(function(b) {
        incr_table[b] = {};
        ['F', 'G'].forEach(function(cls) {
            var row = incr.filter(ee.Filter.and(
                ee.Filter.equals('Bioma', b),
                ee.Filter.equals('Classe', cls)
            )).first();
            incr_table[b][cls] = {
                lt20:  row.getNumber('Ctotal_ate20'),
                gte20: row.getNumber('Ctotal_mais20')
            };
        });
    });

    // Pixels de veg. sec.: classe 3 (estável) ou 5 (regrowth)
    var is_sec_veg = desf_reg.eq(3).or(desf_reg.eq(5));

    var age_stack   = ee.Image(0); // contador de idade acumulada (anos consecutivos como veg.sec.)
    var stock_stack = ee.Image().select(); // resultado acumulado

    years.forEach(function(year, i) {

        var sec_year = is_sec_veg.select('classification_' + year); // 1/0
        var gf_year  = gf.select('classification_' + year);         // 1=Campo, 2=Floresta

        // Atualiza idade: se é veg. sec. neste ano, incrementa; senão, zera
        var age_prev = age_stack.slice(-1);
        var age_year = age_prev.add(1).multiply(sec_year); // zero onde não é veg sec

        age_stack = i === 0 ? age_year : age_stack.addBands(age_year);

        // Calcula incremento acumulado com base na idade e bioma
        var lt20  = age_year.lt(20).and(age_year.gt(0));
        var gte20 = age_year.gte(20);

        var prev_stock = (i === 0) ? ee.Image(0) : stock_stack.slice(-1);

        var increment_year = ee.Image(0).rename('sec_veg_increment_' + year);

        biome_list.forEach(function(b) {
            var bm = biome_images[b];

            var f_lt20  = ee.Image(incr_table[b]['F'].lt20);
            var f_gte20 = ee.Image(incr_table[b]['F'].gte20);
            var g_lt20  = ee.Image(incr_table[b]['G'].lt20);
            var g_gte20 = ee.Image(incr_table[b]['G'].gte20);

            // Calcula estoque acumulado = estoque anterior + incremento anual
            var result_biome = prev_stock.rename('sec_veg_increment_' + year)
                .where(gf_year.eq(2).and(lt20).and(bm),  prev_stock.add(f_lt20))
                .where(gf_year.eq(2).and(gte20).and(bm), prev_stock.add(f_gte20))
                .where(gf_year.eq(1).and(lt20).and(bm),  prev_stock.add(g_lt20))
                .where(gf_year.eq(1).and(gte20).and(bm), prev_stock.add(g_gte20));

            increment_year = increment_year.where(bm.and(sec_year), result_biome);
        });

        // Aplica máscara de veg. sec. e teto do estoque QCN
        increment_year = increment_year
            .updateMask(sec_year)
            .where(increment_year.gt(total), total)
            .float();

        stock_stack = stock_stack.addBands(increment_year);
    });

    return stock_stack;
};
