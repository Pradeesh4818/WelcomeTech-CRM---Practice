import { describe, it, expect } from 'vitest';
import {
  parsePhoneNumber,
  validatePhoneNumber,
  formatPhoneNumber,
  getPhoneDigitsOnly,
  isCountryCode,
} from '../phoneRules';

describe('getPhoneDigitsOnly', () => {
  it('strips everything but digits', () => {
    expect(getPhoneDigitsOnly('+974 1234-5678')).toBe('97412345678');
  });
});

describe('parsePhoneNumber', () => {
  it('parses the longest matching dial code', () => {
    expect(parsePhoneNumber('+97412345678')).toEqual({ countryCode: 'QA', digits: '12345678' });
    expect(parsePhoneNumber('+919876543210')).toEqual({ countryCode: 'IN', digits: '9876543210' });
  });

  it('does not confuse +971 (UAE) with +91 (India)', () => {
    expect(parsePhoneNumber('+971512345678').countryCode).toBe('AE');
  });
});

describe('validatePhoneNumber', () => {
  it('accepts correct local lengths per country', () => {
    expect(validatePhoneNumber('+97412345678')).toBe(true);  // QA 8
    expect(validatePhoneNumber('+919876543210')).toBe(true); // IN 10
  });
  it('rejects wrong lengths', () => {
    expect(validatePhoneNumber('+9741234')).toBe(false);
    expect(validatePhoneNumber('+9198765')).toBe(false);
  });
});

describe('formatPhoneNumber / isCountryCode', () => {
  it('formats with the dial code', () => {
    expect(formatPhoneNumber('QA', '12345678')).toBe('+97412345678');
  });
  it('validates country codes', () => {
    expect(isCountryCode('QA')).toBe(true);
    expect(isCountryCode('ZZ')).toBe(false);
    expect(isCountryCode(123)).toBe(false);
  });
});
