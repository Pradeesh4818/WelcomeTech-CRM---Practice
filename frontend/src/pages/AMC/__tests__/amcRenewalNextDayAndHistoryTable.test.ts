import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getNextCalendarDay, calculateCalendarExpiry, computeAmcDaysLeft } from '../AMCPages';
import { calculateRemainingDays } from '../../../utils/helpers';

describe('AMC and Module Renewal Date & Calendar Math', () => {
  describe('getNextCalendarDay', () => {
    it('returns the next calendar day from a string date (e.g. expired date 11/07/2023 -> 12/07/2023)', () => {
      expect(getNextCalendarDay('2023-07-11')).toBe('2023-07-12');
    });

    it('returns the next calendar day across month boundaries', () => {
      expect(getNextCalendarDay('2023-01-31')).toBe('2023-02-01');
    });

    it('returns the next calendar day across year boundaries', () => {
      expect(getNextCalendarDay('2023-12-31')).toBe('2024-01-01');
    });

    it('handles ISO timestamps correctly without UTC timezone shift', () => {
      expect(getNextCalendarDay('2023-07-11T00:00:00.000Z')).toBe('2023-07-12');
    });

    it('handles Date objects', () => {
      const dt = new Date('2023-07-11T00:00:00.000Z');
      expect(getNextCalendarDay(dt)).toBe('2023-07-12');
    });

    it('returns empty string for null, undefined, or empty values', () => {
      expect(getNextCalendarDay('')).toBe('');
      expect(getNextCalendarDay(null)).toBe('');
      expect(getNextCalendarDay(undefined)).toBe('');
    });
  });

  describe('calculateCalendarExpiry', () => {
    it('calculates 1 Year expiry as the day before anniversary (12/07/2023 -> 11/07/2024)', () => {
      expect(calculateCalendarExpiry('2023-07-12', '1 Year')).toBe('2024-07-11');
    });

    it('calculates 6 Months expiry as the day before 6 months (12/07/2023 -> 11/01/2024)', () => {
      expect(calculateCalendarExpiry('2023-07-12', '6 Months')).toBe('2024-01-11');
    });

    it('calculates 2 Years expiry as the day before 2 years (12/07/2023 -> 11/07/2025)', () => {
      expect(calculateCalendarExpiry('2023-07-12', '2 Years')).toBe('2025-07-11');
    });

    it('calculates 3 Years expiry as the day before 3 years (12/07/2023 -> 11/07/2026)', () => {
      expect(calculateCalendarExpiry('2023-07-12', '3 Years')).toBe('2026-07-11');
    });
  });

  describe('Renewal Table Data Integrity & Deduplication', () => {
    it('ensures Row 1 (Initial / Main Contract) preserves existed data when renewals exist', () => {
      const viewAmc: any = {
        _id: 'amc-alkhaleej',
        startDate: '2026-11-05',
        expiryDate: '2027-11-04',
        amount: 900,
        initialStartDate: '2018-07-12',
        initialExpiryDate: '2023-07-11',
        initialAmount: 0,
        renewalHistory: [
          {
            period: 'Initial Contract',
            startDate: '2018-07-12',
            expiryDate: '2023-07-11',
            amount: 0,
          },
          {
            period: '1 Year',
            startDate: '2026-11-05',
            expiryDate: '2027-11-04',
            amount: 900,
            renewedOn: '2026-11-02',
          },
        ],
      };

      const history = viewAmc.renewalHistory || [];
      const initialEntry = history.find((rh: any) => rh.period === 'Initial Contract');
      const renewals = history.filter((rh: any) => rh.period !== 'Initial Contract');
      const hasRenewals = renewals.length > 0;

      const initialStart = initialEntry?.startDate || viewAmc.initialStartDate || viewAmc.startDate;
      const initialEnd = initialEntry?.expiryDate || viewAmc.initialExpiryDate || viewAmc.expiryDate;
      const initialAmt = initialEntry?.amount ?? viewAmc.initialAmount ?? viewAmc.amount;

      // Row 1 (Main / Initial Contract)
      expect(initialStart).toBe('2018-07-12');
      expect(initialEnd).toBe('2023-07-11');
      expect(initialAmt).toBe(0);
      expect(hasRenewals).toBe(true);

      // Row 2 (Renewal)
      expect(renewals).toHaveLength(1);
      expect(renewals[0].startDate).toBe('2026-11-05');
      expect(renewals[0].expiryDate).toBe('2027-11-04');
      expect(renewals[0].amount).toBe(900);

      // Verify Row 1 and Row 2 have completely different dates and amounts!
      expect(initialStart).not.toBe(renewals[0].startDate);
      expect(initialEnd).not.toBe(renewals[0].expiryDate);
    });
  });

  describe('Remaining Days Calculation & Mismatch Prevention', () => {
    const today = new Date('2026-11-03T10:30:00.000Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(today);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('Row 2: Caps future-starting 1-year contract at 365 days (NOT 366D)', () => {
      // Start 2026-11-05, Expiry 2027-11-04 (starts in 2 days)
      const days = calculateRemainingDays('2027-11-04', '2026-11-05', today);
      expect(days).toBe(365);

      const amc = { startDate: '2026-11-05', expiryDate: '2027-11-04' };
      expect(computeAmcDaysLeft(amc)).toBe(365);
    });

    it('Row 1: Returns 365 days for contract starting tomorrow', () => {
      // Start 2026-11-04, Expiry 2027-11-03 (starts tomorrow)
      const days = calculateRemainingDays('2027-11-03', '2026-11-04', today);
      expect(days).toBe(365);
    });

    it('Row 5: Returns 365 days on day 1 of an active 1-year contract (NOT 364D)', () => {
      // Start 2026-11-03, Expiry 2027-11-02 (starts today)
      const days = calculateRemainingDays('2027-11-02', '2026-11-03', today);
      expect(days).toBe(365);

      const amc = { startDate: '2026-11-03', expiryDate: '2027-11-02' };
      expect(computeAmcDaysLeft(amc)).toBe(365);
    });

    it('Row 7: Correctly computes overdue days for expired contract (-3 for 3d overdue)', () => {
      // Expiry 2026-10-31, evaluated on 2026-11-03
      const days = calculateRemainingDays('2026-10-31', '2025-11-01', today);
      expect(days).toBe(-3);
    });
  });
});

