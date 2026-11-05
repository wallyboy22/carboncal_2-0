"""Migra uma série anual de FOLDER para IMAGE_COLLECTION, sem tocar na origem.

Recusa agir se houver tarefa ativa que leia/escreva no destino. Confirma que
todos os filhos são imagens anuais esperadas antes de remover qualquer coisa.
"""
import argparse
import ee
from . import auth

YEARS = tuple(range(1986, 2025))


def list_children(parent):
    result, token = [], None
    while True:
        req = {'parent': parent, 'pageSize': 1000}
        if token:
            req['pageToken'] = token
        page = ee.data.listAssets(req)
        result.extend(page.get('assets', []))
        token = page.get('nextPageToken')
        if not token:
            return result


def active_tasks_touching(path):
    hits = []
    for task in ee.data.getTaskList():
        if task.get('state') not in ('RUNNING', 'READY'):
            continue
        dest = ' '.join(task.get('destination_uris') or [])
        if path in dest:
            hits.append((task['id'], task['state'], task.get('description', '')))
    return hits


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--account-profile', default='workspace2')
    parser.add_argument('--collection', required=True, help='caminho que deve virar IMAGE_COLLECTION')
    parser.add_argument('--source', required=True, help='IMAGE_COLLECTION de origem das cópias')
    parser.add_argument('--submit', action='store_true')
    args = parser.parse_args()
    ee.Initialize(credentials=auth.load(args.account_profile), project=args.project)

    target = ee.data.getAsset(args.collection)
    source = ee.data.getAsset(args.source)
    if target['type'] != 'FOLDER':
        raise SystemExit(f'destino já é {target["type"]}; nada a migrar')
    if source['type'] != 'IMAGE_COLLECTION':
        raise SystemExit(f'origem é {source["type"]}; esperado IMAGE_COLLECTION')

    children = list_children(args.collection)
    names = sorted(x['name'].rsplit('/', 1)[-1] for x in children)
    expected = [str(y) for y in YEARS]
    if names != expected:
        raise SystemExit(f'filhos inesperados; esperado {expected[0]}..{expected[-1]}, obtido {names[:3]}...{names[-3:]}')
    if any(x['type'] != 'IMAGE' for x in children):
        raise SystemExit('há filhos que não são IMAGE; abortando')

    busy = active_tasks_touching(args.collection)
    if busy:
        for item in busy:
            print('TAREFA ATIVA:', item)
        raise SystemExit('há tarefas ativas sobre o destino; aguarde a conclusão')

    print(f'Migração: {args.collection} (FOLDER, {len(children)} imagens) -> IMAGE_COLLECTION')
    print(f'Origem das cópias: {args.source}')
    if not args.submit:
        print('Dry-run: nenhuma exclusão feita. Use --submit.')
        return

    for child in children:
        ee.data.deleteAsset(child['name'])
    ee.data.deleteAsset(args.collection)
    ee.data.createAsset({'type': 'IMAGE_COLLECTION'}, args.collection)
    for year in YEARS:
        ee.data.copyAsset(f'{args.source}/{year}', f'{args.collection}/{year}', False)

    final = ee.data.getAsset(args.collection)
    count = len(list_children(args.collection))
    print(f'Resultado: tipo={final["type"]}, filhos={count}')
    if final['type'] != 'IMAGE_COLLECTION' or count != len(YEARS):
        raise SystemExit('verificação pós-migração falhou')


if __name__ == '__main__':
    main()
