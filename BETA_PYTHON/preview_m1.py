"""Export opcional de um recorte diagnóstico do mosaico M1 para v05 beta."""
import argparse
import ee
from .modulo1 import preview_stock

PARENT = "projects/ee-ipam/assets/CCAL/MODULO1"
FOLDER = PARENT + "/v05"
ASSET = FOLDER + "/beta_diagnostico_mosaico_2024_recorte"


def children(parent):
    result, token = [], None
    while True:
        req = {"parent": parent, "pageSize": 1000}
        if token:
            req["pageToken"] = token
        page = ee.data.listAssets(req)
        result.extend(page.get("assets", []))
        token = page.get("nextPageToken")
        if not token:
            return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--bounds", type=float, nargs=4, required=True, metavar=("WEST", "SOUTH", "EAST", "NORTH"))
    parser.add_argument("--submit", action="store_true", help="Cria pasta v05 se necessário e submete a tarefa")
    args = parser.parse_args()
    w, s, e, n = args.bounds
    if not (-74.96 <= w < e <= -32.9 and -34.62 <= s < n <= 10.7 and e-w <= 0.2 and n-s <= 0.2):
        parser.error("bounds must be a Brazilian extent at most 0.2 degrees wide and high")
    ee.Initialize(project=args.project)
    region = ee.Geometry.Rectangle(args.bounds, None, False)
    im = preview_stock().clip(region)
    print("Asset de diagnóstico parcial:", ASSET)
    print("Bandas:", im.bandNames().getInfo(), "recorte:", args.bounds)
    print("Sumário exploratório:", im.reduceRegion(ee.Reducer.minMax(), region, 1000, maxPixels=100000).getInfo())
    if not args.submit:
        print("Somente leitura; use --submit para criar a tarefa.")
        return
    versions = {x["name"]: x["type"] for x in children(PARENT)}
    if FOLDER not in versions:
        ee.data.createAsset({"type": "FOLDER"}, FOLDER)
    elif versions[FOLDER] != "FOLDER":
        raise RuntimeError("v05 exists but is not a folder")
    if ASSET in {x["name"] for x in children(FOLDER)}:
        raise RuntimeError("Destino já existe; nenhuma sobrescrita será feita")
    task = ee.batch.Export.image.toAsset(
        image=im.float(), description="CCAL_M1_v05_beta_diagnostico_recorte_2024",
        assetId=ASSET, region=region, crs="EPSG:4326",
        crsTransform=[0.00026949458523585647, 0, -180, 0, -0.00026949458523585647, 90],
        maxPixels=10000000, pyramidingPolicy={".default": "mean"})
    task.start()
    print("Tarefa submetida:", task.id)
    print("O asset poderá ser consultado após a conclusão; não é resultado nacional.")


if __name__ == "__main__":
    main()
