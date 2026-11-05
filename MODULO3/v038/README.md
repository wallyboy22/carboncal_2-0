---
tags:
  - modulo3
  - v038
  - ccal
created: 2026-10-08
---

# CCAL — Módulo 3 — v038

Versão com MapBiomas Collection 11, Fogo Collection 5.1, QCN SEEG14 e corte seletivo binário MapBiomas Collection 10.1. O corte seletivo usa recorrência anual por pixel e a função de decaimento do Módulo 4, sem alterar os scripts do Módulo 4.

## Janela temporal

- Uso e cobertura: 1985–2025.
- Desmatamento/vegetação secundária: 1987–2024.
- Área queimada e frequência do fogo: 1985–2025.
- Tempo desde o fogo: 1985–2026.
- Estoques QCN: AGB, BGB, CDW, LITTER e TOTAL.
- Corte seletivo: 1988–2024.
- **Ano final do produto v038: 2024**, último ano comum entre os insumos necessários ao balanço completo.

O início de 1985–1986 no raster de desmatamento/regeneração é preenchido repetindo a classe de 1987, seguindo a inicialização da v037. A extensão do produto para 2025 fica fora desta versão porque faltam as bandas 2025 de desmatamento/regeneração e corte seletivo.

## Entradas GEE

| Dado | Asset |
|---|---|
| LULC C11 | `projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_coverage_v3` |
| Desmatamento/vegetação secundária C11 | `projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_deforestation_secondary_vegetation_v4` |
| Fogo anual C5.1 | `projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_annual_burned_v1` |
| Frequência do fogo C5.1 | `projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_fire_frequency_v1` |
| Tempo após fogo C5.1 | `projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_time_after_fire_v1` |
| QCN SEEG14 | `projects/ee-ipam/assets/SEEG/SEEG14/RETIFICACAO/c_rect_col11` |
| Corte seletivo binário C10.1 | `projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_degradation_logging_v2` |
| Biomas IBGE 2026 | `projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026` |
| Incrementos da vegetação secundária | `projects/ee-ipam/assets/CCAL/incrementos_modulo3` |

## Assets de saída

- Intermediários: `projects/ee-ipam/assets/CCAL/MODULO3/v038/`
- Produto final: `projects/ee-ipam/assets/CCAL/MODULO3/v038/CCAL_MODULO3-v038`

Os scripts de pipeline e equações específicos desta versão ficam nas pastas `scripts/` e `equations/`. As equações inalteradas de regeneração, fogo florestal, fogo em campos e máscara de degradação são importadas de `v037`; as entradas e equações atualizadas ficam nesta pasta.

## Ordem de execução

1. `scripts/stage0_data_prep.js`
2. `scripts/stage1_emissions.js`
3. `scripts/stage2_mass_balance.js`
4. `scripts/stage3_final_product.js`

Os exports apontam somente para os assets v038. A execução dos exports deve ser submetida no Earth Engine Code Editor depois de confirmar as tarefas e permissões do projeto.
