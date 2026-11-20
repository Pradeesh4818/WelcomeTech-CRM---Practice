import { describe, it, expect } from 'vitest';
import { chunkDocumentBlocksForA4Pages, normalizeColonTableToTabular, buildProposalFullHtml } from '../htmlPdfGenerator';

const p = (t: string) => `<p>${t}</p>`;
const filler = (n: number) => Array.from({ length: n }, (_, i) => p(`Line ${i} ${'lorem ipsum '.repeat(10)}`)).join('');
const colon = (rows: number) =>
  '<table>' + Array.from({ length: rows }, (_, i) => `<tr><td>Item ${i + 1}</td><td>:</td><td>Detail ${i + 1} ${'text '.repeat(6)}</td></tr>`).join('') + '</table>';
const grid = (rows: number) => normalizeColonTableToTabular(colon(rows), '#722580');
const OPTS = { hasHeaderImage: true, hasFooterImage: true, honorPageBreaks: false } as const;
const pagesWithGrid = (chunks: ReturnType<typeof chunkDocumentBlocksForA4Pages>) =>
  chunks.filter((c) => c.slices.some((s) => /quote-grid-table/.test(s.contentSlice || ''))).map((c) => c.pageNum);

describe('PDF / email: tabular columns stay on a single page', () => {
  it('BE-TC1: a grid table that fits on a page is never split, at any fill level of the page above it', () => {
    for (let n = 6; n <= 24; n++) {
      const chunks = chunkDocumentBlocksForA4Pages([{ id: 'a', type: 'text', title: 'Specs', content: filler(n) + grid(6) }], OPTS);
      expect(pagesWithGrid(chunks).length, `intro paragraphs = ${n}`).toBe(1);
      const slice = chunks.flatMap((c) => c.slices).find((s) => /quote-grid-table/.test(s.contentSlice || ''))!;
      expect((slice.contentSlice!.match(/<thead/g) || []).length).toBe(1);
      expect((slice.contentSlice!.match(/<tr/g) || []).length).toBe(7);
    }
  });

  it('BE-TC2: the lead-in line ending with ":" moves together with its table', () => {
    const lead = p('The hardware requirements and operating system required are as described below:');
    for (let n = 8; n <= 22; n++) {
      const chunks = chunkDocumentBlocksForA4Pages([{ id: 'a', type: 'text', title: '', content: filler(n) + lead + grid(5) }], OPTS);
      const leadPage = chunks.find((c) => c.slices.some((s) => (s.contentSlice || '').includes('as described below:')))!.pageNum;
      expect(pagesWithGrid(chunks)).toEqual([leadPage]);
    }
  });

  it('BE-TC3: measured heights (what the PDF/email pipeline uses) keep the table whole as well', () => {
    for (let n = 4; n <= 14; n++) {
      const metrics = {
        availFirst: 600,
        availOther: 800,
        gridOverhead: 50,
        unitHeight: (u: string) => (u.match(/<p>/g) || []).length * 70 + (/quote-grid-table/.test(u) ? Math.max(0, (u.match(/<tr/g) || []).length - 1) * 40 : 0),
      };
      const chunks = chunkDocumentBlocksForA4Pages([{ id: 'a', type: 'text', title: '', content: filler(n) + grid(5) }], { ...OPTS, metrics });
      expect(pagesWithGrid(chunks).length, `intro paragraphs = ${n}`).toBe(1);
    }
  });

  it('BE-TC4: a table taller than a whole page is the only one allowed to continue on the next page', () => {
    const chunks = chunkDocumentBlocksForA4Pages([{ id: 'a', type: 'text', title: 'Big', content: grid(60) }], OPTS);
    expect(pagesWithGrid(chunks).length).toBeGreaterThan(1);
  });

  it('BE-TC5: in the rendered PDF HTML every grid table starts at row 1 (none is a continuation)', () => {
    for (let n = 6; n <= 20; n += 2) {
      const html = buildProposalFullHtml({
        proposal: { proposalNo: 'X', blocks: [{ id: 'a', type: 'text', title: 'Terms', content: filler(n) + colon(5) }] },
        entity: { name: 'Acme' },
        settings: { brandColor: '#722580' },
      } as any);
      const tables = html.match(/<table class="quote-grid-table"[\s\S]*?<\/table>/g) || [];
      expect(tables.length, `intro paragraphs = ${n}`).toBe(1);
      expect(tables[0] as string).toMatch(/<tbody>\s*<tr[^>]*>\s*<td[^>]*>1<\/td>/);
      expect(((tables[0] as string).match(/<tr/g) || []).length).toBe(6);
    }
  });

  it('BE-TC6: legacy specs-table markup in a saved proposal is upgraded and kept whole in the PDF HTML', () => {
    const specs = '<table class="specs-table" data-type="specs">' + Array.from({ length: 5 }, (_, i) => `<tr><td>Processor ${i + 1}</td><td>:</td><td>Spec ${i + 1}</td></tr>`).join('') + '</table>';
    for (let n = 6; n <= 22; n += 2) {
      const html = buildProposalFullHtml({
        proposal: { proposalNo: 'X', blocks: [{ id: 'a', type: 'text', title: 'Specs', content: filler(n) + specs }] },
        entity: { name: 'Acme' },
        settings: { brandColor: '#722580' },
      } as any);
      const tables = html.match(/<table class="quote-grid-table"[\s\S]*?<\/table>/g) || [];
      expect(tables.length, `intro paragraphs = ${n}`).toBe(1);
      expect((tables[0] as string).match(/<tr/g)!.length).toBe(6);
    }
  });
});
