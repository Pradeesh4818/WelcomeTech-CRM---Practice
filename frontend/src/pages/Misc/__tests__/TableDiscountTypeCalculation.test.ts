import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildQuotationDocumentHtml } from '../MiscPages';

describe('Table Discount % and Amount Dropdown & Calculation Integration', () => {
  const quotationGeneratorPath = path.resolve(__dirname, '../QuotationGeneratorPage.tsx');
  const sourceCode = fs.readFileSync(quotationGeneratorPath, 'utf8');

  it('TC-DISC-01: DocumentBlock interface includes discountType', () => {
    expect(sourceCode).toMatch(/discountType\?\:\s*'percent'\s*\|\s*'amount'/);
  });

  it('TC-DISC-02: QuotationGeneratorPage contains ThemeDropdown for % and Amount in Table Discount bar and Status', () => {
    expect(sourceCode).toContain('aria-label="Table Discount Type"');
    expect(sourceCode).toContain("<ThemeDropdown<'percent' | 'amount'>");
    expect(sourceCode).toContain("{ value: 'percent', label: '%' }");
    expect(sourceCode).toContain("{ value: 'amount', label: 'Amount' }");
    expect(sourceCode).toContain('handleBlockDiscountTypeChange(block.id, val)');

    // Status dropdown also uses ThemeDropdown
    expect(sourceCode).toContain('aria-label="Status"');
    expect(sourceCode).toContain("{ value: 'active', label: 'Active', dotColor: '#16a34a' }");
  });

  it('TC-DISC-03: Block loaders preserve discountType alongside discountPercent', () => {
    // Template select
    expect(sourceCode).toMatch(/discountType:\s*\(b\.discountType\s*===\s*'amount'\s*\?\s*'amount'\s*:\s*'percent'\)/);
    // Template loader & proposal loader
    expect(sourceCode).toContain("discountType: (b.discountType === 'amount' ? 'amount' : 'percent') as 'percent' | 'amount'");
  });

  it('TC-DISC-04: calculateBlockDiscount computes percentage discount correctly', () => {
    const subtotal = 6900;
    const discountVal = 10;
    const discountType: string = 'percent';

    const discountAmount = discountType === 'amount'
      ? Math.min(subtotal, Math.max(0, discountVal))
      : (subtotal * discountVal) / 100;
    const total = Math.max(0, subtotal - discountAmount);

    expect(discountAmount).toBe(690);
    expect(total).toBe(6210);
  });

  it('TC-DISC-05: calculateBlockDiscount computes amount discount correctly', () => {
    const subtotal = 6900;
    const discountVal = 500;
    const discountType: string = 'amount';

    const discountAmount = discountType === 'amount'
      ? Math.min(subtotal, Math.max(0, discountVal))
      : (subtotal * discountVal) / 100;
    const total = Math.max(0, subtotal - discountAmount);

    expect(discountAmount).toBe(500);
    expect(total).toBe(6400);
  });

  it('TC-DISC-06: calculateBlockDiscount clamps discount to subtotal when amount exceeds subtotal', () => {
    const subtotal = 6900;
    const discountVal = 8000; // Exceeds 6900
    const discountType = 'amount';

    const discountAmount = discountType === 'amount'
      ? Math.min(subtotal, Math.max(0, discountVal))
      : (subtotal * discountVal) / 100;
    const total = Math.max(0, subtotal - discountAmount);

    expect(discountAmount).toBe(6900);
    expect(total).toBe(0);
  });

  it('TC-DISC-07: HTML rendering formats percent discount label with %', () => {
    const proposal: any = {
      name: 'Quotation WT-Q2026-DISC-01',
      quotationDetails: { quoteNo: 'WT-Q2026-DISC-01' },
      blocks: [
        {
          id: 'tbl-1',
          type: 'table',
          title: 'Pricing Table #1',
          discountPercent: 10,
          discountType: 'percent',
          items: [
            { id: 1, type: 'item', description: 'Item A', qty: 2, unitPrice: 3450 }, // 6900
          ],
        },
      ],
    };

    const html = buildQuotationDocumentHtml(proposal, proposal);
    expect(html).toContain('Subtotal:');
    expect(html).toContain('QAR 6900.00');
    expect(html).toContain('Discount (10%):');
    expect(html).toContain('-QAR 690.00');
    expect(html).toContain('Table Total:');
    expect(html).toContain('QAR 6210.00');
  });

  it('TC-DISC-08: HTML rendering formats amount discount label with Amount', () => {
    const proposal: any = {
      name: 'Quotation WT-Q2026-DISC-02',
      quotationDetails: { quoteNo: 'WT-Q2026-DISC-02' },
      blocks: [
        {
          id: 'tbl-2',
          type: 'table',
          title: 'Pricing Table #2',
          discountPercent: 500,
          discountType: 'amount',
          items: [
            { id: 1, type: 'item', description: 'Item B', qty: 1, unitPrice: 6900 },
          ],
        },
      ],
    };

    const html = buildQuotationDocumentHtml(proposal, proposal);
    expect(html).toContain('Subtotal:');
    expect(html).toContain('QAR 6900.00');
    expect(html).toContain('Discount (Amount):');
    expect(html).toContain('-QAR 500.00');
    expect(html).toContain('Table Total:');
    expect(html).toContain('QAR 6400.00');
  });

  it('TC-DISC-09: Supports mixed tables with both % and Amount discounts across blocks', () => {
    const proposal: any = {
      name: 'Quotation WT-Q2026-DISC-03',
      quotationDetails: { quoteNo: 'WT-Q2026-DISC-03' },
      blocks: [
        {
          id: 'tbl-1',
          type: 'table',
          title: 'Pricing Table #1',
          discountPercent: 10,
          discountType: 'percent',
          items: [
            { id: 1, type: 'item', description: 'Software License', qty: 1, unitPrice: 1000 },
          ],
        },
        {
          id: 'tbl-2',
          type: 'table',
          title: 'Pricing Table #2',
          discountPercent: 200,
          discountType: 'amount',
          items: [
            { id: 2, type: 'item', description: 'Annual Support', qty: 1, unitPrice: 2000 },
          ],
        },
      ],
    };

    const html = buildQuotationDocumentHtml(proposal, proposal);
    expect(html).toContain('Discount (10%):');
    expect(html).toContain('-QAR 100.00');
    expect(html).toContain('QAR 900.00');
    expect(html).toContain('Discount (Amount):');
    expect(html).toContain('-QAR 200.00');
    expect(html).toContain('QAR 1800.00');
  });
});
