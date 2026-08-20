---
tags:
  - modulo3
  - v036
  - ccal
  - guia
created: 2026-05-28
---

# Guia Completo da v036 — Módulo 3

> Arquitetura, módulos de equação, pipeline de integração e execução.

---

## 1. Arquitetura

A v036 é organizada em 3 camadas:

```
v036/
├── equations/                          ← Módulos puros (exportáveis)
│   ├── 01_secondary_veg.js             → calcSecondaryVegIncrement()
│   ├── 02_fire_forest.js               → calcForestFireEmissions()
│   ├── 03_fire_savanna.js              → calcSavannaFireEmissions()
│   ├── 04_fire_grassland.js            → calcGrasslandFireEmissions()
│   └── 05_logging.js                   → calcLoggingEmissions()
│
├── 01_unified_modulo3_v036.js          ← Orquestrador (computa tudo inline)
├── 02_toExport_modulo3.js              ← Pipeline de produção (consome assets)
└── 03_investigate_modulo3.js           ← Auditoria interativa (click-to-inspect)
```

| Script | Função | Quando usar |
|--------|--------|-------------|
| `01_unified` | Computa **todos** os módulos e o balanço final em uma execução | Primeira execução, debug, testes |
| `02_toExport` | Carrega assets pré-computados e faz apenas o balanço final | Re-exportação do produto final após correções parciais |
| `03_investigate` | Interface de clique no mapa para auditar qualquer pixel | Validação visual e diagnóstica |

---

## 2. Módulos de Equação

Cada módulo em `equations/` é uma função pura exportada via `exports.*`. Recebe parâmetros e retorna uma imagem multibanda.

### 2.1 Vegetação Secundária (`01_secondary_veg.js`)

| Campo | Valor |
|-------|-------|
| **Método** | Age-based: acumula idade a cada ano, aplica incremento por bioma |
| **Parâmetros** | `desf_reg_corrected`, `grass_forest`, `total_carbon`, `biomas`, `years` |
| **Bandas** | `sec_veg_increment_YYYY` (1 por ano, 1985-2024) |
| **Unidade** | tC/ha acumulado (não delta anual) |
| **Teto** | Cap no estoque total de carbono da QCN |

Incrementos hardcoded por bioma e classe (Floresta/Campo), com distinção `lt20` / `gte20` anos:

| Bioma | F lt20 | F gte20 | G lt20 | G gte20 |
|-------|--------|---------|--------|---------|
| Amazônia | 4.7841 | 1.1698 | 1.7000 | 0 |
| Caatinga | 2.4378 | 0.5928 | 0.6000 | 0 |
| Cerrado | 3.8789 | 0.9484 | 1.7000 | 0 |
| Mata Atlântica | 3.1690 | 0.7780 | 0.6000 | 0 |
| Pampa | 2.9896 | 0.7340 | 1.7000 | 0 |
| Pantanal | 3.9159 | 0.9622 | 1.7000 | 0 |

### 2.2 Fogo em Florestas (`02_fire_forest.js`)

| Campo | Valor |
|-------|-------|
| **Modelo** | FATE v2-1 (SEEG_12) — balanço integrado de carbono |
| **Processos** | Mortalidade, combustão (single + multi-fire), decomposição, regeneração |
| **Parâmetros** | `annual_burned`, `fire_frequency`, `time_since_fire`, `agb`, `cdw`, `litter`, `forest_mask`, `biomas`, `years` |
| **Iteração** | Per-bioma: `ee.List(years).iterate(model, first)` — reprodução fiel da v035 |
| **Bandas (6)** | `CO2_tC_ha_YYYY`, `CO2_gross_t_ha_YYYY`, `CH4_t_ha_YYYY`, `N2O_t_ha_YYYY`, `CO_t_ha_YYYY`, `NOX_t_ha_YYYY` |
| **Unidade** | CO₂ em tC/ha, demais em t/ha |

Parâmetros biofísicos por bioma (idênticos à v035):

| Bioma | fwd_combf | cwd_combf_s | cwd_combf_m | cwd_part_m | turnover | decomp |
|-------|-----------|-------------|-------------|------------|----------|--------|
| Amazônia | 0.683 | 0.643 | 0.824 | 0.757 | 0.03 | 0.19 |
| Caatinga | 0.983 | 0.719 | 0.824 | 0.757 | 0.03 | 0.19 |
| Cerrado | 0.683 | 0.629 | 0.824 | 0.757 | 0.03 | 0.19 |
| Mata Atl. | 0.683 | 0.643 | 0.824 | 0.757 | 0.03 | 0.19 |
| Pampa | 0.683 | 0.629 | 0.824 | 0.757 | 0.03 | 0.19 |
| Pantanal | 0.683 | 0.629 | 0.824 | 0.757 | 0.03 | 0.19 |

### 2.3 Fogo em Savanas (`03_fire_savanna.js`)

| Campo | Valor |
|-------|-------|
| **Modelo** | Severity-based (SEEG_13) — severidade = TSF_class + Freq_class |
| **Fatores AGB** | Severidade 2-3: +2.1% (ganho), 4-6: −0.4%, 7+: −2.0% |
| **Combustão** | 3 compartimentos: `litter×0.873 + agb26×0.873 + cdw×0.459`, via IPCC `×2000×EF/1e6` |
| **Bandas (5)** | `CO2_tC_ha_YYYY`, `CH4_t_ha_YYYY`, `N2O_t_ha_YYYY`, `CO_t_ha_YYYY`, `NOX_t_ha_YYYY` |
| **Unidade** | CO₂ em tC/ha, demais em t/ha |
| **AGB update** | `agb.add(...)` — pode ganhar biomassa em severidade baixa |

### 2.4 Fogo em Campos (`04_fire_grassland.js`)

| Campo | Valor |
|-------|-------|
| **Modelo** | Combustão simples — apenas gases não-CO₂ (CO₂ é neutro) |
| **Combustão** | `litter × 0.883 + (agb + cdw) × 0.331` |
| **Bandas (4)** | `CH4_t_ha_YYYY`, `N2O_t_ha_YYYY`, `CO_t_ha_YYYY`, `NOX_t_ha_YYYY` |
| **Unidade** | t/ha |
| **AGB** | Não atualizado (campo se recupera integralmente) |

### 2.5 Corte Seletivo (`05_logging.js`)

| Campo | Valor |
|-------|-------|
| **Fonte** | DETER Amazônia — `degradation_YYYY_sl_disordered` + `degradation_YYYY_sl_geometric` |
| **Período** | 2017–2024 |
| **Fração** | 19.6% de perda do AGB no pixel afetado |
| **Bandas (1)** | `logging_tC_ha_YYYY` |
| **Unidade** | tC/ha |
| **AGB update** | Cumulativo: `agbUpdated -= carbon.unmask(0)` |

---

## 3. Pipeline de Integração

```
┌─────────────────────────────────────────────────────────────┐
│                   01_unified_modulo3_v036                    │
│                                                             │
│  Datasets ──→ Prep. Máscaras ──→ Módulos ──→ Balanço ──→ Export │
│                                                             │
│  LULC + Desf/Reg ──→ simple_lulc, grass_forest, forest_mask │
│                    ──→ savanna_mask, grassland_mask          │
│                                                             │
│  calcSecondaryVegIncrement() ──→ biomass_stock (tC/ha)      │
│  calcForestFireEmissions()   ──→ fire_forest (6 gases)      │
│  calcSavannaFireEmissions()  ──→ fire_savanna (5 gases)     │
│  calcGrasslandFireEmissions()──→ fire_grassland (4 gases)   │
│  calcLoggingEmissions()      ──→ logging (1 gás)            │
│                                                             │
│  Loop YEARS_FIRE:                                            │
│    acumula degradação                                       │
│    atualiza estoque dinâmico                                │
│    calcula delta_stock                                      │
│    separa desmatamento vs ganho secundário                  │
│    aplica hist_deg_mask                                     │
│    converte tC → tCO2e (×3.67 + GWP)                       │
│    multiplica por pixel_area_ha                             │
│                                                             │
│  Exporta 7 assets                                           │
└─────────────────────────────────────────────────────────────┘
```

O `02_toExport` faz o mesmo balanço, mas carrega os módulos como assets pré-computados em vez de executar as funções.

---

## 4. Cicatriz de Degradação

Mecanismo que evita que pixels sem histórico de degradação mostrem emissões:

```
hist_deg_mask = 0  (inicial)

Para cada ano:
  has_degradation = (fire_co2e > 0) OR (logging > 0)
  hist_deg_mask = hist_deg_mask OR has_degradation
  hist_deg_mask = hist_deg_mask AND (desf_reg == 2)  ← zera se desmatado

  loss_fire                = fire_co2e × pixelArea .updateMask(hist_deg_mask)
  loss_selective_logging   = logging_co2e × pixelArea .updateMask(hist_deg_mask)
  loss_grassland           = grass_co2e × pixelArea .selfMask()  ← sem cicatriz
```

**Efeito**: Um pixel só mostra `loss_fire` ou `loss_selective_logging` se:
1. Já sofreu degradação em algum ano (ou no ano corrente)
2. Permanece como vegetação nativa (não foi desmatado)

---

## 5. Unidades e Conversões

| Etapa | Unidade |
|-------|---------|
| Módulos de equação | CO₂: tC/ha, demais gases: t/ha |
| Integração (GWP) | CH₄ × 28, N₂O × 265 → tCO₂e/ha |
| Conversão C→CO₂ | × 3.67 (TC_TO_TCO2) |
| Área do pixel | × pixel_area_ha (m² / 10000) |
| **Produto final** | **tCO₂e/pixel** (emissões), **tC/ha** (estoque) |

---

## 6. Assets de Saída

### Produto Final

**Asset:** `projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO3-v036`

| Banda | Unidade | Anos |
|-------|---------|------|
| `loss_fire_YYYY` | tCO₂e/pixel | 1986–2024 |
| `loss_grassland_YYYY` | tCO₂e/pixel | 1986–2024 |
| `loss_selective_logging_YYYY` | tCO₂e/pixel | 2017–2024 |
| `loss_convergence_degradation_YYYY` | tCO₂e/pixel | 2017–2024 |
| `gain_secondary_vegetation_YYYY` | tCO₂e/pixel | 1986–2024 |
| `loss_deforestation_YYYY` | tCO₂e/pixel | 1986–2024 |
| `stock_YYYY` | tC/ha | 1986–2024 |

### Intermediários

**Pasta:** `projects/ee-ipam/assets/CCAL/MODULO3/v036/`

| Asset | Bandas | Unidade |
|-------|--------|---------|
| `biomass_stock_v036` | `biomass_stock_YYYY` | tC/ha |
| `secondary_veg_increment_v036` | `sec_veg_increment_YYYY` | tC/ha |
| `fire_forest_emissions_v036` | 6 gases × 39 anos | t/ha |
| `fire_savanna_emissions_v036` | 5 gases × 39 anos | t/ha |
| `fire_grassland_emissions_v036` | 4 gases × 39 anos | t/ha |
| `logging_emissions_v036` | `logging_tC_ha_YYYY` (2017-2024) | tC/ha |

---

## 7. Como Executar

### Ordem recomendada:

```
1. 01_unified_modulo3_v036.js     ← executa tudo, exporta 7 assets
   └─ Gera: biomass_stock, sec_veg_increment, fire_forest,
            fire_savanna, fire_grassland, logging, produto final

2. 02_toExport_modulo3.js         ← opcional: re-exporta o produto final
   └─ Usa os assets do passo 1, refaz só o balanço

3. 03_investigate_modulo3.js      ← validação visual
   └─ Carrega os assets do passo 1, interface de clique
```

### Para testar um módulo individual:

Cada arquivo em `equations/` tem uma seção de teste comentada com `/* ... //*/`. Para ativar:
1. Remova a linha `/*` antes da seção de teste
2. Execute no GEE Code Editor
3. Os `Map.addLayer` exibem todas as bandas de saída

---

## 8. Links

- [[../MÓDULO 3 - Home|Home do Módulo 3]]
- [[../Diferenças v035 vs v036|Comparativo v035 vs v036]]
- [[00_readme|Documentação original (readme)]]
- [[01_unified_modulo3_v036.js|Script unificado]]
- [[02_toExport_modulo3.js|Script de exportação]]
- [[03_investigate_modulo3.js|Auditoria interativa]]
