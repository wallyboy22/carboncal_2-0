"""Testes sintéticos Earth Engine, somente leitura; não submete exports.

As expressões reproduzem isoladamente as operações revisadas dos stages. Não
importam os scripts JS nem validam automaticamente os assets publicados.
"""
import argparse
import math

import ee

SENTINEL = -9999


def scalar(image):
    return image.rename("v").unmask(SENTINEL, False).reduceRegion(
        reducer=ee.Reducer.first(), geometry=ee.Geometry.Point([-55, -10]), scale=30, maxPixels=100
    ).get("v")


def image(value):
    return ee.Image.constant(value if value is not None else 0).updateMask(
        ee.Image.constant(0 if value is None else 1))


def exclusive(edge, logging, fire):
    """Mesma lógica positiva e exclusiva de M4 v02 Stage 00."""
    a, b, c = (image(v) for v in (edge, logging, fire))
    ma, mb, mc = a.gt(0), b.gt(0), c.gt(0)
    ab = a.add(b).updateMask(ma.And(mb).And(mc.Not()))
    ac = a.add(c).updateMask(ma.And(mc).And(mb.Not()))
    bc = b.add(c).updateMask(mb.And(mc).And(ma.Not()))
    abc = a.add(b).add(c).updateMask(ma.And(mb).And(mc))
    any_conv = ma.And(mb).And(mc.Not()).Or(ma.And(mc).And(mb.Not())) \
        .Or(mb.And(mc).And(ma.Not())).Or(ma.And(mb).And(mc))
    total = ab.unmask(0).add(ac.unmask(0)).add(bc.unmask(0)) \
        .add(abc.unmask(0)).updateMask(any_conv)
    return ab, ac, bc, abc, total


def spill(values, stock):
    """Espelha o spill por banda e a máscara anual de estoque dos stages."""
    first = image(values[0]).selfMask()
    out = [first]
    for value in values[1:]:
        out.append(out[-1].multiply(0).blend(image(value).selfMask()))
    return [item.updateMask(image(mask).gt(0)) for item, mask in zip(out, stock)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    args = parser.parse_args()
    ee.Initialize(project=args.project)
    cases = [
        ((0, 0, 0), (None, None, None, None, None)),
        ((2, 0, 0), (None, None, None, None, None)),
        ((0, 3, 0), (None, None, None, None, None)),
        ((0, 0, 4), (None, None, None, None, None)),
        ((2, 3, 0), (5, None, None, None, 5)),
        ((2, 0, 4), (None, 6, None, None, 6)),
        ((0, 3, 4), (None, None, 7, None, 7)),
        ((2, 3, 4), (None, None, None, 9, 9)),
        ((2, None, 4), (None, None, None, None, None)),
    ]
    expressions, expected = {}, {}
    for i, (inputs, outputs) in enumerate(cases):
        for j, (actual, wanted) in enumerate(zip(exclusive(*inputs), outputs)):
            key = f"m4_case_{i}_band_{j}"
            expressions[key] = scalar(actual)
            expected[key] = SENTINEL if wanted is None else wanted
    # M1/M2/M3 usam interseção de emissões positivas; sem evento mascarado.
    for i, (fire, logging, wanted) in enumerate([(4, 0, None), (4, 3, 7),
                                                 (0, 3, None), (4, None, None)]):
        f, log = image(fire), image(logging)
        expressions[f"pair_{i}"] = scalar(f.add(log).updateMask(f.gt(0).And(log.gt(0))))
        expected[f"pair_{i}"] = SENTINEL if wanted is None else wanted
    # Stock becomes zero in the deforestation year: that year is masked.
    for i, (result, wanted) in enumerate(zip(spill([0, 4, 0, 3, 0, 0], [1, 1, 1, 1, 0, 0]),
                                               [None, 4, 0, 3, None, None])):
        expressions[f"active_{i}"] = scalar(result)
        expected[f"active_{i}"] = SENTINEL if wanted is None else wanted
    # Explicit deforestation masking, even if a stock/AGC input is positive.
    for i, (stock, deforested, wanted) in enumerate([(1, 0, 2), (1, 1, None),
                                                      (0, 0, None)]):
        valid = image(stock).gt(0).And(image(deforested).Not())
        expressions[f"explicit_deforestation_{i}"] = scalar(image(2).updateMask(valid))
        expected[f"explicit_deforestation_{i}"] = SENTINEL if wanted is None else wanted
    # M2: positive AGB change is removal; negative AGB change is emission.
    for i, (factor, stock_delta, emission) in enumerate([
            (0.021, 2.1, -2.1 * 44 / 12),
            (-0.004, -0.4, 0.4 * 44 / 12),
            (-0.02, -2.0, 2.0 * 44 / 12),
            (0, 0, 0)]):
        delta = ee.Image.constant(100).multiply(factor)
        for label, result, wanted in [
                ('delta_stock', delta, stock_delta),
                ('signed_emission', delta.multiply(-44 / 12), emission),
                ('loss', delta.multiply(-44 / 12).max(0), max(emission, 0)),
                ('gain', delta.multiply(-44 / 12).min(0), min(emission, 0))]:
            key = f'savanna_{i}_{label}'
            expressions[key] = scalar(result)
            expected[key] = wanted
    actual = ee.Dictionary(expressions).getInfo()
    errors = [(key, value, actual.get(key)) for key, value in expected.items()
              if actual.get(key) is None or not math.isclose(actual[key], value, abs_tol=1e-8)]
    for key, wanted, got in errors:
        print(f"FAIL {key}: expected={wanted} actual={got}")
    print(f"Testes EE: {len(expected) - len(errors)}/{len(expected)} verificações aprovadas")
    print("Limites: expressões isoladas; política de dado ausente e convergência com remoção permanecem pendentes.")
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
