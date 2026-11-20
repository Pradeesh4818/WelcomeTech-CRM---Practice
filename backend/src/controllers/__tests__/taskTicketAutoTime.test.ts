import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import Task from '../../models/Task';
import { Ticket } from '../../models/index';
import { createTask, getTasks } from '../taskController';
import { createTicket } from '../crmController';

vi.mock('../../models/Task', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../models/Task')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      create: vi.fn(),
      find: vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: (resolve: any) => Promise.resolve(resolve([])),
      }),
      findOne: vi.fn(),
      findById: vi.fn(),
      countDocuments: vi.fn().mockResolvedValue(0),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
  };
});

vi.mock('../../models/Lead', () => {
  const mockLeadObj = {
    find: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue([]) }),
    findById: vi.fn().mockResolvedValue(null),
  };
  const mockSort = { sort: vi.fn().mockResolvedValue([]) };
  return {
    default: mockLeadObj,
    Lead: mockLeadObj,
    LeadActivity: {
      find: vi.fn().mockReturnValue(mockSort),
    },
    LeadFollowUp: {
      find: vi.fn().mockReturnValue(mockSort),
    },
  };
});

vi.mock('../../models/index', () => {
  const mockTicket = {
    create: vi.fn(),
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue([]),
      }),
    }),
    findOne: vi.fn(),
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
  };
  return {
    Ticket: mockTicket,
    AMC: {},
    Payment: {},
    Customer: {},
  };
});

vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ name: 'Assigned User' }) }),
  },
}));

vi.mock('../../models/Customer', () => ({
  default: {
    findById: vi.fn().mockResolvedValue({ companyName: 'Acme Corp' }),
  },
}));

describe('Task, Lead & Ticket Automatic Creation Time & Filtering Backend', () => {
  const assigneeId = new mongoose.Types.ObjectId().toString();
  const creatorId = new mongoose.Types.ObjectId().toString();
  const customerId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    vi.clearAllMocks();
    const createMockQuery = (result: any = []) => {
      const q: any = Object.assign([...result], {
        populate: vi.fn().mockImplementation(() => createMockQuery(result)),
        sort: vi.fn().mockImplementation(() => createMockQuery(result)),
        skip: vi.fn().mockImplementation(() => createMockQuery(result)),
        limit: vi.fn().mockImplementation(() => createMockQuery(result)),
        lean: vi.fn().mockImplementation(() => Promise.resolve(result)),
        select: vi.fn().mockImplementation(() => createMockQuery(result)),
        then: (resolve: any) => Promise.resolve(resolve(result)),
      });
      return q;
    };
    (Task.find as any).mockImplementation(() => createMockQuery([]));
    (Task.countDocuments as any).mockResolvedValue(0);
  });

  it('createTask automatically captures current time if taskDate is omitted', async () => {
    (Task.create as any).mockResolvedValue({ _id: 'task-1' });

    const req: any = {
      user: { _id: creatorId, name: 'Admin', role: { name: 'admin' } },
      body: {
        title: 'New Automated Task',
        assignedTo: assigneeId,
        priority: 'high',
      },
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await createTask(req, res);

    expect(Task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New Automated Task',
        assignedTo: assigneeId,
        taskDate: expect.any(Date),
      })
    );

    const createdArg = (Task.create as any).mock.calls[0][0];
    const createdDate = new Date(createdArg.taskDate);
    const now = new Date();
    expect(createdDate.getFullYear()).toBe(now.getFullYear());
    expect(createdDate.getDate()).toBe(now.getDate());
  });

  it('createTicket automatically captures current time on creation without manual date/time', async () => {
    (Ticket.create as any).mockResolvedValue({ _id: 'ticket-1' });
    (Task.findOne as any).mockResolvedValue(null);
    (Task.create as any).mockResolvedValue({});

    const req: any = {
      user: { _id: creatorId, name: 'Agent', role: { name: 'support' } },
      body: {
        customer: customerId,
        assignedTo: assigneeId,
        subject: 'Printer Network Error',
        category: 'Hardware',
      },
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await createTicket(req, res);

    expect(Ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: customerId,
        assignedTo: assigneeId,
        ticketRaisedDate: expect.any(Date),
      })
    );

    const ticketArg = (Ticket.create as any).mock.calls[0][0];
    const raisedDate = new Date(ticketArg.ticketRaisedDate);
    const now = new Date();
    expect(raisedDate.getFullYear()).toBe(now.getFullYear());
    expect(raisedDate.getDate()).toBe(now.getDate());
  });

  it('getTasks filters by dateFilter and enforces admin vs employee scoping', async () => {
    const adminReq: any = {
      user: { _id: creatorId, name: 'Admin', role: { name: 'admin' } },
      query: {
        dateFilter: 'today',
        assignedTo: assigneeId,
        page: '1',
        limit: '10',
      },
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockImplementation((data) => {
        if (data && !data.success) console.error('getTasks error:', data);
      }),
    };

    await getTasks(adminReq, res);

    expect(Task.find).toHaveBeenCalled();
    const calls = (Task.find as any).mock.calls;
    const queryArg = calls[calls.length - 1][0];
    expect(queryArg.isActive).toBe(true);
    expect(queryArg.$and).toBeDefined();
    // Verify assignedTo filter was applied for Admin
    expect(JSON.stringify(queryArg.$and)).toContain(assigneeId);
  });

  it('getTasks for non-admin strictly locks scope to current user', async () => {
    const employeeId = new mongoose.Types.ObjectId().toString();
    const employeeReq: any = {
      user: { _id: employeeId, name: 'Staff Employee', role: { name: 'employee' } },
      query: {
        dateFilter: 'this_week',
        assignedTo: assigneeId, // attempt to filter other employee
        page: '1',
        limit: '10',
      },
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await getTasks(employeeReq, res);

    expect(Task.find).toHaveBeenCalled();
    const calls = (Task.find as any).mock.calls;
    const queryArg = calls[calls.length - 1][0];
    expect(queryArg.isActive).toBe(true);
    expect(queryArg.$and).toBeDefined();
    // Verify employee scope is locked to their own ID and ignores requested assigneeId
    expect(JSON.stringify(queryArg.$and)).toContain(employeeId);
    expect(JSON.stringify(queryArg.$and)).not.toContain(assigneeId);
  });
});
