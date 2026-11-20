import { describe, it, expect, vi } from 'vitest';
import { renewTSS, renewAMC, renewTDL, renewCloud, calculateStartDateFromExpiry } from '../crmController';
import Customer from '../../models/Customer';
import { AMC } from '../../models/index';

describe('Renewal Initial Start Date Preservation & Integrity (AMC, TSS, TDL, Cloud)', () => {
  describe('calculateStartDateFromExpiry', () => {
    it('calculates 1 Year start date from expiry date accurately', () => {
      // 2022-07-31 expiry -> start date 2021-08-01
      expect(calculateStartDateFromExpiry('2022-07-31', '1 Year')).toBe('2021-08-01');
      // 2023-07-11 expiry -> start date 2022-07-12
      expect(calculateStartDateFromExpiry('2023-07-11', '1 Year')).toBe('2022-07-12');
      // 2027-11-02 expiry -> start date 2026-11-03
      expect(calculateStartDateFromExpiry('2027-11-02', '1 Year')).toBe('2026-11-03');
    });

    it('handles 6 Months, 2 Years and 3 Years correctly', () => {
      expect(calculateStartDateFromExpiry('2023-06-30', '6 Months')).toBe('2023-01-01');
      expect(calculateStartDateFromExpiry('2024-07-31', '2 Years')).toBe('2022-08-01');
      expect(calculateStartDateFromExpiry('2025-07-31', '3 Years')).toBe('2022-08-01');
    });

    it('returns empty string on invalid or missing date', () => {
      expect(calculateStartDateFromExpiry('')).toBe('');
      expect(calculateStartDateFromExpiry(null)).toBe('');
      expect(calculateStartDateFromExpiry(undefined)).toBe('');
      expect(calculateStartDateFromExpiry('not-a-date')).toBe('');
    });
  });

  describe('renewTSS Initial Start Date Preservation', () => {
    it('derives initial start date from expiry date when initial startDate is missing or corrupted', async () => {
      const mockCustomer = {
        _id: 'cust-tss-001',
        customerNumber: 'WT0005',
        name: 'Britannic Water Treatment co. W.L.L',
        createdAt: new Date('2026-09-08T11:22:27.643Z'),
        tssDetails: {
          startDate: undefined, // Missing startDate on imported Excel customer
          endDate: new Date('2022-07-31T00:00:00.000Z'),
          currentPrice: 0,
          renewalHistory: [],
        },
      };

      (Customer.findOne as any) = vi.fn().mockResolvedValue(mockCustomer);
      let capturedUpdate: any = null;
      (Customer.findOneAndUpdate as any) = vi.fn().mockImplementation(async (_query: any, update: any) => {
        capturedUpdate = update;
        return { ...mockCustomer, ...update.$set };
      });

      const req: any = {
        params: { id: 'cust-tss-001' },
        body: {
          newStartDate: '2026-11-03',
          newExpiryDate: '2027-11-02',
          amount: 56,
          moduleDetails: {},
          renewalData: {
            period: '1 Year',
            paymentMethod: 'Bank Transfer',
          },
        },
        user: { role: 'admin' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await renewTSS(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedUpdate).toBeDefined();

      // Check initialStartDate saved in tssDetails
      expect(capturedUpdate.$set['tssDetails.initialStartDate']).toBeDefined();
      const initialStartStr = new Date(capturedUpdate.$set['tssDetails.initialStartDate']).toISOString().split('T')[0];
      expect(initialStartStr).toBe('2021-08-01');

      // Check Initial Contract row inside renewalHistory
      const historyEach = capturedUpdate.$push['tssDetails.renewalHistory'].$each;
      expect(historyEach).toHaveLength(2);
      const initialEntry = historyEach[0];
      expect(initialEntry.period).toBe('Initial Contract');
      expect(new Date(initialEntry.startDate).toISOString().split('T')[0]).toBe('2021-08-01');
      expect(new Date(initialEntry.expiryDate).toISOString().split('T')[0]).toBe('2022-07-31');

      // Check new renewal row
      const renewalEntry = historyEach[1];
      expect(renewalEntry.period).toBe('1 Year');
      expect(new Date(renewalEntry.startDate).toISOString().split('T')[0]).toBe('2026-11-03');
      expect(new Date(renewalEntry.expiryDate).toISOString().split('T')[0]).toBe('2027-11-02');
      expect(renewalEntry.amount).toBe(56);
    });

    it('heals corrupted Initial Contract in renewalHistory where startDate > expiryDate', async () => {
      const mockCustomer = {
        _id: 'cust-tss-002',
        customerNumber: 'WT0005',
        name: 'Britannic Water Treatment co. W.L.L',
        tssDetails: {
          startDate: new Date('2026-11-03T00:00:00.000Z'),
          endDate: new Date('2027-11-02T00:00:00.000Z'),
          renewalHistory: [
            {
              period: 'Initial Contract',
              renewedOn: new Date('2026-09-08T11:22:27.643Z'),
              startDate: new Date('2026-09-08T11:22:27.643Z'), // Corrupted start date!
              expiryDate: new Date('2022-07-31T00:00:00.000Z'),
              amount: 0,
            },
            {
              period: '1 Year',
              renewedOn: new Date('2026-11-03T00:00:00.000Z'),
              startDate: new Date('2026-11-03T00:00:00.000Z'),
              expiryDate: new Date('2027-11-02T00:00:00.000Z'),
              amount: 56,
            },
          ],
        },
      };

      (Customer.findOne as any) = vi.fn().mockResolvedValue(mockCustomer);
      let capturedUpdate: any = null;
      (Customer.findOneAndUpdate as any) = vi.fn().mockImplementation(async (_query: any, update: any) => {
        capturedUpdate = update;
        return { ...mockCustomer, ...update.$set };
      });

      const req: any = {
        params: { id: 'cust-tss-002' },
        body: {
          newStartDate: '2027-11-03',
          newExpiryDate: '2028-11-02',
          amount: 60,
          moduleDetails: {},
          renewalData: {
            period: '1 Year',
            paymentMethod: 'Bank Transfer',
          },
        },
        user: { role: 'admin' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await renewTSS(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const updatedHistory = capturedUpdate.$set['tssDetails.renewalHistory'];
      expect(updatedHistory).toBeDefined();
      expect(updatedHistory).toHaveLength(3);

      // Verify the Initial Contract row was healed to 2021-08-01
      const healedInitial = updatedHistory[0];
      expect(healedInitial.period).toBe('Initial Contract');
      expect(new Date(healedInitial.startDate).toISOString().split('T')[0]).toBe('2021-08-01');
      expect(new Date(healedInitial.expiryDate).toISOString().split('T')[0]).toBe('2022-07-31');
    });
  });

  describe('renewAMC Initial Start Date Preservation', () => {
    it('heals and preserves Initial Contract dates without leakage from renewal start date', async () => {
      const mockAmc = {
        _id: 'amc-001',
        customer: 'cust-001',
        amount: 900,
        startDate: new Date('2018-07-12'),
        expiryDate: new Date('2023-07-11'),
        renewalHistory: [],
      };

      (AMC.findOne as any) = vi.fn().mockResolvedValue(mockAmc);
      (AMC.updateOne as any) = vi.fn().mockResolvedValue({});
      let capturedUpdate: any = null;
      (AMC.findOneAndUpdate as any) = vi.fn().mockImplementation((_query: any, update: any) => {
        capturedUpdate = update;
        return {
          populate: vi.fn().mockResolvedValue({
            ...mockAmc,
            ...update.$set,
          }),
        };
      });

      const req: any = {
        params: { id: 'amc-001' },
        body: {
          newStartDate: '2023-07-12',
          newExpiryDate: '2024-07-11',
          amount: 900,
          moduleDetails: {},
          renewalData: {
            period: '1 Year',
            paymentMethod: 'Bank Transfer',
          },
        },
        user: { role: 'admin' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await renewAMC(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedUpdate.$set.initialStartDate).toEqual(mockAmc.startDate);
      expect(capturedUpdate.$set.initialExpiryDate).toEqual(mockAmc.expiryDate);

      const historyEach = capturedUpdate.$push.renewalHistory.$each;
      expect(historyEach[0].period).toBe('Initial Contract');
      expect(new Date(historyEach[0].startDate).toISOString().split('T')[0]).toBe('2018-07-12');
      expect(new Date(historyEach[0].expiryDate).toISOString().split('T')[0]).toBe('2023-07-11');
      expect(new Date(historyEach[1].startDate).toISOString().split('T')[0]).toBe('2023-07-12');
    });
  });

  describe('renewTDL and renewCloud Initial Date Integrity', () => {
    it('derives initial start date for TDL when startDate is missing', async () => {
      const mockCustomer = {
        _id: 'cust-tdl-001',
        tdlDetails: {
          startDate: undefined,
          endDate: new Date('2024-12-31'),
          renewalHistory: [],
        },
      };

      (Customer.findOne as any) = vi.fn().mockResolvedValue(mockCustomer);
      let capturedUpdate: any = null;
      (Customer.findOneAndUpdate as any) = vi.fn().mockImplementation(async (_query: any, update: any) => {
        capturedUpdate = update;
        return { ...mockCustomer, ...update.$set };
      });

      const req: any = {
        params: { id: 'cust-tdl-001' },
        body: {
          newStartDate: '2025-01-01',
          newExpiryDate: '2025-12-31',
          amount: 400,
          moduleDetails: {},
          renewalData: { period: '1 Year' },
        },
        user: { role: 'admin' },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      await renewTDL(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      const initialEntry = capturedUpdate.$push['tdlDetails.renewalHistory'].$each[0];
      expect(new Date(initialEntry.startDate).toISOString().split('T')[0]).toBe('2024-01-01');
      expect(new Date(initialEntry.expiryDate).toISOString().split('T')[0]).toBe('2024-12-31');
    });

    it('derives initial start date for Cloud when startDate is missing', async () => {
      const mockCustomer = {
        _id: 'cust-cloud-001',
        cloudDetails: {
          startDate: undefined,
          endDate: new Date('2025-06-30'),
          renewalHistory: [],
        },
      };

      (Customer.findOne as any) = vi.fn().mockResolvedValue(mockCustomer);
      let capturedUpdate: any = null;
      (Customer.findOneAndUpdate as any) = vi.fn().mockImplementation(async (_query: any, update: any) => {
        capturedUpdate = update;
        return { ...mockCustomer, ...update.$set };
      });

      const req: any = {
        params: { id: 'cust-cloud-001' },
        body: {
          newStartDate: '2025-07-01',
          newExpiryDate: '2026-06-30',
          amount: 1200,
          moduleDetails: {},
          renewalData: { period: '1 Year' },
        },
        user: { role: 'admin' },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      await renewCloud(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      const initialEntry = capturedUpdate.$push['cloudDetails.renewalHistory'].$each[0];
      expect(new Date(initialEntry.startDate).toISOString().split('T')[0]).toBe('2024-07-01');
      expect(new Date(initialEntry.expiryDate).toISOString().split('T')[0]).toBe('2025-06-30');
    });
  });
});
