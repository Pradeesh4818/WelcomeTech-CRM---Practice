import { describe, it, expect } from 'vitest';
import { 
  hasPermission, 
  isUserAdmin,
  PAGE_PERMISSIONS, 
  expandPermissionsForEditing 
} from '../../../utils/rbac';

describe('Frontend Role Full Access Toggle & RBAC Logic', () => {
  describe('TC-FE-ROLE-01: hasPermission Evaluation with Full Access', () => {
    it('grants access to any route when user.hasFullAccess is true', () => {
      const user = {
        _id: 'user-001',
        name: 'Super User',
        hasFullAccess: true,
        permissions: [],
      };

      expect(hasPermission(user, 'dashboard')).toBe(true);
      expect(hasPermission(user, 'customers.list')).toBe(true);
      expect(hasPermission(user, 'settings.general')).toBe(true);
      expect(hasPermission(user, 'roles')).toBe(true);
      expect(hasPermission(user, 'invoices')).toBe(true);
    });

    it('grants access to any route when user.role.hasFullAccess is true', () => {
      const user = {
        _id: 'user-002',
        name: 'Operations Director',
        role: {
          _id: 'role-100',
          name: 'Operations Director',
          hasFullAccess: true,
          permissions: [],
        },
      };

      expect(hasPermission(user, 'dashboard')).toBe(true);
      expect(hasPermission(user, 'tickets.list')).toBe(true);
      expect(hasPermission(user, 'amc.dashboard')).toBe(true);
      expect(hasPermission(user, 'adminUsers')).toBe(true);
      expect(hasPermission(user, 'employees.list')).toBe(true);
    });

    it('grants access when role has permissions array containing wildcard ["*"]', () => {
      const user = {
        _id: 'user-003',
        name: 'Executive Partner',
        role: {
          _id: 'role-101',
          name: 'Partner',
          hasFullAccess: false,
          permissions: ['*'],
        },
      };

      expect(hasPermission(user, 'dashboard')).toBe(true);
      expect(hasPermission(user, 'cloud.dashboard')).toBe(true);
      expect(hasPermission(user, 'reports')).toBe(true);
      expect(hasPermission(user, 'roles')).toBe(true);
    });

    it('strictly confines access to selected permissions when hasFullAccess is false', () => {
      const user = {
        _id: 'user-004',
        name: 'Desk Agent',
        role: {
          _id: 'role-102',
          name: 'Desk Agent',
          hasFullAccess: false,
          permissions: ['tickets.list', 'tickets.add', 'ticketCategories'],
        },
      };

      expect(hasPermission(user, 'tickets.list')).toBe(true);
      expect(hasPermission(user, 'tickets.add')).toBe(true);
      expect(hasPermission(user, 'settings.general')).toBe(false);
      expect(hasPermission(user, 'roles')).toBe(false);
      expect(hasPermission(user, 'employees.list')).toBe(false);
      expect(hasPermission(user, 'adminUsers')).toBe(false);
    });
  });

  describe('TC-FE-ROLE-02: isUserAdmin Helper Verification', () => {
    it('returns true when user has hasFullAccess: true', () => {
      expect(isUserAdmin({ hasFullAccess: true, role: 'CustomRole' })).toBe(true);
    });

    it('returns true when user.role has hasFullAccess: true', () => {
      expect(isUserAdmin({ role: { name: 'Admin_office', hasFullAccess: true } })).toBe(true);
    });

    it('returns true when user has wildcard permissions ["*"]', () => {
      expect(isUserAdmin({ permissions: ['*'], role: 'CustomRole' })).toBe(true);
    });

    it('returns true for system admin role', () => {
      expect(isUserAdmin({ role: 'admin' })).toBe(true);
      expect(isUserAdmin({ role: { name: 'Admin' } })).toBe(true);
    });

    it('returns false for normal role without full access', () => {
      expect(isUserAdmin({ role: 'employee', permissions: ['tasks.list'] })).toBe(false);
      expect(isUserAdmin({ role: { name: 'Manager', hasFullAccess: false } })).toBe(false);
    });
  });

  describe('TC-FE-ROLE-03: Modal Toggle State & Baseline Permission Preservation', () => {
    const handleToggleFullAccess = (
      checked: boolean,
      prevPermissions: string[]
    ) => {
      return {
        hasFullAccess: checked,
        permissions: checked && prevPermissions.length === 0
          ? PAGE_PERMISSIONS.map(p => p.id)
          : prevPermissions
      };
    };

    const buildSubmitPayload = (formData: {
      name: string;
      description: string;
      hasFullAccess: boolean;
      permissions: string[];
    }) => {
      return {
        name: formData.name.trim(),
        description: formData.description.trim(),
        hasFullAccess: formData.hasFullAccess,
        permissions: formData.permissions.length > 0 
          ? formData.permissions 
          : (formData.hasFullAccess ? ['*'] : []),
      };
    };

    it('switching Full Access ON preserves existing granular baseline permissions', () => {
      const initialPerms = ['customers.list', 'leads.list'];
      const result = handleToggleFullAccess(true, initialPerms);
      expect(result.hasFullAccess).toBe(true);
      expect(result.permissions).toEqual(initialPerms);
    });

    it('switching Full Access ON from empty initializes all permissions', () => {
      const result = handleToggleFullAccess(true, []);
      expect(result.hasFullAccess).toBe(true);
      expect(result.permissions.length).toBe(PAGE_PERMISSIONS.length);
    });

    it('switching Full Access OFF retains the selected permissions intact', () => {
      const perms = ['tickets.list', 'tickets.add'];
      const result = handleToggleFullAccess(false, perms);
      expect(result.hasFullAccess).toBe(false);
      expect(result.permissions).toEqual(perms);
    });

    it('builds payload preserving baseline permissions even when hasFullAccess is true', () => {
      const payload = buildSubmitPayload({
        name: 'General Manager',
        description: 'Unrestricted GM',
        hasFullAccess: true,
        permissions: ['dashboard', 'customers.list'],
      });

      expect(payload).toEqual({
        name: 'General Manager',
        description: 'Unrestricted GM',
        hasFullAccess: true,
        permissions: ['dashboard', 'customers.list'],
      });
    });

    it('builds payload with exact granular permissions when hasFullAccess is false', () => {
      const payload = buildSubmitPayload({
        name: 'Field Technician',
        description: 'Field engineer access',
        hasFullAccess: false,
        permissions: ['calls.list', 'calls.add', 'tasks.list'],
      });

      expect(payload).toEqual({
        name: 'Field Technician',
        description: 'Field engineer access',
        hasFullAccess: false,
        permissions: ['calls.list', 'calls.add', 'tasks.list'],
      });
    });
  });

  describe('TC-FE-ROLE-04: Table Badge Display Logic', () => {
    const evaluateBadgeType = (role: {
      name?: string;
      hasFullAccess?: boolean;
      permissions?: string[];
    }) => {
      const isFull = !!role.hasFullAccess || 
        role.name?.toLowerCase() === 'admin' || 
        (Array.isArray(role.permissions) && role.permissions.includes('*'));

      if (isFull) return 'FULL_ACCESS';
      const expanded = expandPermissionsForEditing(role.permissions || []);
      if (expanded.length > 0) return 'GRANULAR_PERMISSIONS';
      return 'EMPTY';
    };

    it('identifies custom role with hasFullAccess: true as FULL_ACCESS badge', () => {
      expect(evaluateBadgeType({
        name: 'Branch Manager',
        hasFullAccess: true,
        permissions: [],
      })).toBe('FULL_ACCESS');
    });

    it('identifies system Admin as FULL_ACCESS badge even if hasFullAccess was not explicitly stored', () => {
      expect(evaluateBadgeType({
        name: 'Admin',
        permissions: ['*'],
      })).toBe('FULL_ACCESS');
    });

    it('identifies role with granular permissions as GRANULAR_PERMISSIONS', () => {
      expect(evaluateBadgeType({
        name: 'Sales Rep',
        hasFullAccess: false,
        permissions: ['customers.list', 'leads.list'],
      })).toBe('GRANULAR_PERMISSIONS');
    });

    it('identifies role with zero permissions as EMPTY', () => {
      expect(evaluateBadgeType({
        name: 'Restricted User',
        hasFullAccess: false,
        permissions: [],
      })).toBe('EMPTY');
    });
  });
});
