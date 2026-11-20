import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRole, updateRole } from '../roleController';
import Role from '../../models/Role';
import { 
  getRolePermissions, 
  isAdminUser, 
  hasPermission, 
  requireRole, 
  checkPermission 
} from '../../middleware/auth';

vi.mock('../../models/Role', () => {
  return {
    default: {
      create: vi.fn(),
      findById: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn(),
      countDocuments: vi.fn(),
    },
  };
});

describe('Role Full Access Toggle (Backend Specifications)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  describe('TC-ROLE-FULL-01: Role Creation with Full Access Toggle', () => {
    it('creates role with hasFullAccess: true and sets permissions to ["*"] when permissions are empty', async () => {
      const mockCreatedRole = {
        _id: '6579c3f8e912345678900010',
        name: 'Managing Director',
        description: 'Full corporate authority',
        hasFullAccess: true,
        permissions: ['*'],
        isActive: true,
      };

      vi.mocked(Role.create).mockResolvedValue(mockCreatedRole as any);

      const req: any = {
        body: {
          name: 'Managing Director',
          description: 'Full corporate authority',
          hasFullAccess: true,
          permissions: [],
        },
      };
      const res = mockRes();

      await createRole(req, res);

      expect(Role.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Managing Director',
          hasFullAccess: true,
          permissions: ['*'],
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockCreatedRole });
    });

    it('creates normal role with hasFullAccess: false and preserves granular permissions', async () => {
      const mockCreatedRole = {
        _id: '6579c3f8e912345678900011',
        name: 'Accountant',
        description: 'Finance access only',
        hasFullAccess: false,
        permissions: ['payments.records', 'invoices', 'outstanding'],
        isActive: true,
      };

      vi.mocked(Role.create).mockResolvedValue(mockCreatedRole as any);

      const req: any = {
        body: {
          name: 'Accountant',
          description: 'Finance access only',
          hasFullAccess: false,
          permissions: ['payments.records', 'invoices', 'outstanding'],
        },
      };
      const res = mockRes();

      await createRole(req, res);

      expect(Role.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Accountant',
          hasFullAccess: false,
          permissions: ['payments.records', 'invoices', 'outstanding'],
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('TC-ROLE-FULL-02: Role Updating with Full Access Toggle', () => {
    it('updates existing role to toggle Full Access ON and persists hasFullAccess: true with ["*"]', async () => {
      const existingRoleDoc: any = {
        _id: '6579c3f8e912345678900012',
        name: 'Support Head',
        description: 'Initial support head',
        permissions: ['tickets.list', 'tickets.add'],
        hasFullAccess: false,
        isSystem: false,
        isActive: true,
        save: vi.fn().mockResolvedValue(true),
      };

      vi.mocked(Role.findById).mockResolvedValue(existingRoleDoc);

      const req: any = {
        params: { id: '6579c3f8e912345678900012' },
        body: {
          name: 'Support Head',
          hasFullAccess: true,
          permissions: ['*'],
        },
      };
      const res = mockRes();

      await updateRole(req, res);

      expect(existingRoleDoc.hasFullAccess).toBe(true);
      expect(existingRoleDoc.permissions).toEqual(['*']);
      expect(existingRoleDoc.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('updates existing role to toggle Full Access OFF and reverts to granular permissions', async () => {
      const existingRoleDoc: any = {
        _id: '6579c3f8e912345678900012',
        name: 'Support Head',
        hasFullAccess: true,
        permissions: ['*'],
        isSystem: false,
        isActive: true,
        save: vi.fn().mockResolvedValue(true),
      };

      vi.mocked(Role.findById).mockResolvedValue(existingRoleDoc);

      const req: any = {
        params: { id: '6579c3f8e912345678900012' },
        body: {
          name: 'Support Head',
          hasFullAccess: false,
          permissions: ['tickets.list', 'tickets.add', 'ticketCategories'],
        },
      };
      const res = mockRes();

      await updateRole(req, res);

      expect(existingRoleDoc.hasFullAccess).toBe(false);
      expect(existingRoleDoc.permissions).toEqual(['tickets.list', 'tickets.add', 'ticketCategories']);
      expect(existingRoleDoc.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('TC-ROLE-FULL-03: getRolePermissions Permission Resolution', () => {
    it('returns ["*"] wildcard when role has hasFullAccess: true', () => {
      const roleObj = {
        name: 'custom_executive',
        hasFullAccess: true,
        permissions: ['dashboard'],
        isActive: true,
      };

      const perms = getRolePermissions(roleObj);
      expect(perms).toEqual(['*']);
    });

    it('returns granular permissions when role has hasFullAccess: false', () => {
      const roleObj = {
        name: 'custom_clerk',
        hasFullAccess: false,
        permissions: ['customers.list', 'tasks.list'],
        isActive: true,
      };

      const perms = getRolePermissions(roleObj);
      expect(perms).toEqual(['customers.list', 'tasks.list']);
    });
  });

  describe('TC-ROLE-FULL-04: isAdminUser & hasPermission Evaluation', () => {
    it('isAdminUser returns true for custom role with hasFullAccess: true', () => {
      const userWithFullAccessRole: any = {
        role: {
          name: 'Chief Officer',
          hasFullAccess: true,
        },
      };

      expect(isAdminUser(userWithFullAccessRole)).toBe(true);
    });

    it('isAdminUser returns false for custom role with hasFullAccess: false', () => {
      const userNormalRole: any = {
        role: {
          name: 'Supervisor',
          hasFullAccess: false,
        },
      };

      expect(isAdminUser(userNormalRole)).toBe(false);
    });

    it('hasPermission returns true for ANY module when role has hasFullAccess: true', () => {
      const user: any = {
        role: {
          name: 'Enterprise Lead',
          hasFullAccess: true,
          permissions: ['*'],
        },
      };

      expect(hasPermission(user, 'settings.general')).toBe(true);
      expect(hasPermission(user, 'employees.list')).toBe(true);
      expect(hasPermission(user, 'payments.records')).toBe(true);
      expect(hasPermission(user, 'roles')).toBe(true);
    });

    it('hasPermission respects granular permissions when hasFullAccess is false', () => {
      const user: any = {
        role: {
          name: 'Lead Clerk',
          hasFullAccess: false,
          permissions: ['leads.list', 'tasks.list'],
          isActive: true,
        },
      };

      expect(hasPermission(user, 'leads.list')).toBe(true);
      expect(hasPermission(user, 'tasks.list')).toBe(true);
      expect(hasPermission(user, 'settings.general')).toBe(false);
      expect(hasPermission(user, 'adminUsers')).toBe(false);
    });
  });

  describe('TC-ROLE-FULL-05: Middleware Execution (requireRole & checkPermission)', () => {
    it('requireRole grants access to role with hasFullAccess: true even if role name not in list', () => {
      const req: any = {
        user: {
          _id: '6579c3f8e912345678900020',
          role: {
            name: 'Special Director',
            hasFullAccess: true,
          },
        },
      };
      const res = mockRes();
      const next = vi.fn();

      const middleware = requireRole('admin', 'manager');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('requireRole denies access when hasFullAccess: false and role name is not in list', () => {
      const req: any = {
        user: {
          _id: '6579c3f8e912345678900021',
          role: {
            name: 'Junior Associate',
            hasFullAccess: false,
          },
        },
      };
      const res = mockRes();
      const next = vi.fn();

      const middleware = requireRole('admin', 'manager');
      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('checkPermission grants access for any route when hasFullAccess: true', () => {
      const req: any = {
        user: {
          _id: '6579c3f8e912345678900022',
          role: {
            name: 'Operations VP',
            hasFullAccess: true,
            permissions: ['*'],
          },
        },
      };
      const res = mockRes();
      const next = vi.fn();

      const middleware = checkPermission('settings.general');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
