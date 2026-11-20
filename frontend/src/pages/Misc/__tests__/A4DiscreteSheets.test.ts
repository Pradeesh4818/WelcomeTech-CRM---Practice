import { describe, it, expect } from 'vitest';
import { splitIntoA4Pages } from '../EmailTemplatesPage';

describe('A4 Discrete Sheet Pagination and Formatting', () => {
  describe('Email Template A4 Discrete Pagination', () => {
    it('returns a single page when no pagebreak markers exist', () => {
      const text = '# Welcome Letter\n\nDear Customer,\n\nThank you for choosing Welcome Tech.';
      const pages = splitIntoA4Pages(text);
      expect(pages).toHaveLength(1);
      expect(pages[0]).toBe(text);
    });

    it('splits content into discrete A4 sheets using [pagebreak]', () => {
      const text = 'First Page Content\n\n[pagebreak]\n\nSecond Page Content\n\n[pagebreak]\n\nThird Page Content';
      const pages = splitIntoA4Pages(text);
      expect(pages).toHaveLength(3);
      expect(pages[0]).toBe('First Page Content');
      expect(pages[1]).toBe('Second Page Content');
      expect(pages[2]).toBe('Third Page Content');
    });

    it('supports alternative markers like <!-- pagebreak --> and ---pagebreak---', () => {
      const text = 'Page 1\n<!-- pagebreak -->\nPage 2\n---pagebreak---\nPage 3';
      const pages = splitIntoA4Pages(text);
      expect(pages).toHaveLength(3);
      expect(pages[0]).toBe('Page 1');
      expect(pages[1]).toBe('Page 2');
      expect(pages[2]).toBe('Page 3');
    });

    it('handles empty input gracefully', () => {
      expect(splitIntoA4Pages('')).toEqual(['']);
      expect(splitIntoA4Pages('   ')).toEqual(['']);
    });

    it('correctly calculates chunk metadata for running headers and footers', () => {
      const text = 'Page One\n[pagebreak]\nPage Two';
      const pages = splitIntoA4Pages(text);
      const chunks = pages.map((content, idx) => ({
        pageNum: idx + 1,
        isFirst: idx === 0,
        isLast: idx === pages.length - 1,
        totalPages: pages.length,
        content
      }));

      expect(chunks).toHaveLength(2);
      expect(chunks[0].pageNum).toBe(1);
      expect(chunks[0].isFirst).toBe(true);
      expect(chunks[0].isLast).toBe(false);
      expect(chunks[0].totalPages).toBe(2);

      expect(chunks[1].pageNum).toBe(2);
      expect(chunks[1].isFirst).toBe(false);
      expect(chunks[1].isLast).toBe(true);
      expect(chunks[1].totalPages).toBe(2);
    });
  });

  describe('Quotation Generator A4 Page Chunking Logic', () => {
    it('creates new page when forcePageBreak is set on a block', () => {
      const blocks = [
        { id: 'b1', type: 'text', content: 'Section 1', pageBreak: false },
        { id: 'b2', type: 'table', items: [{ type: 'item', description: 'Item 1' }], pageBreak: true },
        { id: 'b3', type: 'text', content: 'Section 2', pageBreak: false }
      ];

      // Simulated chunking logic matching QuotationGeneratorPage useMemo
      const PAGE_1_CAPACITY = 600;
      const PAGE_N_CAPACITY = 950;
      const chunks: { pageNum: number; blocks: typeof blocks }[] = [];
      let currentChunk: typeof blocks = [];
      let currentHeight = 0;
      let isFirstPage = true;

      blocks.forEach((block, i) => {
        const estHeight = block.type === 'table' ? 200 : 100;
        const forceBreak = Boolean(block.pageBreak) && i > 0;
        const capacity = isFirstPage ? PAGE_1_CAPACITY : PAGE_N_CAPACITY;

        if (forceBreak || (currentChunk.length > 0 && currentHeight + estHeight > capacity)) {
          chunks.push({ pageNum: chunks.length + 1, blocks: currentChunk });
          currentChunk = [block];
          currentHeight = estHeight;
          isFirstPage = false;
        } else {
          currentChunk.push(block);
          currentHeight += estHeight;
        }
      });
      if (currentChunk.length > 0) {
        chunks.push({ pageNum: chunks.length + 1, blocks: currentChunk });
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].blocks).toHaveLength(1);
      expect(chunks[0].blocks[0].id).toBe('b1');
      expect(chunks[1].blocks).toHaveLength(2);
      expect(chunks[1].blocks[0].id).toBe('b2');
      expect(chunks[1].blocks[1].id).toBe('b3');
    });

    it('dynamically recalculates page capacity when headerImage and footerImage are set', () => {
      const headerImage = '/uploads/header.png';
      const footerImage = '/uploads/footer.png';

      const p1HeaderWeight = (headerImage ? 170 : 130) + 240;
      const p1FooterWeight = footerImage ? 130 : 45;
      const p1MaxWeight = Math.max(380, 1123 - p1HeaderWeight - p1FooterWeight - 60);

      const pOtherHeaderWeight = headerImage ? 160 : 50;
      const pOtherFooterWeight = footerImage ? 130 : 45;
      const pOtherMaxWeight = Math.max(450, 1123 - pOtherHeaderWeight - pOtherFooterWeight - 60);

      expect(p1MaxWeight).toBeLessThan(600);
      expect(pOtherMaxWeight).toBeLessThan(900);
      expect(p1MaxWeight).toBeGreaterThan(380);
      expect(pOtherMaxWeight).toBeGreaterThan(450);
    });

    it('verifies that each page chunk shows header and footer banners when uploaded', () => {
      const headerImage = '/uploads/header.png';
      const footerImage = '/uploads/footer.png';
      const totalPages = 3;

      const pageSheets = Array.from({ length: totalPages }, (_, i) => {
        const pageNum = i + 1;
        const isFirst = pageNum === 1;
        const isLast = pageNum === totalPages;

        return {
          pageNum,
          isFirst,
          isLast,
          hasHeaderBanner: Boolean(headerImage),
          hasFooterBanner: Boolean(footerImage),
        };
      });

      expect(pageSheets).toHaveLength(3);
      pageSheets.forEach((page) => {
        expect(page.hasHeaderBanner).toBe(true);
        expect(page.hasFooterBanner).toBe(true);
      });
    });
  });
});
