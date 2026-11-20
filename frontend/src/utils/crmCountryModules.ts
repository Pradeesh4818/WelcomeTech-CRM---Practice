import { CountryCode } from './phoneRules';

export interface CrmCountryModule {
  id: 'amc' | 'tdl' | 'tss' | 'cloud';
  label: string;
  basePath: '/amc' | '/tdl' | '/tss' | '/cloud';
}

const DEFAULT_MODULES: CrmCountryModule[] = [
  { id: 'amc', label: 'AMC', basePath: '/amc' },
  { id: 'tdl', label: 'TDL', basePath: '/tdl' },
  { id: 'tss', label: 'TSS', basePath: '/tss' },
  { id: 'cloud', label: 'Cloud', basePath: '/cloud' },
];

const COUNTRY_MODULES: Partial<Record<CountryCode, CrmCountryModule[]>> = {
  QA: DEFAULT_MODULES,
  IN: DEFAULT_MODULES,
  AE: DEFAULT_MODULES,
  SA: DEFAULT_MODULES,
  OM: DEFAULT_MODULES,
  KW: DEFAULT_MODULES,
  BH: DEFAULT_MODULES,
};

export const getCrmModulesByCountry = (country: CountryCode): CrmCountryModule[] =>
  COUNTRY_MODULES[country] || DEFAULT_MODULES;
