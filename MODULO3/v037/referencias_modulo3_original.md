# Referências do Módulo 3 (Manual CCAL v2.0)

Este documento compila as informações oficiais do Módulo 3 extraídas do manual **"NOTA METODOLÓGICA: ESTIMATIVA DE EMISSÕES DE GASES DE EFEITO ESTUFA POR CORTE RASO, FOGO E CORTE SELETIVO VIA PLATAFORMA CCAL" (Versão 2.0 – outubro de 2025)**.

---

### 1. Dados Base e Escopo (Páginas 18 e 20)
- **Desmatamento e Vegetação Secundária**: Diferente dos Módulos 1 e 2 (que utilizam o PRODES), o Módulo 3 utiliza os dados de desmatamento e regeneração do projeto **MapBiomas**.
- **Fitofisionomias Abrangentes**: O Módulo 3 considera **toda a vegetação nativa** mapeada pelo MapBiomas, abrangendo formações florestais, savânicas e campestres. Ele não se restringe apenas às fitofisionomias oficiais listadas na QCN/FREL.
- **Regeneração**: O Módulo 3 é o **único módulo** da CCAL que inclui a regeneração da vegetação secundária e as remoções de carbono associadas.

### 2. Contabilização de Emissões e Dinâmica de Carbono (Página 24)
- Contabiliza emissões por **desmatamento**, **degradação por fogo** e **corte seletivo** (este último restrito à região amazônica, baseado em dados do DETER/MRV).
- **Fogo em Florestas (FATE)**: O módulo não calcula apenas a combustão imediata. Ele engloba as **emissões tardias** (resultantes da degradação e decomposição lenta da biomassa ao longo dos anos). Essas perdas são descontadas do balanço final.

### 3. Dinâmica do Estoque de Carbono (Página 36)
- **Abordagem Dinâmica**: Diferente dos Módulos 1 e 2 (que aplicam degradação apenas sobre a vegetação primária do último ano de forma estática), o Módulo 3 **atualiza a cobertura de vegetação primária e secundária anualmente em toda a série**.
- A cada ano, subtrai-se do carbono pretérito (QCN) as perdas acumuladas por degradação e adicionam-se os ganhos por regeneração na totalidade do mapa de vegetação nativa emersa (excluindo água permanente).
- **Desconto Prévio**: O estoque emitido pela degradação é descontado **antes** de um eventual evento de corte raso. Ou seja, se um pixel é degradado (por fogo ou corte) e desmatado anos depois, a emissão do corte raso será calculada apenas sobre o **estoque remanescente**, evitando dupla contagem.

### 4. Particularidades por Bioma e Fogo (Página 37)
- **Florestas**: Considera a mortalidade de árvores e a consequente atualização dos estoques de material combustível para queimas subsequentes.
- **Savanas**: Utiliza o Índice de Intervalo de Retorno do Fogo (FRI) para determinar a dinâmica de carbono pós-fogo (com fatores de ganho de +2,1% ou perda de -0,4% a -2,0% de AGB). Também simula o componente herbáceo vivo assumindo que 26% da AGB atua como material combustível fino (FWD).
- **Campos (Formação Campestre)**: O balanço de CO₂ é considerado **neutro** (devido à rápida recuperação da biomassa das gramíneas). A plataforma contabiliza as emissões imediatas (gases não-CO₂, como CH₄ e N₂O), mas **não** reduz o estoque de carbono (não mapeia como área permanentemente degradada).
- **Fatores Finais**: Em todos os tipos de vegetação (floresta, savana e campo), a equação leva em conta a frequência anual do fogo (MapBiomas Fogo Col 4.1), estoques de combustível e fatores específicos de combustão.
