import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Executive Dashboard Mobile Responsiveness', () => {
  const cssPath = path.resolve(__dirname, '../../../index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const dashPagePath = path.resolve(__dirname, '../DashboardPage.tsx');
  const pageContent = fs.readFileSync(dashPagePath, 'utf8');

  it('defines core responsive dashboard container classes in index.css', () => {
    expect(cssContent).toContain('.dash-page');
    expect(cssContent).toContain('.dash-main-split');
    expect(cssContent).toContain('.dash-primary-col');
    expect(cssContent).toContain('.dash-secondary-col');
    expect(cssContent).toContain('.dash-services-grid');
    expect(cssContent).toContain('.dash-work-tabs-bar');
    expect(cssContent).toContain('.dash-card');
    expect(cssContent).toContain('.dash-shortcuts-grid');
    expect(cssContent).toContain('.dash-launchpad-grid');
  });

  it('contains mobile breakpoint rules for stacking and single-column layout', () => {
    // Media query <= 1024px stacks the main split
    expect(cssContent).toMatch(/@media\s*\(max-width:\s*1024px\)/);
    expect(cssContent).toContain('dash-main-split');

    // Media query <= 640px keeps services grid strictly 2x2
    expect(cssContent).toMatch(/@media\s*\(max-width:\s*640px\)/);
    const m640 = cssContent.slice(cssContent.indexOf('@media (max-width: 640px)'));
    expect(m640).toContain('.dash-services-grid');
    expect(m640).toMatch(/\.dash-services-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);

    // Media query <= 480px keeps KPI grid, launchpad, and services strictly 2x2 globally
    expect(cssContent).toMatch(/@media\s*\(max-width:\s*480px\)/);
    const m480 = cssContent.slice(cssContent.indexOf('@media (max-width: 480px)'));
    expect(m480).toContain('.dash-kpi-grid');
    expect(m480).toContain('.dash-launchpad-grid');
    expect(m480).toContain('.dash-services-grid');
    expect(m480).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);
    expect(m480).toContain('.dash-work-item');
    expect(m480).toContain('flex-direction: column !important');
  });

  it('uses responsive classes throughout DashboardPage component', () => {
    expect(pageContent).toContain('className="dash-page');
    expect(pageContent).toContain('className="dash-kpi-grid"');
    expect(pageContent).toContain('className="dash-main-split"');
    expect(pageContent).toContain('className="dash-primary-col"');
    expect(pageContent).toContain('className="dash-secondary-col"');
    expect(pageContent).toContain('className="dash-services-grid"');
    expect(pageContent).toContain('className="dash-work-tabs-bar"');
    expect(pageContent).toContain('className="dash-shortcuts-grid"');
    expect(pageContent).toContain('className="dash-launchpad-grid"');
  });

  it('provides short labels for mobile view on unified workspace tabs', () => {
    expect(pageContent).toContain('dash-tab-label-full');
    expect(pageContent).toContain('dash-tab-label-short');
  });
});
