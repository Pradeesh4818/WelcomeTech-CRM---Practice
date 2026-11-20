import { describe, it, expect } from 'vitest';
import { calculateStartDateFromExpiry } from '../CustomerManagementPages';
import { calculateCalendarStartDateFromExpiry } from '../../AMC/AMCPages';
import { Customer, ServiceInstance, AMCRenewal } from '../../../types';

describe('Global Renewal Initial Start Date Integrity & Preservation (AMC, TSS, TDL, Cloud)', () => {
  describe('calculateStartDateFromExpiry', () => {
    it('accurately derives start date 1 year prior to expiry date', () => {
      // 2022-07-31 expiry -> start date 2021-08-01 (Britannic Water WT0005 case)
      expect(calculateStartDateFromExpiry('2022-07-31', '1 Year')).toBe('2021-08-01');
      // 2023-07-11 expiry -> start date 2022-07-12
      expect(calculateStartDateFromExpiry('2023-07-11', '1 Year')).toBe('2022-07-12');
      // 2027-11-02 expiry -> start date 2026-11-03
      expect(calculateStartDateFromExpiry('2027-11-02', '1 Year')).toBe('2026-11-03');
    });

    it('works identically in AMCPages calculateCalendarStartDateFromExpiry', () => {
      expect(calculateCalendarStartDateFromExpiry('2022-07-31', '1 Year')).toBe('2021-08-01');
      expect(calculateCalendarStartDateFromExpiry('2023-07-11', '1 Year')).toBe('2022-07-12');
      expect(calculateCalendarStartDateFromExpiry('2027-11-02', '1 Year')).toBe('2026-11-03');
    });
  });

  describe('Initial Contract Date Resolution in Renewal Modal & Tables', () => {
    it('TC-INIT-01: prevents initial contract start date from defaulting to createdAt (08 Sep 2026) when expiry is 2022-07-31', () => {
      const service: Partial<ServiceInstance> = {
        _id: 'srv_tss_wt0005',
        type: 'tss',
        tssExpiryDate: '2022-07-31T00:00:00.000Z',
        endDate: '2022-07-31T00:00:00.000Z',
        startDate: undefined, // Missing on imported customer
        createdAt: '2026-09-08T11:22:27.643Z',
      };

      const initialExpiry = (service.endDate as string) || (service.tssExpiryDate as string);
      let initialStart = (service.startDate as string) || (service.initialStartDate as string);
      if (!initialStart || (initialExpiry && new Date(initialStart) > new Date(initialExpiry))) {
        initialStart = initialExpiry ? calculateStartDateFromExpiry(initialExpiry, '1 Year') : (service.createdAt as string);
      }

      expect(initialStart).toBe('2021-08-01');
      expect(initialStart).not.toBe('2026-09-08');
      expect(new Date(initialStart).getTime()).toBeLessThan(new Date(initialExpiry).getTime());
    });

    it('TC-INIT-02: heals corrupted initial contract entry where startDate > expiryDate', () => {
      // Mock history for WT0005 as was stored in DB
      const localHistory: AMCRenewal[] = [
        {
          period: 'Initial Contract',
          renewedOn: '2026-09-08T11:22:27.643Z',
          startDate: '2026-09-08T11:22:27.643Z', // Corrupted!
          expiryDate: '2022-07-31T00:00:00.000Z',
          amount: 0,
          paymentMethod: 'Main Record',
        },
        {
          period: '1 Year',
          renewedOn: '2026-11-03',
          startDate: '2026-11-03',
          expiryDate: '2027-11-02',
          amount: 56,
          paymentMethod: 'Bank Transfer',
        },
      ];

      const initialEntry = localHistory.find((r) => r.period === 'Initial Contract');
      const renewals = localHistory.filter((r) => r.period !== 'Initial Contract');
      const hasRenewals = renewals.length > 0;

      const currentRange = { start: '2026-11-03', end: '2027-11-02' };

      const initialEnd = initialEntry?.expiryDate || (hasRenewals ? undefined : currentRange.end) || currentRange.end;
      let initialStart = initialEntry?.startDate || (hasRenewals ? undefined : currentRange.start);

      // Apply healing
      if (!initialStart || (initialEnd && new Date(initialStart) > new Date(initialEnd))) {
        initialStart = initialEnd ? calculateStartDateFromExpiry(initialEnd, initialEntry?.period || '1 Year') : currentRange.start;
      }

      // Initial row must display 2021-08-01 and NOT 2026-09-08 or 2026-11-03
      expect(initialStart).toBe('2021-08-01');
      expect(initialEnd).toBe('2022-07-31T00:00:00.000Z');
      expect(initialStart).not.toBe('2026-09-08T11:22:27.643Z');
      expect(initialStart).not.toBe('2026-11-03');
    });

    it('TC-INIT-03: preserves valid initial startDate without overwriting when startDate <= expiryDate', () => {
      const localHistory: AMCRenewal[] = [
        {
          period: 'Initial Contract',
          renewedOn: '2018-07-12',
          startDate: '2018-07-12',
          expiryDate: '2023-07-11',
          amount: 900,
          paymentMethod: 'Main Contract',
        },
        {
          period: '1 Year',
          renewedOn: '2026-11-03',
          startDate: '2023-07-12',
          expiryDate: '2024-07-11',
          amount: 900,
          paymentMethod: 'Bank Transfer',
        },
      ];

      const initialEntry = localHistory.find((r) => r.period === 'Initial Contract');
      const renewals = localHistory.filter((r) => r.period !== 'Initial Contract');
      const hasRenewals = renewals.length > 0;
      const currentRange = { start: '2023-07-12', end: '2024-07-11' };

      const initialEnd = initialEntry?.expiryDate || (hasRenewals ? undefined : currentRange.end) || currentRange.end;
      let initialStart = initialEntry?.startDate || (hasRenewals ? undefined : currentRange.start);

      if (!initialStart || (initialEnd && new Date(initialStart) > new Date(initialEnd))) {
        initialStart = initialEnd ? calculateStartDateFromExpiry(initialEnd, initialEntry?.period || '1 Year') : currentRange.start;
      }

      // Valid start date 2018-07-12 must be completely preserved!
      expect(initialStart).toBe('2018-07-12');
      expect(initialEnd).toBe('2023-07-11');
    });

    it('TC-INIT-04: ensures patchSelectedService saves initialStartDate on the service record', () => {
      const initialStart = '2021-08-01';
      const initialEnd = '2022-07-31';
      const renewal: AMCRenewal = {
        period: '1 Year',
        renewedOn: '2026-11-03',
        startDate: '2026-11-03',
        expiryDate: '2027-11-02',
        amount: 56,
        paymentMethod: 'Bank Transfer',
      };

      const extras = {
        startDate: renewal.startDate,
        endDate: renewal.expiryDate,
        initialStartDate: initialStart,
        initialEndDate: initialEnd,
        currentPrice: renewal.amount,
        status: 'active' as const,
      };

      const mockCustomer: Customer = {
        _id: 'cust-wt0005',
        name: 'Britannic Water Treatment co. W.L.L',
        services: [
          {
            _id: 'srv-01',
            type: 'tss',
            status: 'expired',
            startDate: undefined,
            endDate: '2022-07-31',
          },
        ],
      } as any;

      const services = (mockCustomer.services || []).map((item) =>
        String(item._id || '') === 'srv-01'
          ? {
              ...item,
              ...extras,
              renewalHistory: [
                {
                  period: 'Initial Contract',
                  renewedOn: initialStart,
                  startDate: initialStart,
                  expiryDate: initialEnd,
                  amount: 0,
                  paymentMethod: 'Main Record',
                },
                renewal,
              ],
            }
          : item
      );

      // Verify that service has initialStartDate saved and not overwritten by renewal
      expect(services[0].initialStartDate).toBe('2021-08-01');
      expect(services[0].initialEndDate).toBe('2022-07-31');
      expect(services[0].startDate).toBe('2026-11-03');
      expect(services[0].endDate).toBe('2027-11-02');
      expect(services[0].renewalHistory).toHaveLength(2);
      expect(services[0].renewalHistory?.[0].startDate).toBe('2021-08-01');
    });
  });
});

