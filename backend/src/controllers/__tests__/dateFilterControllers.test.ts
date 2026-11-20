import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { getCalls, getProposals, getPayments } from '../crmController';
import { getCustomers, getCustomerManagementInsights } from '../customerController';
import Call from '../../models/Call';
import Customer from '../../models/Customer';
import { Proposal, Payment } from '../../models/index';

vi.mock('../../models/Call', () => ({
  default: {
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('../../models/Customer', () => ({
  default: {
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('../../models/index', () => ({
  Proposal: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
  },
  Payment: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
  },
  ProposalTemplate: {},
  Lead: {},
  Task: {},
  Settings: {},
  User: {},
}));

describe('CRM Controllers - Date Wise Filtration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCalls Date Filtration', () => {
    it('applies normalized day-boundary date filters to callDate and createdAt', async () => {
      let capturedFilter: any = null;
      (Call.find as any).mockImplementation((filter: any) => {
        capturedFilter = filter;
        return {
          populate: vi.fn().mockReturnThis(),
          sort: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          lean: vi.fn().mockResolvedValue([{ _id: 'call-1', subject: 'Printer Issue' }]),
        };
      });
      (Call.countDocuments as any).mockResolvedValue(1);

      const req: any = {
        query: {
          startDate: '2026-10-01',
          endDate: '2026-10-15',
        },
        user: { _id: 'admin-id', role: 'admin' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getCalls(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedFilter).toBeDefined();
      expect(capturedFilter.$and).toBeDefined();
      expect(capturedFilter.$and).toHaveLength(1);

      const dateMatch = capturedFilter.$and[0];
      expect(dateMatch.$or).toBeDefined();
      expect(dateMatch.$or).toHaveLength(2);

      const callDateCond = dateMatch.$or[0].callDate;
      const createdAtCond = dateMatch.$or[1].createdAt;

      expect(callDateCond.$gte.toISOString()).toBe(new Date('2026-10-01T00:00:00.000').toISOString());
      expect(callDateCond.$lte.toISOString()).toBe(new Date('2026-10-15T23:59:59.999').toISOString());
      expect(createdAtCond.$gte.toISOString()).toBe(new Date('2026-10-01T00:00:00.000').toISOString());
      expect(createdAtCond.$lte.toISOString()).toBe(new Date('2026-10-15T23:59:59.999').toISOString());
    });

    it('supports fromDate and toDate parameter aliases in getCalls', async () => {
      let capturedFilter: any = null;
      (Call.find as any).mockImplementation((filter: any) => {
        capturedFilter = filter;
        return {
          populate: vi.fn().mockReturnThis(),
          sort: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          lean: vi.fn().mockResolvedValue([]),
        };
      });
      (Call.countDocuments as any).mockResolvedValue(0);

      const req: any = {
        query: {
          fromDate: '2026-05-10',
          toDate: '2026-05-20',
        },
        user: { _id: 'admin-id', role: 'admin' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getCalls(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedFilter.$and).toBeDefined();
      const callDateCond = capturedFilter.$and[0].$or[0].callDate;
      expect(callDateCond.$gte.toISOString()).toBe(new Date('2026-05-10T00:00:00.000').toISOString());
      expect(callDateCond.$lte.toISOString()).toBe(new Date('2026-05-20T23:59:59.999').toISOString());
    });
  });

  describe('getProposals Date Filtration', () => {
    it('applies date filter condition to quoteDate and createdAt in standard query', async () => {
      let capturedFilter: any = null;
      (Proposal.find as any).mockImplementation((filter: any) => {
        capturedFilter = filter;
        return {
          populate: vi.fn().mockReturnThis(),
          sort: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ _id: 'prop-1', proposalNo: 'WT-Q1001' }]),
        };
      });
      (Proposal.countDocuments as any).mockResolvedValue(1);

      const req: any = {
        query: {
          startDate: '2026-09-01',
          endDate: '2026-09-30',
        },
        user: { _id: 'admin-id', role: 'admin' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getProposals(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedFilter).toBeDefined();
      expect(capturedFilter.$and).toBeDefined();

      const dateMatch = capturedFilter.$and[0];
      expect(dateMatch.$or[0].quoteDate.$gte.toISOString()).toBe(new Date('2026-09-01T00:00:00.000').toISOString());
      expect(dateMatch.$or[0].quoteDate.$lte.toISOString()).toBe(new Date('2026-09-30T23:59:59.999').toISOString());
      expect(dateMatch.$or[1].createdAt.$gte.toISOString()).toBe(new Date('2026-09-01T00:00:00.000').toISOString());
    });

    it('injects date condition into search aggregation pipeline for proposals', async () => {
      let capturedPipeline: any[] = [];
      (Proposal.aggregate as any).mockImplementation((pipeline: any[]) => {
        capturedPipeline = pipeline;
        if (pipeline.some((stage) => stage.$count)) {
          return Promise.resolve([{ total: 1 }]);
        }
        return Promise.resolve([{ _id: 'prop-search-1', proposalNo: 'WT-Q1002' }]);
      });

      const req: any = {
        query: {
          search: 'Alpha Corp',
          startDate: '2026-10-01',
          endDate: '2026-10-23',
        },
        user: { _id: 'admin-id', role: 'admin' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getProposals(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const matchStage = capturedPipeline.find((stage) => stage.$match);
      expect(matchStage).toBeDefined();
      expect(matchStage.$match.$and).toBeDefined();
      const dateCond = matchStage.$match.$and[0].$or[0].quoteDate;
      expect(dateCond.$gte.toISOString()).toBe(new Date('2026-10-01T00:00:00.000').toISOString());
      expect(dateCond.$lte.toISOString()).toBe(new Date('2026-10-23T23:59:59.999').toISOString());
    });
  });

  describe('getPayments Date Filtration', () => {
    it('applies paymentDate filter and reflects in aggregates when dates are provided', async () => {
      let capturedFilter: any = null;
      (Payment.find as any).mockImplementation((filter: any) => {
        capturedFilter = filter;
        return {
          populate: vi.fn().mockReturnThis(),
          sort: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ _id: 'pay-1', amount: 5000, status: 'paid' }]),
        };
      });
      (Payment.countDocuments as any).mockResolvedValue(1);

      let aggCalls: any[] = [];
      (Payment.aggregate as any).mockImplementation((pipeline: any[]) => {
        aggCalls.push(pipeline);
        return Promise.resolve([{ total: 5000 }]);
      });

      const req: any = {
        query: {
          startDate: '2026-10-01',
          endDate: '2026-10-23',
        },
        user: { _id: 'admin-id', role: 'admin' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getPayments(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedFilter.paymentDate).toBeDefined();
      expect(capturedFilter.paymentDate.$gte.toISOString()).toBe(new Date('2026-10-01T00:00:00.000').toISOString());
      expect(capturedFilter.paymentDate.$lte.toISOString()).toBe(new Date('2026-10-23T23:59:59.999').toISOString());

      // Monthly revenue, outstanding, and status aggregates should also respect date bounds
      expect(aggCalls.length).toBeGreaterThan(0);
      const monthlyMatch = aggCalls[0][0].$match;
      expect(monthlyMatch.paymentDate.$gte.toISOString()).toBe(new Date('2026-10-01T00:00:00.000').toISOString());
    });
  });

  describe('TSS / Registry Expiry Date Filtration & KPI Partitioning', () => {
    it('getCustomers with moduleType=tss strictly constrains expiry date to [startDate, endDate]', async () => {
      let capturedFilter: any = null;
      (Customer.find as any).mockImplementation((filter: any) => {
        capturedFilter = filter;
        return {
          populate: vi.fn().mockReturnThis(),
          sort: vi.fn().mockReturnThis(),
          skip: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          lean: vi.fn().mockResolvedValue([]),
        };
      });
      (Customer.countDocuments as any).mockResolvedValue(0);

      const req: any = {
        query: {
          moduleType: 'tss',
          startDate: '2026-10-16',
          endDate: '2026-10-16',
        },
        user: { _id: 'admin-id', role: 'admin' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getCustomers(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedFilter).toBeDefined();
      expect(capturedFilter.$and).toBeDefined();

      // Find the date filter clause
      const dateClause = capturedFilter.$and.find((c: any) => c.$or && c.$or.some((item: any) => item['tssDetails.endDate']));
      expect(dateClause).toBeDefined();

      // Check that all conditions in dateClause have $lte and don't match unbounded dates
      for (const cond of dateClause.$or) {
        if (cond['tssDetails.endDate']) {
          expect(cond['tssDetails.endDate'].$gte).toBeDefined();
          expect(cond['tssDetails.endDate'].$lte).toBeDefined();
        }
      }
    });

    it('getCustomerManagementInsights correctly partitions TSS active, expiring, and expired so active <= total', async () => {
      const mockDocs = [
        // 1. Expired before today (exp: 2026-10-10, filter: 2026-10-01 to 2026-10-31)
        {
          _id: 'c1',
          name: 'Cust 1',
          isActive: true,
          services: [{ type: 'tss', endDate: new Date('2026-10-10') }],
        },
        // 2. Active expiring in 5 days (exp: 2026-10-28)
        {
          _id: 'c2',
          name: 'Cust 2',
          isActive: true,
          services: [{ type: 'tss', endDate: new Date('2026-10-28') }],
        },
        // 3. Excluded: Expires in 2027 (outside filter range)
        {
          _id: 'c3',
          name: 'Cust 3',
          isActive: true,
          services: [{ type: 'tss', endDate: new Date('2027-06-30') }],
        },
      ];

      (Customer.find as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockDocs),
      });

      const req: any = {
        query: {
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        },
        user: { _id: 'admin-id', role: 'admin' },
      };
      let resData: any = null;
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation((d: any) => {
          resData = d;
        }),
      };

      await getCustomerManagementInsights(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const tssKpi = resData.data.tssDashboard.kpi;
      // Only c1 (expired) and c2 (active) are in range. c3 (2027) is excluded.
      expect(tssKpi.total).toBe(2);
      expect(tssKpi.active).toBeLessThanOrEqual(tssKpi.total);
      expect(tssKpi.expired).toBeLessThanOrEqual(tssKpi.total);
      expect(tssKpi.active + tssKpi.expired).toBe(tssKpi.total);
    });
  });
});
