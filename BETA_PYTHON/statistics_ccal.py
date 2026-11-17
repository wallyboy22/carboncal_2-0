"""Estatísticas gerais dos consolidados públicos do CCAL por Bioma × UF × ano.

Uma tabela só (formato longo) alimenta o Looker Studio e o dashboard do GitHub Pages.

Convenção CCAL dos consolidados (MODULO4/v01/readme.md):
  loss_* / gain_* / net_balance_*  → tCO2e por pixel (já multiplicado pela área): soma direta;
  stock_*                          → tC/ha (densidade): soma de stock × área (ha) = tC.
Além disso, `area_stock_ha` = área com estoque > 0 (vegetação com carbono no ano).
O sinal de gain_* é o do módulo (M3 positivo, M4 negativo); não é alterado aqui.

Etapas:
  extract  : um Export.table.toCloudStorage por módulo × ano (dry-run sem --submit);
  download : baixa os CSVs do bucket para STATISTICS/ccal_02_v_1/raw/;
  build    : consolida em ccal_estatisticas_bioma_uf.csv (longo) para Looker/Pages.

Exemplos (na raiz CCAL):
  ..\\venv\\Scripts\\python.exe -m BETA_PYTHON.statistics_ccal test --module M2 --year 2025
  ..\\venv\\Scripts\\python.exe -m BETA_PYTHON.statistics_ccal extract --submit
  ..\\venv\\Scripts\\python.exe -m BETA_PYTHON.statistics_ccal download
  ..\\venv\\Scripts\\python.exe -m BETA_PYTHON.statistics_ccal build
"""
import argparse
import re
import sys
from pathlib import Path

import ee

from . import auth

PROJECT = 'mapbiomas-brazil'
PUBLIC = 'projects/ee-ipam/assets/CCAL/public/ccal_02/ccal_02_brazil_'
MODULES = {
    'M1': ('modulo_1_frell_v6_1', 'FREL (PRODES)'),
    'M2': ('modulo_2_frell_adaptado_v3_1', 'FREL adaptado (PRODES + DETER + Fogo)'),
    'M3': ('modulo_3_qcn_mapbiomas_v5_1', 'QCN + MapBiomas'),
    'M4': ('modulo_4_qcn_mapbiomas_borda_v3_1', 'QCN + MapBiomas + borda'),
}
BIOMES = 'projects/ee-ipam/assets/ORIGINAIS/IBGE/limite_biomas_IBGE_2026'
UFS = 'projects/ee-ipam/assets/ORIGINAIS/IBGE/limite_ufs_IBGE_2025'
BIOME_NAMES = {1: 'Amazônia', 2: 'Caatinga', 3: 'Cerrado', 4: 'Mata Atlântica', 5: 'Pampa', 6: 'Pantanal'}
UF_SIGLAS = {11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI',
             23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES',
             33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'}
BUCKET = 'mapbiomas-fire'
PREFIX = 'temp/CCAL/estatisticas_ccal_02_v_1'
TASK_PREFIX = 'WS_IPAM_CCAL-STATS_'
SCALE = 30
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'STATISTICS' / 'ccal_02_v_1'


def asset(module):
    return PUBLIC + MODULES[module][0]


def variables_and_years(module):
    bands = [b['id'] for b in ee.data.getAsset(asset(module))['bands']]
    found = [re.match(r'(.+)_(\d{4})$', b) for b in bands]
    variables = sorted({m.group(1) for m in found if m})
    years = sorted({int(m.group(2)) for m in found if m})
    return variables, years, set(bands)


def zones():
    biomes = ee.Image().int().paint(ee.FeatureCollection(BIOMES), 'GEOCODE').rename('bioma')
    ufs = ee.FeatureCollection(UFS).map(lambda f: f.set('uf_num', ee.Number.parse(f.get('CD_UF'))))
    return biomes, ee.Image().int().paint(ufs, 'uf_num').rename('uf')


def year_table(module, year, variables, bands, geometry=None, scale=SCALE):
    """FeatureCollection Bioma × UF de um módulo-ano, colunas fixas (ausente = 0)."""
    img = ee.Image(asset(module))
    area = ee.Image.pixelArea().divide(1e4)
    cols, values = [], []
    for var in variables:
        name = f'{var}_{year}'
        band = img.select(name).unmask(0) if name in bands else ee.Image(0)
        if var == 'stock':
            values += [band.multiply(area), area.updateMask(band.gt(0)).unmask(0)]
            cols += ['stock_tC', 'area_stock_ha']
        else:
            values.append(band)
            cols.append(f'{var}_tCO2e')
    values.append(area)
    cols.append('area_ha')
    n = len(values)
    biomes, ufs = zones()
    stack = ee.Image.cat(values).addBands(ufs).addBands(biomes).updateMask(biomes.mask().And(ufs.mask()))
    geometry = geometry or ee.FeatureCollection(BIOMES).geometry().bounds()
    reducer = ee.Reducer.sum().repeat(n).group(n, 'uf').group(n + 1, 'bioma')
    result = stack.reduceRegion(reducer, geometry, scale, maxPixels=1e13, tileScale=4)

    def per_biome(b):
        b = ee.Dictionary(b)

        def per_uf(u):
            u = ee.Dictionary(u)
            sums = ee.List(u.get('sum'))
            props = {'modulo': module, 'asset': MODULES[module][0], 'ano': year,
                     'bioma_id': b.getNumber('bioma').int(), 'uf_id': u.getNumber('uf').int()}
            feat = ee.Feature(None, props)
            return feat.set(ee.Dictionary.fromLists(cols, sums))
        return ee.FeatureCollection(ee.List(b.get('groups')).map(per_uf))
    return ee.FeatureCollection(ee.List(result.get('groups')).map(per_biome)).flatten(), cols


def extract(args):
    for module in args.modules:
        variables, years, bands = variables_and_years(module)
        for year in years:
            if args.years and year not in args.years:
                continue
            table, cols = year_table(module, year, variables, bands)
            name = f'{module}_{year}'
            selectors = ['modulo', 'asset', 'ano', 'bioma_id', 'uf_id'] + cols
            if not args.submit:
                print('plan', name, len(cols), 'colunas')
                continue
            task = ee.batch.Export.table.toCloudStorage(
                collection=table, description=TASK_PREFIX + name, bucket=BUCKET,
                fileNamePrefix=f'{PREFIX}/{name}', fileFormat='CSV', selectors=selectors)
            task.start()
            print('task', name, task.id, flush=True)


def test(args):
    module, year = args.modules[0], (args.years or [2025])[0]
    variables, _, bands = variables_and_years(module)
    region = ee.Geometry.Rectangle([-56, -8, -55, -7])  # Novo Progresso/PA
    table, _ = year_table(module, year, variables, bands, region, scale=300)
    for f in table.getInfo()['features']:
        print({k: (round(v, 1) if isinstance(v, float) else v) for k, v in f['properties'].items()})


def _token():
    from google.auth.transport.requests import Request
    cred = auth.load(args_global.account_profile)
    cred.refresh(Request())
    return cred.token


def download(args):
    import requests
    headers = {'Authorization': 'Bearer ' + _token()}
    raw = OUT / 'raw'
    raw.mkdir(parents=True, exist_ok=True)
    url = f'https://storage.googleapis.com/storage/v1/b/{BUCKET}/o'
    items, page = [], None
    while True:
        r = requests.get(url, params={'prefix': PREFIX + '/', 'pageToken': page}, headers=headers, timeout=60)
        r.raise_for_status()
        data = r.json()
        items += data.get('items', [])
        page = data.get('nextPageToken')
        if not page:
            break
    for item in items:
        target = raw / item['name'].split('/')[-1]
        r = requests.get(f"{url}/{requests.utils.quote(item['name'], safe='')}", params={'alt': 'media'},
                         headers=headers, timeout=300)
        r.raise_for_status()
        target.write_bytes(r.content)
    print(len(items), 'arquivos em', raw)


def build(args):
    import pandas as pd
    files = sorted((OUT / 'raw').glob('M*_*.csv'))
    if not files:
        raise SystemExit('nenhum CSV em ' + str(OUT / 'raw'))
    wide = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
    ids = ['modulo', 'asset', 'ano', 'bioma_id', 'uf_id']
    long = wide.melt(id_vars=ids, var_name='variavel', value_name='valor').dropna(subset=['valor'])
    long['unidade'] = long['variavel'].str.extract(r'_(tCO2e|tC|ha)$')[0]
    long['variavel'] = long['variavel'].str.replace(r'_(tCO2e|tC|ha)$', '', regex=True)
    long['bioma'] = long['bioma_id'].map(BIOME_NAMES)
    long['uf'] = long['uf_id'].map(UF_SIGLAS)
    long['modulo_nome'] = long['modulo'].map({k: v[1] for k, v in MODULES.items()})
    long = long[['modulo', 'modulo_nome', 'asset', 'ano', 'bioma', 'uf', 'bioma_id', 'uf_id',
                 'variavel', 'unidade', 'valor']].sort_values(['modulo', 'ano', 'bioma', 'uf', 'variavel'])
    out = OUT / 'ccal_estatisticas_bioma_uf.csv'
    long.to_csv(out, index=False, encoding='utf-8')
    print(len(long), 'linhas →', out)
    summary = long.groupby(['modulo', 'ano', 'variavel', 'unidade'], as_index=False)['valor'].sum()
    summary.to_csv(OUT / 'ccal_estatisticas_brasil.csv', index=False, encoding='utf-8')


def main():
    global args_global
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('step', choices=['test', 'extract', 'download', 'build'])
    parser.add_argument('--project', default=PROJECT)
    parser.add_argument('--account-profile', default='workspace2')
    parser.add_argument('--modules', nargs='+', default=list(MODULES), choices=list(MODULES))
    parser.add_argument('--years', nargs='+', type=int)
    parser.add_argument('--submit', action='store_true')
    args_global = args = parser.parse_args()
    if args.step != 'build':
        ee.Initialize(credentials=auth.load(args.account_profile), project=args.project)
    {'test': test, 'extract': extract, 'download': download, 'build': build}[args.step](args)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
