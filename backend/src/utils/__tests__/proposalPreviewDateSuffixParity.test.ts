import { describe, it, expect } from 'vitest';
import { buildProposalNumber, stripDateSuffix } from '../proposalSequence';
import { buildProposalFullHtml } from '../htmlPdfGenerator';

describe('Proposal Preview & Document Specification Date Suffix Parity', () => {
  it('TC-PARITY-01: buildProposalNumber preserves explicit date suffix in proposalNo when sendingDate matches or aligns', () => {
    // When proposalNo has /08-11-2026 and sendingDate is provided as 08 Nov 2026 or 08-11-2026
    const res1 = buildProposalNumber('IT/QT/8113/08-11-2026', true, '08 Nov 2026');
    expect(res1).toBe('IT/QT/8113/08-11-2026');

    const res2 = buildProposalNumber('IT/QT/8113/08-11-2026', true, '08-11-2026');
    expect(res2).toBe('IT/QT/8113/08-11-2026');

    const res3 = buildProposalNumber('IT/QT/8113/08-11-2026', true, null);
    expect(res3).toBe('IT/QT/8113/08-11-2026');
  });

  it('TC-PARITY-02: htmlPdfGenerator preserves saved proposalNo date suffix and keeps Quote Date in parity', () => {
    const mockProposal: any = {
      proposalNo: 'IT/QT/8113/08-11-2026',
      title: 'TallyPrime Quotation (IT/QT/8113/09-11-2026)',
      quoteDate: new Date('2026-11-08T21:00:00.000Z'),
      validUntil: new Date('2026-11-18T21:00:00.000Z'),
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

    const html = buildProposalFullHtml({
      proposal: mockProposal,
      entity: {},
      settings: { proposalIncludeDate: true } as any,
    });

    // Quotation No in Document Specifications MUST match proposalNo
    expect(html).toContain('IT/QT/8113/08-11-2026');
    expect(html).toContain('<span class="meta-label">Quotation No</span>');
    expect(html).toContain('IT/QT/8113/08-11-2026</span>');

    // Quote Date MUST be 08 Nov 2026 matching the 08-11-2026 suffix
    expect(html).toContain('<span class="meta-label">Quote Date</span>');
    expect(html).toContain('08 Nov 2026</span>');
  });
});
