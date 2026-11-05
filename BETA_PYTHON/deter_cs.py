"""Reconstrói rasters binários de corte seletivo (ano civil) a partir do DETER.

Convenção confirmada contra os assets legados de 2023:
  cs_geometric  <- CLASSNAME == CS_GEOMETRICO
  cs_disordered <- CLASSNAME == CS_DESORDENADO
Saída: valor 1 onde há alerta, mascarado fora, EPSG:4674 e grade do legado.
"""
import argparse
import ee
from . import auth

ROOT = 'projects/ee-ipam/assets/CCAL/DATASETS/PRODES/PRODES_ANO_CIVIL'
TEMPLATE_LEGACY = ROOT + '/DeterAnoProdes_2023_cs_geometric'
TEMPLATE_2024 = ROOT + '/DeterAnoProdes_2024_cs_disordered'
TABLE = 'projects/ee-ipam/assets/INPE/DETER/deter-amz-public-2026out09'
CLASSES = {'geometric': 'CS_GEOMETRICO', 'disordered': 'CS_DESORDENADO'}
TASK_PREFIX = 'WS_IPAM_CCAL-'


def template_for(year):
    """2017–2023 usam a grade legada de ~30 m; 2024 usa a grade de ~10 m."""
    return TEMPLATE_2024 if year >= 2024 else TEMPLATE_LEGACY


def _polygons(year, kind, table=TABLE):
    if kind not in CLASSES:
        raise ValueError('kind deve ser geometric ou disordered')
    start = ee.Date.fromYMD(year, 1, 1).millis()
    end = ee.Date.fromYMD(year + 1, 1, 1).millis()
    return (ee.FeatureCollection(table)
            .filter(ee.Filter.eq('CLASSNAME', CLASSES[kind]))
            .filter(ee.Filter.gte('VIEW_DATE', start))
            .filter(ee.Filter.lt('VIEW_DATE', end))
            .map(lambda feature: feature.set('one', 1)))


def alert_bounds(year, kind, table=TABLE):
    """Extensão dos alertas; usada como região de export para não alocar a caixa toda."""
    return _polygons(year, kind, table).geometry().bounds()


def cs_mask(year, kind, table=TABLE, template=None):
    template = template or template_for(year)
    polygons = _polygons(year, kind, table)
    inside = (polygons.reduceToImage(['one'], ee.Reducer.max())
              .reproject(ee.Image(template).projection())
              .unmask(0, False).gt(0))
    return inside.selfMask().rename('b1')


def validate(year=2023, tile=None):
    """Compara máscara reconstruída com o raster legado na grade nativa."""
    for kind in CLASSES:
        legacy = ee.Image(f'{ROOT}/DeterAnoProdes_{year}_cs_{kind}').select(0).unmask(0, False).gt(0)
        built = cs_mask(year, kind).unmask(0, False).gt(0)
        region = ee.Geometry.Rectangle(tile, None, False) if tile else ee.Geometry.Rectangle(
            [-63.95, -15.67, -46.91, 1.18], None, False)
        scale = 30 if tile else 200
        stats = ee.Image.cat([
            legacy.And(built).rename('both'),
            legacy.And(built.Not()).rename('legacy_only'),
            built.And(legacy.Not()).rename('built_only')]).reduceRegion(
            ee.Reducer.sum().unweighted(), region, scale, maxPixels=2000000000).getInfo()
        both, only_l, only_b = stats['both'], stats['legacy_only'], stats['built_only']
        recall = both / (both + only_l) if both + only_l else None
        precision = both / (both + only_b) if both + only_b else None
        print(f'{year} {kind}: both={both} legacy_only={only_l} built_only={only_b} '
              f'recall={recall:.3f} precision={precision:.3f}' if recall is not None else f'{year} {kind}: sem eventos')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--account-profile', default='workspace2')
    parser.add_argument('--year', type=int, required=True)
    parser.add_argument('--kind', choices=list(CLASSES) + ['both'], default='both')
    parser.add_argument('--validate', action='store_true', help='compara reconstrução com o legado do mesmo ano')
    parser.add_argument('--tile', type=float, nargs=4, help='recorte para validação')
    parser.add_argument('--submit', action='store_true', help='exporta para a pasta de derivados')
    args = parser.parse_args()
    ee.Initialize(credentials=auth.load(args.account_profile), project=args.project)
    if args.validate:
        validate(args.year, args.tile)
        return
    kinds = list(CLASSES) if args.kind == 'both' else [args.kind]
    template = ee.Image(template_for(args.year))
    for kind in kinds:
        asset = f'{ROOT}/DeterAnoProdes_{args.year}_cs_{kind}'
        print('Destino:', asset)
        if not args.submit:
            print('  dry-run; use --submit para exportar')
            continue
        try:
            ee.data.getAsset(asset)
            print('  já existe; ignorado')
            continue
        except Exception:
            pass
        task = ee.batch.Export.image.toAsset(
            image=cs_mask(args.year, kind).toByte(), description=f'{TASK_PREFIX}DETER_CS_{args.year}_{kind}',
            assetId=asset, region=alert_bounds(args.year, kind).buffer(1000),
            crs='EPSG:4674', crsTransform=template.projection().getInfo()['transform'],
            maxPixels=1e13, pyramidingPolicy={'.default': 'mode'})
        task.start()
        print('  tarefa:', task.id)


if __name__ == '__main__':
    main()
