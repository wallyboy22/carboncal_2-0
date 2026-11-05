/** Configuração dos assets e anos do Módulo 1 v04. */
exports.VERSION = 'v04';
exports.START_YEAR = 2017;
exports.END_YEAR = 2024;
exports.PRODES_START = 2016;
exports.PRODES_END = 2024;

exports.INPUTS = {
  qcn: 'projects/mapbiomas-workspace/SEEG/2022/QCN/QCN_30m_BR_v2_0_1',
  biomes: 'projects/ee-ipam/assets/IBGE/limite_biomas_IBGE_2026',
  vegetation: 'projects/ee-ipam/assets/CCAL/DATASETS/UKPact_MRV/brazil_pret_vegetation_qcn_v2',
  prodesLarge: 'users/celsojunior/prodes_brasil_2024_v20260407',
  prodesSmall: 'projects/ee-celsojunior/assets/yearly_deforestation_smaller_than_625ha_biome',
  managedLand: 'projects/ee-ipam/assets/Managed_Land_Brazil',
  ebaRoot: 'projects/ee-ipam/assets/CCAL/DATASETS/FREL/'
};

exports.OUTPUTS = {
  biomes: 'projects/ee-ipam/assets/CCAL/MODULO1/v04',
  version: 'projects/ee-ipam/assets/CCAL/MODULO1/v04',
  final: 'projects/ee-ipam/assets/CCAL/MODULO1/v04/ccal_02_brazil_modulo_1_frell_v4'
};
