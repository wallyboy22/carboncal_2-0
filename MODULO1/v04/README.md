---
tags:
  - modulo1
  - v04
  - ccal
created: 2026-10-08
---

# CCAL — Módulo 1 (FREL/MRV) — v04

Nova pasta de versão, derivada da v03, configurada para a janela 2017–2024 e para os assets de saída abaixo. Preserva a lógica FREL e a mesma base de carbono da v03 (QCN original + EBA); atualiza os dados de referência sem trocar a linhagem da QCN e usa o limite de biomas IBGE 2026.

## Entradas atualizadas

- QCN original, igual à v03: `projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1` (bandas `cagb`, `cbgb`, `cdw`, `clitter`).
- Biomas: `projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026`.
- Mantidos por não haver substitutos FREL indicados: assets EBA, PRODES 2024 e DETER anual.

## Assets de saída v04

- Emissões por bioma: `projects/ee-ipam/assets/CCAL/MODULO1/v04/`
- Produto nacional: `projects/ee-ipam/assets/CCAL/MODULO1/v04/`
- Produto final: `projects/ee-ipam/assets/CCAL/MODULO1/v04/ccal_02_brazil_modulo_1_frell_v4` (cópia do produto público existente).

O nome do asset público também aparece como destino em um script histórico de
`MODULO1/v02`; a cópia preserva esse produto, mas não comprova que ele foi
calculado com o código v04 atual. Confirme a procedência antes de utilizá-lo.

## Scripts e execução

- `stage_00-ccal_02_modulo_01_frell_brazil_v04.js`: cálculo anual e exports por bioma para `MODULO1/v04/`.
- `stage_01-ccal_02_modulo_01_frell_brazil_v04.js`: mosaico, spill, land cover, densidades e produto final.

Executar Stage 00 primeiro e aguardar seus exports; depois executar Stage 01. A QCN mantém as bandas minúsculas usadas pela v03. O Stage 00 mantém fatores, parametrizações FREL e a combinação QCN + EBA da v03; troca somente as fontes de dados definidas para esta versão, incluindo o limite IBGE 2026.

A pasta `CCAL/MODULO1/v04` já existe. Verifique os assets existentes antes de submeter novos exports.

### Validação pendente antes de reexportar

O mosaico do Stage 01 foi ajustado para preencher fora dos footprints antes de
somar. Amostras grosseiras com um único bioma válido preservaram seus valores;
houve sobreposição em amostras a 10 km, mas nenhuma em 3.000 pontos aleatórios
consultados a 30 m para cada um dos anos 2016 e 2024. É necessário verificar
as fronteiras na grade nativa de forma dirigida e definir a regra de soma ou
prioridade antes de promover saídas. O preenchimento com zero não distingue,
por si só, ausência de cobertura de lacuna de dados dentro do domínio.
O asset existente não foi recalculado com esse ajuste.
