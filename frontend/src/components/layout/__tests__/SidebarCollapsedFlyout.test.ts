import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Collapsed Sidebar Dropdown Hover Flyout Theme Integration', () => {
  const cssPath = path.resolve(__dirname, '../../../index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  it('defines .sb-flyout-menu with theme variables and fixed portal positioning', () => {
    expect(cssContent).toContain('.sb-flyout-menu');
    const flyoutRule = cssContent.match(/\.sb-flyout-menu\s*\{([^}]+)\}/);
    expect(flyoutRule).not.toBeNull();
    const styles = flyoutRule![1];
    expect(styles).toContain('position: fixed');
    expect(styles).toContain('z-index: 99999');
    expect(styles).toContain('background: var(--surface-1)');
    expect(styles).toContain('color: var(--tx-1)');
    expect(styles).toContain('border: 1px solid var(--border)');
    expect(styles).toContain('border-radius: 14px');
  });

  it('supports dark mode theme tokens on .dark .sb-flyout-menu', () => {
    const darkFlyoutRule = cssContent.match(/\.dark\s+\.sb-flyout-menu\s*\{([^}]+)\}/);
    expect(darkFlyoutRule).not.toBeNull();
    const darkStyles = darkFlyoutRule![1];
    expect(darkStyles).toContain('background: rgba(15, 23, 42, 0.96)');
    expect(darkStyles).toContain('border-color: rgba(148, 163, 184, 0.18)');
  });

  it('formats flyout header with uppercase brand accent styling', () => {
    const titleRule = cssContent.match(/\.sb-flyout-title\s*\{([^}]+)\}/);
    expect(titleRule).not.toBeNull();
    const titleStyles = titleRule![1];
    expect(titleStyles).toContain('text-transform: uppercase');
    expect(titleStyles).toContain('color: var(--brand)');
    expect(titleStyles).toContain('font-weight: 800');
  });

  it('styles flyout items with brand hover and active indicator', () => {
    const itemRule = cssContent.match(/\.sb-flyout-item:hover\s*\{([^}]+)\}/);
    expect(itemRule).not.toBeNull();
    expect(itemRule![1]).toContain('color: var(--brand)');

    const activeRule = cssContent.match(/\.sb-flyout-item\.active\s*\{([^}]+)\}/);
    expect(activeRule).not.toBeNull();
    expect(activeRule![1]).toContain('color: var(--brand)');

    const dotRule = cssContent.match(/\.sb-flyout-item\.active::after\s*\{([^}]+)\}/);
    expect(dotRule).not.toBeNull();
    expect(dotRule![1]).toContain('background: var(--brand)');
  });

  it('lights up collapsed nav item with hovered class when flyout is open', () => {
    expect(cssContent).toMatch(/\.app-shell\.sidebar-closed\s+\.sidebar-v2\s+\.sb-nav-item\.hovered/);
    const hoveredRule = cssContent.match(/\.app-shell\.sidebar-closed\s+\.sidebar-v2\s+\.sb-nav-item\.hovered\s*\{([^}]+)\}/);
    expect(hoveredRule).not.toBeNull();
    expect(hoveredRule![1]).toContain('color: var(--brand) !important');
  });
});
