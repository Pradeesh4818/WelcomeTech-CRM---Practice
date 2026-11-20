import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import Task from '../../models/Task';
import { Lead } from '../../models/Lead';
import { Proposal } from '../../models/index';
import { getTasks } from '../taskController';

vi.mock('../../models/Task', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../models/Task')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      find: vi.fn(),
      countDocuments: vi.fn().mockResolvedValue(0),
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    },
  };
});

vi.mock('../../models/Lead', () => {
  const mockLeadObj = {
    find: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  };
  return {
    default: mockLeadObj,
    Lead: mockLeadObj,
    LeadActivity: {
      find: vi.fn().mockReturnValue({ sort: vi.fn().mockResolvedValue([]) }),
      create: vi.fn().mockResolvedValue({}),
    },
    LeadFollowUp: {
      find: vi.fn().mockReturnValue({ sort: vi.fn().mockResolvedValue([]) }),
    },
    LeadNotification: {},
    LeadStatusHistory: {},
  };
});

vi.mock('../../models/Customer', () => ({
  default: {
    find: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('../../models/index', () => ({
  Proposal: {
    find: vi.fn(),
  },
  Ticket: {
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
  ProposalTemplate: {},
  AMC: {},
  Payment: {},
  TicketFollowUp: {},
  TicketActivity: {},
}));

vi.mock('../../utils/fcm', () => ({
  sendPushToUser: vi.fn(),
}));

describe('taskController - getTasks Proposal & Unsent Filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupTaskFindMock = (tasks: any[] = []) => {
    const chain: any = {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(tasks),
    };
    (Task.find as any).mockImplementation((filter?: any) => {
      // If internal sync query, return empty list
      if (filter && (filter.lead || filter.ticket)) {
        return Promise.resolve([]);
      }
      return chain;
    });
    (Task.countDocuments as any).mockResolvedValue(tasks.length);
    return chain;
  };

  it('TC-BACK-FILTER-01: proposalOnly=true searches proposal leads and queries proposal taskTypes, tags and titles', async () => {
    setupTaskFindMock([
      { _id: 't1', title: 'Prepare quotation for Client', taskType: 'proposal', status: 'todo' },
    ]);

    const leadId1 = new mongoose.Types.ObjectId();

    // Lead.find handler: supports both syncAssignedLeadTasks and proposalOnly leads lookup
    (Lead.find as any).mockImplementation((filter: any) => {
      if (filter && filter.assignedTo) {
        // syncAssignedLeadTasks call
        return { select: vi.fn().mockResolvedValue([]) };
      }
      // proposalOnly leads query
      return {
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([{ _id: leadId1 }]),
        }),
      };
    });

    const req: any = {
      user: { _id: new mongoose.Types.ObjectId(), role: 'admin' },
      query: { proposalOnly: 'true', limit: 'all' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await getTasks(req, res);

    expect(Task.find).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        $or: expect.arrayContaining([
          { taskType: 'proposal' },
          { status: 'proposal' },
          { tags: { $in: ['proposal', 'Proposal', 'quotation', 'Quotation'] } },
          { title: { $regex: 'proposal|quotation', $options: 'i' } },
          { description: { $regex: 'proposal|quotation', $options: 'i' } },
          { 'history.action': 'proposal' },
        ]),
      })
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ _id: 't1' }),
        ]),
      })
    );
  });

  it('TC-BACK-FILTER-02 & 03: notSentOnly=true excludes done/cancelled tasks and excludes tasks with sent proposals', async () => {
    setupTaskFindMock([]);

    const sentTaskId = new mongoose.Types.ObjectId();
    const mockProposalChain = {
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ task: sentTaskId }]),
      }),
    };
    (Proposal.find as any).mockReturnValue(mockProposalChain);

    (Lead.find as any).mockImplementation((filter: any) => {
      if (filter && filter.assignedTo) {
        return { select: vi.fn().mockResolvedValue([]) };
      }
      return {
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      };
    });

    const req: any = {
      user: { _id: new mongoose.Types.ObjectId(), role: 'admin' },
      query: { notSentOnly: 'true', limit: 'all' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await getTasks(req, res);

    expect(Proposal.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: [
          { status: { $in: ['sent', 'accepted'] } },
          { sentAt: { $exists: true, $ne: null } },
        ],
      })
    );

    expect(Task.find).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        $and: expect.arrayContaining([
          { status: { $nin: ['done', 'completed', 'cancelled'] } },
          expect.objectContaining({
            'history.comment': {
              $not: /created & sent|sent to client|sent to customer|proposal .* sent to/i,
            },
          }),
          { _id: { $nin: [sentTaskId] } },
        ]),
      })
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('TC-BACK-FILTER-04: notSentOnly=true excludes tasks whose linked leads are in terminal Won/Lost/Converted stages', async () => {
    setupTaskFindMock([]);

    const mockProposalChain = {
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    };
    (Proposal.find as any).mockReturnValue(mockProposalChain);

    const sentLeadId = new mongoose.Types.ObjectId();
    (Lead.find as any).mockImplementation((filter: any) => {
      if (filter && filter.assignedTo) {
        return { select: vi.fn().mockResolvedValue([]) };
      }
      return {
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([{ _id: sentLeadId }]),
        }),
      };
    });

    const req: any = {
      user: { _id: new mongoose.Types.ObjectId(), role: 'admin' },
      query: { notSentOnly: 'true', limit: 'all' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await getTasks(req, res);

    expect(Lead.find).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        $or: [
          { proposalSent: true },
          { status: { $in: ['Won', 'Converted', 'won', 'converted', 'Lost', 'lost', 'Not Interested', 'Junk', 'junk'] } },
        ],
      })
    );

    expect(Task.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: expect.arrayContaining([
          expect.objectContaining({
            'history.comment': {
              $not: /created & sent|sent to client|sent to customer|proposal .* sent to/i,
            },
          }),
          expect.objectContaining({
            $or: [
              { lead: { $exists: false } },
              { lead: null },
              { lead: { $nin: [sentLeadId] } },
            ],
          }),
        ]),
      })
    );
  });

  it('TC-BACK-FILTER-04B: does not exclude leads in Quotation Sent stage so assigned proposal tasks remain visible', async () => {
    setupTaskFindMock([]);

    (Proposal.find as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });

    (Lead.find as any).mockImplementation((filter: any) => {
      if (filter && filter.assignedTo) {
        return { select: vi.fn().mockResolvedValue([]) };
      }
      // For sentLeads query, leads in 'Quotation Sent' stage are not matching terminal statuses
      return {
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      };
    });

    const req: any = {
      user: { _id: new mongoose.Types.ObjectId(), role: 'admin' },
      query: { notSentOnly: 'true', limit: 'all' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await getTasks(req, res);

    expect(Lead.find).toHaveBeenCalledWith(
      expect.not.objectContaining({
        $or: expect.arrayContaining([
          { status: { $in: expect.arrayContaining(['Quotation Sent']) } },
        ]),
      })
    );
  });

  it('TC-BACK-FILTER-05: combines proposalOnly=true and notSentOnly=true cleanly in $and clauses', async () => {
    setupTaskFindMock([
      { _id: 't_pending', title: 'Prepare quotation', taskType: 'proposal', status: 'todo' },
    ]);

    const leadId1 = new mongoose.Types.ObjectId();
    const sentTaskId = new mongoose.Types.ObjectId();
    const closedLeadId = new mongoose.Types.ObjectId();

    (Lead.find as any).mockImplementation((filter: any) => {
      if (filter && filter.assignedTo) {
        return { select: vi.fn().mockResolvedValue([]) };
      }
      if (filter && filter.$or) {
        // proposal leads
        return {
          select: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([{ _id: leadId1 }]),
          }),
        };
      }
      // closed leads
      return {
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([{ _id: closedLeadId }]),
        }),
      };
    });

    (Proposal.find as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ task: sentTaskId }]),
      }),
    });

    const req: any = {
      user: { _id: new mongoose.Types.ObjectId(), role: 'admin' },
      query: { proposalOnly: 'true', notSentOnly: 'true', limit: 'all' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await getTasks(req, res);

    expect(Task.find).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        $and: expect.arrayContaining([
          expect.objectContaining({
            $or: expect.arrayContaining([
              { taskType: 'proposal' },
              { status: 'proposal' },
              { title: { $regex: 'proposal|quotation', $options: 'i' } },
            ]),
          }),
          { status: { $nin: ['done', 'completed', 'cancelled'] } },
          { _id: { $nin: [sentTaskId] } },
        ]),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
