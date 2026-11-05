---
tags:
  - modulo4
  - v01
  - ccal
  - dano-climatico
  - ybyra-br
created: 2026-08-19
---

# CCAL — Módulo 4 (Dano Climático) — v01

> Transformação do pipeline **YbYrá-BR** (antigo `MODULO4/v00`) para o **formato de saída CCAL**, alinhado aos produtos do **Módulo 1 (FREL)** e **Módulo 3 (QCN/MapBiomas)**.

---

## 1. Objetivo

O Módulo 4 estima emissões/remoções anuais de carbono por tipo de distúrbio (efeito de borda, corte seletivo, fogo e desmatamento de vegetação primária e secundária) usando a modelagem dinâmica do YbYrá-BR (1986–2024, Brasil, 30 m).

A **v01** reempacota a saída do v00 no **padrão CCAL**:

| Convenção | Unidade | Exemplo |
|---|---|---|
| `loss_<processo>_YYYY` | tCO₂e/pixel (total × área) | `loss_fire_2022` |
| `gain_<processo>_YYYY` | tCO₂e/pixel (remoção, negativo) | `gain_secondary_vegetation_2022` |
| `stock_YYYY` | tC/ha (densidade) | `stock_2022` |
| `net_balance_YYYY` | tCO₂e/pixel | perdas − ganhos |
| `land_cover_YYYY` | classe 0–4 | `land_cover_2022` |

Essa é a mesma semântica de `CCAL_MODULO3-v037` e do consolidado `ccal_02_brazil_modulo_1_frell_v3`.

---

## 2. Mapeamento v00 (YbYrá-BR) → v01

| v00 | v01 (CCAL) | Unidade |
|---|---|---|
| `edge_co2` | `loss_edge_YYYY` | tCO₂e/pixel |
| `logging_co2` | `loss_selective_logging_YYYY` | tCO₂e/pixel |
| `fire_co2` | `loss_fire_YYYY` | tCO₂e/pixel |
| — (novo) | `loss_convergence_degradation_YYYY` | tCO₂e/pixel |
| `defor_co2` | `loss_deforestation_YYYY` | tCO₂e/pixel |
| `defor_sf_co2` | `loss_deforestation_secondary_YYYY` | tCO₂e/pixel |
| `removal_sf_co2` | `gain_secondary_vegetation_YYYY` (negativo) | tCO₂e/pixel |
| `total_primary_co2` + `defor_sf_co2` − `removal_sf_co2` | `net_balance_YYYY` | tCO₂e/pixel |
| `agc0_state` + `agc_sf_ha` | `stock_YYYY` | tC/ha |
| `edge_co2_ha`, `fire_co2_ha`, ... | `loss_*_ha_YYYY`, `gain_*_ha_YYYY` | tCO₂e/ha |
| `mask_*`, `logging_n`, `sf_age` | mantidos (com sufixo `_YYYY`) | — |

### Convergência de degradação

No Módulo 4, a degradação inclui o **efeito de borda**, exclusivo deste módulo:

```
loss_convergence_degradation_YYYY = loss_edge_YYYY + loss_fire_YYYY + loss_selective_logging_YYYY
```

> `loss_deforestation_*` e `gain_*` ficam **fora** da convergência (como em M1/M3).

---

## 3. Correção de spill — intervalo ativo de degradação

Aplicada no **Stage 01** (produto consolidado), mesma lógica do M1 stage01 e do M3 stage3:

1. Para cada banda de degradação (`loss_edge`, `loss_fire`, `loss_selective_logging`, `loss_convergence_degradation`):
   - **Spill**: propaga a máscara do ano anterior para anos seguintes sem novo evento (`prev.slice(-1).multiply(0).blend(banda_atual.selfMask())`) — valor real no ano do evento, **0 (máscara)** nos anos seguintes.
   - **Stock mask**: `updateMask(agc0_state > 0)` — a degradação só é exibida no **intervalo ativo entre a primeira degradação e o desmatamento** (estoque primário > 0). Após o desmatamento (estoque = 0), a máscara zera.
2. `loss_deforestation_*`, `gain_*`, `net_balance`, `stock`: `selfMask`, sem spill.

---

## 4. Estrutura de Arquivos

```
MODULO4/v01/
├── readme.md                                   ← este arquivo
├── stage_00-ccal_04_emissions_removals_v01.js  ← Série temporal anual
└── stage_01-ccal_04_final_product_v01.js       ← Consolidado + land cover
```

## 5. Assets de Saída

### Stage 00 — Série temporal (uma imagem por ano, 1986–2024)

**Coleção:** `projects/ee-ipam/assets/CCAL/MODULO4/v01/emissions_removals_v01/{year}`

> ⚠️ Criar a coleção antes de rodar:
> ```
> earthengine create collection projects/ee-ipam/assets/CCAL/MODULO4/v01/emissions_removals_v01
> ```

Bandas por ano (float32, `pyramiding: mean`):

| Banda | Unidade | Descrição |
|---|---|---|
| `loss_edge_YYYY` | tCO₂e/pixel | Efeito de borda × área |
| `loss_selective_logging_YYYY` | tCO₂e/pixel | Corte seletivo × área |
| `loss_fire_YYYY` | tCO₂e/pixel | Fogo × área |
| `loss_convergence_degradation_YYYY` | tCO₂e/pixel | Edge + fogo + corte seletivo × área |
| `loss_deforestation_YYYY` | tCO₂e/pixel | Desmatamento de primária × área |
| `loss_deforestation_secondary_YYYY` | tCO₂e/pixel | Desmatamento de secundária × área |
| `gain_secondary_vegetation_YYYY` | tCO₂e/pixel (negativo) | Remoção por regeneração × área |
| `net_balance_YYYY` | tCO₂e/pixel | `loss_total − gain` |
| `stock_YYYY` | tC/ha | Estoque (AGC primária + secundária), densidade |
| `loss_*_ha_YYYY` / `gain_*_ha_YYYY` | tCO₂e/ha | Densidades |
| `mask_edge/logging/fire/defor/sf/sf_defor/sf_new_YYYY` | 0/1 | Máscaras |
| `agc0_state_YYYY`, `logging_n_YYYY`, `sf_age_YYYY` | — | Diagnóstico |

### Stage 01 — Produto consolidado

**Asset:** `projects/ee-ipam/assets/CCAL/MODULO4/v01/CCAL_MODULO4-v01`
**Resolução:** 30 m, float32, `pyramiding: median`

Bandas: `loss_edge/selective_logging/fire/convergence_degradation_YYYY` (com correção de spill + stock mask), `loss_deforestation_YYYY`, `loss_deforestation_secondary_YYYY`, `gain_secondary_vegetation_YYYY`, `net_balance_YYYY`, `stock_YYYY`.

### Stage 01 — Land cover (separado)

**Asset:** `projects/ee-ipam/assets/CCAL/MODULO4/v01/land_cover_masks` (`pyramiding: mode`)

| Classe | Significado |
|---|---|
| 0 | Não observado |
| 1 | Antrópico (não-floresta ou já desmatado) |
| 2 | Preservada (primária, nunca degradada) |
| 3 | Degradada (intervalo ativo pós primeira degradação) |
| 4 | Desmatamento |

---

## 6. Datasets de Entrada (YbYrá-BR)

| Dado | Asset |
|---|---|
| Biomas | `users/celsohlsj/Biomas_250mil` |
| Floresta prévia | `CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2` |
| MapBiomas LULC 10.1 | `mapbiomas_brazil_collection10_1_coverage_v1` |
| QCN AGB | `QCN_30m_BR_v2_0_1` (banda `cagb`) |
| Fogo | `ybyra-br-model/forestFireAnnual_mb_c101_fire_c4_1986_2024_v2` |
| Desmatamento | `ybyra-br-model/deforestationAnnual_mb_c101_1986_2024_v2` |
| Borda | `ybyra-br-model/edgesAge_mb_c101_390m_1986_2024_v2` |
| Idade veg. secundária | `ybyra-br-model/secondary_forest_age_collection10_1_v8_1` |
| Corte seletivo | `ybyra-br-model/logging_frequency_v1` |
| Chapman-Richards | `ee-ybyra-br-sf/assets/{B,K}_30m` |

---

## 7. Referências

- [[CCAL/00_readme|CCAL 00 — readme]] (Módulo 3 v036, formato de saída)
- `CCAL/MODULO1/v03/readme.md` (Módulo 1 v03, formato de saída)
- `CCAL/MODULO4/v00` (YbYrá-BR v1.2 — código-fonte original)
