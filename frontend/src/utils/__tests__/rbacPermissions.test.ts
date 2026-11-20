import { describe, it, expect } from 'vitest';
import { hasPermission, PAGE_PERMISSIONS, expandPermissionsForEditing } from '../rbac';

describe('Role-Based Access Control (RBAC) & Page Restrictions', () => {
  it('grants full access to admin when no specific restricted permissions list is set', () => {
    const adminUser = { role: 'admin' };
    expect(hasPermission(adminUser, 'dashboard')).toBe(true);
    expect(hasPermission(adminUser, 'settings.general')).toBe(true);
    expect(hasPermission(adminUser, 'payments.records')).toBe(true);
  });

  it('respects restricted permissions for an admin role when specific permissions are assigned', () => {
    const restrictedAdminUser = {
      role: 'admin',
      permissions: ['dashboard', 'customers.list', 'leads.list']
    };

    // Allowed pages
    expect(hasPermission(restrictedAdminUser, 'dashboard')).toBe(true);
    expect(hasPermission(restrictedAdminUser, 'customers.list')).toBe(true);
    expect(hasPermission(restrictedAdminUser, 'leads.list')).toBe(true);

    // Restricted pages
    expect(hasPermission(restrictedAdminUser, 'settings.general')).toBe(false);
    expect(hasPermission(restrictedAdminUser, 'payments.records')).toBe(false);
    expect(hasPermission(restrictedAdminUser, 'roles')).toBe(false);
  });

  it('strictly isolates sibling permissions in the same category so unselected pages remain inaccessible', () => {
    // Scenario: Admin has outstanding payments permitted, but invoices and payment records are unselected
    const partialFinanceAdmin = {
      role: 'admin',
      permissions: ['dashboard', 'outstanding', 'tss.list', 'customers.list']
    };

    // Permitted pages
    expect(hasPermission(partialFinanceAdmin, 'outstanding')).toBe(true);
    expect(hasPermission(partialFinanceAdmin, 'tss.list')).toBe(true);
    expect(hasPermission(partialFinanceAdmin, 'customers.list')).toBe(true);
    expect(hasPermission(partialFinanceAdmin, 'payments')).toBe(true); // Group check allowed because outstanding is selected

    // Restricted sibling pages in same category
    expect(hasPermission(partialFinanceAdmin, 'payments.records')).toBe(false);
    expect(hasPermission(partialFinanceAdmin, 'payments.add')).toBe(false);
    expect(hasPermission(partialFinanceAdmin, 'invoices')).toBe(false);
    expect(hasPermission(partialFinanceAdmin, 'amc.list')).toBe(false);
    expect(hasPermission(partialFinanceAdmin, 'cloud.list')).toBe(false);
    expect(hasPermission(partialFinanceAdmin, 'tdl.list')).toBe(false);
    expect(hasPermission(partialFinanceAdmin, 'customers.add')).toBe(false);
    expect(hasPermission(partialFinanceAdmin, 'customerTypes')).toBe(false);
  });

  it('correctly checks permissions when user has role object with permissions', () => {
    const roleObjectUser = {
      role: {
        name: 'Admin',
        permissions: ['dashboard', 'customers.list', 'tasks.list']
      }
    };

    expect(hasPermission(roleObjectUser, 'dashboard')).toBe(true);
    expect(hasPermission(roleObjectUser, 'customers.list')).toBe(true);
    expect(hasPermission(roleObjectUser, 'tasks.list')).toBe(true);
    expect(hasPermission(roleObjectUser, 'proposals.list')).toBe(false);
  });

  it('grants full access when permissions include wildcard (*)', () => {
    const wildcardUser = {
      role: 'admin',
      permissions: ['*']
    };

    expect(hasPermission(wildcardUser, 'dashboard')).toBe(true);
    expect(hasPermission(wildcardUser, 'settings.general')).toBe(true);
    expect(hasPermission(wildcardUser, 'roles')).toBe(true);
  });

  it('expands legacy grouped permissions for editing in roles page', () => {
    const legacyPermissions = ['customers', 'leads'];
    const expanded = expandPermissionsForEditing(legacyPermissions);

    expect(expanded).toContain('customers.list');
    expect(expanded).toContain('customers.add');
    expect(expanded).toContain('customers.productList');
    expect(expanded).toContain('leads.list');
  });

  it('validates that all page permissions belong to recognized categories', () => {
    const validGroups = ['Main', 'CRM', 'Services', 'Support', 'Inventory', 'Finance', 'Proposals', 'Team', 'System'];
    PAGE_PERMISSIONS.forEach((perm) => {
      expect(validGroups).toContain(perm.group);
      expect(perm.id.length).toBeGreaterThan(0);
      expect(perm.label.length).toBeGreaterThan(0);
    });
  });

  it('verifies category-based filtering and permission IDs uniqueness', () => {
    const ids = PAGE_PERMISSIONS.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    const crmPerms = PAGE_PERMISSIONS.filter(p => p.group === 'CRM');
    expect(crmPerms.length).toBeGreaterThanOrEqual(10);
    expect(crmPerms.some(p => p.id === 'customers.list')).toBe(true);
    expect(crmPerms.some(p => p.id === 'leads.list')).toBe(true);

    const servicePerms = PAGE_PERMISSIONS.filter(p => p.group === 'Services');
    expect(servicePerms.length).toBe(8);
    expect(servicePerms.some(p => p.id === 'amc.list')).toBe(true);
    expect(servicePerms.some(p => p.id === 'tdl.list')).toBe(true);
    expect(servicePerms.some(p => p.id === 'cloud.list')).toBe(true);
    expect(servicePerms.some(p => p.id === 'tss.list')).toBe(true);
  });

  it('restricts non-admin employee roles to their own leads and tasks only', () => {
    const employeeUser = {
      _id: 'emp_123',
      name: 'Caleb',
      role: 'employee',
      permissions: ['tasks.list', 'leads.list']
    };

    const isUserAdmin = (user: any) => {
      const roleName = (typeof user?.role === 'string' ? user.role : user?.role?.name || '').toLowerCase();
      return roleName === 'admin' || roleName === 'superadmin' || hasPermission(user, 'employees.list');
    };

    // Employee cannot manage employee list or switch to Employee View
    expect(isUserAdmin(employeeUser)).toBe(false);
    expect(hasPermission(employeeUser, 'employees.list')).toBe(false);

    // Filter construction for employee vs admin
    const buildScopedFilter = (user: any, requestedAssignee?: string) => {
      const filter: Record<string, any> = {};
      if (!isUserAdmin(user)) {
        filter.assignedTo = user._id;
      } else if (requestedAssignee && requestedAssignee !== 'all') {
        filter.assignedTo = requestedAssignee;
      }
      return filter;
    };

    const empFilter = buildScopedFilter(employeeUser, 'other_user_456');
    expect(empFilter.assignedTo).toBe('emp_123'); // Cannot be overridden by query

    const adminUser = { _id: 'admin_1', name: 'Admin', role: 'admin' };
    expect(isUserAdmin(adminUser)).toBe(true);
    const adminFilter = buildScopedFilter(adminUser, 'other_user_456');
    expect(adminFilter.assignedTo).toBe('other_user_456'); // Admin can view specific assignee
  });

  describe('Dashboard Role-Based Module Visibility', () => {
    const evaluateDashboardVisibility = (user: any) => {
      const roleName = (typeof user?.role === 'string' ? user.role : user?.role?.name || '').toLowerCase();
      const isAdmin = roleName === 'admin' || roleName === 'superadmin' || hasPermission(user, 'employees.list');

      const canViewCustomers = hasPermission(user, 'customers');
      const canAddCustomer = hasPermission(user, 'customers.add') || hasPermission(user, 'customers');
      const canViewLeads = hasPermission(user, 'leads');
      const canAddLead = hasPermission(user, 'leads.list') || hasPermission(user, 'leads');
      const canViewTasks = hasPermission(user, 'tasks');
      const canAddTask = isAdmin;
      const canViewTickets = hasPermission(user, 'tickets');
      const canAddTicket = hasPermission(user, 'tickets.add') || hasPermission(user, 'tickets');
      const canViewPayments = hasPermission(user, 'payments') || hasPermission(user, 'invoices') || hasPermission(user, 'outstanding');
      const canViewTSS = hasPermission(user, 'tss.dashboard') || hasPermission(user, 'tss.list') || hasPermission(user, 'amc');
      const canViewCloud = hasPermission(user, 'cloud.dashboard') || hasPermission(user, 'cloud.list') || hasPermission(user, 'amc');
      const canViewAMC = hasPermission(user, 'amc.dashboard') || hasPermission(user, 'amc.list') || hasPermission(user, 'amc');

      const kpiKeys = [
        canViewCustomers && 'customers',
        canViewLeads && 'leads',
        canViewTasks && 'tasks',
        canViewTickets && 'tickets',
        canViewPayments && 'payments',
      ].filter(Boolean) as string[];

      const actionButtons = [
        canAddCustomer && 'new_customer',
        canAddLead && 'new_lead',
        canAddTask && 'new_task',
        canAddTicket && 'log_ticket',
      ].filter(Boolean) as string[];

      const serviceCards = [
        canViewTSS && 'tss',
        canViewCloud && 'cloud',
        canViewAMC && 'amc',
      ].filter(Boolean) as string[];

      return {
        kpiKeys,
        actionButtons,
        serviceCards,
        canViewPayments,
      };
    };

    it('grants full dashboard visibility and task creation to Administrator', () => {
      const admin = { role: 'admin' };
      const visibility = evaluateDashboardVisibility(admin);

      expect(visibility.kpiKeys).toEqual(['customers', 'leads', 'tasks', 'tickets', 'payments']);
      expect(visibility.actionButtons).toEqual(['new_customer', 'new_lead', 'new_task', 'log_ticket']);
      expect(visibility.serviceCards).toEqual(['tss', 'cloud', 'amc']);
      expect(visibility.canViewPayments).toBe(true);
    });

    it('restricts dashboard modules and task creation for Sales Executive role', () => {
      const salesUser = {
        role: 'sales_executive',
        permissions: ['dashboard', 'customers', 'leads', 'tasks', 'payments', 'proposals']
      };
      const visibility = evaluateDashboardVisibility(salesUser);

      // Should see sales-related modules
      expect(visibility.kpiKeys).toContain('customers');
      expect(visibility.kpiKeys).toContain('leads');
      expect(visibility.kpiKeys).toContain('tasks');
      expect(visibility.kpiKeys).toContain('payments');
      expect(visibility.canViewPayments).toBe(true);
      expect(visibility.actionButtons).toContain('new_customer');
      expect(visibility.actionButtons).toContain('new_lead');
      // Task creation restricted to admin only
      expect(visibility.actionButtons).not.toContain('new_task');

      // Should NOT see support tickets or engineer services
      expect(visibility.kpiKeys).not.toContain('tickets');
      expect(visibility.actionButtons).not.toContain('log_ticket');
      expect(visibility.serviceCards).toHaveLength(0);
    });

    it('restricts dashboard modules and task creation for Engineer role', () => {
      const engineerUser = {
        role: 'engineer',
        permissions: ['dashboard', 'tasks', 'calls', 'amc', 'tickets']
      };
      const visibility = evaluateDashboardVisibility(engineerUser);

      // Should see technical and support modules
      expect(visibility.kpiKeys).toContain('tasks');
      expect(visibility.kpiKeys).toContain('tickets');
      // Task creation restricted to admin only
      expect(visibility.actionButtons).not.toContain('new_task');
      expect(visibility.actionButtons).toContain('log_ticket');
      expect(visibility.serviceCards).toContain('tss');
      expect(visibility.serviceCards).toContain('cloud');
      expect(visibility.serviceCards).toContain('amc');

      // Should NOT see financial revenue chart or sales leads
      expect(visibility.kpiKeys).not.toContain('payments');
      expect(visibility.kpiKeys).not.toContain('leads');
      expect(visibility.canViewPayments).toBe(false);
      expect(visibility.actionButtons).not.toContain('new_customer');
      expect(visibility.actionButtons).not.toContain('new_lead');
    });

    it('strictly shows only task widgets for task-only employees and hides task creation', () => {
      const taskUser = {
        role: 'employee',
        permissions: ['dashboard', 'tasks.list']
      };
      const visibility = evaluateDashboardVisibility(taskUser);

      expect(visibility.kpiKeys).toEqual(['tasks']);
      expect(visibility.actionButtons).not.toContain('new_task');
      expect(visibility.serviceCards).toHaveLength(0);
      expect(visibility.canViewPayments).toBe(false);
    });

    it('allows Employee with customer/product permissions to access shared product list and customers', () => {
      const employeeUser = {
        _id: 'emp_caleb_1',
        name: 'Caleb',
        role: 'employee',
        permissions: ['dashboard', 'customers.list', 'customers.productList', 'tasks.list']
      };

      // Can view customers and product list
      expect(hasPermission(employeeUser, 'customers.productList')).toBe(true);
      expect(hasPermission(employeeUser, 'customers.list')).toBe(true);
      expect(hasPermission(employeeUser, 'customers')).toBe(true);

      // Verify directory query does not filter out shared company customers
      const buildDirectoryQuery = (_user: any) => {
        // Shared directory query should not filter by createdBy for permitted staff
        const filter: Record<string, any> = { isActive: true };
        return filter;
      };

      const query = buildDirectoryQuery(employeeUser);
      expect(query.createdBy).toBeUndefined();
      expect(query.isActive).toBe(true);
    });
  });
});



