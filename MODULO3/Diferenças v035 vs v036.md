---
tags:
  - modulo3
  - ccal
  - changelog
  - v035
  - v036
created: 2026-05-27
---

# Diferenças entre v035 e v036 — Módulo 3

> Comparação detalhada entre as duas versões do pipeline de emissões por mudança de uso e degradação.

---

## 1. 📊 Tabela Resumo

| Aspecto | v035 (`CCAL_MODULO3-v035_a`) | v036 (`CCAL_MODULO3-v036`) |
|---------|------------------------------|----------------------------|
| **Arquitetura** | 6 scripts monolíticos independentes | 3 scripts principais + 5 módulos de equação |
| **Documentação** | Nenhuma | `00_readme.md` (224 linhas) |
| **MapBiomas LULC** | Col 10 — `collection10_integration_v2` | Col 10.1 — `collection10_1_coverage_v1` |
| **MapBiomas Desf/Reg** | Col 10 — `deforestation_secondary_vegetation_v2` | Col 10.1 — `deforestation_secondary_vegetation_v1` |
| **Máscara de vegetação** | Estática — `13_3_Stable_cover` (SEEG13, fixa no último ano) | Dinâmica — `desf_reg == 2` × `lulc` (ano a ano) |
| **Correção classe 7** | Remap por vizinho (`prev × 10 + post`, 9 padrões) | Forward-backward fill |
| **Tabela incrementos** | Carregada de FeatureCollection externo (`incrementos_modulo3`) | Hardcoded no código (6 biomas × 2 classes) |
| **Fire forest** | 6 assets exportados separadamente (1 por bioma), 6 gases em g/ha e Mg/ha | Mosaico único, 6 gases em t/ha, mesmo modelo FATE v2-1 |
| **Fire savanna** | Recursão `iterateYears()` com severidade (4 níveis), 5 gases em total/pixel | `forEach` com severidade (mesmos 3 níveis), 5 gases em t/ha |
| **Fire grassland** | `litter×0.883 + (agb+cdw)×0.331`, 4 gases em g/ha | Mesma fórmula, 4 gases em t/ha |
| **Logging** | 2 versões exportadas (v1=total, v2=densidade) | 1 função pura, saída única em tC/ha |
| **Cicatriz de degradação** | ❌ Não implementado | ✅ `hist_deg_mask`: pixel marcado se degradado 1×, zera se desmatado |
| **Auditoria / Inspector** | ❌ Nenhum | ✅ UI interativa click-to-inspect (matriz 40 anos × 30+ métricas) |
| **Integração** | Script separado (`biomass_with_emssions_descont`) | Seção interna do script unificado |
| **Export** | 1 produto final com todas as bandas | 7 assets (1 final + 6 intermediários) |

---

## 2. 🗂️ Estrutura de Arquivos

### v035
```
v035/
├── biomass-QCN_MBLULC10                     (598 linhas)
├── biomass_with_emssions_descont-QCN_MBLULC10 (1188 linhas)
├── fire_forest_emission-QCN_MBLULC10        (800 linhas)
├── fire_grassland_emission-QCN_MBLULC10     (257 linhas)
├── fire_savana_emission-QCN_MBLULC10        (248 linhas)
└── logging_forest_emission-QCN_MBLULC10     (158 linhas)
```
Cada script é **autossuficiente** — carrega seus próprios datasets, calcula e exporta.

### v036
```
v036/
├── 00_readme.md                             ← Documentação geral
├── 01_unified_modulo3_v036.js               ← Script unificado (828 linhas)
├── 02_toExport_modulo3.js                   ← Pipeline de exportação (228 linhas)
├── 03_investigate_modulo3.js                ← Ferramenta de auditoria (548 linhas)
└── equations/
    ├── 01_secondary_veg.js                  ← Incremento vegetação secundária
    ├── 02_fire_forest.js                    ← Emissões fogo florestal (FATE v2-1)
    ├── 03_fire_savanna.js                   ← Emissões fogo savana
    ├── 04_fire_grassland.js                 ← Emissões fogo campo
    └── 05_logging.js                        ← Emissões corte seletivo
```
Arquitetura **modular**: equações exportáveis (`exports.calc*`), orquestrador central, separação compute/export.

---

## 3. 🧱 Máscaras de Vegetação

| Característica | v035 | v036 |
|---------------|------|------|
| **Fonte** | `13_3_Stable_cover` da SEEG13 (calculado externamente) | Construído inline de `desf_reg_corrected × lulc` |
| **Temporalidade** | Estática — repete a máscara do último ano (2024) para todos os anos | Dinâmica — calculada ano a ano |
| **Floresta** | `stable_mask.eq(3)` — classe 3 do SEEG13 | `desf_reg == 2 AND lulc == 3` |
| **Savana** | `stable_mask.eq(4)` — classe 4 do SEEG13 | `desf_reg == 2 AND lulc == 4` |
| **Campo** | `stable_mask.eq(11).or(12).or(50)` — classes SEEG13 | `desf_reg == 2 AND lulc IN [11,12,50]` |

**Implicação**: v036 é mais precisa temporalmente — um pixel que era vegetação em 1990 mas virou desmatamento em 2000 só recebe degradação até 2000. Na v035, receberia degradação em todos os anos.

---

## 4. 🔧 Correção da Classe 7 (Outras Transições)

### v035 — `processBands()` (linhas 178–214)
```javascript
// Cria máscara para processar pixels sem valor 7
var simple_lulc_extended = simple_lulc.updateMask(desf.neq(7));
// Estende série temporal com bandas-espelho nas pontas
// Para cada ano:
//   prev = lastNonNull de todas bandas anteriores
//   post = firstNonNull de todas bandas posteriores
//   sum = prev * 10 + post
//   remap[0,1,2,10,11,12,20,21,22] → [0,1,2,1,1,3,2,1,2]
```
Usa o LULC simplificado (antrópico=1/vegetação=2) como referência, expande as pontas com bandas artificiais (`classification_1984` e `classification_2025`), faz um `lastNonNull`/`firstNonNull` e remapeia 9 combinações possíveis.

### v036 — Forward-Backward Fill (linhas 72–86)
```javascript
// Forward: preenche classe 7 com o último valor válido anterior
// Backward: preenche classes 7 remanescentes com o primeiro valor válido futuro
```
Lógica mais simples e direta: forward fill usando `slice(-1)` acumulativo, depois backward fill invertendo a lista de anos.

---

## 5. 🌱 Vegetação Secundária (Incremento)

| Aspecto | v035 | v036 |
|---------|------|------|
| **Fonte dos incrementos** | FeatureCollection `incrementos_modulo3` (asset externo, 12 features) | Tabela hardcoded no código (objeto JS) |
| **Valores (Amazônia, Floresta)** | Carregados dinamicamente de `.getNumber('Ctotal_ate20')` | `lt20: 4.7841`, `gte20: 1.1698` (fixos) |
| **Valores (Amazônia, Campo)** | Idem | `lt20: 1.7000`, `gte20: 0` |
| **Cálculo de idade** | `container_sec_veg_age` — acumula 1 por ano onde `veg_sec == true` | `age_prev.add(1).multiply(sec_year)` — mesmo conceito |
| **Teto** | `container_increment.where(gt(keep), keep)` — cap no total carbon | `increment_year.where(increment_year.gt(total), total)` |
| **Classes consideradas** | `desf_corrected.eq(3).or(eq(5))` | `desf_reg_corrected.eq(3).or(eq(5))` — idêntico |

**Nota**: A v036 introduz uma distinção de classe de cobertura (`is_forest` = `grass_forest.neq(1)`) que permite aplicar incremento florestal até em pixels com `grass_forest == 0`, enquanto a v035 usa `grass_forest_year.eq(1)` vs `eq(2)` sem tratar o caso 0.

---

## 6. 🔥 Fogo em Florestas (FATE v2-1)

Ambas usam o **modelo FATE v2-1** com os mesmos parâmetros biofísicos por bioma.

| Aspecto | v035 | v036 |
|---------|------|------|
| **Parâmetros** | `biome_dict` com `AGBloss_lookup[39]`, `turnover`, `decomp_rate`, `fwd_combf`, `cwd_combf_single/multi`, `cwd_part_multi` | `BIOME_DICT` com mesmos parâmetros (idênticos) |
| **Diferenças por bioma** | Fatores de combustão variam: `fwd_combf` = 0.683 (Amazônia/Cerrado) vs 0.983 (Caatinga); `cwd_combf_s` = 0.643 vs 0.629 vs 0.719 | **Idêntico** |
| **Máscara** | `mask_stable.eq(3)` estática + `maskRegion` (bioma geometry) | `forest_mask` dinâmica + `biome_mask` (raster) |
| **Export** | 6 assets separados por bioma: `amazonia-CO2_Mg_ha_balance-SEEG13`, `caatinga-CO2_Mg_ha_balance-SEEG13`, etc. | Mosaico único: `CO2_mosaic.where(biome_mask, CO2_y)` com bandas `CO2_tC_ha_YYYY` |
| **Unidade CO₂** | `Mg CO2 ha-1` (megagrama), depois convertido para negativo (emissão) | `tC/ha` (mantido em carbono, conversão para CO₂e no balanço final) |
| **Cálculo CO₂** | `CO2_Mg_ha = fAGNcomb * 0.099 + fCBalance * 3.67 * (-1)` | `CO2_y = (fAGNcomb * 0.099 + fCBalance) * (-1)` em tC/ha |
| **CH₄** | `fAGNcomb * 2000 * 6.8 / 1e6` → g/ha convertido pra Mg/ha | `fAGNcomb * 2000 * 6.8 / 1e6` → t/ha |
| **N₂O** | `fAGNcomb * 2000 * 0.2 / 1e6` → g/ha | `fAGNcomb * 2000 * 0.2 / 1e6` → t/ha |
| **CO, NOX** | Exportados em g/ha | Exportados em t/ha (`CO_t_ha`, `NOX_t_ha`) — mesmos fatores IPCC |
| **CO₂ bruto** | Exportado como `CO2_g_ha_comb_read_warning` | Exportado como `CO2_gross_t_ha` (t/ha) |
| **Total de gases** | 6 | 6 |

---

## 7. Fogo em Savanas

**Metodologia idêntica na v036 corrigida.**

| Aspecto | v035 | v036 |
|---------|------|------|
| **Método** | Severidade = `TSF_class + Freq_class` (classes de 1-4 cada) → range 2-8 → `calcularMudanca()` com 3 níveis | **Idêntico** — mesmo cálculo de severidade, mesmos 3 níveis (+2.1%, −0.4%, −2.0%) |
| **Iteração** | Função recursiva `iterateYears(1986, 2025)` com `calculateCEmissions(year)` | `years.forEach(...)` com `current_agb` atualizado a cada iteração |
| **AGB update** | `agb = agb + agb × fire × factor` — pode ganhar (severidade baixa = +2.1%) | `current_agb = current_agb.add(...)` — idêntico |
| **Combustão** | `litter × 0.873 + agb26 × 0.873 + dw × 0.459`, via `×2000 × EF / 1e6` | Idêntico: 3 compartimentos, mesmos fatores |
| **Fatores emissão** | CO₂ via AGB loss, CH₄=2.3, N₂O=0.21, CO=65, NOX=3.9 | Idênticos |
| **Máscara** | `stable_florest.eq(4)` — estática SEEG13 | `savanna_mask` — dinâmica, ano a ano |
| **Saída** | 5 gases em total t/pixel (CO₂, CO, CH₄, N₂O, NOx) | 5 gases em t/ha: `CO2_tC_ha`, `CH4_t_ha`, `N2O_t_ha`, `CO_t_ha`, `NOX_t_ha` |
| **Gases exportados** | 5 | 5 |

---

## 8. Fogo em Campos

| Aspecto | v035 | v036 |
|---------|------|------|
| **Máscara** | `mask_stable` estática (classes 11, 12, 50 do SEEG13) | `grassland_mask` dinâmica (por ano) |
| **Combustão litter** | `litter × 0.883` | Idêntico |
| **Combustão AGB+CDW** | `(agb + cdw) × 0.331` | Idêntico |
| **Fatores de emissão** | CO=65, CH₄=2.3, N₂O=0.21, NOX=3.9 (g/ha) | Idênticos (t/ha via ×2000×EF/1e6) |
| **Gases exportados** | CO, CH₄, N₂O, NOX (4) | CH₄, N₂O, CO, NOX (4) |
| **Aplicação** | `accumulated_burned × 0 .blend(annual_fire × gas)` | `comb_total × pixel_mask` — apenas no ano do fogo |

---

## 9. Corte Seletivo (Logging)

| Aspecto | v035 | v036 |
|---------|------|------|
| **Fonte** | `slYearDis` + `slYearGeo` (DETER, ordenado e geométrico) | Mesma fonte |
| **Máscara** | `mask_stable` estática + `amazonMask` (correta: 1 dentro, 0 fora) | `forest_mask` dinâmica + `amazon_mask` — corrigido para `ee.Image(0).paint(...).eq(1)` |
| **Fração de perda** | 0.196 (19.6%) — hardcoded | 0.196 — passado como parâmetro |
| **Atualização AGB** | `agbSelectiveLoggingUpdated -= selectiveLoggingCarbon` | `agbUpdated -= logging_carbon_year.unmask(0)` — mesma lógica |
| **Saída no balanço** | `selectiveLoggingEmiss / 3.67` → convertido para tC | `logging_tC_ha_YYYY` → já em tC/ha |
| **Acumulação de cicatriz** | `reduce('max')` — uma vez marcado, permanece | `hist_deg_mask` no integration (independente do módulo) |

---

## 10. ⚖️ Integração e Balanço Final

### v035 (script `biomass_with_emssions_descont`)
```
stock = asset externo (biomass_stock_tC_ha-v034)
accumulated_degradation = soma acumulada de (-fire_emiss_co2 / 3.67 - logging / 3.67)
stock_updated = stock + accumulated_degradation (apenas onde desf == 2)
def_reg_balance = (stock - past_stock_total) * (-1) * 3.67

final_image:
  loss_fire          = fireEmiss_co2e (CO₂ + CH₄×28 + N₂O×265)
  loss_selective_logging = selectiveLoggingEmiss
  loss_convergence    = fire + logging (interseção)
  gain_secondary_veg  = def_reg_balance < 0
  loss_grassland      = fireGrasslandBalance_co2e
  loss_deforestation  = def_reg_balance > 0 AND sem degradação acumulada
  stock               = stock_updated (tC/ha)
```

### v036 (script `01_unified_modulo3_v036.js`)
```
biomass_stock = construído inline (primário = total, secundário = incremento)

accumulated_degradation = subtração ano a ano:
  accum_y = prev - CO2_floresta - CO2_savana - logging_tC

stock_updated = stock_bruto + accum (apenas onde desf == 2)

delta_stock = past_stock - stock_updated
degradation_tC_y = CO2_floresta + CO2_savana + logging_tC

net_deforestation = max(0, delta_stock - degradation_tC_y)  ← NOVO: evita dupla contagem
gain_sec_veg = abs(min(0, delta_stock)) × is_sec_veg
```

**Diferença crucial**: v036 subtrai a degradação do delta antes de calcular desmatamento, prevenindo que a mesma biomassa seja contada como emissão de degradação E de desmatamento no mesmo ano. Na v035, a condição `accumulated_degradation.eq(0)` tenta mitigar isso, mas de forma menos direta.

**Cicatriz de degradação** (exclusivo v036): `hist_deg_mask` acumula pixels que sofreram degradação (fogo ou corte seletivo) ao menos uma vez. As bandas `loss_fire` e `loss_selective_logging` são mascaradas por essa cicatriz. Se o pixel é desmatado (`desf != 2`), a cicatriz é zerada. Isso garante que emissões de degradação só apareçam em áreas com histórico de degradação que permanecem como vegetação nativa.

---

## 11. 📦 Produto Final (Bandas)

| Banda | v035 | v036 |
|-------|------|------|
| `loss_fire_YYYY` | ✅ | ✅ |
| `loss_selective_logging_YYYY` | ✅ | ✅ |
| `loss_convergence_degradation_YYYY` | ✅ | ✅ (apenas no `toExport`) |
| `gain_secondary_vegetation_YYYY` | ✅ | ✅ |
| `loss_grassland_YYYY` | ✅ | ✅ |
| `loss_deforestation_YYYY` | ✅ | ✅ |
| `stock_YYYY` | ✅ | ✅ |
| **Unidade emissões** | tCO₂e/pixel (total por pixel) | tCO₂e/pixel (total por pixel) |
| **Unidade stock** | tC/ha (densidade) | tC/ha (densidade) |
| **Asset final** | `CCAL_MODULO3-v035_a` | `CCAL_MODULO3-v036` |

---

## 12. 🆕 Funcionalidades Exclusivas da v036

### 12.1 Auditor Técnico (`initCCALInspector`)
- UI interativa com clique no mapa
- Matriz colorida de **40 anos × 30+ métricas**
- Métricas: LULC, classe desf/reg, idade veg. secundária, incremento, área queimada, frequência, TSF, estoque, emissões de fogo floresta (CO₂/CO₂bruto/CH₄/N₂O/CO/NOx), savana (CO₂/CH₄/N₂O/CO/NOx), campo (CH₄/N₂O/CO/NOx), logging, ganho secundário, desmatamento
- Alternância de unidade (`tCO2e/ha`, `tC/ha`, `kgCO2e/ha`, `kgC/ha`, por pixel)
- Transposição da matriz (vertical ↔ horizontal)
- Cores por classe (paleta MapBiomas) e por intensidade (escalas de cor)

### 12.2 Export Modular (`active_export_key`)
- 7 assets exportáveis independentemente:
  - `biomass_stock_v036` — estoque bruto (tC/ha)
  - `secondary_veg_increment_v036` — incremento veg. secundária
  - `fire_forest_emissions_v036` — fogo floresta (6 gases: CO₂/CO₂bruto/CH₄/N₂O/CO/NOx)
  - `fire_savanna_emissions_v036` — fogo savana (5 gases: CO₂/CH₄/N₂O/CO/NOx)
  - `fire_grassland_emissions_v036` — fogo campo (4 gases: CH₄/N₂O/CO/NOx)
  - `logging_emissions_v036` — corte seletivo
  - `CCAL_MODULO3-v036` — produto final consolidado

### 12.3 Equações como Módulos Exportáveis
Cada arquivo em `equations/` exporta uma função pura via `exports.*`:
```javascript
exports.calcSecondaryVegIncrement = function(params) { ... }
exports.calcForestFireEmissions = function(params) { ... }
exports.calcSavannaFireEmissions = function(params) { ... }
exports.calcGrasslandFireEmissions = function(params) { ... }
exports.calcLoggingEmissions = function(params) { ... }
```
Isso permite reuso em outros projetos (MRV REDD+, SEEG, FREL) sem duplicação de código.

### 12.4 Metadados Markdown nos Assets
Cada asset exportado inclui descrição formatada em markdown no campo `description` das propriedades da imagem.

---

## 13. 🗺️ Datasets de Entrada — Mudanças

| Dataset | v035 | v036 |
|---------|------|------|
| LULC | `collection10/mapbiomas_brazil_collection10_integration_v2` | `collection10_1/mapbiomas_brazil_collection10_1_coverage_v1` |
| Desf/Reg | `collection10/...deforestation_secondary_vegetation_v2` | `collection10_1/...deforestation_secondary_vegetation_v1` |
| QCN | `c_rect_col10` (mesmo) | `c_rect_col10` (mesmo) |
| Fire Annual | `collection4_1/...annual_burned_v1` (mesmo) | `collection4_1/...annual_burned_v1` (mesmo) |
| Fire Frequency | `collection4_1/...fire_frequency_v1` (mesmo) | `collection4_1/...fire_frequency_v1` (mesmo) |
| Time Since Fire | `collection4_1/...time_after_fire_v1` (mesmo) | `collection4_1/...time_after_fire_v1` (mesmo) |
| Incrementos | FeatureCollection `incrementos_modulo3` (12 linhas) | Hardcoded (objeto JS) |
| Stable Cover | `13_3_Stable_cover` (SEEG13) | ❌ Não usado — construído inline |
| DETER Logging | `MRV_REDD_PARA/0_Activity_Year/degradation_YYYY_sl_*` (mesmo) | Mesma fonte |

---

## 14. 📈 Resumo das Melhorias

| # | Melhoria | Impacto |
|---|----------|---------|
| 1 | Máscaras dinâmicas (ano a ano) | Precisão temporal — degradação só aplicada enquanto o pixel é vegetação |
| 2 | Correção classe 7 simplificada | Menos código, mesma semântica, mais legível |
| 3 | Integração inline (sem asset externo de biomassa) | Reprodutibilidade — não depende de rodar script de biomassa antes |
| 4 | Mosaico único para fire forest | 6 exports → 1, reduzindo custo de armazenamento |
| 5 | Equações exportáveis | Reuso em outros projetos do IPAM |
| 6 | Prevenção explícita de dupla contagem | `net_deforestation = delta - degradation` |
| 7 | Ferramenta de auditoria | Validação visual interativa de qualquer pixel da série histórica |
| 8 | Separação compute/export | `unified` calcula, `toExport` só exporta — evita recomputação |
| 9 | Metadados markdown | Documentação embedada nos assets |
| 10 | Incrementos hardcoded | Independência de asset externo, valores auditáveis no código |
| 11 | Cicatriz de degradação | `hist_deg_mask` — emissões de degradação só em pixels com histórico |
| 12 | Gases completos por módulo | Floresta=6, Savana=5, Campo=4 — todos em t/ha |

---

## 15. Correções Aplicadas (2026-05-27)

Após auditoria completa do código, os seguintes bugs foram corrigidos na v036:

| Módulo | Bug | Correção |
|--------|-----|----------|
| `02_fire_forest.js` (equations) | CO₂ com `×3.67` e nome errado `CO2_tC_ha`; faltavam CO, NOX, CO₂ bruto; `tsf_edit` com ordem invertida | Removido `×3.67`; adicionados 3 gases; corrigida ordem `multiply(0).slice(1)` |
| `01_unified` (forest) | CO₂ sem `×3.67` quando deveria ter (na verdade estava correto — tC/ha puro) | Mantido tC/ha; conversão `×3.67` feita na integração |
| `03_fire_savanna.js` (equations) | `agb.subtract(...)` invertia sinal; CO₂ com `×44/12` em excesso; combustão sem `pixel_area_ha`; nomes `*_tC_ha` para gases não-CO₂ | `.add()` igual v035; removido `×44/12`; IPCC `×2000×EF/1e6`; nomes `*_t_ha` |
| `01_unified` (savanna) | TSF-remap com tabelas florestais (metodologia errada); `combf_cwd=0.331` | Severity-based igual v035; `cwd=0.459`; `agb.add()` |
| `04_fire_grassland.js` (equations) | `(litter+agb+cdw)×0.883` em vez de `litter×0.883 + (agb+cdw)×0.331` | Fórmula corrigida; adicionados CO e NOX |
| `01_unified` (grassland) | Mesmo bug da fórmula | Corrigido |
| `01_unified` (logging) | Amazon mask `ee.Image(1).paint(...).eq(1)` = no-op (1 em todo lugar) | `ee.Image(0).paint(...).eq(1)` |
| `02_toExport` | Seletores regex `'.*CO2.*_'` capturavam CO₂ bruto + balanço; CO₂ sem `×3.67` na soma com CH₄/N₂O | Seletores exatos; adicionado `×TC_TO_TCO2` |
| `01_unified` (integração) | Sem `hist_deg_mask` | Adicionada cicatriz de degradação |
| `03_investigate` | Faltavam gases novos (CO, NOX) de savana e campo; faltava incremento veg. secundária | Adicionados todos os gases e métricas |
