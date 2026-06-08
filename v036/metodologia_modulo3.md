# Documento Metodológico: Módulo 3 (SEEG/MapBiomas)

## 1. Introdução e Contexto

O **Módulo 3** da plataforma CCAL (Calculadora de Carbono) adota uma abordagem metodológica inovadora, alinhada com as estimativas anuais produzidas pelo SEEG (Sistema de Estimativas de Emissões e Remoções de Gases de Efeito Estufa) e com o histórico de cobertura da terra e regime de fogo do **MapBiomas**. 

Diferente das estimativas convencionais, o Módulo 3 possui duas características exclusivas:
1. **Considera toda a vegetação nativa** mapeada (Florestas, Savanas e Campos), não se restringindo apenas às fitofisionomias oficiais submetidas no contexto da UNFCCC.
2. **Contabiliza a regeneração** da vegetação secundária, calculando não apenas as emissões brutas, mas também as remoções líquidas de carbono promovidas pelo crescimento de áreas em recuperação.

## 2. Fundamentos Teóricos: Conservação de Massa e Atualização Dinâmica

A base do Módulo 3 é a **Atualização Dinâmica Anual do Estoque de Carbono** (Princípio da Conservação de Massa). 

Em vez de descontar a degradação de forma estática apenas na área primária do último ano da série, o algoritmo atualiza pixel a pixel toda a cobertura ao longo do tempo. 
A equação de transição base é:

**`Estoque no Ano X = Estoque Inicial + Crescimento Acumulado (Regeneração) - Emissões Acumuladas (Fogo e Corte)`**

### O Algoritmo de Balanço e a Prevenção da "Dupla Contagem"
Um dos maiores desafios na contabilização de carbono é lidar com áreas degradadas (por fogo ou corte seletivo) que, anos depois, vêm a ser completamente desmatadas (corte raso).

No Módulo 3, o estoque emitido pela degradação é descontado ativamente **antes** de qualquer evento de desmatamento.
- **Se um pixel foi alvo de fogo no passado**: Parte da sua biomassa foi convertida em emissão.
- **Se ocorre o corte raso hoje**: O modelo calcula a perda associada ao desmatamento baseando-se apenas no **estoque de carbono remanescente** naquele pixel.
Isso garante precisão técnica, evitando contabilizar a mesma árvore como emissão de incêndio e, anos depois, como emissão de desmatamento.

---

## 3. Dinâmicas de Emissão e Remoção (Core)

A mecânica do Módulo 3 é segmentada pelos principais processos de distúrbio e ganho:

### A. Vegetação Secundária (Regeneração e Remoções)
Quando o MapBiomas indica áreas de transição que configuram vegetação secundária (regeneração), o modelo injeta acúmulo de carbono ano a ano.
- As taxas de incremento (tC/ha/ano) variam de acordo com o **Bioma** e o **Tipo de Vegetação** (Florestal ou Campestre).
- Há uma distinção matemática de crescimento entre florestas jovens (menos de 20 anos) e florestas em estágios mais maduros (acima de 20 anos).
- O limite máximo de crescimento de um pixel nunca ultrapassa o teto do estoque primário original daquela mesma região.

### B. Emissões por Fogo em Florestas
Em áreas de cobertura florestal, o fogo gera danos severos e prolongados. O modelo não contabiliza apenas as cinzas iniciais, mas divide as emissões em duas etapas:
1. **Combustão Imediata (Non-CO₂)**: Queima instantânea de serrapilheira e galhos mortos no solo, liberando altas concentrações de Metano (CH₄) e Óxido Nitroso (N₂O).
2. **Emissões Tardias (CO₂)**: Árvores maiores não queimam instantaneamente, mas morrem devido aos danos térmicos. Seus troncos apodrecem ao longo dos anos ou décadas subsequentes. O modelo aplica uma curva de decaimento para descontar essa emissão tardia do balanço final de carbono de maneira diluída no tempo.

### C. Emissões por Fogo em Savanas e Campos
As dinâmicas de savana e campo evoluíram sob o estresse do fogo, possuindo alta resiliência.
- **Savanas**: Utiliza o *Índice de Intervalo de Retorno do Fogo (FRI)* e o *Time Since Fire (TSF)*. Dependendo da recorrência, o fogo no Cerrado pode levar a pequenos ganhos estruturais pós-recuperação (+2.1%) ou perdas progressivas de biomassa (-0.4% a -2.0% AGB). Para o cálculo de queima instantânea, assume-se que 26% da biomassa acima do solo atua como material combustível fino (componente herbáceo vivo). Atualmente savanas primarias queimadas ao menos uma vez são consideradas como degradadas. Esse é um ponto de Atenção pois o fogo em savanas no cerrado não é um processo destrutivo, mas sim um componente natural do bioma.
- **Campos**: O balanço de longo prazo de carbono (CO₂) é considerado **neutro**, visto que a biomassa herbácea das gramíneas se recupera quase integralmente com as chuvas subsequentes. Logo, as emissões contabilizadas nestes pixels são apenas as instantâneas (CH₄, N₂O e CO), sem mapear a área como estruturalmente degradada a longo prazo.

### D. Emissões por Corte Seletivo
Aplicável restritamente à Amazônia, onde o impacto da exploração madeireira legal ou ilegal altera permanentemente o estoque. Baseia-se em vetores do projeto de Monitoramento (MRV REDD+) do Pará e IPAM, que estabelecem uma fração média de perda (ex: 19.6%) extraída do dossel florestal por hectare afetado.
