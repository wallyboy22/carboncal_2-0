"""Operações comuns; nenhuma função deste arquivo inicia exports."""
import ee


def stack(images):
    result = ee.Image().select()
    for image in images:
        result = result.addBands(image)
    return result


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
