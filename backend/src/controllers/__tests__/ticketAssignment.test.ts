import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTicket, getTickets } from '../crmController';
import { Ticket } from '../../models/index';
import Task from '../../models/Task';

vi.mock('../../models/index', () => {
  return {
    Ticket: {
      create: vi.fn(),
      find: vi.fn(),
      countDocuments: vi.fn(),
      aggregate: vi.fn(),
    },
    AMC: {},
    Payment: {},
    Proposal: {},
    ProposalTemplate: {},
    TicketFollowUp: {
      create: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ populate: vi.fn().mockReturnValue({ populate: vi.fn().mockResolvedValue([]) }) }) }),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    TicketActivity: {
      create: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ populate: vi.fn().mockResolvedValue([]) }) }),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
  };
});

vi.mock('../../models/Task', () => {
  return {
    default: {
      findOne: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  };
});

vi.mock('../../models/Customer', () => {
  return {
    default: {
      find: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue([]) }),
    },
  };
});

describe('Ticket Assignment - Any Role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves assignedTo engineer when created by a non-admin role (e.g. telecaller / manager / support)', async () => {
    const engineerId = '66b1234567890123456789aa';
    const creatorUserId = '66b9876543210987654321bb';

    const createdTicketMock = {
      _id: 'ticket-101',
      ticketNo: 'TCK-2026-0001',
      customer: 'cust-1',
      assignedTo: engineerId,
      subject: 'Tally Installation issue',
      category: 'Software',
      status: 'open',
      priority: 'high',
      createdBy: creatorUserId,
    };

    (Ticket.create as any).mockResolvedValue(createdTicketMock);
    (Task.findOne as any).mockResolvedValue(null);
    (Task.create as any).mockResolvedValue({});

    const req: any = {
      user: {
        _id: creatorUserId,
        name: 'Support Agent',
        role: { name: 'support' },
      },
      body: {
        customer: 'cust-1',
        assignedTo: engineerId,
        subject: 'Tally Installation issue',
        category: 'Software',
      },
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await createTicket(req, res);

    expect(Ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cust-1',
        assignedTo: engineerId, // MUST be the chosen engineer, NOT the creator!
        createdBy: creatorUserId,
      })
    );

    // Background task must also be assigned to the selected engineer
    expect(Task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedTo: engineerId,
        createdBy: creatorUserId,
      })
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: createdTicketMock,
      })
    );
  });

  it('allows non-admin to see tickets they created OR are assigned to', async () => {
    const currentUserId = 'user-agent-123';
    const mockQuery = {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        { _id: 't-1', subject: 'Assigned to me', assignedTo: { name: 'Self' } },
        { _id: 't-2', subject: 'Created by me for someone else', assignedTo: { name: 'Other Engineer' } },
      ]),
    };

    (Ticket.find as any).mockReturnValue(mockQuery);
    (Ticket.countDocuments as any).mockResolvedValue(2);
    (Ticket.aggregate as any).mockResolvedValue([{ total: 2, open: 2, critical: 0, resolved: 0 }]);

    const req: any = {
      user: {
        _id: currentUserId,
        name: 'Telecaller Agent',
        role: { name: 'telecaller' },
      },
      query: { page: '1', limit: '10' },
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await getTickets(req, res);

    // Must query with $or for both assignedTo and createdBy
    expect(Ticket.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: [
          {
            $or: [{ assignedTo: currentUserId }, { createdBy: currentUserId }],
          },
        ],
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
