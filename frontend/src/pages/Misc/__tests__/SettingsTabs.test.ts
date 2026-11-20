import { describe, it, expect, beforeEach } from 'vitest';
import { APP_FONT_OPTIONS, DEFAULT_APP_FONT, isAppFontKey, isFontChoice } from '../../../utils/fonts';
import { COUNTRY_PHONE_RULES } from '../../../utils/phoneRules';
import { getInitialSettingsTab, VALID_SETTINGS_TABS } from '../SettingsPage';

// Mock localStorage for Node test runner
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] || null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); }
};

if (typeof (globalThis as any).localStorage === 'undefined') {
  (globalThis as any).localStorage = mockLocalStorage;
}

describe('Settings Configurations & Data Integrity', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('contains valid system fonts with default font Outfit', () => {
    expect(DEFAULT_APP_FONT).toBe('outfit');
    expect(APP_FONT_OPTIONS.length).toBeGreaterThanOrEqual(5);
    expect(APP_FONT_OPTIONS.some(f => f.value === 'outfit')).toBe(true);
    expect(isAppFontKey('outfit')).toBe(true);
    expect(isAppFontKey('invalid-font')).toBe(false);
  });

  it('supports custom uploaded font validation', () => {
    expect(isFontChoice('custom')).toBe(true);
    expect(isFontChoice('outfit')).toBe(true);
    expect(isFontChoice('unknown')).toBe(false);
  });

  it('contains complete country rules for Qatar, UAE, India, Saudi Arabia', () => {
    expect(COUNTRY_PHONE_RULES.QA.dialCode).toBe('+974');
    expect(COUNTRY_PHONE_RULES.QA.digits).toBe(8);

    expect(COUNTRY_PHONE_RULES.AE.dialCode).toBe('+971');
    expect(COUNTRY_PHONE_RULES.AE.digits).toBe(9);

    expect(COUNTRY_PHONE_RULES.IN.dialCode).toBe('+91');
    expect(COUNTRY_PHONE_RULES.IN.digits).toBe(10);

    expect(COUNTRY_PHONE_RULES.SA.dialCode).toBe('+966');
    expect(COUNTRY_PHONE_RULES.SA.digits).toBe(9);
  });

  describe('Tab Persistence on Refresh (getInitialSettingsTab)', () => {
    it('TC-TAB-01: Contains valid settings tabs including backup', () => {
      expect(VALID_SETTINGS_TABS).toContain('backup');
      expect(VALID_SETTINGS_TABS).toContain('general');
      expect(VALID_SETTINGS_TABS).toContain('smtp');
      expect(VALID_SETTINGS_TABS).toContain('appearance');
    });

    it('TC-TAB-02: Preserves active backup tab on refresh when URL parameter tab=backup is present', () => {
      const initialTab = getInitialSettingsTab('backup');
      expect(initialTab).toBe('backup');
    });

    it('TC-TAB-03: Preserves active backup tab from localStorage on refresh without moving to 1st tab', () => {
      localStorage.setItem('active_settings_tab', 'backup');
      const initialTab = getInitialSettingsTab(null);
      expect(initialTab).toBe('backup');
    });

    it('TC-TAB-04: Falls back to general only when both query param and localStorage are empty', () => {
      const initialTab = getInitialSettingsTab(null);
      expect(initialTab).toBe('general');
    });

    it('TC-TAB-05: Safely ignores invalid tab names and falls back to general', () => {
      const initialTab = getInitialSettingsTab('invalid_non_existent_tab');
      expect(initialTab).toBe('general');
    });
  });
});
