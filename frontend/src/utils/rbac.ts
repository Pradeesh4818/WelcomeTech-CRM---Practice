export interface PagePermission {
  id: string;
  label: string;
  group: string;
  legacy?: string;
}

export const PAGE_PERMISSIONS: PagePermission[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Main' },
  { id: 'customers.list', label: 'Customer List', group: 'CRM', legacy: 'customers' },
  { id: 'customers.add', label: 'Add Customer', group: 'CRM', legacy: 'customers' },
  { id: 'customers.productList', label: 'Product List', group: 'CRM', legacy: 'customers' },
  { id: 'customerTypes', label: 'Customer Types', group: 'CRM', legacy: 'customers' },
  { id: 'industries', label: 'Industry', group: 'CRM', legacy: 'customers' },
  { id: 'businessSegments', label: 'Business Segment', group: 'CRM', legacy: 'customers' },
  { id: 'industryTypes', label: 'Industry Type', group: 'CRM', legacy: 'customers' },
  { id: 'leads.list', label: 'Leads', group: 'CRM', legacy: 'leads' },
  { id: 'leadSources', label: 'Lead Sources', group: 'CRM', legacy: 'leads' },
  { id: 'leadStatuses', label: 'Lead Status', group: 'CRM', legacy: 'leads' },
  { id: 'tasks.list', label: 'Tasks', group: 'CRM', legacy: 'tasks' },
  { id: 'calendar', label: 'Calendar', group: 'CRM', legacy: 'tasks' },
  { id: 'calls.list', label: 'Call Logs', group: 'CRM', legacy: 'calls' },
  { id: 'calls.add', label: 'Log Call', group: 'CRM', legacy: 'calls' },
  { id: 'engineers', label: 'Engineers', group: 'CRM', legacy: 'calls' },
  { id: 'tickets.list', label: 'Tickets', group: 'Support', legacy: 'tickets' },
  { id: 'tickets.add', label: 'New Ticket', group: 'Support', legacy: 'tickets' },
  { id: 'ticketCategories', label: 'Ticket Category', group: 'Support', legacy: 'tickets' },
  { id: 'amc.dashboard', label: 'AMC Dashboard', group: 'Services', legacy: 'amc' },
  { id: 'amc.list', label: 'AMC List', group: 'Services', legacy: 'amc' },
  { id: 'tdl.dashboard', label: 'TDL Dashboard', group: 'Services', legacy: 'amc' },
  { id: 'tdl.list', label: 'TDL List', group: 'Services', legacy: 'amc' },
  { id: 'cloud.dashboard', label: 'Cloud Dashboard', group: 'Services', legacy: 'amc' },
  { id: 'cloud.list', label: 'Cloud List', group: 'Services', legacy: 'amc' },
  { id: 'tss.dashboard', label: 'TSS Dashboard', group: 'Services', legacy: 'amc' },
  { id: 'tss.list', label: 'TSS List', group: 'Services', legacy: 'amc' },
  { id: 'products.list', label: 'Products', group: 'Inventory', legacy: 'products' },
  { id: 'licenceTypes', label: 'Licence Types', group: 'Inventory', legacy: 'products' },
  { id: 'vendorCategories', label: 'Vendor Categories', group: 'Inventory', legacy: 'products' },
  { id: 'payments.records', label: 'Payment Records', group: 'Finance', legacy: 'payments' },
  { id: 'payments.add', label: 'Add Payment', group: 'Finance', legacy: 'payments' },
  { id: 'invoices', label: 'Invoices', group: 'Finance', legacy: 'payments' },
  { id: 'outstanding', label: 'Outstanding', group: 'Finance', legacy: 'payments' },
  { id: 'proposals.list', label: 'Customer Proposals', group: 'Proposals', legacy: 'proposals' },
  { id: 'proposalTemplates', label: 'Proposal Templates', group: 'Proposals', legacy: 'proposals' },
  { id: 'employees.list', label: 'Employee List', group: 'Team', legacy: 'employees' },
  { id: 'employees.add', label: 'Add Employee', group: 'Team', legacy: 'employees' },
  { id: 'adminUsers', label: 'Admin Users', group: 'Team', legacy: 'employees' },
  { id: 'settings.general', label: 'Settings', group: 'System', legacy: 'settings' },
  { id: 'emailTemplates', label: 'Email Templates', group: 'System', legacy: 'settings' },
  { id: 'mediaLibrary', label: 'Media Library', group: 'System', legacy: 'settings' },
  { id: 'roles', label: 'Roles', group: 'System' },
];

const LEGACY_PERMISSION_IDS = Array.from(
  new Set(PAGE_PERMISSIONS.map((permission) => permission.legacy).filter(Boolean) as string[])
);

const PERMISSION_BY_ID = PAGE_PERMISSIONS.reduce<Record<string, PagePermission>>((acc, permission) => {
  acc[permission.id] = permission;
  return acc;
}, {});

export const PERMISSION_LABELS = PAGE_PERMISSIONS.reduce<Record<string, string>>((acc, permission) => {
  acc[permission.id] = permission.label;
  if (permission.legacy && !acc[permission.legacy]) acc[permission.legacy] = permission.label;
  return acc;
}, {
  reports: 'Reports',
  'proposals.add': 'New Proposal',
  'proposalTemplates.add': 'New Proposal Template',
});

export const BUILT_IN_ROLE_PERMISSIONS: Record<string, string[]> = {
  manager: ['dashboard', 'customers', 'leads', 'tasks', 'calls', 'amc', 'tickets', 'payments', 'proposals', 'reports'],
  sales_executive: ['dashboard', 'customers', 'leads', 'tasks', 'payments', 'proposals'],
  engineer: ['dashboard', 'customers', 'tasks', 'calls', 'amc', 'tickets'],
  employee: ['dashboard', 'customers', 'leads', 'tasks', 'calls', 'tickets'],
  staff: ['dashboard', 'customers', 'leads', 'tasks', 'calls', 'tickets'],
};

export const expandPermissionsForEditing = (permissions: string[] = []) => {
  const expanded = new Set<string>();

  permissions.forEach((permissionId) => {
    if (permissionId === 'proposals.add') {
      expanded.add('proposals.list');
      return;
    }
    if (permissionId === 'proposalTemplates.add') {
      expanded.add('proposalTemplates');
      return;
    }

    if (PERMISSION_BY_ID[permissionId]) {
      expanded.add(permissionId);
      return;
    }

    PAGE_PERMISSIONS.forEach((permission) => {
      if (permission.legacy === permissionId) expanded.add(permission.id);
    });
  });

  return Array.from(expanded);
};

export const hasPermission = (user: any, permissionId: string) => {
  if (!user) return false;

  if (user.hasFullAccess === true || user.role?.hasFullAccess === true) {
    return true;
  }

  const rawPermissions = Array.isArray(user.permissions)
    ? user.permissions
    : Array.isArray(user.role?.permissions)
      ? user.role.permissions
      : typeof user.role === 'string'
        ? BUILT_IN_ROLE_PERMISSIONS[user.role.toLowerCase()] || []
        : [];

  if (Array.isArray(rawPermissions) && rawPermissions.length > 0) {
    if (rawPermissions.includes('*') || rawPermissions.includes(permissionId)) return true;

    // Inherited proposal & template access:
    // If role has access to Customer Proposals, grant access to New Proposal (proposals.add)
    if (permissionId === 'proposals.add' && (rawPermissions.includes('proposals.list') || rawPermissions.includes('proposals'))) {
      return true;
    }

    // If role has access to Proposal Templates, grant access to New Template (proposalTemplates.add)
    if (permissionId === 'proposalTemplates.add' && (rawPermissions.includes('proposalTemplates') || rawPermissions.includes('proposals'))) {
      return true;
    }

    // Backwards compatibility for existing roles that had proposals.add or proposalTemplates.add stored
    if (permissionId === 'proposals.list' && rawPermissions.includes('proposals.add')) {
      return true;
    }
    if (permissionId === 'proposalTemplates' && rawPermissions.includes('proposalTemplates.add')) {
      return true;
    }

    const requested = PERMISSION_BY_ID[permissionId];
    if (requested?.legacy && rawPermissions.includes(requested.legacy)) return true;

    if (LEGACY_PERMISSION_IDS.includes(permissionId)) {
      return PAGE_PERMISSIONS.some((permission) => permission.legacy === permissionId && rawPermissions.includes(permission.id));
    }

    return false;
  }

  const role = String(user.role?.name || user.role || '').toLowerCase();
  if (role === 'admin' || role === 'superadmin') return true;

  return false;
};

export const isUserAdmin = (user: any): boolean => {
  if (!user) return false;
  if (user.hasFullAccess === true || user.role?.hasFullAccess === true) return true;
  if (Array.isArray(user.permissions) && user.permissions.includes('*')) return true;
  if (Array.isArray(user.role?.permissions) && user.role.permissions.includes('*')) return true;
  const role = String(user.role?.name || user.role || '').toLowerCase().trim();
  return (
    role === 'admin' ||
    role === 'superadmin' ||
    role === 'super admin' ||
    role === 'full admin' ||
    role === 'fulladmin'
  );
};

export const isSuperOrFullAdmin = (user: any): boolean => isUserAdmin(user);



