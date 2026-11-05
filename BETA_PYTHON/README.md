# CCAL · betas Python / Earth Engine

Traduções dos stages das versões indicadas para construir e inspecionar
imagens no Earth Engine. Os fluxos completos podem ser encadeados com
`--pipeline`, mas **a paridade ainda está em validação**, não são produtos
aprovados e não substituem os scripts JavaScript. Requer `earthengine-api`,
autenticação e projeto autorizado.

| Protótipo | Código de referência | Escopo disponível | Limitações |
|---|---|---|---|
| `modulo1.py` | M1 v04 | Stages 00 e 01; entradas podem ser encadeadas | paridade espacial e fronteiras pendentes; `unmask(0, false)` pode ocultar lacunas |
| `modulo2.py` | M2 v03 | Stages 00 e 01; resposta savânica e sinais atuais do JS | 2024 bloqueado pelo DETER geométrico; comparações exigem mesma grade/projeção e validação em outras regiões |
| `modulo3.py` | M3 v038 e dependências v037 | Stages 00–03, incluindo fogo, regeneração e balanço | sinais da savana requerem decisão; paridade ainda não demonstrada para todos os anos, regiões e bandas |
| `modulo4.py` | M4 v02 | Stages 00 e 01, equações anuais e convergência | paridade espacial/temporal completa ainda não demonstrada |

Para M2, ganho de biomassa é emissão negativa no código corrigido, mas os
intermediários existentes foram calculados anteriormente. O raster DETER
geométrico 2024 continua sem substituto metodologicamente validado.
Convergência com remoção líquida e política de dados ausentes permanecem abertas.

## Testar sem exportar

Na raiz do repositório, com Python do ambiente que possui `earthengine-api`:

```powershell
..\venv\Scripts\python.exe -m BETA_PYTHON.validate --project mapbiomas-brazil
..\venv\Scripts\python.exe -m BETA_PYTHON.preview_m1 --project mapbiomas-brazil --bounds -60.1 -3.1 -60 -3
..\venv\Scripts\python.exe -m BETA_PYTHON.compare_m4 --project mapbiomas-brazil --year 2024 --bounds -60.1 -3.1 -60 -3
```

`validate` executa verificações sintéticas no GEE e verifica nomes de bandas
do M1. Não executa os scripts JS, não valida a paridade completa nem prova que
os pixels exportados estejam corretos. `preview_m1` consulta um recorte pequeno
dos assets v04. O preenchimento dos biomas por zero e a soma de eventuais
sobreposições são hipóteses do Stage 01 atual, não uma regra já validada.

## Inspecionar com reduceRegion

`inspect` calcula uma banda e retorna mínimo, máximo, média, soma dos valores
de pixel e número de pixels válidos, zerados e mascarados na mesma grade.
A média usa o comportamento ponderado do reducer Earth Engine; a soma é de
valores, **não** área e não faz conversão de unidades. A escala em metros e o
CRS são explícitos. Para usar a grade exata de um asset, forneça `--crs` e
`--transform` com os seis coeficientes em vez de `--scale`. Use área e limite
compatíveis com o orçamento GEE.

```powershell
..\venv\Scripts\python.exe -m BETA_PYTHON.inspect --project mapbiomas-brazil --stage m4-stage01 --pipeline --year 2024 --band stock_2024 --bounds -54.101 -3.3 -54.1 -3.299 --scale 30
..\venv\Scripts\python.exe -m BETA_PYTHON.inspect --project mapbiomas-brazil --stage m3-stage01 --year 2024 --product fire_forest_CO2 --band CO2_tC_ha_2024 --bounds -47.01 -15.01 -47 -15 --scale 30
..\venv\Scripts\python.exe -m BETA_PYTHON.inspect --project mapbiomas-brazil --stage m4-stage00 --year 1986 --band stock_1986 --bounds -54.105 -3.3 -54.095 -3.29 --scale 30 --reference-asset projects/ee-ipam/assets/CCAL/MODULO4/v02/emissions_removals_v02/1986
```

`--pipeline` conecta os stages Python; sem ele, stages posteriores consomem
assets publicados. `--product` seleciona um intermediário ou subproduto;
`--reference-asset` e `--reference-band` comparam valores e máscaras no
recorte, com tolerância absoluta configurável. Assets publicados não são
automaticamente referência correta. `--year` limita a construção temporal:
no Stage 0 M3 o preenchimento retroativo depende de anos futuros, de modo que
um fim antes de 2024 pode alterar anos anteriores em comparação com o JS completo.

## Verificações já realizadas

- Encadeamentos M1, M3 e M4 chegaram a `stock_2024` via reduceRegion em um
  recorte de 20 pixels; M2 v03 para 2024 falhou no asset geométrico ausente.
- M4 Stage 00: 39 bandas, máscaras iguais e diferença máxima 0 em 1986 e
  1,91e-6 em 2024 em um recorte; Stage 01: 507 bandas e três bandas de 2024
  com diferença zero no recorte examinado. Isso não prova paridade nacional.
- M3 Stage 1: 19 produtos em 2024 comparados num recorte, sem divergência;
  exemplos de vegetação secundária e fogo em outro recorte também coincidiram.
- M1: `stock_2024`, `loss_fire_2024` e `loss_deforestation_2024` da cadeia
  Python encadeada e da síntese Python baseada em intermediários publicados
  coincidiram em valores e máscaras no recorte examinado; isso não substitui
  a comparação com o JS executado no mesmo estado dos dados.
- M2: `savanas_stock_2016` no recorte `[-47.01,-15.01,-47,-15]` inicialmente
  apresentou diferença máxima de 41,3736 tC/ha sem CRS explícito. O grafo
  calculado usa projeção nativa EPSG:4674 e o asset exportado EPSG:4326;
  com CRS EPSG:4326 e escala 30 m comuns, a diferença foi zero nos 1.444
  pixels do recorte. Isso evidencia sensibilidade à grade, não prova paridade
  em todas as regiões nem determina que a grade alternativa esteja errada.

## Destino beta e exportação explícita

O único export implementado é **um recorte diagnóstico**, não um produto
nacional, em `projects/ee-ipam/assets/CCAL/MODULO1/v05/beta_diagnostico_mosaico_2024_recorte`.
Ele contém `stock_tC_ha` e `biome_valid_count`, derivadas dos assets v04.
O comando acima é somente leitura; para submeter uma única tarefa no destino
fixo, acrescente `--submit`. O programa cria a pasta `v05` se necessário e se
recusa a sobrescrever o asset. Limita o retângulo a 0,2° por lado. Confirme
que projeto, destino e região são adequados antes de usar esse parâmetro.

Uma execução em 2026-11-05 usou o recorte `[-60.1, -3.1, -60, -3]`; tarefa
`ZXZMPGYO6RYWXUULFF6SM7IY` concluída e metadados verificados. Os nomes v04/v039/v03 para versões futuras dos demais
módulos ainda não foram reservados e nenhum produto deles foi exportado.

O comparador M4 verificou valores e máscaras das cinco bandas no recorte
`[-54.105,-3.3,-54.095,-3.29]`, ano 2024, 30 m: 1.369 pixels, 700 eventos
e zero divergências nesse recorte. Isso não valida outros locais, anos ou stages.

## Antes de qualquer produto completo

Comparar todos os stages, valores e máscaras com o JS e dados reais por
região/cobertura/ano e na grade de exportação; resolver o DETER geométrico e os sinais de M3;
validar máscaras de degradação e ausência de dados; definir tratamento de
fronteiras; aprovar destinos temporários, escala e custos. Nenhum código beta
exporta por padrão ou sobrescreve os assets das versões anteriores.
