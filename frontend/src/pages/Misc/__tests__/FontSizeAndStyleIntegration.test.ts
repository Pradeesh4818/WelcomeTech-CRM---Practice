import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Typography Suite: Font Size & Font Style (Family) Theme-Based Dropdown Integration', () => {
  const quotationGeneratorPath = path.resolve(__dirname, '../QuotationGeneratorPage.tsx');
  const emailTemplatesPath = path.resolve(__dirname, '../EmailTemplatesPage.tsx');

  const quotationCode = fs.readFileSync(quotationGeneratorPath, 'utf-8');
  const emailTemplatesCode = fs.readFileSync(emailTemplatesPath, 'utf-8');

  describe('Module 1: Proposal Section Editor (QuotationGeneratorPage)', () => {
    it('TC-PROP-TYPO-01: defines FONT_SIZE_OPTIONS and FONT_STYLE_OPTIONS constant lists', () => {
      expect(quotationCode).toContain('const FONT_SIZE_OPTIONS');
      expect(quotationCode).toContain('const FONT_STYLE_OPTIONS');
      expect(quotationCode).toContain("'8pt'");
      expect(quotationCode).toContain("'12pt'");
      expect(quotationCode).toContain("'36pt'");
      expect(quotationCode).toContain("'Default'");
      expect(quotationCode).toContain("'Arial'");
      expect(quotationCode).toContain("'Times New Roman'");
      expect(quotationCode).toContain("'Georgia'");
    });

    it('TC-PROP-TYPO-02: integrates theme-based Font Style dropdown in the toolbar', () => {
      expect(quotationCode).toContain('ref={fontStyleMenuRef}');
      expect(quotationCode).toContain('selectedFontStyleLabel');
      expect(quotationCode).toContain('handleFontStyleSelect');
      expect(quotationCode).toContain('FONT_STYLE_OPTIONS.map');
      expect(quotationCode).toContain("document.execCommand('fontName', false, value)");
    });

    it('TC-PROP-TYPO-03: integrates theme-based Font Size dropdown in the toolbar', () => {
      expect(quotationCode).toContain('ref={fontSizeMenuRef}');
      expect(quotationCode).toContain('selectedFontSizeLabel');
      expect(quotationCode).toContain('handleFontSizeSelect');
      expect(quotationCode).toContain('FONT_SIZE_OPTIONS.map');
      expect(quotationCode).toContain("document.execCommand('fontSize', false, value)");
    });

    it('TC-PROP-TYPO-04: tracks active selection styles dynamically on cursor movement and input', () => {
      expect(quotationCode).toContain('detectSelectionStyles');
      expect(quotationCode).toContain('setSelectedFontSizeLabel');
      expect(quotationCode).toContain('setSelectedFontStyleLabel');
      expect(quotationCode).toContain('onKeyUp={() => {');
      expect(quotationCode).toContain('onMouseUp={(e) => {');
      expect(quotationCode).toContain('onSelect={() => {');
    });

    it('TC-PROP-TYPO-05: provides CSS rules for font[face] and font[size] so custom typography renders visibly', () => {
      expect(quotationCode).toContain('font[face*="Garamond"]');
      expect(quotationCode).toContain('font[face*="Arial"]');
      expect(quotationCode).toContain('font[size="2"]');
    });
  });

  describe('Module 2: Email Templates Visual Editor (EmailTemplatesPage)', () => {
    it('TC-EMAIL-TYPO-01: defines FONT_SIZE_OPTIONS and FONT_STYLE_OPTIONS constant lists', () => {
      expect(emailTemplatesCode).toContain('const FONT_SIZE_OPTIONS');
      expect(emailTemplatesCode).toContain('const FONT_STYLE_OPTIONS');
      expect(emailTemplatesCode).toContain("'8pt'");
      expect(emailTemplatesCode).toContain("'12pt'");
      expect(emailTemplatesCode).toContain("'36pt'");
      expect(emailTemplatesCode).toContain("'Default'");
      expect(emailTemplatesCode).toContain("'Arial'");
      expect(emailTemplatesCode).toContain("'Georgia'");
      expect(emailTemplatesCode).toContain("'Courier New'");
    });

    it('TC-EMAIL-TYPO-02: integrates theme-based Font Style dropdown in the visual editor toolbar', () => {
      expect(emailTemplatesCode).toContain('ref={fontStyleMenuRef}');
      expect(emailTemplatesCode).toContain('selectedFontStyleLabel');
      expect(emailTemplatesCode).toContain('handleFontStyleSelect');
      expect(emailTemplatesCode).toContain('FONT_STYLE_OPTIONS.map');
      expect(emailTemplatesCode).toContain("document.execCommand('fontName', false, value)");
    });

    it('TC-EMAIL-TYPO-03: integrates theme-based Font Size dropdown in the visual editor toolbar', () => {
      expect(emailTemplatesCode).toContain('ref={fontSizeMenuRef}');
      expect(emailTemplatesCode).toContain('selectedFontSizeLabel');
      expect(emailTemplatesCode).toContain('handleFontSizeSelect');
      expect(emailTemplatesCode).toContain('FONT_SIZE_OPTIONS.map');
      expect(emailTemplatesCode).toContain("document.execCommand('fontSize', false, value)");
    });

    it('TC-EMAIL-TYPO-04: tracks active selection styles on visual editor events', () => {
      expect(emailTemplatesCode).toContain('detectSelectionStyles');
      expect(emailTemplatesCode).toContain('setSelectedFontSizeLabel');
      expect(emailTemplatesCode).toContain('setSelectedFontStyleLabel');
      expect(emailTemplatesCode).toContain('onKeyUp={() => {');
      expect(emailTemplatesCode).toContain('onMouseUp={() => {');
      expect(emailTemplatesCode).toContain('onSelect={() => {');
    });

    it('TC-EMAIL-TYPO-05: provides scoped CSS rules for email template editor font[face] and font[size]', () => {
      expect(emailTemplatesCode).toContain('.wt-editor-scroll-area font[face*="Garamond"]');
      expect(emailTemplatesCode).toContain('.wt-editor-scroll-area font[size="2"]');
    });
  });
});

