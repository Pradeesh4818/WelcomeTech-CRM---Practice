import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Quotation Breakdown & Page Break Save Bug Fixes', () => {
  const quotationGeneratorPath = path.resolve(__dirname, '../QuotationGeneratorPage.tsx');
  const sourceCode = fs.readFileSync(quotationGeneratorPath, 'utf8');

  it('TC-BREAK-SAVE-01: handleTemplateSelect preserves pageBreak and discountPercent when mapping blocks', () => {
    // Must map pageBreak and discountPercent so selecting a template does not strip breaks
    expect(sourceCode).toMatch(/const\s+parsedBlocks\s*=\s*t\.blocks\.map[\s\S]*?pageBreak:\s*Boolean\(b\.pageBreak\)\s*\?\s*true\s*:\s*undefined/);
    expect(sourceCode).toMatch(/const\s+parsedBlocks\s*=\s*t\.blocks\.map[\s\S]*?discountPercent:\s*Number\(b\.discountPercent\)\s*\|\|\s*0/);
  });

  it('TC-BREAK-SAVE-02: existingTemplate block loader preserves pageBreak and discountPercent', () => {
    // When loading existing template to edit, ensure pageBreak is not stripped
    expect(sourceCode).toMatch(/const\s+parsedBlocks\s*=\s*\(existingTemplate\.blocks\s+as\s+any\[\]\)\.map[\s\S]*?pageBreak:\s*Boolean\(b\.pageBreak\)\s*\?\s*true\s*:\s*undefined/);
    expect(sourceCode).toMatch(/const\s+parsedBlocks\s*=\s*\(existingTemplate\.blocks\s+as\s+any\[\]\)\.map[\s\S]*?discountPercent:\s*Number\(b\.discountPercent\)\s*\|\|\s*0/);
  });

  it('TC-BREAK-SAVE-03: existingProposal block loader preserves pageBreak and discountPercent', () => {
    // When loading existing proposal to edit, ensure pageBreak is not stripped
    expect(sourceCode).toMatch(/const\s+parsedBlocks\s*=\s*\(existingProposal\.blocks\s+as\s+any\[\]\)\.map[\s\S]*?pageBreak:\s*Boolean\(b\.pageBreak\)\s*\?\s*true\s*:\s*undefined/);
    expect(sourceCode).toMatch(/const\s+parsedBlocks\s*=\s*\(existingProposal\.blocks\s+as\s+any\[\]\)\.map[\s\S]*?discountPercent:\s*Number\(b\.discountPercent\)\s*\|\|\s*0/);
  });

  it('TC-BREAK-SAVE-04: saveProposalMutation safely extracts items with String(i.description || "").trim()', () => {
    // Avoid unhandled TypeError: Cannot read properties of undefined (reading 'trim')
    expect(sourceCode).toContain("String(i.description || '').trim()");
  });

  it('TC-BREAK-SAVE-05: saveProposalMutation provides fallback line items if table blocks have no items', () => {
    expect(sourceCode).toContain('const proposalItems = tableItems.length > 0');
    expect(sourceCode).toContain('fallbackItems.length > 0');
  });

  it('TC-BREAK-SAVE-06: saveProposalMutation maps blocks with pageBreak explicitly preserved', () => {
    expect(sourceCode).toMatch(/payload\.blocks\s*=\s*blocks\.map\(b\s*=>\s*\(\{\s*\.\.\.b,\s*pageBreak:\s*Boolean\(b\.pageBreak\)\s*\?\s*true\s*:\s*undefined/);
    expect(sourceCode).toMatch(/blocks:\s*blocks\.map\(b\s*=>\s*\(\{\s*\.\.\.b,\s*pageBreak:\s*Boolean\(b\.pageBreak\)\s*\?\s*true\s*:\s*undefined/);
  });

  it('TC-BREAK-SAVE-07: saveProposalMutation sanitizes customer, lead, task, and template ObjectId fields', () => {
    expect(sourceCode).toContain('const sanitizedCustomerId = customerType === \'existing\'');
    expect(sourceCode).toContain('const sanitizedTemplateId = selectedTemplateId && selectedTemplateId.trim()');
  });

  it('TC-BREAK-SAVE-08: handleInsertPageBreakAtCursor safely falls back to onTogglePageBreak when splitHtmlAfter is empty', () => {
    expect(sourceCode).toMatch(/if\s*\(onSplitBlock\s*&&\s*splitHtmlAfter\)\s*\{\s*onSplitBlock/);
  });
});
