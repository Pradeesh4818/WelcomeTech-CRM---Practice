import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('ProfilePage Mobile Responsiveness', () => {
  const profilePagePath = path.resolve(__dirname, '../ProfilePage.tsx');
  const pageContent = fs.readFileSync(profilePagePath, 'utf8');

  it('contains responsive media query rules in ProfilePage scoped styles', () => {
    expect(pageContent).toContain('@media (max-width: 1024px)');
    expect(pageContent).toContain('@media (max-width: 768px)');
  });

  it('stacks overview section grid into single column on mobile screens', () => {
    const m768 = pageContent.slice(pageContent.indexOf('@media (max-width: 768px)'));
    expect(m768).toContain('.p-section-grid');
    expect(m768).toMatch(/\.p-section-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
  });

  it('configures profile header to wrap and center vertically on mobile', () => {
    const m768 = pageContent.slice(pageContent.indexOf('@media (max-width: 768px)'));
    expect(m768).toContain('.profile-header-main');
    expect(m768).toMatch(/flex-direction:\s*column/);
    expect(m768).toContain('.p-meta-strip');
    expect(m768).toMatch(/flex-wrap:\s*wrap/);
  });

  it('enables smooth horizontal touch scrolling for tabs bar without clipping', () => {
    const m768 = pageContent.slice(pageContent.indexOf('@media (max-width: 768px)'));
    expect(m768).toContain('.profile-tabs-nav');
    expect(m768).toMatch(/overflow-x:\s*auto/);
    expect(m768).toContain('.p-tab-btn');
    expect(m768).toMatch(/flex-shrink:\s*0/);
    expect(m768).toMatch(/white-space:\s*nowrap/);
  });

  it('ensures details, documents, and security sections are responsive on mobile', () => {
    const m768 = pageContent.slice(pageContent.indexOf('@media (max-width: 768px)'));
    expect(m768).toContain('.p-form-grid');
    expect(m768).toMatch(/\.p-form-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(m768).toContain('.p-docs-grid');
    expect(m768).toMatch(/\.p-docs-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(m768).toContain('.p-sec-card');
  });
});
