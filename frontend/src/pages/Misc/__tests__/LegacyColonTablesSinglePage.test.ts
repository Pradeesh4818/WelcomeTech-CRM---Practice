import { describe, it, expect } from 'vitest';
import { buildQuotationDocumentHtml } from '../MiscPages';

/**
 * Proposals saved before the grid-table format keep their Terms / Specs as plain "Label : Value" tables.
 * They must be upgraded to the grid *before* pages are split, so the tabular column stays on one page.
 */
const p = (t: string) => `<p>${t}</p>`;
const filler = (n: number) => Array.from({ length: n }, (_, i) => p(`Line ${i} ${'lorem ipsum '.repeat(10)}`)).join('');
const legacy = (rows: number) =>
  '<table>' + Array.from({ length: rows }, (_, i) => `<tr><td>Item ${i + 1}</td><td>:</td><td>Detail ${i + 1} ${'text '.repeat(6)}</td></tr>`).join('') + '</table>';
const legacySpecs = (rows: number) =>
  '<table class="specs-table" data-type="specs">' + Array.from({ length: rows }, (_, i) => `<tr><td>Processor ${i + 1}</td><td>:</td><td>Spec ${i + 1}</td></tr>`).join('') + '</table>';

const render = (content: string) =>
  buildQuotationDocumentHtml(
    { name: 'Legacy', items: [], blocks: [{ id: 'b', type: 'text', title: 'Terms', content }] },
    undefined,
    { isPrintAutoTrigger: false }
  );

type Grid = { firstNo: string; bodyRows: number };
/** every grid table in the rendered document: its first row number and its body-row count */
const gridTables = (html: string): Grid[] =>
  (html.match(/<table[^>]*quote-grid-table[^>]*>[\s\S]*?<\/table>/g) || []).map((t) => ({
    firstNo: ((t.match(/<tbody>\s*<tr[^>]*>\s*<td[^>]*>\s*([^<]*?)\s*<\/td>/) || [])[1] || '').trim(),
    bodyRows: (t.match(/<tr/g) || []).length - 1,
  }));

describe('legacy colon tables in saved proposals (view / print)', () => {
  it('LG-1: a legacy colon table becomes ONE grid table that starts at row 1, at every fill level of the page above', () => {
    for (let n = 6; n <= 22; n++) {
      const tables = gridTables(render(filler(n) + legacy(5)));
      expect(tables.length, `intro paragraphs = ${n}`).toBe(1);
      expect(tables[0].firstNo).toBe('1');
      expect(tables[0].bodyRows).toBe(5);
    }
  });

  it('LG-2: same for the older specs-table markup', () => {
    for (let n = 6; n <= 22; n += 2) {
      const tables = gridTables(render(filler(n) + legacySpecs(5)));
      expect(tables.length, `intro paragraphs = ${n}`).toBe(1);
      expect(tables[0].bodyRows).toBe(5);
    }
  });

  it('LG-3: two legacy tables in one proposal stay two whole tables', () => {
    const tables = gridTables(render(filler(9) + legacy(4) + filler(5) + legacySpecs(4)));
    expect(tables.length).toBe(2);
    tables.forEach((t) => expect(t.firstNo).toBe('1'));
  });
});
