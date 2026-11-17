"""Compara protótipo M4 com Stage 00 já exportado em um recorte pequeno."""
import argparse
import ee
from .modulo4 import convergence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--year", type=int, required=True, choices=range(1986, 2025))
    parser.add_argument("--bounds", nargs=4, type=float, required=True)
    args = parser.parse_args()
    w, s, e, n = args.bounds
    if not (-74.96 <= w < e <= -32.9 and -34.62 <= s < n <= 10.7 and e-w <= 0.2 and n-s <= 0.2):
        parser.error("bounds must be a Brazilian extent at most 0.2 degrees wide and high")
    ee.Initialize(project=args.project)
    region = ee.Geometry.Rectangle(args.bounds, None, False)
    im = ee.Image(f"projects/ee-ipam/assets/CCAL/MODULO4/v04/emissions_removals_v04/{args.year}")
    suffix = "_" + str(args.year)
    e, l, f = (im.select(name + suffix) for name in ("loss_edge", "loss_selective_logging", "loss_fire"))
    em = im.select("mask_edge" + suffix).And(e.gt(0))
    lm = im.select("mask_logging" + suffix).And(l.gt(0))
    fm = im.select("mask_fire" + suffix).And(f.gt(0))
    result = convergence(e, l, f, em, lm, fm)
    bands = {"edge_logging": "loss_convergence_edge_logging", "edge_fire": "loss_convergence_edge_fire",
             "logging_fire": "loss_convergence_logging_fire", "triple": "loss_convergence_edge_logging_fire",
             "aggregate": "loss_convergence_degradation"}
    flags = ee.Image().select()
    for name, reference in bands.items():
        actual, source = result[name], im.select(reference + suffix)
        mask_diff = actual.mask().unmask(0, False).neq(source.mask().unmask(0, False))
        diff = actual.unmask(0, False).subtract(source.unmask(0, False)).abs().gt(1e-5)
        flags = flags.addBands(mask_diff.Or(diff).rename(name))
    flags = flags.addBands(result["mask"].unmask(0, False).rename("event"))
    summary = flags.reduceRegion(ee.Reducer.sum().unweighted(), region, 30, maxPixels=1000000).getInfo()
    pixels = ee.Image.constant(1).reduceRegion(ee.Reducer.count(), region, 30, maxPixels=1000000).getInfo()
    print("Recorte:", args.bounds, "ano:", args.year, "pixels:", pixels.get("constant"))
    print("Divergências por banda e número de eventos:", summary)
    if any(summary.get(name, 0) for name in bands):
        raise SystemExit("Divergências encontradas; investigar antes de assumir paridade")
    if not summary.get("event", 0):
        print("Nenhum evento encontrado: este teste não valida valores positivos de convergência.")


if __name__ == "__main__":
    main()
