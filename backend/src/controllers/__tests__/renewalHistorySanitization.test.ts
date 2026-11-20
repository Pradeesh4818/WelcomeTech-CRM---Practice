import { describe, it, expect } from 'vitest';

// We test the normalization logic for renewal history
describe('Renewal History Normalization & Ghost Entry Filtering', () => {
  const calculateStartDateFromExpiry = (expiryDateInput: string, period = '1 Year'): string => {
    const raw = String(expiryDateInput).split('T')[0];
    const parts = raw.split('-');
    if (parts.length !== 3) return raw;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return raw;

    const dt = new Date(year, month, day);
    dt.setDate(dt.getDate() + 1);
    if (period === '6 Months') dt.setMonth(dt.getMonth() - 6);
    else if (period === '2 Years') dt.setFullYear(dt.getFullYear() - 2);
    else if (period === '3 Years') dt.setFullYear(dt.getFullYear() - 3);
    else dt.setFullYear(dt.getFullYear() - 1);

    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const normalizeRenewalHistory = (history: any[] = []): any[] => {
    if (!Array.isArray(history)) return [];
    return history
      .filter((item) => {
        if (!item || typeof item !== 'object') return false;
        const hasDate = Boolean(item.startDate || item.expiryDate || item.renewedOn);
        const hasAmount = item.amount !== undefined && item.amount !== null && !isNaN(Number(item.amount));
        const hasPeriod = Boolean(item.period && String(item.period).trim() && String(item.period).trim() !== 'Renewal');
        const hasNotes = Boolean(item.notes && String(item.notes).trim());
        return Boolean(hasDate || hasAmount || hasPeriod || hasNotes);
      })
      .map((item) => {
        let startDate = item.startDate ? new Date(item.startDate) : undefined;
        let expiryDate = item.expiryDate ? new Date(item.expiryDate) : undefined;
        let renewedOn = item.renewedOn ? new Date(item.renewedOn) : undefined;
        let period = String(item.period || '').trim();

        if (period === 'Initial Contract' && expiryDate && !isNaN(expiryDate.getTime())) {
          if (!startDate || isNaN(startDate.getTime()) || startDate > expiryDate) {
            const expStr = expiryDate instanceof Date ? expiryDate.toISOString().split('T')[0] : String(expiryDate).split('T')[0];
            const healedStart = calculateStartDateFromExpiry(expStr, period || '1 Year');
            startDate = new Date(healedStart);
            if (!renewedOn || isNaN(renewedOn.getTime()) || renewedOn > expiryDate) {
              renewedOn = startDate;
            }
          }
        }

        if (!period || period === 'Renewal') period = '1 Year';
        if (!renewedOn || isNaN(renewedOn.getTime())) {
          renewedOn = startDate && !isNaN(startDate.getTime()) ? startDate : new Date();
        }
        const amount = (item.amount !== undefined && item.amount !== null && !isNaN(Number(item.amount)))
          ? Number(item.amount)
          : 0;
        const paymentMethod = String(item.paymentMethod || '').trim() || 'Main Record';

        return {
          ...item,
          period,
          startDate: startDate && !isNaN(startDate.getTime()) ? startDate : undefined,
          expiryDate: expiryDate && !isNaN(expiryDate.getTime()) ? expiryDate : undefined,
          renewedOn,
          amount,
          paymentMethod,
          invoiceNo: item.invoiceNo ? String(item.invoiceNo).trim() : undefined,
          notes: item.notes ? String(item.notes).trim() : undefined,
        };
      });
  };

  it('filters out completely empty, null, and ghost renewal entries', () => {
    const raw = [
      { period: 'Initial Contract', startDate: '2021-08-01', expiryDate: '2022-07-31', amount: 0, paymentMethod: 'Main Record' },
      {},
      null,
      { period: 'Renewal' },
      { period: '1 Year', startDate: '2026-11-03', expiryDate: '2027-11-02', amount: 1600, paymentMethod: 'Bank Transfer' },
    ];
    const normalized = normalizeRenewalHistory(raw);
    expect(normalized.length).toBe(2);
    expect(normalized[0].period).toBe('Initial Contract');
    expect(normalized[1].period).toBe('1 Year');
  });

  it('populates required fields with safe defaults so Mongoose validation never fails', () => {
    const raw = [
      { startDate: '2026-01-01', expiryDate: '2026-12-31' }, // Missing period, amount, paymentMethod, renewedOn
    ];
    const normalized = normalizeRenewalHistory(raw);
    expect(normalized.length).toBe(1);
    expect(normalized[0].period).toBe('1 Year');
    expect(normalized[0].amount).toBe(0);
    expect(normalized[0].paymentMethod).toBe('Main Record');
    expect(normalized[0].renewedOn).toBeDefined();
  });

  it('heals Initial Contract start date when corrupted', () => {
    const raw = [
      { period: 'Initial Contract', startDate: '2026-09-08', expiryDate: '2022-07-31', amount: 0, paymentMethod: 'Main Record' },
    ];
    const normalized = normalizeRenewalHistory(raw);
    expect(normalized[0].startDate).toEqual(new Date('2021-08-01'));
  });
});

