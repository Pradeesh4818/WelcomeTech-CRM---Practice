import { describe, it, expect } from 'vitest';
import {
  chunkDocumentBlocksForA4Pages,
  normalizeColonTableToTabular,
  removePageFromBlocks,
} from '../quotationHelpers';

const p = (t: string) => `<p>${t}</p>`;
const filler = (n: number, chars = 120) => Array.from({ length: n }, (_, i) => p(`Line ${i} ${'lorem ipsum '.repeat(Math.ceil(chars / 12))}`)).join('');
const colon = (rows: number) =>
  '<table>' + Array.from({ length: rows }, (_, i) => `<tr><td>Item ${i + 1}</td><td>:</td><td>Detail ${i + 1} ${'text '.repeat(6)}</td></tr>`).join('') + '</table>';
const grid = (rows: number) => normalizeColonTableToTabular(colon(rows), '#722580');
const OPTS = { hasHeaderImage: true, hasFooterImage: true, honorPageBreaks: false } as const;

/** pages that contain at least one grid-table row of the given text block */
const pagesWithGridRows = (chunks: ReturnType<typeof chunkDocumentBlocksForA4Pages>) =>
  chunks.filter((c) => c.slices.some((s) => /quote-grid-table/.test(s.contentSlice || ''))).map((c) => c.pageNum);

describe('tabular columns stay on a single page', () => {
  it('TC1: a grid table that does not fit in the room left moves whole – one slice, one header, every row', () => {
    for (let n = 6; n <= 24; n++) {
      const chunks = chunkDocumentBlocksForA4Pages([{ id: 'a', type: 'text', title: 'Specs', content: filler(n) + grid(6) }], OPTS);
      const slices = chunks.flatMap((c) => c.slices).filter((s) => /quote-grid-table/.test(s.contentSlice || ''));
      expect(slices.length, `intro paragraphs = ${n}`).toBe(1);
      expect((slices[0].contentSlice!.match(/<thead/g) || []).length).toBe(1);
      expect((slices[0].contentSlice!.match(/<tr/g) || []).length).toBe(7); // header + 6 rows
    }
  });

  it('TC2: it holds for every amount of text above the table (no split at any fill level)', () => {
    for (let n = 6; n <= 24; n++) {
      const chunks = chunkDocumentBlocksForA4Pages([{ id: 'a', type: 'text', title: 'Specs', content: filler(n) + grid(5) }], OPTS);
      expect(pagesWithGridRows(chunks).length, `intro paragraphs = ${n}`).toBe(1);
    }
  });

  it('TC3: the lead-in sentence ending with ":" travels with its table, and the table is whole', () => {
    const lead = p('The hardware requirements and operating system required are as described below:');
    for (let n = 8; n <= 22; n++) {
      const chunks = chunkDocumentBlocksForA4Pages([{ id: 'a', type: 'text', title: '', content: filler(n) + lead + grid(5) }], OPTS);
      const pageOfLead = chunks.find((c) => c.slices.some((s) => (s.contentSlice || '').includes('as described below:')))!.pageNum;
      const tablePages = pagesWithGridRows(chunks);
      expect(tablePages.length, `intro paragraphs = ${n}`).toBe(1);
      expect(tablePages[0], `intro paragraphs = ${n}`).toBe(pageOfLead);
    }
  });

  it('TC4: two tabular columns in one section are each kept whole', () => {
    const chunks = chunkDocumentBlocksForA4Pages([{ id: 'a', type: 'text', title: '', content: filler(10) + grid(5) + filler(6) + grid(5) }], OPTS);
    chunks.forEach((c) =>
      c.slices.forEach((s) => {
        // a table on a page always starts at row 1 (never a continuation)
        const firstNo = (s.contentSlice || '').match(/<tbody>\s*<tr[\s\S]*?<td[^>]*>\s*(\d+)\s*<\/td>/);
        if (firstNo) expect(firstNo[1]).toBe('1');
      })
    );
  });

  it('TC5: a table taller than a whole page is the only case that may flow across pages', () => {
    const chunks = chunkDocumentBlocksForA4Pages([{ id: 'a', type: 'text', title: 'Big', content: grid(60) }], OPTS);
    expect(pagesWithGridRows(chunks).length).toBeGreaterThan(1);
    const rows = chunks.flatMap((c) => c.slices).reduce((n, s) => n + ((s.contentSlice || '').match(/<td[^>]*>\s*\d+\s*<\/td>/g) || []).length, 0);
    expect(rows).toBeGreaterThanOrEqual(60); // nothing lost
  });

  it('TC6: measured heights are honoured too (view / PDF / email use measured metrics)', () => {
    for (let n = 4; n <= 14; n++) {
      const metrics = {
        availFirst: 600,
        availOther: 800,
        gridOverhead: 50,
        // 70px per paragraph, 40px per table body row (works for a single unit and for the whole block)
        unitHeight: (u: string) => (u.match(/<p>/g) || []).length * 70 + (/quote-grid-table/.test(u) ? Math.max(0, (u.match(/<tr/g) || []).length - 1) * 40 : 0),
      };
      const chunks = chunkDocumentBlocksForA4Pages([{ id: 'a', type: 'text', title: '', content: filler(n) + grid(5) }], { ...OPTS, metrics });
      expect(pagesWithGridRows(chunks).length, `intro paragraphs = ${n}`).toBe(1);
    }
  });
});

describe('Delete page', () => {
  const item = (n: number) => ({ id: n, type: 'item', no: n, description: `Item ${n}`, qty: 1, unitPrice: 10 });

  it('TC7: a section that only lives on that page is removed; the others are untouched', () => {
    const blocks = [
      { id: 'intro', type: 'text', title: 'Intro', content: filler(14) },
      { id: 'price', type: 'table', pageBreak: true, items: [1, 2, 3].map(item) },
      { id: 'terms', type: 'text', title: 'Terms', content: p('Pay in 30 days') },
    ];
    const chunks = chunkDocumentBlocksForA4Pages(blocks, { hasHeaderImage: true, hasFooterImage: true });
    const pageOfPrice = chunks.findIndex((c) => c.slices.some((s) => s.block.id === 'price'));
    const res = removePageFromBlocks(blocks, chunks, pageOfPrice);
    expect(res.blocks.some((b) => b.id === 'price')).toBe(false);
    expect(res.blocks.find((b) => b.id === 'intro')).toBe(blocks[0]);
    expect(res.removedBlocks).toBeGreaterThanOrEqual(1);
  });

  it('TC8: a long text section loses only the part that sits on the deleted page', () => {
    const blocks = [{ id: 'long', type: 'text', title: 'Long', content: filler(40) }];
    const chunks = chunkDocumentBlocksForA4Pages(blocks, { hasHeaderImage: true, hasFooterImage: true });
    expect(chunks.length).toBeGreaterThan(2);
    const second = chunks[1].slices[0].contentSlice!;
    const res = removePageFromBlocks(blocks, chunks, 1);
    expect(res.blocks).toHaveLength(1);
    expect(res.trimmedBlocks).toBe(1);
    const newContent = res.blocks[0].content as string;
    expect(newContent).toContain('Line 0 ');
    expect(newContent).not.toContain(second.replace(/<[^>]+>/g, '').slice(0, 30));
    // the document is now shorter
    expect(chunkDocumentBlocksForA4Pages(res.blocks, { hasHeaderImage: true, hasFooterImage: true }).length).toBeLessThan(chunks.length);
  });

  it('TC9: a pricing table spanning pages loses the rows of that page and the rest are renumbered', () => {
    const blocks = [{ id: 'big', type: 'table', items: Array.from({ length: 60 }, (_, i) => item(i + 1)) }];
    const chunks = chunkDocumentBlocksForA4Pages(blocks, { hasHeaderImage: true, hasFooterImage: true, honorPageBreaks: false });
    expect(chunks.length).toBeGreaterThan(1);
    const dropped = chunks[1].slices[0].itemsSlice!.length;
    const res = removePageFromBlocks(blocks, chunks, 1);
    expect(res.blocks[0].items.length).toBe(60 - dropped);
    expect(res.blocks[0].items.map((i: any) => i.no)).toEqual(Array.from({ length: 60 - dropped }, (_, i) => i + 1));
  });

  it('TC10: out-of-range / empty pages change nothing', () => {
    const blocks = [{ id: 'a', type: 'text', title: '', content: p('Hello') }];
    const chunks = chunkDocumentBlocksForA4Pages(blocks, { hasHeaderImage: true, hasFooterImage: true });
    expect(removePageFromBlocks(blocks, chunks, 5).blocks).toBe(blocks);
    expect(removePageFromBlocks(blocks, chunks, -1).blocks).toBe(blocks);
    const empty = chunkDocumentBlocksForA4Pages([], {});
    expect(removePageFromBlocks([], empty, 0).blocks).toEqual([]);
  });

  it('TC11: deleting a page never leaves a half-removed section (no orphan continuation, no empty block)', () => {
    const blocks = [
      { id: 'a', type: 'text', title: 'A', content: filler(40) },
      { id: 'b', type: 'table', items: [1, 2, 3].map(item) },
    ];
    const chunks = chunkDocumentBlocksForA4Pages(blocks, { hasHeaderImage: true, hasFooterImage: true, honorPageBreaks: false });
    for (let i = 0; i < chunks.length; i++) {
      const res = removePageFromBlocks(blocks, chunks, i);
      res.blocks.forEach((b) => {
        if (b.type === 'text') expect((b.content as string).replace(/<[^>]+>/g, '').trim().length).toBeGreaterThan(0);
        else expect(b.items.length).toBeGreaterThan(0);
      });
    }
  });
});
