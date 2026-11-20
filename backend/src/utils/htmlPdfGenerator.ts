import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { generateProposalPdfBuffer as fallbackPdfKit } from './proposalPdfGenerator';
import { amountToWords } from './amountToWords';
import { UPLOAD_ROOT_DIR } from '../config/storage';
import { stripDateSuffix, buildProposalNumber } from './proposalSequence';

/** JSON-serialisable layout measurements taken from a real browser render (see measureProposalLayout) */
export interface SerializedLayoutMetrics {
  availFirst?: number;
  availOther?: number;
  gridOverhead?: number;
  textGap?: number;
  titleH?: number;
  contTitleH?: number;
  tableHead?: number;
  tableBanner?: number;
  tailMore?: number;
  tailEnd?: number;
  tailEndDisc?: number;
  unitHeights?: Record<string, number>;
  itemHeights?: Record<string, number>;
  /** Extra px subtracted from every page's usable height (grown by the verify loop until nothing overflows) */
  safety?: number;
}

interface ProposalPdfData {
  proposal: any;
  entity: any;
  settings?: any;
  defaultTemplate?: any;
  layoutMetrics?: SerializedLayoutMetrics;
  /** Letter mode (Email Template PDFs): same A4 header/footer/pagination, but no quotation number or recipient/spec cards */
  letter?: { subject?: string };
}

const escapeHtml = (unsafe: any): string => {
  return String(unsafe ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

export interface DocumentBlockItem {
  id: number | string;
  type?: 'item' | 'detail';
  no?: number;
  description?: string;
  qty?: number | string;
  unitPrice?: number | string;
  total?: number | string;
  [key: string]: any;
}

export interface ChunkBlockSlice {
  block: any;
  /** Height (px) the chunker budgeted for this slice – exposed as data-est for layout debugging */
  estWeight?: number;
  globalIndex: number;
  sliceIndex: number;
  itemsSlice?: DocumentBlockItem[];
  isTableContinuation?: boolean;
  isTableEnd?: boolean;
  contentSlice?: string;
  isTextContinuation?: boolean;
  isTextEnd?: boolean;
}

export interface A4PageChunk {
  pageNum: number;
  slices: ChunkBlockSlice[];
  isFirst: boolean;
  isLast: boolean;
}

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
 * Split an HTML string into atomic structural block units suitable for A4 page slicing.
 * Unpacks nested wrapper divs and splits long lists or tables across items/rows.
 */
/**
 * An (invisible) paragraph that marks "continue this section on the next page". The editor inserts it when the user
 * presses Enter at the bottom of a full page, so the text keeps flowing in the same section instead of spawning a
 * new block. Preview/PDF renderers treat it as an ordinary blank paragraph.
 */
export const FLOW_BREAK_ATTR = 'data-flow-break';
const FLOW_BREAK_RE = /data-flow-break\s*=/i;
/** A visible empty line (<div><br></div>, <p><br></p>) – kept so sliced text matches the unsliced text. */
const BLANK_LINE_RE = /^\s*<(p|div)\b[^>]*>\s*(?:<br\s*\/?>|&nbsp;|\s)*<\/\1>\s*$/i;
export const isFlowBreakUnit = (unitHtml: string): boolean => FLOW_BREAK_RE.test(unitHtml || '');
/** A blank spacer line that is not an editor flow break – never worth a page or a continuation container of its own. */
export const isBlankLineUnit = (unitHtml: string): boolean => {
  const u = unitHtml || '';
  if (FLOW_BREAK_RE.test(u) || /<(img|table|hr)\b/i.test(u)) return false;
  // empty line (<div><br></div>) or a Word-style paragraph that only holds spaces / &nbsp;
  return BLANK_LINE_RE.test(u) || u.replace(/<[^>]+>/g, '').replace(/&nbsp;|&#160;|\u00a0|\s/gi, '') === '';
};
export const FLOW_BREAK_HTML = `<div ${FLOW_BREAK_ATTR}="1"><br></div>`;

export const splitHtmlBlocks = (html: string | undefined): string[] => {
  if (!html) return [];
  const raw = cleanWordArtifacts(html).trim();
  if (!raw) return [];

  const tokens: string[] = [];
  const regex = /<(\/)?([a-z0-9]+)([^>]*)>/gi;
  let chunkStart = 0;
  const stack: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    const isClosing = Boolean(match[1]);
    const tag = match[2].toLowerCase();
    const isVoid = ['br', 'hr', 'img', 'input'].includes(tag) || match[0].endsWith('/>');

    if (isVoid) {
      if (stack.length === 0) {
        const item = raw.slice(chunkStart, regex.lastIndex).trim();
        if (item) tokens.push(item);
        chunkStart = regex.lastIndex;
      }
      continue;
    }

    if (!isClosing) {
      stack.push(tag);
    } else {
      const idx = stack.lastIndexOf(tag);
      if (idx !== -1) {
        stack.splice(idx, stack.length - idx);
      }
      if (stack.length === 0) {
        const block = raw.slice(chunkStart, regex.lastIndex).trim();
        if (block) tokens.push(block);
        chunkStart = regex.lastIndex;
      }
    }
  }

  if (chunkStart < raw.length) {
    const rest = raw.slice(chunkStart).trim();
    if (rest) tokens.push(rest);
  }

  const refined: string[] = [];
  for (const t of tokens) {
    const innerMatch = t.match(/^<div\b[^>]*>([\s\S]*)<\/div>$/i);
    if (innerMatch && innerMatch[1].match(/<(div|p|ul|ol|table|h[1-6])\b/i)) {
      refined.push(...splitHtmlBlocks(innerMatch[1]));
    } else if (t.match(/<(ul|ol)\b[^>]*>/i)) {
      const listTagMatch = t.match(/<(ul|ol)\b[^>]*>/i);
      const listTag = listTagMatch ? listTagMatch[0] : '<ul>';
      const closeTag = listTag.startsWith('<ul') ? '</ul>' : '</ol>';

      // Preserve any lead-in text preceding the list
      const listStartIndex = t.search(/<(ul|ol)\b[^>]*>/i);
      if (listStartIndex > 0) {
        const leadIn = t.slice(0, listStartIndex).trim();
        const cleanedLeadIn = leadIn.replace(/<br\s*\/?>$/i, '').trim();
        if (cleanedLeadIn && cleanedLeadIn.replace(/<[^>]+>/g, '').trim().length > 0) {
          refined.push(cleanedLeadIn.startsWith('<p') ? (cleanedLeadIn.endsWith('</p>') ? cleanedLeadIn : `${cleanedLeadIn}</p>`) : `<p style="margin:0 0 6px 0;">${cleanedLeadIn}</p>`);
        }
      }

      const liMatches = t.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi);
      if (liMatches && liMatches.length > 1) {
        for (const li of liMatches) {
          refined.push(listTag + li + closeTag);
        }
      } else {
        refined.push(t.slice(listStartIndex));
      }
    } else if (/^<table\b[^>]*quote-grid-table/i.test(t)) {
      // Split grid tables into one-row units so they can flow across pages (header repeats on each page).
      const openTag = (t.match(/^<table\b[^>]*>/i) || [''])[0];
      const thead = (t.match(/<thead\b[\s\S]*?<\/thead>/i) || [''])[0];
      const tbody = (t.match(/<tbody\b[\s\S]*<\/tbody>/i) || [''])[0];
      const trs = tbody.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
      if (trs.length > 1) {
        trs.forEach(tr => refined.push(`${openTag}${thead}<tbody>${tr}</tbody></table>`));
      } else {
        refined.push(t);
      }
    } else if (t.includes('specs-table') || t.includes('data-type="specs"')) {
      const trMatches = t.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi);
      if (trMatches && trMatches.length > 1) {
        trMatches.forEach(tr => {
          refined.push('<table class="specs-table" data-type="specs" style="width:100%;table-layout:fixed;border-collapse:collapse;margin-top:2px;font-size:10pt;line-height:1.5;"><colgroup><col style="width:190px;"><col style="width:25px;"><col></colgroup><tbody>' + tr + '</tbody></table>');
        });
      } else {
        const withColgroup = t.includes('<colgroup>')
          ? t
          : t.replace(/(<table\b[^>]*>)/i, '$1<colgroup><col style="width:190px;"><col style="width:25px;"><col></colgroup>');
        refined.push(withColgroup);
      }
    } else {
      const stripped = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (stripped.length > 200 && !t.includes('<table') && !t.includes('<img')) {
        const sentences = t.split(/(?<!\b(?:Co|Inc|Ltd|Corp|W\.L\.L|e\.g|i\.e|Mr|Mrs|Ms|Dr|vs|Rev|No)\.)(?<=[.!?])\s+(?=[A-Z0-9])/i);
        if (sentences.length > 1) {
          let cur = '';
          for (const s of sentences) {
            if ((cur + ' ' + s).length > 220) {
              if (cur) refined.push(`<p style="margin:0 0 6px 0;">${cur.trim()}</p>`);
              cur = s;
            } else {
              cur = cur ? (cur + ' ' + s) : s;
            }
          }
          if (cur) refined.push(`<p style="margin:0 0 6px 0;">${cur.trim()}</p>`);
          continue;
        }
      }
      refined.push(t);
    }
  }

  return refined.filter(x => x.replace(/<[^>]+>/g, '').trim().length > 0 || x.includes('<img') || FLOW_BREAK_RE.test(x) || isBlankLineUnit(x));
};

/**
 * Detect if an atomic HTML unit is a heading, section title, or subheading.
 * Used for MS Word-style "Keep with next" orphan prevention and accurate height weighting.
 */
export const isHeadingUnit = (unitHtml: string): boolean => {
  if (!unitHtml) return false;
  if (/<table\b/i.test(unitHtml) || /<tr\b/i.test(unitHtml) || /<td\b/i.test(unitHtml)) return false;
  if (/<h[1-6]\b/i.test(unitHtml)) return true;
  if (/<(b|strong)\b[^>]*>[\s\S]*?<(u)\b/i.test(unitHtml) || /<(u)\b[^>]*>[\s\S]*?<(b|strong)\b/i.test(unitHtml)) return true;
  if (/text-decoration:\s*underline/i.test(unitHtml) && /font-weight:\s*(bold|700|800|900)/i.test(unitHtml)) return true;

  const plainText = unitHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // A lead-in line ("…are as described below:") must stay with the table/list it introduces
  if (plainText.length > 0 && plainText.endsWith(':')) return true;
  if (plainText.length > 0 && plainText.length <= 90) {
    if (/<(b|strong)\b/i.test(unitHtml) || /font-weight:\s*(bold|700|800|900)/i.test(unitHtml)) {
      return true;
    }
    if (plainText.endsWith(':') || plainText.endsWith('?')) {
      return true;
    }
  }
  return false;
};

/**
 * Estimate the pixel height of an atomic HTML unit.
 */
export interface LayoutMetrics {
  /** Usable content height (px) of page 1 / pages 2+, measured from a real render */
  availFirst?: number;
  availOther?: number;
  /** Measured height of one grid-table row-unit's table chrome (header + margins) */
  gridOverhead?: number;
  unitHeight?: (unitHtml: string) => number | undefined;
  itemHeight?: (item: any, blockIndex: number, itemIndex: number) => number | undefined;
  /** Extra height reserved at the end of the last page (e.g. the overall total box) */
  reserveLast?: number;
  /** Measured renderer chrome (px). Anything missing falls back to a calibrated default. */
  textGap?: number;        // margin below each text block
  titleH?: number;         // block title incl. its bottom margin
  contTitleH?: number;     // "(Continued from Page N)" title incl. its bottom margin
  tableHead?: number;      // table <thead>
  tableBanner?: number;    // "Pricing Table #N (Continued)" banner
  tailMore?: number;       // table bottom when it continues on the next page (incl. border + wrapper margin)
  tailEnd?: number;        // table bottom with totals, no discount
  tailEndDisc?: number;    // table bottom with totals + discount
}

export const GRID_HEADER_HEIGHT = 32;
export const isGridRowUnit = (unitHtml: string): boolean =>
  /^<table\b[^>]*quote-grid-table/i.test(unitHtml) && (unitHtml.match(/<tr\b/gi) || []).length === 2;

export const estimateUnitHeight = (unitHtml: string): number => {
  const isHeading = isHeadingUnit(unitHtml);
  const isTable = /<table\b/i.test(unitHtml);
  const isList = /<li\b/i.test(unitHtml);
  const isImage = /<img\b/i.test(unitHtml);
  if (isImage) {
    const widthPctMatch = unitHtml.match(/(?<![-])\bwidth:\s*(\d+(?:\.\d+)?)%/i);
    const widthPxMatch = unitHtml.match(/(?<![-])\bwidth:\s*(\d+)px/i);
    const heightPxMatch = unitHtml.match(/(?<![-])\bheight:\s*(\d+)px/i);
    const widthAttrMatch = unitHtml.match(/\bwidth=["']?(\d+)(?:%|px)?["']?/i);
    const heightAttrMatch = unitHtml.match(/\bheight=["']?(\d+)(?:%|px)?["']?/i);

    if (heightPxMatch) return Math.min(600, parseInt(heightPxMatch[1], 10)) + 16;
    if (heightAttrMatch && !unitHtml.includes('%')) return Math.min(600, parseInt(heightAttrMatch[1], 10)) + 16;

    let wPct = 100;
    if (widthPctMatch) {
      wPct = parseFloat(widthPctMatch[1]);
    } else if (widthPxMatch) {
      wPct = Math.min(100, (parseInt(widthPxMatch[1], 10) / 680) * 100);
    } else if (widthAttrMatch) {
      const val = parseFloat(widthAttrMatch[1]);
      wPct = unitHtml.match(/\bwidth=["']?\d+%/i) ? val : Math.min(100, (val / 680) * 100);
    }
    const estimatedH = Math.min(480, Math.round((wPct / 100) * 520));
    return Math.max(100, estimatedH + 16);
  }

  const text = unitHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const textLen = text.length;
  if (textLen === 0) {
    const brCount = (unitHtml.match(/<br\b[^>]*>/gi) || []).length;
    const lines = Math.max(1, brCount);
    return (isFlowBreakUnit(unitHtml) || isBlankLineUnit(unitHtml)) ? (lines * 28) : 24;
  }

  if (isTable && isGridRowUnit(unitHtml)) {
    // One body row of a quote-grid-table (header height is charged by the chunker once per page)
    const tds = unitHtml.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || [];
    const lens = tds.map(td => td.replace(/<[^>]+>/g, '').trim().length);
    const lines = Math.max(1, Math.ceil((lens[2] || 0) / 62), Math.ceil((lens[1] || 0) / 32));
    return 18 + lines * 17;
  }

  if (isTable) {
    const rows = (unitHtml.match(/<tr\b/gi) || []).length || 1;
    // Check cell text wrapping in table columns (especially in specs tables)
    const cells = unitHtml.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || [];
    const maxCellLen = cells.reduce((max, td) => Math.max(max, td.replace(/<[^>]+>/g, '').trim().length), 0);
    const cellLines = Math.max(1, Math.ceil(maxCellLen / 50));
    return Math.max(34, rows * (16 + cellLines * 18));
  }

  // Count explicit line breaks (<br> and newlines)
  const brCount = (unitHtml.match(/<br\b[^>]*>/gi) || []).length;
  const charsPerLine = isList ? 70 : 75;
  const wrappedLines = Math.ceil(textLen / charsPerLine);
  const lines = Math.max(1, wrappedLines, brCount > 0 ? Math.ceil(brCount / 2) : 1);

  if (isHeading) return 24 + lines * 24;
  if (isList) return 6 + lines * 22;
  return 8 + lines * 23;
};

/**
 * Re-merge sliced units back into cohesive, valid HTML for rendering.
 */
export const joinHtmlUnits = (units: string[]): string => {
  if (!units || units.length === 0) return '';
  let html = units.join('\n');
  html = html.replace(/<\/ul>\s*<ul\b[^>]*>/gi, '');
  html = html.replace(/<\/ol>\s*<ol\b[^>]*>/gi, '');
  html = html.replace(/<\/tbody><\/table>\s*<table\b[^>]*quote-grid-table[^>]*>\s*<thead\b[\s\S]*?<\/thead>\s*<tbody>/gi, '');
  html = html.replace(/<\/tbody><\/table>\s*<table[^>]*>(?:<colgroup>[\s\S]*?<\/colgroup>)?\s*<tbody>/gi, '');
  return html;
};

/**
 * Normalizes pseudo-table colon rows or specs-table into a clean, modern tabular column grid table.
 */
export function normalizeColonTableToTabular(html: string, brandColor: string = '#722580'): string {
  if (!html || typeof html !== 'string') return html || '';

  return html.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (match, inner) => {
    if (inner.includes('>NO</th>') || inner.includes('>No</th>')) return match;

    const trMatches = inner.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi);
    if (!trMatches || trMatches.length === 0) return match;

    const rows: { col1: string; col2: string }[] = [];
    let isColonTable = true;
    for (const tr of trMatches) {
      const cellMatches = tr.match(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi);
      if (!cellMatches || cellMatches.length < 2) {
        if (tr.toLowerCase().includes('<th')) continue;
        isColonTable = false;
        break;
      }
      const cells = cellMatches.map((c: string) => c.replace(/^<(td|th)\b[^>]*>|<\/(td|th)>$/gi, '').trim());
      if (cells.length === 3 && (cells[1] === ':' || cells[1] === '&#58;' || cells[1].replace(/<[^>]+>/g, '').trim() === ':')) {
        rows.push({ col1: cells[0], col2: cells[2] });
      } else if (cells.length === 2 && !tr.toLowerCase().includes('<th')) {
        rows.push({ col1: cells[0], col2: cells[1] });
      } else if (tr.toLowerCase().includes('<th')) {
        continue;
      } else {
        isColonTable = false;
        break;
      }
    }

    if (!isColonTable || rows.length === 0) return match;

    const allCol1 = rows.map(r => r.col1.replace(/<[^>]+>/g, '').toLowerCase()).join(' ');
    let h1 = 'Terms & Conditions';
    let h2 = 'Details';
    if (allCol1.includes('processor') || allCol1.includes('ram') || allCol1.includes('hard disk') || allCol1.includes('operating system') || allCol1.includes('ms office') || allCol1.includes('hardware')) {
      h1 = 'Component';
      h2 = 'Specification / Requirement';
    } else if (allCol1.includes('specification') || allCol1.includes('feature') || allCol1.includes('requirement')) {
      h1 = 'Item / Parameter';
      h2 = 'Details / Description';
    }

    let rowsHtml = '';
    const total = rows.length;
    rows.forEach((r, idx) => {
      let col1Clean = r.col1.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      let col2Html = r.col2.trim();
      if (!col1Clean) {
        if (col2Html.toLowerCase().includes('cloud')) col1Clean = 'Cloud Service Payment';
        else col1Clean = 'Additional Payment';
      }
      if (col1Clean && col1Clean.length > 1) {
        col1Clean = col1Clean.charAt(0).toUpperCase() + col1Clean.slice(1);
      }
      const isLast = idx === total - 1;
      const bg = idx % 2 === 1 ? ' background: #fafbfc;' : ' background: #ffffff;';
      const borderBottom = isLast ? '' : ' border-bottom: 1px solid #e2e8f0;';
      const radiusCol1 = isLast ? ' border-bottom-left-radius: 7px;' : '';
      const radiusColLast = isLast ? ' border-bottom-right-radius: 7px;' : '';
      rowsHtml += `    <tr style="${bg}${borderBottom}">\n` +
        `      <td style="border: none;${borderBottom}${radiusCol1} padding: 8px 10px; font-weight: 700; color: #1e293b; text-align: center; vertical-align: top; width: 44px; font-size: 8.5pt;">${idx + 1}</td>\n` +
        `      <td style="border: none;${borderBottom} padding: 8px 12px; font-weight: 700; color: #1e293b; vertical-align: top; width: 34%; font-size: 8.5pt;">${col1Clean}</td>\n` +
        `      <td style="border: none;${borderBottom}${radiusColLast} padding: 8px 12px; color: #0f172a; vertical-align: top; width: 66%; font-size: 8.5pt;">${col2Html}</td>\n` +
        `    </tr>\n`;
    });

    return `<table class="quote-grid-table" style="width: 100%; border-collapse: separate; border-spacing: 0; margin: 10px 0; font-size: 9pt; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff;">\n` +
      `  <thead>\n` +
      `    <tr style="background: ${brandColor}; color: #ffffff;">\n` +
      `      <th style="border: none; border-top-left-radius: 7px; background: ${brandColor}; color: #ffffff; padding: 8px 10px; font-weight: 700; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; text-align: center; width: 44px;">NO</th>\n` +
      `      <th style="border: none; background: ${brandColor}; color: #ffffff; padding: 8px 12px; font-weight: 700; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; width: 34%;">${h1}</th>\n` +
      `      <th style="border: none; border-top-right-radius: 7px; background: ${brandColor}; color: #ffffff; padding: 8px 12px; font-weight: 700; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; width: 66%;">${h2}</th>\n` +
      `    </tr>\n` +
      `  </thead>\n` +
      `  <tbody>\n${rowsHtml}  </tbody>\n` +
      `</table>`;
  });
}

/**
 * Accurately estimate the pixel height of a quotation table row or detail line.
 * Factors in baseline line-height, padding, borders, and multi-line descriptions.
 */
export const estimateItemHeight = (item: any): number => {
  if (item?.type === 'detail') {
    const desc = String(item?.description || '');
    const newlines = (desc.match(/\n/g) || []).length;
    // Detail lines are confined to the Description column (~340px width) fitting ~45 characters per line
    const lineWraps = Math.ceil(desc.length / 45);
    const totalLines = Math.max(1, newlines + 1, lineWraps);
    return 16 + totalLines * 17;
  }
  const desc = String(item?.description || '');
  const newlines = (desc.match(/\n/g) || []).length;
  // Standard item description column has ~340px width fitting ~45 chars per line
  const lineWraps = Math.ceil(desc.length / 45);
  const totalLines = Math.max(1, newlines + 1, lineWraps);
  return 36 + Math.max(0, totalLines - 1) * 16;
};

export const chunkDocumentBlocksForA4Pages = (
  blocks: any[],
  options: { hasHeaderImage?: boolean; hasFooterImage?: boolean; isEditor?: boolean; honorPageBreaks?: boolean; isLetter?: boolean; metrics?: LayoutMetrics } = {}
): A4PageChunk[] => {
  const { hasHeaderImage = false, hasFooterImage = false, isEditor = false, honorPageBreaks = true, isLetter = false, metrics } = options;
  const unitH = (u: string): number => metrics?.unitHeight?.(u) ?? estimateUnitHeight(u);
  const gridHeaderH = metrics?.gridOverhead ?? GRID_HEADER_HEIGHT;

  if (!blocks || blocks.length === 0) {
    return [{ pageNum: 1, slices: [], isFirst: true, isLast: true }];
  }

  // A4 Total Height: 1123px (297mm)
  // Page 1: Top (Header image ~128px or letterhead ~150px + Recipient/Doc Specs Cards ~165px + padding/margins ~40px = ~333-355px)
  // In letter mode, no recipient or specification cards are rendered, saving ~160px.
  const p1CardsWeight = isLetter ? 0 : 160;
  const p1HeaderWeight = (hasHeaderImage ? 128 : (isLetter ? 70 : 120)) + p1CardsWeight;
  // Footer: Banner image ~125px + padding ~10px = ~135px; Running text footer ~43px + padding ~13px = ~56px
  const p1FooterWeight = hasFooterImage ? 136 : 56;
  // Page 1 available content weight: safe bottom clearance (~7mm) to protect footer from clipping
  const p1MaxWeight = metrics?.availFirst ?? Math.max(450, 1123 - p1HeaderWeight - p1FooterWeight - 28);

  // Page 2+: Top (If headerImage is present: 128px banner + 44px subhead bar = ~172px; otherwise 50px running subhead = ~50px)
  const pOtherHeaderWeight = (hasHeaderImage ? 128 : 0) + (hasHeaderImage ? 44 : 50);
  const pOtherFooterWeight = hasFooterImage ? 136 : 56;
  // Page 2+ available content weight: strict A4 page boundary with safe bottom clearance (~7mm) to protect footer
  const pOtherMaxWeight = metrics?.availOther ?? Math.max(520, 1123 - pOtherHeaderWeight - pOtherFooterWeight - 28);

  const chunks: A4PageChunk[] = [];
  let currentPageNum = 1;
  let currentSlices: ChunkBlockSlice[] = [];
  let currentWeight = 0;
  let maxWeight = p1MaxWeight;

  const startNewPage = () => {
    chunks.push({
      pageNum: currentPageNum,
      slices: currentSlices,
      isFirst: currentPageNum === 1,
      isLast: false,
    });
    currentPageNum++;
    currentSlices = [];
    currentWeight = 0;
    maxWeight = pOtherMaxWeight;
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const forceBreak = honorPageBreaks && Boolean(block?.pageBreak) && i > 0;
    if (forceBreak && currentSlices.length > 0) {
      startNewPage();
    }

    if (block?.type === 'text') {
      const units = splitHtmlBlocks(block?.content || '');
      const blockTitle = block?.title || '';
      // title (19px + 8px gap) + the block's 14px bottom margin
      const textBlockOverhead = isEditor ? 60 : (blockTitle ? (metrics?.titleH ?? 27) : 0) + (metrics?.textGap ?? 14);
      const titleHeight = textBlockOverhead;

      if (units.length === 0) {
        if (currentWeight + textBlockOverhead + 16 > maxWeight && currentSlices.length > 0) {
          startNewPage();
        }
        currentSlices.push({
          block,
          globalIndex: i,
          sliceIndex: 0,
          contentSlice: block?.content || '',
          isTextContinuation: false,
          isTextEnd: true,
        });
        currentWeight += textBlockOverhead + 16;
        continue;
      }

      // When the whole block fits it is rendered as the original, unsplit content, so prefer its own measured height
      const wholeMeasured = metrics?.unitHeight?.(block?.content || '');
      const totalContentHeight = textBlockOverhead + (wholeMeasured ?? units.reduce((acc, u, ui) => (
        acc + unitH(u) + (isGridRowUnit(u) && !(ui > 0 && isGridRowUnit(units[ui - 1])) ? gridHeaderH : 0)
      ), 0));

      const hasFlowBreak = honorPageBreaks && units.some(isFlowBreakUnit);

      // Check if the entire text block fits on the current page
      if (!hasFlowBreak && currentWeight + totalContentHeight <= maxWeight) {
        currentSlices.push({
          estWeight: totalContentHeight,
          block,
          globalIndex: i,
          sliceIndex: 0,
          contentSlice: block?.content || '',
          isTextContinuation: false,
          isTextEnd: true,
        });
        currentWeight += totalContentHeight;
        continue;
      }

      // If it does not fit, can we start it on this page or should we move to a fresh page first?
      // A titled section (like "Terms & Conditions") must not be crammed into a small bottom sliver.
      const minTextNeeded = (blockTitle ? 70 : 25) + (isEditor ? 40 : 20);
      if (currentSlices.length > 0 && maxWeight - currentWeight < minTextNeeded) {
        startNewPage();
      }

      // Slice units across pages
      let unitIndex = 0;
      let sliceIndex = 0;

      // Height of the whole tabular column (consecutive grid-table rows, one header) starting at unit idx
      const gridRunHeight = (idx: number): number => {
        let h = gridHeaderH;
        for (let k = idx; k < units.length && isGridRowUnit(units[k]); k++) h += unitH(units[k]);
        return h;
      };

      while (unitIndex < units.length) {
        const sliceUnits: string[] = [];
        const isContinuation = sliceIndex > 0;
        const currentTitleOverhead = isContinuation ? (isEditor ? 32 : (blockTitle ? (metrics?.contTitleH ?? 26) : 0) + (metrics?.textGap ?? 14)) : textBlockOverhead;

        // Prevent orphaned title / single-line fragment at bottom of page:
        if (unitIndex === 0 && currentSlices.length > 0) {
          const firstUnitH = unitH(units[0]);
          const secondUnitH = units.length > 1 ? unitH(units[1]) : 0;
          const minOpeningHeight = currentTitleOverhead + firstUnitH + Math.min(24, secondUnitH);
          if (currentWeight + minOpeningHeight > maxWeight) {
            startNewPage();
          }
        }

        let sliceWeight = currentTitleOverhead;

        while (unitIndex < units.length) {
          const u = units[unitIndex];
          // A spacer line at the top of a continuation page is dropped (it would only push text down)
          if (sliceUnits.length === 0 && sliceIndex > 0 && isBlankLineUnit(u)) {
            unitIndex++;
            continue;
          }
          // A flow break always starts a new page – the paragraph itself becomes the first line of the next page
          if (honorPageBreaks && isFlowBreakUnit(u) && (sliceUnits.length > 0 || currentSlices.length > 0)) {
            break;
          }
          const prevUnit = sliceUnits[sliceUnits.length - 1];
          // TABULAR COLUMN RULE: a grid table that fits on one page is never broken across pages – if it does not fit in the
          // room left here, it moves whole to the next page (only a table taller than a full page may flow across pages).
          if (isGridRowUnit(u) && !(prevUnit && isGridRowUnit(prevUnit))) {
            const runH = gridRunHeight(unitIndex);
            if (
              runH <= pOtherMaxWeight &&
              currentWeight + sliceWeight + runH > maxWeight &&
              (sliceUnits.length > 0 || currentSlices.length > 0)
            ) {
              break;
            }
          }
          const uH = unitH(u) + (isGridRowUnit(u) && !(prevUnit && isGridRowUnit(prevUnit)) ? gridHeaderH : 0);
          const isHeading = isHeadingUnit(u);

          // Prevent orphan headings at the bottom of the page (MS Word "Keep with next" rule):
          // A heading must never be stranded alone at the bottom of a page without at least its following content.
          if (isHeading) {
            let followingNeed = 0;
            let lookAheadIdx = unitIndex + 1;
            while (lookAheadIdx < units.length && followingNeed < 40) {
              followingNeed += unitH(units[lookAheadIdx]);
              lookAheadIdx++;
            }
            const nextIsGrid = unitIndex + 1 < units.length && isGridRowUnit(units[unitIndex + 1]);
            const gridNeed = nextIsGrid ? gridRunHeight(unitIndex + 1) : 0;
            const keepWithNextSpace = uH + (nextIsGrid && gridNeed <= pOtherMaxWeight ? gridNeed : Math.min(Math.max(40, followingNeed), 56));
            if (currentWeight + sliceWeight + keepWithNextSpace > maxWeight) {
              if (sliceUnits.length > 0 || currentSlices.length > 0) {
                break;
              }
            }
          }

          if (currentWeight + sliceWeight + uH <= maxWeight || (sliceUnits.length === 0 && currentSlices.length === 0)) {
            sliceUnits.push(u);
            sliceWeight += uH;
            unitIndex++;
          } else {
            break;
          }
        }

        if (sliceUnits.length === 0) {
          startNewPage();
          continue;
        }

        // Trailing spacer lines never justify another page/continuation container
        if (unitIndex < units.length && units.slice(unitIndex).every(isBlankLineUnit)) unitIndex = units.length;
        const isLastSlice = (unitIndex === units.length);

        currentSlices.push({
          estWeight: sliceWeight,
          block,
          globalIndex: i,
          sliceIndex,
          contentSlice: joinHtmlUnits(sliceUnits),
          isTextContinuation: isContinuation,
          isTextEnd: isLastSlice,
        });

        currentWeight += sliceWeight;
        sliceIndex++;

        if (!isLastSlice) {
          startNewPage();
        }
      }
    } else if (block?.type === 'table') {
      const allItems: DocumentBlockItem[] = Array.isArray(block?.items) ? block.items : [];
      const tableHeaderOverhead = isEditor ? 54 : (metrics?.tableHead !== undefined ? metrics.tableHead : 36);
      const hasDiscount = (Number(block?.discountPercent) > 0) || (Number(block?.discountAmount) > 0);
      const tableFooterOverhead = isEditor ? (hasDiscount ? 100 : 75) + 15 : (hasDiscount ? (metrics?.tailEndDisc ?? 119) : (metrics?.tailEnd ?? 94));
      const tableMoreOverhead = isEditor ? 30 : (metrics?.tailMore ?? 51);
      const tableContBanner = isEditor ? 0 : (metrics?.tableBanner ?? 27);


      if (allItems.length === 0) {
        if (currentWeight + tableHeaderOverhead + 50 > maxWeight && currentSlices.length > 0) {
          startNewPage();
        }
        currentSlices.push({
          block,
          globalIndex: i,
          sliceIndex: 0,
          itemsSlice: [],
          isTableContinuation: false,
          isTableEnd: true,
        });
        currentWeight += tableHeaderOverhead + 50;
        continue;
      }

      // Keep a pricing table in one piece when it fits on a page of its own: start it
      // on the next page instead of cutting it in half (long tables, or a huge blank bottom, still flow/split).
      const wholeTableHeight = tableHeaderOverhead + tableFooterOverhead
        + allItems.reduce((acc, _it, idx) => acc + (metrics?.itemHeight?.(allItems[idx], i, idx) ?? estimateItemHeight(allItems[idx])), 0);
      const roomLeft = maxWeight - currentWeight;
      if (
        currentSlices.length > 0 &&
        wholeTableHeight <= pOtherMaxWeight &&
        currentWeight + wholeTableHeight > maxWeight &&
        roomLeft <= pOtherMaxWeight * 0.65
      ) {
        startNewPage();
      }

      let itemIndex = 0;
      let sliceIndex = 0;

      while (itemIndex < allItems.length) {
        const itemH = (idx: number): number => metrics?.itemHeight?.(allItems[idx], i, idx) ?? estimateItemHeight(allItems[idx]);
        const firstItemH = itemH(itemIndex);
        const secondItemH = (itemIndex + 1 < allItems.length) ? itemH(itemIndex + 1) : 0;
        // Require room for at least 2 items (or the only item if table has 1 item) + header + buffer to start a table on current page
        const minNeeded = tableHeaderOverhead + firstItemH + (secondItemH ? Math.min(35, secondItemH) : 0) + 15;

        if (currentWeight + minNeeded > maxWeight && currentSlices.length > 0) {
          startNewPage();
        }

        const sliceItems: DocumentBlockItem[] = [];
        let sliceItemsWeight = tableHeaderOverhead + (sliceIndex > 0 ? tableContBanner : 0);

        while (itemIndex < allItems.length) {
          const it = allItems[itemIndex];
          const itH = itemH(itemIndex);
          const isLastOfBlock = (itemIndex === allItems.length - 1);
          const neededForIt = itH + (isLastOfBlock ? tableFooterOverhead : tableMoreOverhead);

          // Widow prevention: if adding this item would leave exactly 1 item for the next slice,
          // require room for BOTH this item and the final item (or break now so the final slice gets at least 2 items)
          const wouldLeaveSingleWidow = (itemIndex === allItems.length - 2);
          if (wouldLeaveSingleWidow && sliceItems.length >= 2) {
            const nextIt = allItems[itemIndex + 1];
            const nextH = itemH(itemIndex + 1);
            if (currentWeight + sliceItemsWeight + itH + nextH + tableFooterOverhead > maxWeight) {
              break;
            }
          }

          if (currentWeight + sliceItemsWeight + neededForIt <= maxWeight || sliceItems.length === 0) {
            sliceItems.push(it);
            sliceItemsWeight += itH;
            itemIndex++;
          } else {
            break;
          }
        }

        const isLastSlice = (itemIndex === allItems.length);
        if (isLastSlice) {
          sliceItemsWeight += tableFooterOverhead;
        } else {
          sliceItemsWeight += tableMoreOverhead;
        }

        currentSlices.push({
          estWeight: sliceItemsWeight,
          block,
          globalIndex: i,
          sliceIndex,
          itemsSlice: sliceItems,
          isTableContinuation: sliceIndex > 0,
          isTableEnd: isLastSlice,
        });

        currentWeight += sliceItemsWeight;
        sliceIndex++;

        if (!isLastSlice) {
          startNewPage();
        }
      }
    }
  }

  if (metrics?.reserveLast && currentSlices.length > 0 && currentWeight + metrics.reserveLast > maxWeight) {
    startNewPage();
  }

  if (currentSlices.length > 0 || chunks.length === 0 || (metrics?.reserveLast && chunks.length > 0)) {
    chunks.push({
      pageNum: currentPageNum,
      slices: currentSlices,
      isFirst: currentPageNum === 1,
      isLast: true,
    });
  }

  if (chunks.length > 0) {
    chunks[chunks.length - 1].isLast = true;
  }

  return chunks;
};

const resolveImageAsBase64OrUrl = (rawPath?: string, settings?: any): string => {
  if (!rawPath) return '';
  const str = String(rawPath).trim();
  if (!str) return '';
  if (str.startsWith('data:image/')) return str;

  // Try local file resolution to encode as base64 data URI (fastest & most reliable for Puppeteer)
  try {
    let clean = str;
    if (/^https?:\/\//i.test(str)) {
      try {
        clean = new URL(str).pathname;
      } catch {
        clean = str;
      }
    }
    clean = clean.replace(/^[/\\]+/, '').replace(/^api\/v1\//, '');
    const uploadRel = clean.match(/(?:^|\/)(uploads\/.+)$/);
    const relativeTarget = uploadRel ? uploadRel[1] : clean;
    const uploadRoot = (process.env.UPLOAD_ROOT_DIR || UPLOAD_ROOT_DIR || '').replace(/[\\/]+$/, '');
    const uploadRootTarget = relativeTarget.replace(/^uploads[\\/]/, '');

    const filename = path.basename(clean);

    const possiblePaths = [
      ...(uploadRoot ? [
        path.join(uploadRoot, uploadRootTarget),
        path.join(uploadRoot, filename),
        path.join(uploadRoot, 'media', filename),
        path.join(uploadRoot, 'settings', filename),
        path.join(uploadRoot, 'templates', filename),
      ] : []),
      path.resolve(clean),
      path.resolve(relativeTarget),
      path.join(process.cwd(), clean),
      path.join(process.cwd(), relativeTarget),
      path.join(process.cwd(), 'backend', relativeTarget),
      path.join(process.cwd(), '..', relativeTarget),
      path.join(__dirname, '..', '..', relativeTarget),
      path.join(__dirname, '..', '..', 'uploads', filename),
      path.join(process.cwd(), 'uploads', filename),
      path.join(process.cwd(), 'backend', 'uploads', filename),
      path.join(__dirname, '..', '..', 'uploads', 'media', filename),
      path.join(process.cwd(), 'uploads', 'media', filename),
      path.join(process.cwd(), 'backend', 'uploads', 'media', filename),
      path.join(__dirname, '..', '..', 'uploads', 'settings', filename),
      path.join(process.cwd(), 'uploads', 'settings', filename),
      path.join(process.cwd(), 'backend', 'uploads', 'settings', filename),
      path.join(__dirname, '..', '..', 'uploads', 'templates', filename),
      path.join(process.cwd(), 'uploads', 'templates', filename),
      path.join(process.cwd(), 'backend', 'uploads', 'templates', filename),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        const ext = path.extname(p).toLowerCase().replace('.', '') || 'png';
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
        const buf = fs.readFileSync(p);
        return `data:${mime};base64,${buf.toString('base64')}`;
      }
    }
  } catch (err) {}

  return str;
};

export const buildProposalFullHtml = (
  data: ProposalPdfData,
  collect?: { units: Map<string, string>; sequences?: Array<Array<[string, string]>> }
): string => {
  const { proposal, entity, settings, defaultTemplate } = data;

  const brand = settings?.brandColor || '#6d28d9';
  const companyName = settings?.companyName || 'Welcome Trading Co. W.L.L';
  const cur = settings?.currency || 'QAR';

  const propTemplate = (proposal.template && typeof proposal.template === 'object' && proposal.template.name)
    ? proposal.template
    : null;
  const effectiveTemplate = propTemplate || defaultTemplate;

  const rawHeader =
    (proposal.templateImage && String(proposal.templateImage).trim()) ||
    (effectiveTemplate?.templateImage && String(effectiveTemplate.templateImage).trim()) ||
    (settings?.proposalHeaderImage && String(settings.proposalHeaderImage).trim()) ||
    '';
  const rawFooter =
    (proposal.templateFooterImage && String(proposal.templateFooterImage).trim()) ||
    (effectiveTemplate?.templateFooterImage && String(effectiveTemplate.templateFooterImage).trim()) ||
    (settings?.proposalFooterImage && String(settings.proposalFooterImage).trim()) ||
    '';
  const rawWatermark = settings?.proposalWatermark || settings?.logo;

  const headerUrl = resolveImageAsBase64OrUrl(rawHeader, settings);
  const footerUrl = resolveImageAsBase64OrUrl(rawFooter, settings);
  const watermarkUrl = resolveImageAsBase64OrUrl(rawWatermark, settings);

  const name = proposal.name || proposal.title || 'Quotation';
  const discount = Number(proposal.discount) || 0;
  const validForDays = Number(proposal.validForDays || effectiveTemplate?.validForDays) || 10;

  const company = {
    name: proposal.companyInfo?.name || effectiveTemplate?.companyInfo?.name || companyName,
    a1: proposal.companyInfo?.addressLine1 || effectiveTemplate?.companyInfo?.addressLine1 || settings?.address || 'Grand Hamad Street, Bank Street',
    a2: proposal.companyInfo?.addressLine2 || effectiveTemplate?.companyInfo?.addressLine2 || settings?.country || 'Doha, State of Qatar',
    phone: proposal.companyInfo?.contactNo || effectiveTemplate?.companyInfo?.contactNo || settings?.phone || '+974 4400 5500',
    email: proposal.companyInfo?.email || effectiveTemplate?.companyInfo?.email || settings?.email || 'info@welcometech.qa',
  };

  const client = {
    company:
      proposal.customerName ||
      entity?.companyName ||
      (entity as any)?.companyInfo?.customerName ||
      (entity as any)?.companyInfo?.name ||
      entity?.name ||
      proposal.customerDetails?.companyName ||
      (proposal.customerEmail ? proposal.customerEmail.split('@')[0] : 'Valued Client'),
    contactName:
      proposal.customerContactPerson ||
      proposal.customerDetails?.contactName ||
      proposal.customerDetails?.contactPerson ||
      (entity as any)?.contact ||
      (entity as any)?.primaryContactInfo?.contactName1 ||
      (entity as any)?.keyContacts?.[0]?.contactName ||
      ((entity as any)?.companyName ? (entity as any)?.name : '') ||
      '',
    a1: proposal.customerAddress || entity?.address || entity?.fullAddress || entity?.companyInfo?.fullAddress || proposal.customerDetails?.addressLine1 || '',
    a2: proposal.customerDetails?.addressLine2 || '',
    phone: proposal.customerPhone || entity?.phone || entity?.primaryContactInfo?.mobile || proposal.customerDetails?.phone || '',
    email: proposal.customerEmail || entity?.email || entity?.primaryContactInfo?.email || proposal.customerDetails?.email || (entity as any)?.customerEmail || '',
  };

  const senderEmail =
    proposal.senderEmail ||
    (proposal as any)?.quotationDetails?.senderEmail ||
    (proposal as any)?.createdBy?.email ||
    proposal.companyInfo?.email ||
    effectiveTemplate?.companyInfo?.email ||
    settings?.companyEmail ||
    settings?.email ||
    company.email ||
    'sales@welcometech.qa';

  const senderPhone =
    proposal.senderPhone ||
    (proposal as any)?.quotationDetails?.senderPhone ||
    (proposal as any)?.createdBy?.phone ||
    proposal.companyInfo?.contactNo ||
    effectiveTemplate?.companyInfo?.contactNo ||
    settings?.companyPhone ||
    settings?.phone ||
    company.phone ||
    '+97466032346';

  const now = new Date();
  const gb = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: 'Asia/Qatar', day: '2-digit', month: 'short', year: 'numeric' });
  const revNum = Number(proposal.revision) || 0;
  const includeDate = proposal.quotationDetails?.proposalIncludeDate !== undefined
    ? Boolean(proposal.quotationDetails.proposalIncludeDate)
    : (data.settings?.proposalIncludeDate !== undefined ? Boolean(data.settings.proposalIncludeDate) : false);
  const rawProvidedQuoteNo = proposal.proposalNo || proposal.quotationDetails?.quoteNo;
  const existingDateSuffixMatch = (rawProvidedQuoteNo || '').trim().match(/\/(\d{2}-\d{2}-\d{4})$/);
  const baseSerialNo = rawProvidedQuoteNo
    ? stripDateSuffix(rawProvidedQuoteNo)
    : (data.settings?.proposalNo || 'WT-Q1001');

  let rawQuoteNo = '';
  if (existingDateSuffixMatch) {
    rawQuoteNo = rawProvidedQuoteNo.trim();
  } else {
    const quoteDateVal = proposal.quoteDate ? new Date(proposal.quoteDate) : now;
    rawQuoteNo = buildProposalNumber(baseSerialNo, includeDate, quoteDateVal);
  }
  const quoteNo = revNum > 0 ? `${rawQuoteNo} (Rev ${revNum})` : rawQuoteNo;
  const refLabel = data.letter ? (data.letter.subject || '') : (quoteNo ? `Quotation ${quoteNo}` : '');
  let quoteDate = '';
  if (existingDateSuffixMatch) {
    const [d, m, y] = existingDateSuffixMatch[1].split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = monthNames[parseInt(m, 10) - 1] || m;
    quoteDate = `${d} ${monthName} ${y}`;
  } else {
    quoteDate = proposal.quoteDate ? gb(new Date(proposal.quoteDate)) : gb(now);
  }
  const validUntil = proposal.validUntil ? gb(new Date(proposal.validUntil)) : gb(new Date(now.getTime() + validForDays * 86400000));
  const money = (n: number) => `${cur} ${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const legacyItems = (proposal.items || []).filter((it: any) => (it?.description || '').trim());
  const formatTableItems = (list: any[]) => list.map((it: any, i: number) => ({
    id: it.id || i + 1,
    type: it.type || 'item',
    no: it.no || i + 1,
    description: it.description || '',
    qty: Number(it.qty) || 1,
    unitPrice: Number(it.unitPrice) || 0,
    total: Number(it.total) || ((Number(it.qty) || 1) * (Number(it.unitPrice) || 0)),
  }));

  let rawBlocks: any[] = Array.isArray(proposal.blocks) ? [...proposal.blocks] : [];
  const hasPopulatedTable = rawBlocks.some(
    (b: any) => b?.type === 'table' && Array.isArray(b?.items) && b.items.filter((it: any) => it?.type !== 'detail' && (it?.description || '').trim()).length > 0
  );

  if (!hasPopulatedTable && legacyItems.length > 0) {
    const emptyTableIdx = rawBlocks.findIndex((b: any) => b?.type === 'table');
    const tableItems = formatTableItems(legacyItems);
    if (emptyTableIdx >= 0) {
      rawBlocks[emptyTableIdx] = {
        ...rawBlocks[emptyTableIdx],
        items: tableItems,
        discountPercent: rawBlocks[emptyTableIdx].discountPercent !== undefined ? rawBlocks[emptyTableIdx].discountPercent : discount,
      };
    } else {
      rawBlocks.push({
        id: 'pricing_table_block',
        type: 'table',
        title: proposal.title || 'Scope of Work & Pricing',
        discountPercent: discount,
        items: tableItems,
      });
    }
  } else if (rawBlocks.length === 0 && legacyItems.length > 0) {
    rawBlocks = [{
      id: 'legacy',
      type: 'table',
      title: proposal.title || 'Scope of Work & Pricing',
      discountPercent: discount,
      items: formatTableItems(legacyItems),
    }];
  }

  const allBlocks: any[] = [...rawBlocks].map((b: any) => {
    if (b.type === 'text' && b.content) {
      return { ...b, content: normalizeColonTableToTabular(b.content, brand) };
    }
    return b;
  });
  const effectiveTerms = proposal.terms || effectiveTemplate?.terms || '';
  if (effectiveTerms && !rawBlocks.some((b: any) => b?.type === 'text')) {
    allBlocks.push({
      id: 'terms_block',
      type: 'text',
      title: 'Terms & Conditions',
      content: normalizeColonTableToTabular(/<[a-z][\s\S]*>/i.test(effectiveTerms) ? effectiveTerms : effectiveTerms.replace(/\n/g, '<br />'), brand),
    });
  }

  const esc = (v: any) => escapeHtml(String(v ?? ''));

  const blockTableTotal = (block: any) => {
    const rows = Array.isArray(block?.items) ? block.items : [];
    const sub = rows.reduce((a: number, it: any) => it?.type !== 'detail' ? a + (Number(it?.qty) || 0) * (Number(it?.unitPrice) || 0) : a, 0);
    const disc = Number(block?.discountPercent !== undefined && block?.discountPercent !== null && block?.discountPercent !== '' ? block.discountPercent : discount) || 0;
    const isAmount = block?.discountType === 'amount';
    const discAmount = isAmount ? Math.min(sub, Math.max(0, disc)) : (sub * disc / 100);
    return { sub, disc, discAmount, isAmount, total: Math.max(0, sub - discAmount) };
  };

  const renderTable = (block: any, slice?: any, pageNum?: number) => {
    const isContinuation = slice?.isTableContinuation ?? false;
    const isEnd = slice?.isTableEnd ?? true;
    const rows = Array.isArray(slice?.itemsSlice) ? slice.itemsSlice : (Array.isArray(block?.items) ? block.items : []);
    const rowsHtml = rows.map((it: any) => {
      if (it?.type === 'detail') {
        return `<tr data-row="${slice?.globalIndex ?? 0}:${(block?.items || []).indexOf(it)}" style="border-bottom:1px solid #e2e8f0;background:#f8fafc;">
          <td style="padding:6px 8px;"></td>
          <td style="padding:6px 14px;color:#64748b;font-weight:400;word-break:break-word;">${esc(it?.description)}</td>
          <td style="padding:6px 8px;"></td>
          <td style="padding:6px 14px;"></td>
          <td style="padding:6px 14px;"></td>
        </tr>`;
      }
      const qty = Number(it?.qty) || 0;
      const price = Number(it?.unitPrice) || 0;
      const rowTotal = qty * price;
      return `<tr data-row="${slice?.globalIndex ?? 0}:${(block?.items || []).indexOf(it)}" style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:8px 10px;text-align:center;color:#64748b;font-weight:600;font-size:0.82rem;">${it?.no ?? ''}</td>
        <td style="padding:7px 14px;font-weight:600;color:#0f172a;word-break:break-word;">${esc(it?.description)}</td>
        <td style="padding:6px 8px;text-align:center;">${qty}</td>
        <td style="padding:6px 14px;text-align:right;font-family:monospace;">${price > 0 ? price.toFixed(2) : '<span style="color:#94a3b8;">—</span>'}</td>
        <td style="padding:8px 14px;text-align:right;font-weight:700;font-family:monospace;">${rowTotal > 0 ? `${rowTotal.toFixed(2)}` : '<span style="display:inline-block;background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;padding:2px 7px;border-radius:5px;font-size:11px;font-weight:800;letter-spacing:0.04em;">FREE</span>'}</td>
      </tr>`;
    }).join('');
    const { sub, disc, discAmount, isAmount, total } = blockTableTotal(block);
    return `
      <div data-est="${slice?.estWeight ?? ''}" style="margin-bottom:16px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#ffffff;">
        ${isContinuation ? `
        <div data-role="table-banner" style="background:#f8fafc;padding:6px 14px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:11px;font-weight:800;color:${brand};text-transform:uppercase;letter-spacing:0.04em;">Pricing Table #${(slice?.globalIndex ?? 0) + 1} (Continued)</span>
          <span style="font-size:10.5px;color:#64748b;font-weight:600;">Continued from Page ${(pageNum ?? 2) - 1}</span>
        </div>` : ''}
        <table style="width:100%;border-collapse:separate;border-spacing:0;font-size:0.84rem;table-layout:fixed;">
          <colgroup><col style="width:44px;"><col><col style="width:60px;"><col style="width:158px;"><col style="width:158px;"></colgroup>
          <thead>
            <tr style="background:${brand};color:#fff;">
              <th style="border:none;border-top-left-radius:7px;background:${brand};color:#fff;padding:9px 8px;text-align:center;font-weight:700;font-size:0.78rem;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;">No</th>
              <th style="border:none;background:${brand};color:#fff;padding:9px 14px;text-align:left;font-weight:700;font-size:0.78rem;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;">Description</th>
              <th style="border:none;background:${brand};color:#fff;padding:9px 8px;text-align:center;font-weight:700;font-size:0.78rem;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;">Qty</th>
              <th style="border:none;background:${brand};color:#fff;padding:9px 14px;text-align:right;font-weight:700;font-size:0.78rem;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;">Unit Price (${cur})</th>
              <th style="border:none;border-top-right-radius:7px;background:${brand};color:#fff;padding:9px 14px;text-align:right;font-weight:700;font-size:0.78rem;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;">Amount (${cur})</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot data-role="table-tfoot" data-end="${isEnd ? 1 : 0}" data-disc="${discAmount > 0 ? 1 : 0}" style="background:#f8fafc;border-top:2px solid #e2e8f0;">
            ${isEnd ? `
              ${discAmount > 0 ? `
                <tr>
                  <td colspan="4" style="text-align:right;padding:8px 14px;font-weight:600;color:#64748b;font-size:0.84rem;border:none;white-space:nowrap;">Subtotal:</td>
                  <td style="text-align:right;padding:8px 14px;font-weight:700;color:#0f172a;font-family:monospace;font-size:0.88rem;border:none;white-space:nowrap;">${money(sub)}</td>
                </tr>
                <tr>
                  <td colspan="4" style="text-align:right;padding:6px 14px;font-weight:700;color:#dc2626;font-size:0.84rem;border:none;white-space:nowrap;">Discount (${isAmount ? 'Amount' : `${disc}%`}):</td>
                  <td style="text-align:right;padding:6px 14px;font-weight:700;color:#dc2626;font-family:monospace;font-size:0.88rem;border:none;white-space:nowrap;">-${money(discAmount)}</td>
                </tr>
              ` : ''}
              <tr style="border-top:1px solid #e2e8f0;">
                <td colspan="4" style="text-align:right;padding:12px 14px;font-weight:800;color:#0f172a;font-size:0.92rem;border:none;white-space:nowrap;">Table Total:</td>
                <td style="text-align:right;padding:12px 14px;font-weight:900;color:${brand};font-family:monospace;font-size:1.02rem;border:none;white-space:nowrap;">${money(total)}</td>
              </tr>
              <tr style="border-top:1px dashed #e2e8f0;background:#ffffff;">
                <td colspan="5" style="border:none;border-bottom-left-radius:7px;border-bottom-right-radius:7px;padding:10px 14px;font-size:0.80rem;color:#475569;font-style:italic;">
                  <span style="font-weight:700;color:#0f172a;font-style:normal;margin-right:6px;">Amount in Words:</span>
                  ${esc(amountToWords(total, settings?.country || 'QA'))}
                </td>
              </tr>
            ` : `
              <tr>
                <td colspan="5" style="border:none;border-bottom-left-radius:7px;border-bottom-right-radius:7px;padding:9px 14px;font-size:0.80rem;color:${brand};font-weight:700;font-style:italic;text-align:right;">
                  ↳ Pricing Table #${(slice?.globalIndex ?? 0) + 1} continues on Page ${(pageNum ?? 1) + 1}...
                </td>
              </tr>
            `}
          </tfoot>
        </table>
      </div>`;
  };

  const renderText = (block: any, slice?: any, pageNum?: number) => {
    const isContinuation = slice?.isTextContinuation ?? false;
    const rawContent = slice?.contentSlice !== undefined ? slice.contentSlice : (block?.content || '');
    const htmlToRender = cleanWordArtifacts(rawContent);
    return `
      <div class="textblock" data-est="${slice?.estWeight ?? ''}">
        ${block?.title ? (
          isContinuation
            ? `<div class="textblock-title" data-role="text-title-cont" style="font-size:0.85rem;color:#64748b;display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                <span style="color:${brand};font-weight:800;">${esc(block.title)}</span>
                <span style="font-size:0.75rem;background:#f1f5f9;padding:2px 7px;border-radius:4px;font-weight:700;">(Continued from Page ${(pageNum ?? 2) - 1})</span>
              </div>`
            : `<div class="textblock-title" data-role="text-title">${esc(block.title)}</div>`
        ) : ''}
        <div class="rich">${htmlToRender}</div>
      </div>`;
  };

  if (collect) {
    allBlocks.forEach((b: any) => {
      if (b?.type === 'text') {
        const seq: Array<[string, string]> = splitHtmlBlocks(b?.content || '').map((u) => [u, cleanWordArtifacts(u)] as [string, string]);
        seq.forEach(([u, c]) => collect.units.set(u, c));
        if (seq.length) (collect.sequences = collect.sequences || []).push(seq);
        if (b?.content) collect.units.set(b.content, cleanWordArtifacts(b.content));
      }
    });
  }

  const tableCount = allBlocks.filter((b: any) => b?.type === 'table').length;
  const ot = proposal.overallTotal || effectiveTemplate?.overallTotal || {};
  const isOtVisible = Boolean(ot?.show === true);
  const lm = data.layoutMetrics;
  const safety = lm?.safety ?? 0;
  const layoutMetrics: LayoutMetrics | undefined = lm ? {
    availFirst: lm.availFirst !== undefined ? lm.availFirst - safety : undefined,
    availOther: lm.availOther !== undefined ? lm.availOther - safety : undefined,
    gridOverhead: lm.gridOverhead,
    textGap: lm.textGap, titleH: lm.titleH, contTitleH: lm.contTitleH, tableHead: lm.tableHead,
    tableBanner: lm.tableBanner, tailMore: lm.tailMore, tailEnd: lm.tailEnd, tailEndDisc: lm.tailEndDisc,
    unitHeight: (u) => lm.unitHeights?.[u],
    itemHeight: (_it, bi, ii) => lm.itemHeights?.[`${bi}:${ii}`],
    reserveLast: isOtVisible ? 112 : 0,
  } : (isOtVisible ? { reserveLast: 112 } : undefined);

  const chunks = chunkDocumentBlocksForA4Pages(allBlocks, {
    hasHeaderImage: Boolean(headerUrl),
    hasFooterImage: Boolean(footerUrl),
    isEditor: false,
    honorPageBreaks: false,
    isLetter: Boolean(data.letter),
    metrics: layoutMetrics,
  });

  const grandTotal = allBlocks.reduce((s: number, b: any) => b?.type === 'table' ? s + blockTableTotal(b).total : s, 0);

  return `
    <!DOCTYPE html>
    <html><head>
      <meta charset="utf-8" />
      <title>${data.letter ? esc(data.letter.subject || name) : `Quotation – ${esc(name)}`}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        html, body {
          font-family: 'Outfit', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #1e293b;
          margin: 0;
          padding: 0;
          background: #ffffff;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        @page {
          size: A4 portrait;
          margin: 0;
        }
        .doc {
          display: block;
          padding: 0;
          margin: 0 auto;
          width: 100%;
        }
        .page.a4-discrete-sheet {
          width: 210mm;
          min-height: 297mm;
          max-height: 297mm;
          height: 297mm;
          background: #ffffff;
          padding: 0;
          position: relative;
          margin: 0 auto;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          overflow: hidden;
          page-break-after: always;
          break-after: page;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .page.a4-discrete-sheet:last-child {
          page-break-after: auto;
          break-after: auto;
        }
        .wm {
          position: absolute;
          inset: 0;
          z-index: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          opacity: 0.05;
        }
        .wm img {
          width: min(58%, 500px);
          object-fit: contain;
        }
        .run-header {
          width: 100%;
          overflow: hidden;
          background: #ffffff;
          border-bottom: 1.5px solid #cbd5e1;
          text-align: center;
          margin: 0;
          padding: 0;
          flex-shrink: 0 !important;
          box-sizing: border-box;
        }
        .run-header img {
          width: 100%;
          height: auto;
          display: block;
        }
        .quotation-footer-banner {
          width: 100%;
          border-top: 1.5px solid #cbd5e1;
          position: relative;
          z-index: 1;
          margin-top: auto;
          flex-shrink: 0 !important;
          box-sizing: border-box;
        }
        .quotation-footer-banner img {
          width: 100%;
          height: auto;
          display: block;
          border-radius: 0;
        }
        .inner-content {
          padding: 0 36px 10px 36px;
          box-sizing: border-box;
        }
        .letterhead-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .co-name {
          font-size: 1.4rem;
          color: ${brand};
          font-weight: 800;
          margin-bottom: 4px;
        }
        .co-line {
          font-size: 0.82rem;
          color: #475569;
          margin-bottom: 2px;
        }
        .co-kv {
          display: flex;
          gap: 8px;
          font-size: 0.82rem;
          margin-top: 2px;
        }
        .co-kv b {
          font-weight: 600;
          color: #64748b;
        }
        .cards-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 14px;
          font-size: 0.84rem;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .meta-card {
          background: #ffffff;
          border: 1.5px solid #cbd5e1;
          border-radius: 10px;
          padding: 12px 14px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
        }
        .meta-card-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 800;
          color: ${brand};
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #f1f5f9;
          padding-bottom: 6px;
          margin-bottom: 8px;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: 105px 12px 1fr;
          row-gap: 5px;
          align-items: center;
          font-size: 0.82rem;
        }
        .recipient-grid {
          display: grid;
          grid-template-columns: 100px 12px 1fr;
          row-gap: 4px;
          margin-top: 5px;
          align-items: center;
          font-size: 0.82rem;
        }
        .meta-colon {
          text-align: center;
          color: #64748b;
          font-weight: 700;
        }
        .meta-label {
          color: #64748b;
          font-weight: 600;
        }
        .meta-value {
          color: #0f172a;
          font-weight: 700;
        }
        .textblock {
          margin-bottom: 14px;
          page-break-inside: auto !important;
          break-inside: auto !important;
        }
        .textblock-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: ${brand};
          margin-bottom: 8px;
          page-break-after: avoid;
          break-after: avoid;
        }
        .rich {
          font-size: 0.96rem;
          line-height: 1.6;
          color: #1e293b;
        }
        .rich p {
          margin: 0 0 6px;
          line-height: 1.6;
          page-break-inside: auto;
          break-inside: auto;
        }
        .rich div {
          margin: 0 0 3px;
          line-height: 1.6;
          page-break-inside: auto;
          break-inside: auto;
        }
        .rich h1 {
          font-size: 1.35rem;
          font-weight: 800;
          color: ${brand};
          margin: 12px 0 6px 0;
          line-height: 1.25;
          break-after: avoid;
          page-break-after: avoid;
        }
        .rich h2 {
          font-size: 1.2rem;
          font-weight: 800;
          color: ${brand};
          margin: 10px 0 5px 0;
          line-height: 1.25;
          break-after: avoid;
          page-break-after: avoid;
        }
        .rich h3 {
          font-size: 1.05rem;
          font-weight: 700;
          color: #0f172a;
          margin: 8px 0 4px 0;
          line-height: 1.3;
          break-after: avoid;
          page-break-after: avoid;
        }
        .rich h4 {
          font-size: 0.95rem;
          font-weight: 700;
          color: #334155;
          margin: 6px 0 3px 0;
          line-height: 1.3;
          break-after: avoid;
          page-break-after: avoid;
        }
        .rich ul, .rich ol {
          margin: 4px 0 8px 22px;
          padding: 0;
          page-break-inside: auto;
          break-inside: auto;
        }
        .rich li {
          margin-bottom: 3px;
          line-height: 1.6;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .rich strong, .rich b { color: #0f172a; font-weight: 800; }
        .rich img, .rendered-email-body img {
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
        table.quotation-table-main {
          page-break-inside: auto;
          break-inside: auto;
        }
        table.quotation-table-main tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        /* ── Tabular Column Tables (quote-grid-table) ── */
        .rich table.quote-grid-table,
        table.quote-grid-table,
        .rich table:not(.specs-table):not([data-type="specs"]) {
          width: 100% !important;
          border-collapse: separate !important;
          border-spacing: 0 !important;
          margin: 10px 0 !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 8px !important;
          overflow: hidden !important;
          background: #ffffff !important;
        }
        .rich table.quote-grid-table th,
        table.quote-grid-table th,
        .rich table:not(.specs-table):not([data-type="specs"]) th {
          background: ${brand} !important;
          border: none !important;
          border-left: none !important;
          border-right: none !important;
          border-top: none !important;
          border-bottom: none !important;
          padding: 8px 12px !important;
          font-weight: 700 !important;
          color: #ffffff !important;
          text-align: left !important;
          font-size: 8pt !important;
          text-transform: uppercase !important;
          letter-spacing: 0.04em !important;
          line-height: 1.4 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .rich table.quote-grid-table th:first-child,
        table.quote-grid-table th:first-child,
        .rich table:not(.specs-table):not([data-type="specs"]) th:first-child {
          border-top-left-radius: 7px !important;
        }
        .rich table.quote-grid-table th:last-child,
        table.quote-grid-table th:last-child,
        .rich table:not(.specs-table):not([data-type="specs"]) th:last-child {
          border-top-right-radius: 7px !important;
        }
        .rich table.quote-grid-table td,
        table.quote-grid-table td,
        .rich table:not(.specs-table):not([data-type="specs"]) td {
          border: none !important;
          border-bottom: 1px solid #e2e8f0 !important;
          padding: 8px 12px !important;
          font-size: 8.5pt !important;
          line-height: 1.45 !important;
          color: #0f172a !important;
          vertical-align: top !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .rich table.quote-grid-table tr:last-child td,
        table.quote-grid-table tr:last-child td,
        .rich table:not(.specs-table):not([data-type="specs"]) tr:last-child td {
          border-bottom: none !important;
        }
        .rich table.quote-grid-table tr:last-child td:first-child,
        table.quote-grid-table tr:last-child td:first-child,
        .rich table:not(.specs-table):not([data-type="specs"]) tr:last-child td:first-child {
          border-bottom-left-radius: 7px !important;
        }
        .rich table.quote-grid-table tr:last-child td:last-child,
        table.quote-grid-table tr:last-child td:last-child,
        .rich table:not(.specs-table):not([data-type="specs"]) tr:last-child td:last-child {
          border-bottom-right-radius: 7px !important;
        }
        .rich table.quote-grid-table tbody tr:nth-child(even) td,
        table.quote-grid-table tbody tr:nth-child(even) td {
          background: #fafbfc !important;
        }
        .rich table.quote-grid-table tr,
        table.quote-grid-table tr {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }

        /* ── Specifications / Key-Value Tables (Specs Tables) ── */
        .rich table.specs-table,
        .rich table[data-type="specs"],
        table.specs-table,
        table[data-type="specs"] {
          width: 100% !important;
          table-layout: fixed !important;
          border-collapse: collapse !important;
          margin: 4px 0 !important;
          border: 1px solid #e2e8f0 !important;
        }
        .rich table.specs-table tr,
        .rich table[data-type="specs"] tr,
        table.specs-table tr,
        table[data-type="specs"] tr {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          background: transparent !important;
        }
        .rich table.specs-table td,
        .rich table[data-type="specs"] td,
        table.specs-table td,
        table[data-type="specs"] td {
          border: 1px solid #e2e8f0 !important;
          padding: 5px 8px !important;
          font-size: 9.5pt !important;
          line-height: 1.5 !important;
          background: transparent !important;
        }
        .rich table.specs-table td:first-child,
        .rich table[data-type="specs"] td:first-child,
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
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
      </style>
    </head>
    <body>
      <main class="doc">
        ${chunks.map((chunk) => `
          <section class="page a4-discrete-sheet">
            ${watermarkUrl ? `<div class="wm"><img src="${watermarkUrl}" alt="" /></div>` : ''}

            <!-- TOP HEADER SECTION -->
            ${chunk.isFirst ? `
              <div>
                ${headerUrl ? `
                  <div class="run-header">
                    <img src="${headerUrl}" alt="header" />
                  </div>
                ` : `
                  <div class="letterhead-top" style="padding:20px 36px 0 36px;margin-bottom:14px;">
                    <div>
                      <div class="co-name">${esc(company.name)}</div>
                      ${company.a1 ? `<div class="co-line">${esc(company.a1)}</div>` : ''}
                      ${company.a2 ? `<div class="co-line">${esc(company.a2)}</div>` : ''}
                      ${company.phone ? `<div class="co-kv"><b>Phone:</b> ${esc(company.phone)}</div>` : ''}
                      ${company.email ? `<div class="co-kv"><b>Email:</b> ${esc(company.email)}</div>` : ''}
                    </div>
                    ${data.letter ? '' : `<div style="text-align: right; margin-left: auto;">
                      <h2 style="margin: 0; font-size: 1.4rem; font-weight: 900; color: #0f172a; letter-spacing: 0.06em;">QUOTATION</h2>
                      <div style="font-size: 0.85rem; color: ${brand}; font-weight: 700; margin-top: 4px;">${esc(quoteNo)}</div>
                    </div>`}
                  </div>
                  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0 36px 16px 36px;" />
                `}

                ${data.letter ? '<div style="height:6px;"></div>' : `
                <div class="inner-content">
                  ${headerUrl ? `
                    <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
                      ${quoteNo ? `<div style="font-size:0.85rem;color:${brand};font-weight:700;">${esc(quoteNo)}</div>` : ''}
                    </div>
                  ` : ''}

                  <div class="cards-grid">
                    <div class="meta-card">
                      <div class="meta-card-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${brand}" stroke-width="2.5"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
                        <span>Recipient Information</span>
                      </div>
                      <div style="font-weight: 800; font-size: 0.95rem; color: #0f172a; margin-bottom: 4px;">
                        ${esc(client.company || 'Valued Client')}
                      </div>
                      ${client.a1 ? `<div style="color: #64748b; font-size: 0.82rem; margin-bottom: 4px;">${esc(client.a1)}</div>` : ''}
                      <div class="recipient-grid">
                        ${client.contactName ? `
                          <span class="meta-label">Contact Name</span>
                          <span class="meta-colon">:</span>
                          <span class="meta-value">${esc(client.contactName)}</span>
                        ` : ''}
                        ${client.phone ? `
                          <span class="meta-label">Phone</span>
                          <span class="meta-colon">:</span>
                          <span class="meta-value">${esc(client.phone)}</span>
                        ` : ''}
                        ${client.email ? `
                          <span class="meta-label">Email</span>
                          <span class="meta-colon">:</span>
                          <span class="meta-value">${esc(client.email)}</span>
                        ` : ''}
                      </div>
                    </div>

                    <div class="meta-card">
                      <div class="meta-card-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${brand}" stroke-width="2.5"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
                        <span>Document Specifications</span>
                      </div>
                      <div class="meta-grid">
                        <span class="meta-label">Quotation No</span>
                        <span class="meta-colon">:</span>
                        <span class="meta-value" style="font-family: monospace; color: ${brand}; font-weight: 800;">${esc(quoteNo)}</span>

                        ${revNum > 0 ? `
                          <span class="meta-label">Revision</span>
                          <span class="meta-colon">:</span>
                          <span class="meta-value" style="font-weight: 700; color: #7c3aed;">Rev ${revNum} (Revised)</span>
                        ` : ''}

                        <span class="meta-label">Quote Date</span>
                        <span class="meta-colon">:</span>
                        <span class="meta-value">${esc(quoteDate)}</span>

                        <span class="meta-label">Validity Period</span>
                        <span class="meta-colon">:</span>
                        <span class="meta-value">${validForDays} Days</span>

                        <span class="meta-label">Valid Until</span>
                        <span class="meta-colon">:</span>
                        <span class="meta-value">${esc(validUntil)}</span>

                        ${senderEmail ? `
                          <span class="meta-label">Sender Email</span>
                          <span class="meta-colon">:</span>
                          <span class="meta-value">${esc(senderEmail)}</span>
                        ` : ''}

                        ${senderPhone ? `
                          <span class="meta-label">Contact No</span>
                          <span class="meta-colon">:</span>
                          <span class="meta-value">${esc(senderPhone)}</span>
                        ` : ''}

                        ${discount > 0 ? `
                          <span class="meta-label">Overall Discount</span>
                          <span class="meta-colon">:</span>
                          <span class="meta-value" style="color: #dc2626; font-weight: 800;">${discount}%</span>
                        ` : ''}
                      </div>
                    </div>
                  </div>
                </div>
                `}
              </div>
            ` : `
              <!-- Continuation Header (Page 2+) — Matching Create/Edit Canvas Header Banner -->
              <div style="flex-shrink:0;width:100%;box-sizing:border-box;">
                ${headerUrl ? `
                  <div class="run-header">
                    <img src="${headerUrl}" alt="header" />
                  </div>
                  <div class="quotation-running-subhead" style="display:flex;justify-content:space-between;align-items:center;padding:8px 36px;border-bottom:1px solid #cbd5e1;background:#ffffff;margin-bottom:14px;box-sizing:border-box;flex-shrink:0;">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <span style="font-weight:800;font-size:12px;color:${brand};">${esc(company.name)}</span>
                      ${refLabel ? `<span style="font-size:11.5px;color:#64748b;font-weight:600;">· ${esc(refLabel)}</span>` : ''}
                    </div>
                    <div style="font-size:10.5px;font-weight:800;color:${brand};background:rgba(109,40,217,0.08);padding:2px 8px;border-radius:5px;text-transform:uppercase;letter-spacing:0.04em;">
                      Page ${chunk.pageNum} of ${chunks.length}
                    </div>
                  </div>
                ` : `
                  <div class="quotation-running-subhead" style="display:flex;justify-content:space-between;align-items:center;padding:14px 36px;border-bottom:1px solid #cbd5e1;background:#ffffff;margin-bottom:14px;box-sizing:border-box;flex-shrink:0;">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <span style="font-weight:800;font-size:13px;color:${brand};">${esc(company.name)}</span>
                      ${refLabel ? `<span style="font-size:12px;color:#64748b;font-weight:600;">· ${esc(refLabel)}</span>` : ''}
                    </div>
                    <div style="font-size:11px;font-weight:800;color:${brand};background:rgba(109,40,217,0.08);padding:3px 10px;border-radius:6px;text-transform:uppercase;letter-spacing:0.04em;">
                      Page ${chunk.pageNum} of ${chunks.length}
                    </div>
                  </div>
                `}
              </div>
            `}

            <!-- MIDDLE BLOCKS CONTENT -->
            <div data-role="page-content" style="padding:0 36px 14px 36px;flex:1;box-sizing:border-box;min-height:0;">
              ${chunk.slices.length ? chunk.slices.map((slice: any) => slice.block?.type === 'text' ? renderText(slice.block, slice, chunk.pageNum) : renderTable(slice.block, slice, chunk.pageNum)).join('') : (chunk.isLast && isOtVisible ? '' : '<div style="padding:48px;text-align:center;color:#94a3b8;font-style:italic;border:2px dashed #e2e8f0;border-radius:12px;">No content in this quotation yet.</div>')}

              ${(() => {
                const ot = proposal.overallTotal || effectiveTemplate?.overallTotal || {};
                const isOtVisible = Boolean(ot?.show === true);
                if (!chunk.isLast || !isOtVisible) return '';
                const otLabel = String(ot.label || 'Overall Quotation Total:').trim();
                const otNotes = ot.notes ? String(ot.notes).trim() : '';
                const showWords = ot.showWords !== false;
                return `
                <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding:12px 18px;background:#f8fafc;border-radius:10px;border:2px solid ${brand};margin-top:14px;margin-bottom:18px;">
                  <div style="font-size:0.8rem;color:#475569;text-align:left;max-width:55%;">
                    ${otNotes ? `<div style="font-weight:600;color:#334155;white-space:pre-line;">${esc(otNotes)}</div>` : ''}
                  </div>
                  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                    <div style="font-size:1.25rem;font-weight:900;color:#0f172a;display:flex;align-items:center;gap:12px;">
                      <span>${esc(otLabel)}</span>
                      <span style="color:${brand};">${money(grandTotal)}</span>
                    </div>
                    ${showWords ? `
                    <div style="font-size:0.82rem;color:#475569;font-style:italic;">
                      <span style="font-weight:700;color:#0f172a;font-style:normal;margin-right:6px;">Amount in Words:</span>
                      ${esc(amountToWords(grandTotal, settings?.country || 'QA'))}
                    </div>` : ''}
                  </div>
                </div>`;
              })()}
            </div>

            <!-- BOTTOM FOOTER SECTION -->
            ${footerUrl ? `
              <div data-role="page-footer" style="margin-top:auto;width:100%;flex-shrink:0;">
                <div class="quotation-footer-banner">
                  <img src="${footerUrl}" alt="footer" />
                </div>
              </div>
            ` : `
              <div class="quotation-text-footer" data-role="page-footer" style="margin-top:auto;width:100%;flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:12px 36px;border-top:1px solid #cbd5e1;font-size:11px;color:#94a3b8;background:#ffffff;box-sizing:border-box;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-weight:600;color:#64748b;">${esc(company.name)}</span>
                  <span style="opacity:0.6;">·</span>
                  <span>Confidential Quotation</span>
                </div>
                <span style="font-weight:700;color:#64748b;">Page ${chunk.pageNum} of ${chunks.length}</span>
              </div>
            `}
          </section>
        `).join('')}
      </main>
    </body></html>
  `;
};

/**
 * Runs inside a real browser page that already shows a first-pass render of the proposal.
 * Measures the true usable height of the pages and the true height of every text unit and table row,
 * so the second-pass pagination uses real numbers instead of character-count guesses.
 */
export const MEASURE_LAYOUT_SCRIPT = `async (arg) => {
  const d = document;
  try { if (d.fonts && d.fonts.ready) await Promise.race([d.fonts.ready, new Promise((r) => setTimeout(r, 4000))]); } catch (e) {}
  await Promise.all([...d.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })));
  const SAFE = 6;
  const pages = [...d.querySelectorAll('.a4-discrete-sheet')];
  const avail = (p) => {
    const mid = p.querySelector('[data-role="page-content"]');
    const foot = p.querySelector('[data-role="page-footer"]');
    if (!mid || !foot) return null;
    const pt = p.getBoundingClientRect().top;
    const mt = mid.getBoundingClientRect().top - pt;
    const ft = foot.getBoundingClientRect().top - pt;
    const pb = parseFloat(getComputedStyle(mid).paddingBottom) || 0;
    return Math.floor(ft - mt - pb - SAFE);
  };
  const out = { unitHeights: {}, itemHeights: {} };
  if (pages[0]) out.availFirst = avail(pages[0]);
  if (pages[1]) out.availOther = avail(pages[1]);
  d.querySelectorAll('tr[data-row]').forEach((tr) => { out.itemHeights[tr.getAttribute('data-row')] = tr.getBoundingClientRect().height; });
  const sb = d.createElement('div');
  sb.className = 'page a4-discrete-sheet';
  sb.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;height:auto;min-height:0;max-height:none;overflow:visible;display:block;';
  const mid0 = d.querySelector('[data-role="page-content"]');
  const cs0 = mid0 ? getComputedStyle(mid0) : null;
  sb.innerHTML = '<div style="padding:0 ' + (cs0 ? cs0.paddingRight : '36px') + ' 14px ' + (cs0 ? cs0.paddingLeft : '36px') + ';box-sizing:border-box"><div class="textblock"><div class="rich" style="display:flow-root"></div></div></div>';
  d.body.appendChild(sb);
  const rich = sb.querySelector('.rich');
  const gridChrome = [];
  for (const pair of arg.units) {
    rich.innerHTML = pair[1];
    const total = rich.getBoundingClientRect().height;
    const rows = rich.querySelectorAll('tbody tr');
    if (/^\\s*<table[^>]*quote-grid-table/.test(pair[1]) && rows.length === 1) {
      const h = rows[0].getBoundingClientRect().height;
      out.unitHeights[pair[0]] = h;
      gridChrome.push(total - h);
    } else {
      out.unitHeights[pair[0]] = total;
    }
  }
  if (gridChrome.length) out.gridOverhead = Math.ceil(Math.max.apply(null, gridChrome));
  // Marginal height of each unit *in the context of the units before it* (adjacent paragraph margins collapse, so
  // summing stand-alone heights over-counts). Grid-table rows keep their own row-height measurement above.
  const merge = (h) => h
    .replace(/<\\/ul>\\s*<ul\\b[^>]*>/gi, '')
    .replace(/<\\/ol>\\s*<ol\\b[^>]*>/gi, '')
    .replace(/<\\/tbody><\\/table>\\s*<table\\b[^>]*quote-grid-table[^>]*>\\s*<thead\\b[\\s\\S]*?<\\/thead>\\s*<tbody>/gi, '')
    .replace(/<\\/tbody><\\/table>\\s*<table[^>]*>(?:<colgroup>[\\s\\S]*?<\\/colgroup>)?\\s*<tbody>/gi, '');
  for (const seq of (arg.sequences || [])) {
    let prev = 0;
    const acc = [];
    for (const pair of seq) {
      acc.push(pair[1]);
      rich.innerHTML = merge(acc.join('\\n'));
      const h = rich.getBoundingClientRect().height;
      if (!/^\\s*<table[^>]*quote-grid-table/.test(pair[1])) out.unitHeights[pair[0]] = Math.max(0, h - prev);
      prev = h;
    }
  }
  sb.remove();
  const num = (v) => parseFloat(v) || 0;
  d.querySelectorAll('[data-est]').forEach((w) => {
    const mb = num(getComputedStyle(w).marginBottom);
    if (w.classList.contains('textblock')) {
      out.textGap = mb;
      const t = w.querySelector('[data-role="text-title"]');
      if (t && out.titleH === undefined) out.titleH = Math.ceil(t.getBoundingClientRect().height + num(getComputedStyle(t).marginBottom));
      const tc = w.querySelector('[data-role="text-title-cont"]');
      if (tc && out.contTitleH === undefined) out.contTitleH = Math.ceil(tc.getBoundingClientRect().height + num(getComputedStyle(tc).marginBottom));
      return;
    }
    const th = w.querySelector('thead');
    const tf = w.querySelector('[data-role="table-tfoot"]');
    if (!th || !tf) return;
    let rowsH = 0;
    w.querySelectorAll('tr[data-row]').forEach((r) => { rowsH += r.getBoundingClientRect().height; });
    const ban = w.querySelector('[data-role="table-banner"]');
    const banH = ban ? ban.getBoundingClientRect().height : 0;
    const theadH = th.getBoundingClientRect().height;
    const tail = Math.ceil(w.getBoundingClientRect().height + mb - rowsH - theadH - banH);
    out.tableHead = Math.ceil(theadH);
    if (ban) out.tableBanner = Math.ceil(banH);
    if (tf.getAttribute('data-end') === '1') {
      if (tf.getAttribute('data-disc') === '1') out.tailEndDisc = tail; else out.tailEnd = tail;
    } else {
      out.tailMore = tail;
    }
  });
  return out;
}`;

/** Returns how many px (if any) content spills past the footer on the worst page. <= 0 means everything fits. */
export const CHECK_OVERFLOW_SCRIPT = `async () => {
  try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]); } catch (e) {}
  let worst = -999;
  document.querySelectorAll('.a4-discrete-sheet').forEach((p) => {
    const mid = p.querySelector('[data-role="page-content"]');
    const foot = p.querySelector('[data-role="page-footer"]');
    if (!mid || !foot) return;
    const limit = foot.getBoundingClientRect().top - 2;
    [...mid.children].forEach((k) => {
      const r = k.getBoundingClientRect();
      if (r.height > 0) worst = Math.max(worst, r.bottom - limit);
    });
  });
  return Math.ceil(worst);
}`;

/**
 * Two-pass render: estimate → measure in the real browser → re-paginate with real heights → verify that
 * nothing spills over the footer (growing a safety margin until it doesn't). Leaves the final HTML loaded in `page`.
 */
/** Loads HTML without letting a slow/blocked web-font request stall the whole PDF (fonts are awaited, but only briefly). */
const loadProposalHtml = async (page: any, html: string): Promise<void> => {
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.evaluate(`Promise.race([(document.fonts && document.fonts.ready) || Promise.resolve(), new Promise((r) => setTimeout(r, 4000))])`);
};

export const buildMeasuredProposalHtml = async (page: any, data: ProposalPdfData): Promise<string> => {
  const collect: { units: Map<string, string>; sequences?: Array<Array<[string, string]>> } = { units: new Map<string, string>() };
  let html = buildProposalFullHtml(data, collect);
  try {
    await page.emulateMediaType('print');
    await loadProposalHtml(page, html);
    const measured = await page.evaluate(`(${MEASURE_LAYOUT_SCRIPT})(${JSON.stringify({ units: [...collect.units.entries()], sequences: collect.sequences || [] })})`);
    let metrics: SerializedLayoutMetrics = { ...measured, safety: 0 };
    for (let attempt = 0; attempt < 5; attempt++) {
      html = buildProposalFullHtml({ ...data, layoutMetrics: metrics });
      await loadProposalHtml(page, html);
      const over = Number(await page.evaluate(`(${CHECK_OVERFLOW_SCRIPT})()`));
      // Chrome that did not exist in the first pass (e.g. continuation banners) shows up now – learn it once
      if (attempt === 0) {
        const again: any = await page.evaluate(`(${MEASURE_LAYOUT_SCRIPT})({units: []})`);
        const learned: any = {};
        ['textGap', 'titleH', 'contTitleH', 'tableHead', 'tableBanner', 'tailMore', 'tailEnd', 'tailEndDisc'].forEach((k) => {
          if ((metrics as any)[k] === undefined && again[k] !== undefined) learned[k] = again[k];
        });
        if (Object.keys(learned).length) {
          metrics = { ...metrics, ...learned };
          continue;
        }
      }
      if (process.env.DEBUG_LAYOUT) console.log('[layout] attempt', attempt, 'overflow', over, 'safety', metrics.safety, 'availFirst', metrics.availFirst, 'availOther', metrics.availOther);
      if (!(over > 0)) break;
      metrics = { ...metrics, safety: (metrics.safety || 0) + over + 2 };
    }
  } catch (err) {
    console.warn('[PDF] Layout measurement failed, using estimated pagination:', err);
    html = buildProposalFullHtml(data);
    await loadProposalHtml(page, html);
  }
  return html;
};

const renderProposalPdfOnce = async (data: ProposalPdfData): Promise<Buffer> => {
  let browser: any = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
    });

    const page = await browser.newPage();
    await buildMeasuredProposalHtml(page, data);
    await page.emulateMediaType('print');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      preferCSSPageSize: true,
    });
    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        // ignore close error
      }
    }
  }
};

/**
 * Renders a PDF with the measured A4 layout in headless Chrome. A failed launch/render is retried (fresh browser each
 * time); throws only after every attempt failed so callers can choose their own last-resort fallback.
 */
export const renderProposalPdfWithChrome = async (data: ProposalPdfData): Promise<Buffer> => {
  const attempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await renderProposalPdfOnce(data);
    } catch (err) {
      lastErr = err;
      console.warn(`[PDF] Chrome render attempt ${attempt}/${attempts} failed:`, err);
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw lastErr;
};

/** Proposal PDF: measured A4 layout; the plain PDFKit layout is only a last resort if Chrome is unavailable. */
export const generateUnifiedProposalPdf = async (data: ProposalPdfData): Promise<Buffer> => {
  try {
    return await renderProposalPdfWithChrome(data);
  } catch (lastErr) {
    console.error('[PDF] All Chrome render attempts failed – using the legacy PDFKit layout as a last resort:', lastErr);
    return fallbackPdfKit(data);
  }
};
