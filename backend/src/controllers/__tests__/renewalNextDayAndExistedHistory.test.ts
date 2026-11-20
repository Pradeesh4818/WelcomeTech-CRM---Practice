import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRenewalPrefill, renewAMC, renewTDL, renewCloud, renewTSS } from '../crmController';
import { calculateRemainingDays, toCalendarUtcMidnight } from '../../utils/controllerHelpers';
import { AMC } from '../../models/index';
import Customer from '../../models/Customer';

vi.mock('../../models/index', () => ({
  AMC: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn().mockResolvedValue({}),
  },
  Ticket: {},
  Payment: {},
  Proposal: {},
  ProposalTemplate: {},
  TicketFollowUp: {},
  TicketActivity: {},
}));

vi.mock('../../models/Customer', () => {
  const mockCustomer: any = {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findById: vi.fn(),
    updateOne: vi.fn().mockResolvedValue({}),
  };
  return {
    default: mockCustomer,
  };
});

describe('Global Renewal Issues: Next Day Date & Existed Data Preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Issue 1: getRenewalPrefill calculates the next day of the expired date', () => {
    it('sets newStartDate to the day after expired date for TSS', async () => {
      const mockCustomer = {
        _id: 'cust-123',
        tssDetails: {
          endDate: new Date('2023-07-11T00:00:00.000Z'),
          renewalHistory: [],
        },
        services: [
          {
            type: 'tss',
            endDate: new Date('2023-07-11T00:00:00.000Z'),
            renewalHistory: [],
          },
        ],
      };
      (Customer.findOne as any).mockResolvedValue(mockCustomer);

      const req: any = {
        params: { module: 'tss', customerId: 'cust-123' },
        user: { role: 'admin' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getRenewalPrefill(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0].data;
      expect(data.newStartDate).toBe('2023-07-12');
      expect(data.newExpiryDate).toBe('2024-07-11');
    });

    it('sets newStartDate to the day after expired date for TDL', async () => {
      const mockCustomer = {
        _id: 'cust-123',
        tdlDetails: {
          endDate: new Date('2023-07-11T00:00:00.000Z'),
          renewalHistory: [],
        },
      };
      (Customer.findOne as any).mockResolvedValue(mockCustomer);

      const req: any = {
        params: { module: 'tdl', customerId: 'cust-123' },
        user: { role: 'admin' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getRenewalPrefill(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0].data;
      expect(data.newStartDate).toBe('2023-07-12');
      expect(data.newExpiryDate).toBe('2024-07-11');
    });

    it('sets newStartDate to the day after expired date for Cloud', async () => {
      const mockCustomer = {
        _id: 'cust-123',
        cloudDetails: {
          cloudExpiryDate: new Date('2023-07-11T00:00:00.000Z'),
          renewalHistory: [],
        },
      };
      (Customer.findOne as any).mockResolvedValue(mockCustomer);

      const req: any = {
        params: { module: 'cloud', customerId: 'cust-123' },
        user: { role: 'admin' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getRenewalPrefill(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0].data;
      expect(data.newStartDate).toBe('2023-07-12');
      expect(data.newExpiryDate).toBe('2024-07-11');
    });
  });

  describe('Issue 2: renewAMC preserves existed Initial Contract data and renewal row is distinct', () => {
    it('saves Initial Contract in renewalHistory on first renewal without overwriting existed record', async () => {
      const existingAmc = {
        _id: 'amc-123',
        startDate: '2018-07-12',
        expiryDate: '2023-07-11',
        amount: 0,
        notes: 'Main Contract Notes',
        customer: 'cust-123',
        renewalHistory: [],
      };
      (AMC.findOne as any).mockResolvedValue(existingAmc);

      let capturedUpdate: any = null;
      (AMC.findOneAndUpdate as any).mockImplementation((_query: any, updateOps: any) => {
        capturedUpdate = updateOps;
        return {
          populate: vi.fn().mockResolvedValue({
            ...existingAmc,
            ...updateOps.$set,
            renewalHistory: updateOps.$push?.renewalHistory?.$each || updateOps.$push?.renewalHistory || [],
          }),
        };
      });

      const req: any = {
        params: { id: 'amc-123' },
        user: { role: 'admin' },
        body: {
          newStartDate: '2023-07-12',
          newExpiryDate: '2024-07-11',
          amount: 900,
          renewalData: {
            period: '1 Year',
            paymentMethod: 'Bank Transfer',
            invoiceNo: 'INV-001',
          },
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await renewAMC(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedUpdate).toBeDefined();

      // Check initial contract preservation
      expect(capturedUpdate.$set.initialStartDate).toBe('2018-07-12');
      expect(capturedUpdate.$set.initialExpiryDate).toBe('2023-07-11');
      expect(capturedUpdate.$set.initialAmount).toBe(0);

      // Check renewalHistory has both Initial Contract and new renewal
      const historyEach = capturedUpdate.$push?.renewalHistory?.$each;
      expect(historyEach).toBeDefined();
      expect(historyEach.length).toBe(2);

      // Row 1: Initial Contract
      expect(historyEach[0].period).toBe('Initial Contract');
      expect(new Date(historyEach[0].startDate).toISOString().split('T')[0]).toBe('2018-07-12');
      expect(new Date(historyEach[0].expiryDate).toISOString().split('T')[0]).toBe('2023-07-11');
      expect(historyEach[0].amount).toBe(0);

      // Row 2: Renewal
      expect(historyEach[1].period).toBe('1 Year');
      expect(new Date(historyEach[1].startDate).toISOString().split('T')[0]).toBe('2023-07-12');
      expect(new Date(historyEach[1].expiryDate).toISOString().split('T')[0]).toBe('2024-07-11');
      expect(historyEach[1].amount).toBe(900);
      expect(historyEach[1].paymentMethod).toBe('Bank Transfer');
    });

    it('appends only renewal if Initial Contract is already preserved in renewalHistory', async () => {
      const existingAmc = {
        _id: 'amc-123',
        startDate: '2023-07-12',
        expiryDate: '2024-07-11',
        amount: 900,
        customer: 'cust-123',
        renewalHistory: [
          {
            period: 'Initial Contract',
            startDate: '2018-07-12',
            expiryDate: '2023-07-11',
            amount: 0,
          },
          {
            period: '1 Year',
            startDate: '2023-07-12',
            expiryDate: '2024-07-11',
            amount: 900,
          },
        ],
      };
      (AMC.findOne as any).mockResolvedValue(existingAmc);

      let capturedUpdate: any = null;
      (AMC.findOneAndUpdate as any).mockImplementation((_query: any, updateOps: any) => {
        capturedUpdate = updateOps;
        return {
          populate: vi.fn().mockResolvedValue({
            ...existingAmc,
            ...updateOps.$set,
          }),
        };
      });

      const req: any = {
        params: { id: 'amc-123' },
        user: { role: 'admin' },
        body: {
          newStartDate: '2024-07-12',
          newExpiryDate: '2025-07-11',
          amount: 1000,
          renewalData: {
            period: '1 Year',
            paymentMethod: 'Cheque',
          },
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await renewAMC(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedUpdate.$push.renewalHistory.period).toBe('1 Year');
      expect(new Date(capturedUpdate.$push.renewalHistory.startDate).toISOString().split('T')[0]).toBe('2024-07-12');
      expect(new Date(capturedUpdate.$push.renewalHistory.expiryDate).toISOString().split('T')[0]).toBe('2025-07-11');
      expect(capturedUpdate.$push.renewalHistory.amount).toBe(1000);
    });
  });

  describe('Issue 2: renewTDL, renewCloud, renewTSS preserve initial contract data', () => {
    it('renewTDL preserves initial contract and pushes distinct renewal record', async () => {
      const mockCustomer = {
        _id: 'cust-tdl',
        tdlDetails: {
          startDate: '2020-01-01',
          endDate: '2021-01-01',
          currentPrice: 500,
          renewalHistory: [],
        },
      };
      (Customer.findOne as any).mockResolvedValue(mockCustomer);

      let capturedUpdate: any = null;
      (Customer.findOneAndUpdate as any).mockImplementation((_query: any, updateOps: any) => {
        capturedUpdate = updateOps;
        return mockCustomer;
      });

      const req: any = {
        params: { id: 'cust-tdl' },
        user: { role: 'admin' },
        body: {
          newStartDate: '2021-01-02',
          newExpiryDate: '2022-01-01',
          amount: 600,
          renewalData: { period: '1 Year', paymentMethod: 'Cash' },
        },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      await renewTDL(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedUpdate.$set['tdlDetails.initialStartDate']).toBe('2020-01-01');
      expect(capturedUpdate.$set['tdlDetails.initialEndDate']).toBe('2021-01-01');
      expect(capturedUpdate.$set['tdlDetails.initialPrice']).toBe(500);

      const tdlEach = capturedUpdate.$push['tdlDetails.renewalHistory'].$each;
      expect(tdlEach).toHaveLength(2);
      expect(tdlEach[0].period).toBe('Initial Contract');
      expect(new Date(tdlEach[0].startDate).toISOString().split('T')[0]).toBe('2020-01-01');
      expect(tdlEach[1].period).toBe('1 Year');
      expect(new Date(tdlEach[1].startDate).toISOString().split('T')[0]).toBe('2021-01-02');
    });

    it('renewCloud preserves initial contract and pushes distinct renewal record', async () => {
      const mockCustomer = {
        _id: 'cust-cloud',
        cloudDetails: {
          startDate: '2021-05-01',
          endDate: '2022-05-01',
          currentPrice: 800,
          renewalHistory: [],
        },
      };
      (Customer.findOne as any).mockResolvedValue(mockCustomer);

      let capturedUpdate: any = null;
      (Customer.findOneAndUpdate as any).mockImplementation((_query: any, updateOps: any) => {
        capturedUpdate = updateOps;
        return mockCustomer;
      });

      const req: any = {
        params: { id: 'cust-cloud' },
        user: { role: 'admin' },
        body: {
          newStartDate: '2022-05-02',
          newExpiryDate: '2023-05-01',
          amount: 850,
          renewalData: { period: '1 Year', paymentMethod: 'Bank Transfer' },
        },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      await renewCloud(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedUpdate.$set['cloudDetails.initialStartDate']).toBe('2021-05-01');
      expect(capturedUpdate.$set['cloudDetails.initialEndDate']).toBe('2022-05-01');
      expect(capturedUpdate.$set['cloudDetails.initialPrice']).toBe(800);

      const cloudEach = capturedUpdate.$push['cloudDetails.renewalHistory'].$each;
      expect(cloudEach).toHaveLength(2);
      expect(cloudEach[0].period).toBe('Initial Contract');
      expect(cloudEach[1].period).toBe('1 Year');
      expect(new Date(cloudEach[1].startDate).toISOString().split('T')[0]).toBe('2022-05-02');
    });

    it('renewTSS preserves initial contract and pushes distinct renewal record', async () => {
      const mockCustomer = {
        _id: 'cust-tss',
        tssDetails: {
          startDate: '2022-03-15',
          endDate: '2023-03-14',
          currentPrice: 400,
          renewalHistory: [],
        },
      };
      (Customer.findOne as any).mockResolvedValue(mockCustomer);

      let capturedUpdate: any = null;
      (Customer.findOneAndUpdate as any).mockImplementation((_query: any, updateOps: any) => {
        capturedUpdate = updateOps;
        return mockCustomer;
      });

      const req: any = {
        params: { id: 'cust-tss' },
        user: { role: 'admin' },
        body: {
          newStartDate: '2023-03-15',
          newExpiryDate: '2024-03-14',
          amount: 450,
          renewalData: { period: '1 Year', paymentMethod: 'Bank Transfer' },
        },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      await renewTSS(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedUpdate.$set['tssDetails.initialStartDate']).toBe('2022-03-15');
      expect(capturedUpdate.$set['tssDetails.initialEndDate']).toBe('2023-03-14');
      expect(capturedUpdate.$set['tssDetails.initialPrice']).toBe(400);

      const tssEach = capturedUpdate.$push['tssDetails.renewalHistory'].$each;
      expect(tssEach).toHaveLength(2);
      expect(tssEach[0].period).toBe('Initial Contract');
      expect(tssEach[1].period).toBe('1 Year');
      expect(new Date(tssEach[1].startDate).toISOString().split('T')[0]).toBe('2023-03-15');
    });
  });

  describe('Issue 3: Remaining Days Calculation (Row 1, Row 2, Row 5 & Overdue Scenarios)', () => {
    const evalDate = new Date('2026-11-03T10:30:00.000Z');

    it('caps future-starting contract at total contract duration (Row 2 scenario: 365 days, NOT 366)', () => {
      // Start: 2026-11-05, Expiry: 2027-11-04 (1 Year contract starting in 2 days)
      const days = calculateRemainingDays('2027-11-04', '2026-11-05', evalDate);
      expect(days).toBe(365);
    });

    it('returns full 365 days for contract starting tomorrow (Row 1 scenario)', () => {
      // Start: 2026-11-04, Expiry: 2027-11-03 (1 Year contract starting tomorrow)
      const days = calculateRemainingDays('2027-11-03', '2026-11-04', evalDate);
      expect(days).toBe(365);
    });

    it('returns full 365 days on day 1 of an active 1-year contract (Row 5 scenario: NOT 364)', () => {
      // Start: 2026-11-03, Expiry: 2027-11-02 (1 Year contract started today)
      const days = calculateRemainingDays('2027-11-02', '2026-11-03', evalDate);
      expect(days).toBe(365);
    });

    it('decrements correctly on Day 2 of the contract', () => {
      const day2Date = new Date('2026-11-04T08:00:00.000Z');
      const days = calculateRemainingDays('2027-11-02', '2026-11-03', day2Date);
      expect(days).toBe(364);
    });

    it('returns 1 day left on the final day of the contract', () => {
      const finalDay = new Date('2027-11-02T14:00:00.000Z');
      const days = calculateRemainingDays('2027-11-02', '2026-11-03', finalDay);
      expect(days).toBe(1);
    });

    it('returns -1 (1d overdue) on the day after expiry', () => {
      const dayAfter = new Date('2027-11-03T09:00:00.000Z');
      const days = calculateRemainingDays('2027-11-02', '2026-11-03', dayAfter);
      expect(days).toBe(-1);
    });

    it('returns -3 (3d overdue) for contract expired 3 days ago (Row 7 scenario)', () => {
      // Expiry: 2026-10-31, evaluated on 2026-11-03
      const days = calculateRemainingDays('2026-10-31', '2025-11-01', evalDate);
      expect(days).toBe(-3);
    });

    it('handles missing startDate gracefully without NaN or runtime errors', () => {
      const futureDays = calculateRemainingDays('2027-11-03', undefined, evalDate);
      expect(futureDays).toBe(365);

      const pastDays = calculateRemainingDays('2026-10-31', undefined, evalDate);
      expect(pastDays).toBe(-3);
    });
  });
});
