import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import Task from '../../models/Task';
import { updateTask } from '../taskController';

vi.mock('../../models/Task', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../models/Task')>();
  const mockFindById = vi.fn();
  return {
    ...actual,
    default: {
      ...actual.default,
      findById: mockFindById,
    },
  };
});

describe('Task Completion Remarks Enforcement', () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const taskId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects completing a task if completion remarks are empty or missing', async () => {
    const mockTask: any = {
      _id: taskId,
      taskNo: 'TSK-0001',
      title: 'Support Issue',
      status: 'in_progress',
      isActive: true,
      assignedTo: new mongoose.Types.ObjectId(userId),
      createdBy: new mongoose.Types.ObjectId(userId),
      history: [],
      save: vi.fn(),
    };

    (Task.findById as any).mockResolvedValue(mockTask);

    const req: any = {
      params: { id: taskId },
      body: { status: 'done', comment: '   ' },
      user: { _id: userId, role: 'admin', name: 'Admin' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await updateTask(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/completion remarks are mandatory/i),
      })
    );
    expect(mockTask.save).not.toHaveBeenCalled();
  });

  it('successfully completes a task when non-empty completion remarks are provided', async () => {
    const mockTask: any = {
      _id: taskId,
      taskNo: 'TSK-0002',
      title: 'Support Issue',
      status: 'in_progress',
      isActive: true,
      assignedTo: new mongoose.Types.ObjectId(userId),
      createdBy: new mongoose.Types.ObjectId(userId),
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
      body: { status: 'done', comment: 'Fixed the database index issue and verified with client.' },
      user: { _id: userId, role: 'admin', name: 'Admin' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await updateTask(req, res);

    expect(mockTask.status).toBe('done');
    expect(mockTask.description).toBe('Fixed the database index issue and verified with client.');
    expect(mockTask.history.length).toBeGreaterThan(0);
    expect(mockTask.history[0].action).toBe('completed');
    expect(mockTask.history[0].comment).toBe('Fixed the database index issue and verified with client.');
    expect(mockTask.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });

  it('rejects marking task as not interested if remarks are empty', async () => {
    const mockTask: any = {
      _id: taskId,
      taskNo: 'TSK-0003',
      title: 'Sales Lead Task',
      status: 'todo',
      isActive: true,
      assignedTo: new mongoose.Types.ObjectId(userId),
      createdBy: new mongoose.Types.ObjectId(userId),
      history: [],
      save: vi.fn(),
    };

    (Task.findById as any).mockResolvedValue(mockTask);

    const req: any = {
      params: { id: taskId },
      body: { status: 'done', actionType: 'lost', comment: '   ' },
      user: { _id: userId, role: 'admin', name: 'Admin' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await updateTask(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/reason and remarks are mandatory/i),
      })
    );
    expect(mockTask.save).not.toHaveBeenCalled();
  });

  it('successfully marks task as not interested when reason and remarks are provided', async () => {
    const mockTask: any = {
      _id: taskId,
      taskNo: 'TSK-0004',
      title: 'Sales Lead Task',
      status: 'todo',
      isActive: true,
      assignedTo: new mongoose.Types.ObjectId(userId),
      createdBy: new mongoose.Types.ObjectId(userId),
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
      body: { status: 'done', actionType: 'lost', comment: 'Budget constraints: Client postponed procurement till next year.' },
      user: { _id: userId, role: 'admin', name: 'Admin' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await updateTask(req, res);

    expect(mockTask.status).toBe('done');
    expect(mockTask.history.length).toBeGreaterThan(0);
    expect(mockTask.history[0].action).toBe('lost');
    expect(mockTask.history[0].comment).toContain('Budget constraints');
    expect(mockTask.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
