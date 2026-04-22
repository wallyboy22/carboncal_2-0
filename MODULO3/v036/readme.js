/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var geometry = 
    /* color: #d63000 */
    /* shown: false */
    ee.Geometry.Polygon(
        [[[-76.54780555077535, 6.702549891783329],
          [-76.54780555077535, -36.49659065368281],
          [-28.735305550775358, -36.49659065368281],
          [-28.735305550775358, 6.702549891783329]]], null, false);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// =============================================================================
// CCAL Módulo 3 — v036
// readme.js
// Documentação do pipeline de estoque de biomassa e emissões de carbono.
// Cole este arquivo no Google Earth Engine Code Editor:
//   users/workspaceipam/CCAL:MODULO3/v036/readme
// =============================================================================


// -----------------------------------------------------------------------------
// O QUE É
// -----------------------------------------------------------------------------
// O Módulo 3 do CCAL (Cadastro de Carbono e Água de Longo Prazo) calcula:
//
//   1. O ESTOQUE ANUAL DE BIOMASSA do Brasil (1985–2024), em tC/ha, para:
//       - Vegetação primária (usando o mapa QCN retificado como referência)
//       - Vegetação secundária (incremento acumulado por idade e bioma)
//
//   2. As EMISSÕES LÍQUIDAS DE CARBONO por categoria de perturbação:
//       - Fogo em florestas primárias  (Modelo FATE v2-1)
//       - Fogo em savanas              (regime de frequência + TSF)
//       - Fogo em campos               (combustão não-CO₂ via IPCC)
//       - Corte seletivo               (Amazônia, 2017–2024, MRV REDD+ Pará)
//       - Desmatamento / Regeneração   (balanço do estoque atualizado)
//
// Cobertura espacial : Brasil emerso (pixels de água permanente excluídos)
// Cobertura temporal : 1985–2024 (fogo a partir de 1986; logging a partir de 2017)
// Resolução          : 30 metros (Landsat / MapBiomas)
// Ambiente           : Google Earth Engine — JavaScript API


// -----------------------------------------------------------------------------
// ESTRUTURA DE ARQUIVOS
// -----------------------------------------------------------------------------
//
//   users/workspaceipam/CCAL:MODULO3/v036/
//   ├── readme.js              ← este arquivo
//   ├── toExport_modulo3.js    ← script principal (único com Export.*)
//   └── equations/
//       ├── 01_secondary_veg.js   ← calcSecondaryVegIncrement()
//       ├── 02_fire_forest.js     ← calcForestFireEmissions()  — Modelo FATE v2-1
//       ├── 03_fire_savanna.js    ← calcSavannaFireEmissions()
//       ├── 04_fire_grassland.js  ← calcGrasslandFireEmissions()
//       └── 05_logging.js         ← calcLoggingEmissions()
//
// Os scripts em equations/ são FUNÇÕES PURAS:
//   - Recebem ee.Image multibanda como entrada (1 banda por ano)
//   - Retornam ee.Image multibanda como saída (1 banda por ano)
//   - Não contêm Export.* nem Map.addLayer
//
// O toExport_modulo3.js é o SCRIPT DE COMANDO:
//   - Define todos os datasets de entrada
//   - Chama as funções de equação via require()
//   - Faz a integração (descontos, balanço, produto final)
//   - Dispara as exportações para o GEE Asset


// -----------------------------------------------------------------------------
// DATASETS DE ENTRADA
// -----------------------------------------------------------------------------
//
// ┌─────────────────────────────────────────────────────────────────────────────────────┐
// │ Dataset                    │ Asset GEE                                              │
// ├─────────────────────────────────────────────────────────────────────────────────────┤
// │ MapBiomas LULC Col 10.1    │ projects/mapbiomas-public/assets/brazil/lulc/          │
// │                            │ collection10_1/mapbiomas_brazil_collection10_1_        │
// │                            │ coverage_v1                                            │
// │                            │ Bandas: classification_1985 … classification_2024      │
// ├─────────────────────────────────────────────────────────────────────────────────────┤
// │ MapBiomas Desf/Veg Sec     │ projects/mapbiomas-public/assets/brazil/lulc/          │
// │ Col 10.1                   │ collection10_1/mapbiomas_brazil_collection10_1_        │
// │                            │ deforestation_secondary_vegetation_v3                  │
// │                            │ Bandas: classification_1985 … classification_2024      │
// │                            │ Classes: 1=Antrópico, 2=Veg.Primária, 3=Veg.Sec.,    │
// │                            │          4=Supressão Prim., 5=Regrowth Sec.,          │
// │                            │          6=Supressão Sec., 7=Outra Transição          │
// ├─────────────────────────────────────────────────────────────────────────────────────┤
// │ QCN Retificada             │ projects/ee-ipam/assets/SEEG/SEEG13/RETIFICACAO/      │
// │ (estoques de carbono)      │ c_rect_col10                                           │
// │                            │ Bandas: AGB, BGB, CDW, LITTER, TOTAL (tC/ha)          │
// ├─────────────────────────────────────────────────────────────────────────────────────┤
// │ MapBiomas Fire Col 4.1     │ projects/mapbiomas-public/assets/brazil/fire/          │
// │ – Annual burned            │ collection4_1/mapbiomas_fire_collection41_annual_      │
// │ – Fire frequency           │ burned_v1  /  fire_frequency_v1                       │
// │ – Time since fire          │ time_after_fire_v1  /  accumulated_burned_v1          │
// │ – Accumulated burned       │ Bandas: burned_area_1985 … burned_area_2024           │
// ├─────────────────────────────────────────────────────────────────────────────────────┤
// │ Atividade corte seletivo   │ projects/ee-ipam/assets/MRV_REDD_PARA/                │
// │ MRV REDD+ Pará 2017–2024   │ 0_Activity_Year/degradation_YYYY_sl_disordered        │
// │                            │                  degradation_YYYY_sl_geometric         │
// ├─────────────────────────────────────────────────────────────────────────────────────┤
// │ Tabela de incrementos      │ projects/ee-ipam/assets/CCAL/incrementos_modulo3      │
// │ (veg. secundária)          │ FeatureCollection: Bioma, Classe (F/G),               │
// │                            │   Ctotal_ate20, Ctotal_mais20 (tC/ha/ano)             │
// ├─────────────────────────────────────────────────────────────────────────────────────┤
// │ Biomas IBGE 250mil         │ projects/mapbiomas-workspace/AUXILIAR/                 │
// │                            │ biomas_IBGE_250mil                                     │
// └─────────────────────────────────────────────────────────────────────────────────────┘


// -----------------------------------------------------------------------------
// LÓGICA DA MÁSCARA DE VEGETAÇÃO ESTÁVEL (nova em v036)
// -----------------------------------------------------------------------------
//
// Substitui o dado SEEG13/13_3_Stable_cover usado na v035.
//
// Agora usa o dado de desmatamento/veg. sec. do MapBiomas Col 10.1:
//   CLASSE 2 = Vegetação Primária → pixel considerado como floresta estável
//
// Combinado com o LULC para saber o TIPO de cobertura:
//   forest_mask    → desf_reg == 2  AND  lulc == 3  (Formação Florestal)
//   savanna_mask   → desf_reg == 2  AND  lulc == 4  (Formação Savânica)
//   grassland_mask → desf_reg == 2  AND  lulc IN [11, 12, 50]
//
// A classe 7 (Outra Transição) no dado desf_reg é corrigida:
//   → substituída pelo valor do ano anterior (forward fill)
//   → para anos iniciais sem histórico, pelo valor do próximo ano válido (backward fill)


// -----------------------------------------------------------------------------
// SAÍDAS — PRODUTO FINAL (CCAL_MODULO3-v036)
// -----------------------------------------------------------------------------
//
// Asset: projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO3-v036
// Resolução: 30m, float32, pyramidingPolicy: median
//
// ┌────────────────────────────────────────┬──────────────┬──────────────────────────────┐
// │ Banda                                  │ Unidade      │ Descrição                    │
// ├────────────────────────────────────────┼──────────────┼──────────────────────────────┤
// │ loss_fire_YYYY                         │ tCO₂e/pixel  │ Emissões por fogo (floresta  │
// │ (1986–2024)                            │              │ + savana) × área do pixel    │
// ├────────────────────────────────────────┼──────────────┼──────────────────────────────┤
// │ loss_selective_logging_YYYY            │ tCO₂e/pixel  │ Emissões por corte seletivo  │
// │ (2017–2024)                            │              │ × área do pixel              │
// ├────────────────────────────────────────┼──────────────┼──────────────────────────────┤
// │ loss_convergence_degradation_YYYY      │ tCO₂e/pixel  │ Fogo + corte seletivo        │
// │ (1986–2024)                            │              │ × área do pixel              │
// ├────────────────────────────────────────┼──────────────┼──────────────────────────────┤
// │ gain_secondary_vegetation_YYYY         │ tCO₂e/pixel  │ Remoção por regeneração      │
// │ (1986–2024)                            │ (negativo)   │ × área do pixel              │
// ├────────────────────────────────────────┼──────────────┼──────────────────────────────┤
// │ loss_grassland_YYYY                    │ tCO₂e/pixel  │ Emissões não-CO₂ por fogo    │
// │ (1986–2024)                            │              │ em campos × área do pixel    │
// ├────────────────────────────────────────┼──────────────┼──────────────────────────────┤
// │ loss_deforestation_YYYY                │ tCO₂e/pixel  │ Emissões por supressão       │
// │ (1986–2024)                            │              │ × área do pixel              │
// ├────────────────────────────────────────┼──────────────┼──────────────────────────────┤
// │ stock_YYYY                             │ tC/ha        │ Estoque de C remanescente    │
// │ (1986–2024)                            │ (densidade)  │ (após descontos de degr.)    │
// └────────────────────────────────────────┴──────────────┴──────────────────────────────┘
//
// ⚠️ loss_* e gain_* : em tCO₂e TOTAL por pixel (×área em ha)
// ⚠️ stock_*          : em tC/ha (densidade — NÃO multiplicado pela área)


// -----------------------------------------------------------------------------
// SAÍDAS — ASSETS INTERMEDIÁRIOS
// -----------------------------------------------------------------------------
//
// Pasta: projects/ee-ipam/assets/CCAL/MODULO3/v036/
//
// ┌──────────────────────────────────────────┬──────────────┬────────────────────────────┐
// │ Asset                                    │ Unidade      │ Bandas                     │
// ├──────────────────────────────────────────┼──────────────┼────────────────────────────┤
// │ biomass_stock_v036                       │ tC/ha        │ biomass_stock_YYYY         │
// ├──────────────────────────────────────────┼──────────────┼────────────────────────────┤
// │ secondary_veg_increment_v036             │ tC/ha        │ sec_veg_increment_YYYY     │
// ├──────────────────────────────────────────┼──────────────┼────────────────────────────┤
// │ fire_forest_emissions_v036               │ tC/ha (CO₂)  │ CO2_tC_ha_YYYY             │
// │                                          │ g/ha (outros)│ CH4/N2O/CO/NOX_g_ha_YYYY  │
// ├──────────────────────────────────────────┼──────────────┼────────────────────────────┤
// │ fire_savanna_emissions_v036              │ tCO₂e/ha     │ CO2_tCO2e_ha_YYYY          │
// │                                          │ g/ha (outros)│ CH4/N2O/CO/NOX_g_ha_YYYY  │
// ├──────────────────────────────────────────┼──────────────┼────────────────────────────┤
// │ fire_grassland_emissions_v036            │ g/ha         │ CO/CH4/N2O/NOX_g_ha_YYYY  │
// ├──────────────────────────────────────────┼──────────────┼────────────────────────────┤
// │ logging_emissions_v036                   │ tC/ha        │ logging_tC_ha_YYYY         │
// │                                          │              │ (Amazônia, 2017–2024)      │
// └──────────────────────────────────────────┴──────────────┴────────────────────────────┘
//
// ⚠️ Todos os intermediários estão em DENSIDADE (por hectare), nunca em total por pixel.
//    A conversão para total ocorre APENAS no toExport_modulo3.js, nas bandas finais.


// -----------------------------------------------------------------------------
// FLUXO RESUMIDO
// -----------------------------------------------------------------------------
//
//  [Col 10.1 LULC + Desf/Reg]  →  Prep de máscaras (inline no toExport)
//          ↓                            ↓
//  [QCN total]  +  [Incrementos]  →  Biomassa anual (primária + veg. sec.)
//          ↓
//  [Fire Col 4.1] + [QCN AGB/CDW/LITTER]  →  Emissões por fogo (floresta / savana / campo)
//  [MRV REDD+ Pará 2017–2024]  →  Emissões por corte seletivo (Amazônia)
//          ↓
//  Acumula degradação (tC/ha) ano a ano
//  Subtrai do estoque de veg. primária
//          ↓
//  Calcula balanço desmat/reg (comparando estoque atualizado ano a ano)
//          ↓
//  Monta produto final (×pixel_area_ha para loss/gain; tC/ha para stock)
//          ↓
//  Export → CCAL/MODULO3/v036/ (intermediários)
//         → CCAL/MODELOS/CCAL_MODULO3-v036 (produto final)


// -----------------------------------------------------------------------------
// CONVERSÕES E CONSTANTES
// -----------------------------------------------------------------------------
//
//   tC → tCO₂   : × 3.67  (razão de massas moleculares CO₂/C)
//   GWP CH₄     : × 28    (AR5, 100 anos)
//   GWP N₂O     : × 265   (AR5, 100 anos)
//   tC/ha → kg  : × 1000  (apenas para cálculo de fatores de emissão)
//   m² → ha     : ÷ 10000 (ee.Image.pixelArea())
//   g → Mg (t)  : ÷ 1e6


// -----------------------------------------------------------------------------
// CONTATO E REFERÊNCIAS
// -----------------------------------------------------------------------------
//
//   Equipe CCAL — IPAM Amazônia
//   Autores: Wallace Silva, Bárbara Zimbres, Celso Junior, Camila Silva,
//            Aline Pontes, Edriano Souza
//
//   Modelos de emissão:
//     - FATE v2-1: Camila Silva, Aline Pontes, Wallace Silva
//     - Savanas / Campos: baseado em IPCC 2006 Guidelines, Volume 4
//     - Corte seletivo: MRV REDD+ Pará / IPAM
//
//   Dados de entrada:
//     - MapBiomas LULC: mapbiomas.org
//     - MapBiomas Fire: mapbiomas.org/fogo
//     - QCN Retificada: MCTI / IPAM
//
// =============================================================================
