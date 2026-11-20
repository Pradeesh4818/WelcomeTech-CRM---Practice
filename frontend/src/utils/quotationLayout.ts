import type { LayoutMetrics } from './quotationHelpers';

/**
 * Real-browser layout measurement for quotation / proposal documents.
 *
 * The A4 chunker only *estimates* heights from character counts, which either leaves large gaps above the
 * footer (over-estimate) or lets rows slide under it (under-estimate). Here we render the document once in a
 * hidden iframe, read the true heights, and let the chunker paginate again with the real numbers.
 * The backend PDF renderer does the same thing (see MEASURE_LAYOUT_SCRIPT in htmlPdfGenerator.ts).
 */

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
  /** Extra px subtracted from every page's usable height (grown until nothing overflows) */
  safety?: number;
}

/** Height reserved on the last page for the "Overall Quotation Total" box (shown when there are 2+ tables). */
export const OVERALL_TOTAL_RESERVE = 112;

export const toLayoutMetrics = (
  m: SerializedLayoutMetrics | undefined,
  tableCount: number,
  showOverallTotal?: boolean
): LayoutMetrics | undefined => {
  const isOverallVisible = Boolean(showOverallTotal === true);
  const reserveLast = isOverallVisible ? OVERALL_TOTAL_RESERVE : 0;
  if (!m) return reserveLast ? { reserveLast } : undefined;
  const safety = m.safety ?? 0;
  return {
    availFirst: m.availFirst !== undefined ? m.availFirst - safety : undefined,
    availOther: m.availOther !== undefined ? m.availOther - safety : undefined,
    gridOverhead: m.gridOverhead,
    textGap: m.textGap,
    titleH: m.titleH,
    contTitleH: m.contTitleH,
    tableHead: m.tableHead,
    tableBanner: m.tableBanner,
    tailMore: m.tailMore,
    tailEnd: m.tailEnd,
    tailEndDisc: m.tailEndDisc,
    unitHeight: (u) => m.unitHeights?.[u],
    itemHeight: (_it, bi, ii) => m.itemHeights?.[`${bi}:${ii}`],
    reserveLast,
  };
};

const SAFE = 6;

const pageAvail = (win: Window, page: Element): number | null => {
  const mid = page.querySelector('[data-role="page-content"]') as HTMLElement | null;
  const foot = page.querySelector('[data-role="page-footer"]') as HTMLElement | null;
  if (!mid || !foot) return null;
  const pt = page.getBoundingClientRect().top;
  const mt = mid.getBoundingClientRect().top - pt;
  const ft = foot.getBoundingClientRect().top - pt;
  const pb = parseFloat(win.getComputedStyle(mid).paddingBottom) || 0;
  return Math.floor(ft - mt - pb - SAFE);
};

const CHROME_KEYS = ['textGap', 'titleH', 'contTitleH', 'tableHead', 'tableBanner', 'tailMore', 'tailEnd', 'tailEndDisc'] as const;

/** Reads the renderer's own chrome (block titles, gaps, table header/footer rows) from a rendered document. */
export const measureChrome = (doc: Document): SerializedLayoutMetrics => {
  const win = doc.defaultView as Window;
  const num = (v: string) => parseFloat(v) || 0;
  const out: SerializedLayoutMetrics = {};
  doc.querySelectorAll('[data-est]').forEach((w) => {
    const mb = num(win.getComputedStyle(w).marginBottom);
    if (w.classList.contains('textblock')) {
      out.textGap = mb;
      const t = w.querySelector('[data-role="text-title"]');
      if (t && out.titleH === undefined) out.titleH = Math.ceil(t.getBoundingClientRect().height + num(win.getComputedStyle(t).marginBottom));
      const tc = w.querySelector('[data-role="text-title-cont"]');
      if (tc && out.contTitleH === undefined) out.contTitleH = Math.ceil(tc.getBoundingClientRect().height + num(win.getComputedStyle(tc).marginBottom));
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
};

/** Reads true page room and the true height of every text unit / table row from a rendered document. */
export const measureLayout = (
  doc: Document,
  units: Array<[string, string]>,
  sequences: Array<Array<[string, string]>> = []
): SerializedLayoutMetrics => {
  const win = doc.defaultView as Window;
  const pages = Array.from(doc.querySelectorAll('.a4-discrete-sheet'));
  const out: SerializedLayoutMetrics = { unitHeights: {}, itemHeights: {} };
  if (pages[0]) out.availFirst = pageAvail(win, pages[0]) ?? undefined;
  if (pages[1]) out.availOther = pageAvail(win, pages[1]) ?? undefined;

  doc.querySelectorAll('tr[data-row]').forEach((tr) => {
    out.itemHeights![tr.getAttribute('data-row') as string] = tr.getBoundingClientRect().height;
  });

  const mid0 = doc.querySelector('[data-role="page-content"]') as HTMLElement | null;
  const cs0 = mid0 ? win.getComputedStyle(mid0) : null;
  const sb = doc.createElement('div');
  sb.className = 'page a4-discrete-sheet';
  sb.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;height:auto;min-height:0;max-height:none;overflow:visible;display:block;';
  sb.innerHTML = `<div style="padding:0 ${cs0?.paddingRight || '36px'} 14px ${cs0?.paddingLeft || '36px'};box-sizing:border-box"><div class="textblock"><div class="rich" style="display:flow-root"></div></div></div>`;
  doc.body.appendChild(sb);
  const rich = sb.querySelector('.rich') as HTMLElement;
  const gridChrome: number[] = [];
  for (const [raw, cleaned] of units) {
    rich.innerHTML = cleaned;
    const total = rich.getBoundingClientRect().height;
    const rows = rich.querySelectorAll('tbody tr');
    if (/^\s*<table[^>]*quote-grid-table/.test(cleaned) && rows.length === 1) {
      const h = rows[0].getBoundingClientRect().height;
      out.unitHeights![raw] = h;
      gridChrome.push(total - h);
    } else {
      out.unitHeights![raw] = total;
    }
  }
  if (gridChrome.length) out.gridOverhead = Math.ceil(Math.max(...gridChrome));

  // Marginal height of each unit in the context of the units before it (adjacent paragraph margins collapse, so
  // summing stand-alone heights over-counts). Grid-table rows keep their own row-height measurement above.
  const merge = (h: string) => h
    .replace(/<\/ul>\s*<ul\b[^>]*>/gi, '')
    .replace(/<\/ol>\s*<ol\b[^>]*>/gi, '')
    .replace(/<\/tbody><\/table>\s*<table\b[^>]*quote-grid-table[^>]*>\s*<thead\b[\s\S]*?<\/thead>\s*<tbody>/gi, '')
    .replace(/<\/tbody><\/table>\s*<table[^>]*>(?:<colgroup>[\s\S]*?<\/colgroup>)?\s*<tbody>/gi, '');
  for (const seq of sequences) {
    let prev = 0;
    const acc: string[] = [];
    for (const [raw, cleaned] of seq) {
      acc.push(cleaned);
      rich.innerHTML = merge(acc.join('\n'));
      const h = rich.getBoundingClientRect().height;
      if (!/^\s*<table[^>]*quote-grid-table/.test(cleaned)) out.unitHeights![raw] = Math.max(0, h - prev);
      prev = h;
    }
  }
  sb.remove();
  Object.assign(out, measureChrome(doc));
  return out;
};

/** How many px (if any) content spills past the footer on the worst page. <= 0 means everything fits. */
export const checkOverflow = (doc: Document): number => {
  let worst = -999;
  doc.querySelectorAll('.a4-discrete-sheet').forEach((p) => {
    const mid = p.querySelector('[data-role="page-content"]') as HTMLElement | null;
    const foot = p.querySelector('[data-role="page-footer"]') as HTMLElement | null;
    if (!mid || !foot) return;
    const limit = foot.getBoundingClientRect().top - 2;
    Array.from(mid.children).forEach((k) => {
      const r = k.getBoundingClientRect();
      if (r.height > 0) worst = Math.max(worst, r.bottom - limit);
    });
  });
  return Math.ceil(worst);
};

const loadInto = (frame: HTMLIFrameElement, html: string): Promise<Document> =>
  new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('layout frame timeout')), 15000);
    frame.onload = async () => {
      window.clearTimeout(timer);
      const doc = frame.contentDocument as Document;
      try { await (doc as any).fonts?.ready; } catch { /* ignore */ }
      await Promise.all(
        Array.from(doc.images).map((img) => (img.complete ? null : new Promise<void>((r) => { img.onload = img.onerror = () => r(); })))
      );
      resolve(doc);
    };
    frame.srcdoc = html;
  });

/**
 * Two-pass layout: estimate → measure in a hidden iframe → re-paginate with real heights → verify nothing
 * slides under the footer (growing a safety margin until it doesn't). Returns the final metrics.
 */
export const computeLayoutMetrics = async (
  build: (metrics?: SerializedLayoutMetrics, collect?: { units: Map<string, string>; sequences?: Array<Array<[string, string]>> }) => string
): Promise<SerializedLayoutMetrics | undefined> => {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden;pointer-events:none;';
  document.body.appendChild(frame);
  try {
    const collect: { units: Map<string, string>; sequences?: Array<Array<[string, string]>> } = { units: new Map<string, string>() };
    const doc1 = await loadInto(frame, build(undefined, collect));
    const measured = measureLayout(doc1, Array.from(collect.units.entries()), collect.sequences || []);
    let metrics: SerializedLayoutMetrics = { ...measured, safety: 0 };
    for (let attempt = 0; attempt < 5; attempt++) {
      const doc2 = await loadInto(frame, build(metrics));
      const over = checkOverflow(doc2);
      // Chrome that did not exist in the first pass (e.g. continuation banners) shows up now – learn it once
      if (attempt === 0) {
        const again = measureChrome(doc2);
        const learned: SerializedLayoutMetrics = {};
        CHROME_KEYS.forEach((k) => { if (metrics[k] === undefined && again[k] !== undefined) learned[k] = again[k]; });
        if (Object.keys(learned).length) {
          metrics = { ...metrics, ...learned };
          continue;
        }
      }
      if (!(over > 0)) break;
      metrics = { ...metrics, safety: (metrics.safety || 0) + over + 2 };
    }
    return metrics;
  } catch (err) {
    console.warn('[quotation] layout measurement failed, using estimated pagination', err);
    return undefined;
  } finally {
    frame.remove();
  }
};
