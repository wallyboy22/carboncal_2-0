"""Operações comuns; nenhuma função deste arquivo inicia exports."""
import ee


def stack(images):
    images = list(images)
    if not images:
        return ee.Image().select()
    # Image.cat also nests addBands linearly; a balanced tree avoids Python's
    # serializer recursion limit for 507-band products while preserving order.
    while len(images) > 1:
        images = [ee.Image(images[i]).addBands(images[i + 1]) if i + 1 < len(images)
                  else ee.Image(images[i]) for i in range(0, len(images), 2)]
    return ee.Image(images[0])


def spill(images):
    """Reproduz selfMask/blend dos stages para imagens de banda única."""
    previous = ee.Image(images[0]).selfMask()
    output = [previous]
    for current in images[1:]:
        current = ee.Image(current)
        previous = previous.multiply(0).rename(current.bandNames()).blend(current.selfMask())
        output.append(previous)
    return output


def convergence_pair(fire, logging):
    fire, logging = ee.Image(fire), ee.Image(logging)
    return fire.add(logging).updateMask(fire.gt(0).And(logging.gt(0)))
