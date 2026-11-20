import { describe, it, expect } from 'vitest';
import { buildProposalFullHtml } from '../htmlPdfGenerator';

describe('htmlPdfGenerator — Discrete A4 Sheet Multi-Page Parity', () => {
  const settings = {
    companyName: 'Welcome Trading Co. W.L.L',
    currency: 'QAR',
    brandColor: '#6d28d9',
    proposalHeaderImage: 'https://cdn.example.com/header-banner.png',
    proposalFooterImage: 'https://cdn.example.com/footer-banner.png',
    country: 'QA',
  };

  const entity = {
    name: 'Al-Rayyan Holdings WLL',
    email: 'contact@alrayyan.qa',
    phone: '+974 5511 2233',
    address: 'Lusail Marina Tower, Floor 14, Doha, Qatar',
  };

  it('TC-BE-1: Renders discrete A4 sheets with 297mm height and page-break-after: always', () => {
    const proposal: any = {
      proposalNo: 'WT-Q2026-901',
      title: 'Enterprise ERP Implementation',
      discount: 5,
      validForDays: 30,
      blocks: [
        {
          id: 'b1',
          type: 'table',
          title: 'Phase 1 Scope',
          items: [
            { id: 1, type: 'item', description: 'Core System Setup', qty: 1, unitPrice: 15000 },
          ],
        },
      ],
    };

    const html = buildProposalFullHtml({ proposal, entity, settings });
    expect(html).toContain('section class="page a4-discrete-sheet"');
    expect(html).toContain('width: 210mm;');
    expect(html).toContain('height: 297mm;');
    expect(html).toContain('page-break-after: always;');
    expect(html).toContain('-webkit-print-color-adjust: exact !important;');
  });

  it('TC-BE-2: Renders header and footer banner images on every discrete A4 page', () => {
    // Generate enough items/blocks to force multi-page chunking
    const items = Array.from({ length: 35 }, (_, idx) => ({
      id: idx + 1,
      type: 'item',
      description: `Implementation Deliverable Milestone #${idx + 1} with comprehensive testing and QA sign-off`,
      qty: 1,
      unitPrice: 1000,
    }));

    const proposal: any = {
      proposalNo: 'WT-Q2026-902',
      title: 'Multi-Page Complex Quotation',
      discount: 0,
      blocks: [
        {
          id: 't1',
          type: 'table',
          title: 'All Deliverables',
          items,
        },
        {
          id: 'text1',
          type: 'text',
          title: 'Project Terms',
          content: '<p>Payment due within 30 days of completion milestone.</p>',
        },
      ],
    };

    const html = buildProposalFullHtml({ proposal, entity, settings });
    
    // Count occurrences of section.page
    const pageMatches = html.match(/class="page a4-discrete-sheet"/g) || [];
    expect(pageMatches.length).toBeGreaterThan(1);

    // Header image must appear on every page (matching Create/Edit canvas)
    const headerMatches = html.match(/src="https:\/\/cdn\.example\.com\/header-banner\.png"/g) || [];
    expect(headerMatches.length).toBe(pageMatches.length);

    // Footer image must appear on every page
    const footerMatches = html.match(/src="https:\/\/cdn\.example\.com\/footer-banner\.png"/g) || [];
    expect(footerMatches.length).toBe(pageMatches.length);
  });

  it('TC-BE-3: Page 1 renders recipient and specification cards with SVG icons, while Page 2+ renders continuation sub-bar', () => {
    const itemsPage1 = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      type: 'item',
      description: `Task Item #${i + 1}`,
      qty: 1,
      unitPrice: 500,
    }));
    const itemsPage2 = Array.from({ length: 10 }, (_, i) => ({
      id: i + 26,
      type: 'item',
      description: `Task Item #${i + 26}`,
      qty: 1,
      unitPrice: 500,
    }));

    const proposal: any = {
      proposalNo: 'WT-Q2026-903',
      title: 'Split Scope Proposal',
      discount: 0,
      blocks: [
        { id: 'b1', type: 'table', title: 'Scope 1', items: itemsPage1 },
        { id: 'b2', type: 'table', title: 'Scope 2', items: itemsPage2, pageBreak: true },
      ],
    };

    const html = buildProposalFullHtml({ proposal, entity, settings });

    // Page 1 has recipient and specification cards
    expect(html).toContain('Recipient Information');
    expect(html).toContain('Document Specifications');
    expect(html).toContain('Al-Rayyan Holdings WLL');

    // Page 2+ continuation sub-bar displays page indicator and continuation header
    expect(html).toMatch(/Page 2 of \d/);
    expect(html).toContain('Pricing Table #1 (Continued)');
    expect(html).toContain('Quotation WT-Q2026-903');
  });

  it('TC-BE-4: Displays table totals, discount, and amount in words formatted properly', () => {
    const proposal: any = {
      proposalNo: 'WT-Q2026-904',
      title: 'Financial Summary Quote',
      discount: 10,
      blocks: [
        {
          id: 'b1',
          type: 'table',
          title: 'Software Licensing',
          discountPercent: 10,
          items: [
            { id: 1, type: 'item', description: 'Enterprise License', qty: 2, unitPrice: 5000 },
          ],
        },
      ],
    };

    const html = buildProposalFullHtml({ proposal, entity, settings });
    expect(html).toContain('Subtotal:');
    expect(html).toContain('QAR 10,000.00');
    expect(html).toContain('Discount (10%):');
    expect(html).toContain('-QAR 1,000.00');
    expect(html).toContain('Table Total:');
    expect(html).toContain('QAR 9,000.00');
    expect(html).toContain('Amount in Words:');
  });
});
