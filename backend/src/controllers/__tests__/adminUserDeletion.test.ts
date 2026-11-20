import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { deleteEmployee } from '../employeeController';
import User from '../../models/User';
import Role from '../../models/Role';

vi.mock('../../models/User', () => {
  return {
    default: {
      findById: vi.fn(),
      findByIdAndDelete: vi.fn(),
      countDocuments: vi.fn(),
      find: vi.fn(),
    },
  };
});

vi.mock('../../models/Role', () => {
  return {
    default: {
      findById: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn(),
    },
  };
});

describe('Admin User Deletion Specifications & Safeguards (deleteEmployee)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  it('TC-ADMIN-DEL-01: Returns 404 when target user does not exist', async () => {
    vi.mocked(User.findById).mockResolvedValue(null);

    const req: any = {
      params: { id: '6579c3f8e912345678901234' },
      user: { _id: '6579c3f8e912345678909999', role: 'admin' },
    };
    const res = mockRes();

    await deleteEmployee(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Employee not found' })
    );
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('TC-ADMIN-DEL-02: Rejects deletion of the primary system administrator account (admin@welcometech.qa)', async () => {
    vi.mocked(User.findById).mockResolvedValue({
      _id: '6579c3f8e912345678900001',
      name: 'Welcome Tech Admin',
      email: 'admin@welcometech.qa',
      role: 'admin',
    } as any);

    const req: any = {
      params: { id: '6579c3f8e912345678900001' },
      user: { _id: '6579c3f8e912345678909999', role: 'admin' },
    };
    const res = mockRes();

    await deleteEmployee(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Cannot delete the primary system administrator account',
      })
    );
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('TC-ADMIN-DEL-03: Rejects deletion of primary admin with case-insensitivity or alternative domain (ADMIN@WELCOMTECH.QA)', async () => {
    vi.mocked(User.findById).mockResolvedValue({
      _id: '6579c3f8e912345678900001',
      name: 'Welcome Tech Admin',
      email: 'ADMIN@WELCOMTECH.QA',
      role: 'admin',
    } as any);

    const req: any = {
      params: { id: '6579c3f8e912345678900001' },
      user: { _id: '6579c3f8e912345678909999', role: 'admin' },
    };
    const res = mockRes();

    await deleteEmployee(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Cannot delete the primary system administrator account',
      })
    );
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('TC-ADMIN-DEL-04: Rejects deletion of an administrator when attempted by a non-admin role (403 Forbidden)', async () => {
    vi.mocked(User.findById).mockResolvedValue({
      _id: '6579c3f8e912345678900002',
      name: 'Secondary Admin',
      email: 'second.admin@welcometech.qa',
      role: 'admin',
    } as any);

    const req: any = {
      params: { id: '6579c3f8e912345678900002' },
      user: { _id: '6579c3f8e912345678908888', role: 'manager' }, // non-admin
    };
    const res = mockRes();

    await deleteEmployee(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Only an administrator can delete an administrator account',
      })
    );
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('TC-ADMIN-DEL-05: Rejects self-deletion when an admin tries to delete their own account', async () => {
    const adminId = '6579c3f8e912345678900002';
    vi.mocked(User.findById).mockResolvedValue({
      _id: adminId,
      name: 'Secondary Admin',
      email: 'second.admin@welcometech.qa',
      role: 'admin',
    } as any);

    const req: any = {
      params: { id: adminId },
      user: { _id: adminId, role: 'admin' }, // Same ID as target
    };
    const res = mockRes();

    await deleteEmployee(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'You cannot delete your own account',
      })
    );
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('TC-ADMIN-DEL-06: Rejects deletion if this is the last remaining administrator account in the system', async () => {
    const targetAdminId = '6579c3f8e912345678900002';
    vi.mocked(User.findById).mockResolvedValue({
      _id: targetAdminId,
      name: 'Secondary Admin',
      email: 'second.admin@welcometech.qa',
      role: 'admin',
    } as any);

    // Mock Role lookup for admin roles
    vi.mocked(Role.find).mockReturnValue({
      select: vi.fn().mockResolvedValue([{ _id: new mongoose.Types.ObjectId('6579c3f8e912345678900111') }]),
    } as any);

    // Only 1 admin in the system
    vi.mocked(User.countDocuments).mockResolvedValue(1);

    const req: any = {
      params: { id: targetAdminId },
      user: { _id: '6579c3f8e912345678909999', role: 'admin' },
    };
    const res = mockRes();

    await deleteEmployee(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Cannot delete the only remaining administrator account',
      })
    );
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('TC-ADMIN-DEL-07: Successfully deletes a secondary administrator account when multiple admins exist', async () => {
    const targetAdminId = '6579c3f8e912345678900002';
    vi.mocked(User.findById).mockResolvedValue({
      _id: targetAdminId,
      name: 'Secondary Admin',
      email: 'second.admin@welcometech.qa',
      role: 'admin',
      documents: [],
    } as any);

    vi.mocked(Role.find).mockReturnValue({
      select: vi.fn().mockResolvedValue([{ _id: new mongoose.Types.ObjectId('6579c3f8e912345678900111') }]),
    } as any);

    // 2 admins exist
    vi.mocked(User.countDocuments).mockResolvedValue(2);
    vi.mocked(User.findByIdAndDelete).mockResolvedValue({ _id: targetAdminId } as any);

    const req: any = {
      params: { id: targetAdminId },
      user: { _id: '6579c3f8e912345678900001', role: 'admin' }, // Logged in as primary admin
    };
    const res = mockRes();

    await deleteEmployee(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: 'Admin deleted' })
    );
    expect(User.findByIdAndDelete).toHaveBeenCalledWith(targetAdminId);
  });

  it('TC-ADMIN-DEL-08: Successfully resolves and deletes admin when role is stored as an ObjectId reference', async () => {
    const targetAdminId = '6579c3f8e912345678900003';
    const adminRoleId = new mongoose.Types.ObjectId('6579c3f8e912345678900777');

    vi.mocked(User.findById).mockResolvedValue({
      _id: targetAdminId,
      name: 'Custom Role Admin',
      email: 'custom.admin@welcometech.qa',
      role: adminRoleId, // stored as ObjectId
      documents: [],
    } as any);

    // When resolving role by ObjectId
    vi.mocked(Role.findById).mockResolvedValue({
      _id: adminRoleId,
      name: 'Admin',
    } as any);

    vi.mocked(Role.find).mockReturnValue({
      select: vi.fn().mockResolvedValue([{ _id: adminRoleId }]),
    } as any);

    vi.mocked(User.countDocuments).mockResolvedValue(3);
    vi.mocked(User.findByIdAndDelete).mockResolvedValue({ _id: targetAdminId } as any);

    const req: any = {
      params: { id: targetAdminId },
      user: { _id: '6579c3f8e912345678900001', role: 'admin' },
    };
    const res = mockRes();

    await deleteEmployee(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: 'Admin deleted' })
    );
    expect(User.findByIdAndDelete).toHaveBeenCalledWith(targetAdminId);
  });

  it('TC-ADMIN-DEL-09: Successfully deletes regular employees with message "Employee deleted"', async () => {
    const targetEmpId = '6579c3f8e912345678900005';

    vi.mocked(User.findById).mockResolvedValue({
      _id: targetEmpId,
      name: 'Software Engineer',
      email: 'engineer@welcometech.qa',
      role: 'engineer',
      documents: [],
    } as any);

    vi.mocked(User.findByIdAndDelete).mockResolvedValue({ _id: targetEmpId } as any);

    const req: any = {
      params: { id: targetEmpId },
      user: { _id: '6579c3f8e912345678900001', role: 'admin' },
    };
    const res = mockRes();

    await deleteEmployee(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: 'Employee deleted' })
    );
    expect(User.findByIdAndDelete).toHaveBeenCalledWith(targetEmpId);
  });
});
