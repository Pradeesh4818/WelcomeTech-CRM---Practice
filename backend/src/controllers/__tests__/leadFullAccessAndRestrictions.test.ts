import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { getLeads, updateLead, createStaffUser } from '../leadController';
import { Lead, LeadActivity } from '../../models/Lead';
import User from '../../models/User';

vi.mock('../../models/Lead', () => {
  return {
    Lead: {
      find: vi.fn(),
      findOne: vi.fn(),
      findById: vi.fn(),
      countDocuments: vi.fn(),
      create: vi.fn(),
    },
    LeadActivity: {
      create: vi.fn(),
      find: vi.fn(),
    },
    LeadFollowUp: {
      create: vi.fn(),
      find: vi.fn(),
      countDocuments: vi.fn(),
    },
    LeadNotification: {
      create: vi.fn(),
    },
    LeadStatusHistory: {
      create: vi.fn(),
    },
    LeadNote: {
      create: vi.fn(),
    },
    LEAD_PRIORITIES: ['low', 'medium', 'high', 'urgent'],
  };
});

vi.mock('../../models/User', () => {
  return {
    default: {
      find: vi.fn(),
      findOne: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
    },
  };
});

vi.mock('../../models/Task', () => {
  return {
    default: {
      find: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
  };
});

describe('Lead Access Control: Full System Access vs. Standard Role Restrictions', () => {
  const createMockChain = (result: any[]) => ({
    populate: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(LeadActivity.find).mockImplementation(() => createMockChain([]) as any);
  });

  const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  const adminOfficeUser = {
    _id: new mongoose.Types.ObjectId('6579c3f8e912345678900001'),
    name: 'Anusuya',
    email: 'anusuya@welcometech.qa',
    role: {
      _id: new mongoose.Types.ObjectId('6579c3f8e912345678900010'),
      name: 'Admin_office',
      hasFullAccess: true,
      permissions: ['*'],
    },
  };

  const salesUser = {
    _id: new mongoose.Types.ObjectId('6579c3f8e912345678900002'),
    name: 'John Sales',
    email: 'john@welcometech.qa',
    role: {
      _id: new mongoose.Types.ObjectId('6579c3f8e912345678900020'),
      name: 'Sales_Executive',
      hasFullAccess: false,
      permissions: ['leads', 'customers'],
    },
  };

  describe('1. Full System Access Role (e.g. Admin_office)', () => {
    it('allows viewing all leads without scoping filter to self', async () => {
      let appliedFilter: any = null;
      const leads = [
        { _id: 'lead1', name: 'Lead 1', assignedTo: 'user1', leadDate: new Date() },
        { _id: 'lead2', name: 'Lead 2', assignedTo: 'user2', leadDate: new Date() },
      ];

      (Lead.find as any).mockImplementation((filter: any) => {
        appliedFilter = filter;
        return createMockChain(leads) as any;
      });
      vi.mocked(Lead.countDocuments).mockResolvedValue(2);

      const req: any = {
        user: adminOfficeUser,
        query: { page: '1', limit: '10' },
      };
      const res = mockRes();

      await getLeads(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(appliedFilter).toBeDefined();
      expect(appliedFilter.isActive).toEqual({ $ne: false });
      // Crucial: Must NOT contain $or: [{ assignedTo }, { createdBy }]
      expect(appliedFilter.$or).toBeUndefined();
    });

    it('allows filtering by any assigned employee in leads list', async () => {
      let appliedFilter: any = null;
      const otherEmployeeId = '6579c3f8e912345678900099';

      (Lead.find as any).mockImplementation((filter: any) => {
        appliedFilter = filter;
        return createMockChain([]) as any;
      });
      vi.mocked(Lead.countDocuments).mockResolvedValue(0);

      const req: any = {
        user: adminOfficeUser,
        query: { assignedTo: otherEmployeeId },
      };
      const res = mockRes();

      await getLeads(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(appliedFilter.assignedTo).toBe(otherEmployeeId);
    });

    it('does not reject with 403 Access denied when updating lead assigned to another employee', async () => {
      const otherEmployeeId = new mongoose.Types.ObjectId('6579c3f8e912345678900099');
      const mockLead: any = {
        _id: new mongoose.Types.ObjectId('6579c3f8e912345678900500'),
        name: 'Target Company',
        assignedTo: otherEmployeeId,
        status: 'New',
        countryCode: 'QA',
        save: vi.fn().mockResolvedValue(true),
      };

      const findByIdMock: any = vi.fn().mockResolvedValue(mockLead);
      findByIdMock.populate = vi.fn().mockReturnValue({ populate: vi.fn().mockResolvedValue(mockLead) });
      vi.mocked(Lead.findById).mockImplementation(findByIdMock);

      const req: any = {
        user: adminOfficeUser,
        params: { id: String(mockLead._id) },
        body: { notes: 'Reviewed by admin office' },
      };
      const res = mockRes();

      await updateLead(req, res);

      expect(res.status).not.toHaveBeenCalledWith(403);
    });

    it('allows creating staff users from leads section', async () => {
      vi.mocked(User.create).mockResolvedValue({
        _id: 'newUser123',
        name: 'New Sales Rep',
        email: 'newsales@welcometech.qa',
        role: 'sales_executive',
      } as any);

      const req: any = {
        user: adminOfficeUser,
        body: { name: 'New Sales Rep', email: 'newsales@welcometech.qa', password: 'password123', role: 'sales_executive' },
      };
      const res = mockRes();

      await createStaffUser(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('2. Standard Non-Admin Role Restrictions Preserved', () => {
    it('strictly confines getLeads to leads assigned to or created by current user', async () => {
      let appliedFilter: any = null;
      const leads = [
        { _id: 'lead1', name: 'My Lead', assignedTo: salesUser._id, leadDate: new Date() },
      ];

      (Lead.find as any).mockImplementation((filter: any) => {
        appliedFilter = filter;
        return createMockChain(leads) as any;
      });
      vi.mocked(Lead.countDocuments).mockResolvedValue(1);

      const req: any = {
        user: salesUser,
        query: { page: '1', limit: '10' },
      };
      const res = mockRes();

      await getLeads(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(appliedFilter).toBeDefined();
      expect(appliedFilter.isActive).toEqual({ $ne: false });
      // Crucial: Non-admin MUST have $or scoping to self
      expect(appliedFilter.$or).toEqual([
        { assignedTo: salesUser._id },
        { createdBy: salesUser._id },
      ]);
    });

    it('ignores assignedTo query parameter from non-admin user trying to view other staff leads', async () => {
      let appliedFilter: any = null;
      const otherEmployeeId = '6579c3f8e912345678900099';

      (Lead.find as any).mockImplementation((filter: any) => {
        appliedFilter = filter;
        return createMockChain([]) as any;
      });
      vi.mocked(Lead.countDocuments).mockResolvedValue(0);

      const req: any = {
        user: salesUser,
        query: { assignedTo: otherEmployeeId },
      };
      const res = mockRes();

      await getLeads(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      // Non-admin cannot override assignedTo filter
      expect(appliedFilter.assignedTo).toBeUndefined();
      expect(appliedFilter.$or).toEqual([
        { assignedTo: salesUser._id },
        { createdBy: salesUser._id },
      ]);
    });

    it('denies (403 Access denied) updateLead when non-admin tries to update lead assigned to someone else', async () => {
      const otherEmployeeId = new mongoose.Types.ObjectId('6579c3f8e912345678900099');
      const mockLead: any = {
        _id: new mongoose.Types.ObjectId('6579c3f8e912345678900501'),
        name: 'Another Rep Lead',
        assignedTo: otherEmployeeId,
        status: 'New',
        save: vi.fn(),
      };

      vi.mocked(Lead.findById).mockResolvedValue(mockLead);

      const req: any = {
        user: salesUser,
        params: { id: String(mockLead._id) },
        body: { status: 'Contacted' },
      };
      const res = mockRes();

      await updateLead(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Access denied',
      }));
    });

    it('denies (403) createStaffUser when non-admin attempts to create staff', async () => {
      const req: any = {
        user: salesUser,
        body: { name: 'Unauthorized Staff', email: 'unauth@welcometech.qa', password: '123' },
      };
      const res = mockRes();

      await createStaffUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Only admin can create staff',
      }));
    });
  });
});
