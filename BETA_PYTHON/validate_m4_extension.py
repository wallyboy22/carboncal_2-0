"""Regressão da extensão incremental do M4 (somente leitura, sem export).

Parte do anual publicado de `year-1` e recalcula `year`, comparando com o anual
publicado de `year` em recortes:
  observed  -> drivers reais do ano: prova se o checkpoint (agc0_state, sf_age) basta
  hipóteses -> combinações edge_mode × sf_mode: mede o viés que as hipóteses teriam

  ..\\venv\\Scripts\\python.exe -m BETA_PYTHON.validate_m4_extension --year 2024
"""
import argparse
import json
import sys

import ee

from . import auth, modulo4 as m4

TILES = {
    'PA_Novo_Progresso': (-55.4, -7.4, -55.15, -7.15),
    'RO_Porto_Velho': (-63.4, -9.6, -63.15, -9.35),
    'MT_norte': (-55.6, -11.6, -55.35, -11.35),
    'MA_cerrado': (-46.3, -6.3, -46.05, -6.05),
    'PR_mata_atl': (-49.6, -25.4, -49.35, -25.15),
}
FLUXES = ('loss_edge', 'loss_selective_logging', 'loss_fire', 'loss_deforestation',
          'loss_deforestation_secondary', 'gain_secondary_vegetation', 'net_balance')


def totals(image, year, region, scale):
    area = ee.Image.pixelArea().multiply(0.0001)
    bands = [image.select(f'{f}_{year}').unmask(0).rename(f) for f in FLUXES]
    bands.append(image.select(f'stock_{year}').unmask(0).multiply(area).rename('stock_tC'))
    bands.append(image.select(f'sf_age_{year}').gt(0).unmask(0).multiply(area).rename('sf_area_ha'))
    return ee.Image.cat(bands).reduceRegion(ee.Reducer.sum(), region, scale, maxPixels=1e10)


def max_abs(a, b, year, region, scale):
    names = [f'{f}_{year}' for f in FLUXES] + [f'stock_{year}', f'agc0_state_{year}', f'sf_age_{year}']
    return ee.Image(a).select(names).unmask(0).subtract(ee.Image(b).select(names).unmask(0)).abs() \
        .reduceRegion(ee.Reducer.max(), region, scale, maxPixels=1e10)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--year', type=int, default=2024)
    p.add_argument('--project', default='mapbiomas-brazil')
    p.add_argument('--account-profile', default='workspace2')
    p.add_argument('--scale', type=float, default=30)
    p.add_argument('--out')
    args = p.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    ee.Initialize(credentials=auth.load(args.account_profile), project=args.project)
    y = args.year
    prev = ee.Image(f'{m4.ANNUAL_SOURCE}/{y - 1}')
    ref = ee.Image(f'{m4.ANNUAL_SOURCE}/{y}')
    variants = {'observed': m4.extend_year(y, prev, observed=True)}
    for em in m4.EDGE_MODES:
        for sm in m4.SF_MODES:
            variants[f'{em}|{sm}'] = m4.extend_year(y, prev, edge_mode=em, sf_mode=sm)
    report = {}
    for name, bounds in TILES.items():
        region = ee.Geometry.Rectangle(list(bounds), None, False)
        out = {'reference': totals(ref, y, region, args.scale),
               'observed_max_abs': max_abs(variants['observed'], ref, y, region, args.scale)}
        out.update({k: totals(v, y, region, args.scale) for k, v in variants.items()})
        report[name] = ee.Dictionary(out).getInfo()
        print(name, 'ok', flush=True)
    if args.out:
        json.dump(report, open(args.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(report, ensure_ascii=False)[:500])


if __name__ == '__main__':
    main()
