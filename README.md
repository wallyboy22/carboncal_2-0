# CCAL · Calculadora de Carbono (IPAM)

Este repositório gera mapas anuais a 30 m de estoque de carbono, emissões e remoções da vegetação nativa no Brasil. As emissões cobrem desmatamento, fogo, corte seletivo e efeito de borda; as remoções vêm da vegetação secundária. O cálculo roda no Google Earth Engine e é organizado em quatro módulos metodológicos.

- **Site e estatísticas:** https://wallyboy22.github.io/carboncal_2-0/ (pasta `docs/`)
- **Fonte da verdade:** o repositório Git do Earth Engine (`users/workspaceipam/CCAL`). Este GitHub é um espelho dele.

## Módulos e assets públicos

| Módulo | Período | Asset (`projects/ee-ipam/assets/CCAL/public/ccal_02/…`) |
|---|---|---|
| M1 · FREL (PRODES/DETER) | 2016–2025 | `ccal_02_brazil_modulo_1_frell_v6_1` |
| M2 · FREL adaptado (+ fogo em savanas, corte seletivo DETER) | 2016–2025 | `ccal_02_brazil_modulo_2_frell_adaptado_v3_1` |
| M3 · QCN + MapBiomas (toda a vegetação nativa, regeneração) | 1986–2025 | `ccal_02_brazil_modulo_3_qcn_mapbiomas_v5_1` |
| M4 · borda (só floresta) | 1986–2025 | `ccal_02_brazil_modulo_4_qcn_mapbiomas_borda_v3_1` |

Unidades das bandas:

| Bandas | Unidade |
|---|---|
| `loss_*_YYYY`, `gain_*_YYYY`, `net_balance_YYYY` | tCO₂e por pixel |
| `stock_YYYY` | tC/ha |

Séries até 2025. As limitações de dados de 2025 estão na página [Dados](https://wallyboy22.github.io/carboncal_2-0/dados.html#limitacoes).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `MODULO1/` … `MODULO4/` | Scripts JavaScript do Earth Engine, por versão |
| `BETA_PYTHON/` | Fluxo em Python: estágios (`modulo*.py`), exports (`export_beta.py`), regressões (`validate*.py`, `lineage.py`), promoção (`promote.py`) e estatísticas (`statistics_ccal.py`) |
| `STATISTICS/` | Estatísticas tabulares (`ccal_02_v_1/`: bioma × UF × ano) |
| `MONITOR_EMISSOES/` | Monitor mensal de emissões por fogo |
| `docs/` | Site do GitHub Pages |

## Estatísticas

```powershell
..\venv\Scripts\python.exe -m BETA_PYTHON.statistics_ccal extract --submit   # exports no Earth Engine (bucket)
..\venv\Scripts\python.exe -m BETA_PYTHON.statistics_ccal download
..\venv\Scripts\python.exe -m BETA_PYTHON.statistics_ccal build              # CSV longo
..\venv\Scripts\python.exe -m BETA_PYTHON.site_estatisticas                  # docs/estatisticas.html
```

O CSV `docs/data/ccal_estatisticas_bioma_uf.csv` (colunas `modulo, ano, bioma, uf, variavel, unidade, valor`) pode ser ligado direto ao Looker Studio.

## Credenciais

Nenhuma credencial é versionada. Os perfis ficam em `%APPDATA%/CCAL/credentials/`. Veja `BETA_PYTHON/README.md`.
