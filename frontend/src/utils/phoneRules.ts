export const COUNTRY_PHONE_RULES = {
  QA: { label: 'Qatar', digits: 8, dialCode: '+974', flag: '🇶🇦' },
  IN: { label: 'India', digits: 10, dialCode: '+91', flag: '🇮🇳' },
  AE: { label: 'UAE', digits: 9, dialCode: '+971', flag: '🇦🇪' },
  SA: { label: 'Saudi Arabia', digits: 9, dialCode: '+966', flag: '🇸🇦' },
  OM: { label: 'Oman', digits: 8, dialCode: '+968', flag: '🇴🇲' },
  KW: { label: 'Kuwait', digits: 8, dialCode: '+965', flag: '🇰🇼' },
  BH: { label: 'Bahrain', digits: 8, dialCode: '+973', flag: '🇧🇭' },
  US: { label: 'USA', digits: 10, dialCode: '+1', flag: '🇺🇸' },
  GB: { label: 'UK', digits: 10, dialCode: '+44', flag: '🇬🇧' },
} as const;

export type CountryCode = keyof typeof COUNTRY_PHONE_RULES;

export const DEFAULT_COUNTRY: CountryCode = 'QA';

export const COUNTRY_OPTIONS = Object.entries(COUNTRY_PHONE_RULES).map(
  ([code, meta]) => ({
    value: code as CountryCode,
    label: `${meta.flag} ${meta.label} (${meta.dialCode})`,
    dialCode: meta.dialCode,
    countryName: meta.label,
  })
);

export const PHONE_COUNTRY_OPTIONS = Object.entries(COUNTRY_PHONE_RULES).map(
  ([code, meta]) => ({
    value: code as CountryCode,
    label: `${meta.flag} ${meta.dialCode}`,
    dialCode: meta.dialCode,
    countryName: meta.label,
  })
);

export const isCountryCode = (value: unknown): value is CountryCode =>
  typeof value === 'string' && value in COUNTRY_PHONE_RULES;

export const getPhoneDigitsOnly = (value: string): string => value.replace(/\D/g, '');

export const getActiveDefaultCountry = (): CountryCode => {
  const saved = typeof window !== 'undefined' ? localStorage.getItem('wt_country') : null;
  return isCountryCode(saved) ? saved : 'QA';
};

export const parsePhoneNumber = (value: string): { countryCode: CountryCode; digits: string } => {
  const cleaned = (value || '').trim();
  if (!cleaned) {
    return { countryCode: getActiveDefaultCountry(), digits: '' };
  }

  const withPlus = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;

  // Find the longest matching dial code
  const entries = Object.entries(COUNTRY_PHONE_RULES).sort((a, b) => b[1].dialCode.length - a[1].dialCode.length);
  for (const [code, meta] of entries) {
    if (withPlus.startsWith(meta.dialCode)) {
      return {
        countryCode: code as CountryCode,
        digits: getPhoneDigitsOnly(withPlus.substring(meta.dialCode.length)),
      };
    }
  }

  return { countryCode: getActiveDefaultCountry(), digits: getPhoneDigitsOnly(cleaned) };
};

export const validatePhoneNumber = (value: string): boolean => {
  const { countryCode, digits } = parsePhoneNumber(value);
  const meta = COUNTRY_PHONE_RULES[countryCode];
  return digits.length === meta.digits;
};

export const formatPhoneNumber = (countryCode: CountryCode, digits: string): string => {
  const meta = COUNTRY_PHONE_RULES[countryCode];
  return `${meta.dialCode}${digits}`;
};
