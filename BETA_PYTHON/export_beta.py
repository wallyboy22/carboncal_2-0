"""Exporta versões beta seguintes via Python, sem sobrescrever assets.

Recusa sobrescrita, cria apenas pastas necessárias e lista cada operação antes
de submeter. Por padrão é dry-run; use --submit para criar tarefas.
"""
import argparse
import ee
from . import auth, modulo1, modulo2, modulo3, modulo4
from .common import stack

ROOT = 'projects/ee-ipam/assets/CCAL'
TASK_PREFIX = 'WS_IPAM_CCAL-'
CRS = 'EPSG:4326'
TRANSFORM = [0.00026949458523585647, 0, -180, 0, -0.00026949458523585647, 90]
SCALE = 30
MAX_PIXELS = 1e13


def exists(asset_id):
    try:
        ee.data.getAsset(asset_id)
        return True
    except Exception:
        return False


def ensure_image_series(path, submit=True):
    """Série anual deve ser IMAGE_COLLECTION; FOLDER existente só gera aviso."""
    if not exists(path):
        if submit:
            ee.data.createAsset({'type': 'IMAGE_COLLECTION'}, path)
        return 'create'
    kind = ee.data.getAsset(path)['type']
    if kind == 'IMAGE_COLLECTION':
        return 'ok'
    print(f'AVISO: {path} existe como {kind}; a convenção para séries anuais é IMAGE_COLLECTION. '
          'Nada foi apagado. Migração exige recriação explícita.', flush=True)
    return kind.lower()


def ensure_folder(path, submit=True):
    if exists(path):
        return False
    if not submit:
        return False
    ee.data.createAsset({'type': 'FOLDER'}, path)
    return True


def ensure_collection(path, submit=True):
    """Cria ImageCollection, mas nunca converte um FOLDER existente."""
    if exists(path):
        kind = ee.data.getAsset(path)['type']
        if kind != 'IMAGE_COLLECTION':
            raise RuntimeError(f'{path} existe como {kind}, esperado IMAGE_COLLECTION')
        return False
    if not submit:
        return False
    ee.data.createAsset({'type': 'IMAGE_COLLECTION'}, path)
    return True


def assert_parent(asset_id):
    """Falha cedo se o pai não existir, evitando tarefas condenadas."""
    parent = asset_id.rsplit('/', 1)[0]
    try:
        kind = ee.data.getAsset(parent)['type']
    except Exception as exc:
        raise RuntimeError(f'pai ausente para {asset_id}: {parent}') from exc
    if kind not in ('FOLDER', 'IMAGE_COLLECTION'):
        raise RuntimeError(f'pai inválido para {asset_id}: {kind}')
    return kind


def copy_asset(src, dst, submit=True):
    if exists(dst):
        return ('skip', dst, 'já existe')
    if not submit:
        return ('plan', dst, src)
    ee.data.copyAsset(src, dst, False)
    return ('copy', dst, src)


def export_image(image, asset_id, description, pyramiding='median', submit=True, region=None):
    if exists(asset_id):
        return ('skip', asset_id, 'já existe')
    if not submit:
        return ('plan', asset_id, description)
    assert_parent(asset_id)
    task = ee.batch.Export.image.toAsset(
        image=ee.Image(image).float(), description=TASK_PREFIX + description, assetId=asset_id,
        region=region or ee.FeatureCollection('projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026').geometry().bounds(),
        crs=CRS, crsTransform=TRANSFORM, scale=SCALE, maxPixels=MAX_PIXELS,
        pyramidingPolicy={'.default': pyramiding})
    task.start()
    return ('task', asset_id, task.id)


def m1_intermediates(submit):
    """Exporta o Stage 00 completo do M1 para a pasta da versão v06."""
    out = ROOT + '/MODULO1/v06'
    ensure_folder(out, submit)
    biomes = ee.FeatureCollection('projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026')
    names = {'amz': 'Amazônia', 'cerr': 'Cerrado', 'pan': 'Pantanal',
             'pam': 'Pampa', 'caa': 'Caatinga', 'ma': 'Mata Atlântica'}
    data = modulo1.build_stage00(end_year=2024)
    results = []
    for key, image in data.items():
        prefix = key.split('_', 1)[0]
        bounds = biomes.filter(ee.Filter.eq('Bioma', names[prefix])).geometry().bounds()
        results.append(('export', f'{out}/{key}', 'M1_v06_' + key))
        if submit:
            results[-1] = export_image(image, f'{out}/{key}', 'M1_v06_' + key,
                                       'mean', submit, region=bounds)
    return out, results


def m1_operations():
    out = ROOT + '/MODULO1/v06'
    final_asset = out + '/ccal_02_brazil_modulo_1_frell_v6'
    # Lê os intermediários versionados na própria v06 (Stage 00 exportado).
    stage = modulo1.build_stage01(source=out, end=2024)
    ops = [('export', stage['final'], final_asset, 'CCAL_M1_v06_final', 'median')]
    for name, image in stage['densities'].items():
        ops.append(('export', image, f'{out}/{name}',
                    'CCAL_M1_v06_' + name, 'mode' if name == 'land_cover_masks' else 'mean'))
    return out, ops


def m4_intermediates(submit):
    """Exporta o Stage 00 do M4 (39 anuais) para a coleção v04. Não consolida."""
    out = ROOT + '/MODULO4/v04'
    annual_dst = out + '/emissions_removals_v04'
    results = []
    ensure_folder(out, submit)
    ensure_image_series(annual_dst, submit)
    annual = modulo4.stage00(end_year=2024)
    for year, image in annual.items():
        results.append(('export', f'{annual_dst}/{year}', 'CCAL_M4_v04_stage00_' + str(year)))
        if submit:
            results[-1] = export_image(image, f'{annual_dst}/{year}',
                                       'CCAL_M4_v04_stage00_' + str(year), 'mean', submit)
    return out, results


def m4_operations(submit):
    """Consolida Stage 01 relendo os anuais já exportados em MODULO4/v04."""
    out = ROOT + '/MODULO4/v04'
    annual_dst = out + '/emissions_removals_v04'
    results = []
    ensure_folder(out, submit)
    annual = {y: ee.Image(f'{annual_dst}/{y}') for y in range(1986, 2025)}
    stage = modulo4.stage01(annual=annual)
    for name, image in stage['densities'].items():
        results.append(('export', f'{out}/{name}', 'CCAL_M4_v04_' + name))
        if submit:
            results[-1] = export_image(image, f'{out}/{name}', 'CCAL_M4_v04_' + name,
                                       'mean', submit)
    results.append(('export', f'{out}/land_cover_masks', 'CCAL_M4_v04_land_cover_masks'))
    if submit:
        results[-1] = export_image(stage['land_cover_masks'], f'{out}/land_cover_masks',
                                   'CCAL_M4_v04_land_cover_masks', 'mode', submit)
    results.append(('export', f'{out}/CCAL_MODULO4-v04', 'CCAL_M4_v04_final'))
    if submit:
        results[-1] = export_image(stage['final'], f'{out}/CCAL_MODULO4-v04',
                                   'CCAL_M4_v04_final', 'median', submit)
    return out, results


def m3_operations(submit):
    src = ROOT + '/MODULO3/v038'  # operação histórica de 2026-11-05; v038 apagada em 2026-11-16
    out = ROOT + '/MODULO3/v039'
    results = []
    ensure_folder(out, submit)
    for name in ('desf_reg_corrected', 'forest_mask', 'savanna_mask', 'grassland_mask',
                 'grass_forest', 'secondary_veg_increment', 'fire_forest_CO2',
                 'fire_forest_CO2_gross', 'fire_forest_CH4', 'fire_forest_N2O',
                 'fire_forest_CO', 'fire_forest_NOX', 'fire_savanna_CO2',
                 'fire_savanna_CO2_gross', 'fire_savanna_CH4', 'fire_savanna_N2O',
                 'fire_savanna_CO', 'fire_savanna_NOX', 'fire_grassland_CH4',
                 'fire_grassland_N2O', 'fire_grassland_CO', 'fire_grassland_NOX',
                 'logging_forest_CO2', 'degradation_mask'):
        results.append(copy_asset(f'{src}/{name}', f'{out}/{name}', submit))
    stage = modulo3.stage03(end_year=2024)
    results.append(('export', f'{out}/CCAL_MODULO3-v039', 'CCAL_M3_v039_final'))
    if submit:
        results[-1] = export_image(stage['final'], f'{out}/CCAL_MODULO3-v039',
                                   'CCAL_M3_v039_final', 'median', submit)
    return out, results


def m2_operations(submit, end_year=2024):
    """Consolidado v04 calculado em memória; intermediários não são versionados."""
    out = ROOT + '/MODULO2/v04'
    ensure_folder(out, submit)
    stage = modulo2.stage01(end_year=end_year,
                            inputs=modulo2.stage00(end_year=end_year))
    results = [('export', f'{out}/CCAL_MODULO2-v04', 'CCAL_M2_v04_final')]
    if submit:
        results[-1] = export_image(stage['final'], f'{out}/CCAL_MODULO2-v04',
                                   'CCAL_M2_v04_final', 'median', submit)
    for name, image in stage['densities'].items():
        results.append(('export', f'{out}/{name}', 'CCAL_M2_v04_' + name))
        if submit:
            results[-1] = export_image(image, f'{out}/{name}', 'CCAL_M2_v04_' + name,
                                       'mode' if name == 'land_cover_masks' else 'mean', submit)
    results.append(('export', f'{out}/land_cover_masks', 'CCAL_M2_v04_land_cover_masks'))
    if submit:
        results[-1] = export_image(stage['land_cover_masks'], f'{out}/land_cover_masks',
                                   'CCAL_M2_v04_land_cover_masks', 'mode', submit)
    return out, results


M1_EXTENSION = {'base': 'v06', 'version': 'v06_1', 'year': 2025}
M1_BIOME_NAMES = {'amz': 'Amazônia', 'cerr': 'Cerrado', 'pan': 'Pantanal',
                  'pam': 'Pampa', 'caa': 'Caatinga', 'ma': 'Mata Atlântica'}


def m1_extension_operations(submit, cfg=M1_EXTENSION):
    """M1 .1 em duas fases (rode duas vezes):

    A) exporta as fatias `year` do Stage 00 por bioma (cadeia recalculada em memória);
    B) quando todas existirem, exporta consolidado completo e derivados, relendo
       base (até year-1) + fatias novas. Requer DeterAnoProdes_<year>_{fire,cs_disordered}.
    """
    base, version, year = cfg['base'], cfg['version'], cfg['year']
    src, out = f'{ROOT}/MODULO1/{base}', f'{ROOT}/MODULO1/{version}'
    ensure_folder(out, submit)
    tag = f'M1_{version}_'
    memory = modulo1.build_stage00(end_year=year)
    new_keys = sorted(k for k in memory if k.endswith(f'_{year}'))
    biomes = ee.FeatureCollection(modulo1.BIOMES)
    results = []
    missing = [k for k in new_keys if not exists(f'{out}/{k}')]
    if missing:
        for key in missing:
            region = biomes.filter(ee.Filter.eq('Bioma', M1_BIOME_NAMES[key.split('_')[0]])).geometry().bounds()
            if submit:
                results.append(export_image(memory[key], f'{out}/{key}', tag + key, 'mean', True, region=region))
            else:
                results.append(('plan', f'{out}/{key}', tag + key))
        results.append(('wait', f'{out}/CCAL_MODULO1-{version} + derivados',
                        'fase B após as fatias existirem (rode m1x de novo)'))
        return out, results
    keys = [a['name'].split('/')[-1] for a in ee.data.listAssets({'parent': src})['assets']]
    inputs = {k: ee.Image(f'{src}/{k}') for k in keys if k.split('_')[0] in modulo1.PREFIXES}
    inputs.update({k: ee.Image(f'{out}/{k}') for k in new_keys})
    stage = modulo1.build_stage01(source=src, end=year, inputs=inputs)
    props = {'version': version, 'base_version': base, 'extension_year': year,
             'extension_note': f'2016–{year - 1} relidos de MODULO1/{base}; {year}: PRODES {year} de '
                               'INPE/PRODES/ProdesBrasil24_AMZ_CER_PANT25 (Amazônia, Cerrado, Pantanal); '
                               f'base "desmatamento anual < 6,25 ha" sem {year}; DETER fogo e corte '
                               'desordenado em ano civil'}
    ops = [(stage['final'].set(props), f'{out}/CCAL_MODULO1-{version}', tag + 'final', 'median')]
    ops += [(img.set(props), f'{out}/{name}', tag + name, 'mode' if name == 'land_cover_masks' else 'mean')
            for name, img in stage['densities'].items()]
    for image, asset, description, pyramiding in ops:
        if exists(asset):
            results.append(('skip', asset, 'já existe'))
        elif submit:
            results.append(export_image(image, asset, description, pyramiding, True))
        else:
            results.append(('plan', asset, description))
    return out, results


M2_EXTENSION = {'base': 'v04', 'version': 'v04_1', 'year': 2025}


def m2_extension_operations(submit, cfg=M2_EXTENSION):
    """M2 .1: cadeia recalculada em memória até o ano novo; exporta consolidado e derivados.

    Histórico idêntico à versão base (verificado na grade de export). Requer os rasters
    DeterAnoProdes_<ano>_cs_* (deter_cs.py); se ausentes, são reconstruídos em memória.
    """
    base, version, year = cfg['base'], cfg['version'], cfg['year']
    out = f'{ROOT}/MODULO2/{version}'
    ensure_folder(out, submit)
    tag = f'CCAL_M2_{version}_'
    stage = modulo2.stage01(end_year=year, inputs=modulo2.stage00(end_year=year))
    props = {'version': version, 'base_version': base, 'extension_year': year,
             'extension_note': f'{year}: PRODES {year} de INPE/PRODES/ProdesBrasil24_AMZ_CER_PANT25 '
                               '(Amazônia, Cerrado, Pantanal; demais biomas sem PRODES '
                               f'{year}); base "desmatamento anual < 6,25 ha" sem {year}; '
                               'corte seletivo DETER em ano civil; fogo MapBiomas Col. 5.1'}
    ops = [(stage['final'].set(props), f'{out}/CCAL_MODULO2-{version}', f'{tag}final', 'median'),
           (stage['land_cover_masks'].set(props), f'{out}/land_cover_masks', f'{tag}land_cover_masks', 'mode')]
    ops += [(img.set(props), f'{out}/{name}', f'{tag}{name}', 'mean') for name, img in stage['densities'].items()]
    results = []
    for image, asset, description, pyramiding in ops:
        if exists(asset):
            results.append(('skip', asset, 'já existe'))
        elif submit:
            results.append(export_image(image, asset, description, pyramiding, True))
        else:
            results.append(('plan', asset, description))
    return out, results


M3_EXTENSION = {'base': 'v039', 'version': 'v039_1', 'year': 2025}


def m3_extension_operations(submit, cfg=M3_EXTENSION):
    """M3 .1: consolidado completo (histórico publicado + ano novo) e checkpoint interno.

    O checkpoint guarda a fatia do ano novo de cada intermediário e os estados internos
    (idade/estoque secundário, AGB/AGN do fogo florestal, AGB savana, logging, acumulados),
    para a extensão seguinte não precisar da cadeia inteira.
    """
    base, version, year = cfg['base'], cfg['version'], cfg['year']
    out = f'{ROOT}/MODULO3/{version}'
    ensure_folder(out, submit)
    tag = f'CCAL_M3_{version}_'
    inputs, memory = modulo3.extension_inputs(year, base=f'{ROOT}/MODULO3/{base}')
    stage = modulo3.stage03(year, inputs=inputs)
    props = {'version': version, 'base_version': base, 'extension_year': year,
             'extension_note': f'1985–{year - 1} relidos de MODULO3/{base} (idênticos); {year}: transição v5 '
                               '(classe 7 repete o ano anterior), cobertura C11, Fogo Col. 5.1; logging '
                               'MapBiomas sem dado: nenhum evento novo considerado'}
    slices = [ee.Image(inputs[name]).select([f'.*_{year}']).regexpRename('^', f'{name}__')
              for name in modulo3.PRODUCTS + modulo3.MASKS + ('desf_reg_corrected',)]
    checkpoint = stack(slices + [memory['state'], stage['state']]).set(props)
    ops = [(stage['final'].set(props), f'{out}/CCAL_MODULO3-{version}', f'{tag}final', 'median'),
           (checkpoint, f'{out}/checkpoint_{year}', f'{tag}checkpoint_{year}', 'mean')]
    results = []
    for image, asset, description, pyramiding in ops:
        if exists(asset):
            results.append(('skip', asset, 'já existe'))
        elif submit:
            results.append(export_image(image, asset, description, pyramiding, True))
        else:
            results.append(('plan', asset, description))
    return out, results


M4_EXTENSION = {'base': 'v04', 'version': 'v04_1', 'year': 2025,
                'edge_mode': 'advance', 'sf_mode': 'advance_tr6'}


def m4_extension_operations(submit, cfg=M4_EXTENSION):
    """M4 .1: anual do ano novo a partir do checkpoint + consolidado relendo os anuais base.

    Nada da versão base é alterado. O anual novo entra no consolidado em memória,
    então todas as tarefas podem ser submetidas juntas.
    """
    base, version, year = cfg['base'], cfg['version'], cfg['year']
    base_annual = f'{ROOT}/MODULO4/{base}/emissions_removals_{base}'
    out = f'{ROOT}/MODULO4/{version}'
    annual_dst = f'{out}/emissions_removals_{version}'
    ensure_folder(out, submit)
    ensure_collection(annual_dst, submit)
    tag = f'CCAL_M4_{version}_'
    new = modulo4.extend_year(year, ee.Image(f'{base_annual}/{year - 1}'), edge_mode=cfg['edge_mode'],
                              sf_mode=cfg['sf_mode'], version=version)
    years = tuple(range(1986, year + 1))
    annual = {y: ee.Image(f'{base_annual}/{y}') for y in years if y < year}
    annual[year] = new
    stage = modulo4.stage01(annual=annual, years=years)
    props = {'version': version, 'base_version': base, 'extension_year': year,
             'extension_edge_mode': cfg['edge_mode'], 'extension_sf_mode': cfg['sf_mode'],
             'extension_logging_mode': 'no-new-event',
             'extension_note': f'{year}: fogo e desmatamento observados; borda, idade secundária e logging '
                               f'são hipóteses a partir do checkpoint {year - 1}'}
    ops = [(new, f'{annual_dst}/{year}', f'{tag}stage00_{year}', 'mean'),
           (stage['final'].set(props), f'{out}/CCAL_MODULO4-{version}', f'{tag}final', 'median'),
           (stage['land_cover_masks'].set(props), f'{out}/land_cover_masks', f'{tag}land_cover_masks', 'mode')]
    ops += [(img.set(props), f'{out}/{name}', f'{tag}{name}', 'mean') for name, img in stage['densities'].items()]
    results = []
    for image, asset, description, pyramiding in ops:
        if exists(asset):
            results.append(('skip', asset, 'já existe'))
        elif submit:
            results.append(export_image(image, asset, description, pyramiding, True))
        else:
            results.append(('plan', asset, description))
    return out, results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--account-profile', default='workspace2')
    parser.add_argument('--modules', nargs='+', choices=['m1', 'm1i', 'm2', 'm3', 'm4', 'm4i', 'm4x', 'm2x', 'm3x', 'm1x'], required=True)
    parser.add_argument('--submit', action='store_true')
    args = parser.parse_args()
    ee.Initialize(credentials=auth.load(args.account_profile), project=args.project)
    print('Conta:', args.account_profile, '| modo:', 'SUBMETER' if args.submit else 'dry-run')
    all_results = []
    if 'm1x' in args.modules:
        print('\nM1 %s: extensão %d (fase A fatias / fase B consolidado)' % (
            M1_EXTENSION['version'], M1_EXTENSION['year']))
        out, results = m1_extension_operations(args.submit)
        all_results += results
    if 'm3x' in args.modules:
        print('\nM3 %s: extensão %d (histórico %s + ano novo)' % (
            M3_EXTENSION['version'], M3_EXTENSION['year'], M3_EXTENSION['base']))
        out, results = m3_extension_operations(args.submit)
        all_results += results
    if 'm2x' in args.modules:
        print('\nM2 %s: extensão %d (cadeia em memória)' % (
            M2_EXTENSION['version'], M2_EXTENSION['year']))
        out, results = m2_extension_operations(args.submit)
        all_results += results
    if 'm4x' in args.modules:
        print('\nM4 %s: extensão %d a partir do checkpoint %s' % (
            M4_EXTENSION['version'], M4_EXTENSION['year'], M4_EXTENSION['base']))
        out, results = m4_extension_operations(args.submit)
        all_results += results
    if 'm4i' in args.modules:
        print('\nM4 v04: exportando 39 anuais do Stage 00 (recomputado, correcao by_coverage)')
        out, results = m4_intermediates(args.submit)
        all_results += results
    if 'm4' in args.modules:
        print('\nM4 v04: consolidação Stage 01 relendo os anuais v04')
        out, results = m4_operations(args.submit)
        all_results += results
    if 'm3' in args.modules:
        print('\nM3 v039: cópia dos intermediários v038 + produto final corrigido')
        out, results = m3_operations(args.submit)
        all_results += results
    if 'm2' in args.modules:
        print('\nM2 v04: consolidado calculado em memória (sem intermediários versionados)')
        out, results = m2_operations(args.submit)
        all_results += results
    if 'm1' in args.modules:
        print('\nM1 v06: consolidação a partir dos intermediários versionados')
        out, ops = m1_operations()
        results = []
        for kind, image, asset, description, pyramiding in ops:
            if args.submit:
                results.append(export_image(image, asset, description, pyramiding, True))
            else:
                results.append(('plan', asset, description))
        all_results += results
    if 'm1i' in args.modules:
        print('\nM1 v06: exportando 166 intermediários do Stage 00')
        out, results = m1_intermediates(args.submit)
        all_results += results
    print('\nResumo:')
    for kind, target, detail in all_results:
        print(f'  {kind:5} {target}  <-  {detail}')
    counts = {}
    for kind, _, _ in all_results:
        counts[kind] = counts.get(kind, 0) + 1
    print('Totais:', counts)
    if not args.submit:
        print('\nDry-run: nenhuma alteração feita. Use --submit para executar.')


if __name__ == '__main__':
    # Grafos profundos (M3: 40 anos x 6 biomas) excedem a recursão padrão ao serializar.
    import sys
    import threading
    sys.setrecursionlimit(60000)
    threading.stack_size(256 * 1024 * 1024 - 4096)
    worker = threading.Thread(target=main)
    worker.start()
    worker.join()
