import { FontChoice, fontStackForChoice } from './fonts';

export const COMMON_GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@400;500;600;700;800&display=swap';

export interface CommonDocumentStyleOptions {
  headingFont?: FontChoice;
  contentFont?: FontChoice;
  headingFontName?: string;
  contentFontName?: string;
  headingFontUrl?: string;
  contentFontUrl?: string;
  brandColor?: string;
}

export const buildCustomFontFaces = (
  headingFont?: FontChoice,
  contentFont?: FontChoice,
  headingFontName?: string,
  contentFontName?: string,
  headingFontUrl?: string,
  contentFontUrl?: string
): string => {
  return [
    headingFont === 'custom' && headingFontUrl && headingFontName
      ? `@font-face{font-family:'${headingFontName}';src:url('${headingFontUrl}');font-weight:100 900;font-display:swap;}`
      : '',
    contentFont === 'custom' && contentFontUrl && contentFontName
      ? `@font-face{font-family:'${contentFontName}';src:url('${contentFontUrl}');font-weight:100 900;font-display:swap;}`
      : '',
  ]
    .filter(Boolean)
    .join('');
};

/**
 * Returns the unified dynamic document typography CSS rules
 * shared across Proposal PDFs, Email Template PDFs, and on-screen views.
 */
export const getCommonDocumentStyles = (options: CommonDocumentStyleOptions = {}): string => {
  const {
    headingFont = 'outfit',
    contentFont = 'outfit',
    headingFontName = '',
    contentFontName = '',
    headingFontUrl = '',
    contentFontUrl = '',
    brandColor = '#6d28d9',
  } = options;

  const headingStack = fontStackForChoice(headingFont, headingFontName);
  const contentStack = fontStackForChoice(contentFont, contentFontName);
  const customFontFaces = buildCustomFontFaces(
    headingFont,
    contentFont,
    headingFontName,
    contentFontName,
    headingFontUrl,
    contentFontUrl
  );

  return `
    @import url('${COMMON_GOOGLE_FONTS_URL}');
    ${customFontFaces}
    @page {
      size: A4 portrait;
      margin: 0;
    }
    :root {
      --font-heading: ${headingStack};
      --font-content: ${contentStack};
      --font-sans: ${contentStack};
      --brand: ${brandColor};
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      font-family: ${contentStack};
      color: #1e293b;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    h1, h2, h3, h4, h5, h6, th,
    .textblock-title, .co-name, .qtitle h2, .head-title, .meta-card-header {
      font-family: ${headingStack} !important;
    }
    .rich, .rich :not([style*="font-family"]):not(font[face]),
    .rendered-email-body, .rendered-email-body :not([style*="font-family"]):not(font[face]),
    .quote-rich-text-content, .quote-rich-text-content :not([style*="font-family"]):not(font[face]),
    .textblock, .textblock :not([style*="font-family"]):not(font[face]) {
      font-family: ${contentStack};
    }

    /* ── Typography & Font Size Presets ────────────────────────── */
    font[size="1"], [style*="font-size: 8pt"], [style*="font-size:8pt"] { font-size: 8pt !important; line-height: 1.35 !important; }
    font[size="2"], [style*="font-size: 10pt"], [style*="font-size:10pt"] { font-size: 10pt !important; line-height: 1.45 !important; }
    font[size="3"], [style*="font-size: 12pt"], [style*="font-size:12pt"] { font-size: 12pt !important; line-height: 1.55 !important; }
    font[size="4"], [style*="font-size: 14pt"], [style*="font-size:14pt"] { font-size: 14pt !important; line-height: 1.55 !important; }
    font[size="5"], [style*="font-size: 18pt"], [style*="font-size:18pt"] { font-size: 18pt !important; line-height: 1.45 !important; }
    font[size="6"], [style*="font-size: 24pt"], [style*="font-size:24pt"] { font-size: 24pt !important; line-height: 1.35 !important; }
    font[size="7"], [style*="font-size: 36pt"], [style*="font-size:36pt"] { font-size: 36pt !important; line-height: 1.25 !important; }

    /* ── Typography & Font Family Presets ──────────────────────── */
    font[face*="Arial"], [style*="Arial"] { font-family: Arial, Helvetica, sans-serif !important; }
    font[face*="Georgia"], [style*="Georgia"] { font-family: Georgia, serif !important; }
    font[face*="Times"], [style*="Times"] { font-family: "Times New Roman", Times, serif !important; }
    font[face*="Garamond"], [style*="Garamond"] { font-family: Garamond, "EB Garamond", Georgia, serif !important; }
    font[face*="Tahoma"], [style*="Tahoma"] { font-family: Tahoma, Verdana, sans-serif !important; }
    font[face*="Trebuchet"], [style*="Trebuchet"] { font-family: "Trebuchet MS", "Lucida Grande", sans-serif !important; }
    font[face*="Verdana"], [style*="Verdana"] { font-family: Verdana, Geneva, sans-serif !important; }
    font[face*="Courier"], [style*="Courier"] { font-family: "Courier New", Courier, monospace !important; }
    .rich h1, .rich h2, .rich h3, .rich h4,
    .rendered-email-body h1, .rendered-email-body h2, .rendered-email-body h3, .rendered-email-body h4,
    .quote-rich-text-content h1, .quote-rich-text-content h2, .quote-rich-text-content h3, .quote-rich-text-content h4 {
      font-family: ${headingStack} !important;
      break-after: avoid;
      page-break-after: avoid;
    }
    .rich, .rendered-email-body, .quote-rich-text-content {
      font-size: 0.96rem;
      line-height: 1.6;
      color: #1e293b;
    }
    [align="left"], [style*="text-align: left"], [style*="text-align:left"], .text-left { text-align: left !important; }
    [align="center"], [style*="text-align: center"], [style*="text-align:center"], .text-center { text-align: center !important; }
    [align="right"], [style*="text-align: right"], [style*="text-align:right"], .text-right { text-align: right !important; }
    [align="justify"], [style*="text-align: justify"], [style*="text-align:justify"], .text-justify { text-align: justify !important; }
    .rich p, .rendered-email-body p, .quote-rich-text-content p {
      margin: 0 0 6px 0;
      line-height: 1.6;
      break-inside: auto;
      page-break-inside: auto;
    }
    .rich div, .rendered-email-body div, .quote-rich-text-content div {
      margin: 0 0 3px 0;
      line-height: 1.6;
      break-inside: auto;
      page-break-inside: auto;
    }
    .rich h1, .rendered-email-body h1, .quote-rich-text-content h1 {
      font-size: 1.35rem;
      font-weight: 800;
      color: ${brandColor};
      margin: 12px 0 6px 0;
      line-height: 1.25;
      border-bottom: none;
    }
    .rich h2, .rendered-email-body h2, .quote-rich-text-content h2 {
      font-size: 1.2rem;
      font-weight: 800;
      color: ${brandColor};
      margin: 10px 0 5px 0;
      line-height: 1.25;
    }
    .rich h3, .rendered-email-body h3, .quote-rich-text-content h3 {
      font-size: 1.05rem;
      font-weight: 700;
      color: #0f172a;
      margin: 8px 0 4px 0;
      line-height: 1.3;
    }
    .rich h4, .rendered-email-body h4, .quote-rich-text-content h4 {
      font-size: 0.95rem;
      font-weight: 700;
      color: #334155;
      margin: 6px 0 3px 0;
      line-height: 1.3;
    }
    .rich strong, .rich b,
    .rendered-email-body strong, .rendered-email-body b,
    .quote-rich-text-content strong, .quote-rich-text-content b {
      color: #0f172a;
      font-weight: 800;
    }
    .rich ul, .rich ol,
    .rendered-email-body ul, .rendered-email-body ol,
    .quote-rich-text-content ul, .quote-rich-text-content ol {
      margin: 4px 0 8px 22px;
      padding: 0;
      break-inside: auto;
      page-break-inside: auto;
    }
    .rich li,
    .rendered-email-body li,
    .quote-rich-text-content li {
      margin-bottom: 3px;
      line-height: 1.6;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .rich blockquote,
    .rendered-email-body blockquote,
    .quote-rich-text-content blockquote {
      border-left: 3px solid ${brandColor};
      padding: 4px 12px;
      margin: 6px 0;
      color: #475569;
      font-style: italic;
      background: rgba(0,0,0,0.02);
      border-radius: 0 6px 6px 0;
    }
    .rich table,
    .rendered-email-body table,
    .quote-rich-text-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
    }
    /* ── Tabular Column Tables (quote-grid-table) ── */
    .rich table.quote-grid-table,
    .rendered-email-body table.quote-grid-table,
    .quote-rich-text-content table.quote-grid-table,
    table.quote-grid-table,
    .rich table:not(.specs-table):not([data-type="specs"]),
    .rendered-email-body table:not(.specs-table):not([data-type="specs"]),
    .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) {
      width: 100% !important;
      border-collapse: separate !important;
      border-spacing: 0 !important;
      margin: 12px 0 !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 8px !important;
      overflow: hidden !important;
      background: #ffffff !important;
    }
    .rich table.quote-grid-table th,
    .rendered-email-body table.quote-grid-table th,
    .quote-rich-text-content table.quote-grid-table th,
    table.quote-grid-table th,
    .rich table:not(.specs-table):not([data-type="specs"]) th,
    .rendered-email-body table:not(.specs-table):not([data-type="specs"]) th,
    .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) th {
      background: ${brandColor} !important;
      border: none !important;
      border-left: none !important;
      border-right: none !important;
      border-top: none !important;
      border-bottom: none !important;
      padding: 10px 14px !important;
      font-weight: 800 !important;
      color: #ffffff !important;
      text-align: left !important;
      text-transform: uppercase !important;
      letter-spacing: 0.05em !important;
      font-size: 11px !important;
      line-height: 1.4 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .rich table.quote-grid-table th:first-child,
    .rendered-email-body table.quote-grid-table th:first-child,
    .quote-rich-text-content table.quote-grid-table th:first-child,
    table.quote-grid-table th:first-child,
    .rich table:not(.specs-table):not([data-type="specs"]) th:first-child,
    .rendered-email-body table:not(.specs-table):not([data-type="specs"]) th:first-child,
    .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) th:first-child {
      border-top-left-radius: 7px !important;
    }
    .rich table.quote-grid-table th:last-child,
    .rendered-email-body table.quote-grid-table th:last-child,
    .quote-rich-text-content table.quote-grid-table th:last-child,
    table.quote-grid-table th:last-child,
    .rich table:not(.specs-table):not([data-type="specs"]) th:last-child,
    .rendered-email-body table:not(.specs-table):not([data-type="specs"]) th:last-child,
    .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) th:last-child {
      border-top-right-radius: 7px !important;
    }
    .rich table.quote-grid-table td,
    .rendered-email-body table.quote-grid-table td,
    .quote-rich-text-content table.quote-grid-table td,
    table.quote-grid-table td,
    .rich table:not(.specs-table):not([data-type="specs"]) td,
    .rendered-email-body table:not(.specs-table):not([data-type="specs"]) td,
    .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) td {
      border: none !important;
      border-bottom: 1px solid #e2e8f0 !important;
      padding: 10px 14px !important;
      font-size: 10pt !important;
      line-height: 1.5 !important;
      color: #0f172a !important;
      vertical-align: top !important;
    }
    .rich table.quote-grid-table tr:last-child td,
    .rendered-email-body table.quote-grid-table tr:last-child td,
    .quote-rich-text-content table.quote-grid-table tr:last-child td,
    table.quote-grid-table tr:last-child td,
    .rich table:not(.specs-table):not([data-type="specs"]) tr:last-child td,
    .rendered-email-body table:not(.specs-table):not([data-type="specs"]) tr:last-child td,
    .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) tr:last-child td {
      border-bottom: none !important;
    }
    .rich table.quote-grid-table tr:last-child td:first-child,
    .rendered-email-body table.quote-grid-table tr:last-child td:first-child,
    .quote-rich-text-content table.quote-grid-table tr:last-child td:first-child,
    table.quote-grid-table tr:last-child td:first-child,
    .rich table:not(.specs-table):not([data-type="specs"]) tr:last-child td:first-child,
    .rendered-email-body table:not(.specs-table):not([data-type="specs"]) tr:last-child td:first-child,
    .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) tr:last-child td:first-child {
      border-bottom-left-radius: 7px !important;
    }
    .rich table.quote-grid-table tr:last-child td:last-child,
    .rendered-email-body table.quote-grid-table tr:last-child td:last-child,
    .quote-rich-text-content table.quote-grid-table tr:last-child td:last-child,
    table.quote-grid-table tr:last-child td:last-child,
    .rich table:not(.specs-table):not([data-type="specs"]) tr:last-child td:last-child,
    .rendered-email-body table:not(.specs-table):not([data-type="specs"]) tr:last-child td:last-child,
    .quote-rich-text-content table:not(.specs-table):not([data-type="specs"]) tr:last-child td:last-child {
      border-bottom-right-radius: 7px !important;
    }
    .rich table.quote-grid-table tbody tr:nth-child(even) td,
    .rendered-email-body table.quote-grid-table tbody tr:nth-child(even) td,
    .quote-rich-text-content table.quote-grid-table tbody tr:nth-child(even) td,
    table.quote-grid-table tbody tr:nth-child(even) td {
      background: #fafbfc !important;
    }
    .rich table.quote-grid-table tr,
    .rendered-email-body table.quote-grid-table tr,
    .quote-rich-text-content table.quote-grid-table tr,
    table.quote-grid-table tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    /* ── Specifications / Key-Value Tables (Specs Tables) ── */
    .rich table.specs-table,
    .rich table[data-type="specs"],
    .rendered-email-body table.specs-table,
    .rendered-email-body table[data-type="specs"],
    .quote-rich-text-content table.specs-table,
    .quote-rich-text-content table[data-type="specs"],
    table.specs-table,
    table[data-type="specs"] {
      width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
      margin: 6px 0 !important;
      border: 1px solid #e2e8f0 !important;
    }
    .rich table.specs-table tr,
    .rich table[data-type="specs"] tr,
    .rendered-email-body table.specs-table tr,
    .rendered-email-body table[data-type="specs"] tr,
    .quote-rich-text-content table.specs-table tr,
    .quote-rich-text-content table[data-type="specs"] tr,
    table.specs-table tr,
    table[data-type="specs"] tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      background: transparent !important;
    }
    .rich table.specs-table td,
    .rich table[data-type="specs"] td,
    .rendered-email-body table.specs-table td,
    .rendered-email-body table[data-type="specs"] td,
    .quote-rich-text-content table.specs-table td,
    .quote-rich-text-content table[data-type="specs"] td,
    table.specs-table td,
    table[data-type="specs"] td {
      border: 1px solid #e2e8f0 !important;
      padding: 6px 10px !important;
      font-size: 10pt !important;
      line-height: 1.55 !important;
      background: transparent !important;
    }
    .rich table.specs-table td:first-child,
    .rich table[data-type="specs"] td:first-child,
    .rendered-email-body table.specs-table td:first-child,
    .rendered-email-body table[data-type="specs"] td:first-child,
    .quote-rich-text-content table.specs-table td:first-child,
    .quote-rich-text-content table[data-type="specs"] td:first-child,
    table.specs-table td:first-child,
    table[data-type="specs"] td:first-child {
      width: 190px !important;
      min-width: 190px !important;
      max-width: 190px !important;
      font-weight: 700 !important;
      white-space: nowrap !important;
      vertical-align: top !important;
      color: #334155 !important;
    }
    .rich table.specs-table td:nth-child(2),
    .rich table[data-type="specs"] td:nth-child(2),
    .rendered-email-body table.specs-table td:nth-child(2),
    .rendered-email-body table[data-type="specs"] td:nth-child(2),
    .quote-rich-text-content table.specs-table td:nth-child(2),
    .quote-rich-text-content table[data-type="specs"] td:nth-child(2),
    table.specs-table td:nth-child(2),
    table[data-type="specs"] td:nth-child(2) {
      width: 25px !important;
      min-width: 25px !important;
      max-width: 25px !important;
      text-align: center !important;
      vertical-align: top !important;
      font-weight: 700 !important;
      color: #64748b !important;
    }
    .rich table.specs-table td:nth-child(3),
    .rich table[data-type="specs"] td:nth-child(3),
    .rendered-email-body table.specs-table td:nth-child(3),
    .rendered-email-body table[data-type="specs"] td:nth-child(3),
    .quote-rich-text-content table.specs-table td:nth-child(3),
    .quote-rich-text-content table[data-type="specs"] td:nth-child(3),
    table.specs-table td:nth-child(3),
    table[data-type="specs"] td:nth-child(3) {
      vertical-align: top !important;
      word-break: break-word !important;
      color: #0f172a !important;
    }

    /* ── Microsoft Word Paste & List Normalization ── */
    .MsoListParagraph,
    .MsoListParagraphCxSpFirst,
    .MsoListParagraphCxSpMiddle,
    .MsoListParagraphCxSpLast,
    .MsoNormal {
      text-indent: 0 !important;
      margin: 0 0 4px 0 !important;
      padding-left: 0 !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .rich img,
    .rendered-email-body img,
    .quote-rich-text-content img {
      max-width: 100% !important;
      max-height: 480px;
      height: auto !important;
      object-fit: contain;
      display: block;
      margin: 8px auto;
      border-radius: 6px;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .rich code, .rich pre, .rich .tag-pill, .rich span[style*="background"],
    .rendered-email-body code, .rendered-email-body pre, .rendered-email-body .tag-pill, .rendered-email-body span[style*="background"],
    .quote-rich-text-content code, .quote-rich-text-content pre {
      font-family: monospace !important;
    }
    .tag-pill,
    .rich span[style*="background"],
    .rendered-email-body span[style*="background"] {
      background: #f5f3ff !important;
      color: ${brandColor} !important;
      padding: 1px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 0.92em;
    }
    .textblock-title {
      font-size: 0.95rem;
      font-weight: 800;
      color: ${brandColor};
      margin-bottom: 6px;
      break-after: avoid;
      page-break-after: avoid;
    }
  `;
};

/**
 * Cleans up Microsoft Word copy-paste artifacts, excessive indentation,
 * non-breaking spaces before list bullets/numbers, and hidden comment tags.
 */
export const cleanWordArtifacts = (html: string): string => {
  if (!html) return '';
  let s = html;
  // 1. Unwrap Word list comments so list markers (1., 2., a., etc.) remain visible and clean
  s = s.replace(/<!--\s*\[if\s+!supportLists\]\s*-->([\s\S]*?)<!--\s*\[endif\]\s*-->/gi, '$1');
  // 2. Remove other Word conditional comments
  s = s.replace(/<!--\s*\[if[\s\S]*?\[endif\]\s*-->/gi, '');
  s = s.replace(/<!\[endif\]-->/gi, '');
  s = s.replace(/<!--\[endif\]-->/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/gi, '');
  // 3. Remove Word namespace tags like <o:p></o:p>
  s = s.replace(/<\/?o:p[^>]*>/gi, '');
  // 4. Remove rogue excessive non-breaking spaces before numbers/bullets
  s = s.replace(/(?:&nbsp;|\s){2,}(\d+[\.\)])/gi, ' $1');
  s = s.replace(/(<[a-z0-9]+[^>]*>)\s*(?:&nbsp;|\s)+(\d+[\.\)])/gi, '$1$2');
  // 5. Remove Word negative text-indent and rogue margins that pull list items off-grid
  s = s.replace(/text-indent:\s*-[0-9.]+pt;?/gi, '');
  s = s.replace(/mso-[^:;"]+:[^;"]+;?/gi, '');
  // 6. Remove rogue inline utility variable bloat (e.g. copied Tailwind variables)
  s = s.replace(/--tw-[^:;"]+:[^;"]+;?/gi, '');
  // 7. Strip leading empty lines/divs and rogue leading page breaks before content
  s = s.replace(/^(?:\s*<div>\s*(?:<br\s*\/?>)?\s*<\/div>|\s*<p>\s*(?:<br\s*\/?>)?\s*<\/p>|\s*<br\s*\/?>|\s*\[\s*page-?break\s*\])+/gi, '');
  return s;
};

/**
 * Common markdown to HTML converter for Proposal & Email rich text,
 * guaranteeing identical structural elements and styling classes.
 */
export const renderCommonDocumentBody = (
  rawBody: string,
  brandColor: string = '#6d28d9'
): string => {
  if (!rawBody) return '';
  let html = cleanWordArtifacts(rawBody).replace(/\r\n/g, '\n');

  // Replace manual A4 page break indicators
  html = html.replace(
    /<!--\s*page-?break\s*-->|\[\s*page-?break\s*\]|---page-?break---/gi,
    '<div class="a4-page-break-divider" style="page-break-after: always; break-after: page; height: 1px; margin: 16px 0; border-bottom: 2px dashed #cbd5e1;"></div>'
  );

  // 1. Convert markdown headings using unified classes and brand color
  html = html
    .replace(
      /^[ \t]*# (.*$)/gim,
      `<h1 style="color:${brandColor};font-size:1.35rem;font-weight:800;margin:12px 0 6px 0;line-height:1.25;border-bottom:none;break-after:avoid;page-break-after:avoid;">$1</h1>`
    )
    .replace(
      /^[ \t]*## (.*$)/gim,
      `<h2 style="color:${brandColor};font-size:1.2rem;font-weight:800;margin:10px 0 5px 0;line-height:1.25;break-after:avoid;page-break-after:avoid;">$1</h2>`
    )
    .replace(
      /^[ \t]*### (.*$)/gim,
      '<h3 style="color:#0f172a;font-size:1.05rem;font-weight:700;margin:8px 0 4px 0;line-height:1.3;break-after:avoid;page-break-after:avoid;">$1</h3>'
    )
    .replace(
      /^[ \t]*#### (.*$)/gim,
      '<h4 style="color:#334155;font-size:0.95rem;font-weight:700;margin:6px 0 3px 0;line-height:1.3;break-after:avoid;page-break-after:avoid;">$1</h4>'
    );

  // 2. Standalone bold title on its own line: **Title** -> <h2>
  html = html.replace(
    /^[ \t]*\*\*([^*]+)\*\*[ \t]*$/gm,
    `<h2 style="color:${brandColor};font-size:1.2rem;font-weight:800;margin:10px 0 5px 0;line-height:1.25;break-after:avoid;page-break-after:avoid;">$1</h2>`
  );

  // 3. Inline bold & dynamic variables
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0f172a;font-weight:800;">$1</strong>');
  html = html.replace(
    /{{(.*?)}}/g,
    `<span style="background:#f5f3ff;color:${brandColor};padding:1px 6px;border-radius:4px;font-weight:700;font-family:monospace;font-size:0.92em;">{{$1}}</span>`
  );

  // 4. Convert bullet lines (starting with •, -, or *) into semantic <ul><li>
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bulletMatch = line.match(/^[ \t]*[•\-\*]\s+(.*)$/);
    if (bulletMatch) {
      if (!inList) {
        processedLines.push('<ul style="margin:4px 0 8px 22px;padding:0;list-style-type:disc;">');
        inList = true;
      }
      processedLines.push(
        `<li style="margin-bottom:3px;line-height:1.55;break-inside:avoid;page-break-inside:avoid;">${bulletMatch[1]}</li>`
      );
    } else {
      if (inList) {
        processedLines.push('</ul>');
        inList = false;
      }
      processedLines.push(line);
    }
  }
  if (inList) {
    processedLines.push('</ul>');
  }
  html = processedLines.join('\n');

  // 5. Paragraph splitting
  const paragraphs = html.split(/\n\s*\n/);
  html = paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (/^<(h[1-6]|p|div|img|table|ul|ol|li|blockquote)/i.test(trimmed)) {
        return trimmed;
      }
      return `<p style="margin:0 0 6px 0;line-height:1.55;break-inside:auto;page-break-inside:auto;">${trimmed.replace(/\n/g, '<br />')}</p>`;
    })
    .filter(Boolean)
    .join('\n');

  return html;
};

/**
 * Detects if a keyboard event corresponds to the Print shortcut (Ctrl + P / Cmd + P).
 */
export const isPrintKeyboardShortcut = (e: {
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): boolean => {
  if (!e || !e.key) return false;
  return Boolean((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p');
};

/**
 * Executes print callback and prevents default browser printing when Ctrl+P / Cmd+P is pressed.
 */
export const handlePrintKeyboardShortcut = (
  e: {
    key?: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    preventDefault?: () => void;
    stopPropagation?: () => void;
  },
  onPrint: () => void
): boolean => {
  if (isPrintKeyboardShortcut(e)) {
    e.preventDefault?.();
    e.stopPropagation?.();
    onPrint();
    return true;
  }
  return false;
};

