"""Diagnóstico exploratório de resultados CCAL, sem exportar ou alterar assets.

Exemplo: python TOOLS/audit_outputs.py --project mapbiomas-brazil --pixels
Estatísticas de pixels usam amostra determinística em escala grosseira; não são
estatísticas nacionais nem substituem validação científica.
"""
import argparse
import json
import re

import ee


ROOT = "projects/ee-ipam/assets/CCAL"
ASSETS = {
    "M1 v04": (f"{ROOT}/MODULO1/v04/ccal_02_brazil_modulo_1_frell_v4", 2017, 2024),
    "M2 v02": (f"{ROOT}/MODULO2/v02/CCAL_MODULO2-v02", 2017, 2023),
    "M2 v03": (f"{ROOT}/MODULO2/v03/CCAL_MODULO2-v03", 2017, 2024),
    "M3 v036": (f"{ROOT}/MODULO3/v036/CCAL_MODULO3-v036", 1986, 2024),
    "M3 v037": (f"{ROOT}/MODULO3/v037/CCAL_MODULO3-v037", 1986, 2024),
    "M3 v038": (f"{ROOT}/MODULO3/v038/CCAL_MODULO3-v038", 1986, 2024),
    "M4 v01": (f"{ROOT}/MODULO4/v01/CCAL_MODULO4-v01", 1986, 2024),
    "M4 v02": (f"{ROOT}/MODULO4/v02/CCAL_MODULO4-v02", 1986, 2024),
}


def inspect(label, asset_id, first, last, pixels):
    result = {"label": label, "asset": asset_id, "expected_years": [first, last]}
    try:
        asset = ee.data.getAsset(asset_id)
        bands = [band["id"] for band in asset.get("bands", [])]
        years = sorted({int(m.group(1)) for band in bands
                        if (m := re.search(r"_(\d{4})$", band))})
        result.update(type=asset.get("type"), band_count=len(bands),
                      years_present=years,
                      missing_years=sorted(set(range(first, last + 1)) - set(years)))
        if pixels and bands:
            # Dois anos e até três famílias, para manter a consulta leve.
            selected = [b for b in bands if b.endswith((f"_{first}", f"_{last}"))][:6]
            result["sample"] = []
            region = ee.Geometry.Rectangle([-74, -34, -34, 6], None, False)
            for band in selected:
                try:
                    image = ee.Image(asset_id).select(band)
                    samples = image.sample(region=region, scale=10000, numPixels=500,
                                           seed=42, geometries=False).aggregate_array(band).getInfo()
                    result["sample"].append({"band": band, "valid_samples": len(samples),
                        "zero_fraction_of_valid": (sum(v == 0 for v in samples) / len(samples)
                                                   if samples else None),
                        "min": min(samples) if samples else None,
                        "max": max(samples) if samples else None})
                except Exception as exc:
                    result["sample"].append({"band": band, "error": str(exc)})
        result["status"] = "observado"
    except Exception as exc:
        result.update(status="indisponível ou sem acesso", error=str(exc))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True, help="Projeto de cobrança do Earth Engine")
    parser.add_argument("--pixels", action="store_true", help="Amostragem exploratória grosseira")
    parser.add_argument("--only", help="Filtra rótulos, por exemplo 'M4 v02'")
    args = parser.parse_args()
    ee.Initialize(project=args.project)
    results = [inspect(label, *spec, args.pixels) for label, spec in ASSETS.items()
               if not args.only or args.only.lower() in label.lower()]
    print(json.dumps({"note": "Zeros não são falhas. Anos presentes em qualquer banda; "
                              "não valida todas as famílias nem pixels mascarados.",
                      "results": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
