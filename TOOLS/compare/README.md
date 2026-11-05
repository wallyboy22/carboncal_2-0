# CCAL — Toolkit de Comparação de Versões (`TOOLS/compare/`)

Ferramenta de auditoria/comparação dos **assets finais** das versões do SEEG
espacializado e dos Módulos CCAL, inspirada no
`CCAL/MODULO3/v036/plot_data/investigate_modulo3.js`.

## Arquivos

| Arquivo | Tipo | Descrição |
|---|---|---|
| `catalog.js` | **módulo GEE** (via `require`) | Catálogo de schemas (assets, bandas, unidades, períodos) + loaders + conversores. Sem UI. |
| `investigate_compare.js` | script cliente (Code Editor) | Inspector: clique no mapa → matriz anos×variáveis, comparação entre versões (Δ/%), camadas. |
| `README.md` | doc | Este arquivo. |

## Uso

No Code Editor, abra `investigate_compare.js` (via repositório `users/workspaceipam/CCAL`,
pasta `TOOLS/compare/`) e execute:

1. **Modo**: `SEEG` ou `CCAL`.
2. **Versão**: escolha o asset final a inspecionar.
3. **Ano alvo (mapa)**: banda exibida nas camadas do mapa.
4. **Exibir em**: unidade (tCO₂e/ha, tC/ha, kg…, tCO₂e/px, tC/px…).
5. Marque **Comparar** e escolha a **Baseline** para ver Δ e % por célula.
6. **Clique no mapa** para inspecionar o ponto (buffer de 10 m, scale 30 m).

O botão **Camadas** abre a gaveta com uma camada por variável (ano alvo).
O botão **Inverter Matriz** transpõe linhas/colunas.

## Schemas cobertos

### SEEG espacializado (`projects/ee-ipam/assets/SEEG/SEEG13/ESPACIALIZADO/`)

| Versão | Asset(s) | Variáveis | Período | Unidades nativas |
|---|---|---|---|---|
| v00 | `v00/collection/Emissons_Removals_<50 grids>` (mosaico) | `net` | 1990–2024 | tCO₂e/ha |
| v02 | `v02/emissions_removals_spatial_brasil_v02` | `net` | 1990–2024 | tCO₂e/ha |
| v03 | `v03/emissions_removals_brasil_v03` + `emissions_only` + `removals_only` + `carbon_stock` | `net`, `emis`, `rem`, `stock` | 1990–2024 | tCO₂e/ha (CO2e), tC/ha (stock) |
| v04 | `v04/` (9 assets) | `net`, `def`, `fco2`, `fch4`, `fn2o`, `sl`, `svi`, `swd`, `swg` | 1990–2024 | tCO₂e/ha (emissões), tC/ha (estoque/incremento) |
| v06 | `v06/` (idem + `emission_edge`) | v04 + `edge` | 1990–2024 | idem |

> ⚠️ v06 depende dos exports do pipeline v06 estarem prontos nos assets.

### CCAL (`projects/ee-ipam/assets/CCAL/MODULO*/` e `.../public/ccal_02/`)

| Módulo | Asset final | Variáveis | Período | Unidades nativas |
|---|---|---|---|---|
| M1 (v3) | `public/ccal_02/ccal_02_brazil_modulo_1_frell_v3` | `lf`, `sl`, `conv`, `def`, `stock` | 2017–2024 | loss tCO₂e/px; stock tC/ha |
| M2 (v02) | `MODELOS/CCAL_MODULO2-v02` | `lf`, `sl`, `conv`, `def`, `stock` | 2017–2023 | idem |
| M3 (v037) | `MODELOS/CCAL_MODULO3-v037` | `lf`, `lg`, `sl`, `conv`, `def`, `gain`, `stock` | 1985–2024 (losses desde 1986) | idem |
| M4 (v01) | `MODELOS/CCAL_MODULO4-v01` | `edge`, `lf`, `sl`, `conv`, `def`, `defs`, `gain`, `net`, `stock` | 1986–2024 | idem |

## Convenção de bandas internas

Cada variável recebe uma chave curta sem colisão de prefixo no mosaico
`buildCombined()`:

| Chave | Significado | Chave | Significado |
|---|---|---|---|
| `net` | líquido / balanço | `fco2` `fch4` `fn2o` | fogo CO₂ / CH₄ / N₂O (CO2e) |
| `emis` / `rem` | emissões / remoções (v03) | `svi` | incremento veg. secundária (tC) |
| `def` / `defs` | desmatamento / desmat. secundária | `gain` | ganho veg. secundária |
| `lf` / `lg` | fogo / fogo campestre | `edge` | efeito de borda |
| `sl` | corte seletivo | `stock` `swd` `swg` | estoque (c/ ou s/ degradação) |
| `conv` | convergência fogo∩SL | | |

Banda resultante no mosaico: `<prefixo><chave>_<ano>` + `<prefixo>pixel_area_ha`.
O prefixo `b_` é usado para a versão baseline na comparação.

## Conversão de unidades

`catalog.convertValue(valor, kind, per, unidade, areaFact)`:
- `kind`: `CO2e` (divide por 3,67 para chegar em tC) ou `C`.
- `per`: `ha` (já por hectare) ou `px` (por pixel → divide por área do pixel).
- O resultado é convertido para a unidade alvo (`tCO2e/ha`, `tC/px`, `kgCO2e/ha`…).

## Notas

- SEEG (todos) é **por hectare**; CCAL (losses/gains/net) é **por pixel**
  (multiplicado pela área do pixel no pipeline) e o estoque por hectare.
- v00 exige o mosaico dos 50 grids (lista `gridNames` do script original).
- Períodos diferentes por versão — células sem banda aparecem como `--`.
- Para adicionar uma nova versão/módulo: insira a entrada em `SCHEMAS` no
  `catalog.js` com `load()`, `years` e `variables`; a UI se adapta sozinha.
