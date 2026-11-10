"""M1: beta do Stage 01 v04; não inclui o cálculo Stage 00 por bioma."""
import ee
from .common import convergence_pair, spill, stack

PREFIXES = ("amz", "cerr", "pan", "pam", "caa", "ma")
SOURCE = "projects/ee-ipam/assets/CCAL/MODULO1/v04"
BIOMES = "projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026"


def build_stage00(end_year=2024):
    """Reproduz M1 v04 Stage 00 em imagens por bioma/ano; não exporta."""
    if not 2017 <= end_year <= 2024:
        raise ValueError('end_year deve estar entre 2017 e 2024')
    qcn = ee.ImageCollection('projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1').mosaic()
    large = ee.Image('users/celsojunior/prodes_brasil_2024_v20260407').unmask(0)
    small_raw = ee.Image('projects/ee-celsojunior/assets/yearly_deforestation_smaller_than_625ha_biome')
    small = small_raw.multiply(0)
    for original, target in zip([1,2,3,4,5,6,7,8,9], [16,23,24,20,19,18,22,17,21]):
        small = small.where(small_raw.eq(original), target)
    codes = large.blend(small)
    mapped = codes.multiply(0)
    for code in range(16, 25):
        mapped = mapped.where(codes.eq(code), 2000 + code)
    managed = ee.Image('projects/ee-ipam/assets/Managed_Land_Brazil').unmask(0)
    pret = ee.Image('projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2').unmask(0).remap([1,2],[1,1],0)
    raw = ee.Image('projects/ee-ipam/assets/REDD/prodes_brasil_2023').unmask(0)
    forest = pret.eq(1).And(codes.gte(2).And(codes.lte(16)).Not()).And(raw.eq(91).Or(raw.eq(101)).Not())
    biomes = ee.FeatureCollection(BIOMES)
    area = ee.Image.pixelArea().multiply(0.0001)
    eba_root = 'projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_'
    deter = 'projects/ee-ipam/assets/CCAL/DATASETS/PRODES/PRODES_ANO_CIVIL/DeterAnoProdes_'
    configs = [('Amazônia','amz',1.009),('Cerrado','cerr',0.995),('Pantanal','pan',1.002),
               ('Pampa','pam',0.966),('Caatinga','caa',1.019),('Mata Atlântica','ma',1.000)]
    output = {}
    for name, prefix, factor in configs:
        fc = biomes.filter(ee.Filter.eq('Bioma', name))
        mask = ee.Image().paint(fc).eq(0)
        state = {}
        for component, src, aux in [('agb','cagb','AB'),('bgb','cbgb','BB'),('dw','cdw','DW'),('litter','clitter','LI')]:
            source = qcn.select(src)
            if name == 'Amazônia':
                supplement = ee.Image(eba_root + aux + '_30m')
                source = source.blend(supplement.updateMask(supplement.gte(0)))
            state[component] = source.multiply(forest)
        layers = []
        if name == 'Amazônia':
            for y in range(2017, 2025):
                dis = ee.Image(deter + str(y) + '_cs_disordered').multiply(pret)
                # cs_disordered é esparso (EPSG:4674); zero-fill com footprint do pret.
                layers.append(pret.multiply(0).blend(dis))
            layers.append(ee.Image(0))
            logging = layers[0]
        def stock(year):
            return stack([state[c].rename(c) for c in ('agb','bgb','dw','litter')] +
                         [sum_images([state[c] for c in ('agb','bgb','dw','litter')]).rename('total')]).updateMask(mask).float()
        output[f'{prefix}_stock_carbon_2016'] = stock(2016)
        for year in range(2017, end_year + 1):
            def save(kind, im):
                output[f'{prefix}_{kind}_{year}'] = im.multiply(area).multiply(factor).rename('emission_tCO2e_pixel').updateMask(mask).float()
            if name == 'Amazônia':
                # fire é esparso (EPSG:4674); zero-fill com footprint do managed.
                fire = managed.multiply(0).blend(
                    ee.Image(deter + str(year) + '_fire').multiply(managed))
                above = state['agb'].add(state['dw']).add(state['litter'])
                save('emission_fire_co2', above.multiply(fire).multiply(0.368).multiply(44/12))
                save('emission_fire_ch4', above.multiply(fire).multiply(1/0.47).multiply(0.368).multiply(6.8).multiply(0.001).multiply(28))
                save('emission_fire_n2o', above.multiply(fire).multiply(1/0.47).multiply(0.368).multiply(0.2).multiply(0.001).multiply(265))
                for component in ('agb','dw','litter'):
                    state[component] = state[component].subtract(state[component].multiply(fire).multiply(0.368))
                fraction = logging.remap(list(range(11)), [0,0.29,0.27,0.26,0.22,0.22,0.22,0.22,0.22,0.22,0.22])
                loss = state['agb'].multiply(fraction)
                save('emission_sl_co2', loss.multiply(44/12))
                state['agb'] = state['agb'].subtract(loss)
                nxt = layers[year - 2017 + 1]
                logging = logging.add(nxt).multiply(nxt).multiply(pret)
            cut = mapped.eq(year).And(forest)
            total = sum_images([state[c] for c in ('agb','bgb','dw','litter')])
            co2 = total.multiply(cut).multiply(44/12)
            base = state['agb'].add(state['dw']).add(state['litter']).multiply(cut).multiply(1/0.47).multiply(0.379 if name == 'Cerrado' else 0.368)
            ch4 = base.multiply(6.8).multiply(0.001).multiply(28)
            n2o = base.multiply(0.2).multiply(0.001).multiply(265)
            post = {'amz':0.042, 'cerr':0.088}.get(prefix, 0)
            save('emission_def_co2', co2.multiply(1+post).add(ch4.add(n2o).multiply(post)))
            if name in ('Amazônia', 'Cerrado'):
                save('emission_def_ch4', ch4)
                save('emission_def_n2o', n2o)
            state = {key: value.multiply(cut.Not()) for key, value in state.items()}
            output[f'{prefix}_stock_carbon_{year}'] = stock(year)
    return output


def load(kind, year, prefix, source=SOURCE, inputs=None):
    key = f'{prefix}_{kind}_{year}'
    im = ee.Image(inputs[key]) if inputs is not None else ee.Image(f"{source}/{key}")
    return im.select("total") if kind == "stock_carbon" else im.select([0])


def mosaic(kind, year, prefixes, bounds, source=SOURCE, same_footprint=False, inputs=None):
    """Paridade com Stage 01 local corrigido; True reproduz footprint anterior."""
    result = ee.Image(0)
    for prefix in prefixes:
        result = result.add(load(kind, year, prefix, source, inputs).unmask(0, same_footprint))
    return result.clip(bounds)


def build_stage01(source=SOURCE, start=2017, end=2024, inputs=None):
    """Equivalente estrutural do Stage 01; destinos e exports não são gerados."""
    bounds = ee.FeatureCollection(BIOMES).geometry().bounds()
    years = list(range(start, end + 1))
    def mos(kind, year, prefixes):
        return mosaic(kind, year, prefixes, bounds, source, inputs=inputs)
    stocks = [mos("stock_carbon", start - 1, PREFIXES).rename(f"stock_{start - 1}")]
    fires, logs, defs, convs = [], [], [], []
    for y in years:
        fire = sum_images([mos("emission_fire_" + gas, y, ["amz"])
                           for gas in ("co2", "ch4", "n2o")]).rename(f"loss_fire_{y}")
        log = mos("emission_sl_co2", y, ["amz"]).rename(f"loss_selective_logging_{y}")
        de = sum_images([mos("emission_def_co2", y, PREFIXES),
                         mos("emission_def_ch4", y, ["amz", "cerr"]),
                         mos("emission_def_n2o", y, ["amz", "cerr"])])
        fires.append(fire); logs.append(log); defs.append(de.rename(f"loss_deforestation_{y}"))
        stocks.append(mos("stock_carbon", y, PREFIXES).rename(f"stock_{y}"))
        convs.append(convergence_pair(fire, log).rename(f"loss_convergence_degradation_{y}"))
    masked = []
    for group in (fires, logs, convs):
        masked.extend(img.updateMask(stocks[i + 1].gt(0)) for i, img in enumerate(spill(group)))
    final = stack(masked + [im.selfMask() for im in defs] + [im.selfMask() for im in stocks]).float()
    per_ha = {name: stack(items).divide(ee.Image.pixelArea().multiply(0.0001)).float()
              for name, items in (("loss_fire_t_ha", fires), ("loss_selective_logging_t_ha", logs),
                                  ("loss_convergence_degradation_t_ha", convs), ("loss_deforestation_t_ha", defs))}
    per_ha["stock_tC_ha"] = stack(stocks).float()
    reference = stocks[0].unmask(0).gt(0)
    was_deforested, was_degraded = ee.Image(0), ee.Image(0)
    land_cover = []
    for i, stock in enumerate(stocks):
        def_year, fire, logging = ee.Image(0), ee.Image(0), ee.Image(0)
        if i:
            def_year = stocks[i - 1].gt(0).And(stock.eq(0))
            fire, logging = fires[i - 1].gt(0), logs[i - 1].gt(0)
        was_deforested = was_deforested.Or(def_year)
        was_degraded = was_degraded.Or(fire).Or(logging)
        anthropic = reference.Not().Or(was_deforested.And(def_year.Not()))
        preserved = stock.gt(0).And(was_degraded.Not()).And(def_year.Not())
        degraded = stock.gt(0).And(was_degraded).And(def_year.Not())
        land_cover.append(ee.Image(0).where(anthropic, 1).where(preserved, 2)
                          .where(degraded, 3).where(def_year, 4)
                          .rename(f"land_cover_{start - 1 + i}"))
    per_ha["land_cover_masks"] = stack(land_cover).byte()
    return {"final": final, "densities": per_ha, "bounds": bounds,
            "note": "Stage 01 portado estruturalmente; paridade espacial não comprovada."}


def sum_images(images):
    result = ee.Image(images[0])
    for image in images[1:]:
        result = result.add(image)
    return result


def preview_stock(year=2024, source=SOURCE):
    """Diagnóstico: estoque somado e número de footprints válidos por bioma."""
    bounds = ee.FeatureCollection(BIOMES).geometry().bounds()
    count = ee.Image(0)
    for prefix in PREFIXES:
        count = count.add(load("stock_carbon", year, prefix, source).mask().unmask(0, False).gt(0))
    return (mosaic("stock_carbon", year, PREFIXES, bounds, source).rename("stock_tC_ha")
            .addBands(count.clip(bounds).rename("biome_valid_count"))
            .set({"module": "M1", "version": "v05-beta", "source_version": "v04",
                  "year": year, "product": "diagnostic_only", "validated_nationally": False}))
