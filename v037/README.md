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
│   ├── 01_secondary_veg.js      ← regeneração natural
│   ├── 02_fire_forest.js        ← fogo em florestas (FATE)
│   ├── 03_fire_savanna.js       ← fogo em savanas
│   ├── 04_fire_grassland.js     ← fogo em campos
│   └── 05_logging.js            ← corte seletivo
├── scripts/                     ← scripts principais
│   ├── unified_modulo3_v037.js  ← orquestrador central (recomendado)
│   ├── toExport_modulo3.js      ← execução modular alternativa
│   └── investigate_modulo3.js   ← diagnóstico e auditoria
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

**Asset:** `projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO3-v037`  
**Resolução:** 30m, float32, pyramidingPolicy: median

| Banda | Unidade | Descrição |
|-------|---------|-----------|
| `loss_fire_YYYY` (1986–2024) | tCO₂e/pixel | Emissões por fogo (floresta + savana) × área |
| `loss_selective_logging_YYYY` (2017–2024) | tCO₂e/pixel | Emissões por corte seletivo × área |
| `loss_convergence_degradation_YYYY` (1986–2024) | tCO₂e/pixel | Fogo + corte seletivo × área |
| `gain_secondary_vegetation_YYYY` (1986–2024) | tCO₂e/pixel (negativo) | Remoção por regeneração × área |
| `loss_grassland_YYYY` (1986–2024) | tCO₂e/pixel | Emissões não-CO₂ por fogo em campos × área |
| `loss_deforestation_YYYY` (1986–2024) | tCO₂e/pixel | Emissões por supressão × área |
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

Wallace Silva, Bárbara Zimbres, Manuela Padilha, Celso Silva Junior, Camila Silva, Aline Pontes, Edriano Souza, Livia Loreto, Paulo Moutinho, Ane Alencar

**Modelos de emissão:**
- FATE v2-1: Camila Silva, Aline Pontes, Wallace Silva
- Savanas / Campos: IPCC 2006 Guidelines, Volume 4
- Corte seletivo: MRV REDD+ Pará / IPAM

**Contato:** https://ipam.org.br/contato/fale-conosco/

---

*Última atualização: 2026-06-08*
