import { describe, it, expect, beforeEach } from 'vitest';

// Mock localStorage for node test runner
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] || null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); }
};

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = mockLocalStorage;
}

import {
  COUNTRY_CURRENCIES,
  getActiveCountry,
  getActiveCurrency,
  getActiveCurrencySymbol,
  fmt
} from '../helpers';

describe('Global Country & Currency Synchronization', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Country to Currency Mapping', () => {
    it('maps QA (Qatar) to QAR', () => {
      expect(COUNTRY_CURRENCIES.QA).toEqual({ code: 'QAR', symbol: 'QAR', name: 'Qatari Riyal' });
    });

    it('maps IN (India) to INR with ₹ symbol', () => {
      expect(COUNTRY_CURRENCIES.IN).toEqual({ code: 'INR', symbol: '₹', name: 'Indian Rupee' });
    });

    it('maps AE (UAE) to AED', () => {
      expect(COUNTRY_CURRENCIES.AE).toEqual({ code: 'AED', symbol: 'AED', name: 'UAE Dirham' });
    });

    it('maps SA (Saudi Arabia) to SAR', () => {
      expect(COUNTRY_CURRENCIES.SA).toEqual({ code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal' });
    });

    it('maps OM (Oman) to OMR', () => {
      expect(COUNTRY_CURRENCIES.OM).toEqual({ code: 'OMR', symbol: 'OMR', name: 'Omani Rial' });
    });

    it('maps KW (Kuwait) to KWD', () => {
      expect(COUNTRY_CURRENCIES.KW).toEqual({ code: 'KWD', symbol: 'KWD', name: 'Kuwaiti Dinar' });
    });

    it('maps BH (Bahrain) to BHD', () => {
      expect(COUNTRY_CURRENCIES.BH).toEqual({ code: 'BHD', symbol: 'BHD', name: 'Bahraini Dinar' });
    });

    it('maps US (United States) to USD with $ symbol', () => {
      expect(COUNTRY_CURRENCIES.US).toEqual({ code: 'USD', symbol: '$', name: 'US Dollar' });
    });

    it('maps GB (United Kingdom) to GBP with £ symbol', () => {
      expect(COUNTRY_CURRENCIES.GB).toEqual({ code: 'GBP', symbol: '£', name: 'British Pound' });
    });
  });

  describe('Dynamic Global Helpers Resolution', () => {
    it('defaults to QA / QAR when no localStorage preference is set', () => {
      expect(getActiveCountry()).toBe('QA');
      expect(getActiveCurrency()).toBe('QAR');
      expect(getActiveCurrencySymbol()).toBe('QAR');
      expect(fmt.currency(5000)).toBe('QAR 5,000');
    });

    it('dynamically switches to India (INR / ₹) when wt_country is set to IN', () => {
      localStorage.setItem('wt_country', 'IN');
      expect(getActiveCountry()).toBe('IN');
      expect(getActiveCurrency()).toBe('INR');
      expect(getActiveCurrencySymbol()).toBe('₹');
      expect(fmt.currency(150000)).toBe('INR 150,000');
    });

    it('dynamically switches to UAE (AED) when wt_country is set to AE', () => {
      localStorage.setItem('wt_country', 'AE');
      expect(getActiveCountry()).toBe('AE');
      expect(getActiveCurrency()).toBe('AED');
      expect(getActiveCurrencySymbol()).toBe('AED');
      expect(fmt.currency(2500)).toBe('AED 2,500');
    });

    it('dynamically switches to Saudi Arabia (SAR) when wt_country is set to SA', () => {
      localStorage.setItem('wt_country', 'SA');
      expect(getActiveCountry()).toBe('SA');
      expect(getActiveCurrency()).toBe('SAR');
      expect(getActiveCurrencySymbol()).toBe('SAR');
      expect(fmt.currency(3200)).toBe('SAR 3,200');
    });

    it('dynamically switches to USA (USD / $) when wt_country is set to US', () => {
      localStorage.setItem('wt_country', 'US');
      expect(getActiveCountry()).toBe('US');
      expect(getActiveCurrency()).toBe('USD');
      expect(getActiveCurrencySymbol()).toBe('$');
      expect(fmt.currency(750)).toBe('USD 750');
    });

    it('dynamically switches to UK (GBP / £) when wt_country is set to GB', () => {
      localStorage.setItem('wt_country', 'GB');
      expect(getActiveCountry()).toBe('GB');
      expect(getActiveCurrency()).toBe('GBP');
      expect(getActiveCurrencySymbol()).toBe('£');
      expect(fmt.currency(1200)).toBe('GBP 1,200');
    });
  });
});
