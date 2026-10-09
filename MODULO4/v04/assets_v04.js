/** Configuração de fontes e destinos do CCAL Módulo 4 v04. */
exports.VERSION = 'v04';
exports.START_YEAR = 1986;
exports.END_YEAR = 2024;

exports.INPUTS = {
  biomes: 'projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026',
  vegetation: 'projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2',
  lulc: 'projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_coverage_v3',
  deforestation: 'projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_deforestation_secondary_vegetation_by_coverage_v1',
  fireAnnual: 'projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_annual_burned_v1',
  qcn: 'projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1',
  edgeAge: 'projects/ee-redd-brazil/assets/ybyra-br-model/edgesAge_mb_c101_390m_1986_2024_v2',
  secondaryForestAge: 'projects/ee-redd-brazil/assets/ybyra-br-model/secondary_forest_age_collection10_1_v8_1',
  loggingFrequency: 'projects/ee-redd-brazil/assets/ybyra-br-model/logging_frequency_v1',
  deforestation1986: 'projects/ee-redd-brazil/assets/ybyra-br-model/deforestationAnnual_mb_c101_1986_2024_v2',
  chapmanRichardsB: 'projects/ee-ybyra-br-sf/assets/B_30m',
  chapmanRichardsK: 'projects/ee-ybyra-br-sf/assets/K_30m'
};

exports.OUTPUTS = {
  annual: 'projects/ee-ipam/assets/CCAL/MODULO4/v04/emissions_removals_v04',
  final: 'projects/ee-ipam/assets/CCAL/MODULO4/v04/CCAL_MODULO4-v04',
  landCover: 'projects/ee-ipam/assets/CCAL/MODULO4/v04/land_cover_masks'
};

exports.CONVERGENCE = {
  components: ['edge', 'logging', 'fire'],
  combinations: [
    'edge_logging',
    'edge_fire',
    'logging_fire',
    'edge_logging_fire'
  ],
  pairwiseExcludeTriple: true
};
