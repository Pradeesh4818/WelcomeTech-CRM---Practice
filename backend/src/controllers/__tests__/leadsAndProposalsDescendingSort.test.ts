import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { getLeads } from '../leadController';
import { getProposals } from '../crmController';
import { Lead, LeadActivity } from '../../models/Lead';
import { Proposal } from '../../models/index';
import Task from '../../models/Task';

// Mock dependencies for Lead
vi.mock('../../models/Lead', () => ({
  Lead: {
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
  LeadActivity: {
    find: vi.fn(),
  },
  LeadFollowUp: {
    exists: vi.fn(),
  },
}));

vi.mock('../../models/User', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('../../models/Task', () => ({
  default: {
    find: vi.fn(),
  },
}));

// Mock Proposal from models/index
vi.mock('../../models/index', () => ({
  Proposal: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
  },
  ProposalTemplate: {
    findById: vi.fn(),
    findOne: vi.fn(),
  },
  AMC: {},
  Ticket: {},
  Payment: {},
  TicketFollowUp: {},
  TicketActivity: {},
}));

vi.mock('../../models/Settings', () => ({
  Settings: {
    findOne: vi.fn(),
  },
}));

vi.mock('../../models/Customer', () => ({
  default: {
    findOne: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('../../utils/mailer', () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-mock' }),
}));

vi.mock('../../utils/htmlPdfGenerator', () => ({
  generateUnifiedProposalPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
  cleanWordArtifacts: vi.fn((s) => s),
  normalizeColonTableToTabular: vi.fn((s) => s),
}));

vi.mock('../../utils/proposalSequence', () => ({
  getAndIncrementNextProposalNo: vi.fn().mockResolvedValue('PROP-0099'),
  peekNextProposalNo: vi.fn().mockResolvedValue('PROP-0099'),
  syncProposalNoSequence: vi.fn().mockResolvedValue(undefined),
  buildProposalNumber: vi.fn((no) => no),
  stripDateSuffix: vi.fn((no) => no),
}));

describe('Descending Sort Functionality for Leads and Customer Proposals Pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockLeadChain = (result: any[]) => {
    const chain: any = {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(result),
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  };

  const createMockProposalChain = (result: any[]) => {
    const chain: any = {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(result),
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  };

  const createMockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  describe('1. Leads Page: Descending Sort (getLeads)', () => {
    const adminUser = {
      _id: new mongoose.Types.ObjectId('6579c3f8e912345678900001'),
      name: 'Admin User',
      email: 'admin@welcometech.com',
      role: 'Super Admin',
    };

    it('TC-SORT-LEADS-01: Applies descending order {_id: -1} by default (newest leads first)', async () => {
      let capturedSort: any = null;
      const mockLeads = [
        { _id: '6579c3f8e912345678900051', leadId: 'LEAD-00051', name: 'Newest Lead Corp' },
        { _id: '6579c3f8e912345678900050', leadId: 'LEAD-00050', name: 'Second Newest Lead' },
      ];

      (Lead.find as any).mockImplementation(() => {
        const chain = createMockLeadChain(mockLeads);
        chain.sort = vi.fn().mockImplementation((sortObj: any) => {
          capturedSort = sortObj;
          return chain;
        });
        return chain;
      });
      (Lead.countDocuments as any).mockResolvedValue(mockLeads.length);
      (LeadActivity.find as any).mockImplementation(() => createMockLeadChain([]));

      const req: any = {
        user: adminUser,
        query: { page: '1', limit: '10' },
      };
      const res = createMockRes();

      await getLeads(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedSort).toEqual({ _id: -1 });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockLeads,
          total: 2,
        })
      );
    });

    it('TC-SORT-LEADS-02: Allows ascending order {_id: 1} when sortOrder=asc is explicitly requested', async () => {
      let capturedSort: any = null;

      (Lead.find as any).mockImplementation(() => {
        const chain = createMockLeadChain([]);
        chain.sort = vi.fn().mockImplementation((sortObj: any) => {
          capturedSort = sortObj;
          return chain;
        });
        return chain;
      });
      (Lead.countDocuments as any).mockResolvedValue(0);
      (LeadActivity.find as any).mockImplementation(() => createMockLeadChain([]));

      const req: any = {
        user: adminUser,
        query: { page: '1', limit: '10', sortOrder: 'asc' },
      };
      const res = createMockRes();

      await getLeads(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedSort).toEqual({ _id: 1 });
    });
  });

  describe('2. Customer Proposals Page: Descending Sort (getProposals)', () => {
    const adminUser = {
      _id: new mongoose.Types.ObjectId('6579c3f8e912345678900001'),
      name: 'Admin User',
      email: 'admin@welcometech.com',
      role: 'Super Admin',
    };

    it('TC-SORT-PROP-01: Applies descending order {_id: -1} by default in standard find query (newest proposals first)', async () => {
      let capturedSort: any = null;
      const mockProposals = [
        {
          _id: '6579c3f8e912345678900088',
          proposalNo: 'IT/QT/8108/09-11-2026',
          title: 'Latest Quotation',
          status: 'sent',
        },
        {
          _id: '6579c3f8e912345678900087',
          proposalNo: 'IT/QT/8107/02-11-2026',
          title: 'Previous Quotation',
          status: 'sent',
        },
      ];

      (Proposal.find as any).mockImplementation(() => {
        const chain = createMockProposalChain(mockProposals);
        chain.sort = vi.fn().mockImplementation((sortObj: any) => {
          capturedSort = sortObj;
          return chain;
        });
        return chain;
      });
      (Proposal.countDocuments as any).mockResolvedValue(mockProposals.length);
      (Task.find as any).mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        then: (resolve: any) => Promise.resolve([]).then(resolve),
      });

      const req: any = {
        user: adminUser,
        query: { page: '1', limit: '10' },
      };
      const res = createMockRes();

      await getProposals(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedSort).toEqual({ _id: -1 });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockProposals,
          total: 2,
        })
      );
    });

    it('TC-SORT-PROP-02: Applies descending order {$sort: {_id: -1}} in search aggregation pipeline by default', async () => {
      let capturedPipeline: any[] = [];
      const mockAggregateProposals = [
        {
          _id: '6579c3f8e912345678900088',
          proposalNo: 'IT/QT/8108/09-11-2026',
          title: 'Service Quotation',
        },
      ];

      (Proposal.aggregate as any).mockImplementation((pipeline: any[]) => {
        capturedPipeline = pipeline;
        // Count stage check
        if (pipeline.some((stage) => stage.$count)) {
          return Promise.resolve([{ total: 1 }]);
        }
        return Promise.resolve(mockAggregateProposals);
      });
      (Task.find as any).mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        then: (resolve: any) => Promise.resolve([]).then(resolve),
      });

      const req: any = {
        user: adminUser,
        query: { search: 'Service Quotation', page: '1', limit: '10' },
      };
      const res = createMockRes();

      await getProposals(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      // Verify $sort stage in the aggregation pipeline
      const sortStage = capturedPipeline.find((stage) => stage.$sort);
      expect(sortStage).toBeDefined();
      expect(sortStage.$sort).toEqual({ _id: -1 });
    });

    it('TC-SORT-PROP-03: Allows ascending order {_id: 1} in find query when sortOrder=asc is specified', async () => {
      let capturedSort: any = null;

      (Proposal.find as any).mockImplementation(() => {
        const chain = createMockProposalChain([]);
        chain.sort = vi.fn().mockImplementation((sortObj: any) => {
          capturedSort = sortObj;
          return chain;
        });
        return chain;
      });
      (Proposal.countDocuments as any).mockResolvedValue(0);

      const req: any = {
        user: adminUser,
        query: { sortOrder: 'asc' },
      };
      const res = createMockRes();

      await getProposals(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(capturedSort).toEqual({ _id: 1 });
    });

    it('TC-SORT-PROP-04: Allows ascending order {$sort: {_id: 1}} in search aggregation pipeline when sortOrder=asc is specified', async () => {
      let capturedPipeline: any[] = [];

      (Proposal.aggregate as any).mockImplementation((pipeline: any[]) => {
        capturedPipeline = pipeline;
        if (pipeline.some((stage) => stage.$count)) {
          return Promise.resolve([{ total: 0 }]);
        }
        return Promise.resolve([]);
      });

      const req: any = {
        user: adminUser,
        query: { search: 'Tally', sortOrder: 'asc' },
      };
      const res = createMockRes();

      await getProposals(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const sortStage = capturedPipeline.find((stage) => stage.$sort);
      expect(sortStage).toBeDefined();
      expect(sortStage.$sort).toEqual({ _id: 1 });
    });
  });
});
