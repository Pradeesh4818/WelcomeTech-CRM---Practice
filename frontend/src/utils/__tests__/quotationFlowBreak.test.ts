import { describe, it, expect } from 'vitest';
import {
  chunkDocumentBlocksForA4Pages,
  splitHtmlBlocks,
  joinHtmlUnits,
  isFlowBreakUnit,
  FLOW_BREAK_HTML,
} from '../quotationHelpers';

const p = (t: string) => `<p>${t}</p>`;

describe('flow break (Enter at the bottom of a full page)', () => {
  const content = p('First paragraph of the section.') + FLOW_BREAK_HTML + p('Typed on the next page.');
  const blocks = [{ id: 't', type: 'text', title: 'Scope', content }];

  it('keeps the marker (and blank lines) as units instead of dropping them', () => {
    const units = splitHtmlBlocks(content);
    expect(units.some(isFlowBreakUnit)).toBe(true);
    expect(splitHtmlBlocks('<div>a</div><div><br></div><div>b</div>').length).toBe(3);
  });

  it('continues the SAME block on the next page (one block, two slices) in the editor', () => {
    const pages = chunkDocumentBlocksForA4Pages(blocks, { hasHeaderImage: true, hasFooterImage: true });
    expect(pages.length).toBe(2);
    const slices = pages.flatMap((c) => c.slices);
    expect(slices.length).toBe(2);
    expect(new Set(slices.map((s) => s.block.id)).size).toBe(1);
    expect(slices[1].isTextContinuation).toBe(true);
    expect(isFlowBreakUnit(slices[1].contentSlice || '')).toBe(true);
    expect(isFlowBreakUnit(slices[0].contentSlice || '')).toBe(false);
  });

  it('round-trips: re-joining the slices keeps the marker exactly once', () => {
    const pages = chunkDocumentBlocksForA4Pages(blocks, { hasHeaderImage: true, hasFooterImage: true });
    const joined = joinHtmlUnits(pages.flatMap((c) => c.slices).map((s) => s.contentSlice || ''));
    expect((joined.match(/data-flow-break/g) || []).length).toBe(1);
  });

  it('is ignored (plain blank paragraph) by continuous preview/PDF rendering', () => {
    const pages = chunkDocumentBlocksForA4Pages(blocks, { honorPageBreaks: false });
    expect(pages.length).toBe(1);
  });

  it('never creates a continuation container for blank spacer lines', () => {
    const blank = '<div><br></div>';
    // a block that exactly fills the page, followed by spacer lines that would spill over
    const filler = Array.from({ length: 24 }, (_, i) => p(`Line ${i} ${'lorem ipsum '.repeat(8)}`)).join('');
    const spill = [{ id: 'z', type: 'text', title: 'Tail', content: filler + blank + blank + blank }];
    for (const avail of [700, 760, 820, 880, 940]) {
      const pages = chunkDocumentBlocksForA4Pages(spill, {
        hasHeaderImage: true,
        hasFooterImage: true,
        metrics: { availFirst: avail, availOther: avail, unitHeight: (u) => (/<br>/.test(u) && !/lorem/.test(u) ? 28 : 40) },
      });
      pages.forEach((pg) => pg.slices.forEach((sl) => {
        const text = (sl.contentSlice || '').replace(/<[^>]+>/g, '').trim();
        expect(text.length).toBeGreaterThan(0);
      }));
    }
  });

  it('reports each page\'s used/available budget so the editor can tell a full page from an empty one', () => {
    const short = [{ id: 's', type: 'text', title: '', content: p('gyg') }];
    const [roomy] = chunkDocumentBlocksForA4Pages(short, { hasHeaderImage: true, hasFooterImage: true });
    expect((roomy.maxWeight as number) - (roomy.usedWeight as number)).toBeGreaterThan(300);

    const filler = Array.from({ length: 30 }, (_, i) => p(`Row ${i} ${'lorem ipsum '.repeat(10)}`)).join('');
    const pages = chunkDocumentBlocksForA4Pages([{ id: 'f', type: 'text', title: '', content: filler }], { hasHeaderImage: true, hasFooterImage: true });
    expect(pages.length).toBeGreaterThan(1);
    const full = pages[0];
    expect((full.maxWeight as number) - (full.usedWeight as number)).toBeLessThan(120);
  });

  it('keeps a small pricing table in one piece instead of cutting it across pages', () => {
    const item = (n: number) => ({ id: n, type: 'item', no: n, description: `Item ${n}`, qty: 1, unitPrice: 10 });
    const intro = { id: 'i', type: 'text', title: '', content: Array.from({ length: 14 }, (_, i) => p(`Intro ${i} ${'lorem ipsum '.repeat(12)}`)).join('') };
    const small = { id: 't', type: 'table', items: [1, 2, 3, 4, 5].map(item) };
    const pages = chunkDocumentBlocksForA4Pages([intro, small], { hasHeaderImage: true, hasFooterImage: true, honorPageBreaks: false });
    const tablePages = pages.filter((pg) => pg.slices.some((sl) => sl.block.id === 't'));
    expect(tablePages.length).toBe(1);

    const long = { id: 'l', type: 'table', items: Array.from({ length: 40 }, (_, i) => item(i + 1)) };
    const longPages = chunkDocumentBlocksForA4Pages([intro, long], { hasHeaderImage: true, hasFooterImage: true, honorPageBreaks: false });
    expect(longPages.filter((pg) => pg.slices.some((sl) => sl.block.id === 'l')).length).toBeGreaterThan(1);
  });
});
