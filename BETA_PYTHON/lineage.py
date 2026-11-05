"""Compara dois assets por esquema e por igualdade de pixels em um recorte.

Somente leitura. Usa igualdade pixel a pixel em azulejos pequenos com dados,
evitando amostragem de pontos sobre o território inteiro.
"""
import argparse
import json
import ee
from . import auth

TILES = [
    (-60.0, -5.0, -59.8, -4.8),
    (-55.0, -12.0, -54.8, -11.8),
    (-47.0, -15.0, -46.8, -14.8),
    (-50.0, -25.0, -49.8, -24.8),
]


def band_names(asset):
    return [b['id'] for b in ee.data.getAsset(asset).get('bands', [])]


def pick_bands(bands, limit=8):
    if len(bands) <= limit:
        return bands
    step = (len(bands) - 1) / (limit - 1)
    return [bands[round(i * step)] for i in range(limit)]


def _valid(a, b, reference):
    return (ee.Image(a).select(reference).mask().unmask(0, False)
            .And(ee.Image(b).select(reference).mask().unmask(0, False)).rename('ok'))


def compare(a, b, points=0, scale=30, bounds=None, seed=0):
    bands_a, bands_b = band_names(a), band_names(b)
    common = [x for x in bands_a if x in bands_b]
    if not common:
        return {'asset_a': a, 'asset_b': b, 'common_bands': 0, 'error': 'sem bandas em comum'}
    stock = [x for x in common if x.startswith('stock_')]
    reference = stock[-1] if stock else common[-1]
    selected = pick_bands(common)
    tiles = [bounds] if bounds else TILES
    chosen, valid_pixels = None, 0
    for tile in tiles:
        region = ee.Geometry.Rectangle(list(tile), None, False)
        count = _valid(a, b, reference).reduceRegion(
            ee.Reducer.sum().unweighted(), region, scale, maxPixels=100000000).getInfo().get('ok')
        if count and count > valid_pixels:
            chosen, valid_pixels = region, count
        if count and count > 5000:
            break
    if not chosen:
        return {'asset_a': a, 'asset_b': b, 'common_bands': len(common),
                'error': 'nenhum recorte com máscara comum', 'compared_bands': selected}
    same_parts = []
    for i, band in enumerate(selected):
        ia = ee.Image(a).select([band], ['a' + str(i)])
        ib = ee.Image(b).select([band], ['b' + str(i)])
        ma = ia.mask().unmask(0, False)
        mb = ib.mask().unmask(0, False)
        valid_band = ma.And(mb)
        equal_band = ia.eq(ib).updateMask(valid_band).unmask(0, False)
        same_parts += [valid_band.rename('v' + str(i)), equal_band.rename('e' + str(i)),
                       ma.And(mb.Not()).rename('oa' + str(i)), mb.And(ma.Not()).rename('ob' + str(i))]
    from .common import stack
    stats = stack(same_parts).reduceRegion(ee.Reducer.sum().unweighted(), chosen, scale,
                                           maxPixels=100000000).getInfo()
    per_band = {}
    for i, band in enumerate(selected):
        valid = stats.get('v' + str(i)) or 0
        equal = stats.get('e' + str(i)) or 0
        per_band[band] = {'valid': valid, 'equal': equal,
                          'equal_fraction': (equal / valid) if valid else None,
                          'only_a': stats.get('oa' + str(i)) or 0,
                          'only_b': stats.get('ob' + str(i)) or 0}
    total_equal = sum(v['equal'] for v in per_band.values())
    total_valid = sum(v['valid'] for v in per_band.values())
    return {'asset_a': a, 'asset_b': b, 'bands_a': len(bands_a), 'bands_b': len(bands_b),
            'common_bands': len(common),
            'only_a': [x for x in bands_a if x not in bands_b][:10],
            'only_b': [x for x in bands_b if x not in bands_a][:10],
            'compared_bands': selected, 'tile': chosen.bounds().getInfo()['coordinates'],
            'valid_pixels': valid_pixels,
            'equal_values': total_equal, 'both_valid_values': total_valid,
            'equal_fraction': (total_equal / total_valid) if total_valid else None,
            'per_band': per_band}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--account-profile', default='workspace2')
    parser.add_argument('--asset-a', required=True)
    parser.add_argument('--asset-b', required=True)
    parser.add_argument('--scale', type=float, default=30)
    parser.add_argument('--bounds', type=float, nargs=4)
    args = parser.parse_args()
    ee.Initialize(credentials=auth.load(args.account_profile), project=args.project)
    print(json.dumps(compare(args.asset_a, args.asset_b, scale=args.scale,
                             bounds=args.bounds), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
