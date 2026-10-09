---
tags:
  - modulo2
  - v03
  - ccal
created: 2026-10-08
---

# CCAL — Módulo 2 (FREL Adaptado) — v03

Versão configurada para reexecutar a cadeia de origem e consolidar emissões 2017–2024 e estoques 2016–2024. Mantém o método da v01 e a mesma linhagem de carbono (QCN original + EBA); atualiza somente os dados de entrada confirmados para esta versão.

## Entradas

- QCN original, igual à v01: `projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1` (bandas `cagb`, `cbgb`, `cdw`, `clitter`).
- Fogo anual Col. 5.1: `projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_annual_burned_v1`.
- Frequência Fogo Col. 5.1: `projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_fire_frequency_v1`.
- Tempo após fogo Col. 5.1: `projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_time_after_fire_v1`.
- Limites IBGE 2026: `projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026`.
- EBA (`EBA_AB_30m`, `EBA_BB_30m`, `EBA_DW_30m`, `EBA_LI_30m`), vegetação pretérita, Managed Land, PRODES e DETER: mantidos da cadeia v01, com as versões de dados apontadas na configuração v03.

## Assets de saída v03

- Intermediários anuais: `projects/ee-ipam/assets/CCAL/MODULO2/v03/model_assets/`
- Produto consolidado: `projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO2-v03`
- Land cover: `projects/ee-ipam/assets/CCAL/MODULO2/v03/land_cover_masks`

## Dependência

O Módulo 2 v02 apenas sintetiza os assets da cadeia original e termina em 2023. A execução v03 precisa primeiro gerar os assets florestais e savânicos de 2016–2024 com as entradas atualizadas e o método da v01, e depois consolidá-los. Não reutilizar silenciosamente os intermediários v01 de 2023 como se fossem cálculo v03.

1. `stage_00-model_calculation_v03.js` gera os stocks e componentes de emissões florestais/savânicos em `model_assets/`.
2. `stage_01-ccal_02_modulo_02_synthesis_v03.js` consome esses assets e exporta o produto CCAL v03.

Antes do primeiro export, criar `CCAL/MODULO2/v03/model_assets` no Earth Engine se a pasta ainda não existir. Executar o Stage 00 e aguardar os assets anuais antes do Stage 01.
