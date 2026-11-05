# CCAL · betas Python / Earth Engine

Protótipos **parciais** destinados a testar métodos, valores e máscaras. Não
substituem os scripts JavaScript, não demonstram equivalência científica nem
constituem pipelines completos. A API Python constrói grafos no Earth Engine;
é necessário `earthengine-api`, autenticação e projeto autorizado.

| Protótipo | Código de referência | Escopo disponível | Limitações |
|---|---|---|---|
| `modulo1.py` | M1 v04 Stage 01 | mosaico, estoque, emissões, convergência, spill, land cover e bandas finais | Stage 00 não portado; paridade espacial e fronteiras pendentes; `unmask(0, false)` pode ocultar lacunas |
| `modulo2.py` | M2 v03 Stage 00 | resposta savânica anual e sinal | combustão, demais componentes e demais stages não portados; `legacy_sign` é apenas diagnóstico do sinal anterior |
| `modulo3.py` | M3 v038 equação savana + balanço | diagnóstico da convenção de sinal | `experimental` é hipótese, não método validado; sem combustão, recorrência ou pipeline completo |
| `modulo4.py` | M4 v02 Stage 00 | três duplas exclusivas, tripla e agregado | caller fornece máscaras de processos, sem portar equações de emissão nem Stage 01 |

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

Portar as etapas restantes; comparar valores e máscaras com o JS e dados reais
por região/cobertura/ano; resolver o DETER geométrico e os sinais de M3;
validar máscaras de degradação e ausência de dados; definir tratamento de
fronteiras; aprovar destinos temporários, escala e custos. Nenhum código beta
exporta por padrão ou sobrescreve os assets das versões anteriores.
