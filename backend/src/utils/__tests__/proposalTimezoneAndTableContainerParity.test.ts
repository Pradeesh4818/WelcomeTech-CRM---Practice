import { describe, it, expect } from 'vitest';
import { formatProposalSendingDate, buildProposalNumber, stripDateSuffix } from '../proposalSequence';
import { chunkDocumentBlocksForA4Pages } from '../htmlPdfGenerator';

describe('Proposal Timezone and Table Container Parity Tests', () => {
  describe('Proposal Date & Timezone Formatting', () => {
    it('formats undefined/null date using current date in Asia/Qatar timezone', () => {
      const qatarNow = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Qatar', day: '2-digit', month: '2-digit', year: 'numeric' })
        .format(new Date())
        .replace(/\//g, '-');
      expect(formatProposalSendingDate()).toBe(qatarNow);
      expect(formatProposalSendingDate(null)).toBe(qatarNow);
    });

    it('formats date string YYYY-MM-DD directly without UTC shift', () => {
      expect(formatProposalSendingDate('2026-11-05')).toBe('05-11-2026');
    });

    it('formats date string DD-MM-YYYY directly', () => {
      expect(formatProposalSendingDate('05-11-2026')).toBe('05-11-2026');
    });

    it('formats UTC ISO timestamp matching local Qatar time (e.g. 21:00 UTC = 00:00 Qatar)', () => {
      // 2026-11-04 21:00 UTC is 2026-11-05 00:00 in Qatar
      expect(formatProposalSendingDate('2026-11-04T21:00:00.000Z')).toBe('05-11-2026');
    });

    it('formats noon ISO timestamp without date rollback across all timezones', () => {
      expect(formatProposalSendingDate('2026-11-09T12:00:00.000Z')).toBe('09-11-2026');
      expect(formatProposalSendingDate('09 Nov 2026')).toBe('09-11-2026');
    });

    it('buildProposalNumber preserves client-confirmed date suffix in serialNo', () => {
      expect(buildProposalNumber('IT/QT/8109/05-11-2026', true)).toBe('IT/QT/8109/05-11-2026');
      expect(buildProposalNumber('IT/QT/8108/05-11-2026', true)).toBe('IT/QT/8108/05-11-2026');
    });

    it('buildProposalNumber strips date suffix when includeDate is false', () => {
      expect(buildProposalNumber('IT/QT/8109/05-11-2026', false)).toBe('IT/QT/8109');
    });
  });

  describe('Proposal Table Container Page Break Parity', () => {
    it('does not split a table that fits on a single page when starting it on the next page keeps it complete', () => {
      // Create a scenario where previous text occupies ~325px on page 2, leaving ~475px out of 800px.
      // Table has 8 items requiring 506px.
      // With threshold 0.65, roomLeft (475px) is <= 800 * 0.65 (520px), so it moves to page 3 intact!
      const items = [
        { id: '1', type: 'item', description: 'Tally Prime Multi User', qty: 1, unitPrice: 6900 },
        { id: '2', type: 'detail', description: 'License features', qty: 0, unitPrice: 0 },
        { id: '3', type: 'detail', description: 'LAN connection', qty: 0, unitPrice: 0 },
        { id: '4', type: 'detail', description: 'TSS free release', qty: 0, unitPrice: 0 },
        { id: '5', type: 'item', description: 'Installation & Implementation', qty: 1, unitPrice: 0 },
        { id: '6', type: 'item', description: 'Company Creation', qty: 1, unitPrice: 0 },
        { id: '7', type: 'item', description: 'Admin & User Creation', qty: 1, unitPrice: 0 },
        { id: '8', type: 'item', description: 'Registration & Activation', qty: 1, unitPrice: 0 },
      ];

      const blocks = [
        { id: 'b0', type: 'text', title: 'Intro', content: '<p>Paragraph 1</p>' },
        { id: 'b1', type: 'table', title: 'Pricing Table #2', items },
      ];

      // Simulate metrics where page 2 has 325px used by prior text
      const metrics = {
        availFirst: 628,
        availOther: 800,
        tableHead: 32,
        tailEnd: 96,
        itemHeights: {
          '1:0': 31, '1:1': 72, '1:2': 27, '1:3': 57,
          '1:4': 44, '1:5': 44, '1:6': 44, '1:7': 59,
        },
      };

      const chunks = chunkDocumentBlocksForA4Pages(blocks, {
        hasHeaderImage: true,
        hasFooterImage: true,
        honorPageBreaks: false,
        metrics: {
          availFirst: 628,
          availOther: 800,
          tableHead: 32,
          tailEnd: 96,
          itemHeight: (_it, bi, ii) => (metrics.itemHeights as any)[`${bi}:${ii}`],
        },
      });

      // The table block b1 should be kept on a single page, not split into 2 slices
      const b1Slices = chunks.flatMap(c => c.slices.filter(s => s.block.id === 'b1'));
      expect(b1Slices.length).toBe(1);
      expect(b1Slices[0].itemsSlice?.length).toBe(8);
      expect(b1Slices[0].isTableEnd).toBe(true);
    });
  });
});

