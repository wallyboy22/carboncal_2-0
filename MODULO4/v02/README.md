---
tags:
  - modulo4
  - v02
  - ccal
  - convergencia
created: 2026-10-09
---

# CCAL — Módulo 4 (Dano Climático) — v02

Versão derivada do método M4 v01 para 1986–2024. Mantém as fórmulas e os canais de emissão individuais de borda, logging e fogo; atualiza fontes com versões mais recentes quando há substituto compatível. v01 permanece preservada.

## Fontes

| Entrada | Asset v02 | Nota |
|---|---|---|
| Limite Brasil | `projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026` | Substitui o limite pessoal antigo |
| QCN AGB | `projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1` (`cagb`) | Mantém a linhagem QCN original do M4 |
| Cobertura | `mapbiomas_brazil_collection11_coverage_v3` | C11, bandas `classification_1985`–`classification_2025` |
| Transições | `mapbiomas_brazil_collection11_deforestation_secondary_vegetation_by_coverage_v1` | C11; 1987–2025; classe 4 é desmatamento de vegetação primária |
| Fogo anual | `mapbiomas_fire_collection51_annual_burned_v1` | C5.1; evento anual convertido para máscara por `burned_area_YYYY > 0` |
| Idade de borda | `edgesAge_mb_c101_390m_1986_2024_v2` | Derivado YbYrá mais recente disponível no projeto; 1986–2024 |
| Idade de vegetação secundária | `secondary_forest_age_collection10_1_v8_1` | Derivado YbYrá mais recente disponível no projeto; 1986–2024 |
| Frequência de logging | `logging_frequency_v1` | Derivado YbYrá mais recente disponível no projeto; logging até 2024 |
| B/K Chapman–Richards | `ee-ybyra-br-sf/assets/{B,K}_30m` | Mantidos |

As camadas YbYrá de idade de borda, idade secundária e frequência de logging não têm uma versão derivada mais recente disponível no diretório auditado; permanecem as versões de dados mais novas dessa mesma linhagem. Para 1986, a máscara de desmatamento continua usando a banda legada, pois o produto de transições C11 começa em 1987.

## Convergência de degradação

Degradações: **borda**, **corte seletivo** e **fogo**. As combinações são anuais, por pixel, e mutuamente exclusivas:

| Banda | Condição | Valor |
|---|---|---|
| `loss_convergence_edge_logging_YYYY` | borda + logging, sem fogo | perda de borda + logging |
| `loss_convergence_edge_fire_YYYY` | borda + fogo, sem logging | perda de borda + fogo |
| `loss_convergence_logging_fire_YYYY` | logging + fogo, sem borda | perda de logging + fogo |
| `loss_convergence_edge_logging_fire_YYYY` | borda + logging + fogo | soma das três perdas |
| `loss_convergence_degradation_YYYY` | qualquer uma das quatro combinações acima | agregado exclusivo de convergência |

Cada conjunto também possui `mask_convergence_<combinação>_YYYY` no Stage 00. Os componentes `loss_edge`, `loss_selective_logging` e `loss_fire` permanecem separados. Desmatamento e remoção secundária não entram na convergência; o agregado de convergência não é somado novamente ao `net_balance`.

O Stage 01 aplica spill e máscara de estoque às bandas de componentes e de combinações. A classe de land cover “degradada” continua baseada na ocorrência de **qualquer** uma das três degradações, não na convergência, para preservar os pixels com evento isolado.

## Outputs

- Stage 00 anual: `projects/ee-ipam/assets/CCAL/MODULO4/v02/emissions_removals_v02/{year}`
- Produto consolidado: `projects/ee-ipam/assets/CCAL/MODULO4/v02/CCAL_MODULO4-v02`
- Land cover: `projects/ee-ipam/assets/CCAL/MODULO4/v02/land_cover_masks`

Scripts:

- `stage_00-ccal_04_emissions_removals_v02.js`
- `stage_01-ccal_04_final_product_v02.js`
- `assets_v02.js`

Os componentes de emissão seguem as equações, fatores e ordem de processamento da v01. As bandas novas registram apenas interseções e não substituem os componentes originais.
