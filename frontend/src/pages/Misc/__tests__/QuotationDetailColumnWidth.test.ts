import { describe, it, expect } from 'vitest';
import { buildQuotationDocumentHtml } from '../MiscPages';
import { estimateItemHeight } from '../../../utils/quotationHelpers';

describe('Quotation Detail Row - Column Width & Rendering Parity', () => {
  const proposalWithDetails = {
    proposalNo: 'WT-Q20261102',
    quoteDate: '2026-11-02',
    validityPeriod: 10,
    validUntil: '2026-11-12',
    companyName: 'Namachivayam Welcometech',
    contactName: 'Namachivayam',
    clientEmail: 'namachivayam.welcometech@gmail.com',
    blocks: [
      {
        id: 'block_table',
        type: 'table',
        title: 'Our Core Solutions',
        items: [
          {
            id: 1,
            no: 1,
            type: 'item',
            description: 'Tally Prime [Int\'l Edition] – Single user',
            qty: 1,
            unitPrice: 2600,
          },
          {
            id: 2,
            type: 'detail',
            description: 'Accounting and Inventory and Payroll Software, Single User License - 2026 International Silver Edition, Latest Release 7.1',
          },
          {
            id: 3,
            type: 'detail',
            description: 'Which includes one Year Tally Software Subscription Service valid will be free – Release updating will be free.',
          },
          {
            id: 4,
            no: 2,
            type: 'item',
            description: 'Installation & Implementation configuration on Tally Prime Single user software',
            qty: 1,
            unitPrice: 0,
          },
        ],
      },
    ],
  };

  it('TC-FE-DET-01: buildQuotationDocumentHtml renders detail rows confined to Description column without colspan="4"', () => {
    const html = buildQuotationDocumentHtml(proposalWithDetails, proposalWithDetails);

    // Should find the detail rows in the table
    const detailRowMatches = html.match(/<tr[^>]*style="[^"]*background:#f8fafc[^"]*"[\s\S]*?<\/tr>/g) || [];
    expect(detailRowMatches.length).toBeGreaterThanOrEqual(2);

    detailRowMatches.forEach((row) => {
      // Must not span full width with colspan="4"
      expect(row).not.toContain('colspan="4"');
      // Must have exactly 5 columns matching No, Description, Qty, Unit Price, Amount
      const cells = row.match(/<td[\s\S]*?<\/td>/g) || [];
      expect(cells.length).toBe(5);
      // The second cell (index 1) contains the detail description text
      expect(cells[1] || '').toMatch(/(Accounting and Inventory|Tally Software Subscription)/);
      // Other cells (Qty, Price, Amount) are empty spacer cells
      expect((cells[0] || '').replace(/<[^>]+>/g, '').trim()).toBe('');
      expect((cells[2] || '').replace(/<[^>]+>/g, '').trim()).toBe('');
      expect((cells[3] || '').replace(/<[^>]+>/g, '').trim()).toBe('');
      expect((cells[4] || '').replace(/<[^>]+>/g, '').trim()).toBe('');
    });
  });

  it('TC-FE-DET-02: estimateItemHeight calculates wrapping lines based on 45 characters per line', () => {
    const shortDetail = { type: 'detail', description: 'Brief configuration note' };
    const longDetail = {
      type: 'detail',
      description: 'Accounting and Inventory and Payroll Software, Single User License - 2026 International Silver Edition, Latest Release 7.1',
    };

    const shortHeight = estimateItemHeight(shortDetail);
    const longHeight = estimateItemHeight(longDetail);

    // 24 chars fits on 1 line: 16 + 1 * 17 = 33px
    expect(shortHeight).toBe(33);
    // 123 chars wraps to 3 lines: 16 + 3 * 17 = 67px
    expect(longHeight).toBe(67);
  });
});
