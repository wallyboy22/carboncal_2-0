# PRODES em ano civil e DETER: investigação preliminar

O Módulo 2 v03 lê `DeterAnoProdes_{ano}_cs_disordered` e
`DeterAnoProdes_{ano}_cs_geometric`, combina-os por `blend` (geométrico tem
prioridade onde válido) e remapeia valores 0–10 para frações de perda. Portanto,
um polígono de alerta binário ou um alerta de desmatamento não é automaticamente
equivalente ao raster de corte seletivo geométrico. Não foi localizada a receita
de geração dos rasters legados. O asset geométrico de 2024 segue pendente.

Uma auditoria anterior dos dados candidatos encontrou no DETER Amazônia o campo
`VIEW_DATE` e as classes separadas `CS_GEOMETRICO`, `CS_DESORDENADO`,
`DESMATAMENTO_CR` e `DESMATAMENTO_VEG`. Essas classes devem permanecer distintas.
`VIEW_DATE` é data de observação e não necessariamente a data exata do evento.

Antes de implementar a simulação de PRODES em ano civil, definir e validar:

1. Fonte e legenda dos polígonos/rasters PRODES, inclusive ano de referência e
   intervalo de monitoramento por bioma, e quais classes DETER são pertinentes.
2. Regra espacial e temporal de associação, tratamento de múltiplos alertas,
   ausências, alertas fora do intervalo, polígonos parciais e fronteiras de ano.
3. Comparação de anos anteriores com referências e rasters legados: projeção,
   máscara, classes, área e concordância espacial, com amostras inspecionadas.
4. Para o corte seletivo, origem das classes de intensidade 1–10 e sua relação
   com os alertas. Só propor substituição após demonstrar compatibilidade.

Nenhuma simulação ou substituição foi executada nesta investigação preliminar.
