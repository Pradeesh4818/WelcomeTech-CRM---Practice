export const COUNTRY_PHONE_RULES: Record<string, { digits: number; dialCode: string }> = {
  QA: { digits: 8, dialCode: '+974' },
  IN: { digits: 10, dialCode: '+91' },
  AE: { digits: 9, dialCode: '+971' },
  SA: { digits: 9, dialCode: '+966' },
  OM: { digits: 8, dialCode: '+968' },
  KW: { digits: 8, dialCode: '+965' },
  BH: { digits: 8, dialCode: '+973' },
  US: { digits: 10, dialCode: '+1' },
  GB: { digits: 10, dialCode: '+44' },
};

export const DEFAULT_COUNTRY = 'QA';

export const toDigitsOnly = (value: string): string => value.replace(/\D/g, '');

export const parsePhoneNumber = (value: string): { dialCode: string; digits: string; countryCode: string } => {
  const cleaned = (value || '').trim();
  if (!cleaned) {
    return { dialCode: COUNTRY_PHONE_RULES[DEFAULT_COUNTRY].dialCode, digits: '', countryCode: DEFAULT_COUNTRY };
  }

  const withPlus = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;

  // Find the longest matching dial code
  const entries = Object.entries(COUNTRY_PHONE_RULES).sort((a, b) => b[1].dialCode.length - a[1].dialCode.length);
  for (const [code, meta] of entries) {
    if (withPlus.startsWith(meta.dialCode)) {
      return {
        dialCode: meta.dialCode,
        digits: toDigitsOnly(withPlus.substring(meta.dialCode.length)),
        countryCode: code,
      };
    }
  }

  return { dialCode: COUNTRY_PHONE_RULES[DEFAULT_COUNTRY].dialCode, digits: toDigitsOnly(cleaned), countryCode: DEFAULT_COUNTRY };
};

export const hasPhoneDigits = (value: unknown): boolean => {
  if (!value || typeof value !== 'string') return false;
  const { digits } = parsePhoneNumber(value);
  return digits.length > 0;
};

export const validatePhoneNumber = (value: string): boolean => {
  const { countryCode, digits } = parsePhoneNumber(value);
  if (!countryCode) return false;
  return digits.length === COUNTRY_PHONE_RULES[countryCode].digits;
};

export const normalizePhone = (phone: string, _requiredDigits?: number): string => {
  const { dialCode, digits } = parsePhoneNumber(phone);
  if (!digits) return '';
  return `${dialCode}${digits}`;
};

