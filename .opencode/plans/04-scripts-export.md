# 📋 Plano: Fluxo Natural de Export v037

> **Objetivo:** Exportar assets do Módulo 3 de forma hierárquica e modular  
> **Versão:** v037  
> **Criado em:** 2026-06-08  
> **Atualizado em:** 2026-06-08

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

STAGE 1.5 — Máscara de Degradação (depende de 02, 03, 05)
└── 08_export_degradation_mask.js   ← fire_CO2 + logging_CO2 → mask binário

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
| `08_export_degradation_mask` | 1.5 | `fire_forest_CO2`, `fire_savanna_CO2`, `logging_forest_CO2` | — |
| `06_export_mass_balance` | 2 | `01`-`05` completos | — |
| `07_export_final_product` | 3 | `06` completo | — |

---

## 📦 Assets Completos

### 📥 Inputs Externos (consultados, não gerados por nós)

| Asset | Path | Bandas | Uso |
|-------|------|--------|-----|
| **MapBiomas LULC** | `projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1` | `classification_1985` ... `classification_2024` | Tipo de cobertura |
| **MapBiomas Desf/Veg Sec** | `projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v1` | `classification_1985` ... `classification_2024` | Desmatamento/regeneração |
| **QCN Retificada** | `projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10` | `AGB`, `BGB`, `CDW`, `LITTER`, `TOTAL` | Estoques de carbono |
| **MapBiomas Fire (burned)** | `projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_annual_burned_v1` | `burned_area_1985` ... `burned_area_2024` | Área queimada anual |
| **MapBiomas Fire (frequency)** | `projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_fire_frequency_v1` | `fire_frequency_1985_...` | Frequência de fogo |
| **MapBiomas Fire (TSF)** | `projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_time_after_fire_v1` | `classification_...` | Tempo desde fogo |
| **MapBiomas Fire (accumulated)** | `projects/mapbiomas-public/assets/brazil/fire/collection4_1/mapbiomas_fire_collection41_accumulated_burned_v1` | `fire_accumulated_1985_...` | Acumulado queimado |
| **Biomas IBGE** | `projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil` | FeatureCollection | Máscara de biomas |
| **DETER Corte Seletivo** | `projects/ee-ipam/assets/MRV_REDD_PARA/0_Activity_Year/degradation_YYYY_sl_disordered` | Raster | Corte seletivo desordenado |
| **DETER Corte Seletivo** | `projects/ee-ipam/assets/MRV_REDD_PARA/0_Activity_Year/degradation_YYYY_sl_geometric` | Raster | Corte seletivo geométrico |

---

### Stage 0 — Prep/Cobertura (gerados por nós)

| Asset | Path | Bandas | Unidade |
|-------|------|--------|---------|
| `desf_reg_corrected` | `.../MODULO3/v037/desf_reg_corrected` | `classification_1985` ... `classification_2024` | classe (1-8) |
| `forest_mask` | `.../MODULO3/v037/forest_mask` | `classification_1985` ... `classification_2024` | boolean (0/1) |
| `savanna_mask` | `.../MODULO3/v037/savanna_mask` | `classification_1985` ... `classification_2024` | boolean (0/1) |
| `grassland_mask` | `.../MODULO3/v037/grassland_mask` | `classification_1985` ... `classification_2024` | boolean (0/1) |
| `grass_forest` | `.../MODULO3/v037/grass_forest` | `classification_1985` ... `classification_2024` | classe (1=Campo, 2=Floresta) |

---

### Stage 1 — Emissões (tCO₂e/ha) — conversão nas equações

| Asset | Path | Bandas |
|-------|------|--------|
| `fire_forest_CO2` | `.../MODULO3/v037/fire_forest_CO2` | `1986` ... `2024` |
| `fire_forest_CH4` | `.../MODULO3/v037/fire_forest_CH4` | `1986` ... `2024` |
| `fire_forest_N2O` | `.../MODULO3/v037/fire_forest_N2O` | `1986` ... `2024` |
| `fire_savanna_CO2` | `.../MODULO3/v037/fire_savanna_CO2` | `1986` ... `2024` |
| `fire_savanna_CH4` | `.../MODULO3/v037/fire_savanna_CH4` | `1986` ... `2024` |
| `fire_savanna_N2O` | `.../MODULO3/v037/fire_savanna_N2O` | `1986` ... `2024` |
| `fire_grassland_CH4` | `.../MODULO3/v037/fire_grassland_CH4` | `1986` ... `2024` |
| `fire_grassland_N2O` | `.../MODULO3/v037/fire_grassland_N2O` | `1986` ... `2024` |
| `logging_forest_CO2` | `.../MODULO3/v037/logging_forest_CO2` | `2017` ... `2024` |

---

### Stage 1 — Biomassa (tC/ha)

| Asset | Path | Bandas |
|-------|------|--------|
| `secondary_veg_increment` | `.../MODULO3/v037/secondary_veg_increment` | `1985` ... `2024` |

---

### Stage 1.5 — Máscara de Degradação (binário)

| Asset | Path | Bandas | Valores |
|-------|------|--------|---------|
| `degradation_mask` | `.../MODULO3/v037/degradation_mask` | `1986` ... `2024` | `0` = não degradado, `1` = degradado (fogo ou corte) |

**Lógica:**
- Antes do primeiro evento de degradação → `0` (mask)
- Depois do primeiro evento → mínimo `0` (persistente)
- Quando não é mais veg primária → `0` (sai do cálculo)
- `gt(0)` calcula área degradada (exclui ganhos de savana)

---

### Stage 2 — Balanço (tC/ha)

| Asset | Path | Bandas |
|-------|------|--------|
| `biomass_stock` | `.../MODULO3/v037/biomass_stock` | `1985` ... `2024` |

---

### Stage 3 — Produto Final (tCO₂e/pixel)

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
3. Rodar Stage 1.5 (08_export_degradation_mask.js)
   ↓ Aguardar conclusão
4. Rodar Stage 2 (06_export_mass_balance.js)
   ↓ Aguardar conclusão
5. Rodar Stage 3 (07_export_final_product.js)
   ↓
6. ✅ Produto final exportado!
```

---

## 📝 Checklist de Execução

### Stage 0
- [x] `00_export_data_prep.js` → 5 assets prep

### Stage 1
- [ ] `01_export_secondary_veg.js`
- [ ] `02_export_fire_forest.js`
- [ ] `03_export_fire_savanna.js`
- [ ] `04_export_fire_grassland.js`
- [ ] `05_export_logging.js`

### Stage 1.5
- [ ] `08_export_degradation_mask.js`

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
├── 07_export_final_product.js
└── 08_export_degradation_mask.js

equations/
├── 00_data_prep.js
├── 01_secondary_veg.js
├── 02_fire_forest.js
├── 03_fire_savanna.js
├── 04_fire_grassland.js
├── 05_logging.js
├── 06_mass_balance.js
├── 08_degradation_mask.js
└── README.md
```

---

## ⚠️ Notas Importantes

1. **Unidades:**
   - Biomassa: tC/ha (carbono)
   - Emissões: tCO₂e/ha (CO₂ equivalente)
   - Produto final: tCO₂e/pixel (total por pixel)

2. **Conversão para tCO₂e:** Acontece nas equações (02, 03, 04, 05), não no mass_balance.

3. **Nomes de bandas:**
   - Assets de cobertura: `classification_YYYY`
   - Assets de emissão/biomassa/mask: apenas o ano (`1986`, `1987`, ...)

4. **Pyramiding Policy:**
   - Cobertura: `sample`
   - Emissões/Biomassa: `median`
   - Degradação mask: `sample`

5. **Máscara de Degradação:**
   - Binário: `0` = não degradado, `1` = degradado
   - Persistente: uma vez degradado, continua até desmatamento
   - `gt(0)` calcula área degradada (exclui ganhos de savana)

---

*Atualizar este arquivo ao completar cada stage.*
