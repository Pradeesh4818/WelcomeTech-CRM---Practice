import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('CustomersPage Responsive Optimization', () => {
  const cssPath = path.resolve(__dirname, '../../../index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const pagePath = path.resolve(__dirname, '../CustomersPage.tsx');
  const pageContent = fs.readFileSync(pagePath, 'utf8');

  it('contains desktop table and mobile list toggle classes in index.css', () => {
    expect(cssContent).toContain('.customer-desktop-table');
    expect(cssContent).toContain('.customer-mobile-list');
    expect(cssContent).toContain('.customer-record-card');
  });

  it('hides desktop table and displays mobile list under responsive breakpoint <= 980px', () => {
    expect(cssContent).toContain('@media (max-width: 980px)');
    const m980 = cssContent.slice(cssContent.indexOf('.customer-desktop-table'));
    expect(m980).toContain('display: none');
    expect(m980).toContain('.customer-mobile-list');
  });

  it('ensures details modal has responsive sizing and touch optimization rules', () => {
    expect(cssContent).toContain('.customer-page-details-modal');
    expect(cssContent).toContain('.customer-page-details-modal .modal-box');
    expect(pageContent).toContain('className="customer-page-details-modal"');
  });

  it('supports tablet and mobile viewports with horizontal touch-scrolling inside modals', () => {
    expect(cssContent).toContain('.customer-page-details-modal .tab-nav-premium');
    expect(cssContent).toContain('.customer-page-details-modal .tbl-wrap');
    expect(cssContent).toContain('-webkit-overflow-scrolling: touch');
  });

  it('contains mobile touch optimizations for customer record action buttons', () => {
    expect(cssContent).toContain('.customer-record-actions');
    expect(cssContent).toContain('.mobile-action-icon-btn');
  });

  it('aligns card-table grid items and labels cleanly in details modal on mobile', () => {
    expect(cssContent).toContain('.customer-page-details-modal .tbl-wrap .responsive-card-table');
    expect(cssContent).toContain("td[data-label='Contact Name']");
    expect(cssContent).toContain("td[data-label='Email']");
  });

  it('aligns customer card header, vertical info items, and split action buttons matching target mobile card design', () => {
    expect(cssContent).toContain('.customer-record-title {');
    expect(cssContent).toContain('white-space: normal !important');
    expect(cssContent).toContain('overflow-wrap: break-word !important');

    expect(cssContent).toContain('.record-info-item {');
    expect(cssContent).toContain('flex-direction: column !important');

    expect(cssContent).toContain('.customer-record-actions {');
    expect(cssContent).toContain('justify-content: space-between !important');
    expect(cssContent).toContain('.customer-record-actions .table-actions');
    expect(cssContent).toContain('margin-left: auto !important');

    expect(pageContent).toContain('customer-record-title-row');
    expect(pageContent).toContain('justifyContent: \'space-between\'');
  });
});

