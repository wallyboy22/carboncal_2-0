"""Registra a linhagem confirmada de um asset público.

Grava propriedades no asset (ccal:*) e acrescenta uma linha no cofre local.
Somente metadados; não copia nem altera pixels.
"""
import argparse
import csv
from datetime import datetime, timezone
from pathlib import Path
import ee
from . import auth

VAULT = Path(__file__).resolve().parent.parent / 'MATERIAL_COMPLEMENTAR' / 'ASSET_VAULT'
CSV_PATH = VAULT / 'lineage_map.csv'
FIELDS = ['public_asset', 'source_asset', 'source_version', 'equal_fraction',
          'points', 'scale_m', 'checked_utc']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--account-profile', default='workspace2')
    parser.add_argument('--public-asset', required=True)
    parser.add_argument('--source-asset', required=True)
    parser.add_argument('--source-version', required=True, help='ex.: M3 v038')
    parser.add_argument('--equal-fraction', type=float, required=True)
    parser.add_argument('--points', type=int, required=True)
    parser.add_argument('--scale', type=float, required=True)
    parser.add_argument('--submit', action='store_true', help='grava propriedades no asset')
    args = parser.parse_args()
    ee.Initialize(credentials=auth.load(args.account_profile), project=args.project)
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    properties = {
        'ccal:source_asset': args.source_asset,
        'ccal:source_version': args.source_version,
        'ccal:lineage_equal_fraction': args.equal_fraction,
        'ccal:lineage_points': args.points,
        'ccal:lineage_scale_m': args.scale,
        'ccal:lineage_checked_utc': now,
    }
    print('Asset público:', args.public_asset)
    for key, value in properties.items():
        print(f'  {key} = {value}')
    if not args.submit:
        print('Dry-run: propriedades não gravadas. Use --submit.')
        return
    ee.data.setAssetProperties(args.public_asset, properties)
    VAULT.mkdir(parents=True, exist_ok=True)
    exists = CSV_PATH.exists()
    with CSV_PATH.open('a', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        if not exists:
            writer.writeheader()
        writer.writerow({'public_asset': args.public_asset, 'source_asset': args.source_asset,
                         'source_version': args.source_version,
                         'equal_fraction': args.equal_fraction, 'points': args.points,
                         'scale_m': args.scale, 'checked_utc': now})
    print('Registrado em', CSV_PATH)


if __name__ == '__main__':
    main()
