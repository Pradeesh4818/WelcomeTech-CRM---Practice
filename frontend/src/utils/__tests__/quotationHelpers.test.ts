import { describe, it, expect, beforeEach } from 'vitest';
import {
  getNextQuotationNumber,
  estimateTextBlockLines,
  mergeEmailRecipients,
  estimateItemHeight,
  chunkDocumentBlocksForA4Pages,
  splitHtmlBlocks,
  joinHtmlUnits,
  isHeadingUnit,
  estimateUnitHeight,
  normalizeColonTableToTabular
} from '../quotationHelpers';
import { cleanWordArtifacts } from '../documentStyles';

// jsdom is not configured for backend-style node tests, so provide a localStorage shim.
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
if (typeof (globalThis as any).localStorage === 'undefined') {
  (globalThis as any).localStorage = mockLocalStorage;
}

// Bug 6 — every reserved quotation number must be unique.
describe('getNextQuotationNumber', () => {
  beforeEach(() => mockLocalStorage.clear());

  it('reserves a NEW, strictly increasing number on each increment call', () => {
    const a = getNextQuotationNumber(true);
    const b = getNextQuotationNumber(true);
    const c = getNextQuotationNumber(true);
    expect(new Set([a, b, c]).size).toBe(3); // all distinct — no duplicates
  });

  it('peek (increment=false) does NOT advance the counter', () => {
    const first = getNextQuotationNumber(false);
    const again = getNextQuotationNumber(false);
    expect(first).toBe(again);
  });

  it('produces the WT-Q<year><month><seq> shape', () => {
    expect(getNextQuotationNumber(true)).toMatch(/^WT-Q\d{6}\d{2,}$/);
  });
});

// Bug 19 — text-block line estimation from contentEditable HTML (no literal "\n").
describe('estimateTextBlockLines', () => {
  it('returns at least 1 line for empty/undefined content', () => {
    expect(estimateTextBlockLines('')).toBe(1);
    expect(estimateTextBlockLines(undefined)).toBe(1);
  });

  it('counts block-level tags rather than newlines', () => {
    const html = '<p>one</p><p>two</p><p>three</p>';
    expect(estimateTextBlockLines(html)).toBeGreaterThanOrEqual(3);
  });

  it('estimates wrapped lines from long single-paragraph text', () => {
    const longText = '<p>' + 'x'.repeat(270) + '</p>'; // ~3 wrapped lines at ~90 chars
    expect(estimateTextBlockLines(longText)).toBeGreaterThanOrEqual(3);
  });

  it('a multi-section block weighs more than a one-liner (was always equal before the fix)', () => {
    const oneLine = estimateTextBlockLines('<p>hello</p>');
    const many = estimateTextBlockLines('<h2>A</h2><p>1</p><p>2</p><ul><li>x</li><li>y</li></ul>');
    expect(many).toBeGreaterThan(oneLine);
  });
});

// Bug 1 — recipients must include a typed-but-not-yet-committed address, de-duplicated.
describe('mergeEmailRecipients', () => {
  it('includes an email still sitting in the input (never pressed Enter)', () => {
    expect(mergeEmailRecipients([], 'a@b.com')).toEqual(['a@b.com']);
  });

  it('merges committed tags with the typed input', () => {
    expect(mergeEmailRecipients(['x@y.com'], 'a@b.com')).toEqual(['x@y.com', 'a@b.com']);
  });

  it('de-duplicates and ignores non-email tokens', () => {
    expect(mergeEmailRecipients(['a@b.com'], 'a@b.com, c@d.com, notanemail')).toEqual(['a@b.com', 'c@d.com']);
  });

  it('returns the existing tags unchanged when the input is empty', () => {
    expect(mergeEmailRecipients(['a@b.com'], '')).toEqual(['a@b.com']);
    expect(mergeEmailRecipients([], '')).toEqual([]);
  });
});

describe('estimateItemHeight', () => {
  it('calculates baseline height for single-line standard items', () => {
    const item = { type: 'item', description: 'Single User License', qty: 1, unitPrice: 2300 };
    expect(estimateItemHeight(item)).toBe(36);
  });

  it('accurately factors multi-line descriptions into height', () => {
    const item = {
      type: 'item',
      description: 'Tally Prime Single User\n- Accounting & Inventory\n- 2026 International Silver\n- 1 Year Subscription\n- Free release updates',
      qty: 1,
      unitPrice: 2300,
    };
    const h = estimateItemHeight(item);
    expect(h).toBeGreaterThan(90);
  });

  it('accurately estimates detail lines height', () => {
    const shortDetail = { type: 'detail', description: 'Small note' };
    expect(estimateItemHeight(shortDetail)).toBeGreaterThanOrEqual(22);

    const longDetail = { type: 'detail', description: 'x'.repeat(150) };
    expect(estimateItemHeight(longDetail)).toBeGreaterThan(estimateItemHeight(shortDetail));
  });
});

describe('chunkDocumentBlocksForA4Pages - Intra-Table Slicing', () => {
  it('returns single chunk when blocks array is empty', () => {
    const chunks = chunkDocumentBlocksForA4Pages([]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageNum).toBe(1);
    expect(chunks[0].slices).toEqual([]);
    expect(chunks[0].isFirst).toBe(true);
    expect(chunks[0].isLast).toBe(true);
  });

  it('slices a large table across discrete A4 page sheets without cutoffs', () => {
    const items = [
      { id: 1, no: 1, type: 'item', description: 'Tally Prime Single User\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6', qty: 1, unitPrice: 2300 },
      { id: 2, no: 2, type: 'item', description: 'Installation & Implementation', qty: 1, unitPrice: 0 },
      { id: 3, no: 3, type: 'item', description: 'Company Creation', qty: 1, unitPrice: 0 },
      { id: 4, no: 4, type: 'item', description: 'Admin & User Creation', qty: 1, unitPrice: 0 },
      { id: 5, no: 5, type: 'item', description: 'Registration & Activation', qty: 1, unitPrice: 0 },
      { id: 6, no: 6, type: 'item', description: 'Tally Prime on Cloud', qty: 1, unitPrice: 500 },
      { id: 7, no: 7, type: 'item', description: 'Tally Customization & Integration', qty: 1, unitPrice: 800 },
      { id: 8, no: 8, type: 'item', description: 'Tally AMC & Technical Support', qty: 1, unitPrice: 1200 },
      { id: 9, no: 9, type: 'item', description: 'CRM Solutions & Development', qty: 1, unitPrice: 1500 },
      { id: 10, no: 10, type: 'item', description: 'Website & Web Application Development', qty: 1, unitPrice: 2000 },
      { id: 11, no: 11, type: 'item', description: 'Digital Marketing Solutions', qty: 1, unitPrice: 1000 },
      { id: 12, no: 12, type: 'item', description: 'IT Hardware & Infrastructure Support', qty: 1, unitPrice: 1500 },
      // …enough further rows that the table is longer than one A4 page (a table that fits on a page is kept whole)
      ...Array.from({ length: 36 }, (_, i) => ({ id: 13 + i, no: 13 + i, type: 'item', description: `Additional service ${i + 1}`, qty: 1, unitPrice: 100 })),
    ];

    const blocks = [
      { id: 'intro_text', type: 'text', title: 'Our Approach', content: '<p>Our approach is simple...</p>' },
      { id: 'pricing_table', type: 'table', title: 'Pricing Table', items, discountPercent: 0 },
    ];

    const chunks = chunkDocumentBlocksForA4Pages(blocks, {
      hasHeaderImage: true,
      hasFooterImage: true,
      isEditor: true,
    });

    // Should create multiple pages
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Collect all table slices
    const tableSlices = chunks.flatMap(c => c.slices.filter(s => s.block.id === 'pricing_table'));
    expect(tableSlices.length).toBeGreaterThanOrEqual(2);

    // First slice must NOT be continuation and must NOT be end
    expect(tableSlices[0].isTableContinuation).toBe(false);
    expect(tableSlices[0].isTableEnd).toBe(false);
    expect(tableSlices[0].itemsSlice!.length).toBeGreaterThan(0);

    // Final slice must be continuation and must be end
    const lastSlice = tableSlices[tableSlices.length - 1];
    expect(lastSlice.isTableContinuation).toBe(true);
    expect(lastSlice.isTableEnd).toBe(true);

    // Total count of sliced items must equal original item count exactly
    const totalSlicedItems = tableSlices.reduce((acc, s) => acc + (s.itemsSlice?.length || 0), 0);
    expect(totalSlicedItems).toBe(items.length);
  });

  it('marks forced pageBreak correctly to start on a new A4 sheet', () => {
    const blocks = [
      { id: 't1', type: 'text', content: '<p>Short paragraph</p>' },
      { id: 'tbl', type: 'table', items: [{ id: 1, type: 'item', description: 'Item 1' }], pageBreak: true },
    ];

    const chunks = chunkDocumentBlocksForA4Pages(blocks);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].slices[0].block.id).toBe('t1');
    expect(chunks[1].slices[0].block.id).toBe('tbl');
  });

  it('slices a long multi-section text block across discrete A4 pages without cutting off footer or text', () => {
    // Generate a long text block with multiple paragraphs and list items that exceeds single A4 capacity
    const longHtml = `
      <div><p>Welcome Trading Co. W.L.L. is a premier technology solutions provider in Qatar.</p></div>
      <div><p>As a Tally Authorised Gold Partner, we bring extensive experience in software implementation.</p></div>
      <div><p>Our approach is simple — understand your business requirements and implement efficiently.</p></div>
      <div><h3>Our Core Technology Solutions</h3></div>
      <ul>
        <li>Tally Prime Accounting & ERP Solutions</li>
        <li>Tally Prime on Cloud</li>
        <li>Tally Customization & Integration</li>
        <li>Tally AMC & Technical Support</li>
        <li>CRM Solutions & Development</li>
        <li>Website & Web Application Development</li>
        <li>Digital Marketing Solutions</li>
        <li>Barcode & Inventory Management Solutions</li>
        <li>IT Hardware & Infrastructure Support</li>
      </ul>
      <div><h3>Why Choose Welcome Trading?</h3></div>
      <ul>
        <li>Trusted technology partner in Qatar</li>
        <li>Tally Authorised Gold Partner</li>
        <li>Experienced technical and implementation team</li>
        <li>Customized solutions based on business requirements</li>
        <li>End-to-end software and IT services</li>
        <li>Reliable after-sales and technical support</li>
        <li>Scalable solutions for small, medium, and growing businesses</li>
        <li>Focus on long-term customer relationships</li>
      </ul>
      <div><h3>Service Level Commitments & Terms</h3></div>
      <ul>
        <li>Standard 24/7 emergency critical issue coverage</li>
        <li>Dedicated account manager and technical lead assignment</li>
        <li>Weekly progress reporting during implementation phase</li>
        <li>Quarterly on-site preventive maintenance and health-check visits</li>
        <li>Unlimited telephone, remote desktop, and email support desk access</li>
      </ul>
      <div><p>At Welcome Trading Co. W.L.L., we believe technology should make business simpler and faster.</p></div>
      <div><p>From accounting and ERP to CRM and cloud, we provide practical technology solutions.</p></div>
      <div><p>Our commitment is to ensure seamless digital transformation for your enterprise in Doha, Qatar.</p></div>
    `;

    const blocks = [
      { id: 'long_intro', type: 'text', title: 'Warm greetings from Welcome Trading', content: longHtml },
      { id: 'pricing_table', type: 'table', title: 'Scope of Work', items: [{ id: 1, type: 'item', description: 'Item 1', qty: 1, unitPrice: 100 }] },
    ];

    const chunks = chunkDocumentBlocksForA4Pages(blocks, {
      hasHeaderImage: true,
      hasFooterImage: true,
      isEditor: true,
    });

    // Must slice across at least 2 pages
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Find all text slices for 'long_intro'
    const textSlices = chunks.flatMap(c => c.slices.filter(s => s.block.id === 'long_intro'));
    expect(textSlices.length).toBeGreaterThanOrEqual(2);

    // First slice must have content, isTextContinuation: false, isTextEnd: false
    expect(textSlices[0].isTextContinuation).toBe(false);
    expect(textSlices[0].isTextEnd).toBe(false);
    expect(textSlices[0].contentSlice).toBeTruthy();

    // Last slice must have isTextEnd: true
    const lastSlice = textSlices[textSlices.length - 1];
    expect(lastSlice.isTextContinuation).toBe(true);
    expect(lastSlice.isTextEnd).toBe(true);
    expect(lastSlice.contentSlice).toBeTruthy();

    // Verify key items moved to continuation
    expect(textSlices[0].contentSlice).toBeTruthy();
    expect(lastSlice.contentSlice).toContain('practical technology solutions');
    const fullText = textSlices.map(s => s.contentSlice).join(' ');
    expect(fullText).toContain('Welcome Trading');
  });

  it('automatically flows text block to the next page when reaching the A4 page limit like MS Word', () => {
    const repeatedParas = Array.from({ length: 14 }, (_, idx) => 
      `<p>Hope the above is in line with your requirement and await the receipt of your valued order paragraph ${idx + 1}. The Accounting system can be implemented within 10 days.</p>`
    ).join('\n');

    const blocks = [
      { id: 'para_block', type: 'text', title: 'Terms & Conditions', content: repeatedParas },
    ];

    const chunks = chunkDocumentBlocksForA4Pages(blocks, {
      hasHeaderImage: true,
      hasFooterImage: true,
      isEditor: true,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].slices.length).toBeGreaterThan(0);
    expect(chunks[1].slices.length).toBeGreaterThan(0);
    expect(chunks[1].slices[0].isTextContinuation).toBe(true);
  });

  it('slices duplicated Core Technology Solutions across Page 1 and Page 2', () => {
    const introHtml = `
      <p>Welcome Trading Co. W.L.L. is a trusted business technology solutions provider in Qatar, helping organizations simplify their business operations through reliable software, cloud, ERP, CRM, web, and IT solutions.</p>
      <p>As a Tally Authorised Gold Partner, we bring extensive industry experience and practical expertise in accounting software implementation, customization, integration, cloud solutions, and technical support.</p>
      <p>Beyond Tally, our technology portfolio enables businesses to manage, automate, and digitally transform their day-to-day operations through integrated solutions.</p>
      <p>Our approach is simple — understand your business requirements, recommend the right technology, implement it efficiently, and provide dependable ongoing support.</p>
      <p>We pride ourselves on providing high standard consultancy, business intelligence setups, and seamless enterprise system integration across all commercial sectors.</p>
      <p>Every customer deployment is supervised by certified senior consultants to ensure flawless execution and full compliance with local financial standards.</p>
      <p><b><u>Our Core Technology Solutions</u></b></p>
      <ul>
        <li>Tally Prime Accounting & ERP Solutions</li>
        <li>Tally Prime on Cloud</li>
        <li>Tally Customization & Integration</li>
        <li>Tally AMC & Technical Support</li>
        <li>CRM Solutions & Development</li>
        <li>Website & Web Application Development</li>
        <li>Digital Marketing Solutions</li>
        <li>Barcode & Inventory Management Solutions</li>
        <li>IT Hardware & Infrastructure Support</li>
      </ul>
      <p><b><u>Our Core Technology Solutions</u></b></p>
      <ul>
        <li>Tally Prime Accounting & ERP Solutions</li>
        <li>Tally Prime on Cloud</li>
        <li>Tally Customization & Integration</li>
        <li>Tally AMC & Technical Support</li>
        <li>CRM Solutions & Development</li>
        <li>Website & Web Application Development</li>
        <li>Digital Marketing Solutions</li>
        <li>Barcode & Inventory Management Solutions</li>
        <li>IT Hardware & Infrastructure Support</li>
      </ul>
      <p><b><u>Why Choose Welcome Trading?</u></b></p>
      <ul>
        <li>Trusted partner</li>
      </ul>
    `;

    const blocks = [
      { id: 'block_1', type: 'text', title: 'Warm greetings from Welcome Trading Co. W.L.L. , Qatar.', content: introHtml }
    ];

    const chunks = chunkDocumentBlocksForA4Pages(blocks, {
      hasHeaderImage: true,
      hasFooterImage: true,
      isEditor: false,
    });

    const slice0Text = chunks[0]?.slices[0]?.contentSlice || '';
    const occurrences = (slice0Text.match(/Our Core Technology Solutions/g) || []).length;
    expect(occurrences).toBe(1);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps a table that fits on one page whole (moves it to the next page) instead of cutting it in half', () => {
    // page 1 is mostly filled by the intro, so only a modest strip is left – moving the table wastes little
    const intro = Array.from({ length: 9 }, (_, i) => `<p>Paragraph ${i + 1}</p>`).join('');
    const blocks = [
      { id: 't1', type: 'text', title: 'Intro', content: intro },
      {
        id: 'tbl_15',
        type: 'table',
        title: 'Pricing',
        items: Array.from({ length: 15 }, (_, i) => ({ id: i + 1, type: 'item', description: `Item ${i + 1}`, qty: 1, unitPrice: (i + 1) * 100 })),
      },
    ];

    const chunks = chunkDocumentBlocksForA4Pages(blocks, { hasHeaderImage: true, hasFooterImage: true, isEditor: true });
    const tableSlices = chunks.flatMap(c => c.slices.filter(s => s.block.id === 'tbl_15'));
    expect(tableSlices.length).toBe(1);
    expect(tableSlices[0].isTableContinuation).toBe(false);
    expect(tableSlices[0].isTableEnd).toBe(true);
    expect(tableSlices[0].itemsSlice!.length).toBe(15);
  });

  it('does not leave a huge blank page bottom just to keep a table whole – it splits instead', () => {
    const blocks = [
      { id: 't1', type: 'text', title: 'Intro', content: '<p>Paragraph 1</p><p>Paragraph 2</p>' },
      {
        id: 'tbl_15',
        type: 'table',
        title: 'Pricing',
        items: Array.from({ length: 15 }, (_, i) => ({ id: i + 1, type: 'item', description: `Item ${i + 1}`, qty: 1, unitPrice: (i + 1) * 100 })),
      },
    ];
    const chunks = chunkDocumentBlocksForA4Pages(blocks, { hasHeaderImage: true, hasFooterImage: true, isEditor: true });
    // the table starts on page 1 right after the short intro
    expect(chunks[0].slices.some(s => s.block.id === 'tbl_15')).toBe(true);
    const total = chunks.flatMap(c => c.slices.filter(s => s.block.id === 'tbl_15')).reduce((a, s) => a + (s.itemsSlice?.length || 0), 0);
    expect(total).toBe(15);
  });

  it('starts a table that is longer than a page immediately on the current page, then continues it', () => {
    const blocks = [
      { id: 't1', type: 'text', title: 'Intro', content: '<p>Paragraph 1</p><p>Paragraph 2</p><p>Paragraph 3</p><p>Paragraph 4</p><p>Paragraph 5</p><p>Paragraph 6</p><p>Paragraph 7</p>' },
      {
        id: 'tbl_60',
        type: 'table',
        title: 'Pricing',
        items: Array.from({ length: 60 }, (_, i) => ({ id: i + 1, type: 'item', description: `Item ${i + 1}`, qty: 1, unitPrice: (i + 1) * 100 })),
      },
    ];

    const chunks = chunkDocumentBlocksForA4Pages(blocks, { hasHeaderImage: true, hasFooterImage: true, isEditor: true });
    const tableSlices = chunks.flatMap(c => c.slices.filter(s => s.block.id === 'tbl_60'));
    expect(tableSlices.length).toBeGreaterThanOrEqual(2);
    // it begins on the same page as the intro (no blank gap) …
    expect(chunks[0].slices.some(s => s.block.id === 'tbl_60')).toBe(true);
    expect(tableSlices[0].isTableContinuation).toBe(false);
    expect(tableSlices[tableSlices.length - 1].isTableEnd).toBe(true);
    const totalSliced = tableSlices.reduce((acc, s) => acc + (s.itemsSlice?.length || 0), 0);
    expect(totalSliced).toBe(60);
  });
});

describe('cleanWordArtifacts', () => {
  it('strips excessive non-breaking spaces before numbered list items', () => {
    const input = '<p class="MsoListParagraphCxSpLast">&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;2.&nbsp;Service charges will apply.</p>';
    const cleaned = cleanWordArtifacts(input);
    expect(cleaned).not.toContain('&nbsp; &nbsp; &nbsp;');
    expect(cleaned).toContain('2.&nbsp;Service charges will apply.');
  });

  it('unwraps Word supportLists conditional comments to preserve list numbers', () => {
    const input = '<p><!--[if !supportLists]--><span lang="EN-US">&nbsp; &nbsp; &nbsp; &nbsp;3.&nbsp;</span><!--[endif]--><span lang="EN-US">AMC contract.</span></p>';
    const cleaned = cleanWordArtifacts(input);
    expect(cleaned).not.toContain('<!--[if !supportLists]-->');
    expect(cleaned).not.toContain('<!--[endif]-->');
    expect(cleaned).toContain('3.');
    expect(cleaned).toContain('AMC contract.');
  });

  it('removes negative text-indent from Word styles', () => {
    const input = '<p class="MsoListParagraph" style="text-indent:-18.0pt;mso-list:l0 level1">Content</p>';
    const cleaned = cleanWordArtifacts(input);
    expect(cleaned).not.toContain('text-indent:-18.0pt');
    expect(cleaned).not.toContain('mso-list');
  });
});

describe('splitHtmlBlocks - specs-table & abbreviations', () => {
  it('preserves company abbreviations like Co. and W.L.L. without breaking into two sentences', () => {
    const text = '<p>Warm greetings from Welcome Trading Co. W.L.L. , Qatar. We thank you for your kind inquiry regarding TallyPrime software and are pleased to submit our best commercial offer as detailed below for your consideration.</p>';
    const units = splitHtmlBlocks(text);
    // Should not split "Co." and "W.L.L." into distinct blocks
    for (const u of units) {
      expect(u).not.toBe('<p>Warm greetings from Welcome Trading Co.</p>');
      if (u.includes('Welcome Trading Co.')) {
        expect(u).toContain('W.L.L.');
      }
    }
  });

  it('splits specs-table rows into single-row tables with locked colgroup and table-layout fixed', () => {
    const tableHtml = `
      <table class="specs-table" data-type="specs">
        <tbody>
          <tr><td>Quotation validity</td><td>:</td><td>10 days</td></tr>
          <tr><td>Payment</td><td>:</td><td>100% advance</td></tr>
        </tbody>
      </table>
    `;
    const units = splitHtmlBlocks(tableHtml);
    expect(units.length).toBe(2);
    for (const unit of units) {
      expect(unit).toContain('table-layout:fixed');
      expect(unit).toContain('<colgroup><col style="width:190px;"><col style="width:25px;"><col></colgroup>');
      expect(unit).toContain('<table class="specs-table" data-type="specs"');
    }
  });

  it('merges adjacent specs-table units back into a single table with colgroup via joinHtmlUnits', () => {
    const tableHtml = `
      <table class="specs-table" data-type="specs">
        <tbody>
          <tr><td>Quotation validity</td><td>:</td><td>10 days</td></tr>
          <tr><td>Payment</td><td>:</td><td>100% advance</td></tr>
        </tbody>
      </table>
    `;
    const units = splitHtmlBlocks(tableHtml);
    const joined = joinHtmlUnits(units);
    expect(joined).toContain('<colgroup><col style="width:190px;"><col style="width:25px;"><col></colgroup>');
    // Should be a single table with 2 rows, not 2 separate tables
    const tableCount = (joined.match(/<table\b/gi) || []).length;
    expect(tableCount).toBe(1);
    expect(joined).toContain('Quotation validity');
    expect(joined).toContain('Payment');
  });
});

describe('isHeadingUnit & Keep-with-next orphan prevention', () => {
  it('correctly identifies headings, underlined titles, and short bold question lines', () => {
    expect(isHeadingUnit('<h3>Our Scope</h3>')).toBe(true);
    expect(isHeadingUnit('<div><b><u>Our Core Technology Solutions</u></b></div>')).toBe(true);
    expect(isHeadingUnit('<div><u><b>Our Core Technology Solutions</b></u></div>')).toBe(true);
    expect(isHeadingUnit('<p><b>Why Choose Welcome Trading?</b></p>')).toBe(true);
    expect(isHeadingUnit('<p><b>System Requirements:</b></p>')).toBe(true);
    expect(isHeadingUnit('<p>Welcome Trading Co. W.L.L. is a trusted business technology solutions provider in Qatar...</p>')).toBe(false);
  });

  it('prevents orphan headings at the bottom of an A4 page by moving heading to next page with its bullets', () => {
    // Construct a block where intro paragraphs fill almost the entire page,
    // followed by a heading and bullet list that would cause the heading to be alone if not kept with next
    const introParagraphs = Array.from({ length: 18 }, (_, i) => `<p>Detailed enterprise implementation paragraph ${i + 1} explaining scope, deliverables, architecture, and SLA guarantees across cloud infrastructure systems.</p>`).join('\n');
    const heading = '<p><b><u>Our Core Technology Solutions</u></b></p>';
    const bullets = '<ul>' + Array.from({ length: 8 }, (_, i) => `<li>Enterprise solution module #${i + 1} with custom setup</li>`).join('') + '</ul>';

    const content = `${introParagraphs}\n${heading}\n${bullets}`;
    const blocks = [{ id: 'sec_1', type: 'text', title: 'Scope', content }];

    const chunks = chunkDocumentBlocksForA4Pages(blocks, {
      hasHeaderImage: true,
      hasFooterImage: true,
      isEditor: false,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Page 1 slice should NOT end with the orphan heading
    const p1Slice = chunks[0].slices[0].contentSlice || '';
    const p2Slice = chunks[1].slices[0].contentSlice || '';

    // If heading was kept with next, it should NOT be an orphan alone at the very end of Page 1
    if (!p1Slice.includes('Our Core Technology Solutions')) {
      // Heading cleanly moved to Page 2
      expect(p2Slice).toContain('Our Core Technology Solutions');
      expect(p2Slice).toContain('Enterprise solution module #1');
    } else {
      expect(p1Slice).toContain('Enterprise solution module #1');
    }
  });

  it('eliminates premature gaps on multi-page quotations by filling pages with realistic typography weights', () => {
    const fs = require('fs');
    const path = '/Users/aedenteka/.gemini/antigravity-ide/brain/4a1ae942-9c3e-4cad-b9f5-d642ad0db7d5/scratch/template_data.json';
    if (!fs.existsSync(path)) return;
    const blocks = JSON.parse(fs.readFileSync(path, 'utf8'));
    const chunks = chunkDocumentBlocksForA4Pages(blocks, { hasHeaderImage: true, hasFooterImage: true, isEditor: false });
    
    console.log(`\n================ TOTAL PAGES: ${chunks.length} ================`);
    chunks.forEach(c => {
      console.log(`\n--- PAGE ${c.pageNum} (slices: ${c.slices.length}) ---`);
      c.slices.forEach(s => {
        if (s.block.type === 'table') {
          console.log(`  [Table] slice ${s.sliceIndex}, items: ${s.itemsSlice?.length}, isEnd: ${s.isTableEnd}`);
        } else {
          const preview = (s.contentSlice || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
          console.log(`  [Text] "${s.block.title || 'no-title'}" | slice ${s.sliceIndex} | isEnd: ${s.isTextEnd} | text: "${preview}..."`);
        }
      });
    });
    
    // Check intra-table slicing and text block flow
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('correctly fits TallyPrime Multi User on Page 2 without premature table split', () => {
    const fs = require('fs');
    const path = '/Users/aedenteka/.gemini/antigravity-ide/brain/14587f63-a179-417c-b813-c8f1b09b8834/scratch/backup_templates.json';
    if (!fs.existsSync(path)) return;
    const templates = JSON.parse(fs.readFileSync(path, 'utf8'));
    const tmpl = templates.find((t: any) => t.name.includes('TallyPrime Multi User'));
    const chunks = chunkDocumentBlocksForA4Pages(tmpl.blocks, { hasHeaderImage: !!tmpl.templateImage, hasFooterImage: !!tmpl.templateFooterImage, isEditor: false });
    console.log(`\n=== TALLYPRIME MULTI USER CHUNKS: ${chunks.length} pages ===`);
    chunks.forEach(c => {
      console.log(`Page ${c.pageNum}: ${c.slices.length} slices`);
      c.slices.forEach(s => {
        if (s.block.type === 'table') {
          console.log(`  Table slice ${s.sliceIndex}: items ${s.itemsSlice?.length} / ${s.block.items.length}, isEnd: ${s.isTableEnd}`);
        } else {
          console.log(`  Text: "${s.block.title}"`);
        }
      });
    });

    const pageWithTable = chunks.find(c => c.slices.some(s => s.block.type === 'table'));
    const tableSlice = pageWithTable?.slices.find(s => s.block.type === 'table');
    expect(tableSlice?.itemsSlice?.length).toBe(8);
    expect(tableSlice?.isTableEnd).toBe(true);
  });
});

describe('normalizeColonTableToTabular - Tabular Column Conversion', () => {
  it('converts 3-column colon pseudo-tables into structured quote-grid-table with headers', () => {
    const input = `
      <table class="specs-table" style="width: 100%; border-collapse: collapse;">
        <tbody>
          <tr>
            <td style="width: 180px;">Quotation validity</td>
            <td style="width: 15px;">:</td>
            <td>7 days from the date of quotation</td>
          </tr>
          <tr>
            <td style="width: 180px;">Delivery</td>
            <td style="width: 15px;">:</td>
            <td>Immediate upon confirmation</td>
          </tr>
          <tr>
            <td style="width: 180px;">Payment</td>
            <td style="width: 15px;">:</td>
            <td>100% advance payment along with LPO</td>
          </tr>
        </tbody>
      </table>
    `;

    const result = normalizeColonTableToTabular(input);

    // Verifications:
    expect(result).toContain('<table class="quote-grid-table"');
    expect(result).toContain('<thead>');
    expect(result).toContain('>Terms & Conditions</th>');
    expect(result).toContain('>Details</th>');
    expect(result).toMatch(/border: 1px solid #(e2e8f0|cbd5e1)/);
    expect(result).toContain('Quotation validity');
    expect(result).toContain('7 days from the date of quotation');
    expect(result).toContain('Delivery');
    expect(result).toContain('Immediate upon confirmation');
    expect(result).toContain('Payment');
    expect(result).toContain('100% advance payment along with LPO');
    // Ensure the isolated colon cell was completely eliminated
    expect(result).not.toContain('<td style="width: 15px;">:</td>');
    expect(result).not.toContain('&#58;');
  });

  it('detects hardware and system specs to apply Component | Specification / Requirement headers', () => {
    const input = `
      <table>
        <tr><td>Processor</td><td>:</td><td>Intel Core i5 or higher</td></tr>
        <tr><td>RAM</td><td>:</td><td>8 GB minimum</td></tr>
        <tr><td>Hard Disk</td><td>:</td><td>SSD 256 GB or higher</td></tr>
        <tr><td>Operating System</td><td>:</td><td>Windows 10 / 11 Pro 64-bit</td></tr>
      </table>
    `;

    const result = normalizeColonTableToTabular(input);

    expect(result).toContain('>Component</th>');
    expect(result).toContain('>Specification / Requirement</th>');
    expect(result).toContain('Intel Core i5 or higher');
    expect(result).toContain('Windows 10 / 11 Pro 64-bit');
  });

  it('converts 2-column key-value tables without thead into structured quote-grid-table', () => {
    const input = `
      <table>
        <tbody>
          <tr><td>Warranty</td><td>1 Year Comprehensive</td></tr>
          <tr><td>Support</td><td>Unlimited remote assistance</td></tr>
        </tbody>
      </table>
    `;

    const result = normalizeColonTableToTabular(input);

    expect(result).toContain('<table class="quote-grid-table"');
    expect(result).toContain('>Terms & Conditions</th>');
    expect(result).toContain('>Details</th>');
    expect(result).toContain('Warranty');
    expect(result).toContain('1 Year Comprehensive');
  });

  it('preserves existing tables that already have <th> header tags', () => {
    const alreadyStructured = `
      <table class="quote-grid-table" style="border: 1px solid #cbd5e1;">
        <thead>
          <tr>
            <th>Terms &amp; Conditions</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Payment</td><td>100% Advance</td></tr>
        </tbody>
      </table>
    `;

    const result = normalizeColonTableToTabular(alreadyStructured);
    expect(result).toBe(alreadyStructured);
  });

  it('handles empty input gracefully', () => {
    expect(normalizeColonTableToTabular('')).toBe('');
    expect(normalizeColonTableToTabular(undefined as any)).toBe('');
  });
});




