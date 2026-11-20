import { describe, it, expect } from 'vitest';
import {
  chunkDocumentBlocksForA4Pages,
  splitHtmlBlocks,
  joinHtmlUnits,
  normalizeColonTableToTabular,
  buildProposalFullHtml,
} from '../htmlPdfGenerator';

const perPara = (px: number) => (u: string) => (u.match(/<p>/g) || []).length * px;
const para = (n: number) => `<p>${'Lorem ipsum dolor sit amet. '.repeat(n)}</p>`;

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, type: 'item', no: i + 1, description: `Item ${i + 1}`, qty: 1, unitPrice: 100 }));

describe('continuous A4 flow', () => {
  const blocks = [
    { id: 'a', type: 'text', title: 'Intro', content: para(6) },
    { id: 'b', type: 'table', pageBreak: true, items: items(3) },
  ];

  it('honours a forced page break by default (editor) but ignores it for continuous rendering', () => {
    const forced = chunkDocumentBlocksForA4Pages(blocks, { hasHeaderImage: true, hasFooterImage: true });
    const continuous = chunkDocumentBlocksForA4Pages(blocks, { hasHeaderImage: true, hasFooterImage: true, honorPageBreaks: false });
    expect(forced.length).toBe(2);
    expect(continuous.length).toBe(1);
  });

  it('uses measured unit heights instead of character-count guesses', () => {
    const many = [{ id: 'a', type: 'text', title: '', content: Array.from({ length: 40 }, () => para(3)).join('') }];
    const estimated = chunkDocumentBlocksForA4Pages(many, { honorPageBreaks: false });
    const measured = chunkDocumentBlocksForA4Pages(many, { honorPageBreaks: false, metrics: { unitHeight: perPara(20) } });
    expect(measured.length).toBeLessThan(estimated.length);
  });

  it('respects the measured page room', () => {
    const many = [{ id: 'a', type: 'text', title: '', content: Array.from({ length: 10 }, () => para(1)).join('') }];
    const roomy = chunkDocumentBlocksForA4Pages(many, { metrics: { availFirst: 2000, availOther: 2000, unitHeight: perPara(100) } });
    const tight = chunkDocumentBlocksForA4Pages(many, { metrics: { availFirst: 300, availOther: 300, unitHeight: perPara(100) } });
    expect(roomy.length).toBe(1);
    expect(tight.length).toBeGreaterThan(2);
  });

  it('splits grid tables row by row and merges rows on the same page back into one table', () => {
    const colon = '<table>' + Array.from({ length: 5 }, (_, i) => `<tr><td>Term ${i}</td><td>:</td><td>Value ${i}</td></tr>`).join('') + '</table>';
    const grid = normalizeColonTableToTabular(colon, '#722580');
    const units = splitHtmlBlocks(grid);
    expect(units.length).toBe(5);
    const joined = joinHtmlUnits(units);
    expect((joined.match(/<thead/g) || []).length).toBe(1);
    expect((joined.match(/<tr/g) || []).length).toBe(6); // header + 5 rows
    // a slice that starts mid-table keeps its own header
    expect((joinHtmlUnits(units.slice(3)).match(/<thead/g) || []).length).toBe(1);
  });

  it('exposes the hooks the real-browser measurement relies on', () => {
    const html = buildProposalFullHtml({
      proposal: { proposalNo: 'X', blocks },
      entity: { name: 'Acme' },
      settings: { brandColor: '#722580' },
    } as any);
    expect(html).toContain('data-role="page-content"');
    expect(html).toContain('data-role="page-footer"');
    expect(html).toContain('data-row="1:0"');
    expect(html).toContain('data-role="table-tfoot"');
  });
});
