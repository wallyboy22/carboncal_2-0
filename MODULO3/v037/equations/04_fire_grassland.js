/**
 * =============================================================================
 * PROJETO: CCAL - Módulo 3 (Emissões por Mudança de Uso e Degradação)
 * VERSÃO: v037
 * SCRIPT: 04_fire_grassland.js
 * DESCRIÇÃO: Reprodução fiel do modelo SEEG_13 para emissões por fogo em campos.
 *            Estima a liberação imediata de CH4, N2O, CO e NOX provenientes da
 *            combustão de gramíneas e biomassa herbácea.
 *            Saídas padronizadas em t/ha.
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
 * Calcula emissões por fogo em campos.
 * Retorna 4 imagens separadas: CH4, N2O, CO, NOX (todas em t/ha).
 *
 * @param {Object} params - Parâmetros de entrada
 * @param {ee.Image} params.annual_burned - Área queimada anual
 * @param {ee.Image} params.agb - AGB (tC/ha)
 * @param {ee.Image} params.cdw - CDW (tC/ha)
 * @param {ee.Image} params.litter - Litter (tC/ha)
 * @param {ee.Image} params.grassland_mask - Máscara de campo
 * @param {string[]} params.years - Lista de anos
 * @returns {Object} - { CH4: ee.Image, N2O: ee.Image, CO: ee.Image, NOX: ee.Image } (t/ha)
 */
exports.calcGrasslandFireEmissions = function (params) {

    var annual_burned = params.annual_burned;
    var agb = params.agb; var cdw = params.cdw; var litter = params.litter;
    var grassland_mask = params.grassland_mask;
    var years = params.years;

    var combf_fwd = 0.883;
    var combf_cwd = 0.331;

    var CH4_mosaic = ee.Image().select();
    var N2O_mosaic = ee.Image().select();
    var CO_mosaic = ee.Image().select();
    var NOX_mosaic = ee.Image().select();

    years.forEach(function (y) {
        var fire_y = annual_burned.select('.*_' + y);
        var mask_y = grassland_mask.select('.*_' + y);
        var pixel_mask = fire_y.multiply(mask_y);

        // comb_total = litter×0.883 + (agb+cdw)×0.331  [tC/ha]
        var comb_total = litter.multiply(combf_fwd)
            .add(agb.add(cdw).multiply(combf_cwd));

        // CH4, N2O, CO, NOX → t/ha via IPCC (×2000×EF/1e6)
        CH4_mosaic = CH4_mosaic.addBands(
            comb_total.multiply(pixel_mask).multiply(2000).multiply(2.3).divide(1e6).rename('CH4_t_ha_' + y).float()
        );
        N2O_mosaic = N2O_mosaic.addBands(
            comb_total.multiply(pixel_mask).multiply(2000).multiply(0.21).divide(1e6).rename('N2O_t_ha_' + y).float()
        );
        CO_mosaic = CO_mosaic.addBands(
            comb_total.multiply(pixel_mask).multiply(2000).multiply(65).divide(1e6).rename('CO_t_ha_' + y).float()
        );
        NOX_mosaic = NOX_mosaic.addBands(
            comb_total.multiply(pixel_mask).multiply(2000).multiply(3.9).divide(1e6).rename('NOX_t_ha_' + y).float()
        );
    });

    return {
        CH4: CH4_mosaic,
        N2O: N2O_mosaic,
        CO: CO_mosaic,
        NOX: NOX_mosaic
    };
};
