"""M2 v03: resposta savânica ao fogo, port parcial para testes de sinal."""
import ee


def savanna_response(agb, fire, frequency, time_since_fire, mode="parity"):
    """Paridade com M2 v03 corrigido. Não implementa combustão ou Stage 00 inteiro."""
    if mode not in ("parity", "legacy_sign"):
        raise ValueError("mode must be parity or legacy_sign")
    agb, fire = ee.Image(agb), ee.Image(fire)
    freq, tsf = ee.Image(frequency), ee.Image(time_since_fire)
    fc = (ee.Image(0).where(freq.gte(1).And(freq.lt(3)), 1)
          .where(freq.gte(3).And(freq.lt(5)), 2).where(freq.gte(5).And(freq.lt(7)), 3)
          .where(freq.gte(7), 4))
    tc = (ee.Image(0).where(tsf.gte(0).And(tsf.lt(4)), 4)
          .where(tsf.gte(4).And(tsf.lt(7)), 3).where(tsf.gte(7).And(tsf.lt(10)), 2)
          .where(tsf.gte(10), 1))
    severity = fc.add(tc)
    factor = (ee.Image(0).where(severity.gte(2).And(severity.lte(3)), 0.021)
              .where(severity.gt(3).And(severity.lte(6)), -0.004)
              .where(severity.gt(6), -0.02))
    delta = agb.multiply(fire).multiply(factor)
    signed_co2_ha = delta.multiply((-44 if mode == "parity" else 44) / 12)
    return {"factor": factor, "delta_stock_tC_ha": delta, "stock_tC_ha": agb.add(delta.unmask(0)),
            "signed_co2_t_ha": signed_co2_ha, "loss_co2_t_ha": signed_co2_ha.max(0),
            "gain_co2_t_ha": signed_co2_ha.min(0)}
