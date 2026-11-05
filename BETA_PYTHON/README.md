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

## Contas e credenciais isoladas

A autenticação geral do Earth Engine (sua conta) permanece a padrão; nenhum
comando destes betas a substitui. Para a conta de exportação, crie um perfil
separado, que abre o navegador e grava o token fora do repositório em
`%APPDATA%/CCAL/credentials/<perfil>.json`:

```powershell
..\venv\Scripts\python.exe -m BETA_PYTHON.auth --login workspace2
..\venv\Scripts\python.exe -m BETA_PYTHON.auth --whoami workspace2 --project mapbiomas-brazil
```

Depois, use `--account-profile workspace2` em `inspect` ou `preview_m1`. O
programa chama `ee.Initialize(credentials=..., project=...)` apenas naquele
processo. Os perfis conhecidos ficam em `BETA_PYTHON/auth.py`; o e-mail
esperado é comparado quando o token o retorna. `--login` se recusa a
sobrescrever uma credencial existente: remova o arquivo manualmente para
reautenticar. Nunca versione ou compartilhe esse arquivo.

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

## Exportações de versões seguintes

`export_beta.py` encadeia os stages Python e exporta para pastas de versão nova,
com a credencial isolada e cobrança explícita do projeto:

```powershell
..\venv\Scripts\python.exe -m BETA_PYTHON.export_beta --project mapbiomas-brazil --account-profile workspace2 --modules m4 m3 m1
```

Sem `--submit` é dry-run. O programa:

- usa `workspace2` por padrão, mas aceita outra `--account-profile`;
- recusa sobrescrever asset existente;
- cria `FOLDER` ou `IMAGE_COLLECTION` somente quando necessário e **valida o
  tipo do pai** antes de exportar — `PRODES_ANO_CIVIL`, por exemplo, é
  `IMAGE_COLLECTION` e não aceita subpastas;
- prefixa toda descrição de tarefa com `WS_IPAM_CCAL-`.

Operações realizadas em 2026-11-05, com 19 tarefas submetidas no total:

| Versão | Operação | Conteúdo |
|---|---|---|
| M4 v03 | cópia dos 39 anuais + 11 exports | consolidado, land cover, densidades |
| M3 v039 | cópia de 24 intermediários + 1 export | produto final corrigido |
| M1 v05 | 7 exports integrais em Python | final, densidades, estoque, land cover |

O M4 v03 ficou inicialmente com `emissions_removals_v03` como `FOLDER`; a
migração para `IMAGE_COLLECTION` está preparada em `migrate_collection.py` e só
deve rodar após as tarefas do M4 concluírem, pois elas leem esses anuais.
M2 ainda não foi exportado: dependia do `cs_geometric` 2024.

## Corte seletivo a partir do DETER

`deter_cs.py` reconstrói os rasters binários de corte seletivo em ano civil.
A receita foi validada contra 2023 e contra o `cs_disordered` 2024 existente:

| Comparação | Recall | Precisão |
|---|---:|---:|
| 2023 `cs_geometric` ← `CS_GEOMETRICO` | 0,919 | 0,996 |
| 2023 `cs_disordered` ← `CS_DESORDENADO` | 0,907 | 0,994 |
| 2024 `cs_disordered` ← `CS_DESORDENADO` | 0,918 | 0,999 |

```powershell
..\venv\Scripts\python.exe -m BETA_PYTHON.deter_cs --project mapbiomas-brazil --account-profile workspace2 --year 2023 --validate
..\venv\Scripts\python.exe -m BETA_PYTHON.deter_cs --project mapbiomas-brazil --account-profile workspace2 --year 2024 --kind geometric --submit
```

As grades diferem por período: 2017–2023 em ~30 m e 2024 em ~10 m, sempre
EPSG:4674. A exportação usa a extensão dos alertas como região para não alocar
a caixa amazônica inteira. Detalhes em `../DATASETS/PRODES_DETER_INVESTIGACAO.md`.

## Linhagem pública e promoção

`lineage.py` compara dois assets por bandas e pixels (amostra pontos com
máscara válida comum, compara valor por banda). `lineage_report.py` percorre
`public/ccal_02`, pré-filtra candidatos pelo número de bandas e indica a versão
de trabalho mais provável:

```powershell
..\venv\Scripts\python.exe -m BETA_PYTHON.lineage_report --project mapbiomas-brazil --account-profile workspace2
```

`promote.py` é a etapa final: copia um asset aprovado para `public/ccal_02`,
recusando destino existente e, opcionalmente, exigindo igualdade mínima com a
versão pública anterior antes da cópia.

```powershell
..\venv\Scripts\python.exe -m BETA_PYTHON.promote --project mapbiomas-brazil --account-profile workspace2 `
  --source projects/ee-ipam/assets/CCAL/MODULO4/v03/CCAL_MODULO4-v03 `
  --destination projects/ee-ipam/assets/CCAL/public/ccal_02/ccal_02_brazil_modulo_4_qcn_mapbiomas_borda_v2 `
  --compare-with projects/ee-ipam/assets/CCAL/public/ccal_02/ccal_02_brazil_modulo_4_qcn_mapbiomas_borda_v1 `
  --min-equal 0.90
```

Sem `--submit` é dry-run. A comparação é uma **evidência de continuidade**, não
prova de correção científica: uma versão nova pode diferir legitimamente da
anterior. Por isso o limite é escolhido por caso e a decisão de promover
continua sendo revisão humana.

## Antes de qualquer produto completo

Comparar todos os stages, valores e máscaras com o JS e dados reais por
região/cobertura/ano e na grade de exportação; resolver o DETER geométrico e os sinais de M3;
validar máscaras de degradação e ausência de dados; definir tratamento de
fronteiras; aprovar destinos temporários, escala e custos. Nenhum código beta
exporta por padrão ou sobrescreve os assets das versões anteriores.
