"""Área do território (km²) de cada interseção Bioma × UF, com os mesmos rasters de
bioma e UF usados em `stats_do_primeiro_ensaio.py`. Base da densidade no dashboard.

Uso: ..\..\..\venv\Scripts\python.exe area_territorio_bioma_uf.py [--scale 250]
"""
import argparse
import csv
import sys
from pathlib import Path

import ee

import stats_do_primeiro_ensaio as stats

OUT = Path(__file__).resolve().parent / "area_territorio_bioma_uf.csv"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--scale", type=int, default=250)
    ap.add_argument("--account-profile", default="workspace2")
    args = ap.parse_args()
    stats.connect(stats.PROJECT, args.account_profile)
    _, _, _, _, _, bounds, img_biomas, img_ufs = stats.build_inputs()
    km2 = ee.Image.pixelArea().divide(1e6).rename("km2")
    res = (km2.addBands(img_biomas).addBands(img_ufs)
           .reduceRegion(ee.Reducer.sum().group(1, "uf").group(1, "bioma"), bounds, args.scale,
                         maxPixels=1e13, tileScale=4).getInfo())
    rows = []
    for bg in res["groups"]:
        b = int(bg["bioma"])
        for ug in bg["groups"]:
            u = int(ug["uf"])
            rows.append({"bioma_id": b, "Bioma": stats._BIOMAS_LEGEND[str(b)], "uf_id": u,
                         "SIGLA_UF": stats._UF_SIGLAS[str(u)], "area_km2": round(ug["sum"], 3)})
    with OUT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader(); w.writerows(rows)
    print(f"{len(rows)} interseções · total {sum(r['area_km2'] for r in rows):,.0f} km² -> {OUT}")


if __name__ == "__main__":
    sys.exit(main())
