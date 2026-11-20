import { format, formatDistanceToNow, parseISO, differenceInDays } from 'date-fns';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'; // Backend base (used for uploads/avatar URLs)

export const toApiUrl = (value?: string | null): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;

  const origin = (() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      return window.location.origin;
    }
    try {
      return new URL(API_URL).origin;
    } catch {
      return (API_URL || '').replace(/\/+$/, '');
    }
  })();

  const apiBase = (import.meta.env.VITE_API_BASE || '/api/v1').replace(/\/+$/, '');
  let cleanPath = raw.startsWith('/') ? raw : `/${raw}`;

  if (cleanPath.startsWith('/api/v1/')) {
    cleanPath = cleanPath.slice('/api/v1'.length);
  } else if (cleanPath.startsWith(apiBase)) {
    cleanPath = cleanPath.slice(apiBase.length);
  }

  return `${origin}${apiBase}${cleanPath}`;
};

export const toAssetUrl = (value?: string | null): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('blob:') || raw.startsWith('data:')) return raw;

  const origin = (() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      return window.location.origin;
    }
    try {
      return new URL(API_URL).origin;
    } catch {
      return (API_URL || '').replace(/\/+$/, '');
    }
  })();
  
  const apiBase = import.meta.env.VITE_API_BASE || '/api/v1';
  const cleanApiBase = apiBase.replace(/\/+$/, '');
  const toBackendUpload = (path: string) => `${origin}${cleanApiBase}${path}`;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const legacyUpload = parsed.pathname.match(/(?:^|\/)(uploads\/.+)$/);
      const isFrontendOrigin = typeof window !== 'undefined' && parsed.origin === window.location.origin;
      if (isFrontendOrigin && legacyUpload) {
        return toBackendUpload(`/${legacyUpload[1]}`);
      }
      return raw;
    } catch {
      return raw;
    }
  }

  let normalizedPath = raw.startsWith('/') ? raw : `/${raw}`;
  normalizedPath = normalizedPath.replace(/\\/g, '/').replace(/\/{2,}/g, '/');

  // If an API route was passed (e.g. /api/v1/public/proposals/...), rewrite to cleanApiBase
  if (normalizedPath.startsWith('/api/v1/')) {
    normalizedPath = `${cleanApiBase}${normalizedPath.slice('/api/v1'.length)}`;
  }

  if (normalizedPath.startsWith(`${cleanApiBase}/uploads/`)) {
    normalizedPath = normalizedPath.slice(cleanApiBase.length);
  } else {
    const legacyUpload = normalizedPath.match(/(?:^|\/)(uploads\/.+)$/);
    if (legacyUpload) normalizedPath = `/${legacyUpload[1]}`;
  }

  if (normalizedPath.startsWith('/uploads/')) {
    return toBackendUpload(normalizedPath);
  }

  if (normalizedPath.startsWith(cleanApiBase)) {
    return `${origin}${normalizedPath}`;
  }
  
  return `${origin}${normalizedPath}`;
};

export const COUNTRY_CURRENCIES: Record<string, { code: string; symbol: string; name: string }> = {
  QA: { code: 'QAR', symbol: 'QAR', name: 'Qatari Riyal' },
  IN: { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  AE: { code: 'AED', symbol: 'AED', name: 'UAE Dirham' },
  SA: { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal' },
  OM: { code: 'OMR', symbol: 'OMR', name: 'Omani Rial' },
  KW: { code: 'KWD', symbol: 'KWD', name: 'Kuwaiti Dinar' },
  BH: { code: 'BHD', symbol: 'BHD', name: 'Bahraini Dinar' },
  US: { code: 'USD', symbol: '$', name: 'US Dollar' },
  GB: { code: 'GBP', symbol: '£', name: 'British Pound' },
};

export const getActiveCountry = (): string => {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem('wt_country');
      if (saved && COUNTRY_CURRENCIES[saved]) return saved;
    } catch {}
  }
  return 'QA';
};

export const getActiveCurrency = (countryOverride?: string): string => {
  const country = countryOverride || getActiveCountry();
  return COUNTRY_CURRENCIES[country]?.code || 'QAR';
};

export const getActiveCurrencySymbol = (countryOverride?: string): string => {
  const country = countryOverride || getActiveCountry();
  return COUNTRY_CURRENCIES[country]?.symbol || COUNTRY_CURRENCIES[country]?.code || 'QAR';
};

export const fmt = {
  date: (d: string | Date | undefined | null) => {
    if (!d) return '—';
    try {
      return format(typeof d === 'string' ? parseISO(d) : d, 'dd MMM yyyy');
    } catch {
      return '—';
    }
  },
  time: (d: string | Date | undefined | null) => {
    if (!d) return '—';
    try {
      return format(typeof d === 'string' ? parseISO(d) : d, 'hh:mm a');
    } catch {
      return '—';
    }
  },
  dateTime: (d: string | Date | undefined | null) => {
    if (!d) return '—';
    try {
      return format(typeof d === 'string' ? parseISO(d) : d, 'dd MMM yyyy, hh:mm a');
    } catch {
      return '—';
    }
  },
  relative: (d: string | Date | undefined | null) => {
    if (!d) return '—';
    try {
      return formatDistanceToNow(typeof d === 'string' ? parseISO(d) : d, { addSuffix: true });
    } catch {
      return '—';
    }
  },
  currency: (n: number, currencyOverride?: string) => {
    const val = n || 0;
    const currency = currencyOverride || getActiveCurrency();
    return `${currency} ${val.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
  },
  cur: (currencyOverride?: string) => getActiveCurrency(currencyOverride),
  number: (n: number) => (n || 0).toLocaleString(),
};

export const toCalendarUtcMidnight = (val?: string | Date | null): number | null => {
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
  return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

/**
 * Accurately calculates remaining days for a contract/service:
 * 1. Expired (expiryDate < today): returns negative days overdue (e.g. -3 for 3 days overdue).
 * 2. Future-starting (today < startDate): remaining days is the total contract duration (e.g. 365 for a 1-year contract).
 *    Never leaks days before the start date into remaining days (prevents showing 366D+ for a 365D contract).
 * 3. Active (startDate <= today <= expiryDate): returns remaining service days from today through expiry date inclusive
 *    (e.g., on Day 1 of a 365-day contract, returns 365).
 * 4. Missing startDate: returns calendar day difference (expMs - todayMs), or negative if overdue.
 */
export const calculateRemainingDays = (
  expiryVal?: string | Date | null,
  startVal?: string | Date | null,
  asOf?: Date
): number | null => {
  const expMs = toCalendarUtcMidnight(expiryVal);
  if (expMs === null) return null;

  const now = asOf || new Date();
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const startMs = toCalendarUtcMidnight(startVal);

  const DAY_MS = 24 * 60 * 60 * 1000;

  if (expMs < todayMs) {
    const overdue = Math.round((todayMs - expMs) / DAY_MS);
    return overdue === 0 ? 0 : -overdue;
  }

  const totalContractDays =
    startMs !== null && expMs >= startMs
      ? Math.round((expMs - startMs) / DAY_MS) + 1
      : null;

  if (startMs !== null && todayMs < startMs) {
    return totalContractDays;
  }

  const diffDays = Math.round((expMs - todayMs) / DAY_MS);
  if (totalContractDays !== null) {
    return Math.min(diffDays + 1, totalContractDays);
  }

  return diffDays;
};

export const daysUntil = (dateStr?: string | Date | null, startDateStr?: string | Date | null): number => {
  const days = calculateRemainingDays(dateStr, startDateStr);
  return days ?? 0;
};

export const computeServiceStatus = (
  endDate?: string | Date | null,
  explicitStatus?: string | null
): 'active' | 'expiring' | 'expired' | 'trial' | 'none' => {
  const explicit = String(explicitStatus || '').toLowerCase().trim();
  if (explicit === 'trial') return 'trial';

  if (endDate) {
    const d = typeof endDate === 'string' ? new Date(endDate) : endDate;
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const expiry = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) return 'expired';
      if (diffDays <= 30) return 'expiring';
      return 'active';
    }
  }

  if (explicit === 'none') return 'none';
  if (explicit === 'expired' || explicit === 'expiring' || explicit === 'active') {
    return explicit;
  }
  return 'active';
};

/**
 * Builds a dedup key from a licenseSerialNo and a date string (date-part only).
 * Used to detect when the same license subscription appears in both a direct
 * service entry (type:'tss'/'tdl') AND an AMC entry with tssExpiryDate set.
 */
export const serviceDedupKey = (serialNo?: string | null, dateStr?: string | Date | null): string => {
  const serial = String(serialNo || '').trim();
  const date = dateStr ? String(dateStr).split('T')[0] : '';
  return `${serial}|${date}`;
};

/**
 * Merges primary and secondary service lists by physical licenseSerialNo.
 * When multiple service entries share the same serial number:
 * 1. The entry with the most recent (latest) endDate is chosen as the active display record.
 * 2. Any older subscription intervals/dates are preserved inside renewalHistory, ensuring no data is lost.
 * 3. Any non-empty metadata from the older entry (partnerName, contactPerson, mobile, email) missing in the winner is merged.
 * 4. Entries without a serial number are preserved as separate rows.
 */
export const mergeModuleServicesBySerial = <T extends {
  licenseSerialNo?: string | null;
  endDate?: string | Date | null;
  startDate?: string | Date | null;
  product?: string | null;
  renewalHistory?: any[];
  [key: string]: any;
}>(
  primary: T[],
  secondary: T[] = []
): T[] => {
  const serialMap = new Map<string, T>();
  const noSerialEntries: T[] = [];

  const processEntry = (item: T) => {
    const rawSerial = String(item.licenseSerialNo || '').trim();
    if (!rawSerial || rawSerial === '—') {
      noSerialEntries.push(item);
      return;
    }
    const serialKey = rawSerial.toLowerCase();
    if (!serialMap.has(serialKey)) {
      serialMap.set(serialKey, { ...item, renewalHistory: [...(item.renewalHistory || [])] });
      return;
    }

    const existing = serialMap.get(serialKey)!;
    const existingTime = existing.endDate ? new Date(existing.endDate).getTime() : 0;
    const incomingTime = item.endDate ? new Date(item.endDate).getTime() : 0;

    // The entry with the more recent expiry date becomes the active winner
    const winnerIsIncoming = incomingTime > existingTime;
    const winner: T = winnerIsIncoming
      ? { ...item, renewalHistory: [...(item.renewalHistory || [])] }
      : { ...existing, renewalHistory: [...(existing.renewalHistory || [])] };
    const older = winnerIsIncoming ? existing : item;

    // Fill missing fields on winner from older
    const fieldsToPreserve = [
      'partnerName',
      'vendorCategory',
      'contactPerson',
      'mobile',
      'email',
      'companyName',
      'address',
      'licenceType',
      'release',
      'releaseVersion',
      'details',
      'notes',
      'notesRemarks',
      'remarks',
    ] as const;
    fieldsToPreserve.forEach((f) => {
      if ((winner as any)[f] == null || (winner as any)[f] === '' || (winner as any)[f] === '—') {
        if ((older as any)[f] != null && (older as any)[f] !== '' && (older as any)[f] !== '—') {
          (winner as any)[f] = (older as any)[f];
        }
      }
    });

    // Preserve the older date period into winner's renewalHistory
    const olderEndStr = older.endDate ? String(older.endDate).split('T')[0] : '';
    const winnerEndStr = winner.endDate ? String(winner.endDate).split('T')[0] : '';
    const alreadyInHistory = (winner.renewalHistory || []).some(
      (h: any) => h && h.endDate && String(h.endDate).split('T')[0] === olderEndStr
    );

    if (olderEndStr && olderEndStr !== winnerEndStr && !alreadyInHistory) {
      winner.renewalHistory = [
        ...(winner.renewalHistory || []),
        ...(older.renewalHistory || []),
        {
          startDate: older.startDate,
          endDate: older.endDate,
          product: older.product || winner.product,
          licenceType: older.licenceType || winner.licenceType,
          details: older.details || 'Historical subscription period',
          status: older.status || 'expired',
        },
      ];
    } else if (Array.isArray(older.renewalHistory) && older.renewalHistory.length > 0) {
      const existingHistoryDates = new Set(
        (winner.renewalHistory || []).map((h: any) => h && h.endDate && String(h.endDate).split('T')[0]).filter(Boolean)
      );
      older.renewalHistory.forEach((h: any) => {
        const d = h && h.endDate && String(h.endDate).split('T')[0];
        if (d && !existingHistoryDates.has(d)) {
          existingHistoryDates.add(d);
          winner.renewalHistory!.push(h);
        }
      });
    }

    serialMap.set(serialKey, winner);
  };

  primary.forEach(processEntry);
  secondary.forEach(processEntry);

  return [...Array.from(serialMap.values()), ...noSerialEntries];
};

/**
 * Given a list of "primary" entries and a list of "secondary" (AMC-sourced)
 * entries, removes any secondary entry whose licenseSerialNo is already covered
 * by a primary entry.
 */
export const deduplicateAmcEntries = <T extends { licenseSerialNo?: string | null; endDate?: string | Date | null }>(
  primary: T[],
  secondary: T[]
): T[] => {
  const seenSerials = new Set(
    primary
      .map((s) => String(s.licenseSerialNo || '').trim().toLowerCase())
      .filter(Boolean)
  );
  return secondary.filter((s) => {
    const serial = String(s.licenseSerialNo || '').trim().toLowerCase();
    if (!serial) return true;
    if (seenSerials.has(serial)) return false;
    seenSerials.add(serial);
    return true;
  });
};

export const getInitials = (name: string): string => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

export const AVATAR_COLORS = [
  '#1d4ed8', '#7c3aed', '#0f766e', '#d97706', '#dc2626',
  '#16a34a', '#0891b2', '#9333ea', '#c2410c', '#0284c7',
];

export const getAvatarColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

export const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  'in-progress': 'In Progress',
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
  cancelled: 'Cancelled',
  resolved: 'Resolved',
  closed: 'Closed',
  'pending-customer': 'Pending Customer',
  active: 'Active',
  inactive: 'Inactive',
  expired: 'Expired',
  expiring: 'Expiring Soon',
  none: 'No AMC',
  paid: 'Paid',
  pending: 'Pending',
  partial: 'Partial',
  overdue: 'Overdue',
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  rejected: 'Rejected',
  lost: 'Not Interested',
  lead_lost: 'Not Interested',
  'not interested': 'Not Interested',
  'not_interested': 'Not Interested',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
  remote: 'Remote',
  visit: 'Site Visit',
  phone: 'Phone',
  email: 'Email',
  forwarded: 'Forwarded',
};

export const STATUS_BADGE: Record<string, string> = {
  open: 'badge-blue',
  'in-progress': 'badge-amber',
  todo: 'badge-teal',
  in_progress: 'badge-amber',
  blocked: 'badge-red',
  review: 'badge-purple',
  forwarded: 'badge-cyan',
  done: 'badge-green',
  cancelled: 'badge-gray',
  resolved: 'badge-green',
  closed: 'badge-gray',
  'pending-customer': 'badge-purple',
  active: 'badge-green',
  inactive: 'badge-gray',
  expired: 'badge-red',
  expiring: 'badge-amber',
  none: 'badge-gray',
  paid: 'badge-green',
  pending: 'badge-amber',
  partial: 'badge-purple',
  overdue: 'badge-red',
  draft: 'badge-gray',
  sent: 'badge-blue',
  accepted: 'badge-green',
  rejected: 'badge-red',
  low: 'badge-teal',
  medium: 'badge-blue',
  high: 'badge-amber',
  critical: 'badge-red',
  created: 'badge-purple',
  assigned: 'badge-purple',
  reassigned: 'badge-amber',
  proposal: 'badge-teal',
  followup: 'badge-amber',
  info: 'badge-blue',
  warning: 'badge-amber',
  neutral: 'badge-purple',
  danger: 'badge-red',
  lost: 'badge-red',
  lead_lost: 'badge-red',
  declined: 'badge-red',
  'not interested': 'badge-red',
  'not_interested': 'badge-red',
};

export const clsx = (...classes: (string | undefined | null | false)[]): string =>
  classes.filter(Boolean).join(' ');

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const PAGE_SIZE_OPTIONS = [
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
  { value: '250', label: '250' },
  { value: '500', label: '500' },
];

export const combineDateTime = (dateStr?: string, timeStr?: string): string | undefined => {
  if (!dateStr || !dateStr.trim()) return undefined;
  const cleanDate = dateStr.trim().slice(0, 10);
  if (!timeStr || !timeStr.trim()) {
    return `${cleanDate}T00:00:00.000Z`;
  }
  const [rawH = '00', rawM = '00'] = timeStr.trim().split(':');
  const d = new Date(`${cleanDate}T${rawH.padStart(2, '0')}:${rawM.padStart(2, '0')}:00`);
  if (isNaN(d.getTime())) return `${cleanDate}T00:00:00.000Z`;
  return d.toISOString();
};

export const extractDate = (val?: string | Date | null): string => {
  if (!val) return '';
  try {
    const d = typeof val === 'string' ? parseISO(val) : val;
    if (isNaN(d.getTime())) return '';
    return format(d, 'yyyy-MM-dd');
  } catch {
    return '';
  }
};

export const extractTime = (val?: string | Date | null): string => {
  if (!val) return '';
  try {
    const d = typeof val === 'string' ? parseISO(val) : val;
    if (isNaN(d.getTime())) return '';
    return format(d, 'HH:mm');
  } catch {
    return '';
  }
};


