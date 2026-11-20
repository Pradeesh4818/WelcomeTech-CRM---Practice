import { describe, it, expect } from 'vitest';
import { buildProposalEmailHtml } from '../crmController';
import { buildProposalFullHtml } from '../../utils/htmlPdfGenerator';

/**
 * These tests lock the emailed proposal body (buildProposalEmailHtml) to the same
 * layout contract as the pixel-perfect PDF renderer (buildProposalFullHtml), which is
 * what the CRM "View" / "Download PDF" and the email PDF attachment both use.
 *
 * The historical bug: the email body was a separately hand-written template with
 * different column widths (48/252/54/116/116 px on a wider container), totals in a
 * loose right-aligned <div> instead of the amount column, and percentage-width cards
 * with no fixed table layout. That made the emailed version drift out of alignment.
 */

const settings = {
  companyName: 'Welcome Trading Co. W.L.L',
  currency: 'QAR',
  brandColor: '#123456',
  country: 'QA',
};

const entity = {
  name: 'Acme Co',
  email: 'client@acme.test',
  phone: '+974 1234 5678',
  address: 'Doha, Qatar',
};

// subtotal = 2*500 + 0 (free) = 1000; 10% discount => total 900
const proposalWithBlocks: any = {
  proposalNo: 'WT-Q2026-001',
  title: 'Test Quotation',
  discount: 0,
  validForDays: 15,
  quoteDate: '2026-09-01',
  validUntil: '2026-09-16',
  blocks: [
    {
      id: 't1',
      type: 'table',
      title: 'Pricing Table #1',
      discountPercent: 10,
      items: [
        { id: 1, type: 'item', description: 'Item A', qty: 2, unitPrice: 500 },
        { id: 2, type: 'detail', description: 'A sub-description line' },
        { id: 3, type: 'item', description: 'Free bonus item', qty: 1, unitPrice: 0 },
      ],
    },
    { id: 'x1', type: 'text', title: 'Notes', content: '<p>Thank you for your business.</p>' },
  ],
};

describe('buildProposalEmailHtml — layout parity with the PDF renderer', () => {
  it('TC1: item-table columns use percentage widths that sum to 100% (no fixed-px vs 100% conflict)', () => {
    const html = buildProposalEmailHtml(proposalWithBlocks, entity, settings);
    const pct = ['6%', '46%', '8%', '17%', '23%'];
    pct.forEach((w) => expect(html).toContain(`<col style="width:${w};" />`));
    const sum = pct.reduce((a, w) => a + Number(w.replace('%', '')), 0);
    expect(sum).toBe(100);
  });

  it('TC2: totals live in <tfoot> aligned to the amount column, with Amount-in-Words spanning all 5 cols', () => {
    const html = buildProposalEmailHtml(proposalWithBlocks, entity, settings);
    expect(html).toContain('<tfoot>');
    expect(html).toContain('Table Total:');
    expect(html).toContain('Amount in Words:');
    // "Table Total:" label spans the first 4 columns, value sits under the Amount column
    expect(html).toContain('colspan="4"');
    // Amount-in-Words note spans the full 5-column width like the PDF
    expect(html).toContain('colspan="5"');
  });

  it('TC3: the two info cards use a fixed-layout table with equal 49% columns', () => {
    const html = buildProposalEmailHtml(proposalWithBlocks, entity, settings);
    expect(html).toContain('table-layout:fixed');
    expect(html).toContain('<col style="width:49%;" />');
    expect(html).toContain('👤 Recipient Information');
    expect(html).toContain('📄 Document Specifications');
  });

  it('TC4: money is formatted with 2 decimals + currency, identical to the PDF output', () => {
    const html = buildProposalEmailHtml(proposalWithBlocks, entity, settings);
    const pdf = buildProposalFullHtml({ proposal: proposalWithBlocks, entity, settings });
    // subtotal 1,000.00 and discounted total 900.00 must match in both renderers
    expect(html).toContain('QAR 1,000.00');
    expect(html).toContain('QAR 900.00');
    expect(pdf).toContain('QAR 1,000.00');
    expect(pdf).toContain('QAR 900.00');
  });

  it('TC5: table header honours the configured brand color (not a hardcoded purple)', () => {
    const html = buildProposalEmailHtml(proposalWithBlocks, entity, settings);
    expect(html).toContain('#123456');
    expect(html).not.toContain('background:#6d28d9'); // old hardcoded header color
  });

  it('TC6: a zero-priced row renders a FREE badge (matches the PDF)', () => {
    const html = buildProposalEmailHtml(proposalWithBlocks, entity, settings);
    const pdf = buildProposalFullHtml({ proposal: proposalWithBlocks, entity, settings });
    expect(html).toContain('>FREE<');
    expect(pdf).toContain('>FREE<');
  });

  it('TC7: a block without discountPercent falls back to the global proposal discount (matches PDF)', () => {
    const proposal: any = {
      proposalNo: 'WT-Q2026-002',
      title: 'Fallback Discount',
      discount: 5,
      blocks: [
        { id: 'b1', type: 'table', title: 'T', items: [{ id: 1, type: 'item', description: 'X', qty: 1, unitPrice: 200 }] },
      ],
    };
    const html = buildProposalEmailHtml(proposal, entity, settings);
    const pdf = buildProposalFullHtml({ proposal, entity, settings });
    expect(html).toContain('Discount (5%):');
    expect(pdf).toContain('Discount (5%)');
  });

  it('TC8: legacy flat items (no blocks) collapse into a single priced table like the PDF', () => {
    const legacy: any = {
      proposalNo: 'L1',
      title: 'Legacy Quote',
      items: [{ description: 'Old line item', qty: 1, unitPrice: 100 }],
    };
    const html = buildProposalEmailHtml(legacy, entity, settings);
    expect(html).toContain('Old line item');
    expect(html).toContain('QAR 100.00');
    expect(html).toContain('Amount in Words:');
  });

  it('TC9: proposal.terms is auto-appended as a Terms & Conditions text block', () => {
    const proposal: any = {
      proposalNo: 'T1',
      title: 'With Terms',
      items: [{ description: 'X', qty: 1, unitPrice: 10 }],
      terms: 'Payment due in 30 days.',
    };
    const html = buildProposalEmailHtml(proposal, entity, settings);
    expect(html).toContain('Terms &amp; Conditions');
    expect(html).toContain('Payment due in 30 days.');
  });

  it('TC10: currency is driven by settings and matches the PDF (e.g. USD)', () => {
    const usd = { ...settings, currency: 'USD' };
    const html = buildProposalEmailHtml(proposalWithBlocks, entity, usd);
    const pdf = buildProposalFullHtml({ proposal: proposalWithBlocks, entity, settings: usd });
    expect(html).toContain('USD 900.00');
    expect(pdf).toContain('USD 900.00');
  });

  // 1x1 transparent PNG
  const PNG_DATA_URI =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('TC11: header/footer banners embed as inline CID attachments so they render in the mail body', () => {
    const proposal: any = { ...proposalWithBlocks, templateImage: PNG_DATA_URI, templateFooterImage: PNG_DATA_URI };
    const attachments: any[] = [];
    const html = buildProposalEmailHtml(proposal, entity, settings, entity.email, '', undefined, attachments);
    // body references the inline images by content-id, not a (possibly unreachable) URL
    expect(html).toContain('src="cid:proposal-header-banner');
    expect(html).toContain('src="cid:proposal-footer-banner');
    // and two matching inline attachments were queued for nodemailer
    expect(attachments).toHaveLength(2);
    expect(attachments[0].contentDisposition).toBe('inline');
    expect(attachments[0].cid).toContain('proposal-header-banner');
    expect(Buffer.isBuffer(attachments[0].content)).toBe(true);
  });

  it('TC12: without an attachments list, images fall back to a URL/data-URI (no orphan cid refs)', () => {
    const proposal: any = { ...proposalWithBlocks, templateImage: PNG_DATA_URI };
    const html = buildProposalEmailHtml(proposal, entity, settings);
    expect(html).not.toContain('cid:');
    expect(html).toContain('data:image/png;base64');
  });

  it('TC13: compact send mode keeps the full quotation out of the mail body', () => {
    const html = buildProposalEmailHtml(
      proposalWithBlocks,
      entity,
      settings,
      entity.email,
      'Please find attached.',
      undefined,
      [],
      false,
      'https://crm.welcometech.qa/api/v1/public/proposals/abc123/pdf?download=1'
    );
    expect(html).toContain('Proposal ready for review');
    expect(html).toContain('Download as PDF');
    expect(html).toContain('href="https://crm.welcometech.qa/api/v1/public/proposals/abc123/pdf?download=1"');
    expect(html).not.toContain('word-break:break-all');
    expect(html).toContain('Please find attached.');
    expect(html).not.toContain('Pricing Table #1');
    expect(html).not.toContain('Item A');
    expect(html).not.toContain('Table Total:');
  });

  it('TC14: compact send mode suppresses proposal banners so email clients do not show broken image placeholders', () => {
    const proposal: any = { ...proposalWithBlocks, templateImage: PNG_DATA_URI, templateFooterImage: PNG_DATA_URI };
    const attachments: any[] = [];
    const html = buildProposalEmailHtml(proposal, entity, settings, entity.email, '', undefined, attachments, false, 'https://crm.welcometech.qa/api/v1/public/proposals/abc123/pdf');
    expect(html).not.toContain('Header Banner');
    expect(html).not.toContain('Footer Banner');
    expect(html).not.toContain('src="cid:proposal-header-banner');
    expect(html).not.toContain('src="cid:proposal-footer-banner');
    expect(attachments).toHaveLength(0);
  });

  it('TC15: multi-table proposals render the Overall Quotation Total box matching the PDF when enabled', () => {
    const multiTableProposal: any = {
      proposalNo: 'WT-Q2026-MULTI',
      title: 'Multi-Phase Quotation',
      overallTotal: { show: true },
      blocks: [
        { id: 't1', type: 'table', title: 'Phase 1', items: [{ id: 1, type: 'item', description: 'Phase 1 Work', qty: 1, unitPrice: 1000 }] },
        { id: 't2', type: 'table', title: 'Phase 2', items: [{ id: 2, type: 'item', description: 'Phase 2 Work', qty: 2, unitPrice: 750 }] },
      ],
    };
    const html = buildProposalEmailHtml(multiTableProposal, entity, settings);
    expect(html).toContain('Overall Quotation Total:');
    expect(html).toContain('QAR 2,500.00');
    expect(html).toContain('Amount in Words:');
  });

  it('TC15-B: multi-table proposals do NOT render Overall Quotation Total box by default when not explicitly enabled', () => {
    const multiTableProposal: any = {
      proposalNo: 'WT-Q2026-MULTI-DEFAULT',
      title: 'Multi-Phase Quotation Default',
      blocks: [
        { id: 't1', type: 'table', title: 'Phase 1', items: [{ id: 1, type: 'item', description: 'Phase 1 Work', qty: 1, unitPrice: 1000 }] },
        { id: 't2', type: 'table', title: 'Phase 2', items: [{ id: 2, type: 'item', description: 'Phase 2 Work', qty: 2, unitPrice: 750 }] },
      ],
    };
    const html = buildProposalEmailHtml(multiTableProposal, entity, settings);
    expect(html).not.toContain('Overall Quotation Total:');
  });

  it('TC16: converts colon pseudo-tables in text blocks to tabular column tables in the generated PDF', () => {
    const proposalWithColonTable: any = {
      proposalNo: 'WT-Q2026-TERMS',
      title: 'Quotation With Terms Table',
      blocks: [
        {
          id: 'b1',
          type: 'text',
          title: 'Terms & Conditions',
          content: '<table class="specs-table"><tr><td>Quotation validity</td><td>:</td><td>7 days</td></tr><tr><td>Payment</td><td>:</td><td>100% advance</td></tr></table>',
        },
      ],
    };
    const pdf = buildProposalFullHtml({ proposal: proposalWithColonTable, entity, settings });
    expect(pdf).toContain('quote-grid-table');
    expect(pdf).toContain('>Terms & Conditions</th>');
    expect(pdf).toContain('>Details</th>');
    expect(pdf).toContain('Quotation validity');
    expect(pdf).toContain('7 days');
    expect(pdf).toContain('100% advance');
    // Ensure the table structure has 2 header columns and proper 2-column rows
    const tableChunk = pdf.slice(pdf.indexOf('quote-grid-table'));
    const termsTableHtml = tableChunk.slice(0, tableChunk.indexOf('</table>'));
    expect(termsTableHtml).not.toContain('<td>:</td>');
  });

  it('TC17: converts colon pseudo-tables in text blocks to tabular column tables in the email body HTML', () => {
    const proposalWithColonTable: any = {
      proposalNo: 'WT-Q2026-EMAIL-TERMS',
      title: 'Quotation With Email Terms',
      blocks: [
        {
          id: 'b1',
          type: 'text',
          title: 'Terms & Conditions',
          content: '<table class="specs-table"><tr><td>Quotation validity</td><td>:</td><td>7 days</td></tr><tr><td>Delivery</td><td>:</td><td>Immediate</td></tr></table>',
        },
      ],
    };
    const html = buildProposalEmailHtml(proposalWithColonTable, entity, settings);
    expect(html).toContain('quote-grid-table');
    expect(html).toContain('>Terms & Conditions</th>');
    expect(html).toContain('>Details</th>');
    expect(html).toContain('Quotation validity');
    expect(html).toContain('Immediate');
    // Ensure the table structure has 2 header columns and proper 2-column rows
    const tableChunk = html.slice(html.indexOf('quote-grid-table'));
    const termsTableHtml = tableChunk.slice(0, tableChunk.indexOf('</table>'));
    expect(termsTableHtml).not.toContain('<td>:</td>');
  });
});



describe('buildProposalEmailHtml — grid tables keep the PDF styling', () => {
  it('does not restyle quote-grid tables with the generic grey header/bordered cells', () => {
    const proposal: any = {
      proposalNo: 'WT-Q2026-003',
      title: 'Grid',
      blocks: [
        {
          id: 'g1',
          type: 'text',
          title: 'Terms & Conditions',
          content: '<table><tr><td>Payment</td><td>:</td><td>50% advance</td></tr><tr><td>Delivery</td><td>:</td><td>2 weeks</td></tr></table>',
        },
      ],
    };
    const html = buildProposalEmailHtml(proposal, entity, settings);
    expect(html).toContain('quote-grid-table');
    // brand-coloured header from the shared grid markup…
    expect(html).toMatch(/<th[^>]*background:\s*#?[0-9a-fA-F]{3,6}[^>]*>\s*NO\s*<\/th>/);
    // …and none of the generic restyle that used to override it
    expect(html).not.toContain('padding:8px 12px; background:#f8fafc; border:1px solid #e5e7eb');
    expect(html).not.toContain('__GRID_TABLE_');
  });
});
