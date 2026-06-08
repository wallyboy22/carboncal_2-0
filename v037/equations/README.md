# 📐 Equações do Módulo 3 — CCAL

> Módulos de cálculo reutilizáveis para estimativa de emissões e remoções de carbono  
> **Versão:** v037

---

## 📋 Visão Geral

Cada arquivo é uma **função pura** que recebe parâmetros e retorna resultados calculados.
Os módulos são independentes e podem ser usados individualmente ou combinados no orquestrador.

### Uso no GEE

```js
var prep = require('users/workspaceipam/CCAL:MODULO3/v037/equations/00_data_prep');
var result = prep.correctDesfReg(desf_reg, years);
```

---

## 🔢 Módulos

### 00 — Preparação de Dados (`00_data_prep.js`)

**Função:** Corrige e prepara dados de entrada para os demais módulos.

| Função | Input | Output |
|--------|-------|--------|
| `correctDesfReg()` | desf_reg, years | desf_reg com classe 7 corrigida (forward-backward fill) |
| `classifyGrassForest()` | lulc, years | 1=Campo, 2=Floresta |
| `createCoverageMasks()` | lulc, desf_reg_corrected, years | forest_mask, savanna_mask, grassland_mask |
| `createEmergentMask()` | lulc, threshold | Máscara de área emersa |
| `prepareAll()` | lulc, desf_reg, years | Todos os outputs acima |

**Assets gerados:**
- `desf_reg_corrected` — desf_reg com classe 7 corrigida
- `forest_mask` — Máscara de floresta primária (desf_reg==2 AND lulc==3)
- `savanna_mask` — Máscara de savana primária (desf_reg==2 AND lulc==4)
- `grassland_mask` — Máscara de campo primário (desf_reg==2 AND lulc IN [11,12,50])
- `grass_forest` — Classificação 1=Campo, 2=Floresta

---

### 01 — Vegetação Secundária (`01_secondary_veg.js`)

**Função:** Calcula incremento anual de carbono em áreas de regeneração.

| Função | Input | Output |
|--------|-------|--------|
| `calcSecondaryVegIncrement()` | desf_reg_corrected, grass_forest, total_carbon, biomas, years | sec_veg_increment (tC/ha/ano) |

**Lógica:**
- Taxas por bioma e tipo (F/G)
- Diferencia <20 anos vs ≥20 anos
- Limita ao estoque primário original

---

### 02 — Fogo em Florestas (`02_fire_forest.js`)

**Função:** Calcula emissões por fogo em formações florestais (modelo FATE).

| Função | Input | Output |
|--------|-------|--------|
| `calcForestFireEmissions()` | annual_burned, fire_frequency, time_since_fire, agb, cdw, litter, forest_mask, biomas, years | CO2, CH4, N2O (tC/ha ou t/ha) |

**Lógica:**
- Emissões imediatas (não-CO₂): serrapilheira + madeira morta
- Emissões tardias (CO₂): mortalidade de árvores com decaimento temporal
- Parâmetros específicos por bioma

---

### 03 — Fogo em Savanas (`03_fire_savanna.js`)

**Função:** Calcula emissões por fogo em formações savânicas.

| Função | Input | Output |
|--------|-------|--------|
| `calcSavannaFireEmissions()` | annual_burned, fire_frequency, time_since_fire, agb, cdw, litter, savanna_mask, years | CO2, CH4, N2O (tC/ha ou t/ha) |

**Lógica:**
- Fatores de combustão por tipo de biomassa
- Ajuste por recorrência de fogo (FRI)
- 26% da AGB como combustível fino

---

### 04 — Fogo em Campos (`04_fire_grassland.js`)

**Função:** Calcula emissões instantâneas por fogo em campos.

| Função | Input | Output |
|--------|-------|--------|
| `calcGrasslandFireEmissions()` | annual_burned, agb, cdw, litter, grassland_mask, years | CH4, N2O (t/ha) |

**Lógica:**
- Balanço CO₂ considerado neutro
- Apenas emissões não-CO₂ (combustão instantânea)

---

### 05 — Corte Seletivo (`05_logging.js`)

**Função:** Calcula emissões por exploração madeireira.

| Função | Input | Output |
|--------|-------|--------|
| `calcLoggingEmissions()` | agb, forest_mask, amazon_mask, loss_fraction, years | logging_tC_ha |

**Lógica:**
- Restrito à Amazônia
- Dados DETER (2017-2024)
- Fração de perda: 19.6% AGB

---

## 📊 Fluxo de Dados

```
Input (lulc, desf_reg, qcn, fire, logging)
    ↓
[00_data_prep] → desf_reg_corrected, masks, grass_forest
    ↓
[01_secondary_veg] → sec_veg_increment
    ↓
[02_fire_forest] → fire_forest_emissions
    ↓
[03_fire_savanna] → fire_savanna_emissions
    ↓
[04_fire_grassland] → fire_grassland_emissions
    ↓
[05_logging] → logging_emissions
    ↓
[Orquestrador] → Balanço final + Export
```

---

## ⚠️ Notas

- Todos os módulos são **funções puras** (sem efeitos colaterais)
- Unidades de entrada/saída estão documentadas em cada módulo
- Para ajustes de parâmetros, consulte `referencias.md`
- Para detalhes de exportação, consulte `scripts/`

---

*Última atualização: 2026-06-08*
