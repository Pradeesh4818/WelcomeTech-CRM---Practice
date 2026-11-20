import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Quotation Generator Break Button Alignment & Nowrap Parity', () => {
  const quotationGeneratorPath = path.resolve(__dirname, '../QuotationGeneratorPage.tsx');
  const sourceCode = fs.readFileSync(quotationGeneratorPath, 'utf8');

  it('TC-BREAK-01: Section header A4 Break button uses quote-tool-btn-text with whiteSpace nowrap and height 28', () => {
    // Check section header A4 Break button uses quote-tool-btn-text
    expect(sourceCode).toContain('className="quote-tool-btn-text"');
    // Ensure the section header page break button has whiteSpace nowrap
    const sectionBreakMatch = sourceCode.match(/onTogglePageBreak\(block\.id\)[^>]*style=\{([^}]+)\}/s);
    expect(sectionBreakMatch).toBeTruthy();
    expect(sectionBreakMatch![1]).toContain("whiteSpace: 'nowrap'");
    expect(sectionBreakMatch![1]).toContain('height: 28');
  });

  it('TC-BREAK-02: Editor ribbon Page Break button uses quote-tool-btn-text with whiteSpace nowrap and height 28', () => {
    // Check rich text editor toolbar page break button
    const pageBreakMatch = sourceCode.match(/title="Insert Page Break[\s\S]*?style=\{\{([\s\S]*?)\}\}/);
    expect(pageBreakMatch).toBeTruthy();
    expect(pageBreakMatch![1]).toContain("whiteSpace: 'nowrap'");
    expect(pageBreakMatch![1]).toContain('height: 28');
  });

  it('TC-BREAK-03: Table section header A4 Break button uses quote-tool-btn-text with whiteSpace nowrap', () => {
    const tableBreakMatch = sourceCode.match(/handleTogglePageBreak\(block\.id\)[^>]*style=\{([^}]+)\}/s);
    expect(tableBreakMatch).toBeTruthy();
    expect(tableBreakMatch![1]).toContain("whiteSpace: 'nowrap'");
    expect(tableBreakMatch![1]).toContain('height: 28');
  });

  it('TC-BREAK-04: CSS rules ensure quote-tool-btn-text has white-space nowrap and flex-shrink 0', () => {
    expect(sourceCode).toMatch(/\.quote-tool-btn-text\s*\{[^}]*white-space:\s*nowrap/);
    expect(sourceCode).toMatch(/\.quote-tool-btn-text\s*\{[^}]*flex-shrink:\s*0/);
  });
});
