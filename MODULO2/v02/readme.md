---
tags:
  - modulo2
  - v02
  - ccal
  - frel-adaptado
created: 2026-08-19
---

# CCAL — Módulo 2 (FREL Adaptado) — v02

> Síntese no **formato de saída CCAL**, consolidando os assets do **Módulo 2 v01** (`CCAL/MODELOS/CCAL_MODULO_2_V1`) no padrão dos Módulos 1 e 3.

---

## 1. Objetivo

O Módulo 2 expande o Módulo 1 (FREL) ao incluir as emissões de **fogo em savanas** além das florestas primárias. A v01 exporta assets separados por compartimento (`florestas_*` / `savanas_*`) e por gás (CO₂, CH₄, N₂O).

A **v02** consolida esses assets numa imagem única no padrão CCAL, **sem re-rodar o modelo**, com o mesmo tratamento de produto final do M1 stage01 e M4 stage01:

| Convenção | Unidade | Exemplo |
|---|---|---|
| `loss_<processo>_YYYY` | tCO₂e/pixel (total × área) | `loss_fire_2022` |
| `stock_YYYY` | tC/ha (densidade) | `stock_2022` |
| `land_cover_YYYY` | classe 0–4 | `land_cover_2022` |

> O Módulo 2 não modela regeneração de vegetação secundária → **não possui** bandas `gain_*` (igual ao Módulo 1).

---

## 2. Agregação florestas + savanas → bandas CCAL

Lê os assets de `projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO_2_V1`:

| Banda v02 | Fórmula | Unidade |
|---|---|---|
| `stock_YYYY` (2016–2023) | `florestas_stock` + `savanas_stock` | tC/ha (densidade) |
| `loss_fire_YYYY` | florestas fire (comb CO₂+CH₄+N₂O) + savanas fire (comb CO₂+CH₄+N₂O + tardia loss − tardia gain) | tCO₂e/pixel |
| `loss_selective_logging_YYYY` | `florestas_sl_co2` + `savanas_sl_co2` | tCO₂e/pixel |
| `loss_convergence_degradation_YYYY` | `loss_fire` + `loss_selective_logging` | tCO₂e/pixel |
| `loss_deforestation_YYYY` | florestas def (CO₂+CH₄+N₂O) + savanas def (CO₂+CH₄+N₂O) | tCO₂e/pixel |

> ⚠️ **Ganho tardio de savana**: `savanas_fire_co2_gain_late` é **negativo**; somado ao fogo, reduz a perda líquida (mesmo tratamento do script `v01/biomass`).
>
> ✅ **Bug corrigido vs `v01/biomass`**: o corte seletivo agora usa `florestas_sl_co2` **e** `savanas_sl_co2` (o script antigo carregava `savanas_sl_co2` duas vezes).

---

## 3. Correção de spill — intervalo ativo de degradação

Mesma lógica do M1 stage01 / M3 stage3 / M4 stage01:

1. Para `loss_fire`, `loss_selective_logging`, `loss_convergence_degradation`:
   - **Spill**: propaga a máscara do ano anterior para anos seguintes sem novo evento (`prev.slice(-1).multiply(0).blend(banda_atual.selfMask())`).
   - **Stock mask**: `updateMask(stock_YYYY > 0)` → degradação visível apenas no **intervalo ativo entre a primeira degradação e o desmatamento**.
2. `loss_deforestation` e `stock`: `selfMask`, sem spill.

---

## 4. Assets de Saída

### Produto consolidado

**Asset:** `projects/ee-ipam/assets/CCAL/MODULO2/v02/CCAL_MODULO2-v02` (cópia do produto legado; série até 2023)
**Resolução:** 30 m, float32, `pyramiding: median`

Bandas: `loss_fire_YYYY`, `loss_selective_logging_YYYY`, `loss_convergence_degradation_YYYY`, `loss_deforestation_YYYY` (2017–2023, tCO₂e/pixel) e `stock_YYYY` (2016–2023, tC/ha).

### Land cover (separado)

**Asset:** `projects/ee-ipam/assets/CCAL/MODULO2/v02/land_cover_masks` (`pyramiding: mode`, classes 0–4):

| Classe | Significado |
|---|---|
| 0 | Não observado |
| 1 | Antrópico (não-floresta ou já desmatado) |
| 2 | Preservada (estoque primário, nunca degradada) |
| 3 | Degradada (intervalo ativo pós primeira degradação) |
| 4 | Desmatamento |

### Densidades (t/ha)

`projects/ee-ipam/assets/CCAL/MODULO2/v02/`
- `loss_fire_t_ha`, `loss_selective_logging_t_ha`, `loss_convergence_degradation_t_ha`, `loss_deforestation_t_ha` (tCO₂e/ha, valores brutos sem spill)
- `stock_tC_ha` (tC/ha)

---

## 5. Estrutura de Arquivos

```
MODULO2/v02/
├── readme.md                                   ← este arquivo
└── stage_01-ccal_02_modulo_02_synthesis_v02.js ← síntese CCAL
```

## 6. Notas

- **Período**: 2017–2023 (emissões) e 2016–2023 (estoque), conforme assets v01 exportados. Extensão a 2024 exige re-rodar o modelo v01.
- Convenções: perdas em **tCO₂e TOTAIS por pixel**; estoque em **tC/ha densidade**; `.float()`; CRS 4326 + crsTransform; `overwrite: true`; prefixo `WS_CCAL_M2V02-` nas descriptions.

## 7. Referências

- [[CCAL/00_readme|CCAL 00 — readme]] (Módulo 3, formato de saída)
- `CCAL/MODULO1/v03/readme.md` (Módulo 1 v03, formato de saída)
- `CCAL/MODULO2/v01/fire_forest_emission`, `fire_savana_emission`, `biomass` (modelo e síntese antiga)
