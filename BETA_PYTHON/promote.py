"""Promove um asset aprovado para public/ccal_02 via copyAsset, com salvaguardas.

Recusa destino existente, exige tipo IMAGE e, opcionalmente, compara a linhagem
com um asset público anterior antes de copiar. Dry-run por padrão.
"""
import argparse
import ee
from . import auth, lineage

PUBLIC = 'projects/ee-ipam/assets/CCAL/public/ccal_02'


def exists(asset):
    try:
        ee.data.getAsset(asset)
        return True
    except Exception:
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--account-profile', default='workspace2')
    parser.add_argument('--source', required=True, help='asset de trabalho aprovado')
    parser.add_argument('--destination', required=True, help='caminho em public/ccal_02')
    parser.add_argument('--compare-with', help='asset público da versão anterior para conferir linhagem')
    parser.add_argument('--min-equal', type=float, default=0.99,
                        help='fração mínima de valores iguais para prosseguir quando --compare-with é usado')
    parser.add_argument('--points', type=int, default=80)
    parser.add_argument('--scale', type=float, default=1000)
    parser.add_argument('--submit', action='store_true')
    args = parser.parse_args()
    ee.Initialize(credentials=auth.load(args.account_profile), project=args.project)

    if not args.destination.startswith(PUBLIC + '/'):
        raise SystemExit('destino deve estar sob ' + PUBLIC)
    if not exists(args.source):
        raise SystemExit('origem inexistente: ' + args.source)
    source = ee.data.getAsset(args.source)
    if source['type'] != 'IMAGE':
        raise SystemExit('origem não é IMAGE: ' + source['type'])
    if exists(args.destination):
        raise SystemExit('destino já existe; nenhuma sobrescrita será feita: ' + args.destination)

    print('Origem :', args.source, '| bandas:', len(source.get('bands', [])))
    print('Destino:', args.destination, '| atualização origem:', source.get('updateTime'))

    if args.compare_with:
        report = lineage.compare(args.compare_with, args.source, args.points, args.scale)
        fraction = report.get('equal_fraction')
        print('Linhagem com', args.compare_with, '=> igualdade:', fraction,
              '| bandas comuns:', report.get('common_bands'),
              '| pontos:', report.get('points'))
        if fraction is None:
            raise SystemExit('não foi possível medir a linhagem; abortando')
        if fraction < args.min_equal:
            raise SystemExit(f'igualdade {fraction:.4f} abaixo do mínimo {args.min_equal}; abortando')

    if not args.submit:
        print('Dry-run: nenhuma cópia feita. Use --submit para promover.')
        return
    ee.data.copyAsset(args.source, args.destination, False)
    final = ee.data.getAsset(args.destination)
    print('Promovido:', final['name'], '| tipo:', final['type'],
          '| bandas:', len(final.get('bands', [])), '| atualização:', final.get('updateTime'))


if __name__ == '__main__':
    main()
