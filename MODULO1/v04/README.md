---
tags:
  - modulo1
  - v04
  - ccal
created: 2026-10-08
---

# CCAL — Módulo 1 (FREL/MRV) — v04

Nova pasta de versão, derivada da v03, configurada para a janela 2017–2024 e para os assets de saída abaixo. Preserva a lógica FREL e a mesma base de carbono da v03 (QCN original + EBA); atualiza os dados de referência sem trocar a linhagem da QCN e usa o limite de biomas IBGE 2026.

## Entradas atualizadas

- QCN original, igual à v03: `projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1` (bandas `cagb`, `cbgb`, `cdw`, `clitter`).
- Biomas: `projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026`.
- Mantidos por não haver substitutos FREL indicados: assets EBA, PRODES 2024 e DETER anual.

## Assets de saída v04

- Emissões por bioma: `projects/ee-ipam/assets/CCAL/MODULO1/biomes_v6/`
- Produto nacional: `projects/ee-ipam/assets/CCAL/MODULO1/v04/`
- Produto final: `projects/ee-ipam/assets/CCAL/public/ccal_02/ccal_02_brazil_modulo_1_frell_v4`

## Scripts e execução

- `stage_00-ccal_02_modulo_01_frell_brazil_v04.js`: cálculo anual e exports por bioma para `biomes_v6/`.
- `stage_01-ccal_02_modulo_01_frell_brazil_v04.js`: mosaico, spill, land cover, densidades e produto final.

Executar Stage 00 primeiro e aguardar seus exports; depois executar Stage 01. A QCN mantém as bandas minúsculas usadas pela v03. O Stage 00 mantém fatores, parametrizações FREL e a combinação QCN + EBA da v03; troca somente as fontes de dados definidas para esta versão, incluindo o limite IBGE 2026.

Se ainda não existirem no Earth Engine, criar as pastas `CCAL/MODULO1/biomes_v6` e `CCAL/MODULO1/v04` antes dos exports.
