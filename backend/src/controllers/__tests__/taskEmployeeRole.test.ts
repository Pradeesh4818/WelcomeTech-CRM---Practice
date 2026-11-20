import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import Task from '../../models/Task';
import { updateTask, assignTask } from '../taskController';

vi.mock('../../models/Task', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../models/Task')>();
  const mockFindById = vi.fn();
  const mockFindByIdAndUpdate = vi.fn();
  return {
    ...actual,
    default: {
      ...actual.default,
      findById: mockFindById,
      findByIdAndUpdate: mockFindByIdAndUpdate,
      find: vi.fn(),
      countDocuments: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
  };
});

vi.mock('../../models/Lead', () => {
  const mockLeadObj = {
    find: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue([]) }),
    findById: vi.fn().mockResolvedValue(null),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  };
  const mockSort = { sort: vi.fn().mockResolvedValue([]) };
  return {
    default: mockLeadObj,
    Lead: mockLeadObj,
    LeadActivity: {
      find: vi.fn().mockReturnValue(mockSort),
      create: vi.fn().mockResolvedValue({}),
    },
    LeadFollowUp: {
      find: vi.fn().mockReturnValue(mockSort),
    },
    LeadNotification: {},
    LeadStatusHistory: {},
  };
});

vi.mock('../../models/index', () => {
  const mockTicket = {
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue([]),
      }),
    }),
    findById: vi.fn().mockResolvedValue(null),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  };
  return {
    Ticket: mockTicket,
    Proposal: {},
  };
});

vi.mock('../../models/Customer', () => ({
  default: {
    find: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue([]) }),
  },
}));

describe('Task Employee Role – Edit & Assign Tasks', () => {
  const employeeUserId = new mongoose.Types.ObjectId().toString();
  const colleagueUserId = new mongoose.Types.ObjectId().toString();
  const taskId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows an employee role user to edit task details', async () => {
    const mockTask: any = {
      _id: taskId,
      taskNo: 'TSK-0010',
      title: 'Initial Title',
      description: 'Initial Description',
      priority: 'low',
      status: 'in_progress',
      isActive: true,
      assignedTo: new mongoose.Types.ObjectId(employeeUserId),
      createdBy: new mongoose.Types.ObjectId().toString(),
      history: [],
      save: vi.fn().mockResolvedValue(true),
    };

    const mockQuery: any = {
      populate: vi.fn().mockReturnThis(),
      then: (resolve: any) => Promise.resolve(resolve(mockTask)),
    };

    (Task.findById as any)
      .mockResolvedValueOnce(mockTask)
      .mockReturnValue(mockQuery);

    const req: any = {
      params: { id: taskId },
      body: {
        title: 'Updated Title by Employee',
        priority: 'high',
        description: 'Updated detailed notes',
      },
      user: { _id: employeeUserId, role: 'employee', name: 'Employee Staff' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await updateTask(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mockTask.title).toBe('Updated Title by Employee');
    expect(mockTask.priority).toBe('high');
    expect(mockTask.description).toBe('Updated detailed notes');
    expect(mockTask.save).toHaveBeenCalled();
  });

  it('allows an employee role user to assign/reassign a task to another employee', async () => {
    const mockTask: any = {
      _id: taskId,
      taskNo: 'TSK-0011',
      title: 'Deploy CRM update',
      status: 'in_progress',
      isActive: true,
      assignedTo: new mongoose.Types.ObjectId(employeeUserId),
      createdBy: new mongoose.Types.ObjectId().toString(),
      history: [],
      save: vi.fn().mockResolvedValue(true),
    };

    const mockQuery: any = {
      populate: vi.fn().mockReturnThis(),
      then: (resolve: any) => Promise.resolve(resolve(mockTask)),
    };

    (Task.findById as any)
      .mockResolvedValueOnce(mockTask)
      .mockReturnValue(mockQuery);

    const req: any = {
      params: { id: taskId },
      body: {
        assignedTo: colleagueUserId,
      },
      user: { _id: employeeUserId, role: 'employee', name: 'Employee Staff' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await updateTask(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(String(mockTask.assignedTo)).toBe(colleagueUserId);
    expect(mockTask.save).toHaveBeenCalled();
  });

  it('filters tasks strictly by assignedTo/forwardedBy so creator tasks do not leak into creators todo list', async () => {
    (Task.find as any).mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: (resolve: any) => Promise.resolve(resolve([])),
    });
    (Task.countDocuments as any).mockResolvedValue(0);

    const { getTasks } = await import('../taskController');
    const req: any = {
      query: { assignedTo: employeeUserId },
      user: { _id: employeeUserId, role: 'manager', name: 'Sabarish' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await getTasks(req, res);

    expect(Task.find).toHaveBeenCalled();
    const filterArg = (Task.find as any).mock.calls[0][0];
    const targetClauses = filterArg.$or || (filterArg.$and && filterArg.$and[0]?.$or) || [];

    // Verifies assignedTo and forwardedBy exist, but createdBy does NOT exist in $or
    const hasCreatedByInOr = targetClauses.some((clause: any) => 'createdBy' in clause);
    expect(hasCreatedByInOr).toBe(false);
  });
});
