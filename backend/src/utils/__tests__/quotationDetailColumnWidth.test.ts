import { describe, it, expect } from 'vitest';
import { buildProposalFullHtml, estimateItemHeight } from '../htmlPdfGenerator';
import { buildProposalEmailHtml } from '../../controllers/crmController';

const mockProposal = {
  proposalNo: 'WT-Q20261101',
  quoteDate: '2026-11-01',
  validityPeriod: 10,
  validUntil: '2026-11-11',
  contactName: 'Namachivayam',
  clientEmail: 'namachivayam.welcometech@gmail.com',
  blocks: [
    {
      id: 'table-1',
      type: 'table',
      title: 'Our Solutions & Pricing',
      discountPercent: 0,
      items: [
        {
          id: 'row-1',
          type: 'item',
          no: 1,
          description: 'Tally Prime [Int\'l Edition] – Single user',
          qty: 1,
          unitPrice: 2600,
        },
        {
          id: 'row-2',
          type: 'detail',
          description: 'Accounting and Inventory and Payroll Software, Single User License - 2026 International Silver Edition, Latest Release 7.1',
          qty: 0,
          unitPrice: 0,
        },
        {
          id: 'row-3',
          type: 'detail',
          description: 'Which includes one Year Tally Software Subscription Service valid will be free – Release updating will be free.',
          qty: 0,
          unitPrice: 0,
        },
      ],
    },
  ],
};

const mockEntity = {
  name: 'Welcome Trading Co. W.L.L.',
  legalName: 'Welcome Trading Co. W.L.L.',
  country: 'Qatar',
  currency: 'QAR',
  email: 'admin@welcometech.qa',
  phone: '+97466032346',
};

const mockSettings = {
  brandColor: '#722580',
  defaultValidityDays: 10,
};

describe('Quotation Detail Row - Confined to Description Column', () => {
  describe('PDF Generator (buildProposalFullHtml)', () => {
    it('TC-DET-1: detail rows do NOT span full width using colspan="4"', () => {
      const html = buildProposalFullHtml({
        proposal: mockProposal,
        entity: mockEntity,
        settings: mockSettings,
      });

      // Find the table row for row-2
      const detailRowMatch = html.match(/<tr[^>]*data-row="[^"]*:[12]"[\s\S]*?<\/tr>/g);
      expect(detailRowMatch).not.toBeNull();
      expect(detailRowMatch!.length).toBe(2);

      detailRowMatch!.forEach((rowHtml) => {
        // Must not contain colspan="4" in detail row
        expect(rowHtml).not.toContain('colspan="4"');
        // Must have exactly 5 <td> cells matching: No, Description, Qty, Unit Price, Amount
        const tdMatches = rowHtml.match(/<td[\s\S]*?<\/td>/g) || [];
        expect(tdMatches.length).toBe(5);
        // The second cell (index 1) must contain the detail text
        expect(tdMatches[1]).toMatch(/(2026 International Silver Edition|Which includes one Year Tally)/);
        // The remaining cells (Qty, Unit Price, Amount) must be empty
        expect(tdMatches[2].replace(/<[^>]+>/g, '').trim()).toBe('');
        expect(tdMatches[3].replace(/<[^>]+>/g, '').trim()).toBe('');
        expect(tdMatches[4].replace(/<[^>]+>/g, '').trim()).toBe('');
      });
    });

    it('TC-DET-2: estimateItemHeight for detail rows uses 45 chars per line column wrap', () => {
      const shortDetail = { type: 'detail', description: 'Brief note' };
      const longDetail = {
        type: 'detail',
        description: 'Accounting and Inventory and Payroll Software, Single User License - 2026 International Silver Edition, Latest Release 7.1',
      };

      const shortHeight = estimateItemHeight(shortDetail);
      const longHeight = estimateItemHeight(longDetail);

      // Short note fits in 1 line: 16 + 1 * 17 = 33px
      expect(shortHeight).toBe(33);
      // Long description is ~123 chars -> ceil(123/45) = 3 lines -> 16 + 3 * 17 = 67px
      expect(longHeight).toBe(67);
      expect(longHeight).toBeGreaterThan(shortHeight);
    });
  });

  describe('Email Template Generator (buildProposalEmailHtml)', () => {
    it('TC-DET-3: email template renders detail row in Description column without colspan="4"', () => {
      const emailHtml = buildProposalEmailHtml(mockProposal, mockEntity, mockSettings);

      // Find detail trs by matching rows containing detail descriptions
      const detailRows = (emailHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []).filter((row) =>
        row.includes('2026 International Silver Edition') || row.includes('Which includes one Year Tally')
      );
      expect(detailRows.length).toBe(2);

      detailRows.forEach((row) => {
        expect(row).not.toContain('colspan="4"');
        // Contains separate <td> for each column
        expect(row).toContain('width="6%"');
        expect(row).toContain('width="46%"');
        expect(row).toContain('width="8%"');
        expect(row).toContain('width="17%"');
        expect(row).toContain('width="23%"');
      });
    });
  });
});
