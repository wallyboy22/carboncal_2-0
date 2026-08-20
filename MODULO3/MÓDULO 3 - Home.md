---
tags:
  - modulo3
  - ccal
  - carbono
created: 2026-05-27
---

# CCAL — Módulo 3

> **QCN/MapBiomas** — Estoque de carbono, emissões, fogo, degradação e transições de uso da terra.

---

## Visão Geral

O Módulo 3 segue mapas e abordagens metodológicas utilizadas por diferentes grupos e parceiros do IPAM, com o que há de mais atual na pesquisa e monitoramento de estoques de carbono, emissões, fogo, degradação e transições de uso e cobertura da terra.

### Características exclusivas:

1. **Considera toda a vegetação nativa** mapeada (Florestas, Savanas e Campos), não apenas fitofisionomias oficiais UNFCCC.
2. **Contabiliza a regeneração** da vegetação secundária, calculando emissões brutas e remoções líquidas.

---

## Versões

| Versão | Descrição | Status |
|--------|-----------|--------|
| [[v036/00_readme\|v036]] | Versão atual — unificada, modular, com equações separadas | ✅ Ativa |
| [[v035/]] | Versão anterior — scripts monolíticos | 📦 Legada |

> 📝 **[[Diferenças v035 vs v036|Comparativo detalhado v035 vs v036]]** — diferenças gerais e específicas entre as duas versões
> 📘 **[[v036/Guia v036|Guia Completo da v036]]** — arquitetura, módulos, pipeline e execução

---

## Dinâmicas de Emissão e Remoção

### Módulos de Equação

| Módulo | Gases | Bandas (t/ha) | Descrição |
|--------|-------|---------------|-----------|
| [[v036/equations/01_secondary_veg.js|Veg. Secundária]] | — | `sec_veg_increment_YYYY` (tC/ha) | Incremento por regeneração, age-based |
| [[v036/equations/02_fire_forest.js|Fogo em Florestas]] | CO₂, CO₂ bruto, CH₄, N₂O, CO, NOx (6) | `CO2_tC_ha`, `CO2_gross_t_ha`, `CH4_t_ha`, `N2O_t_ha`, `CO_t_ha`, `NOX_t_ha` | FATE v2-1: mortalidade, combustão, decomposição |
| [[v036/equations/03_fire_savanna.js|Fogo em Savanas]] | CO₂, CH₄, N₂O, CO, NOx (5) | `CO2_tC_ha`, `CH4_t_ha`, `N2O_t_ha`, `CO_t_ha`, `NOX_t_ha` | Severidade (TSF+Freq), combustão 3 compartimentos |
| [[v036/equations/04_fire_grassland.js|Fogo em Campos]] | CH₄, N₂O, CO, NOx (4) | `CH4_t_ha`, `N2O_t_ha`, `CO_t_ha`, `NOX_t_ha` | Apenas não-CO₂, balanço CO₂ neutro |
| [[v036/equations/05_logging.js|Corte Seletivo]] | CO₂ | `logging_tC_ha_YYYY` | DETER Amazônia 2017–2024, 19.6% perda AGB |

> **Nota**: Todos os módulos produzem valores em **t/ha** (CO₂ em tC/ha, demais gases em t/ha). A conversão para tCO₂e/pixel ocorre na integração.

---

## 🗂️ Datasets de Entrada

| Dataset | Fonte |
|---------|-------|
| MapBiomas LULC Col 10.1 | `projects/mapbiomas-public/assets/brazil/lulc/collection10_1/` |
| MapBiomas Desmatamento/Veg Sec | `projects/mapbiomas-public/assets/brazil/lulc/collection10_1/` |
| QCN Retificada (estoques C) | `projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10` |
| MapBiomas Fire Col 4.1 | `projects/mapbiomas-public/assets/brazil/fire/collection4_1/` |
| Corte Seletivo DETER | `projects/ee-ipam/assets/MRV_REDD_PARA/0_Activity_Year/` |
| Incrementos Veg. Secundária | `projects/ee-ipam/assets/CCAL/incrementos_modulo3` |
| Biomas IBGE 250mil | `projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil` |

---

## Produto Final

**Asset:** `projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO3-v036`

| Banda | Unidade | Descrição |
|-------|---------|-----------|
| `loss_fire_YYYY` | tCO₂e/pixel | Emissões por fogo (floresta + savana) — mascarado por cicatriz de degradação |
| `loss_selective_logging_YYYY` | tCO₂e/pixel | Emissões por corte seletivo — mascarado por cicatriz |
| `loss_convergence_degradation_YYYY` | tCO₂e/pixel | Convergência fogo + corte seletivo no mesmo pixel |
| `loss_grassland_YYYY` | tCO₂e/pixel | Emissões não-CO₂ por fogo em campos |
| `loss_deforestation_YYYY` | tCO₂e/pixel | Emissões por supressão da vegetação |
| `gain_secondary_vegetation_YYYY` | tCO₂e/pixel | Remoção por regeneração (valor negativo = ganho) |
| `stock_YYYY` | tC/ha | Estoque de carbono remanescente |

### Assets Intermediários

Pasta: `projects/ee-ipam/assets/CCAL/MODULO3/v036/`

| Asset | Conteúdo |
|-------|----------|
| `biomass_stock_v036` | Estoque bruto de biomassa (tC/ha) |
| `secondary_veg_increment_v036` | Incremento veg. secundária (tC/ha) |
| `fire_forest_emissions_v036` | 6 gases de fogo em floresta (t/ha) |
| `fire_savanna_emissions_v036` | 5 gases de fogo em savana (t/ha) |
| `fire_grassland_emissions_v036` | 4 gases de fogo em campo (t/ha) |
| `logging_emissions_v036` | Corte seletivo (tC/ha) |

---

## Links Rápidos

- [[v036/Guia v036|Guia Completo da v036]] — arquitetura, pipeline e execução
- [[v036/00_readme|Documentação original]]
- [[v036/01_unified_modulo3_v036.js|Script unificado]] — computa tudo inline
- [[v036/02_toExport_modulo3.js|Script de exportação]] — consome assets, balanço final
- [[v036/03_investigate_modulo3.js|Auditoria interativa]] — click-to-inspect

---

## 👥 Equipe

**IPAM Amazônia** — Wallace Silva, Bárbara Zimbres, Manuela Padilha, Celso Silva Junior, Camila Silva, Aline Pontes, Edriano Souza, Livia Laureto, Paulo Moutinho, Ane Alencar
