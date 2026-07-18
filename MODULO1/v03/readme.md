---
tags:
  - modulo1
  - v03
  - ccal
  - frel
  - mrv
  - unfccc
created: 2026-07-18
---

# CCAL — Módulo 1 (FREL/MRV) — v03

> Metodologia oficial UNFCCC — FREL brasileiro. Estoque de carbono, emissões por desmatamento, fogo florestal e corte seletivo.

---

## 1. Visão Geral

O Módulo 1 implementa a metodologia do **Forest Reference Emission Level (FREL)** submetida pelo Brasil à UNFCCC, conforme:

> Silva-Junior, C. H. L. et al. (2026). *Increased deforestation and forest degradation jeopardize Brazil's REDD+ results in 2022.* Nature Communications.

| Parâmetro | Valor |
|---|---|
| Período | 2017–2024 |
| Biomas | Amazônia, Cerrado, Pantanal, Pampa, Caatinga, Mata Atlântica |
| Resolução | 30 m |
| Processos cobertos | Desmatamento corte raso (todos biomas), fogo florestal (Amazônia), corte seletivo (Amazônia) |
| Processos NÃO cobertos | Fogo em savana/campo, regeneração de vegetação secundária |

---

## 2. Mudanças v02 → v03

| # | Mudança | Motivo |
|---|---|---|
| 1 | `iterate()` recursivo → `ee.List.iterate()` server-side | Corrige export vazio (grafo de computação serializado corretamente) |
| 2 | `.remap()` → `where()` loop | Type-safe, imune à conversão int→float que zerava pixels no Pampa |
| 3 | `.clip(biomeFC)` → `updateMask(mask)` + `region: bounds` | Performance, sem projeção forçada |
| 4 | `crs` + `crsTransform` explícito nos exports | Projeção consistente em todos os tiles |
| 5 | `.float()` em todas as saídas | Reduz armazenamento (float64 → float32) |
| 6 | `overwrite: true` em todos os exports | Permite re-exportar sem apagar assets manualmente |
| 7 | `flag = 'WS_CCAL_modulo1-'` nos descriptions | Rastreabilidade |
| 8 | `biomesBound` → `limite_biomas_IBGE_2026` | Shape de biomas atualizado |
| 9 | `addDefCheckLayer()` + `VIS_YEAR` | Verificação visual antes de exportar |

---

## 3. Arquitetura do Script

```
┌─────────────────────────────────────────────────────────┐
│                stage_00 — Cálculo e Export               │
│                                                         │
│  Datasets ──→ Prep. forest2016 ──→ 3 Processadores      │
│                                                         │
│  processAmazon():                                       │
│    ee.List.iterate() → acumula estado (agb/bgb/dw/      │
│    litter/slLayer) + emissões (fire/sl/def) + stock     │
│    em imagem multibanda                                 │
│                                                         │
│  forEach ano: extrai bandas do resultado, exporta       │
│    por ano × gás × bioma                                │
│                                                         │
│  processCerrado() / processSimpleBiome():               │
│    mesmo padrão, sem fire/sl                            │
└─────────────────────────────────────────────────────────┘
```

### Padrão `ee.List.iterate()`

```javascript
// Inicial: imagem com estado inicial (agb, bgb, dw, litter, slLayer)
var first = ee.Image(agb0.rename('agb')).addBands(bgb0.rename('bgb'))...

// Itera anos 2017→2024 no server-side
var result = ee.Image(ee.List.sequence(START_YEAR, END_YEAR).iterate(
  function(yr, prev) {
    // 1. Extrai estado do ano anterior
    // 2. Fire → atualiza agb/dw/litter, acumula emissões
    // 3. SL → atualiza agb, acumula emissão
    // 4. Desmatamento → atualiza todos, acumula emissões + post-def
    // 5. Retorna prev.addBands([estado atualizado, emissões, stock])
  }, first
));

// Exporta cada banda por ano (client-side)
YEARS.forEach(function(y) {
  exportEmissionImage(result.select('def_co2_density_' + y), ...);
});
```

---

## 4. Datasets de Entrada

| Dataset | Asset GEE |
|---|---|
| PRODES >625ha (2024) | `users/celsojunior/prodes_brasil_2024_v20260407` |
| PRODES <625ha | `projects/ee-celsojunior/assets/yearly_deforestation_smaller_than_625ha_biome` |
| Managed Land (Amazônia) | `projects/ee-ipam/assets/Managed_Land_Brazil` |
| Vegetação Pretérita QCN | `projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2` |
| QCN Carbon Stock | `projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1` |
| EBA (Amazônia) | `projects/ee-ipam/assets/CCAL/DATASETS/FREL/EBA_{AB,BB,DW,LI}_30m` |
| DETER Fire (Amazônia) | `projects/ee-ipam/assets/CCAL/DATASETS/PRODES/PRODES_ANO_CIVIL/DeterAnoProdes_{YYYY}_fire` |
| DETER CS (Amazônia) | `projects/ee-ipam/assets/CCAL/DATASETS/PRODES/PRODES_ANO_CIVIL/DeterAnoProdes_{YYYY}_cs_disordered` |
| Biomas IBGE 2026 | `projects/ee-ipam/assets/ORIGINAIS/IBGE/limite_biomas_IBGE_2026` |
| PRODES Raw (água/não-floresta) | `projects/ee-ipam/assets/REDD/prodes_brasil_2023` |

---

## 5. Assets de Saída

**Pasta:** `projects/ee-ipam/assets/CCAL/MODULO1/biomes_v5/`

### Padrão de nomenclatura

```
{prefix}_{emission_type}_{year}
```

| Prefixo | Bioma |
|---|---|
| `amz` | Amazônia |
| `cerr` | Cerrado |
| `pan` | Pantanal |
| `pam` | Pampa |
| `caa` | Caatinga |
| `ma` | Mata Atlântica |

### Tipos de emissão exportados

| Tipo | Biomas | Unidade | Descrição |
|---|---|---|---|
| `emission_fire_co2_YYYY` | amz | tCO₂e/pixel | Emissão CO₂ por fogo florestal |
| `emission_fire_ch4_YYYY` | amz | tCO₂e/pixel | Emissão CH₄ por fogo (×28 GWP) |
| `emission_fire_n2o_YYYY` | amz | tCO₂e/pixel | Emissão N₂O por fogo (×265 GWP) |
| `emission_sl_co2_YYYY` | amz | tCO₂e/pixel | Emissão CO₂ por corte seletivo |
| `emission_def_co2_YYYY` | Todos | tCO₂e/pixel | Emissão CO₂ por desmatamento (inclui Eq.7 post-def) |
| `emission_def_ch4_YYYY` | Todos | tCO₂e/pixel | Emissão CH₄ por desmatamento (×28 GWP) |
| `emission_def_n2o_YYYY` | Todos | tCO₂e/pixel | Emissão N₂O por desmatamento (×265 GWP) |
| `stock_carbon_YYYY` | Todos | tC/ha | Estoque remanescente (agb+bgb+dw+litter) |

### Exemplo de assets para 2022

```
amz_emission_fire_co2_2022
amz_emission_fire_ch4_2022
amz_emission_fire_n2o_2022
amz_emission_sl_co2_2022
amz_emission_def_co2_2022
amz_emission_def_ch4_2022
amz_emission_def_n2o_2022
amz_stock_carbon_2022
cerr_emission_def_co2_2022
cerr_emission_def_ch4_2022
cerr_emission_def_n2o_2022
cerr_stock_carbon_2022
pan_emission_def_co2_2022
pan_stock_carbon_2022
...
```

---

## 6. Como Executar

1. Abrir `stage_00-ccal_02_modulo_01_frell_brazil_v03.js` no GEE Code Editor
2. Executar — os 6 biomas são processados em sequência
3. Aguardar todas as tasks de export no painel *Tasks*
4. Para verificar antes de exportar: alterar `VIS_YEAR` e inspecionar as camadas `Def CO2 {Bioma} {ANO}` no mapa

### Parâmetros ajustáveis

| Variável | Padrão | Descrição |
|---|---|---|
| `VIS_YEAR` | 2022 | Ano de referência para checagem visual |
| `START_YEAR` | 2017 | Primeiro ano da série |
| `END_YEAR` | 2024 | Último ano da série |
| `EXPORT_ASSET_ROOT` | `.../biomes_v5` | Pasta de destino dos exports |

---

## 7. Constantes e Equações

### Conversões

| Constante | Valor | Uso |
|---|---|---|
| `C_TO_CO2` | 44/12 (≈3.667) | tC → tCO₂ |
| `GWP_CH4` | 28 | CH₄ → CO₂e (AR5, 100 anos) |
| `GWP_N2O` | 265 | N₂O → CO₂e (AR5, 100 anos) |
| `SPATIAL_SCALE` | 30 | Resolução (m) |

### Eq. 6 — Fator de correção por bioma (f_biome)

| Bioma | f_biome |
|---|---|
| Amazônia | 1.009 |
| Cerrado | 0.995 |
| Pantanal | 1.002 |
| Pampa | 0.966 |
| Caatinga | 1.019 |
| Mata Atlântica | 1.000 |

Aplicado em TODAS as emissões (def + fire + sl).

### Eq. 7 — Remoção pós-desmatamento (f_post_def)

| Bioma | f_post_def |
|---|---|
| Amazônia | 0.042 |
| Cerrado | 0.088 |

Adicionado ao `defCO2_CO2eq` via:
```
postDefRemoval = (defCO2 + defCH4×28 + defN2O×265) × f_post_def
defCO2_CO2eq = defCO2_CO2eq + postDefRemoval
```

### Parâmetros de combustão (Amazônia)

| Parâmetro | Valor |
|---|---|
| Fração combustão (fire) | 0.368 |
| CH₄ (fire/def) | 6.8 g/kg combusted |
| N₂O (fire/def) | 0.2 g/kg combusted |
| Fração carbono na biomassa | 0.47 |
| Corte seletivo (frações) | 0.22–0.29 (varia por intensidade 1–10) |
| CH₄ (Cerrado def) | 6.8 g/kg × 0.379 (fração combustão) |


## 8. Referências

- [[v035/README|Módulo 3 v035]] — versão legada monolítica
- [[v036/00_readme|Módulo 3 v036]] — arquitetura de referência
- Silva-Junior, C. H. L. et al. (2026). *Nature Communications*
- [UNFCCC — Brazil's FREL submission](https://unfccc.int)
- [IPAM Amazônia](https://ipam.org.br)
