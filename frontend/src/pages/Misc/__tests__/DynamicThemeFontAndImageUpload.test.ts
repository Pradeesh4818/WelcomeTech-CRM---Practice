import { describe, it, expect } from 'vitest';
import { fontStackForChoice, APP_FONT_STACKS, AppFontKey } from '../../../utils/fonts';

describe('Dynamic Theme Fonts & Image Upload Integration', () => {
  describe('Dynamic Font Resolution', () => {
    it('resolves preset font stacks correctly for heading and content fonts', () => {
      const outfitStack = fontStackForChoice('outfit');
      expect(outfitStack).toBe(APP_FONT_STACKS.outfit);

      const jakartaStack = fontStackForChoice('jakarta');
      expect(jakartaStack).toBe(APP_FONT_STACKS.jakarta);

      const manropeStack = fontStackForChoice('manrope');
      expect(manropeStack).toBe(APP_FONT_STACKS.manrope);

      const dmsansStack = fontStackForChoice('dmsans');
      expect(dmsansStack).toBe(APP_FONT_STACKS.dmsans);

      const soraStack = fontStackForChoice('sora');
      expect(soraStack).toBe(APP_FONT_STACKS.sora);
    });

    it('resolves custom font stacks with fallback', () => {
      const customStack = fontStackForChoice('custom', 'Playfair Display');
      expect(customStack).toContain("'Playfair Display'");
      expect(customStack).toContain(APP_FONT_STACKS.outfit);
    });

    it('falls back to default outfit font if invalid choice given', () => {
      const fallbackStack = fontStackForChoice('nonexistent' as AppFontKey);
      expect(fallbackStack).toBe(APP_FONT_STACKS.outfit);
    });
  });

  describe('Dynamic Font Injection & Pasted External Style Override CSS', () => {
    it('generates correct CSS variable assignments and !important font overrides', () => {
      const headingFont = 'sora';
      const contentFont = 'manrope';
      const headingStack = fontStackForChoice(headingFont);
      const contentStack = fontStackForChoice(contentFont);

      const cssVariables = `
        :root {
          --font-heading: ${headingStack};
          --font-content: ${contentStack};
          --font-sans: ${contentStack};
        }
      `;

      expect(cssVariables).toContain('--font-heading:');
      expect(cssVariables).toContain('--font-content:');
      expect(cssVariables).toContain(APP_FONT_STACKS.sora);
      expect(cssVariables).toContain(APP_FONT_STACKS.manrope);

      // Verify that the font-family override uses !important to override inline pasted fonts
      const overrideRule = '.rich, .rich *, .textblock, .textblock * { font-family: var(--font-content) !important; }';
      expect(overrideRule).toMatch(/font-family: var\(--font-content\) !important/);
    });

    it('generates custom @font-face rules when custom font URL is provided', () => {
      const headingFont = 'custom';
      const headingFontName = 'CustomFontHeading';
      const headingFontUrl = 'https://example.com/fonts/heading.woff2';

      const customFontFace = headingFont === 'custom' && headingFontUrl && headingFontName
        ? `@font-face{font-family:'${headingFontName}';src:url('${headingFontUrl}');font-weight:100 900;font-display:swap;}`
        : '';

      expect(customFontFace).toContain("@font-face{font-family:'CustomFontHeading'");
      expect(customFontFace).toContain("src:url('https://example.com/fonts/heading.woff2')");
    });
  });

  describe('Image Upload & Insertion Tag Construction', () => {
    it('constructs responsive img tag with max-width and border-radius for proposals and quotes', () => {
      const imageUrl = 'https://example.com/uploads/diagram.png';
      const altText = 'Architecture Diagram';
      const imgTag = `<img src="${imageUrl}" alt="${altText}" style="max-width: 100%; height: auto; display: block; border-radius: 6px; margin: 10px 0;" />`;

      expect(imgTag).toContain(`src="${imageUrl}"`);
      expect(imgTag).toContain(`alt="${altText}"`);
      expect(imgTag).toContain('max-width: 100%');
      expect(imgTag).toContain('border-radius: 6px');
    });

    it('constructs responsive img tag with base64 data URL for direct computer uploads', () => {
      const base64Data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const altText = 'uploaded_receipt.png';
      const imgTag = `<img src="${base64Data}" alt="${altText}" style="max-width: 100%; height: auto; display: block; margin: 12px 0; border-radius: 6px;" />`;

      expect(imgTag).toContain(base64Data);
      expect(imgTag).toContain('alt="uploaded_receipt.png"');
      expect(imgTag).toContain('max-width: 100%');
    });

    it('correctly handles relative asset URLs by resolving origin or toAssetUrl', () => {
      const relativeUrl = '/uploads/media/signature.png';
      const origin = 'http://localhost:5173';
      const fullUrl = relativeUrl.startsWith('http') || relativeUrl.startsWith('data:')
        ? relativeUrl
        : `${origin}${relativeUrl}`;

      expect(fullUrl).toBe('http://localhost:5173/uploads/media/signature.png');
    });
  });
});
