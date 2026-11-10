"""Auditoria independente: área (ha) e toneladas por métrica, Acre, versões públicas.

Para cada versão pública do CCAL, reduz o asset final sobre o estado do Acre e
exporta uma tabela longa (uma linha por métrica/ano) para o Drive, com:
  - modulo, versao, metrica, ano
  - unidade (tC para estoque, tCO2e para fluxos)
  - area_ha (área dos pixels com valor não nulo, via pixelArea)
  - toneladas (soma; tCO2e/pixel somado direto; tC/ha multiplicado pela área)

Regras de unidade:
  * stock_YYYY           -> tC/ha        -> toneladas = valor * pixelArea(ha)
  * demais (loss_*,      -> tCO2e/pixel  -> toneladas = soma dos valores
    gain_*, net_balance, convergências)

Construção vetorizada (um único select por grupo de bandas) para manter o grafo
raso e evitar o estouro de recursão do serializador em assets com centenas de
bandas. Não sobrescreve nada; apenas submete Export.table.toDrive.
Dry-run por padrão; use --submit.
"""
import argparse
import ee
from . import auth

PUBLIC = 'projects/ee-ipam/assets/CCAL/public/ccal_02/'
ACRE_ID = 'projects/ee-ipam/assets/IBGE/IBGE_BR_UF_2025'
DRIVE_FOLDER = 'CCAL_AUDITORIA_ACRE_M1-M4'
TASK_PREFIX = 'WS_IPAM_CCAL-AUDIT_ACRE_'

ASSETS = {
    'M1_v3': 'ccal_02_brazil_modulo_1_frell_v3',
    'M1_v5': 'ccal_02_brazil_modulo_1_frell_v5',
    'M2_v2': 'ccal_02_brazil_modulo_2_frell_adaptado_v2',
    'M2_v3': 'ccal_02_brazil_modulo_2_frell_adaptado_v3',
    'M3_v4': 'ccal_02_brazil_modulo_3_qcn_mapbiomas_v4',
    'M3_v5': 'ccal_02_brazil_modulo_3_qcn_mapbiomas_v5',
    'M4_v1': 'ccal_02_brazil_modulo_4_qcn_mapbiomas_borda_v1',
    'M4_v2': 'ccal_02_brazil_modulo_4_qcn_mapbiomas_borda_v2',
}


def build_long_table(label, asset_id, acre):
    modulo, versao = label.split('_')
    img = ee.Image(PUBLIC + asset_id)
    info = img.getInfo()
    names = [b['id'] for b in info['bands']]
    proj = img.select(0).projection().getInfo()
    crs, transform = proj['crs'], proj['transform']
    geometry = acre.geometry()
    pxha = ee.Image.pixelArea().divide(1e4)

    stock_names = [n for n in names if n.startswith('stock_')]
    non_stock_names = [n for n in names if not n.startswith('stock_')]

    # Área: pixelArea(ha) onde o valor é não nulo, para todas as bandas.
    area_img = img.select(names).neq(0).multiply(pxha).rename(['area__' + n for n in names])
    # Toneladas: fluxos somam direto; estoque multiplica pela área do pixel.
    ton_non_stock = img.select(non_stock_names).rename(['ton__' + n for n in non_stock_names])
    ton_stock = img.select(stock_names).multiply(pxha).rename(['ton__' + n for n in stock_names])
    ton_img = ton_non_stock.addBands(ton_stock)

    combined = area_img.addBands(ton_img)
    reduced = combined.reduceRegions(
        collection=acre, reducer=ee.Reducer.sum(),
        crs=crs, crsTransform=transform, tileScale=4)
    feat = ee.Feature(reduced.first())

    def row(n):
        n = ee.String(n)
        metric = n.slice(0, -5)
        return ee.Feature(None, {
            'modulo': modulo, 'versao': versao,
            'metrica': metric, 'ano': ee.Number.parse(n.slice(-4)),
            'unidade': ee.Algorithms.If(metric.equals('stock'), 'tC', 'tCO2e'),
            'area_ha': feat.get(ee.String('area__').cat(n)),
            'toneladas': feat.get(ee.String('ton__').cat(n)),
        })

    table = ee.FeatureCollection(ee.List(names).map(row))
    return table, len(names)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--project', default='mapbiomas-brazil')
    ap.add_argument('--account-profile', default='workspace2')
    ap.add_argument('--labels', nargs='*', default=None,
                    help='subconjunto de ASSETS (ex.: M4_v2 M3_v5)')
    ap.add_argument('--submit', action='store_true')
    args = ap.parse_args()

    ee.Initialize(credentials=auth.load(args.account_profile), project=args.project)
    acre = ee.FeatureCollection(ACRE_ID).filter(ee.Filter.eq('SIGLA_UF', 'AC'))
    labels = args.labels or list(ASSETS.keys())

    for label in labels:
        if label not in ASSETS:
            print(f'IGNORADO (desconhecido): {label}')
            continue
        table, nbands = build_long_table(label, ASSETS[label], acre)
        prefix = 'CCAL_AUDITORIA_ACRE_' + label
        desc = TASK_PREFIX + label
        if not args.submit:
            print(f'[DRY-RUN] {label}: {nbands} bandas -> {DRIVE_FOLDER}/{prefix}.csv')
            continue
        task = ee.batch.Export.table.toDrive(
            collection=table, description=desc, folder=DRIVE_FOLDER,
            fileNamePrefix=prefix, fileFormat='CSV',
            selectors=['modulo', 'versao', 'metrica', 'ano', 'unidade',
                       'area_ha', 'toneladas'])
        task.start()
        print(f'SUBMITIDA {desc}  id={task.id}  ({nbands} bandas)')

    if not args.submit:
        print('\n[Dry-run] Nada foi submetido. Use --submit para exportar.')


if __name__ == '__main__':
    main()
