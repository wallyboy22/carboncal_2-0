---
tags:
  - modulo1
  - v04
  - ccal
created: 2026-10-08
---

# CCAL — Módulo 1 (FREL/MRV) — v04

Nova pasta de versão, derivada da v03, configurada para a janela 2017–2024 e para os assets de saída abaixo. Preserva a lógica FREL e os insumos EBA/PRODES/DETER; atualiza o estoque QCN para SEEG14/Collection 11 e o limite de biomas para IBGE 2026.

## Entradas atualizadas

- QCN: `projects/ee-ipam/assets/SEEG/SEEG14/RETIFICACAO/c_rect_col11` (`AGB`, `BGB`, `CDW`, `LITTER`, `TOTAL`).
- Biomas: `projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026`.
- Mantidos por não haver substitutos FREL indicados: assets EBA, PRODES 2024 e DETER anual.

## Assets de saída v04

- Emissões por bioma: `projects/ee-ipam/assets/CCAL/MODULO1/biomes_v6/`
- Produto nacional: `projects/ee-ipam/assets/CCAL/MODULO1/v04/`
- Produto final: `projects/ee-ipam/assets/CCAL/public/ccal_02/ccal_02_brazil_modulo_1_frell_v4`

## Scripts e execução

- `stage_00-ccal_02_modulo_01_frell_brazil_v04.js`: cálculo anual e exports por bioma para `biomes_v6/`.
- `stage_01-ccal_02_modulo_01_frell_brazil_v04.js`: mosaico, spill, land cover, densidades e produto final.

Executar Stage 00 primeiro e aguardar seus exports; depois executar Stage 01. O QCN novo usa as bandas maiúsculas (`AGB`, `BGB`, `CDW`, `LITTER`). O Stage 00 mantém os fatores e parametrizações FREL da v03 e troca o limite de biomas para o FeatureCollection IBGE 2026.

Se ainda não existirem no Earth Engine, criar as pastas `CCAL/MODULO1/biomes_v6` e `CCAL/MODULO1/v04` antes dos exports.
