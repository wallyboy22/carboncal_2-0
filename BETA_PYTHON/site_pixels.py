"""Extrai séries anuais de pixels de exemplo dos 4 assets públicos para o site.

Gera docs/data/pixels.json: para cada ponto, cada módulo e cada variável, uma lista
anual (estoque em tC/ha; perdas e remoções convertidas para tCO2e/ha dividindo pela
área do pixel). Uso (na raiz CCAL):
  ..\\venv\\Scripts\\python.exe -m BETA_PYTHON.site_pixels
"""
import json
import re
import sys
from pathlib import Path

import ee

from . import auth
from .statistics_ccal import MODULES, PUBLIC

POINTS = [  # (id, rótulo, lon, lat)
    ('ac_corte_desm', 'Acre · corte seletivo e desmatamento', -70.099129, -8.343379),
    ('ac_fogo_desm', 'Acre · fogo e desmatamento', -72.843379, -8.765676),
    ('ac_corte', 'Acre · corte seletivo', -70.611705, -8.227767),
    ('ac_fogo_corte_desm', 'Acre · fogo, corte e desmatamento', -69.71537, -8.620149),
    ('ac_fogo_desm_2', 'Acre · fogo e desmatamento (2)', -73.366736, -7.359998),
    ('ac_fogo_corte', 'Acre · fogo e corte seletivo', -70.287235, -8.303764),
    ('go_savana_fogo', 'Cerrado (GO) · savana com fogo', -47.70989, -15.624012),
    ('go_savana_desm', 'Cerrado (GO) · savana desmatada', -47.723365, -15.514598),
    ('go_savana_forte', 'Cerrado (GO) · fogo recorrente', -47.783732, -15.500853),
    ('ac_fogo_desm_reg', 'Acre · fogo, desmatamento e regeneração', -69.835834, -8.581612),
    ('ac_corte_fogo_desm', 'Acre · corte, fogo e desmatamento', -68.187612, -9.319484),
    ('ac_desm_reg', 'Acre · desmatamento e regeneração', -73.787145, -7.34841),
]
OUT = Path(__file__).resolve().parents[1] / 'docs' / 'data' / 'pixels.json'


def main():
    ee.Initialize(credentials=auth.load('workspace2'), project='mapbiomas-brazil')
    fc = ee.FeatureCollection([ee.Feature(ee.Geometry.Point([lon, lat]), {'pid': pid}) for pid, _, lon, lat in POINTS])
    area = ee.Image.pixelArea().divide(1e4).rename('pixel_area_ha')
    result = {'points': [{'id': p, 'label': l, 'lon': x, 'lat': y} for p, l, x, y in POINTS], 'modules': {}}
    for module, (name, _) in MODULES.items():
        img = ee.Image(PUBLIC + name).unmask(0).addBands(area)
        rows = img.sampleRegions(fc, scale=30, geometries=False).getInfo()['features']
        per_point = {}
        for row in rows:
            props = row['properties']
            ha = props['pixel_area_ha']
            series = {}
            for band, value in props.items():
                m = re.match(r'(.+)_(\d{4})$', band)
                if not m:
                    continue
                var, year = m.group(1), int(m.group(2))
                if var != 'stock':
                    value = value / ha  # tCO2e por pixel -> tCO2e/ha
                series.setdefault(var, {})[year] = round(value, 2)
            per_point[props['pid']] = {v: [s[y] for y in sorted(s)] for v, s in series.items()}
            per_point[props['pid']]['years'] = sorted(next(iter(series.values())))
        result['modules'][module] = per_point
        print(module, len(per_point), 'pontos', flush=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(OUT, OUT.stat().st_size, 'bytes')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
