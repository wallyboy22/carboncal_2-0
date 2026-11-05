"""Exporta versões beta seguintes via Python, sem sobrescrever assets.

Recusa sobrescrita, cria apenas pastas necessárias e lista cada operação antes
de submeter. Por padrão é dry-run; use --submit para criar tarefas.
"""
import argparse
import ee
from . import auth, modulo1, modulo3, modulo4

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


def export_image(image, asset_id, description, pyramiding='median', submit=True):
    if exists(asset_id):
        return ('skip', asset_id, 'já existe')
    if not submit:
        return ('plan', asset_id, description)
    assert_parent(asset_id)
    task = ee.batch.Export.image.toAsset(
        image=ee.Image(image).float(), description=TASK_PREFIX + description, assetId=asset_id,
        region=ee.FeatureCollection('projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026').geometry().bounds(),
        crs=CRS, crsTransform=TRANSFORM, scale=SCALE, maxPixels=MAX_PIXELS,
        pyramidingPolicy={'.default': pyramiding})
    task.start()
    return ('task', asset_id, task.id)


def m1_operations():
    out = ROOT + '/MODULO1/v05'
    final_asset = out + '/ccal_02_brazil_modulo_1_frell_v5'
    inputs = modulo1.build_stage00(end_year=2024)
    stage = modulo1.build_stage01(end=2024, inputs=inputs)
    ops = [('export', stage['final'], final_asset, 'CCAL_M1_v05_final', 'median')]
    for name, image in stage['densities'].items():
        ops.append(('export', image, f'{out}/{name}',
                    'CCAL_M1_v05_' + name, 'mode' if name == 'land_cover_masks' else 'mean'))
    return out, ops


def m4_operations(submit):
    src_root = ROOT + '/MODULO4/v02'
    out = ROOT + '/MODULO4/v03'
    annual_src = src_root + '/emissions_removals_v02'
    annual_dst = out + '/emissions_removals_v03'
    results = []
    ensure_folder(out, submit)
    ensure_image_series(annual_dst, submit)
    for year in range(1986, 2025):
        results.append(copy_asset(f'{annual_src}/{year}', f'{annual_dst}/{year}', submit))
    stage = modulo4.stage01(annual={y: ee.Image(f'{annual_dst}/{y}') for y in range(1986, 2025)})
    for name, image in stage['densities'].items():
        results.append(('export', f'{out}/{name}', 'CCAL_M4_v03_' + name))
        if submit:
            results[-1] = export_image(image, f'{out}/{name}', 'CCAL_M4_v03_' + name,
                                       'mean', submit)
    results.append(('export', f'{out}/land_cover_masks', 'CCAL_M4_v03_land_cover_masks'))
    if submit:
        results[-1] = export_image(stage['land_cover_masks'], f'{out}/land_cover_masks',
                                   'CCAL_M4_v03_land_cover_masks', 'mode', submit)
    results.append(('export', f'{out}/CCAL_MODULO4-v03', 'CCAL_M4_v03_final'))
    if submit:
        results[-1] = export_image(stage['final'], f'{out}/CCAL_MODULO4-v03',
                                   'CCAL_M4_v03_final', 'median', submit)
    return out, results


def m3_operations(submit):
    src = ROOT + '/MODULO3/v038'
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--account-profile', default='workspace2')
    parser.add_argument('--modules', nargs='+', choices=['m1', 'm3', 'm4'], required=True)
    parser.add_argument('--submit', action='store_true')
    args = parser.parse_args()
    ee.Initialize(credentials=auth.load(args.account_profile), project=args.project)
    print('Conta:', args.account_profile, '| modo:', 'SUBMETER' if args.submit else 'dry-run')
    all_results = []
    if 'm4' in args.modules:
        print('\nM4 v03: cópia dos anuais + consolidação corrigida')
        out, results = m4_operations(args.submit)
        all_results += results
    if 'm3' in args.modules:
        print('\nM3 v039: cópia dos intermediários v038 + produto final corrigido')
        out, results = m3_operations(args.submit)
        all_results += results
    if 'm1' in args.modules:
        print('\nM1 v05: cálculo integral em Python + consolidação')
        out, ops = m1_operations()
        results = []
        for kind, image, asset, description, pyramiding in ops:
            if args.submit:
                results.append(export_image(image, asset, description, pyramiding, True))
            else:
                results.append(('plan', asset, description))
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
    main()
