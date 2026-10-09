---
title: Planejamento — atualização dos Módulos 1, 2 e 3
created: 2026-10-08
tags:
  - ccal
  - planejamento
  - modulo1
  - modulo2
  - modulo3
status: scripts-versionados-prontos-para-execucao
---

# Planejamento — atualização dos Módulos 1, 2 e 3

## Objetivo

Planejar novas versões dos Módulos 1, 2 e 3 da CCAL, atualizando fontes de dados e anos da série para aproximar os produtos do presente. Este documento registra o inventário feito no Earth Engine, as compatibilidades temporais e decisões ainda abertas. Nenhum módulo foi alterado nesta etapa.

## Estado atual dos módulos

| Módulo / versão atual | Período configurado | Observação para a atualização |
|---|---|---|
| [[MODULO1/v03/readme|Módulo 1 v03]] | Emissões 2017–2024; estoque 2016–2024 | Usa cadeia FREL/PRODES, EBA, QCN e DETER. Os novos dados MapBiomas não substituem automaticamente esses insumos; confirmar quais mudanças metodológicas são desejadas. |
| [[MODULO2/v02/readme|Módulo 2 v02]] | Emissões 2017–2023; estoque 2016–2023 | É uma síntese dos assets `CCAL_MODULO_2_V1`. Para avançar o período, é necessário confirmar e possivelmente reexecutar a cadeia de origem v01; alterar apenas a lista de anos da síntese não cria dados de 2024/2025. |
| [[MODULO3/v037/README|Módulo 3 v037]] | Base 1985–2024; fogo 1986–2024; corte seletivo 2017–2024 | É o módulo mais diretamente afetado pelas novas coleções de uso/cobertura, fogo e QCN. |

## Inventário conferido no Earth Engine

Consulta feita pelo projeto `mapbiomas-brazil` em 2026-10-08. Os assets abaixo estavam acessíveis e as bandas esperadas estavam presentes sem lacunas nas respectivas séries.

| Entrada | Asset | Bandas/anos confirmados | Atualização do asset (GEE) |
|---|---|---|---|
| Uso e cobertura MapBiomas Col. 11 | `projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_coverage_v3` | `classification_1985`–`classification_2025` (41) | 2026-08-06 |
| Desmatamento/vegetação secundária MapBiomas Col. 11 | `projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_deforestation_secondary_vegetation_v4` | `classification_1987`–`classification_2024` (38) | 2026-07-25 |
| Área queimada MapBiomas Fogo Col. 5.1 | `projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_annual_burned_v1` | `burned_area_1985`–`burned_area_2025` (41) | 2026-08-27 |
| Frequência do fogo MapBiomas Fogo Col. 5.1 | `projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_fire_frequency_v1` | 81 bandas: `fire_frequency_1985_YYYY` (1985–2025) e `fire_frequency_YYYY_2025` (1986–2025) | 2026-08-27 |
| Tempo após o fogo MapBiomas Fogo Col. 5.1 | `projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_time_after_fire_v1` | `time_after_fire_1985`–`time_after_fire_2026` (42) | 2026-08-27 |
| Estoques QCN SEEG14 / Col. 11 | `projects/ee-ipam/assets/SEEG/SEEG14/RETIFICACAO/c_rect_col11` | `AGB`, `BGB`, `CDW`, `LITTER`, `TOTAL` (FLOAT); não é série anual | 2026-09-11 |
| Corte seletivo binário MapBiomas Col. 10.1 | `projects/mapbiomas-public/assets/brazil/lulc/collection10_1/mapbiomas_brazil_collection10_1_degradation_logging_v2` | `logging_1988`–`logging_2024` (37) | 2026-05-06 |
| Limites dos biomas IBGE 2026 | `projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026` | FeatureCollection com 6 feições: Amazônia, Caatinga, Cerrado, Mata Atlântica, Pampa e Pantanal | 2026-06-09 |

### Interpretação temporal

- **2024 é o último ano comum** entre cobertura Col. 11, desmatamento/vegetação secundária Col. 11, fogo anual Col. 5.1 e corte seletivo binário fornecido.
- A cobertura e o fogo anual chegam a 2025, mas desmatamento/vegetação secundária e corte seletivo terminam em 2024. Um produto completo de 2025 exigiria definir como tratar essas entradas ausentes; não se deve apenas estender `END_YEAR`.
- A série de desmatamento/vegetação secundária começa em 1987. O Stage 0 atual do Módulo 3 cria bandas de 1985 e 1986 a partir da primeira banda disponível. Ao migrar, confirmar se essa regra continua apropriada.
- O corte seletivo MapBiomas é da **Collection 10.1**, não Col. 11, e começa em 1988. Pode substituir as entradas DETER atuais do Módulo 3 se essa for a decisão metodológica.
- A frequência de fogo tem bandas com os pares no nome: `1985_ano` e `ano_2025`. A série regressiva não está nomeada como `2025_ano`.
- Os nomes, tipos e intervalos das bandas foram consultados; **não foram calculadas estatísticas de pixels**. A consulta não prova que exista pixel válido em cada região/ano.

## Direção de atualização discutida

1. Criar novas versões dos módulos, preservando as versões atuais como referência.
2. No Módulo 3, avaliar a troca para MapBiomas LULC/Desmatamento Col. 11, Fogo Col. 5.1, QCN SEEG14/Col. 11 e o novo asset binário de corte seletivo.
3. Deixar a metodologia/entrada de corte seletivo do Módulo 4 fora desta atualização. O uso do dado binário no Módulo 3 ainda requer decidir se mantém a fração fixa atual de 19,6% ou se calcula recorrência e adota outra regra.
4. Para o Módulo 1, mapear as fontes atuais de PRODES/FREL e decidir explicitamente quais serão atualizadas; os assets MapBiomas listados não são substitutos diretos para a cadeia FREL.
5. Para o Módulo 2, identificar os assets e anos disponíveis na cadeia v01 antes de estender a síntese v02.
6. Definir ano final de cada produto e tratamento para anos sem dados antes de editar código.
7. Atualizar configurações, seleções de bandas, nomes de assets, documentação e versões. Executar as etapas na ordem de dependência de cada módulo e conferir bandas/metadados dos exports.

## Decisões tomadas para a implementação

- Ano final: **2024**, último ano comum com todos os insumos centrais.
- Módulo 3: usar recorrência anual derivada das bandas binárias `logging_1988`–`logging_2024` e a curva do Módulo 4 (`0.196 × exp(-0.0782 × (n - 1))`), sem alterar o Módulo 4.
- Módulo 2: reexecutar a cadeia de origem até 2024, não apenas a síntese.
- Módulo 1: aplicar QCN SEEG14/Col. 11 e limite IBGE 2026; preservar EBA, PRODES e DETER da metodologia FREL.
- Módulo 2: aplicar QCN SEEG14/Col. 11 e Fogo Col. 5.1; preservar EBA, PRODES e DETER para corte seletivo.
- Novos identificadores: Módulo 1 `v04`; Módulo 2 `v03`; Módulo 3 `v038`.

## Decisões pendentes

- Ano final desejado por módulo: manter 2024 onde há cobertura comum ou planejar um tratamento específico para 2025.
- Como inicializar 1985–1986 no Módulo 3 quando a série de desmatamento/vegetação secundária começa em 1987.
- Regra de perda do corte seletivo no Módulo 3 usando o input binário de 1988–2024.
- Disponibilidade de insumos anuais de 2024/2025 na cadeia original do Módulo 2.
- Quais entradas da cadeia FREL do Módulo 1 serão atualizadas e qual é o último ano disponível para cada uma.

## Diagnóstico reproduzível

Script local: `../diag_ccal_inputs.py` (na raiz de `carbon_core`). Inicializa com `ee.Initialize(project="mapbiomas-brazil")` e imprime metadados e bandas no terminal.

```powershell
.\venv\Scripts\python.exe .\diag_ccal_inputs.py
```

## Artefatos versionados

- `MODULO1/v04/`: cálculo anual e síntese com QCN Col. 11, limite IBGE 2026 e exports próprios.
- `MODULO2/v03/`: cálculo anual florestal/savânico com QCN Col. 11 e Fogo Col. 5.1, seguido de síntese v03.
- `MODULO3/v038/`: stages 0–3 e equações específicas para logging binário com recorrência; equações estáveis são importadas de v037.

Os exports estão configurados para os destinos v04/v03/v038. A execução das tarefas no Earth Engine e a validação dos valores exportados continuam pendentes.

## Referências locais

- [[MODULO1/v03/readme|Módulo 1 v03]]
- [[MODULO2/v02/readme|Módulo 2 v02]]
- [[MODULO3/v037/README|Módulo 3 v037]]
- [[MODULO4/v01/readme|Módulo 4 v01 — referência; corte seletivo fora do escopo atual]]
