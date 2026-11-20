import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('LeadSourcesPage Responsive & Alignment Optimization', () => {
  const cssPath = path.resolve(__dirname, '../../../index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const pagePath = path.resolve(__dirname, '../LeadSourcesPage.tsx');
  const pageContent = fs.readFileSync(pagePath, 'utf8');

  it('contains dedicated page, card, and table classes in LeadSourcesPage.tsx', () => {
    expect(pageContent).toContain('className="lead-sources-page"');
    expect(pageContent).toContain('className="card card-table-sep lead-sources-card"');
    expect(pageContent).toContain('className="table-pro lead-sources-table"');
  });

  it('maintains 5 consistent table columns across thead, skeleton, and empty state', () => {
    expect(pageContent).toContain('<th className="sno-col">S NO</th>');
    expect(pageContent).toContain('<th>Name</th>');
    expect(pageContent).toContain('<th>Status</th>');
    expect(pageContent).toContain('<th>Description</th>');
    expect(pageContent).toContain('<th>Actions</th>');
    expect(pageContent).toContain('<SkeletonRow key={i} cols={5} />');
    expect(pageContent).toContain('<td colSpan={5}>');
  });

  it('contains semantic cell class hooks for desktop and mobile targeting', () => {
    expect(pageContent).toContain('className="sno-col"');
    expect(pageContent).toContain('className="lead-source-name-cell"');
    expect(pageContent).toContain('className="lead-source-status-cell"');
    expect(pageContent).toContain('className="lead-source-desc-cell"');
    expect(pageContent).toContain('className="lead-source-actions-cell"');
  });

  it('enforces left-to-right text alignment on Desktop (> 980px) for Name and Description', () => {
    expect(cssContent).toContain('.lead-sources-page .lead-sources-table td.lead-source-name-cell');
    expect(cssContent).toContain('.lead-sources-page .lead-sources-table td.lead-source-desc-cell');
    
    // Check that desktop rules set text-align: left for Name & Description
    const desktopSection = cssContent.slice(cssContent.indexOf('/* ── Desktop & PC Table (> 980px) ── */'));
    expect(desktopSection).toContain('text-align: left !important');
    expect(desktopSection).toContain('justify-content: flex-start !important');
  });

  it('defines tablet breakpoint (<= 980px) with 2-column card grid', () => {
    expect(cssContent).toContain('@media (max-width: 980px)');
    const tabletSection = cssContent.slice(cssContent.indexOf('/* ── Tablet & Mobile (<= 980px) ── */'));
    expect(tabletSection).toContain('grid-template-columns: repeat(2, minmax(0, 1fr)) !important');
    expect(tabletSection).toContain('.lead-sources-page .tbl-wrap .responsive-card-table thead');
  });

  it('defines top banner header card pill matching sample card with LEAD SOURCE label', () => {
    const tabletSection = cssContent.slice(cssContent.indexOf('/* ── Tablet & Mobile (<= 980px) ── */'));
    expect(tabletSection).toContain("content: 'LEAD SOURCE' !important");
    expect(tabletSection).toContain('border-radius: 14px !important');
    expect(tabletSection).toContain('font-weight: 800 !important');
  });

  it('defines status row with uppercase STATUS label and fit-content pill badge', () => {
    const tabletSection = cssContent.slice(cssContent.indexOf('/* ── Tablet & Mobile (<= 980px) ── */'));
    expect(tabletSection).toContain("content: 'STATUS' !important");
    expect(tabletSection).toContain('width: fit-content !important');
    expect(tabletSection).toContain('border-radius: 999px !important');
  });

  it('defines description row with uppercase DESCRIPTION label and readable left alignment', () => {
    const tabletSection = cssContent.slice(cssContent.indexOf('/* ── Tablet & Mobile (<= 980px) ── */'));
    expect(tabletSection).toContain("content: 'DESCRIPTION' !important");
    expect(tabletSection).toContain('text-align: left !important');
  });

  it('defines actions row with bottom right-aligned touch-friendly buttons', () => {
    const tabletSection = cssContent.slice(cssContent.indexOf('/* ── Tablet & Mobile (<= 980px) ── */'));
    expect(tabletSection).toContain('justify-content: flex-end !important');
    expect(tabletSection).toContain('.btn-action');
    expect(tabletSection).toContain('width: 36px !important');
  });

  it('defines mobile phone breakpoint (<= 640px) with 1-column card grid and responsive toolbar', () => {
    const mobileSection = cssContent.slice(cssContent.indexOf('/* ── Mobile Phone View (<= 640px) ── */'));
    expect(mobileSection).toContain('grid-template-columns: 1fr !important');
    expect(mobileSection).toContain('.lead-sources-page .table-toolbar-row .toolbar-actions');
    expect(mobileSection).toContain('grid-template-columns: 1fr 1fr !important');
  });

  it('includes dark mode styles for card surfaces and top pill banner', () => {
    expect(cssContent).toContain('.dark .lead-sources-page .tbl-wrap .responsive-card-table tbody tr');
    expect(cssContent).toContain('.dark .lead-sources-page .tbl-wrap .responsive-card-table tbody td.lead-source-name-cell');
  });
});
