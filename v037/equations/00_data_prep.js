/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Preparação de Dados)
 * VERSÃO: v037
 * SCRIPT: 00_data_prep.js
 * DESCRIÇÃO: Corrige e prepara dados de entrada para os demais módulos.
 *            Inclui correção do desf_reg (classe 7), criação de máscaras
 *            de cobertura e classificação grass/forest.
 * -----------------------------------------------------------------------------
 * INSTITUIÇÃO: IPAM Amazônia
 * EQUIPE CCAL: Ane Alencar; Bárbara Zimbres; Camila Silva; Celso Silva-Junior;
 *              Edriano Souza; Isabel Silva; Lívia Laureto; Manuela Padilha;
 *              Paulo Moutinho; Rebecca Maranhão; Valderli Piontekowski; Wallace Silva;
 *              Jarlene Gomes; Julia Shimbo
 * CONTATO: https://ipam.org.br/contato/fale-conosco/
 * ATUALIZAÇÃO: 2026-06-08
 * =============================================================================
 */

/**
 * Corrige a classe 7 (Outra Transição) no desf_reg usando forward-backward fill.
 *
 * @param {ee.Image} desf_reg - Imagem do MapBiomas Desf/Veg Sec com bandas classification_YYYY
 * @param {string[]} years - Lista de anos (ex: ['1985', '1986', ..., '2024'])
 * @returns {ee.Image} - Imagem com bandas classification_YYYY corrigidas
 */
exports.correctDesfReg = function (desf_reg, years) {

    // Forward fill: classe 7 → valor do ano anterior
    var desf_forward = ee.Image(years.reduce(function (acc, year, i) {
        var curr = desf_reg.select('classification_' + year);
        if (i === 0) return curr.rename('classification_' + year);
        var prev = ee.Image(acc).slice(-1);
        return ee.Image(acc).addBands(prev.where(curr.neq(7), curr).rename('classification_' + year));
    }, null));

    // Backward fill: classe 7 restante → valor do ano seguinte
    var desf_backward = ee.Image(years.slice().reverse().reduce(function (acc, year, i) {
        var curr = desf_forward.select('classification_' + year);
        if (i === 0) return curr.rename('classification_' + year);
        var next = ee.Image(acc).slice(0, 1);
        return ee.Image(acc).addBands(next.where(curr.neq(7), curr).rename('classification_' + year));
    }, null));

    // Combina: usa forward, e onde ainda há 7, usa backward
    var desf_reg_corrected = desf_forward.where(desf_forward.eq(7), desf_backward);

    return desf_reg_corrected;
};

/**
 * Cria classificação binária grass/forest a partir do LULC.
 * 1 = Campo (Formação Campestre)
 * 2 = Floresta (Formação Florestal + Savânica + Outras formações lenhosas)
 *
 * @param {ee.Image} lulc - Imagem do MapBiomas LULC com bandas classification_YYYY
 * @param {string[]} years - Lista de anos
 * @returns {ee.Image} - Imagem com bandas classification_YYYY (1 ou 2)
 */
exports.classifyGrassForest = function (lulc, years) {

    // Classes do MapBiomas que são floresta/lenhosa
    var forest_classes = [3, 4, 5, 6, 49];
    // Classes que são campo
    var grass_classes = [11, 12, 50, 29, 13];

    var grass_forest = ee.Image().select();

    years.forEach(function (y) {
        var lulc_y = lulc.select('classification_' + y);
        var gf_y = lulc_y.multiply(0);

        forest_classes.forEach(function (c) {
            gf_y = gf_y.where(lulc_y.eq(c), 2);
        });

        grass_classes.forEach(function (c) {
            gf_y = gf_y.where(lulc_y.eq(c), 1);
        });

        grass_forest = grass_forest.addBands(gf_y.rename('classification_' + y));
    });

    return grass_forest;
};

/**
 * Cria máscaras de vegetação primária por tipo de cobertura.
 *
 * @param {ee.Image} lulc - Imagem do MapBiomas LULC
 * @param {ee.Image} desf_reg_corrected - Imagem do desf_reg corrigido
 * @param {string[]} years - Lista de anos
 * @returns {Object} - { forest_mask, savanna_mask, grassland_mask }
 */
exports.createCoverageMasks = function (lulc, desf_reg_corrected, years) {

    var forest_mask = ee.Image().select();
    var savanna_mask = ee.Image().select();
    var grassland_mask = ee.Image().select();

    years.forEach(function (y) {
        var prim = desf_reg_corrected.select('classification_' + y).eq(2);
        var lulc_y = lulc.select('classification_' + y);

        // Forest: desf_reg == 2 AND lulc == 3 (Formação Florestal)
        var forest_y = prim.and(lulc_y.eq(3)).rename('classification_' + y);

        // Savanna: desf_reg == 2 AND lulc == 4 (Formação Savânica)
        var savanna_y = prim.and(lulc_y.eq(4)).rename('classification_' + y);

        // Grassland: desf_reg == 2 AND lulc IN [11, 12, 50]
        var grassland_y = prim.and(
            lulc_y.eq(11).or(lulc_y.eq(12)).or(lulc_y.eq(50))
        ).rename('classification_' + y);

        forest_mask = forest_mask.addBands(forest_y);
        savanna_mask = savanna_mask.addBands(savanna_y);
        grassland_mask = grassland_mask.addBands(grassland_y);
    });

    return {
        forest_mask: forest_mask,
        savanna_mask: savanna_mask,
        grassland_mask: grassland_mask
    };
};

/**
 * Cria máscara de área emersa (exclui pixels permanentemente submersos).
 *
 * @param {ee.Image} lulc - Imagem do MapBiomas LULC
 * @param {number} threshold - Número mínimo de anos como água para considerar permanente (default: 38)
 * @returns {ee.Image} - Máscara booleana (1 = emerso, 0 = permanentemente submerso)
 */
exports.createEmergentMask = function (lulc, threshold) {
    threshold = threshold || 38;
    var always_submerged = lulc.eq(33).reduce(ee.Reducer.sum()).gte(threshold);
    return always_submerged.not();
};

/**
 * Função principal que executa toda a preparação de dados.
 *
 * @param {Object} params - Parâmetros de entrada
 * @param {ee.Image} params.lulc - MapBiomas LULC
 * @param {ee.Image} params.desf_reg - MapBiomas Desf/Veg Sec
 * @param {string[]} params.years - Lista de anos
 * @param {number} params.submerged_threshold - Threshold para área emersa (default: 38)
 * @returns {Object} - { desf_reg_corrected, grass_forest, forest_mask, savanna_mask, grassland_mask, emergent_mask }
 */
exports.prepareAll = function (params) {

    var lulc = params.lulc;
    var desf_reg = params.desf_reg;
    var years = params.years;
    var submerged_threshold = params.submerged_threshold || 38;

    // 1. Corrige desf_reg
    var desf_reg_corrected = exports.correctDesfReg(desf_reg, years);

    // 2. Classifica grass/forest
    var grass_forest = exports.classifyGrassForest(lulc, years);

    // 3. Cria máscaras de cobertura
    var masks = exports.createCoverageMasks(lulc, desf_reg_corrected, years);

    // 4. Cria máscara de área emersa
    var emergent_mask = exports.createEmergentMask(lulc, submerged_threshold);

    return {
        desf_reg_corrected: desf_reg_corrected,
        grass_forest: grass_forest,
        forest_mask: masks.forest_mask,
        savanna_mask: masks.savanna_mask,
        grassland_mask: masks.grassland_mask,
        emergent_mask: emergent_mask
    };
};
