# CCAL Módulo 3 — v037

> **Calculadora de Carbono (CCAL)** — Instituto de Pesquisa Ambiental da Amazônia (IPAM)

---

## Visão Geral

A Calculadora de Carbono (CCAL) é uma plataforma desenvolvida pelo IPAM para monitoramento de estoques de carbono e emissões de GEE associadas ao desmatamento, fogo e degradação da vegetação nativa no Brasil.

O **Módulo 3 (SEEG/MapBiomas)** gera mapas anuais de estoque e emissões/remoções líquidas de carbono por tipo de distúrbio, com duas características exclusivas:

1. **Considera toda a vegetação nativa** (Florestas, Savanas e Campos), não apenas fitofisionomias oficiais UNFCCC
2. **Contabiliza regeneração** da vegetação secundária, calculando remoções líquidas além das emissões brutas

---

## Estrutura de Arquivos

```
v037/
├── README.md                    ← este arquivo
├── equations/                   ← módulos de equações (funções puras)
│   ├── 00_data_prep.js          ← correção desf_reg, máscaras
│   ├── 01_secondary_veg.js      ← regeneração natural
│   ├── 02_fire_forest.js        ← fogo em florestas (FATE)
│   ├── 03_fire_savanna.js       ← fogo em savanas
│   ├── 04_fire_grassland.js     ← fogo em campos
│   ├── 05_logging.js            ← corte seletivo
│   ├── 06_mass_balance.js       ← balanço de massa
│   ├── 08_degradation_mask.js   ← máscara de degradação
│   └── README.md                ← documentação das equações
├── scripts/                     ← scripts de pipeline
│   ├── stage0_data_prep.js      ← Stage 0: 5 assets prep
│   ├── stage1_emissions.js      ← Stage 1: 11 assets (emissão + degradação)
│   ├── stage2_mass_balance.js   ← Stage 2: biomass_stock
│   └── stage3_final_product.js  ← Stage 3: CCAL_MODULO3-v037
├── audits/                      ← scripts de auditoria
│   ├── README.md                ← documentação das auditorias
│   ├── audit_all_data.js        ← visualização de todos os assets
│   ├── audit_inspector.js       ← inspeção pontual de pixels
│   └── audit_plot_timeseries.js ← gráficos de série temporal
├── statistics/                  ← scripts de estatísticas
│   ├── bioma_modulo3.js         ← estatísticas por bioma
│   ├── bioma_uf_modulo3.js      ← estatísticas por bioma + UF
│   ├── uf_modulo3.js            ← estatísticas por UF
│   ├── brasil_modulo3.js        ← estatísticas nacionais
│   └── brasil_priv_pa_modulo3.js ← estatísticas com áreas protegidas
├── metodologia.md               ← documento metodológico detalhado
├── referencias.md               ← referências bibliográficas (Markdown)
├── referencias_texto.txt        ← referências em texto puro
├── referencias_gee.js           ← painel GEE pronto (ui.Panel)
└── prompts_ilustracoes.md       ← prompts para geração de infográficos IA
```

---

## Pipeline de Execução

### Stage 0 — Preparação de Dados
**Script:** `stage0_data_prep.js`  
**Assets gerados:** 5
- `desf_reg_corrected` — desf_reg com classe 7 corrigida
- `forest_mask` — Máscara de floresta primária
- `savanna_mask` — Máscara de savana primária
- `grassland_mask` — Máscara de campo primário
- `grass_forest` — Classificação 1=Campo, 2=Floresta

### Stage 1 — Emissões e Degradação
**Script:** `stage1_emissions.js`  
**Assets gerados:** 11
- `secondary_veg_increment` (tC/ha)
- `fire_forest_CO2`, `fire_forest_CH4`, `fire_forest_N2O` (tCO₂e/ha)
- `fire_savanna_CO2`, `fire_savanna_CH4`, `fire_savanna_N2O` (tCO₂e/ha)
- `fire_grassland_CH4`, `fire_grassland_N2O` (tCO₂e/ha)
- `logging_forest_CO2` (tCO₂e/ha)
- `degradation_mask` (0/1)

### Stage 2 — Balanço de Massa
**Script:** `stage2_mass_balance.js`  
**Assets gerados:** 1
- `biomass_stock` (tC/ha)

### Stage 3 — Produto Final
**Script:** `stage3_final_product.js`  
**Assets gerados:** 1
- `CCAL_MODULO3-v037` (tCO₂e/pixel para perdas, tC/ha para estoque)

---

## Auditoria

### Scripts Disponíveis
- `audit_all_data.js` — Carrega todos os assets no Map Viewer
- `audit_inspector.js` — Inspeção pontual de pixels
- `audit_plot_timeseries.js` — Gráficos de série temporal

### Fluxo Recomendado
1. `audit_all_data.js` → Visualização espacial geral
2. `audit_inspector.js` → Inspeção pontual de pixels
3. `audit_plot_timeseries.js` → Análise temporal

---

## Fundamentos Teóricos

### Atualização Dinâmica Anual

Baseada no **Princípio da Conservação de Massa**, a equação de transição é:

```
Estoque no Ano X = [Vegetação Primária (Estoque Inicial - fogo - corte seletivo - corte raso)] + [Vegetação Secundária (remoção anual por incremento)]
```

### Prevenção da Dupla Contagem

O estoque emitido pela degradação é descontado **antes** de qualquer evento de desmatamento, evitando contabilizar a mesma biomassa como emissão de incêndio e depois como emissão de desmatamento.

---

## Datasets de Entrada

| Dataset | Asset GEE |
|---------|-----------|
| MapBiomas LULC Col 10.1 | `projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_coverage_v1` |
| MapBiomas Desf/Veg Sec Col 10.1 | `projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_deforestation_secondary_vegetation_v3` |
| QCN Retificada | `projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/c_rect_col10` |
| MapBiomas Fire Col 4.1 | `projects/mapbiomas-public/assets/brazil/fire/collection4_1/` |
| Corte Seletivo DETER | `projects/ee-ipam/assets/MRV_REDD_PARA/0_Activity_Year/` |
| Tabela de Incrementos | `projects/ee-ipam/assets/CCAL/incrementos_modulo3` |
| Biomas IBGE | `projects/mapbiomas-workspace/AUXILIAR/biomas_IBGE_250mil` |

---

## Saídas — Produto Final

**Asset:** `projects/ee-ipam/assets/CCAL/MODULO3/v037/CCAL_MODULO3-v037`
**Resolução:** 30m, float32, pyramidingPolicy: median

| Banda | Unidade | Descrição |
|-------|---------|-----------|
| `loss_fire_YYYY` (1986–2024) | tCO₂e/pixel | Emissões por fogo (floresta + savana) × área |
| `loss_selective_logging_YYYY` (2017–2024) | tCO₂e/pixel | Emissões por corte seletivo × área |
| `loss_deforestation_YYYY` (1986–2024) | tCO₂e/pixel | Emissões por supressão × área |
| `gain_secondary_vegetation_YYYY` (1986–2024) | tCO₂e/pixel | Remoção por regeneração × área |
| `loss_grassland_YYYY` (1986–2024) | tCO₂e/pixel | Emissões não-CO₂ por fogo em campos × área |
| `stock_YYYY` (1986–2024) | tC/ha (densidade) | Estoque de C remanescente |

> **Nota:** Bandas `loss_*` e `gain_*` estão em tCO₂e TOTAL por pixel. A banda `stock_*` está em tC/ha (densidade).

---

## Conversões e Constantes

| Conversão | Fator |
|-----------|-------|
| tC → tCO₂ | × 3.67 |
| GWP CH₄ | × 28 (AR5, 100 anos) |
| GWP N₂O | × 265 (AR5, 100 anos) |
| tC/ha → kg | × 1000 |
| m² → ha | ÷ 10000 |
| g → Mg (t) | ÷ 1e6 |

---

## Equipe CCAL — IPAM Amazônia

Wallace Silva, Bárbara Zimbres, Manuela Padilha, Celso Silva Junior, Camila Silva, Aline Pontes, Edriano Souza, Livia Loreto, Paulo Moutinho, Ane Alencar, Jarlene Gomes, Julia Shimbo

**Modelos de emissão:**
- FATE v2-1: Camila Silva, Aline Pontes, Wallace Silva
- Savanas / Campos: IPCC 2006 Guidelines, Volume 4
- Corte seletivo: MRV REDD+ Pará / IPAM

**Contato:** https://ipam.org.br/contato/fale-conosco/

---

*Última atualização: 2026-06-08*
