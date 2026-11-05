"""M3 v038: diagnóstico parcial de sinal de savana e balanço."""
import ee


def savanna_balance_diagnostic(agb, burned, factor, mode="parity"):
    """Compara convenção existente e hipótese: fluxo = -variação de estoque.

    Não portou a frequência, combustão, recorrência plurianual nem demais gases.
    A hipótese experimental não é validação metodológica.
    """
    if mode not in ("parity", "experimental"):
        raise ValueError("mode must be parity or experimental")
    delta = ee.Image(agb).multiply(ee.Image(burned)).multiply(ee.Image(factor))
    emitted = delta if mode == "parity" else delta.multiply(-1)
    return {"stock_delta_from_fire_equation": delta, "co2_tC_ha": emitted,
            "stock_delta_as_consumed_by_balance": emitted.multiply(-1),
            "difference": emitted.multiply(-1).subtract(delta)}
