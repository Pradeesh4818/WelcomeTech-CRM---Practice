import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  chunkDocumentBlocksForA4Pages,
  splitHtmlBlocks,
  estimateUnitHeight,
  isBlankLineUnit,
} from '../../../utils/quotationHelpers';
import { cleanWordArtifacts } from '../../../utils/documentStyles';

describe('Quotation Page Break & Multi-Page Overflow Verification', () => {
  const quotationGeneratorPath = path.resolve(__dirname, '../QuotationGeneratorPage.tsx');
  const sourceCode = fs.readFileSync(quotationGeneratorPath, 'utf8');

  it('TC-PAGEBREAK-01: handleInsertPageBreakAtCursor inspects savedSelectionRef as well as window.getSelection', () => {
    expect(sourceCode).toContain('savedSelectionRef.current && contentRef.current.contains(savedSelectionRef.current.commonAncestorContainer)');
  });

  it('TC-PAGEBREAK-02: handleInsertPageBreakAtCursor handles end-of-block cursor without silently ignoring', () => {
    expect(sourceCode).toMatch(/if\s*\(!splitHtmlAfter\s*&&\s*\(range\s*\|\|\s*!contentRef\.current\.innerHTML\.trim\(\)\)\)\s*\{\s*splitHtmlAfter\s*=\s*'<p><br><\/p>';\s*\}/);
  });

  it('TC-PAGEBREAK-03: cleanWordArtifacts preserves consecutive empty lines and paragraphs', () => {
    const raw = '<p>Line 1</p><p><br></p><p><br></p><p><br></p><p>Line 2</p>';
    const cleaned = cleanWordArtifacts(raw);
    const emptyCount = (cleaned.match(/<p><br><\/p>/g) || []).length;
    expect(emptyCount).toBe(3);
  });

  it('TC-PAGEBREAK-04: isBlankLineUnit correctly identifies empty paragraphs with spaces, breaks, and non-breaking spaces', () => {
    expect(isBlankLineUnit('<p><br></p>')).toBe(true);
    expect(isBlankLineUnit('<div><br></div>')).toBe(true);
    expect(isBlankLineUnit('<p>&nbsp;&nbsp;</p>')).toBe(true);
    expect(isBlankLineUnit('<p>   </p>')).toBe(true);
    expect(isBlankLineUnit('<p>Text</p>')).toBe(false);
  });

  it('TC-PAGEBREAK-05: estimateUnitHeight gives realistic line height (>=24px) for empty lines instead of 4px', () => {
    expect(estimateUnitHeight('<p><br></p>')).toBeGreaterThanOrEqual(24);
    expect(estimateUnitHeight('<p>&nbsp;</p>')).toBeGreaterThanOrEqual(24);
    expect(estimateUnitHeight('<p><br><br></p>')).toBeGreaterThanOrEqual(48);
  });

  it('TC-PAGEBREAK-06: splitHtmlBlocks preserves empty lines between sections', () => {
    const raw = '<p>Intro</p><p><br></p><p><br></p><p><br></p><p>Conclusion</p>';
    const units = splitHtmlBlocks(raw);
    expect(units.length).toBe(5);
    expect(units[0]).toBe('<p>Intro</p>');
    expect(units[1]).toBe('<p><br></p>');
    expect(units[2]).toBe('<p><br></p>');
    expect(units[3]).toBe('<p><br></p>');
    expect(units[4]).toBe('<p>Conclusion</p>');
  });

  it('TC-PAGEBREAK-07: chunkDocumentBlocksForA4Pages cleanly slices overflowing text onto Page 2 when blank lines push content past A4 limit', () => {
    const emptyLines = Array.from({ length: 12 }, () => '<p><br></p>').join('\n');
    const content = `<p>Warm greetings from Welcome Trading Co. W.L.L. , Qatar.</p>
<p>Welcome Trading Co. W.L.L. is a trusted business technology solutions provider in Qatar, helping organizations simplify their business operations through reliable software, cloud, ERP, CRM, web, and IT solutions.</p>
<p>As a Tally Authorized Gold Partner , we bring extensive industry experience and practical expertise in accounting software implementation, customization, integration, cloud solutions, and technical support. Beyond Tally, our technology portfolio enables businesses to manage, automate, and digitally transform their day-to-day operations through integrated solutions.</p>
<p>Our approach is simple — understand your business requirements, recommend the right technology, implement it efficiently, and provide dependable ongoing support.</p>
<p><strong>Our Core Technology Solutions</strong></p>
${emptyLines}
<p><strong>TallyPrime Accounting &amp; ERP Solutions</strong></p>
<ul>
<li>TallyPrime on Cloud</li>
<li>Tally Customization &amp; Integration</li>
<li>Tally AMC &amp; Technical Support</li>
<li>CRM Solutions &amp; Development</li>
<li>Website &amp; Web Application Development</li>
<li>Digital Marketing Solutions</li>
<li>Barcode &amp; Inventory Management Solutions</li>
</ul>`;

    const blocks = [{ id: 'sec1', type: 'text', title: 'SECTION 01', content }];
    const pages = chunkDocumentBlocksForA4Pages(blocks, {
      hasHeaderImage: false,
      hasFooterImage: false,
      isEditor: false,
      honorPageBreaks: true
    });

    expect(pages.length).toBe(2);
    expect(pages[0].pageNum).toBe(1);
    expect(pages[1].pageNum).toBe(2);
    // Page 2 contains the continuation with TallyPrime solutions
    const p2Text = (pages[1].slices[0].contentSlice || '');
    expect(p2Text).toContain('TallyPrime Accounting');
  });
});
