import { describe, it, expect } from 'vitest';
import {
  getCommonDocumentStyles,
  renderCommonDocumentBody,
  buildCustomFontFaces,
  COMMON_GOOGLE_FONTS_URL,
} from '../../../utils/documentStyles';
import { APP_FONT_STACKS } from '../../../utils/fonts';

describe('Common Dynamic Document Typography — Proposals & Emails Parity', () => {
  describe('1. Shared Font Resolution & Custom @font-face Generation', () => {
    it('imports all supported Google fonts in the stylesheet', () => {
      const css = getCommonDocumentStyles();
      expect(css).toContain(`@import url('${COMMON_GOOGLE_FONTS_URL}');`);
      expect(COMMON_GOOGLE_FONTS_URL).toContain('Outfit');
      expect(COMMON_GOOGLE_FONTS_URL).toContain('Plus+Jakarta+Sans');
      expect(COMMON_GOOGLE_FONTS_URL).toContain('Manrope');
      expect(COMMON_GOOGLE_FONTS_URL).toContain('DM+Sans');
      expect(COMMON_GOOGLE_FONTS_URL).toContain('Sora');
    });

    it('dynamically assigns preset font stacks to --font-heading and --font-content', () => {
      const css = getCommonDocumentStyles({
        headingFont: 'sora',
        contentFont: 'jakarta',
      });

      expect(css).toContain(`--font-heading: ${APP_FONT_STACKS.sora};`);
      expect(css).toContain(`--font-content: ${APP_FONT_STACKS.jakarta};`);
    });

    it('generates custom @font-face for uploaded custom fonts and sets them in root variables', () => {
      const customFace = buildCustomFontFaces(
        'custom',
        'custom',
        'CompanyHeadline',
        'CompanyBody',
        'https://example.com/headline.woff2',
        'https://example.com/body.woff2'
      );

      expect(customFace).toContain("@font-face{font-family:'CompanyHeadline';src:url('https://example.com/headline.woff2');");
      expect(customFace).toContain("@font-face{font-family:'CompanyBody';src:url('https://example.com/body.woff2');");

      const fullCss = getCommonDocumentStyles({
        headingFont: 'custom',
        contentFont: 'custom',
        headingFontName: 'CompanyHeadline',
        contentFontName: 'CompanyBody',
        headingFontUrl: 'https://example.com/headline.woff2',
        contentFontUrl: 'https://example.com/body.woff2',
      });

      expect(fullCss).toContain("'CompanyHeadline'");
      expect(fullCss).toContain("'CompanyBody'");
    });
  });

  describe('2. Unified Font Sizes, Line Heights, and Headings', () => {
    it('enforces common base body font-size 0.96rem, line-height 1.6, and color #1e293b', () => {
      const css = getCommonDocumentStyles();

      // Check selectors share common typography
      expect(css).toContain('.rich, .rendered-email-body, .quote-rich-text-content');
      expect(css).toMatch(/font-size:\s*0\.96rem;/);
      expect(css).toMatch(/line-height:\s*1\.6;/);
      expect(css).toMatch(/color:\s*#1e293b;/);
    });

    it('enforces common compact paragraph margins (0 0 6px 0) preventing excessive page gaps', () => {
      const css = getCommonDocumentStyles();
      expect(css).toContain('.rich p, .rendered-email-body p, .quote-rich-text-content p');
      expect(css).toMatch(/margin:\s*0 0 6px 0;/);
    });

    it('enforces common list spacing (margin: 4px 0 8px 22px; li margin-bottom: 3px)', () => {
      const css = getCommonDocumentStyles();
      expect(css).toContain('.rich ul, .rich ol,');
      expect(css).toContain('.rendered-email-body ul, .rendered-email-body ol,');
      expect(css).toMatch(/margin:\s*4px 0 8px 22px;/);
      expect(css).toMatch(/margin-bottom:\s*3px;/);
    });

    it('dynamically adapts heading colors to active brand color without border lines', () => {
      const brand = '#2563eb';
      const css = getCommonDocumentStyles({ brandColor: brand });

      expect(css).toContain(`--brand: ${brand};`);
      expect(css).toContain(`color: ${brand};`);
      expect(css).toContain('border-bottom: none;');
    });
  });

  describe('3. Common Document Markdown Parsing (renderCommonDocumentBody)', () => {
    it('renders # headings into h1 matching dynamic brand color and unified font-size', () => {
      const html = renderCommonDocumentBody('# Welcome Tech Quotation', '#059669');

      expect(html).toContain('<h1 style="color:#059669;font-size:1.35rem;font-weight:800;margin:12px 0 6px 0;line-height:1.25;border-bottom:none;break-after:avoid;page-break-after:avoid;">Welcome Tech Quotation</h1>');
    });

    it('renders ## headings and standalone bold titles **Title** into h2 with brand color', () => {
      const html1 = renderCommonDocumentBody('## Scope of Services', '#7c3aed');
      expect(html1).toContain('<h2 style="color:#7c3aed;font-size:1.2rem;font-weight:800;margin:10px 0 5px 0;line-height:1.25;break-after:avoid;page-break-after:avoid;">Scope of Services</h2>');

      const html2 = renderCommonDocumentBody('**Important Terms**', '#7c3aed');
      expect(html2).toContain('<h2 style="color:#7c3aed;font-size:1.2rem;font-weight:800;margin:10px 0 5px 0;line-height:1.25;break-after:avoid;page-break-after:avoid;">Important Terms</h2>');
    });

    it('renders bullet points into compact semantic <ul><li> structures', () => {
      const raw = `
• Hardware Maintenance & Diagnostics
• Network Support
• Annual Firmware Updates
      `;
      const html = renderCommonDocumentBody(raw);

      expect(html).toContain('<ul style="margin:4px 0 8px 22px;padding:0;list-style-type:disc;">');
      expect(html).toContain('<li style="margin-bottom:3px;line-height:1.55;break-inside:avoid;page-break-inside:avoid;">Hardware Maintenance & Diagnostics</li>');
      expect(html).toContain('</ul>');
    });

    it('wraps paragraphs in compact 6px bottom margin avoiding bloated whitespace in PDF sheets', () => {
      const raw = `Paragraph one text.\n\nParagraph two text.`;
      const html = renderCommonDocumentBody(raw);

      expect(html).toContain('<p style="margin:0 0 6px 0;line-height:1.55;break-inside:auto;page-break-inside:auto;">Paragraph one text.</p>');
      expect(html).toContain('<p style="margin:0 0 6px 0;line-height:1.55;break-inside:auto;page-break-inside:auto;">Paragraph two text.</p>');
    });

    it('renders dynamic merge tags with monospace styling and brand color', () => {
      const raw = `Dear {{customer_name}}, your proposal #{{proposal_no}} is ready.`;
      const html = renderCommonDocumentBody(raw, '#4f46e5');

      expect(html).toContain('{{customer_name}}');
      expect(html).toContain('font-family:monospace');
      expect(html).toContain('color:#4f46e5');
    });
  });

  describe('4. Cross-Document Parity between Proposals & Emails', () => {
    it('applies the exact same CSS selector groupings across .rich (Proposal) and .rendered-email-body (Email)', () => {
      const css = getCommonDocumentStyles({ brandColor: '#d97706' });

      // Selector parity
      expect(css).toContain('.rich, .rich :not([style*="font-family"]):not(font[face]),\n    .rendered-email-body, .rendered-email-body :not([style*="font-family"]):not(font[face])');
      expect(css).toContain('.rich h1, .rich h2, .rich h3, .rich h4,\n    .rendered-email-body h1, .rendered-email-body h2, .rendered-email-body h3, .rendered-email-body h4');
      expect(css).toContain('.rich ul, .rich ol,\n    .rendered-email-body ul, .rendered-email-body ol');
      expect(css).toContain('.rich li,\n    .rendered-email-body li');
      expect(css).toContain('.rich strong, .rich b,\n    .rendered-email-body strong, .rendered-email-body b');
      expect(css).toContain('.rich blockquote,\n    .rendered-email-body blockquote');
    });
  });
});
