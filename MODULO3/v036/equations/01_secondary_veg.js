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
 * calcSecondaryVegIncrement — CCAL Módulo 3 v036 (01)
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
 
// 'Ate20anos': 2.411
// 'BGB': mais 24%
// 'Bioma': Pampa
// 'Ctotal_ate20': 2.9896399974823
// 'Ctotal_mais20': 0.7340800166130066
// 'Mais20anos': 0.592
// 'Classe': F

 
 
 
exports.calcSecondaryVegIncrement = function(params) {

    var desf_reg = params.desf_reg_corrected;
    var gf       = params.grass_forest;
    var total    = params.total_carbon;
    var incr     = ee.FeatureCollection([
        ee.Feature(null, {
          Ate20anos: '1.974',
          BGB: 'mais 23,5%',
          Bioma: 'Caatinga',
          Ctotal_ate20: 2.43789005279541,
          Ctotal_mais20: 0.5928000211715698,
          Mais20anos: '0.48',
          Classe: 'F'
        }),
        ee.Feature(null, {
          Ate20anos: '2.566',
          BGB: 'mais 23,5%',
          Bioma: 'Mata Atlântica',
          Ctotal_ate20: 3.1690099239349365,
          Ctotal_mais20: 0.7780500054359436,
          Mais20anos: '0.63',
          Classe: 'F'
        }),
        ee.Feature(null, {
          Ate20anos: '3.158',
          BGB: 'mais 24%',
          Bioma: 'Pantanal',
          Ctotal_ate20: 3.9159200191497803,
          Ctotal_mais20: 0.9622399806976318,
          Mais20anos: '0.776',
          Classe: 'F'
        }),
        ee.Feature(null, {
          Ate20anos: '2.411',
          BGB: 'mais 24%',
          Bioma: 'Pampa',
          Ctotal_ate20: 2.9896399974823,
          Ctotal_mais20: 0.7340800166130066,
          Mais20anos: '0.592',
          Classe: 'F'
        }),
        ee.Feature(null, {
          Ate20anos: '3.652',
          BGB: 'mais 31%',
          Bioma: 'Amazônia',
          Ctotal_ate20: 4.784120082855225,
          Ctotal_mais20: 1.1698299646377563,
          Mais20anos: '0.893',
          Classe: 'F'
        }),
        ee.Feature(null, {
          Ate20anos: '2.961',
          BGB: 'mais 31%',
          Bioma: 'Cerrado',
          Ctotal_ate20: 3.8789100646972656,
          Ctotal_mais20: 0.9484400153160095,
          Mais20anos: '0.724',
          Classe: 'F'
        }),
        ee.Feature(null, {
          Ate20anos: 'na',
          BGB: 'na',
          Bioma: 'Amazônia',
          Ctotal_ate20: 1.7000000476837158,
          Ctotal_mais20: 0,
          Mais20anos: 'na',
          Classe: 'G'
        }),
        ee.Feature(null, {
          Ate20anos: 'na',
          BGB: 'na',
          Bioma: 'Cerrado',
          Ctotal_ate20: 1.7000000476837158,
          Ctotal_mais20: 0,
          Mais20anos: 'na',
          Classe: 'G'
        }),
        ee.Feature(null, {
          Ate20anos: 'na',
          BGB: 'na',
          Bioma: 'Pantanal',
          Ctotal_ate20: 1.7000000476837158,
          Ctotal_mais20: 0,
          Mais20anos: 'na',
          Classe: 'G'
        }),
        ee.Feature(null, {
          Ate20anos: 'na',
          BGB: 'na',
          Bioma: 'Caatinga',
          Ctotal_ate20: 0.6000000238418579,
          Ctotal_mais20: 0,
          Mais20anos: 'na',
          Classe: 'G'
        }),
        ee.Feature(null, {
          Ate20anos: 'na',
          BGB: 'na',
          Bioma: 'Mata Atlântica',
          Ctotal_ate20: 0.6000000238418579,
          Ctotal_mais20: 0,
          Mais20anos: 'na',
          Classe: 'G'
        }),
        ee.Feature(null, {
          Ate20anos: 'na',
          BGB: 'na',
          Bioma: 'Pampa',
          Ctotal_ate20: 1.7000000476837158,
          Ctotal_mais20: 0,
          Mais20anos: 'na',
          Classe: 'G'
        })
      ]);
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
            var row = incr
            .filter(ee.Filter.eq('Bioma', b))
            .filter(ee.Filter.eq('Classe', cls))
            .first();
            print(b,cls,row);
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

        var sec_year = is_sec_veg.select('.*_' + year); // 1/0
        var gf_year  = gf.select('.*_' + year);         // 1=Campo, 2=Floresta

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
