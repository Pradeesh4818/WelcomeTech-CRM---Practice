import { describe, it, expect } from 'vitest';
import { computeProposalTotals } from '../controllerHelpers';
import { buildProposalFullHtml } from '../htmlPdfGenerator';

describe('Server-Side Table Discount % and Amount Dropdown & Calculation', () => {
  const entity = {
    name: 'Welcome Trading Co. W.L.L',
    email: 'info@welcometech.qa',
    phone: '+974 4411 2233',
    address: 'Doha, Qatar',
    commercialRegistration: 'CR-12345',
  };

  const settings = {
    country: 'QA',
    currency: 'QAR',
  };

  it('TC-BE-DISC-01: computeProposalTotals calculates percentage discount from blocks', () => {
    const blocks = [
      {
        id: 'block-1',
        type: 'table',
        discountPercent: 10,
        discountType: 'percent',
        items: [
          { type: 'item', description: 'License Package', qty: 2, unitPrice: 3450 }, // 6900
        ],
      },
    ];

    const result = computeProposalTotals([], 0, blocks);
    expect(result.subtotal).toBe(6900);
    expect(result.discount).toBe(10);
    expect(result.total).toBe(6210);
  });

  it('TC-BE-DISC-02: computeProposalTotals calculates fixed amount discount from blocks', () => {
    const blocks = [
      {
        id: 'block-1',
        type: 'table',
        discountPercent: 500,
        discountType: 'amount',
        items: [
          { type: 'item', description: 'License Package', qty: 2, unitPrice: 3450 }, // 6900
        ],
      },
    ];

    const result = computeProposalTotals([], 0, blocks);
    expect(result.subtotal).toBe(6900);
    // Effective discount percent = (500 / 6900) * 100 = 7.25%
    expect(result.discount).toBe(7.25);
    expect(result.total).toBe(6400);
  });

  it('TC-BE-DISC-03: computeProposalTotals clamps discount amount to subtotal when it exceeds subtotal', () => {
    const blocks = [
      {
        id: 'block-1',
        type: 'table',
        discountPercent: 8000,
        discountType: 'amount',
        items: [
          { type: 'item', description: 'Small Package', qty: 1, unitPrice: 500 },
        ],
      },
    ];

    const result = computeProposalTotals([], 0, blocks);
    expect(result.subtotal).toBe(500);
    expect(result.discount).toBe(100);
    expect(result.total).toBe(0);
  });

  it('TC-BE-DISC-04: computeProposalTotals correctly aggregates multiple tables with mixed % and Amount discounts', () => {
    const blocks = [
      {
        id: 'block-1',
        type: 'table',
        discountPercent: 10, // 10% on 1000 = 100 discount -> total 900
        discountType: 'percent',
        items: [
          { type: 'item', description: 'Table 1 Item', qty: 1, unitPrice: 1000 },
        ],
      },
      {
        id: 'block-2',
        type: 'table',
        discountPercent: 300, // 300 flat on 2000 = 300 discount -> total 1700
        discountType: 'amount',
        items: [
          { type: 'item', description: 'Table 2 Item', qty: 1, unitPrice: 2000 },
        ],
      },
    ];

    const result = computeProposalTotals([], 0, blocks);
    expect(result.subtotal).toBe(3000);
    // Total discount = 400. Effective discount = (400 / 3000) * 100 = 13.33%
    expect(result.discount).toBe(13.33);
    expect(result.total).toBe(2600);
  });

  it('TC-BE-DISC-05: buildProposalFullHtml generates proper HTML for Amount discount in table footer', () => {
    const proposal: any = {
      proposalNo: 'WT-Q2026-DISC-PDF-01',
      title: 'Discount Amount Verification',
      discount: 7.25,
      blocks: [
        {
          id: 'b1',
          type: 'table',
          title: 'Pricing Table #1',
          discountPercent: 500,
          discountType: 'amount',
          items: [
            { id: 1, type: 'item', description: 'Tally Multi-User Implementation', qty: 1, unitPrice: 6900 },
          ],
        },
      ],
    };

    const html = buildProposalFullHtml({ proposal, entity, settings });
    expect(html).toContain('Subtotal:');
    expect(html).toContain('QAR 6,900.00');
    expect(html).toContain('Discount (Amount):');
    expect(html).toContain('-QAR 500.00');
    expect(html).toContain('Table Total:');
    expect(html).toContain('QAR 6,400.00');
    expect(html).toContain('Amount in Words:');
  });

  it('TC-BE-DISC-06: buildProposalFullHtml generates proper HTML for Percent discount in table footer', () => {
    const proposal: any = {
      proposalNo: 'WT-Q2026-DISC-PDF-02',
      title: 'Discount Percent Verification',
      discount: 10,
      blocks: [
        {
          id: 'b1',
          type: 'table',
          title: 'Pricing Table #1',
          discountPercent: 10,
          discountType: 'percent',
          items: [
            { id: 1, type: 'item', description: 'Tally Multi-User Implementation', qty: 1, unitPrice: 6900 },
          ],
        },
      ],
    };

    const html = buildProposalFullHtml({ proposal, entity, settings });
    expect(html).toContain('Subtotal:');
    expect(html).toContain('QAR 6,900.00');
    expect(html).toContain('Discount (10%):');
    expect(html).toContain('-QAR 690.00');
    expect(html).toContain('Table Total:');
    expect(html).toContain('QAR 6,210.00');
  });
});
