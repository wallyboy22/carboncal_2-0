# 🔍 Auditorias — CCAL Módulo 3 v037

> Scripts de auditoria, inspeção e visualização para validar os assets do pipeline.

---

## 📋 Scripts Disponíveis

### `audit_all_data.js`
**Propósito:** Carrega e visualiza **todos os assets** do pipeline v037 no Map Viewer do GEE.

**O que faz:**
- Carrega assets de todos os stages (0, 1, 2, 3)
- Adiciona camadas ao mapa com paletas apropriadas
- Permite ativar/desativar camadas para comparação visual

**Uso:**
1. Abra no GEE Code Editor
2. Execute o script
3. Use o painel esquerdo para ativar/desativar camadas

---

### `audit_inspector.js`
**Propósito:** Ferramenta de **inspeção pontual** para analisar valores de pixels.

**O que faz:**
- Interface interativa no mapa
- Clique em qualquer pixel para ver valores de todos os assets
- Mostra LULC, QCN, e todos os assets do pipeline

**Uso:**
1. Abra no GEE Code Editor
2. Execute o script
3. Clique no mapa para inspecionar um pixel

---

### `audit_plot_timeseries.js`
**Propósito:** Gera **gráficos de série temporal** para todos os assets.

**O que faz:**
- Plota média Brasil para cada asset
- Gera gráficos para:
  - Vegetação secundária
  - Fogo (floresta, savana, campo) por gás
  - Corte seletivo
  - Estoque de biomassa

**Uso:**
1. Abra no GEE Code Editor
2. Execute o script
3. Veja os gráficos no console

---

## 🔄 Fluxo de Auditoria Recomendado

1. **`audit_all_data.js`** → Visualização espacial geral
2. **`audit_inspector.js`** → Inspeção pontual de pixels específicos
3. **`audit_plot_timeseries.js`** → Análise temporal de tendências

---

## 📊 Assets Auditados

| Stage | Asset | Unidade |
|-------|-------|---------|
| 0 | `desf_reg_corrected` | classe (1-8) |
| 0 | `forest_mask` | boolean (0/1) |
| 0 | `savanna_mask` | boolean (0/1) |
| 0 | `grassland_mask` | boolean (0/1) |
| 0 | `grass_forest` | classe (1=Campo, 2=Floresta) |
| 1 | `secondary_veg_increment` | tC/ha |
| 1 | `fire_forest_CO2` | tCO₂e/ha |
| 1 | `fire_forest_CH4` | tCO₂e/ha |
| 1 | `fire_forest_N2O` | tCO₂e/ha |
| 1 | `fire_savanna_CO2` | tCO₂e/ha |
| 1 | `fire_savanna_CH4` | tCO₂e/ha |
| 1 | `fire_savanna_N2O` | tCO₂e/ha |
| 1 | `fire_grassland_CH4` | tCO₂e/ha |
| 1 | `fire_grassland_N2O` | tCO₂e/ha |
| 1 | `logging_forest_CO2` | tCO₂e/ha |
| 1 | `degradation_mask` | 0/1 |
| 2 | `biomass_stock` | tC/ha |

---

*Última atualização: 2026-06-08*
