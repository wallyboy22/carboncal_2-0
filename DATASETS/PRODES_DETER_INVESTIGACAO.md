# PRODES em ano civil e DETER: investigação

## Convenção encontrada nos rasters legados

Os rasters `DeterAnoProdes_{ano}_cs_geometric` e `_cs_disordered` **não** têm
classes de intensidade 1–10. A inspeção de 2023 mostra apenas valor `1` onde há
alerta e máscara fora, em EPSG:4674 com pixel de ~29,94 m. O remapeamento 0–10
existente no código do Módulo 2 é genérico: na prática, o valor 1 recebe a
fração 0,29 (desordenado) ou também 0,29 (geométrico, por `blend`).

## Receita validada

Comparação em 200 m sobre a caixa da Amazônia, com polígonos DETER filtrados por
`VIEW_DATE` no ano civil e rasterizados na grade do próprio legado:

| Raster legado de 2023 | Classe DETER | Recall | Precisão |
|---|---|---:|---:|
| `cs_geometric` | `CS_GEOMETRICO` | 0,919 | 0,996 |
| `cs_disordered` | `CS_DESORDENADO` | 0,907 | 0,994 |

A receita também foi testada contra o `cs_disordered` 2024 já existente, que usa
grade de ~10 m (EPSG:4674, transform `9e-05`): recall **0,918** e precisão
**0,999**. Isso indica que a reconstrução funciona tanto na convenção antiga
quanto na nova.

A perda de ~8% de recall é compatível com alertas incluídos depois da geração do
raster e com diferenças de rasterização; não foi investigada célula a célula.
Não há evidência de que `DESMATAMENTO_CR`, `DESMATAMENTO_VEG` ou `DEGRADACAO`
devam entrar nessas máscaras.

## Estado dos assets em 2026-11-05

- 2017–2023: `cs_geometric`, `cs_disordered` e `fire` existem, grade ~30 m.
- 2024: existem `cs_disordered` e `fire`, grade ~10 m, criados em 2025-10-19.
- 2024 `cs_geometric`: ausente; sendo gerado a partir de `CS_GEOMETRICO` na
  mesma grade de 10 m, com tarefa `WS_IPAM_CCAL-DETER_CS_2024_geometric`.

A geração foi feita por `BETA_PYTHON/deter_cs.py`, que também reproduz e valida
2023. O asset novo deve ser conferido após a tarefa concluir: tipo, banda `b1`,
grade, máscara e presença de valores 1. Depois disso, o Módulo 2 pode ser
reexecutado sem substituição metodológica de desmatamento por corte seletivo.
