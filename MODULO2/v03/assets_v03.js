/** Configuração de entradas, janela e destinos do Módulo 2 v03. */
exports.VERSION = 'v03';
exports.EMISSION_START_YEAR = 2017;
exports.EMISSION_END_YEAR = 2024;
exports.STOCK_START_YEAR = 2016;
exports.STOCK_END_YEAR = 2024;

exports.INPUTS = {
  qcn: 'projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1',
  biomes: 'projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026',
  fireAnnual: 'projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_annual_burned_v1',
  fireFrequency: 'projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_fire_frequency_v1',
  fireTimeSince: 'projects/mapbiomas-public/assets/brazil/fire/collection5_1/mapbiomas_fire_collection51_time_after_fire_v1',
  vegetation: 'projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2',
  prodesLarge: 'users/celsojunior/prodes_brasil_2024_v20260407',
  prodesSmall: 'projects/ee-celsojunior/assets/yearly_deforestation_smaller_than_625ha_biome',
  managedLand: 'projects/ee-ipam/assets/Managed_Land_Brazil',
  ebaRoot: 'projects/ee-ipam/assets/CCAL/DATASETS/FREL/',
  deterRoot: 'projects/ee-ipam/assets/CCAL/DATASETS/PRODES/PRODES_ANO_CIVIL/'
};

exports.OUTPUTS = {
  raw: 'projects/ee-ipam/assets/CCAL/MODULO2/v03/model_assets',
  diagnostics: 'projects/ee-ipam/assets/CCAL/MODULO2/v03',
  final: 'projects/ee-ipam/assets/CCAL/MODELOS/CCAL_MODULO2-v03',
  landCover: 'projects/ee-ipam/assets/CCAL/MODULO2/v03/land_cover_masks'
};
