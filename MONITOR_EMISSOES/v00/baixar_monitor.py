"""Baixa os CSVs mensais do monitor de emissões da pasta do Drive (workspace2)."""
import argparse
import sys
from pathlib import Path

import requests

_CCAL_DIR = Path(__file__).resolve().parents[2]  # CCAL/
if str(_CCAL_DIR) not in sys.path:
    sys.path.insert(0, str(_CCAL_DIR))

from BETA_PYTHON import auth  # noqa: E402
from google.auth.transport.requests import Request  # noqa: E402

FOLDER_ID = "1Q4uN1zy1dTqE3Yo08nOjYZ_TnlPP9heS"
OUT = Path(__file__).resolve().parent / "data"


def list_files(token):
    files = []
    page_token = None
    while True:
        params = {
            "q": f"'{FOLDER_ID}' in parents and trashed=false",
            "fields": "nextPageToken, files(id, name, mimeType, size)",
            "pageSize": 1000,
        }
        if page_token:
            params["pageToken"] = page_token
        r = requests.get(
            "https://www.googleapis.com/drive/v3/files",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=60,
        )
        r.raise_for_status()
        data = r.json()
        files.extend(data.get("files", []))
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prefix", default="",
                        help="baixa só CSVs cujo nome começa com este prefixo")
    parser.add_argument("--out", type=Path, default=OUT, help="pasta de destino")
    args = parser.parse_args()
    out = args.out if args.out.is_absolute() else Path(__file__).resolve().parent / args.out

    creds = auth.load("workspace2")
    creds.refresh(Request())
    token = creds.token

    files = list_files(token)
    csvs = [f for f in files if f["name"].lower().endswith(".csv")
            and f["name"].startswith(args.prefix)]
    others = [f for f in files if not f["name"].lower().endswith(".csv")]
    print(f"{len(files)} itens na pasta | {len(csvs)} CSVs")
    for o in others:
        print("  (outro tipo)", o["name"], o["mimeType"])

    out.mkdir(parents=True, exist_ok=True)
    baixados = 0
    for f in sorted(csvs, key=lambda x: x["name"]):
        dest = out / f["name"]
        if dest.exists() and dest.stat().st_size > 0:
            print("  já existe:", f["name"])
            baixados += 1
            continue
        r = requests.get(
            f"https://www.googleapis.com/drive/v3/files/{f['id']}?alt=media",
            headers={"Authorization": f"Bearer {token}"},
            timeout=120,
        )
        r.raise_for_status()
        dest.write_bytes(r.content)
        baixados += 1
        print(f"  ok: {f['name']} ({len(r.content)} bytes)")

    print(f"\nPronto: {baixados} CSVs em {out}")


if __name__ == "__main__":
    main()
