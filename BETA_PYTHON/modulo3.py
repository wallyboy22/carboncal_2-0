"""M3 v038: preparação e balanço; Stage 1 ainda não portado integralmente."""
import ee
from .common import spill, stack
from .modulo4 import correct_transitions

BASE = 'projects/ee-ipam/assets/CCAL/MODULO3/v038'
LULC = 'projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_coverage_v3'
TRANSITIONS = 'projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_deforestation_secondary_vegetation_v4'
QCN = 'projects/ee-ipam/assets/SEEG/SEEG14/RETIFICACAO/c_rect_col11'
BIOMES = 'projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026'
FIRE = 'projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_annual_burned_v1'
FREQ = 'projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_fire_frequency_v1'
TSF = 'projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_time_after_fire_v1'
LOGGING = 'projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_degradation_logging_v2'


def stage00(end_year=2024):
    if not 1987 <= end_year <= 2024:
        raise ValueError('stage00 requer ano final entre 1987 e 2024')
    years = range(1985, end_year + 1)
    raw = ee.Image(TRANSITIONS)
    transitions = ee.Image(raw.select('classification_1987').rename('classification_1985'))
    transitions = transitions.addBands(raw.select('classification_1987').rename('classification_1986')).addBands(raw)
    corrected = correct_transitions(transitions, years)
    lulc = ee.Image(LULC)
    outputs = {'desf_reg_corrected': corrected}
    grass_forest, forest, savanna, grassland = [], [], [], []
    for year in years:
        lc = lulc.select(f'classification_{year}')
        gf = lc.multiply(0)
        for code in (3, 4, 5, 6, 49):
            gf = gf.where(lc.eq(code), 2)
        for code in (11, 12, 50, 29, 13):
            gf = gf.where(lc.eq(code), 1)
        primary = corrected.select(f'classification_{year}').eq(2)
        grass_forest.append(gf.rename(f'classification_{year}'))
        forest.append(primary.And(lc.eq(3)).rename(f'classification_{year}'))
        savanna.append(primary.And(lc.eq(4)).rename(f'classification_{year}'))
        grassland.append(primary.And(lc.eq(11).Or(lc.eq(12)).Or(lc.eq(50))).rename(f'classification_{year}'))
    outputs.update(grass_forest=stack(grass_forest), forest_mask=stack(forest),
                   savanna_mask=stack(savanna), grassland_mask=stack(grassland))
    return outputs


def stage01(end_year=2024, base=BASE, prepared=None):
    """Porta emissões, regeneração e degradação v038; sem exportação.

    Por padrão lê assets Stage 0. `prepared=stage00()` liga os grafos diretamente.
    O cálculo preserva convenções de sinal e máscaras JS mesmo quando questionadas.
    """
    if not 1988 <= end_year <= 2024:
        raise ValueError('stage01 requer ano final entre 1988 e 2024')
    years, fire_years, log_years = list(range(1985,end_year+1)), list(range(1986,end_year+1)), list(range(1988,end_year+1))
    data = prepared if prepared is not None else {name: ee.Image(base+'/'+name) for name in
        ('desf_reg_corrected','forest_mask','savanna_mask','grassland_mask','grass_forest')}
    transition, gf = data['desf_reg_corrected'], data['grass_forest']
    forest, savanna, grass = data['forest_mask'], data['savanna_mask'], data['grassland_mask']
    qcn = ee.Image(QCN); agb, cdw, litter, total = (qcn.select(k) for k in ('AGB','CDW','LITTER','TOTAL'))
    biomes = ee.FeatureCollection(BIOMES)
    fire, frequency, tsf = ee.Image(FIRE), ee.Image(FREQ), ee.Image(TSF)
    logging_src = ee.Image(LOGGING)
    rates = {'Amazônia':(1.1698,4.7841,1.7), 'Caatinga':(0.5928,2.4378,0.6),
             'Cerrado':(0.9484,3.8789,1.7), 'Mata Atlântica':(0.778,3.169,0.6),
             'Pampa':(0.734,2.9896,1.7), 'Pantanal':(0.9622,3.9159,1.7)}
    biome_masks = {name: ee.Image(0).paint(biomes.filter(ee.Filter.eq('Bioma',name)),1).eq(1) for name in rates}
    age, previous_stock, sec_out = ee.Image(0), ee.Image(0), []
    for year in years:
        sec = transition.select(f'classification_{year}').eq(3).Or(transition.select(f'classification_{year}').eq(5))
        group = gf.select(f'classification_{year}')
        age = age.add(1).multiply(sec)
        lt20, ge20 = age.lt(20).And(age.gt(0)), age.gte(20)
        increment = ee.Image(0).rename(f'sec_veg_increment_{year}')
        for name, (f_ge, f_lt, g_lt) in rates.items():
            bm = biome_masks[name]
            r = previous_stock.rename(f'sec_veg_increment_{year}')
            r = r.where(group.eq(2).And(lt20).And(bm), previous_stock.add(f_lt))
            r = r.where(group.eq(2).And(ge20).And(bm), previous_stock.add(f_ge))
            r = r.where(group.eq(1).And(lt20).And(bm), previous_stock.add(g_lt))
            r = r.where(group.eq(1).And(ge20).And(bm), previous_stock.add(0))
            increment = increment.where(bm.And(sec), r)
        increment = increment.updateMask(sec).where(increment.gt(total), total).float()
        sec_out.append(increment); previous_stock = increment

    # FATE florestal da equação v037, inclusive blend e atualização de carbono morto.
    lookup = [0,0.104,0.080,0.060,0.044,0.032,0.023,0.016,0.011,0.008,0.006,0.004,0.003,0.002,0.001,0.001,0.001] + [0]*22
    factors = {'Amazônia':(0.683,0.643), 'Caatinga':(0.983,0.719), 'Cerrado':(0.683,0.629),
               'Mata Atlântica':(0.683,0.643), 'Pampa':(0.683,0.629), 'Pantanal':(0.683,0.629)}
    forest_out = {key: [None]*len(fire_years) for key in ('CO2','CO2_gross','CH4','N2O','CO','NOX')}
    for biome, (fwd, cwd_s) in factors.items():
        prev_agb, prev_agn = ee.Image(0), ee.Image(0)
        bm = biome_masks[biome]
        for i, year in enumerate(fire_years):
            burned = fire.select(f'burned_area_{year}')
            freq = frequency.select(f'fire_frequency_1985_{year}').rename(f'burned_area_{year}')
            freq2 = burned.updateMask(freq.gte(2)).gte(1)
            time = burned.multiply(0).blend(tsf.select(f'time_after_fire_{year}'))
            rate = time.remap(list(range(39)), lookup)
            agb_update = agb.updateMask(time.eq(0)).blend(prev_agb)
            next_agb = agb_update.add(agb_update.multiply(rate.multiply(-1)))
            agn_input = agb_update.multiply(rate).add(agb_update.multiply(0.03))
            agn_update = litter.add(cdw).updateMask(time.eq(0)).blend(prev_agn)
            comb = ee.Image(0).blend(litter.multiply(fwd).updateMask(time.eq(0))).add(
                   ee.Image(0).blend(cdw.multiply(cwd_s).updateMask(time.eq(0))))
            repeated = ee.Image(0).blend(agn_update.multiply(1-0.757).multiply(fwd).updateMask(freq2)).add(
                       ee.Image(0).blend(agn_update.multiply(0.757).multiply(0.824).updateMask(freq2)))
            comb = comb.blend(repeated)
            next_agn = agn_update.add(agn_input).subtract(comb).multiply(1-0.19)
            balance = next_agb.subtract(agb_update).add(next_agn.subtract(agn_update))
            vals = {'CO2':comb.multiply(0.099).add(balance).multiply(-1),
                    'CO2_gross':comb.multiply(2000).multiply(1580).divide(1e6),
                    'CH4':comb.multiply(2000).multiply(6.8).divide(1e6),
                    'N2O':comb.multiply(2000).multiply(0.2).divide(1e6),
                    'CO':comb.multiply(2000).multiply(104).divide(1e6),
                    'NOX':comb.multiply(2000).multiply(1.6).divide(1e6)}
            for key, value in vals.items():
                value = value.float().updateMask(bm)
                forest_out[key][i] = value if forest_out[key][i] is None else forest_out[key][i].blend(value)
            prev_agb, prev_agn = next_agb, next_agn
    prefixes = {'CO2':'CO2_tC_ha','CO2_gross':'CO2_gross_t_ha','CH4':'CH4_t_ha',
                'N2O':'N2O_t_ha','CO':'CO_t_ha','NOX':'NOX_t_ha'}
    forest_images = {key: stack([im.rename(f'{prefixes[key]}_{y}').updateMask(forest.select(f'classification_{y}'))
                                   for im,y in zip(values,fire_years)]) for key,values in forest_out.items()}

    savanna_out = {key: [] for key in prefixes}
    grass_out = {key: [] for key in ('CH4','N2O','CO','NOX')}
    agb_current = agb
    gas_factors = {'CH4':2.3,'N2O':0.21,'CO':65,'NOX':3.9}
    for year in fire_years:
        burned = fire.select(f'burned_area_{year}')
        freq = frequency.select(f'fire_frequency_1985_{year}')
        time = tsf.select(f'time_after_fire_{year}')
        fc = ee.Image(0).where(freq.gte(1).And(freq.lt(3)),1).where(freq.gte(3).And(freq.lt(5)),2).where(freq.gte(5).And(freq.lt(7)),3).where(freq.gte(7),4)
        tc = ee.Image(0).where(time.gte(0).And(time.lt(4)),4).where(time.gte(4).And(time.lt(7)),3).where(time.gte(7).And(time.lt(10)),2).where(time.gte(10),1)
        sev = fc.add(tc)
        factor = ee.Image(0).where(sev.gte(2).And(sev.lte(3)),0.021).where(sev.gt(3).And(sev.lte(6)),-0.004).where(sev.gt(6),-0.02)
        sav_burned = burned.gt(0).And(savanna.select(f'classification_{year}').gt(0))
        combustion = litter.multiply(0.873).add(agb_current.multiply(0.26).multiply(0.873)).add(cdw.multiply(0.459))
        savanna_out['CO2'].append(agb_current.multiply(sav_burned).multiply(factor).rename(f'CO2_tC_ha_{year}').float())
        savanna_out['CO2_gross'].append(combustion.multiply(sav_burned).multiply(2000).multiply(1580).divide(1e6).rename(f'CO2_gross_t_ha_{year}').float())
        grass_comb = litter.multiply(0.883).add(agb.add(cdw).multiply(0.331))
        grass_pixel = burned.multiply(grass.select(f'classification_{year}'))
        for gas, ef in gas_factors.items():
            savanna_out[gas].append(combustion.multiply(sav_burned).multiply(2000).multiply(ef).divide(1e6).rename(f'{gas}_t_ha_{year}').float())
            grass_out[gas].append(grass_comb.multiply(grass_pixel).multiply(2000).multiply(ef).divide(1e6).rename(f'{gas}_t_ha_{year}').float())
        agb_current = agb_current.add(agb_current.multiply(sav_burned).multiply(factor).unmask(0))
    savanna_images = {key:stack(value) for key,value in savanna_out.items()}
    grass_images = {key:stack(value) for key,value in grass_out.items()}
    # JS stage1 uses ee.Image(1).paint(...,1).eq(1), reproduced without reinterpretation.
    amazon = ee.Image(1).paint(biomes.filter(ee.Filter.eq('Bioma','Amazônia')),1).eq(1)
    logging, cumulative, agb_updated = [], ee.Image(0), agb
    for year in log_years:
        event = logging_src.select(f'logging_{year}').unmask(0).gt(0).And(forest.select(f'classification_{year}').gt(0)).And(amazon)
        cumulative = cumulative.add(event.unmask(0))
        fraction = ee.Image(0.196).multiply(ee.Image(0.0782).multiply(cumulative.subtract(1)).multiply(-1).exp()).multiply(event)
        loss = agb_updated.multiply(fraction).rename(f'CO2_tC_ha_{year}').float()
        agb_updated = agb_updated.subtract(loss.unmask(0)); logging.append(loss)
    log_stack = stack(logging)
    accumulated, degradation = ee.Image(0), []
    for year in fire_years:
        ff = forest_images['CO2'].select(f'CO2_tC_ha_{year}').unmask(0)
        sf = savanna_images['CO2'].select(f'CO2_tC_ha_{year}').unmask(0)
        log = log_stack.select(f'CO2_tC_ha_{year}').unmask(0) if year >= 1988 else ee.Image(0)
        accumulated = accumulated.add(ff.lt(0).multiply(ff.abs())).add(sf.lt(0).multiply(sf.abs())).add(log.max(0))
        degradation.append(accumulated.gt(0).And(forest.select(f'classification_{year}').eq(1)).rename(f'degradation_{year}'))
    result = {'secondary_veg_increment':stack(sec_out), 'logging_forest_CO2':log_stack,
              'degradation_mask':stack(degradation)}
    result.update({f'fire_forest_{k}':v for k,v in forest_images.items()})
    result.update({f'fire_savanna_{k}':v for k,v in savanna_images.items()})
    result.update({f'fire_grassland_{k}':v for k,v in grass_images.items()})
    return result


def balance(end_year=2024, base=BASE, inputs=None):
    """Balanço Stage 2/3 com assets publicados ou imagens dos stages Python."""
    if not 1986 <= end_year <= 2024:
        raise ValueError('ano final deve estar entre 1986 e 2024')
    years = list(range(1985, end_year + 1))
    def get(name):
        return ee.Image(inputs[name]) if inputs is not None else ee.Image(base + '/' + name)
    desf = get('desf_reg_corrected')
    secondary = get('secondary_veg_increment')
    qcn = ee.Image(QCN)
    raw = []
    for year in years:
        transition = desf.select(f'classification_{year}')
        sec = secondary.select(f'sec_veg_increment_{year}').unmask(0)
        raw.append(ee.Image(0).where(transition.eq(2), qcn.select('TOTAL'))
                   .where(transition.eq(3).Or(transition.eq(5)), sec)
                   .rename(f'sec_veg_increment_{year}').float())
    images = {name: get(name) for name in
              ('fire_forest_CO2','fire_forest_CH4','fire_forest_N2O','fire_savanna_CO2',
               'fire_savanna_CH4','fire_savanna_N2O','fire_grassland_CH4',
               'fire_grassland_N2O','logging_forest_CO2')}
    outputs = {name: [] for name in ('biomass_stock','loss_fire','loss_logging',
                                      'loss_deforestation','gain_sec_veg','loss_grassland',
                                      'loss_convergence_degradation')}
    area, accum, past = ee.Image.pixelArea().divide(10000), ee.Image(0), raw[0]
    for i, year in enumerate(years[1:], 1):
        def input_band(asset, prefix):
            return images[asset].select(f'{prefix}_{year}').unmask(0)
        ffc = input_band('fire_forest_CO2','CO2_tC_ha')
        ffm = input_band('fire_forest_CH4','CH4_t_ha')
        ffn = input_band('fire_forest_N2O','N2O_t_ha')
        fsc = input_band('fire_savanna_CO2','CO2_tC_ha')
        fsm = input_band('fire_savanna_CH4','CH4_t_ha')
        fsn = input_band('fire_savanna_N2O','N2O_t_ha')
        fgm = input_band('fire_grassland_CH4','CH4_t_ha')
        fgn = input_band('fire_grassland_N2O','N2O_t_ha')
        log = input_band('logging_forest_CO2','CO2_tC_ha') if year >= 1988 else ee.Image(0)
        accum = accum.subtract(ffc).subtract(fsc).subtract(log).rename(f'accum_{year}')
        tr = desf.select(f'classification_{year}')
        updated = raw[i].where(tr.eq(2), raw[i].add(accum.unmask(0))).rename(f'stock_{year}').float()
        delta = past.subtract(updated)
        degradation = ffc.add(fsc).add(log)
        defor = delta.subtract(degradation).max(0).multiply(3.67).multiply(area).multiply(tr.eq(4).Or(tr.eq(6))).rename(f'loss_deforestation_{year}').float()
        gain = delta.min(0).abs().multiply(tr.eq(3).Or(tr.eq(5))).multiply(3.67).multiply(area).rename(f'gain_secondary_vegetation_{year}').float()
        ftotal = ffc.multiply(3.67).add(ffm.multiply(28)).add(ffn.multiply(265)).add(
            fsc.multiply(3.67).add(fsm.multiply(28)).add(fsn.multiply(265)))
        log_co2 = log.multiply(3.67)
        outputs['loss_fire'].append(ftotal.multiply(area).rename(f'loss_fire_{year}').float())
        outputs['loss_logging'].append(log_co2.multiply(area).rename(f'loss_selective_logging_{year}').float())
        outputs['loss_deforestation'].append(defor)
        outputs['gain_sec_veg'].append(gain)
        outputs['loss_grassland'].append(fgm.multiply(28).add(fgn.multiply(265)).multiply(area).selfMask().rename(f'loss_grassland_{year}').float())
        outputs['loss_convergence_degradation'].append(ftotal.add(log_co2).updateMask(ftotal.gt(0).And(log_co2.gt(0))).multiply(area).rename(f'loss_convergence_degradation_{year}').float())
        outputs['biomass_stock'].append(updated)
        past = updated
    return {key: stack(value) for key, value in outputs.items()}


def stage02(end_year=2024, base=BASE, inputs=None):
    return {'biomass_stock': balance(end_year, base, inputs)['biomass_stock']}


def stage03(end_year=2024, base=BASE, inputs=None):
    outputs = balance(end_year, base, inputs)
    years = list(range(1986, end_year + 1))
    transition = ee.Image(inputs['desf_reg_corrected']) if inputs is not None else ee.Image(base + '/desf_reg_corrected')
    stocks = [outputs['biomass_stock'].select(f'stock_{year}') for year in years]
    final = []
    for kind, prefix in [('loss_fire','loss_fire'), ('loss_logging','loss_selective_logging'),
                         ('loss_convergence_degradation','loss_convergence_degradation')]:
        images = [outputs[kind].select(f'{prefix}_{year}') for year in years]
        for i, image in enumerate(spill(images)):
            tr = transition.select(f'classification_{years[i]}')
            final.append(image.updateMask(stocks[i].gt(0).And(tr.neq(4)).And(tr.neq(6))))
    for key in ('loss_deforestation', 'gain_sec_veg', 'loss_grassland', 'biomass_stock'):
        final.append(outputs[key].selfMask())
    final_image = stack(final).updateMask(ee.Image(LULC).select('classification_1985').neq(0)).float()
    return {'final': final_image, **outputs}


def savanna_balance_diagnostic(agb, burned, factor, mode="parity"):
    """Compara convenção existente e hipótese: fluxo = -variação de estoque.

    Não portou a frequência, combustão, recorrência plurianual nem demais gases.
    A hipótese experimental não é validação metodológica.
    """
    if mode not in ("parity", "experimental"):
        raise ValueError("mode must be parity or experimental")
    delta = ee.Image(agb).multiply(ee.Image(burned)).multiply(ee.Image(factor))
    emitted = delta if mode == "parity" else delta.multiply(-1)
    return {"stock_delta_from_fire_equation": delta, "co2_tC_ha": emitted,
            "stock_delta_as_consumed_by_balance": emitted.multiply(-1),
            "difference": emitted.multiply(-1).subtract(delta)}
