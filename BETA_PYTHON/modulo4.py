"""M4 v02: port parcial das combinações exclusivas de convergência."""
import ee


def convergence(edge, logging, fire, edge_mask, logging_mask, fire_mask):
    """Mesmo pixel/ano; reproduz máscaras e operações do Stage 00 JavaScript."""
    e, l, f = ee.Image(edge), ee.Image(logging), ee.Image(fire)
    em, lm, fm = ee.Image(edge_mask), ee.Image(logging_mask), ee.Image(fire_mask)
    el = em.And(lm).And(fm.Not())
    ef = em.And(fm).And(lm.Not())
    lf = lm.And(fm).And(em.Not())
    triple = em.And(lm).And(fm)
    a = e.add(l).updateMask(el)
    b = e.add(f).updateMask(ef)
    c = l.add(f).updateMask(lf)
    d = e.add(l).add(f).updateMask(triple)
    any_overlap = el.Or(ef).Or(lf).Or(triple)
    total = a.unmask(0).add(b.unmask(0)).add(c.unmask(0)).add(d.unmask(0)).updateMask(any_overlap)
    return {"edge_logging": a, "edge_fire": b, "logging_fire": c, "triple": d,
            "aggregate": total, "mask": any_overlap}
