# Diagnóstico exploratório de resultados

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
