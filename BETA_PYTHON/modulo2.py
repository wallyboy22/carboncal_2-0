"""M2 v03: resposta savânica ao fogo, port parcial para testes de sinal."""
import ee
from .common import convergence_pair, spill, stack

SOURCE = 'projects/ee-ipam/assets/CCAL/MODULO2/v03/model_assets'


def stage00(end_year=2024):
    """Cálculo v03 para florestas/savanas, com os mesmos inputs e sinais do JS.

    Retorna imagens anuais nomeadas; não submete tarefas. A entrada DETER
    geométrica 2024 ausente permanece obrigatória e não recebe substituição.
    """
    if not 2017 <= end_year <= 2024:
        raise ValueError('end_year deve estar entre 2017 e 2024')
    qcn = ee.ImageCollection('projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1').mosaic()
    aoi = ee.FeatureCollection('projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026').geometry().bounds()
    cf = ee.Image('projects/ee-ipam/assets/BRAZIL_CF_BIOMES_QCN_FREL')
    pret = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2').unmask(0)
    large = ee.Image('users/celsojunior/prodes_brasil_2024_v20260407').unmask(0)
    small_raw = ee.Image('projects/ee-celsojunior/assets/yearly_deforestation_smaller_than_625ha_biome')
    small = small_raw.multiply(0)
    for original, target in zip([1,2,3,4,5,6,7,8,9], [16,23,24,20,19,18,22,17,21]):
        small = small.where(small_raw.eq(original), target)
    codes = large.blend(small)
    mapped = codes.multiply(0)
    for code in range(16, 25):
        mapped = mapped.where(codes.eq(code), 2000 + code)
    raw = ee.Image('projects/ee-ipam/assets/REDD/prodes_brasil_2023').unmask(0)
    nonvegetation = raw.eq(91).Or(raw.eq(101))
    exclusion = codes.gte(2).And(codes.lte(16)).Not().And(nonvegetation.Not())
    fire = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_annual_burned_v1')
    frequency = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_fire_frequency_v1')
    tsf = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_time_after_fire_v1')
    deter = 'projects/ee-ipam/assets/CCAL/DATASETS/PRODES/PRODES_ANO_CIVIL/DeterAnoProdes_'
    eba = 'projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_'
    area = ee.Image.pixelArea().multiply(0.0001)
    result = {}
    for is_forest, prefix in ((True, 'florestas'), (False, 'savanas')):
        vegetation = pret.eq(1 if is_forest else 2)
        mask = vegetation.And(exclusion)
        compartments = []
        for src, dst in [('cagb','AB'), ('cbgb','BB'), ('cdw','DW'), ('clitter','LI')]:
            aux = ee.Image(eba + dst + '_30m')
            compartments.append(qcn.select(src).blend(aux.updateMask(aux.gte(0))).multiply(mask))
        agb, bgb, dw, litter = compartments
        layers = []
        # JS carrega a janela completa de 2017–2024 independentemente de end_year.
        for y in range(2017, 2025):
            dis = ee.Image(deter + str(y) + '_cs_disordered').multiply(vegetation).clip(aoi)
            geo = ee.Image(deter + str(y) + '_cs_geometric').multiply(vegetation).clip(aoi)
            layers.append(ee.Image(0).clip(aoi).blend(dis).blend(geo))
        layers.append(ee.Image(0).clip(aoi))
        logging = layers[0]
        agb26 = agb.multiply(0.26)
        result[f'{prefix}_stock_2016'] = agb.add(bgb).add(dw).add(litter).float()
        for year in range(2017, end_year + 1):
            burnt = fire.select(f'burned_area_{year}').gt(0).multiply(mask).unmask(0)
            cut = mapped.eq(year).And(mask)
            frac = logging.remap(list(range(11)), [0,0.29,0.27,0.26,0.22,0.22,0.22,0.22,0.22,0.22,0.22], 0)
            sl = agb.multiply(frac)
            def save(name, image):
                result[f'{prefix}_{name}_{year}'] = image.float()
            if is_forest:
                above = agb.add(dw).add(litter)
                co2 = agb.multiply(burnt).multiply(cf)
                ch4 = above.multiply(burnt).multiply(1/0.47).multiply(cf).multiply(6.8).multiply(0.001)
                n2o = above.multiply(burnt).multiply(1/0.47).multiply(cf).multiply(0.2).multiply(0.001)
                save('fire_co2_loss_comb', co2.multiply(area).multiply(44/12))
                save('fire_ch4_loss_comb', ch4.multiply(area).multiply(28))
                save('fire_n2o_loss_comb', n2o.multiply(area).multiply(265))
                agb = agb.subtract(agb.multiply(burnt).multiply(cf))
                dw = dw.subtract(dw.multiply(burnt).multiply(cf))
                litter = litter.subtract(litter.multiply(burnt).multiply(cf))
            else:
                response = savanna_response(agb, burnt, frequency.select(f'fire_frequency_1985_{year}'),
                                             tsf.select(f'time_after_fire_{year}'))
                co2 = litter.multiply(burnt).multiply(0.873).multiply(44/12).add(dw.multiply(burnt).multiply(0.459).multiply(44/12))
                fuel = litter.multiply(burnt).multiply(0.873).add(agb26.multiply(burnt).multiply(0.873)).add(dw.multiply(burnt).multiply(0.459))
                ch4 = fuel.multiply(1/0.47).multiply(6.8).multiply(0.001)
                n2o = fuel.multiply(1/0.47).multiply(0.2).multiply(0.001)
                save('fire_co2_loss_comb', co2.multiply(area))
                save('fire_ch4_loss_comb', ch4.multiply(area).multiply(28))
                save('fire_n2o_loss_comb', n2o.multiply(area).multiply(265))
                save('fire_co2_loss_late', response['loss_co2_t_ha'].multiply(area))
                save('fire_co2_gain_late', response['gain_co2_t_ha'].multiply(area))
                agb = response['stock_tC_ha']
                agb26 = agb.multiply(0.26)
            save('sl_co2_loss_other', sl.multiply(area).multiply(44/12))
            agb = agb.subtract(sl)
            nxt = layers[year - 2017 + 1]
            logging = logging.add(nxt).multiply(nxt).clip(aoi)
            total = agb.add(bgb).add(dw).add(litter)
            def_co2 = total.multiply(cut).multiply(area).multiply(44/12)
            base = agb.add(dw).add(litter).multiply(cut).multiply(1/0.47).multiply(0.368)
            save('def_co2_loss_other', def_co2)
            save('def_ch4_loss_comb', base.multiply(6.8).multiply(0.001).multiply(area).multiply(28))
            save('def_n2o_loss_comb', base.multiply(0.2).multiply(0.001).multiply(area).multiply(265))
            agb, bgb, dw, litter = (im.multiply(cut.Not()) for im in (agb, bgb, dw, litter))
            save('stock', agb.add(bgb).add(dw).add(litter))
    return result


def savanna_response(agb, fire, frequency, time_since_fire, mode="parity"):
    """Paridade com M2 v03 corrigido. Não implementa combustão ou Stage 00 inteiro."""
    if mode not in ("parity", "legacy_sign"):
        raise ValueError("mode must be parity or legacy_sign")
    agb, fire = ee.Image(agb), ee.Image(fire)
    freq, tsf = ee.Image(frequency), ee.Image(time_since_fire)
    fc = (ee.Image(0).where(freq.gte(1).And(freq.lt(3)), 1)
          .where(freq.gte(3).And(freq.lt(5)), 2).where(freq.gte(5).And(freq.lt(7)), 3)
          .where(freq.gte(7), 4))
    tc = (ee.Image(0).where(tsf.gte(0).And(tsf.lt(4)), 4)
          .where(tsf.gte(4).And(tsf.lt(7)), 3).where(tsf.gte(7).And(tsf.lt(10)), 2)
          .where(tsf.gte(10), 1))
    severity = fc.add(tc)
    factor = (ee.Image(0).where(severity.gte(2).And(severity.lte(3)), 0.021)
              .where(severity.gt(3).And(severity.lte(6)), -0.004)
              .where(severity.gt(6), -0.02))
    delta = agb.multiply(fire).multiply(factor)
    signed_co2_ha = delta.multiply((-44 if mode == "parity" else 44) / 12)
    return {"factor": factor, "delta_stock_tC_ha": delta, "stock_tC_ha": agb.add(delta.unmask(0)),
            "signed_co2_t_ha": signed_co2_ha, "loss_co2_t_ha": signed_co2_ha.max(0),
            "gain_co2_t_ha": signed_co2_ha.min(0)}


def stage01(source=SOURCE, end_year=2024, inputs=None):
    """Síntese v03, anos 2017–end_year; falha se qualquer entrada não existir."""
    if not 2017 <= end_year <= 2024:
        raise ValueError('end_year deve estar entre 2017 e 2024')
    years = list(range(2017, end_year + 1))
    def load(name):
        im = ee.Image(inputs[name]) if inputs is not None else ee.Image(f'{source}/{name}')
        return im.select([0]).unmask(0)
    def sum_components(names, year):
        images = [load(f'{name}_{year}') for name in names]
        result = images[0]
        for im in images[1:]:
            result = result.add(im)
        return result
    stock, fire, logging, deforestation, conv = [], [], [], [], []
    for year in range(2016, end_year + 1):
        stock.append(sum_components(['florestas_stock', 'savanas_stock'], year).rename(f'stock_{year}'))
    fire_names = ['florestas_fire_co2_loss_comb', 'florestas_fire_ch4_loss_comb',
                  'florestas_fire_n2o_loss_comb', 'savanas_fire_co2_loss_comb',
                  'savanas_fire_ch4_loss_comb', 'savanas_fire_n2o_loss_comb',
                  'savanas_fire_co2_loss_late', 'savanas_fire_co2_gain_late']
    def_names = [f'{biome}_def_{gas}_{kind}' for biome in ('florestas', 'savanas')
                 for gas, kind in (('co2', 'loss_other'), ('ch4', 'loss_comb'), ('n2o', 'loss_comb'))]
    for year in years:
        f = sum_components(fire_names, year).rename(f'loss_fire_{year}')
        log = sum_components(['florestas_sl_co2_loss_other', 'savanas_sl_co2_loss_other'], year).rename(f'loss_selective_logging_{year}')
        fire.append(f); logging.append(log)
        deforestation.append(sum_components(def_names, year).rename(f'loss_deforestation_{year}'))
        conv.append(convergence_pair(f, log).rename(f'loss_convergence_degradation_{year}'))
    final_deg = []
    for group in (fire, logging, conv):
        final_deg += [im.updateMask(stock[i + 1].gt(0)) for i, im in enumerate(spill(group))]
    final = stack(final_deg + [im.selfMask() for im in deforestation] + [im.selfMask() for im in stock])
    final = final.set({'module': 'CCAL_MODULO2', 'version': 'v03'}).float()
    reference = stock[0].unmask(0).gt(0)
    was_def, was_degraded = ee.Image(0), ee.Image(0)
    covers = []
    for i, year in enumerate(years):
        current, previous = stock[i + 1], stock[i]
        def_year = previous.gt(0).And(current.eq(0))
        degradation = fire[i].neq(0).Or(logging[i].gt(0))
        was_def = was_def.Or(def_year)
        was_degraded = was_degraded.Or(degradation)
        anthropic = reference.eq(0).Or(was_def.And(def_year.Not()))
        preserved = current.gt(0).And(was_degraded.Not()).And(def_year.Not())
        degraded = current.gt(0).And(was_degraded).And(def_year.Not())
        covers.append(ee.Image(0).where(anthropic, 1).where(preserved, 2).where(degraded, 3)
                      .where(def_year, 4).rename(f'land_cover_{year}'))
    area = ee.Image.pixelArea().multiply(0.0001)
    densities = {name: stack(group).divide(area).float() for name, group in
                 [('loss_fire_t_ha', fire), ('loss_selective_logging_t_ha', logging),
                  ('loss_convergence_degradation_t_ha', conv), ('loss_deforestation_t_ha', deforestation)]}
    densities['stock_tC_ha'] = stack(stock).float()
    return {'final': final, 'land_cover_masks': stack(covers).byte(), 'densities': densities}
