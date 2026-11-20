import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock localStorage and document for Zustand store in Node environment
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

const setPropertyMock = vi.fn();
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    documentElement: {
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        toggle: vi.fn(),
        contains: vi.fn(),
      },
      style: {
        setProperty: setPropertyMock,
        getPropertyValue: vi.fn(),
      },
    },
    head: {
      appendChild: vi.fn(),
    },
    getElementById: vi.fn(),
  };
}

import { sanitizeBrandColor, useThemeStore } from '../../../store/themeStore';

describe('Global Dark Mode Color Tone & Header Toggle Icon Parity', () => {
  beforeEach(() => {
    localStorage.clear();
    setPropertyMock.mockClear();
  });

  describe('1. sanitizeBrandColor - Global Dark Mode Tone Adaptation', () => {
    it('TC-DARK-01: preserves base brand color as-is in light mode', () => {
      const wtBrand = '#722580';
      const result = sanitizeBrandColor(wtBrand, 'light');
      expect(result).toBe('#722580');
    });

    it('TC-DARK-02: dynamically adapts dark brand color (#722580) to luminous, high-contrast tone in dark mode', () => {
      const wtBrand = '#722580'; // Welcome Tech deep purple (L = 32%)
      const result = sanitizeBrandColor(wtBrand, 'dark');

      // Must be transformed to an accessible luminous violet/orchid tone
      expect(result).not.toBe('#722580');
      expect(result).toBe('#d685e5'); // 291° hue preserved with ~71% lightness
    });

    it('TC-DARK-03: preserves already-luminous colors (L >= 0.65) in dark mode', () => {
      const pastelColor = '#c4b5fd';
      const result = sanitizeBrandColor(pastelColor, 'dark');
      expect(result).toBe('#c4b5fd');
    });

    it('TC-DARK-04: gracefully handles empty, null, or invalid inputs with accessible fallbacks', () => {
      expect(sanitizeBrandColor(null, 'dark')).toBe('#a78bfa');
      expect(sanitizeBrandColor('', 'light')).toBe('#6d28d9');
      expect(sanitizeBrandColor('invalid', 'dark')).toBe('#a78bfa');
    });
  });

  describe('2. useThemeStore - Dynamic CSS Variable Synchronization', () => {
    it('TC-DARK-05: toggling theme flips --brand between base and luminous dark-mode tone', () => {
      useThemeStore.getState().setBrandColor('#722580');
      useThemeStore.getState().setTheme('light');

      // In light mode, --brand is base #722580
      expect(setPropertyMock).toHaveBeenCalledWith('--brand', '#722580');

      // Toggle to dark mode
      useThemeStore.getState().toggle();
      expect(useThemeStore.getState().theme).toBe('dark');
      // In dark mode, --brand is luminous #d685e5
      expect(setPropertyMock).toHaveBeenCalledWith('--brand', '#d685e5');

      // Toggle back to light mode
      useThemeStore.getState().toggle();
      expect(useThemeStore.getState().theme).toBe('light');
      expect(setPropertyMock).toHaveBeenCalledWith('--brand', '#722580');
    });

    it('TC-DARK-06: setBrandColor dynamically computes accessible tone if currently in dark mode', () => {
      useThemeStore.getState().setTheme('dark');
      useThemeStore.getState().setBrandColor('#722580');

      // Stored brandColor remains the user's choice
      expect(useThemeStore.getState().brandColor).toBe('#722580');
      // CSS variable --brand receives the dark-adapted luminous tone
      expect(setPropertyMock).toHaveBeenCalledWith('--brand', '#d685e5');
    });
  });

  describe('3. Header Mode Toggle - Icon-Only Layout', () => {
    it('TC-DARK-07: Topbar theme toggle button has NO text (Light/Dark text removed) and renders icon only', () => {
      const topbarPath = path.resolve(__dirname, '../../../components/layout/Topbar.tsx');
      const topbarCode = fs.readFileSync(topbarPath, 'utf8');

      // Check the button element
      const toggleMatch = topbarCode.match(/id="topbar-theme-toggle"[\s\S]*?<\/button>/);
      expect(toggleMatch).not.toBeNull();
      const buttonContent = toggleMatch![0];

      // Must NOT contain <span>Light</span> or <span>Dark</span>
      expect(buttonContent).not.toContain('>Light<');
      expect(buttonContent).not.toContain('>Dark<');
      expect(buttonContent).not.toMatch(/<span>\s*(Light|Dark)\s*<\/span>/);

      // Must contain Moon and Sun icons
      expect(buttonContent).toContain('<Moon');
      expect(buttonContent).toContain('<Sun');

      // Must have aria-label and circular icon sizing
      expect(buttonContent).toContain('aria-label=');
      expect(buttonContent).toContain('width: 36');
      expect(buttonContent).toContain('height: 36');
      expect(buttonContent).toContain('borderRadius: 999');
    });
  });

  describe('4. Proposals Table & Global Dark Mode CSS Parity', () => {
    it('TC-DARK-08: ProposalsPage proposal ID button uses record-id-link and proposal-no-btn classes', () => {
      const miscPagesPath = path.resolve(__dirname, '../MiscPages.tsx');
      const miscCode = fs.readFileSync(miscPagesPath, 'utf8');

      // Should have record-id-link proposal-no-btn on proposal button
      expect(miscCode).toContain('className="record-id-link proposal-no-btn"');
    });

    it('TC-DARK-09: index.css contains dark-mode styles for proposal-no-btn and record-id-link with brand color', () => {
      const indexCssPath = path.resolve(__dirname, '../../../index.css');
      const cssContent = fs.readFileSync(indexCssPath, 'utf8');

      expect(cssContent).toContain('.dark .proposal-no-btn');
      expect(cssContent).toContain('.dark .record-id-link');
      expect(cssContent).toMatch(/\.dark\s+\.proposal-no-btn[\s\S]*?color:\s*var\(--brand/);
    });
  });
});
