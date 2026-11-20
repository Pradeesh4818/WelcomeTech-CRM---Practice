// Pure helpers for the Quotation Generator, extracted so their (bug-prone) logic is
// unit-testable without importing the full page component.
import { cleanWordArtifacts } from './documentStyles';

export interface ParsedProposalNo {
  prefix: string;
  num: number;
  padLength: number;
}

/**
 * Strips any trailing date suffix from a proposal number.
 * Examples:
 *   "IT/QT/8101/15-10-2026" -> "IT/QT/8101"
 *   "IT/QT/8101/15/10/2026" -> "IT/QT/8101"
 *   "IT/QT/8101/2026-10-15" -> "IT/QT/8101"
 *   "IT/QT/8101" -> "IT/QT/8101"
 */
export const stripDateSuffix = (proposalNo?: string): string => {
  const trimmed = (proposalNo || '').trim();
  if (!trimmed) return '';
  return trimmed
    .replace(/\/\d{2}-\d{2}-\d{4}$/, '')
    .replace(/\/\d{2}\/\d{2}\/\d{4}$/, '')
    .replace(/\/\d{4}-\d{2}-\d{2}$/, '');
};

/**
 * Formats a proposal sending date as DD-MM-YYYY (e.g. 15-10-2026).
 * Handles timezone safely (defaulting to Asia/Qatar UTC+3 for Welcome Tech CRM Qatar).
 * If the input is already a calendar date string (e.g. "05-11-2026" or "2026-11-05"),
 * it extracts the calendar day, month, and year directly without UTC shift.
 */
export const formatProposalSendingDate = (date?: Date | string | null, timeZone = 'Asia/Qatar'): string => {
  if (!date) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' });
    return formatter.format(now).replace(/\//g, '-');
  }

  if (typeof date === 'string') {
    const trimmed = date.trim();
    const dmyMatch = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (dmyMatch) {
      return `${dmyMatch[1]}-${dmyMatch[2]}-${dmyMatch[3]}`;
    }
    const textMonthMatch = trimmed.match(/^(\d{1,2})[-/\s]+([A-Za-z]+)[-/\s]+(\d{4})/);
    if (textMonthMatch) {
      const d = textMonthMatch[1].padStart(2, '0');
      const monthNames: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
      };
      const mStr = textMonthMatch[2].slice(0, 3).toLowerCase();
      const m = monthNames[mStr];
      if (m) {
        return `${d}-${m}-${textMonthMatch[3]}`;
      }
    }
    const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (ymdMatch && !trimmed.includes('T') && !trimmed.includes('Z')) {
      return `${ymdMatch[3]}-${ymdMatch[2]}-${ymdMatch[1]}`;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const formatter = new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' });
      return formatter.format(parsed).replace(/\//g, '-');
    }
  }

  if (date instanceof Date && !isNaN(date.getTime())) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  return '';
};

/**
 * Assembles the full proposal number, appending /sendingDate if includeDate is enabled.
 * If the input serialNo already has a valid date suffix (e.g. IT/QT/8109/05-11-2026 passed by the client),
 * that explicit user-confirmed date is preserved unless an explicit differing sendingDate was provided.
 */
export const buildProposalNumber = (
  serialNo: string,
  includeDate = false,
  sendingDate?: Date | string | null
): string => {
  const existingDateSuffixMatch = (serialNo || '').trim().match(/\/(\d{2}-\d{2}-\d{4})$/);
  const baseSerial = stripDateSuffix(serialNo);
  if (!includeDate) {
    return baseSerial;
  }
  if (existingDateSuffixMatch) {
    const formattedSendingDate = sendingDate ? formatProposalSendingDate(sendingDate) : null;
    if (!formattedSendingDate || formattedSendingDate === existingDateSuffixMatch[1]) {
      return `${baseSerial}/${existingDateSuffixMatch[1]}`;
    }
    return `${baseSerial}/${formattedSendingDate}`;
  }
  const dateStr = formatProposalSendingDate(sendingDate);
  return `${baseSerial}/${dateStr}`;
};

/**
 * Parses any proposal number string (e.g. "1001", "WT-Q1001", "PROP-0050", "Q-1")
 * into its alphanumeric prefix, numeric integer value, and zero-padding length.
 * Trailing date suffixes are automatically stripped before parsing.
 */
export const parseProposalNo = (str?: string): ParsedProposalNo => {
  const cleanStr = stripDateSuffix((str || '').trim());
  if (!cleanStr) {
    return { prefix: 'WT-Q', num: 1001, padLength: 4 };
  }
  const match = cleanStr.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const digitsStr = match[2];
    return {
      prefix,
      num: parseInt(digitsStr, 10),
      padLength: digitsStr.length,
    };
  }
  return {
    prefix: cleanStr.endsWith('-') || cleanStr.endsWith('/') ? cleanStr : `${cleanStr}-`,
    num: 1001,
    padLength: 4,
  };
};

/**
 * Formats parsed proposal number components back into a clean string.
 */
export const formatProposalNo = (parsed: ParsedProposalNo): string => {
  return `${parsed.prefix}${String(parsed.num).padStart(parsed.padLength, '0')}`;
};

/**
 * Calculates the next sequential proposal number, maintaining prefix and padding.
 */
export const incrementProposalNo = (str?: string): string => {
  const cleanStr = stripDateSuffix(str);
  const parsed = parseProposalNo(cleanStr);
  return `${parsed.prefix}${String(parsed.num + 1).padStart(parsed.padLength, '0')}`;
};

/**
 * Monthly or dynamic sequential quotation number.
 * If baseProposalNo is provided, generates/increments from that value.
 * Otherwise falls back to monthly sequence.
 * If includeDate is true, appends /sendingDate (e.g. IT/QT/8101/15-10-2026).
 */
export const getNextQuotationNumber = (
  increment = true,
  baseProposalNo?: string,
  includeDate = false,
  sendingDate?: Date | string | null
): string => {
  let serial = '';
  if (baseProposalNo && baseProposalNo.trim()) {
    const cleanBase = stripDateSuffix(baseProposalNo.trim());
    serial = increment ? incrementProposalNo(cleanBase) : cleanBase;
  } else {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    const key = `wt_quote_seq_${currentYear}_${currentMonth}`;

    const hasLocalStorage = typeof localStorage !== 'undefined';
    let seq = hasLocalStorage ? parseInt(localStorage.getItem(key) || '0', 10) : 0;
    if (increment) {
      seq += 1;
      if (hasLocalStorage) localStorage.setItem(key, seq.toString());
    } else if (seq === 0) {
      seq = 1;
      if (hasLocalStorage) localStorage.setItem(key, seq.toString());
    }

    serial = `WT-Q${currentYear}${currentMonth}${seq.toString().padStart(2, '0')}`;
  }

  return buildProposalNumber(serial, includeDate, sendingDate);
};

/**
 * Estimate the number of rendered lines for a rich-text (contentEditable) block.
 * The HTML contains no literal "\n", so we count block-level tags and add a rough
 * wrap estimate from the visible text length. Used for page-break weighting.
 */
export const estimateTextBlockLines = (html: string | undefined): number => {
  const content = html || '';
  const blockTags = (content.match(/<(p|div|br|li|h[1-6]|tr)\b/gi) || []).length;
  const tableTags = (content.match(/<table\b/gi) || []).length;
  const textLen = content.replace(/<[^>]+>/g, '').length;
  return Math.max(1, blockTags + tableTags * 3, Math.ceil(textLen / 75));
};

/**
 * Merge already-committed email tags with whatever is still typed (but not yet
 * committed) in the input, de-duplicated. Computed synchronously so a send never
 * relies on a not-yet-applied setState.
 */
export const mergeEmailRecipients = (existingTags: string[], rawInput: string): string[] => {
  const parsed = String(rawInput || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && e.includes('@'));
  const merged = [...(existingTags || [])];
  parsed.forEach((e) => { if (!merged.includes(e)) merged.push(e); });
  return merged;
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
  /** Pagination budget this page used / had (px) – lets the editor tell whether another line still fits */
  usedWeight?: number;
  maxWeight?: number;
}

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
  let raw = cleanWordArtifacts(html).trim();
  if (!raw) return [];

  // Normalize double <br> or double newlines into paragraph breaks
  raw = raw.replace(/(?:<br\s*\/?>\s*){2,}/gi, '</p><p>');
  raw = raw.replace(/\n\s*\n/g, '</p><p>');

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
    const innerMatch = t.match(/^<(div|section|article)\b[^>]*>([\s\S]*)<\/\1>$/i);
    if (innerMatch && innerMatch[2].match(/<(div|p|ul|ol|table|h[1-6])\b/i)) {
      refined.push(...splitHtmlBlocks(innerMatch[2]));
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
      // If the unit has multiple <br> tags and is not a table/image, split each line
      if (t.includes('<br') && !t.includes('<table') && !t.includes('<img') && !BLANK_LINE_RE.test(t) && !FLOW_BREAK_RE.test(t)) {
        const parts = t.split(/<br\s*\/?>/i).map(p => p.trim()).filter(Boolean);
        if (parts.length > 1) {
          for (const p of parts) {
            const cleanP = p.replace(/^<p\b[^>]*>/i, '').replace(/<\/p>$/i, '').trim();
            if (cleanP) {
              refined.push(`<p style="margin:0 0 6px 0;">${cleanP}</p>`);
            }
          }
          continue;
        }
      }

      const stripped = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (stripped.length > 180 && !t.includes('<table') && !t.includes('<img')) {
        const sentences = t.split(/(?<!\b(?:Co|Inc|Ltd|Corp|W\.L\.L|e\.g|i\.e|Mr|Mrs|Ms|Dr|vs|Rev|No)\.)(?<=[.!?])\s+(?=[A-Z0-9])/i);
        if (sentences.length > 1) {
          let cur = '';
          for (const s of sentences) {
            if ((cur + ' ' + s).length > 200) {
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
  // Bold + Underline in any order or style (e.g. <b><u>, <u><b>, <strong><u>, etc.)
  if (/<(b|strong)\b[^>]*>[\s\S]*?<(u)\b/i.test(unitHtml) || /<(u)\b[^>]*>[\s\S]*?<(b|strong)\b/i.test(unitHtml)) return true;
  if (/text-decoration:\s*underline/i.test(unitHtml) && /font-weight:\s*(bold|700|800|900)/i.test(unitHtml)) return true;

  const plainText = unitHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // A lead-in line ("…are as described below:") must stay with the table/list it introduces
  if (plainText.length > 0 && plainText.endsWith(':')) return true;
  // Standalone title lines (<= 90 chars) that are bold or end with : or ?
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
 * Calibrated against actual typography: font-size ~14px, line-height ~22px, paragraph margins.
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

/**
 * Deterministic A4 page chunker with item-level table slicing and unit-level text block slicing.
 * When table items or rich text exceed the 297mm (1123px) A4 page boundary,
 * content smoothly moves to the next A4 page with continuation headers,
 * ensuring footers are always fully visible on every page and no text is cut off.
 */
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
      usedWeight: currentWeight,
      maxWeight,
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
      const hasDiscount = (Number(block?.discountPercent) > 0) || (Number((block as any)?.discountAmount) > 0);
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
      usedWeight: currentWeight,
      maxWeight,
    });
  }

  if (chunks.length > 0) {
    chunks[chunks.length - 1].isLast = true;
  }

  return chunks;
};

/**
 * Normalizes pseudo-table colon rows or specs-table into a clean, modern tabular column grid table.
 * Replaces unbordered floating-colon key-value rows with a structured 2-column table featuring:
 * - Proper thead with headers (Terms & Conditions | Details or Component | Specification)
 * - Clean borders, padding, and subtle alternating row backgrounds
 */
export function normalizeColonTableToTabular(html: string, brandColor: string = '#722580'): string {
  if (!html || typeof html !== 'string') return html || '';

  return html.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (match, inner) => {
    // If table already has headers or thead, preserve it
    if (inner.toLowerCase().includes('<th') || inner.toLowerCase().includes('<thead')) return match;

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
        `      <td style="border: none;${borderBottom}${radiusCol1} padding: 10px 12px; font-weight: 700; color: #1e293b; text-align: center; vertical-align: top; width: 48px; font-size: 10pt;">${idx + 1}</td>\n` +
        `      <td style="border: none;${borderBottom} padding: 10px 14px; font-weight: 700; color: #1e293b; vertical-align: top; width: 34%; font-size: 10pt;">${col1Clean}</td>\n` +
        `      <td style="border: none;${borderBottom}${radiusColLast} padding: 10px 14px; color: #0f172a; vertical-align: top; width: 66%; font-size: 10pt;">${col2Html}</td>\n` +
        `    </tr>\n`;
    });

    return `<table class="quote-grid-table" style="width: 100%; border-collapse: separate; border-spacing: 0; margin: 12px 0; font-size: 10pt; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff;">\n` +
      `  <thead>\n` +
      `    <tr style="background: ${brandColor}; color: #ffffff;">\n` +
      `      <th style="border: none; border-top-left-radius: 7px; background: ${brandColor}; color: #ffffff; padding: 10px 12px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; text-align: center; width: 48px;">NO</th>\n` +
      `      <th style="border: none; background: ${brandColor}; color: #ffffff; padding: 10px 14px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; width: 34%;">${h1}</th>\n` +
      `      <th style="border: none; border-top-right-radius: 7px; background: ${brandColor}; color: #ffffff; padding: 10px 14px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; width: 66%;">${h2}</th>\n` +
      `    </tr>\n` +
      `  </thead>\n` +
      `  <tbody>\n${rowsHtml}  </tbody>\n` +
      `</table>`;
  });
}


/**
 * Deletes one A4 page of a document.
 *
 * Pages are derived from the sections (blocks), so "delete page N" means: remove whatever sits on that page.
 *  - a section that lives only on that page is removed completely;
 *  - a section that continues on other pages loses only the part that sits on that page
 *    (text: its slice of paragraphs; pricing table: the rows shown on that page, with the rest renumbered).
 * Returns the new blocks plus a summary so the UI can say what happened. Out-of-range pages and pages with
 * nothing on them leave the blocks untouched.
 */
export const removePageFromBlocks = (
  blocks: any[],
  chunks: A4PageChunk[],
  pageIndex: number
): { blocks: any[]; removedBlocks: number; trimmedBlocks: number } => {
  const page = chunks[pageIndex];
  if (!page || page.slices.length === 0) return { blocks, removedBlocks: 0, trimmedBlocks: 0 };

  // every slice of every block, in document order
  const slicesOf = new Map<string, ChunkBlockSlice[]>();
  chunks.forEach((c) => c.slices.forEach((s) => {
    const list = slicesOf.get(s.block.id) || [];
    list.push(s);
    slicesOf.set(s.block.id, list);
  }));

  const onPage = new Map<string, ChunkBlockSlice[]>();
  page.slices.forEach((s) => {
    const list = onPage.get(s.block.id) || [];
    list.push(s);
    onPage.set(s.block.id, list);
  });

  let removedBlocks = 0;
  let trimmedBlocks = 0;
  const next: any[] = [];

  for (const block of blocks) {
    const here = onPage.get(block.id);
    if (!here) {
      next.push(block);
      continue;
    }
    const all = slicesOf.get(block.id) || [];
    if (all.length <= here.length) {
      removedBlocks++;
      continue;
    }

    if (block.type === 'table') {
      const drop = new Set<any>();
      here.forEach((s) => (s.itemsSlice || []).forEach((it) => drop.add(it)));
      const rest = (Array.isArray(block.items) ? block.items : []).filter((it: any) => !drop.has(it));
      if (rest.length === 0) {
        removedBlocks++;
        continue;
      }
      let n = 0;
      next.push({ ...block, items: rest.map((it: any) => (it?.type === 'detail' ? it : { ...it, no: ++n })) });
      trimmedBlocks++;
    } else {
      const keep = all.filter((s) => !here.includes(s)).map((s) => s.contentSlice || '');
      const content = joinHtmlUnits(keep);
      if (!content.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s/gi, '') && !/<(img|table)\b/i.test(content)) {
        removedBlocks++;
        continue;
      }
      next.push({ ...block, content });
      trimmedBlocks++;
    }
  }

  return { blocks: next, removedBlocks, trimmedBlocks };
};
