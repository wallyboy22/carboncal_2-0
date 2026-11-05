"""Verificação sintética das funções Python no Earth Engine, sem export."""
import argparse
import math
import ee
from . import modulo1, modulo2, modulo3, modulo4
from .common import spill


def scalar(image):
    return ee.Image(image).rename("v").unmask(-9999, False).reduceRegion(
        ee.Reducer.first(), ee.Geometry.Point([-55, -10]), 30).get("v")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    args = parser.parse_args()
    ee.Initialize(project=args.project)
    tests = {}
    expected = {}
    for name, freq, tsf, delta, co2 in [("gain", 1, 8, 2.1, -2.1 * 44 / 12),
                                         ("loss", 5, 1, -2, 2 * 44 / 12)]:
        result = modulo2.savanna_response(ee.Image(100), ee.Image(1), ee.Image(freq), ee.Image(tsf))
        for key, want in (("delta_stock_tC_ha", delta), ("signed_co2_t_ha", co2)):
            tests[name + key] = scalar(result[key]); expected[name + key] = want
    for mode, want in (("parity", -4.2), ("experimental", 0)):
        result = modulo3.savanna_balance_diagnostic(ee.Image(100), ee.Image(1), ee.Image(0.021), mode)
        tests[mode] = scalar(result["difference"]); expected[mode] = want
    for code in range(8):
        edge, logging, fire = (bool(code & 4), bool(code & 2), bool(code & 1))
        result = modulo4.convergence(ee.Image(2 if edge else 0), ee.Image(3 if logging else 0),
                                     ee.Image(4 if fire else 0), ee.Image(int(edge)),
                                     ee.Image(int(logging)), ee.Image(int(fire)))
        tests[f"m4_{code}"] = scalar(result["aggregate"])
        expected[f"m4_{code}"] = (2 * edge + 3 * logging + 4 * fire
                                   if sum((edge, logging, fire)) >= 2 else -9999)
    trajectory = spill([ee.Image(x).rename(str(i)) for i, x in enumerate([0, 4, 0, 3, 0])])
    for i, (value, valid) in enumerate(zip(trajectory, [1, 1, 1, 1, 0])):
        tests[f"spill_{i}"] = scalar(value.updateMask(ee.Image(valid)))
        expected[f"spill_{i}"] = [-9999, 4, 0, 3, -9999][i]
    results = ee.Dictionary(tests).getInfo()
    errors = [(k, v, results.get(k)) for k, v in expected.items()
              if results.get(k) is None or not math.isclose(results[k], v, abs_tol=1e-7)]
    for error in errors:
        print("FAIL", error)
    print(f"Synthetic checks: {len(expected) - len(errors)}/{len(expected)}")
    stage = modulo1.build_stage01()
    names = stage["final"].bandNames().getInfo()
    assert len(names) == 41 and names[0] == "loss_fire_2017" and names[-1] == "stock_2024", names
    cover_names = stage["densities"]["land_cover_masks"].bandNames().getInfo()
    assert cover_names == [f"land_cover_{y}" for y in range(2016, 2025)], cover_names
    print("M1 Stage 01: 41 expected final band names; pixels not yet validated")
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
