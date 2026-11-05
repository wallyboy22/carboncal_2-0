# Diagnóstico exploratório de resultados

Testes sintéticos em Earth Engine (sem exportar):

```shell
python TOOLS/test_trajectories_gee.py --project PROJETO_GEE
```

O teste reproduz expressões isoladas dos stages para combinações exclusivas,
interseção fogo/logging, spill e sinais da resposta savânica do M2. Ele não importa os scripts JavaScript nem
valida assets publicados; não resolve a política de dados faltantes. O ano do
desmatamento deve permanecer mascarado na degradação ativa.

Em uma consulta adicional aos assets anuais do M4 v02, foram comparadas em
30 m a máscara exportada de convergência e a união das interseções dos
componentes positivos: 2.000 pontos aleatórios por ano em 2000, 2010 e 2024,
sem divergências. Houve apenas 2, 3 e 4 eventos esperados nas respectivas
amostras; isso não constitui validação exaustiva nem testa o Stage 01.

Para inventariar recursivamente os outputs em `MODULO1`–`MODULO4`, consulte
metadados de todas as imagens e opcionalmente amostre imagens inicial e final
de cada família anual e cada imagem não anual:

```shell
python TOOLS/audit_all_stages.py --project PROJETO_GEE --pixels --output MATERIAL_COMPLEMENTAR/auditoria_stages.json
```

Os resultados incluem apenas assets acessíveis sob essas pastas; destinos ainda
ausentes devem ser comparados aos scripts separadamente. A amostragem de cada
imagem usa somente primeira/última banda e pode não detectar eventos raros.

`audit_outputs.py` consulta apenas metadados dos produtos consolidados nas pastas
de versão. Requer `earthengine-api`, autenticação e um projeto autorizado:

```shell
python TOOLS/audit_outputs.py --project PROJETO_GEE
python TOOLS/audit_outputs.py --project PROJETO_GEE --only "M4 v02" --pixels
```

O modo opcional de pixels faz amostragem grosseira de até seis bandas dos anos
inicial/final, com até 500 pixels válidos por banda. Mostra mínimo, máximo e
fração de zeros **entre pixels válidos**; não mede a fração mascarada nem
representa uma estatística nacional. A amostra pode não conter eventos raros.
Anos presentes referem-se à união das bandas, não à completude de cada família.
Zeros, anos ausentes e assets sem acesso são diagnósticos, não reprovações.
Revise cobertura, máscaras e escalas antes de interpretar os resultados.

O M2 v02 foi copiado do produto legado para sua pasta de versão. O asset legado
chamado v03 só contém dados até 2023 e não foi copiado como resultado da v03
atual, que prevê 2024. Os scripts de exportação podem apontar para assets já
existentes; não execute exports sem verificar conflitos e a procedência.

O M1 v04 foi copiado do asset público terminado em `frell_v4`, mas esse destino
também aparece em um script histórico de `MODULO1/v02`. A origem exata dos dados
e sua equivalência ao código v04 atual ainda precisam ser verificadas.
