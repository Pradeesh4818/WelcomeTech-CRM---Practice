import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sidebar Primary Brand Color Parity', () => {
  const cssPath = path.resolve(__dirname, '../../../index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  it('ensures sidebar uses solid var(--brand) and completely disables linear-gradient / darkening', () => {
    // Check light mode sidebar rule
    const sidebarRuleMatch = cssContent.match(/\.sidebar,\s*\.sidebar-v2\s*\{([^}]+)\}/);
    expect(sidebarRuleMatch).toBeTruthy();
    const sidebarRule = sidebarRuleMatch ? sidebarRuleMatch[1] : '';

    expect(sidebarRule).toContain('background: var(--brand) !important;');
    expect(sidebarRule).toContain('background-color: var(--brand) !important;');
    expect(sidebarRule).toContain('background-image: none !important;');
    expect(sidebarRule).not.toMatch(/background:\s*linear-gradient/i);
    expect(sidebarRule).not.toMatch(/color-mix\(in srgb,\s*var\(--brand\)\s*88%/i);
  });

  it('ensures dark mode sidebar also uses solid var(--brand) without darkening gradients', () => {
    const darkSidebarRuleMatch = cssContent.match(/\.dark\s+\.sidebar,\s*\.dark\s+\.sidebar-v2\s*\{([^}]+)\}/);
    expect(darkSidebarRuleMatch).toBeTruthy();
    const darkRule = darkSidebarRuleMatch ? darkSidebarRuleMatch[1] : '';

    expect(darkRule).toContain('background: var(--brand) !important;');
    expect(darkRule).toContain('background-color: var(--brand) !important;');
    expect(darkRule).toContain('background-image: none !important;');
    expect(darkRule).not.toMatch(/linear-gradient/i);
  });

  it('ensures dark mode sidebar does not override --brand to brand-fill-deep', () => {
    // Ensure --brand: var(--brand-fill-deep) is not set on .dark .sidebar
    expect(cssContent).not.toMatch(/\.dark\s+\.sidebar[^{]*\{[^}]*--brand:\s*var\(--brand-fill-deep\)/);
  });
});
