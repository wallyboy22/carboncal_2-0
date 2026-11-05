"""Compara dois assets por esquema e por pixels; usado para confirmar linhagem.

Somente leitura. Gera pontos aleatórios e mantém os que têm máscara válida nos
dois assets, comparando um conjunto representativo de bandas.
"""
import argparse
import json
import ee
from . import auth


def band_names(asset):
    return [b['id'] for b in ee.data.getAsset(asset).get('bands', [])]


def pick_bands(bands, limit=12):
    if len(bands) <= limit:
        return bands
    step = (len(bands) - 1) / (limit - 1)
    idx = sorted({round(i * step) for i in range(limit)})
    return [bands[i] for i in idx]


def compare(a, b, points=300, scale=240, bounds=(-74, -34, -34, 6), seed=42):
    bands_a, bands_b = band_names(a), band_names(b)
    common = [x for x in bands_a if x in bands_b]
    if not common:
        return {'asset_a': a, 'asset_b': b, 'common_bands': 0, 'error': 'sem bandas em comum'}
    region = ee.Geometry.Rectangle(list(bounds), None, False)
    stock_bands = [x for x in common if x.startswith('stock_')]
    reference = stock_bands[-1] if stock_bands else common[-1]
    valid = (ee.Image(a).select(reference).mask().unmask(0, False)
             .And(ee.Image(b).select(reference).mask().unmask(0, False)).rename('ok'))
    candidates = ee.FeatureCollection.randomPoints(region, points * 40, seed)
    kept = (valid.sampleRegions(collection=candidates, scale=scale, geometries=False)
            .filter(ee.Filter.eq('ok', 1)).limit(points))
    selected = pick_bands(common)

    def sample(asset):
        img = ee.Image(asset).select(selected, ['b' + str(i) for i in range(len(selected))])
        rows = img.sampleRegions(collection=kept, scale=scale, geometries=False).getInfo()['features']
        return {f['id']: f['properties'] for f in rows}

    a_rows, b_rows = sample(a), sample(b)
    rows = [{'id': key, 'A': a_rows[key], 'B': b_rows.get(key, {})} for key in a_rows]
    per_band = {}
    for i, band in enumerate(selected):
        both_valid = equal = 0
        key = 'b' + str(i)
        for row in rows:
            va, vb = row['A'].get(key), row['B'].get(key)
            if va is None or vb is None:
                continue
            both_valid += 1
            if abs(va - vb) <= 1e-6 * max(1.0, abs(va), abs(vb)):
                equal += 1
        per_band[band] = {'both_valid': both_valid, 'equal': equal,
                          'equal_fraction': (equal / both_valid) if both_valid else None}
    total = sum(v['both_valid'] for v in per_band.values())
    equal = sum(v['equal'] for v in per_band.values())
    return {'asset_a': a, 'asset_b': b, 'points': len(rows), 'scale': scale,
            'bands_a': len(bands_a), 'bands_b': len(bands_b),
            'common_bands': len(common),
            'only_a': [x for x in bands_a if x not in bands_b][:10],
            'only_b': [x for x in bands_b if x not in bands_a][:10],
            'compared_bands': selected,
            'both_valid_values': total, 'equal_values': equal,
            'equal_fraction': (equal / total) if total else None,
            'per_band': per_band}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--account-profile', default='workspace2')
    parser.add_argument('--asset-a', required=True)
    parser.add_argument('--asset-b', required=True)
    parser.add_argument('--points', type=int, default=300)
    parser.add_argument('--scale', type=float, default=240)
    args = parser.parse_args()
    ee.Initialize(credentials=auth.load(args.account_profile), project=args.project)
    print(json.dumps(compare(args.asset_a, args.asset_b, args.points, args.scale),
                     ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
