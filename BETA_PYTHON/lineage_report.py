"""Mapeia cada produto público à versão de trabalho mais provável.

Pré-filtra candidatos por número de bandas e confirma por igualdade de pixels.
Somente leitura.
"""
import argparse
import ee
from . import auth, lineage

PUBLIC = 'projects/ee-ipam/assets/CCAL/public/ccal_02'
DEFAULT_CANDIDATES = [
    'projects/ee-ipam/assets/CCAL/MODULO1/v04/ccal_02_brazil_modulo_1_frell_v4',
    'projects/ee-ipam/assets/CCAL/MODULO1/v05/ccal_02_brazil_modulo_1_frell_v5',
    'projects/ee-ipam/assets/CCAL/MODULO2/v02/CCAL_MODULO2-v02',
    'projects/ee-ipam/assets/CCAL/MODULO3/v036/CCAL_MODULO3-v036',
    'projects/ee-ipam/assets/CCAL/MODULO3/v037/CCAL_MODULO3-v037',
    'projects/ee-ipam/assets/CCAL/MODULO3/v038/CCAL_MODULO3-v038',
    'projects/ee-ipam/assets/CCAL/MODULO3/v039/CCAL_MODULO3-v039',
    'projects/ee-ipam/assets/CCAL/MODULO4/v01/CCAL_MODULO4-v01',
    'projects/ee-ipam/assets/CCAL/MODULO4/v02/CCAL_MODULO4-v02',
    'projects/ee-ipam/assets/CCAL/MODULO4/v03/CCAL_MODULO4-v03',
]


def exists(asset):
    try:
        ee.data.getAsset(asset)
        return True
    except Exception:
        return False


def children(parent):
    out, token = [], None
    while True:
        req = {'parent': parent, 'pageSize': 1000}
        if token:
            req['pageToken'] = token
        page = ee.data.listAssets(req)
        out.extend(page.get('assets', []))
        token = page.get('nextPageToken')
        if not token:
            return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--account-profile', default='workspace2')
    parser.add_argument('--candidates', nargs='*', default=None)
    parser.add_argument('--points', type=int, default=60)
    parser.add_argument('--scale', type=float, default=1000)
    args = parser.parse_args()
    ee.Initialize(credentials=auth.load(args.account_profile), project=args.project)

    candidates = [c for c in (args.candidates or DEFAULT_CANDIDATES) if exists(c)]
    if not candidates:
        raise SystemExit('nenhum candidato disponível')
    info = {c: ee.data.getAsset(c) for c in candidates}
    by_bands = {}
    for asset, meta in info.items():
        by_bands.setdefault(len(meta.get('bands', [])), []).append(asset)

    print('Candidatos disponíveis:')
    for asset in candidates:
        print(f'  {len(info[asset].get("bands", [])):4} bandas  {info[asset].get("updateTime")}  {asset}')
    print('\nMapeamento público -> candidato:')

    for item in sorted(children(PUBLIC), key=lambda x: x['name']):
        public = item['name']
        meta = ee.data.getAsset(public)
        count = len(meta.get('bands', []))
        pool = by_bands.get(count, [])
        print(f'\n{public.split("/")[-1]}  ({count} bandas, {meta.get("updateTime")})')
        if not pool:
            print('  sem candidato com o mesmo número de bandas')
            continue
        best = None
        for candidate in pool:
            report = lineage.compare(public, candidate, args.points, args.scale)
            fraction = report.get('equal_fraction')
            print(f'  {candidate.split("/")[-1]}: igualdade={fraction} pontos={report.get("points")}')
            if fraction is not None and (best is None or fraction > best[1]):
                best = (candidate, fraction)
        if best:
            print(f'  MELHOR: {best[0]} (igualdade {best[1]:.4f})')


if __name__ == '__main__':
    main()
