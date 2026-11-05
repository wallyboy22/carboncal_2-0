"""Inspeciona uma banda de um stage Python com reduceRegion; não exporta."""
import argparse
import json
import ee
from . import auth, modulo1, modulo2, modulo3, modulo4


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--stage', required=True, choices=['m1-stage00', 'm1-stage01', 'm2-stage00', 'm2-stage01', 'm3-stage00', 'm3-stage01', 'm3-stage02', 'm3-stage03', 'm4-stage00', 'm4-stage01'])
    parser.add_argument('--product', default='final', help='final, land_cover_masks, nome de densidade ou chave de imagem M2 stage00')
    parser.add_argument('--year', type=int, default=2024, help='ano final do cálculo, inclusive anos anteriores para estado')
    parser.add_argument('--band', required=True)
    parser.add_argument('--bounds', type=float, nargs=4, required=True, metavar=('WEST', 'SOUTH', 'EAST', 'NORTH'))
    grid = parser.add_mutually_exclusive_group(required=True)
    grid.add_argument('--scale', type=float, help='resolução em metros')
    grid.add_argument('--transform', type=float, nargs=6, help='transformação afim da grade de referência')
    parser.add_argument('--crs', default='EPSG:4326', help='projeção comum para todos os reducers')
    parser.add_argument('--max-pixels', type=int, default=1000000)
    parser.add_argument('--pipeline', action='store_true', help='encadear os stages Python anteriores em vez de ler intermediários exportados')
    parser.add_argument('--reference-asset', help='asset existente para comparar valores e máscaras')
    parser.add_argument('--reference-band', help='banda de referência; por padrão usa --band')
    parser.add_argument('--tolerance', type=float, default=1e-5, help='tolerância absoluta por pixel na comparação')
    parser.add_argument('--account-profile', help='perfil de credencial isolada (ex.: workspace2); não altera a autenticação geral')
    args = parser.parse_args()
    west, south, east, north = args.bounds
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90 and (args.scale is None or args.scale > 0) and args.max_pixels > 0 and args.tolerance >= 0):
        parser.error('bounds, scale ou max-pixels inválidos')
    if args.account_profile:
        ee.Initialize(credentials=auth.load(args.account_profile), project=args.project)
    else:
        ee.Initialize(project=args.project)
    if args.stage == 'm1-stage00':
        stage = modulo1.build_stage00(end_year=args.year)
    elif args.stage == 'm1-stage01':
        inputs = modulo1.build_stage00(end_year=args.year) if args.pipeline else None
        stage = modulo1.build_stage01(end=args.year, inputs=inputs)
    elif args.stage == 'm2-stage00':
        stage = modulo2.stage00(end_year=args.year)
    elif args.stage == 'm2-stage01':
        inputs = modulo2.stage00(end_year=args.year) if args.pipeline else None
        stage = modulo2.stage01(end_year=args.year, inputs=inputs)
    elif args.stage == 'm3-stage00':
        stage = modulo3.stage00(end_year=args.year)
    elif args.stage == 'm3-stage01':
        prepared = modulo3.stage00(end_year=args.year) if args.pipeline else None
        stage = modulo3.stage01(end_year=args.year, prepared=prepared)
    elif args.stage == 'm3-stage02':
        inputs = None
        if args.pipeline:
            inputs = modulo3.stage00(end_year=args.year)
            inputs.update(modulo3.stage01(end_year=args.year, prepared=inputs))
        stage = modulo3.stage02(end_year=args.year, inputs=inputs)
    elif args.stage == 'm3-stage03':
        inputs = None
        if args.pipeline:
            inputs = modulo3.stage00(end_year=args.year)
            inputs.update(modulo3.stage01(end_year=args.year, prepared=inputs))
        stage = modulo3.stage03(end_year=args.year, inputs=inputs)
    elif args.stage == 'm4-stage00':
        stage = modulo4.stage00(end_year=args.year)
        stage = {'final': stage[args.year]}
    else:
        # Stage 01 de referência sempre inicia em 1986 para preservar spill.
        if not 1986 <= args.year <= 2024:
            parser.error('M4 aceita ano entre 1986 e 2024')
        annual = modulo4.stage00(end_year=args.year) if args.pipeline else None
        stage = modulo4.stage01(annual=annual, years=range(1986, args.year + 1))
    if args.product in stage:
        image = stage[args.product]
    elif args.product in stage.get('densities', {}):
        image = stage['densities'][args.product]
    else:
        parser.error('produto não disponível: ' + args.product)
    image = ee.Image(image).select(args.band).rename('value')
    region = ee.Geometry.Rectangle(args.bounds, None, False)
    value_reducer = (ee.Reducer.minMax().combine(ee.Reducer.mean(), sharedInputs=True)
                     .combine(ee.Reducer.sum().unweighted(), sharedInputs=True)
                     .combine(ee.Reducer.count(), sharedInputs=True))
    # One reduceRegion forces every value/mask/count onto the same output grid.
    combined = (image.addBands(image.mask().unmask(0, False).gt(0).rename('valid'))
                .addBands(image.eq(0).unmask(0, False).rename('zero'))
                .addBands(ee.Image.constant(1).rename('total')))
    if args.reference_asset:
        reference = ee.Image(args.reference_asset).select(args.reference_band or args.band).rename('reference')
        # Compare masks independently; value differences are only meaningful where both are valid.
        overlap = image.mask().unmask(0, False).gt(0).And(reference.mask().unmask(0, False).gt(0))
        delta = image.subtract(reference).abs().updateMask(overlap).rename('absolute_difference')
        mismatch = delta.gt(args.tolerance).unmask(0, False).rename('value_mismatch')
        mask_mismatch = image.mask().unmask(0, False).neq(reference.mask().unmask(0, False)).rename('mask_mismatch')
        combined = combined.addBands(delta).addBands(mismatch).addBands(mask_mismatch)
    grid_params = {'crs': args.crs, 'maxPixels': args.max_pixels}
    if args.transform is not None:
        grid_params['crsTransform'] = args.transform
    else:
        grid_params['scale'] = args.scale
    reduced = combined.reduceRegion(value_reducer, region, **grid_params).getInfo()
    totals = {key: reduced.get(key + '_sum') for key in ('valid', 'zero', 'total')}
    if totals['total'] is not None and totals['valid'] is not None:
        totals['masked'] = totals['total'] - totals['valid']
    data = {'stats': {k: reduced.get(k) for k in
                      ('value_min', 'value_max', 'value_mean', 'value_sum', 'value_count')}, 'counts': totals}
    if args.reference_asset:
        data['comparison'] = {'reference_asset': args.reference_asset, 'reference_band': args.reference_band or args.band,
                              'tolerance': args.tolerance, 'max_abs_difference': reduced.get('absolute_difference_max'),
                              'compared_pixels': reduced.get('absolute_difference_count'),
                              'value_mismatch_pixels': reduced.get('value_mismatch_sum'),
                              'mask_mismatch_pixels': reduced.get('mask_mismatch_sum')}
    print(json.dumps({'stage': args.stage, 'pipeline': args.pipeline, 'product': args.product, 'band': args.band,
                      'bounds': args.bounds, 'scale_m': args.scale, 'crs': args.crs,
                      'crs_transform': args.transform, 'result': data,
                      'note': 'Soma é soma de valores de pixel na escala solicitada; não converte unidades nem é soma de área.'},
                     ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
