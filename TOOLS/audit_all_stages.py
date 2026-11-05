"""Audita metadados de saídas CCAL e amostra famílias, sem alterar assets.

Consulte TOOLS/AUDITORIA_RESULTADOS.md antes de interpretar os resultados.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
from pathlib import Path
import re

import ee

ROOT = "projects/ee-ipam/assets/CCAL/"


def inventory():
    pending = [ROOT + f"MODULO{i}" for i in range(1, 5)]
    objects = []
    errors = []
    while pending:
        parent = pending.pop()
        token = None
        try:
            while True:
                request = {"parent": parent, "pageSize": 1000}
                if token:
                    request["pageToken"] = token
                page = ee.data.listAssets(request)
                for obj in page.get("assets", []):
                    objects.append({"name": obj["name"], "type": obj["type"],
                                    "updateTime": obj.get("updateTime")})
                    if obj["type"] in ("FOLDER", "IMAGE_COLLECTION"):
                        pending.append(obj["name"])
                token = page.get("nextPageToken")
                if not token:
                    break
        except Exception as exc:
            errors.append({"parent": parent, "error": str(exc)})
    return objects, errors


def metadata(obj):
    try:
        asset = ee.data.getAsset(obj["name"])
        bands = [band["id"] for band in asset.get("bands", [])]
        return {**obj, "band_count": len(bands), "bands": bands}
    except Exception as exc:
        return {**obj, "error": str(exc)}


def family(name):
    parent, leaf = name.rsplit("/", 1)
    # Preserve each distinct output/process and group only its annual images.
    match = re.match(r"^(.*?)(?:_)?((?:19|20)\d{2})$", leaf)
    return (parent + "/" + match.group(1) + "{YYYY}") if match else name


def sample_image(obj):
    region = ee.Geometry.Rectangle([-74, -34, -34, 6], None, False)
    bands = obj.get("bands", [])
    chosen = list(dict.fromkeys(bands[:1] + bands[-1:]))
    results = []
    for band in chosen:
        try:
            values = (ee.Image(obj["name"]).select(band)
                      .sample(region=region, scale=10000, numPixels=500, seed=42)
                      .aggregate_array(band).getInfo())
            results.append({"band": band, "valid_samples": len(values),
                            "zero_samples": sum(v == 0 for v in values),
                            "min": min(values) if values else None,
                            "max": max(values) if values else None})
        except Exception as exc:
            results.append({"band": band, "error": str(exc)})
    return {"name": obj["name"], "bands": results}


def parallel_map(fn, items, workers):
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(fn, item) for item in items]
        return [future.result() for future in as_completed(futures)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--pixels", action="store_true")
    args = parser.parse_args()
    ee.Initialize(project=args.project)
    objects, errors = inventory()
    images = [obj for obj in objects if obj["type"] == "IMAGE"]
    print(f"Inventário: {len(objects)} objetos; {len(images)} imagens", flush=True)
    details = parallel_map(metadata, images, args.workers)
    groups = {}
    for obj in details:
        groups.setdefault(family(obj["name"]), []).append(obj)
    selected = []
    for values in groups.values():
        values.sort(key=lambda item: item["name"])
        selected.extend(values[:1])
        if len(values) > 1:
            selected.extend(values[-1:])
    print(f"Metadados: {len(details)} imagens; amostragem: {len(selected) if args.pixels else 0} imagens", flush=True)
    samples = parallel_map(sample_image, selected, args.workers) if args.pixels else []
    report = {"created_utc": datetime.now(timezone.utc).isoformat(),
              "scope": "Pastas MODULO1 a MODULO4; metadados de todas as imagens acessíveis. "
                       "Pixels: imagens inicial/final de cada família anual e todas as demais; "
                       "primeira e última banda, amostragem grosseira de pixels válidos.",
              "objects": objects, "inventory_errors": errors,
              "images": sorted(details, key=lambda x: x["name"]),
              "samples": sorted(samples, key=lambda x: x["name"])}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Relatório: {args.output}; erros de inventário: {len(errors)}", flush=True)


if __name__ == "__main__":
    main()
