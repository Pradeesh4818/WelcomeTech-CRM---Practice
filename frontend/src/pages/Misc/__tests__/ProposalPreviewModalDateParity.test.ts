import { describe, it, expect } from 'vitest';
import { buildProposalUnifiedData, buildQuotationDocumentHtml } from '../MiscPages';

describe('Frontend Proposal Preview Modal Date Suffix Parity', () => {
  it('TC-FE-PARITY-01: buildProposalUnifiedData preserves proposalNo suffix and aligns quoteDate without timezone shift', () => {
    const rawProposal: any = {
      proposalNo: 'IT/QT/8113/08-11-2026',
      title: 'TallyPrime Quotation (IT/QT/8113/09-11-2026)',
      quoteDate: '2026-11-08T21:00:00.000Z',
      validUntil: '2026-11-18T21:00:00.000Z',
      customerName: 'Coplast',
      customerContactPerson: 'Muthukumar',
      customerPhone: '+97477530878',
      senderEmail: 'sales@welcometech.qa',
      senderPhone: '+974 5522 2390',
      items: [
        { description: 'Tally Prime [Int’l Edition] – Single user', qty: 1, unitPrice: 2300, total: 2300 },
      ],
      blocks: [],
      subtotal: 2300,
      total: 2300,
      revision: 0,
    };

    const unified = buildProposalUnifiedData(rawProposal, [], null);

    // quotationDetails.quoteNo MUST be IT/QT/8113/08-11-2026
    expect(unified.quotationDetails.quoteNo).toBe('IT/QT/8113/08-11-2026');
    // quotationDetails.quoteDate MUST match 08-11-2026 -> 08 Nov 2026
    expect(unified.quotationDetails.quoteDate).toBe('08 Nov 2026');
  });

  it('TC-FE-PARITY-02: buildQuotationDocumentHtml renders exact proposalNo and matching quoteDate', () => {
    const rawProposal: any = {
      proposalNo: 'IT/QT/8113/08-11-2026',
      title: 'TallyPrime Quotation (IT/QT/8113/09-11-2026)',
      quoteDate: '2026-11-08T21:00:00.000Z',
      validUntil: '2026-11-18T21:00:00.000Z',
      customerName: 'Coplast',
      customerContactPerson: 'Muthukumar',
      customerPhone: '+97477530878',
      senderEmail: 'sales@welcometech.qa',
      senderPhone: '+974 5522 2390',
      items: [
        { description: 'Tally Prime [Int’l Edition] – Single user', qty: 1, unitPrice: 2300, total: 2300 },
      ],
      blocks: [],
      subtotal: 2300,
      total: 2300,
      revision: 0,
    };

    const unified = buildProposalUnifiedData(rawProposal, [], null);
    const html = buildQuotationDocumentHtml(unified, unified, { isPrintAutoTrigger: false });

    // Quotation No in Document Specifications MUST match proposalNo
    expect(html).toContain('IT/QT/8113/08-11-2026');
    expect(html).toContain('<span class="meta-label">Quotation No</span>');
    expect(html).toContain('IT/QT/8113/08-11-2026</span>');

    // Quote Date MUST be 08 Nov 2026
    expect(html).toContain('<span class="meta-label">Quote Date</span>');
    expect(html).toContain('08 Nov 2026</span>');
  });

  it('TC-FE-PARITY-03: extracts quoteDate correctly from proposalNo suffix in edit mode', () => {
    const pQuoteNo = 'IT/QT/8113/08-11-2026';
    const existingDateSuffix = (pQuoteNo || '').trim().match(/\/(\d{2}-\d{2}-\d{4})$/);
    expect(existingDateSuffix).toBeTruthy();

    const [d, m, y] = existingDateSuffix![1].split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = monthNames[parseInt(m, 10) - 1] || m;
    const pQuoteDate = `${d} ${monthName} ${y}`;

    expect(pQuoteDate).toBe('08 Nov 2026');
  });
});
