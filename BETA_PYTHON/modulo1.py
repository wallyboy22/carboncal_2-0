"""M1: beta do Stage 01 v04; não inclui o cálculo Stage 00 por bioma."""
import ee
from .common import convergence_pair, spill, stack

PREFIXES = ("amz", "cerr", "pan", "pam", "caa", "ma")
SOURCE = "projects/ee-ipam/assets/CCAL/MODULO1/v04"
BIOMES = "projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026"


def load(kind, year, prefix, source=SOURCE):
    im = ee.Image(f"{source}/{prefix}_{kind}_{year}")
    return im.select("total") if kind == "stock_carbon" else im.select([0])


def mosaic(kind, year, prefixes, bounds, source=SOURCE, same_footprint=False):
    """Paridade com Stage 01 local corrigido; True reproduz footprint anterior."""
    result = ee.Image(0)
    for prefix in prefixes:
        result = result.add(load(kind, year, prefix, source).unmask(0, same_footprint))
    return result.clip(bounds)


def build_stage01(source=SOURCE, start=2017, end=2024):
    """Equivalente estrutural do Stage 01; destinos e exports não são gerados."""
    bounds = ee.FeatureCollection(BIOMES).geometry().bounds()
    years = list(range(start, end + 1))
    stocks = [mosaic("stock_carbon", start - 1, PREFIXES, bounds, source).rename(f"stock_{start - 1}")]
    fires, logs, defs, convs = [], [], [], []
    for y in years:
        fire = sum_images([mosaic("emission_fire_" + gas, y, ["amz"], bounds, source)
                           for gas in ("co2", "ch4", "n2o")]).rename(f"loss_fire_{y}")
        log = mosaic("emission_sl_co2", y, ["amz"], bounds, source).rename(f"loss_selective_logging_{y}")
        de = sum_images([mosaic("emission_def_co2", y, PREFIXES, bounds, source),
                         mosaic("emission_def_ch4", y, ["amz", "cerr"], bounds, source),
                         mosaic("emission_def_n2o", y, ["amz", "cerr"], bounds, source)])
        fires.append(fire); logs.append(log); defs.append(de.rename(f"loss_deforestation_{y}"))
        stocks.append(mosaic("stock_carbon", y, PREFIXES, bounds, source).rename(f"stock_{y}"))
        convs.append(convergence_pair(fire, log).rename(f"loss_convergence_degradation_{y}"))
    masked = []
    for group in (fires, logs, convs):
        masked.extend(img.updateMask(stocks[i + 1].gt(0)) for i, img in enumerate(spill(group)))
    final = stack(masked + [im.selfMask() for im in defs] + [im.selfMask() for im in stocks]).float()
    per_ha = {name: stack(items).divide(ee.Image.pixelArea().multiply(0.0001)).float()
              for name, items in (("loss_fire_t_ha", fires), ("loss_selective_logging_t_ha", logs),
                                  ("loss_convergence_degradation_t_ha", convs), ("loss_deforestation_t_ha", defs))}
    per_ha["stock_tC_ha"] = stack(stocks).float()
    reference = stocks[0].unmask(0).gt(0)
    was_deforested, was_degraded = ee.Image(0), ee.Image(0)
    land_cover = []
    for i, stock in enumerate(stocks):
        def_year, fire, logging = ee.Image(0), ee.Image(0), ee.Image(0)
        if i:
            def_year = stocks[i - 1].gt(0).And(stock.eq(0))
            fire, logging = fires[i - 1].gt(0), logs[i - 1].gt(0)
        was_deforested = was_deforested.Or(def_year)
        was_degraded = was_degraded.Or(fire).Or(logging)
        anthropic = reference.Not().Or(was_deforested.And(def_year.Not()))
        preserved = stock.gt(0).And(was_degraded.Not()).And(def_year.Not())
        degraded = stock.gt(0).And(was_degraded).And(def_year.Not())
        land_cover.append(ee.Image(0).where(anthropic, 1).where(preserved, 2)
                          .where(degraded, 3).where(def_year, 4)
                          .rename(f"land_cover_{start - 1 + i}"))
    per_ha["land_cover_masks"] = stack(land_cover).byte()
    return {"final": final, "densities": per_ha, "bounds": bounds,
            "note": "Stage 01 portado estruturalmente; paridade espacial não comprovada."}


def sum_images(images):
    result = ee.Image(images[0])
    for image in images[1:]:
        result = result.add(image)
    return result


def preview_stock(year=2024, source=SOURCE):
    """Diagnóstico: estoque somado e número de footprints válidos por bioma."""
    bounds = ee.FeatureCollection(BIOMES).geometry().bounds()
    count = ee.Image(0)
    for prefix in PREFIXES:
        count = count.add(load("stock_carbon", year, prefix, source).mask().unmask(0, False).gt(0))
    return (mosaic("stock_carbon", year, PREFIXES, bounds, source).rename("stock_tC_ha")
            .addBands(count.clip(bounds).rename("biome_valid_count"))
            .set({"module": "M1", "version": "v05-beta", "source_version": "v04",
                  "year": year, "product": "diagnostic_only", "validated_nationally": False}))
