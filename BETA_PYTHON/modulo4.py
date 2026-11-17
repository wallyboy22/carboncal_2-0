"""M4 v02: stages Python que reproduzem o código JS local, sem exportar."""
import ee
from .common import spill, stack

YEARS = tuple(range(1986, 2025))
BIOMES = 'projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026'
PRET = 'projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2'
LULC = 'projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_coverage_v3'
EDGE = 'projects/ee-redd-brazil/assets/ybyra-br-model/edgesAge_mb_c101_390m_1986_2024_v2'
SF_AGE = 'projects/ee-redd-brazil/assets/ybyra-br-model/secondary_forest_age_collection10_1_v8_1'
LOGGING = 'projects/ee-redd-brazil/assets/ybyra-br-model/logging_frequency_v1'
FIRE = 'projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_annual_burned_v1'
TRANSITIONS = 'projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_deforestation_secondary_vegetation_by_coverage_v1'
LEGACY_DEFORESTATION = 'projects/ee-redd-brazil/assets/ybyra-br-model/deforestationAnnual_mb_c101_1986_2024_v2'
QCN = 'projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1'
B = 'projects/ee-ybyra-br-sf/assets/B_30m'
K = 'projects/ee-ybyra-br-sf/assets/K_30m'
ANNUAL_SOURCE = 'projects/ee-ipam/assets/CCAL/MODULO4/v04/emissions_removals_v04'  # v02 apagada em 2026-11-16
DEG_TYPES = ('loss_edge', 'loss_selective_logging', 'loss_fire',
             'loss_convergence_edge_logging', 'loss_convergence_edge_fire',
             'loss_convergence_logging_fire', 'loss_convergence_edge_logging_fire',
             'loss_convergence_degradation')


def convergence(edge, logging, fire, edge_mask, logging_mask, fire_mask):
    """Mesmo pixel/ano; reproduz máscaras e operações do Stage 00 JavaScript."""
    e, l, f = ee.Image(edge), ee.Image(logging), ee.Image(fire)
    em, lm, fm = ee.Image(edge_mask), ee.Image(logging_mask), ee.Image(fire_mask)
    el = em.And(lm).And(fm.Not())
    ef = em.And(fm).And(lm.Not())
    lf = lm.And(fm).And(em.Not())
    triple = em.And(lm).And(fm)
    a = e.add(l).updateMask(el)
    b = e.add(f).updateMask(ef)
    c = l.add(f).updateMask(lf)
    d = e.add(l).add(f).updateMask(triple)
    any_overlap = el.Or(ef).Or(lf).Or(triple)
    total = a.unmask(0).add(b.unmask(0)).add(c.unmask(0)).add(d.unmask(0)).updateMask(any_overlap)
    return {"edge_logging": a, "edge_fire": b, "logging_fire": c, "triple": d,
            "aggregate": total, "mask": any_overlap}


def correct_transitions(image, years):
    """Porta inclusive a ordem de bandas do backward fill JS; não altera método."""
    forward = []
    for year in years:
        current = image.select(f'classification_{year}')
        forward.append(current.rename(f'classification_{year}') if not forward else
                       forward[-1].where(current.neq(7), current).rename(f'classification_{year}'))
    fwd = stack(forward)
    backward = []
    for year in reversed(years):
        current = fwd.select(f'classification_{year}')
        # JS usa acc.slice(0, 1), que permanece a primeira banda adicionada.
        backward.append(current.rename(f'classification_{year}') if not backward else
                        backward[0].where(current.neq(7), current).rename(f'classification_{year}'))
    return fwd.where(fwd.eq(7), stack(backward))


def _constants():
    brazil = ee.FeatureCollection(BIOMES)
    forests = ee.Image(PRET).unmask(0).remap([1, 2], [1, 1], 0).clip(brazil)
    return {'brazil': brazil, 'forests': forests,
            'qcn': ee.ImageCollection(QCN).select('cagb').mosaic(),
            'b': ee.Image(B).clip(brazil), 'k': ee.Image(K).clip(brazil),
            'area': ee.Image.pixelArea().multiply(0.0001)}


def _corrected(last_year):
    """Transições corrigidas 1987..last_year (by_coverage: int(/100) = classe desf_reg 1-7)."""
    years = tuple(range(1987, last_year + 1))
    transitions = ee.Image(TRANSITIONS).select([f'classification_{y}' for y in years]).divide(100).int()
    return correct_transitions(transitions, years)


def _masked(image, c):
    return ee.Image(image).multiply(c['forests']).unmask(0).clip(c['brazil'])


def _sf_stock(sf_age, c):
    inner = ee.Image(1).subtract(c['b'].multiply(c['k'].multiply(sf_age).multiply(-1).exp()))
    return c['qcn'].multiply(inner.max(0).pow(1 / (1 - 0.67))).multiply(sf_age.gt(0))


def _observed_drivers(year, c, corrected):
    band = f'classification_{year}'
    def_raw = (ee.Image(LEGACY_DEFORESTATION).select(band).eq(100) if year == 1986
               else corrected.select(band).eq(4))
    return {'fire_mask': _masked(ee.Image(FIRE).select(f'burned_area_{year}').gt(0), c),
            'def_mask': _masked(def_raw, c),
            'age': _masked(ee.Image(EDGE).select(band), c),
            'logging_band': ee.Image(LOGGING).select(f'logging_freq_{year}').unmask(0).clip(c['brazil']),
            'sf_age': _masked(ee.Image(SF_AGE), c).select(band)}


def _year_step(year, agc, sf_prev, d, c, props=None):
    """Um ano do Stage 00 a partir do estado (agc, sf_prev) e dos drivers do ano.

    Retorna (imagem anual, agc atualizado, estoque secundário). Fonte única da
    matemática: usada pela série completa e pela extensão incremental.
    """
    area, forests = c['area'], c['forests']
    fire_mask, def_mask, age = d['fire_mask'], d['def_mask'], d['age']
    logging_band, sf_age = d['logging_band'], d['sf_age']
    edge_mask = age.gte(1)
    cumulative = age.multiply(22.518).divide(age.add(1.615).multiply(100))
    incremental = ee.Image(22.518 * 1.615).divide(age.add(1.615).multiply(age.add(0.615)).multiply(100))
    agc_edge = agc.multiply(ee.Image(1).subtract(cumulative.multiply(edge_mask)))
    edge_loss = agc.multiply(incremental.multiply(edge_mask)).multiply(44 / 12).multiply(area)
    logging_mask = logging_band.gt(0).multiply(forests).multiply(def_mask.Not())
    fraction = ee.Image(0.196).multiply(ee.Image(0.0782).multiply(logging_band.subtract(1)).multiply(-1).exp()).multiply(logging_mask)
    logging_loss = agc_edge.multiply(fraction).multiply(44 / 12).multiply(area)
    agc_post_logging = agc_edge.multiply(ee.Image(1).subtract(fraction))
    agc = agc.multiply(logging_mask.Not()).add(agc_post_logging.multiply(logging_mask))
    agc_post_fire = agc_edge.pow(1.4702).multiply(0.07816)
    fire_loss = agc_edge.subtract(agc_post_fire).multiply(44 / 12).multiply(area).multiply(fire_mask)
    agc = agc.multiply(fire_mask.Not()).add(agc_post_fire.multiply(fire_mask))
    pre_def = agc_post_fire.multiply(fire_mask).add(agc_edge.multiply(fire_mask.Not()))
    def_loss = pre_def.multiply(44 / 12).multiply(area).multiply(def_mask)
    agc = agc.multiply(def_mask.Not())
    sf_active = sf_age.gt(0)
    sf_stock = _sf_stock(sf_age, c)
    gain = sf_stock.subtract(sf_prev).multiply(sf_active).multiply(44 / 12).multiply(area)
    sf_def_mask = sf_prev.gt(0).And(sf_active.Not())
    sf_def = sf_prev.multiply(44 / 12).multiply(area).multiply(sf_def_mask)
    net = edge_loss.add(logging_loss).add(fire_loss).add(def_loss).add(sf_def).subtract(gain)
    total_stock = agc.add(sf_stock)
    conv = convergence(edge_loss, logging_loss, fire_loss,
                       edge_mask.And(edge_loss.gt(0)), logging_mask.And(logging_loss.gt(0)),
                       fire_mask.And(fire_loss.gt(0)))
    components = [('loss_edge', edge_loss), ('loss_selective_logging', logging_loss),
                  ('loss_fire', fire_loss), ('loss_deforestation', def_loss),
                  ('loss_deforestation_secondary', sf_def), ('gain_secondary_vegetation', gain)]
    bands = [im.rename(f'{name}_{year}') for name, im in components]
    bands += [net.rename(f'net_balance_{year}'), total_stock.rename(f'stock_{year}')]
    bands += [im.divide(area).rename(f'{name}_ha_{year}') for name, im in components]
    masks = [('mask_edge', edge_mask), ('mask_logging', logging_mask), ('mask_fire', fire_mask),
             ('mask_defor', def_mask), ('mask_sf', sf_active), ('mask_sf_defor', sf_def_mask),
             ('mask_sf_new', sf_age.eq(1)), ('agc0_state', agc), ('logging_n', logging_band), ('sf_age', sf_age)]
    bands += [im.rename(f'{name}_{year}') for name, im in masks]
    names = [('loss_convergence_degradation', 'aggregate'), ('loss_convergence_edge_logging', 'edge_logging'),
             ('loss_convergence_edge_fire', 'edge_fire'), ('loss_convergence_logging_fire', 'logging_fire'),
             ('loss_convergence_edge_logging_fire', 'triple')]
    bands += [conv[key].rename(f'{name}_{year}') for name, key in names]
    em, lm, fm = edge_mask.And(edge_loss.gt(0)), logging_mask.And(logging_loss.gt(0)), fire_mask.And(fire_loss.gt(0))
    masks_conv = [('mask_convergence', conv['mask']), ('mask_convergence_edge_logging', em.And(lm).And(fm.Not())),
                  ('mask_convergence_edge_fire', em.And(fm).And(lm.Not())),
                  ('mask_convergence_logging_fire', lm.And(fm).And(em.Not())),
                  ('mask_convergence_edge_logging_fire', em.And(lm).And(fm))]
    bands += [im.rename(f'{name}_{year}').unmask(0) for name, im in masks_conv]
    bands += [conv[key].divide(area).rename(f'{name}_ha_{year}') for name, key in names]
    properties = {'year': year, 'version': 'v02', 'module': 'CCAL_MODULO4',
                  'system:time_start': ee.Date.fromYMD(year, 1, 1).millis(),
                  'system:time_end': ee.Date.fromYMD(year, 12, 31).millis(),
                  'convergence_definition': 'exclusive same-pixel same-year combinations of edge, logging, fire'}
    properties.update(props or {})
    return stack(bands).set(properties).float(), agc, sf_stock


def stage00(end_year=2024):
    """Calcula de 1986 até end_year; retorna {ano: imagem}, sem export.

    A correção de transições consulta 1987–2024 como no JS, mesmo para anos
    menores, para preservar o comportamento do backward fill original.
    """
    if end_year not in YEARS:
        raise ValueError('end_year deve estar entre 1986 e 2024')
    c = _constants()
    lulc = ee.Image(LULC).select('classification_1985')
    baseline = lulc.eq(3).Or(lulc.eq(6)).multiply(c['forests'])
    corrected = _corrected(2024)
    agc = c['qcn'].multiply(baseline).clip(c['brazil'])
    sf_prev = ee.Image(0).clip(c['brazil'])
    output = {}
    for year in range(1986, end_year + 1):
        output[year], agc, sf_prev = _year_step(year, agc, sf_prev, _observed_drivers(year, c, corrected), c)
    return output


# --- Extensão incremental (.1) -------------------------------------------------
# Para anos sem borda, idade secundária ou logging publicados, os drivers são
# HIPÓTESES derivadas do ano anterior; fogo e desmatamento são sempre observados.
EDGE_MODES = ('advance', 'freeze')
SF_MODES = ('advance', 'advance_tr6', 'advance_tr6_new', 'freeze')


def _hypothesis_drivers(year, c, corrected, edge_mode, sf_mode, sf_age_prev):
    prev = year - 1
    d = {'fire_mask': _masked(ee.Image(FIRE).select(f'burned_area_{year}').gt(0), c),
         'def_mask': _masked(corrected.select(f'classification_{year}').eq(4), c),
         # Nenhum evento novo de logging considerado (não é observação de ausência).
         'logging_band': ee.Image(0).clip(c['brazil'])}
    age_prev = _masked(ee.Image(EDGE).select(f'classification_{prev}'), c)
    if edge_mode == 'freeze':
        d['age'] = age_prev
    elif edge_mode == 'advance':
        d['age'] = age_prev.add(age_prev.gte(1))
    else:
        raise ValueError(f'edge_mode deve ser um de {EDGE_MODES}')
    tr = corrected.select(f'classification_{year}')
    cover = ee.Image(TRANSITIONS).select(f'classification_{year}').mod(100)
    secondary = tr.eq(3).Or(tr.eq(5))
    # Regra empírica (2023→2024, 5 recortes): ~97% da área com idade continua +1.
    # tr==6 é desmatamento de vegetação secundária na C11; tr 3/5 secundária.
    existing = sf_age_prev.gt(0)
    if sf_mode == 'freeze':
        sf_age = sf_age_prev
    elif sf_mode == 'advance':
        sf_age = sf_age_prev.add(existing)
    elif sf_mode == 'advance_tr6':
        sf_age = sf_age_prev.add(1).multiply(existing).multiply(tr.neq(6))
    elif sf_mode == 'advance_tr6_new':
        new = existing.Not().And(secondary).And(cover.eq(3))
        sf_age = sf_age_prev.add(1).multiply(existing.Or(new)).multiply(tr.neq(6))
    else:
        raise ValueError(f'sf_mode deve ser um de {SF_MODES}')
    d['sf_age'] = _masked(sf_age, c)
    return d


def extend_year(year, annual_prev, edge_mode='advance', sf_mode='advance_tr6',
                observed=False, version=None):
    """Calcula `year` a partir do anual de `year - 1` (checkpoint agc0_state/sf_age).

    observed=True usa as fontes publicadas de borda/idade/logging do próprio ano
    (teste de regressão do checkpoint); False aplica as hipóteses `edge_mode`/`sf_mode`.
    """
    prev = year - 1
    c = _constants()
    im = ee.Image(annual_prev)
    agc = im.select(f'agc0_state_{prev}')
    sf_age_prev = im.select(f'sf_age_{prev}')
    sf_prev = _sf_stock(sf_age_prev, c)
    corrected = _corrected(year)
    if observed:
        d = _observed_drivers(year, c, corrected)
        props = {'extension': 'observed-drivers'}
    else:
        d = _hypothesis_drivers(year, c, corrected, edge_mode, sf_mode, sf_age_prev)
        props = {'extension': 'checkpoint+hypothesis', 'edge_mode': edge_mode, 'sf_mode': sf_mode,
                 'logging_mode': 'no-new-event'}
    props['checkpoint_year'] = prev
    if version:
        props['version'] = version
    image, _, _ = _year_step(year, agc, sf_prev, d, c, props)
    return image


def stage01(annual=None, years=YEARS):
    """Retorna imagens finais e subprodutos; default usa anuais v02 publicados."""
    years = tuple(years)
    annual = annual if annual is not None else {y: ee.Image(f'{ANNUAL_SOURCE}/{y}') for y in years}
    def band(prefix, y):
        return ee.Image(annual[y]).select(f'{prefix}_{y}')
    raw_agc = [band('agc0_state', y) for y in years]
    raw_def_mask = [band('mask_defor', y) for y in years]
    final = []
    densities = {}
    area = ee.Image.pixelArea().multiply(0.0001)
    for kind in DEG_TYPES:
        raw = [band(kind, y) for y in years]
        final += [img.updateMask(raw_agc[i].gt(0).And(raw_def_mask[i].Not()))
                  for i, img in enumerate(spill(raw))]
        densities[kind + '_t_ha'] = stack(raw).divide(area).float()
    for y in years:
        final += [band(prefix, y).selfMask() for prefix in
                  ('loss_deforestation', 'loss_deforestation_secondary', 'gain_secondary_vegetation', 'net_balance', 'stock')]
    lulc = ee.Image(LULC).select('classification_1985')
    reference = lulc.eq(3).Or(lulc.eq(6)).multiply(ee.Image(PRET).unmask(0).remap([1, 2], [1, 1], 0))
    was_def, was_deg = ee.Image(0), ee.Image(0)
    covers = []
    for i, year in enumerate(years):
        previous = raw_agc[i - 1] if i else raw_agc[i]
        primary = raw_agc[i].gt(0)
        def_year = previous.gt(0).And(raw_agc[i].eq(0))
        event = band('mask_edge', year).gt(0).Or(band('mask_logging', year).gt(0)).Or(band('mask_fire', year).gt(0))
        was_def = was_def.Or(def_year)
        was_deg = was_deg.Or(event)
        anthropic = reference.eq(0).Or(was_def.And(def_year.Not()))
        preserved = primary.And(was_deg.Not()).And(def_year.Not())
        degraded = primary.And(was_deg).And(def_year.Not())
        covers.append(ee.Image(0).where(anthropic, 1).where(preserved, 2).where(degraded, 3)
                      .where(def_year, 4).rename(f'land_cover_{year}'))
    densities['stock_tC_ha'] = stack([band('stock', y) for y in years]).float()
    return {'final': stack(final).float(), 'land_cover_masks': stack(covers).byte(),
            'densities': densities}
