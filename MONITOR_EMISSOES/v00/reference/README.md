# Earth Engine script reference

`primeiro_ensaio_uma_banda.js` preserves the earlier calculation, which produced one monthly emission band using the original QCN carbon map. It is retained for comparison and is not the current export script.

The current `gee/primeiro_ensaio.js` uses `c_rect_col11_2019` and exports three monthly bands: `emiss_CO2`, `emiss_CO2e_CH4`, and `emiss_CO2e_N2O`.

Python references kept for comparison:

- `stats_do_primeiro_ensaio_uma_banda.py`: statistics for the single-band version.
- `construir_dashboard_uma_banda.py` and `construir_dashboard_gases_v1.py`: earlier dashboard builders.

## Pipeline (v00)

1. `primeiro_ensaio.py` (or `primeiro_ensaio.js`): monthly emission images (biomass = carbon / 0.47), `--submit` to export.
2. `stats_do_primeiro_ensaio.py`: monthly tables Bioma × UF × class, exported to Drive.
3. `baixar_monitor.py`: downloads the monthly CSVs from Drive.
4. `area_territorio_bioma_uf.py`: territory area per Bioma × UF (`area_territorio_bioma_uf.csv`), used for density.
5. `construir_dashboard.py`: consolidated CSV and the self-contained dashboard HTML.
