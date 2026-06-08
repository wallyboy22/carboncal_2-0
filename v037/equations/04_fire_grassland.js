/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Emissões por Mudança de Uso e Degradação)
 * VERSÃO: v037
 * SCRIPT: 04_fire_grassland.js
 * DESCRIÇÃO: Cálculo simplificado de emissões por queima de biomassa campestre. 
 *            Estima a liberação imediata de CH4 e N2O proveniente da combustão de 
 *            gramíneas e biomassa herbácea em pastagens e campos nativos.
 *            Retorna 2 imagens separadas (CH4, N2O) em tCO₂e/ha.
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

// Constantes de conversão
var GWP_CH4 = 28;
var GWP_N2O = 265;

/**
 * Calcula emissões por fogo em campos.
 * Retorna 2 imagens separadas: CH4, N2O (em tCO₂e/ha).
 *
 * @param {Object} params - Parâmetros de entrada
 * @param {ee.Image} params.annual_burned - Área queimada anual
 * @param {ee.Image} params.agb - AGB (tC/ha)
 * @param {ee.Image} params.cdw - CDW (tC/ha)
 * @param {ee.Image} params.litter - Litter (tC/ha)
 * @param {ee.Image} params.grassland_mask - Máscara de campo
 * @param {string[]} params.years - Lista de anos
 * @returns {Object} - { CH4: ee.Image, N2O: ee.Image } (tCO₂e/ha)
 */
exports.calcGrasslandFireEmissions = function (params) {

    var annual_burned = params.annual_burned;
    var agb = params.agb; var cdw = params.cdw; var litter = params.litter;
    var grassland_mask = params.grassland_mask;
    var years = params.years;

    var combf = 0.883;

    var CH4_mosaic = ee.Image().select();
    var N2O_mosaic = ee.Image().select();

    years.forEach(function (y) {
        var fire_y = annual_burned.select('.*_' + y);
        var mask_y = grassland_mask.select('.*_' + y);
        var comb_total = litter.add(agb).add(cdw).multiply(combf);
        var pixel_mask = fire_y.multiply(mask_y);

        // CH4: t/ha → tCO₂e/ha (× 28)
        var ch4_t = comb_total.multiply(2000).multiply(2.3).divide(1e6).multiply(pixel_mask);
        var ch4_CO2e = ch4_t.multiply(GWP_CH4).rename(y);

        // N2O: t/ha → tCO₂e/ha (× 265)
        var n2o_t = comb_total.multiply(2000).multiply(0.21).divide(1e6).multiply(pixel_mask);
        var n2o_CO2e = n2o_t.multiply(GWP_N2O).rename(y);

        CH4_mosaic = CH4_mosaic.addBands(ch4_CO2e);
        N2O_mosaic = N2O_mosaic.addBands(n2o_CO2e);
    });

    return {
        CH4: CH4_mosaic,
        N2O: N2O_mosaic
    };
};
