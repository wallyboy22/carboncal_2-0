# 📋 Plano: Fluxo Natural de Export v037

> **Objetivo:** Exportar assets do Módulo 3 de forma hierárquica e modular  
> **Versão:** v037  
> **Criado em:** 2026-06-08

---

## 🏗️ Hierarquia de Execução

```
STAGE 0 — Fundação (independente)
└── 00_export_data_prep.js          ← lulc + desf_reg → 5 assets prep

STAGE 1 — Cálculos Paralelos (dependem do Stage 0)
├── 01_export_secondary_veg.js      ← prep + qcn + biomas → incremento
├── 02_export_fire_forest.js        ← prep + fire + qcn → emissões floresta
├── 03_export_fire_savanna.js       ← prep + fire + qcn → emissões savana
├── 04_export_fire_grassland.js     ← prep + fire + qcn → emissões campo
└── 05_export_logging.js            ← prep + DETER + qcn → corte seletivo

STAGE 2 — Integração (depende do Stage 1)
└── 06_export_mass_balance.js       ← todos os Stage 1 → balanço final

STAGE 3 — Produto Final (depende do Stage 2)
└── 07_export_final_product.js      ← balanço → CCAL_MODULO3-v037
```

---

## 📊 Matriz de Dependência

| Script | Stage | Depende de | Paralelo com |
|--------|-------|-----------|--------------|
| `00_export_data_prep` | 0 | Inputs brutos | — |
| `01_export_secondary_veg` | 1 | `desf_reg_corrected`, `grass_forest` | `02`, `03`, `04`, `05` |
| `02_export_fire_forest` | 1 | `forest_mask` | `01`, `03`, `04`, `05` |
| `03_export_fire_savanna` | 1 | `savanna_mask` | `01`, `02`, `04`, `05` |
| `04_export_fire_grassland` | 1 | `grassland_mask` | `01`, `02`, `03`, `05` |
| `05_export_logging` | 1 | `forest_mask` | `01`, `02`, `03`, `04` |
| `06_export_mass_balance` | 2 | `01`-`05` completos | — |
| `07_export_final_product` | 3 | `06` completo | — |

---

## 📦 Assets Gerados por Stage

### Stage 0 — Fundação
| Asset | Path | Bandas |
|-------|------|--------|
| `desf_reg_corrected` | `.../MODULO3/v037/desf_reg_corrected` | `classification_1985` ... `classification_2024` |
| `forest_mask` | `.../MODULO3/v037/forest_mask` | `classification_1985` ... `classification_2024` |
| `savanna_mask` | `.../MODULO3/v037/savanna_mask` | `classification_1985` ... `classification_2024` |
| `grassland_mask` | `.../MODULO3/v037/grassland_mask` | `classification_1985` ... `classification_2024` |
| `grass_forest` | `.../MODULO3/v037/grass_forest` | `classification_1985` ... `classification_2024` |

### Stage 1 — Cálculos
| Asset | Path | Bandas |
|-------|------|--------|
| `secondary_veg_increment` | `.../MODULO3/v037/secondary_veg_increment` | `sec_veg_increment_1985` ... `sec_veg_increment_2024` |
| `fire_forest_emissions` | `.../MODULO3/v037/fire_forest_emissions` | `CO2_tC_ha_YYYY`, `CH4_t_ha_YYYY`, `N2O_t_ha_YYYY` |
| `fire_savanna_emissions` | `.../MODULO3/v037/fire_savanna_emissions` | `CO2_tC_ha_YYYY`, `CH4_t_ha_YYYY`, `N2O_t_ha_YYYY` |
| `fire_grassland_emissions` | `.../MODULO3/v037/fire_grassland_emissions` | `CH4_t_ha_YYYY`, `N2O_t_ha_YYYY` |
| `logging_emissions` | `.../MODULO3/v037/logging_emissions` | `logging_tC_ha_2017` ... `logging_tC_ha_2024` |

### Stage 2 — Integração
| Asset | Path | Bandas |
|-------|------|--------|
| `mass_balance` | `.../MODULO3/v037/mass_balance` | Bandas consolidadas de degradação |

### Stage 3 — Produto Final
| Asset | Path | Bandas |
|-------|------|--------|
| `CCAL_MODULO3-v037` | `.../MODELOS/CCAL_MODULO3-v037` | `loss_fire_YYYY`, `loss_logging_YYYY`, `loss_deforestation_YYYY`, `gain_secondary_vegetation_YYYY`, `loss_grassland_YYYY`, `stock_YYYY` |

---

## 🔄 Fluxo de Trabalho

```
1. Rodar Stage 0 (00_export_data_prep.js)
   ↓ Aguardar conclusão
2. Rodar Stage 1 (01-05 em paralelo)
   ↓ Aguardar todos concluírem
3. Rodar Stage 2 (06_export_mass_balance.js)
   ↓ Aguardar conclusão
4. Rodar Stage 3 (07_export_final_product.js)
   ↓
5. ✅ Produto final exportado!
```

---

## 📝 Checklist de Execução

### Stage 0
- [ ] `00_export_data_prep.js` → 5 assets prep

### Stage 1
- [ ] `01_export_secondary_veg.js`
- [ ] `02_export_fire_forest.js`
- [ ] `03_export_fire_savanna.js`
- [ ] `04_export_fire_grassland.js`
- [ ] `05_export_logging.js`

### Stage 2
- [ ] `06_export_mass_balance.js`

### Stage 3
- [ ] `07_export_final_product.js`

---

## 📐 Estrutura de Arquivos

```
scripts/
├── 00_export_data_prep.js
├── 01_export_secondary_veg.js
├── 02_export_fire_forest.js
├── 03_export_fire_savanna.js
├── 04_export_fire_grassland.js
├── 05_export_logging.js
├── 06_export_mass_balance.js
└── 07_export_final_product.js

equations/
├── 00_data_prep.js
├── 01_secondary_veg.js
├── 02_fire_forest.js
├── 03_fire_savanna.js
├── 04_fire_grassland.js
├── 05_logging.js
├── 06_mass_balance.js
└── README.md
```

---

*Atualizar este arquivo ao completar cada stage.*
