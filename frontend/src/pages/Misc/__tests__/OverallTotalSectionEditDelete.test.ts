import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildQuotationDocumentHtml } from '../MiscPages';
import { toLayoutMetrics, OVERALL_TOTAL_RESERVE } from '../../../utils/quotationLayout';

describe('Overall Quotation Total Section Edit & Delete Features', () => {
  const quotationGeneratorPath = path.resolve(__dirname, '../QuotationGeneratorPage.tsx');
  const sourceCode = fs.readFileSync(quotationGeneratorPath, 'utf8');

  it('TC-OT-01: QuotationGeneratorPage defines OverallTotalConfig interface and state', () => {
    expect(sourceCode).toContain('export interface OverallTotalConfig');
    expect(sourceCode).toMatch(/show\?\:\s*boolean/);
    expect(sourceCode).toMatch(/label\?\:\s*string/);
    expect(sourceCode).toMatch(/notes\?\:\s*string/);
    expect(sourceCode).toMatch(/showWords\?\:\s*boolean/);
    expect(sourceCode).toContain('const [overallTotalConfig, setOverallTotalConfig] = useState<OverallTotalConfig>');
  });

  it('TC-OT-02: QuotationGeneratorPage contains Delete and Edit controls for Overall Total section', () => {
    // Delete handler and button
    expect(sourceCode).toContain('handleDeleteOverallTotal');
    expect(sourceCode).toContain('title="Delete Overall Total Section"');

    // Edit button and drawer
    expect(sourceCode).toContain('setIsEditingOverallTotal');
    expect(sourceCode).toContain('Edit Section');
    expect(sourceCode).toContain('Custom Summary Title / Label:');
    expect(sourceCode).toContain('Summary Notes / Payment Schedule / Terms');
    expect(sourceCode).toContain('Show "Amount in Words"');
  });

  it('TC-OT-03: QuotationGeneratorPage provides + Overall Total button in inserter when hidden', () => {
    expect(sourceCode).toContain('!isOverallTotalVisible &&');
    expect(sourceCode).toContain('<span>+ Overall Total</span>');
    expect(sourceCode).toContain('handleAddOverallTotal');
  });

  it('TC-OT-04: Specifications card contains Overall Total status toggle (Visible/Hidden, Add/Delete)', () => {
    expect(sourceCode).toContain('Overall Total:');
    expect(sourceCode).toContain('{isOverallTotalVisible ? \'Visible\' : \'Hidden\'}');
    expect(sourceCode).toContain('{isOverallTotalVisible ? \'Delete\' : \'Add\'}');
  });

  it('TC-OT-05: toLayoutMetrics respects showOverallTotal setting (0 reserve when hidden/deleted or undefined by default)', () => {
    // When hidden/deleted, reserve is 0 even with 3 tables
    const metricsHidden = toLayoutMetrics({}, 3, false);
    expect(metricsHidden?.reserveLast).toBe(0);

    // When visible (show: true), reserve is 112
    const metricsVisible = toLayoutMetrics({}, 3, true);
    expect(metricsVisible?.reserveLast).toBe(OVERALL_TOTAL_RESERVE);

    // Default fallback when undefined: hidden by default (reserve is 0)
    const metricsDefaultMulti = toLayoutMetrics({}, 2, undefined);
    expect(metricsDefaultMulti?.reserveLast).toBe(0);

    const metricsDefaultSingle = toLayoutMetrics({}, 1, undefined);
    expect(metricsDefaultSingle?.reserveLast).toBe(0);
  });

  it('TC-OT-06: HTML rendering hides Overall Total box when deleted/hidden (show: false)', () => {
    const proposal: any = {
      name: 'Quotation WT-Q2026-OT-01',
      quotationDetails: { quoteNo: 'WT-Q2026-OT-01' },
      overallTotal: { show: false },
      blocks: [
        {
          id: 'tbl-1',
          type: 'table',
          title: 'Pricing Table #1',
          items: [{ id: 1, type: 'item', description: 'Item A', qty: 1, unitPrice: 5000 }],
        },
        {
          id: 'tbl-2',
          type: 'table',
          title: 'Pricing Table #2',
          items: [{ id: 2, type: 'item', description: 'Item B', qty: 1, unitPrice: 3000 }],
        },
      ],
    };

    const html = buildQuotationDocumentHtml(proposal, proposal);
    expect(html).not.toContain('Overall Quotation Total:');
  });

  it('TC-OT-07: HTML rendering applies custom title, notes, and toggles words when edited', () => {
    const proposal: any = {
      name: 'Quotation WT-Q2026-OT-02',
      quotationDetails: { quoteNo: 'WT-Q2026-OT-02' },
      overallTotal: {
        show: true,
        label: 'Grand Total Project Investment:',
        notes: 'Payment terms: 50% advance, 50% on completion.\nPrice valid for 30 days.',
        showWords: false,
      },
      blocks: [
        {
          id: 'tbl-1',
          type: 'table',
          title: 'Pricing Table #1',
          items: [{ id: 1, type: 'item', description: 'Software License', qty: 1, unitPrice: 10000 }],
        },
      ],
    };

    const html = buildQuotationDocumentHtml(proposal, proposal);
    // Custom label rendered
    expect(html).toContain('Grand Total Project Investment:');
    expect(html).toContain('QAR 10000.00');

    // Custom notes on the left rendered
    expect(html).toContain('Payment terms: 50% advance, 50% on completion.');
    expect(html).toContain('Price valid for 30 days.');

    // Amount in words within the Overall Total section is omitted when showWords is false
    expect(html).not.toMatch(/Grand Total Project Investment:[\s\S]*?Amount in Words:/);

    // If showWords is enabled, it appears in the overall total box
    const proposalWithWords: any = {
      ...proposal,
      overallTotal: {
        ...proposal.overallTotal,
        showWords: true,
      },
    };
    const htmlWithWords = buildQuotationDocumentHtml(proposalWithWords, proposalWithWords);
    expect(htmlWithWords).toMatch(/Grand Total Project Investment:[\s\S]*?Amount in Words:/);
  });

  it('TC-OT-08: HTML rendering does NOT display Overall Quotation Total box by default on multi-table proposals', () => {
    const proposalWithoutOverallTotal: any = {
      name: 'Quotation WT-Q2026-MULTI-DEFAULT',
      quotationDetails: { quoteNo: 'WT-Q2026-MULTI-DEFAULT' },
      blocks: [
        {
          id: 'tbl-1',
          type: 'table',
          title: 'Pricing Table #1',
          items: [{ id: 1, type: 'item', description: 'Item 1', qty: 1, unitPrice: 2000 }],
        },
        {
          id: 'tbl-2',
          type: 'table',
          title: 'Pricing Table #2',
          items: [{ id: 2, type: 'item', description: 'Item 2', qty: 1, unitPrice: 3000 }],
        },
      ],
    };

    const html = buildQuotationDocumentHtml(proposalWithoutOverallTotal, proposalWithoutOverallTotal);
    expect(html).not.toContain('Overall Quotation Total:');
  });
});
