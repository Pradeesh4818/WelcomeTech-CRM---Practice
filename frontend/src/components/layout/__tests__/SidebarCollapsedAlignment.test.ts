import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Sidebar Collapsed Header Centering Styles', () => {
  const cssPath = path.resolve(__dirname, '../../../index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  it('hides .sb-brand-text when .app-shell.sidebar-closed is active to prevent left alignment bias', () => {
    expect(cssContent).toMatch(/\.app-shell\.sidebar-closed\s+\.sidebar\s+\.sb-brand-text/);
    expect(cssContent).toMatch(/\.app-shell\.sidebar-closed\s+\.sidebar-v2\s+\.sb-brand-text/);
    
    // Check that display: none !important is applied
    const brandTextRule = cssContent.match(
      /\.app-shell\.sidebar-closed\s+\.sidebar\s+\.sb-brand-text,\s*\.app-shell\.sidebar-closed\s+\.sidebar-v2\s+\.sb-brand-text\s*\{([^}]+)\}/
    );
    expect(brandTextRule).not.toBeNull();
    expect(brandTextRule![1]).toContain('display: none !important');
    expect(brandTextRule![1]).toContain('flex: 0 0 0 !important');
  });

  it('centers .sb-brand-row when .app-shell.sidebar-closed is active', () => {
    const brandRowRule = cssContent.match(
      /\.app-shell\.sidebar-closed\s+\.sidebar\s+\.sb-brand-row,\s*\.app-shell\.sidebar-closed\s+\.sidebar-v2\s+\.sb-brand-row\s*\{([^}]+)\}/
    );
    expect(brandRowRule).not.toBeNull();
    expect(brandRowRule![1]).toContain('justify-content: center !important');
    expect(brandRowRule![1]).toContain('margin: 0 auto !important');
    expect(brandRowRule![1]).toContain('align-items: center !important');
  });

  it('centers .sb-logo-mark with exact dimensions and margin 0 auto when .app-shell.sidebar-closed is active', () => {
    const logoMarkRule = cssContent.match(
      /\.app-shell\.sidebar-closed\s+\.sidebar\s+\.sb-logo-mark,\s*\.app-shell\.sidebar-closed\s+\.sidebar-v2\s+\.sb-logo-mark\s*\{([^}]+)\}/
    );
    expect(logoMarkRule).not.toBeNull();
    expect(logoMarkRule![1]).toMatch(/width:\s*(36|42)px !important/);
    expect(logoMarkRule![1]).toMatch(/height:\s*(36|42)px !important/);
    expect(logoMarkRule![1]).toContain('margin: 0 auto !important');
    expect(logoMarkRule![1]).toContain('align-items: center !important');
    expect(logoMarkRule![1]).toContain('justify-content: center !important');
  });

  it('ensures .sb-top-panel has center alignment and zero horizontal padding when collapsed', () => {
    const topPanelRule = cssContent.match(
      /\.app-shell\.sidebar-closed\s+\.sidebar\s+\.sb-top-panel,\s*\.app-shell\.sidebar-closed\s+\.sidebar-v2\s+\.sb-top-panel\s*\{([^}]+)\}/
    );
    expect(topPanelRule).not.toBeNull();
    expect(topPanelRule![1]).toContain('padding: 12px 0 !important');
    expect(topPanelRule![1]).toContain('align-items: center !important');
    expect(topPanelRule![1]).toContain('justify-content: center !important');
  });
});
