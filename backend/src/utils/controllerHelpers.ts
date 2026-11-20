// Small pure helpers shared by controllers, extracted so their (bug-prone) logic is unit-testable.

/**
 * Escape a user-supplied string for safe use inside a MongoDB `$regex`.
 * Prevents regex-injection errors and catastrophic-backtracking (ReDoS).
 */
export const escapeRegExp = (value: string): string =>
  String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Return a shallow copy of `obj` with the given keys removed.
 * Used as a mass-assignment guard so clients can't overwrite server-controlled fields.
 */
export const omitKeys = <T extends Record<string, any>>(obj: T, keys: string[]): T => {
  const clone: Record<string, any> = { ...(obj || {}) };
  for (const k of keys) delete clone[k];
  return clone as T;
};

export interface LineItemLike {
  qty?: number | string;
  unitPrice?: number | string;
  total?: number | string;
  description?: string;
}

/**
 * Compute proposal money server-side from the (validated) line items or table blocks.
 * Accurately supports per-table block discounts and multi-table structures.
 */
export const computeProposalTotals = (
  items: LineItemLike[],
  discountPct: number | string = 0,
  blocks?: any[],
  discountType?: string
): { subtotal: number; discount: number; total: number } => {
  if (Array.isArray(blocks) && blocks.length > 0) {
    let blockSubtotal = 0;
    let blockTotal = 0;
    let hasTableBlock = false;

    for (const b of blocks) {
      if (b && b.type === 'table' && Array.isArray(b.items)) {
        hasTableBlock = true;
        const currentSubtotal = b.items.reduce((sum: number, it: any) => {
          if (it?.type === 'detail') return sum;
          const qty = Number(it?.qty) || (it?.type === 'item' ? 1 : 0);
          const price = Number(it?.unitPrice) || 0;
          return sum + (qty * price);
        }, 0);
        const currentDisc = Number(b.discountPercent) || 0;
        const isAmount = b.discountType === 'amount';
        const discAmount = isAmount ? Math.min(currentSubtotal, Math.max(0, currentDisc)) : (currentSubtotal * currentDisc) / 100;
        const currentTot = Math.max(0, currentSubtotal - discAmount);
        blockSubtotal += currentSubtotal;
        blockTotal += currentTot;
      }
    }

    if (hasTableBlock) {
      const effectiveDiscount = blockSubtotal > 0
        ? Math.round(((blockSubtotal - blockTotal) / blockSubtotal) * 100 * 100) / 100
        : 0;
      return {
        subtotal: blockSubtotal,
        discount: effectiveDiscount,
        total: blockTotal,
      };
    }
  }

  const subtotal = (Array.isArray(items) ? items : []).reduce((sum, it) => {
    const line = Number(it?.total) || (Number(it?.qty) || 1) * (Number(it?.unitPrice) || 0);
    return sum + line;
  }, 0);
  const discount = Number(discountPct) || 0;
  const isAmount = discountType === 'amount';
  const discAmount = isAmount ? Math.min(subtotal, Math.max(0, discount)) : (subtotal * discount) / 100;
  const total = Math.max(0, subtotal - discAmount);
  return { subtotal, discount, total };
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Normalizes any date value (Date object, ISO string, YYYY-MM-DD)
 * to a UTC midnight timestamp (00:00:00.000Z).
 */
export const toCalendarUtcMidnight = (val: unknown): number | null => {
  if (!val) return null;
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return null;
    return Date.UTC(val.getUTCFullYear(), val.getUTCMonth(), val.getUTCDate());
  }
  const str = String(val).trim();
  if (!str) return null;
  const datePart = str.split('T')[0].trim();
  const parts = datePart.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return Date.UTC(y, m - 1, d);
    }
  }
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
};

/**
 * Accurately calculates remaining days for a contract/service:
 * 1. Expired (expiryDate < today): returns negative days overdue (e.g., -3 for 3 days overdue).
 * 2. Future-starting (today < startDate): remaining days is the total contract duration (e.g. 365 for a 1-year contract).
 *    Never leaks days before the start date into remaining days (prevents showing 366D+ for a 365D contract).
 * 3. Active (startDate <= today <= expiryDate): returns remaining service days from today through expiry date inclusive
 *    (e.g., on Day 1 of a 365-day contract, returns 365).
 * 4. Missing startDate: returns calendar day difference (expMs - todayMs), or negative if overdue.
 */
export const calculateRemainingDays = (
  expiryVal: unknown,
  startVal?: unknown,
  asOf?: Date
): number | null => {
  const expMs = toCalendarUtcMidnight(expiryVal);
  if (expMs === null) return null;

  const d = asOf || new Date();
  const todayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const startMs = toCalendarUtcMidnight(startVal);

  // If expired (expiry date is strictly before today)
  if (expMs < todayMs) {
    const overdueDays = Math.round((todayMs - expMs) / DAY_MS);
    return overdueDays === 0 ? 0 : -overdueDays;
  }

  // Total contract duration if startDate is available and valid
  const totalContractDays =
    startMs !== null && expMs >= startMs
      ? Math.round((expMs - startMs) / DAY_MS) + 1
      : null;

  // If contract has not started yet (today is strictly before start date)
  if (startMs !== null && todayMs < startMs) {
    return totalContractDays;
  }

  // Active contract (startMs <= todayMs <= expMs)
  // Coverage runs through expiry date inclusive
  const diffDays = Math.round((expMs - todayMs) / DAY_MS);
  if (totalContractDays !== null) {
    return Math.min(diffDays + 1, totalContractDays);
  }

  return diffDays;
};

