import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User, { IUser } from '../models/User';
import Role from '../models/Role';

export interface AuthRequest extends Request {
  user?: IUser;
}

// Dev-only auth conveniences (offline admin login + bypass) are enabled only
// outside production and only when not explicitly disabled.
export const isDevAuthFallbackEnabled = (): boolean =>
  process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH_FALLBACK !== 'false';

export const getRoleName = (role: unknown): string => {
  if (!role) return '';
  if (typeof role === 'string') return role.toLowerCase();
  const maybeRole = role as { name?: string };
  return String(maybeRole.name || '').toLowerCase();
};

export const getRolePermissions = (role: unknown): string[] => {
  const builtIn: Record<string, string[]> = {
    manager: ['dashboard', 'customers', 'leads', 'tasks', 'calls', 'amc', 'tickets', 'payments', 'proposals', 'reports'],
    sales_executive: ['dashboard', 'customers', 'leads', 'tasks', 'payments', 'proposals'],
    engineer: ['dashboard', 'customers', 'tasks', 'calls', 'amc', 'tickets'],
    employee: ['dashboard', 'customers', 'leads', 'tasks', 'calls', 'tickets'],
    staff: ['dashboard', 'customers', 'leads', 'tasks', 'calls', 'tickets'],
  };
  if (!role) return [];
  if (typeof role === 'string') return builtIn[getRoleName(role)] || [];
  const maybeRole = role as { permissions?: unknown; isActive?: boolean; hasFullAccess?: boolean };
  if (maybeRole.isActive === false) return [];
  if (maybeRole.hasFullAccess === true) return ['*'];
  const roleName = getRoleName(role);
  if (maybeRole && Array.isArray(maybeRole.permissions)) {
    return maybeRole.permissions.map((p) => String(p)).filter(Boolean);
  }
  return builtIn[roleName] || [];
};

const PAGE_PERMISSION_LEGACY: Record<string, string> = {
  'customers.list': 'customers',
  'customers.add': 'customers',
  'customers.productList': 'customers',
  customerTypes: 'customers',
  industries: 'customers',
  businessSegments: 'customers',
  industryTypes: 'customers',
  'leads.list': 'leads',
  leadSources: 'leads',
  leadStatuses: 'leads',
  'tasks.list': 'tasks',
  calendar: 'tasks',
  'calls.list': 'calls',
  'calls.add': 'calls',
  engineers: 'calls',
  'tickets.list': 'tickets',
  'tickets.add': 'tickets',
  ticketCategories: 'tickets',
  'amc.dashboard': 'amc',
  'amc.list': 'amc',
  'tdl.dashboard': 'amc',
  'tdl.list': 'amc',
  'cloud.dashboard': 'amc',
  'cloud.list': 'amc',
  'tss.dashboard': 'amc',
  'tss.list': 'amc',
  'products.list': 'products',
  licenceTypes: 'products',
  vendorCategories: 'products',
  'payments.records': 'payments',
  'payments.add': 'payments',
  invoices: 'payments',
  outstanding: 'payments',
  'proposals.list': 'proposals',
  'proposals.add': 'proposals',
  proposalTemplates: 'proposals',
  'proposalTemplates.add': 'proposals',
  'employees.list': 'employees',
  'employees.add': 'employees',
  adminUsers: 'employees',
  'settings.general': 'settings',
  emailTemplates: 'settings',
  mediaLibrary: 'settings',
};

const permissionMatches = (rawPermissions: string[], requestedPermission: string): boolean => {
  if (rawPermissions.includes('*') || rawPermissions.includes(requestedPermission)) return true;

  const requestedLegacy = PAGE_PERMISSION_LEGACY[requestedPermission];
  if (requestedLegacy && rawPermissions.includes(requestedLegacy)) return true;

  // If requestedPermission is a legacy group key (e.g. 'payments', 'customers', 'amc'),
  // allow if user has any permission belonging to that group
  return rawPermissions.some((permission) => {
    return PAGE_PERMISSION_LEGACY[permission] === requestedPermission;
  });
};

const resolveStoredRole = async (role: unknown): Promise<unknown> => {
  if (!role) return role;

  if (typeof role === 'string') {
    const value = role.trim();
    if (!value) return value;

    if (mongoose.Types.ObjectId.isValid(value)) {
      const roleById = await Role.findById(value);
      if (roleById) return roleById;
    }

    const roleByName = await Role.findOne({ name: { $regex: `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    return roleByName || role;
  }

  const maybeRole = role as { name?: string; _id?: unknown };
  if (maybeRole.name) return role;

  if (mongoose.Types.ObjectId.isValid(String(role))) {
    const roleById = await Role.findById(role);
    if (roleById) return roleById;
  }

  return role;
};

export const isAdminUser = (user?: Pick<IUser, 'role'>): boolean => {
  if (!user?.role) return false;
  const roleName = getRoleName(user.role);
  if (roleName === 'admin' || roleName === 'super admin' || roleName === 'full admin') return true;
  const maybeRole = user.role as { hasFullAccess?: boolean };
  return maybeRole.hasFullAccess === true;
};

export const hasPermission = (user: Pick<IUser, 'role'> | undefined, permission: string): boolean => {
  const permissions = getRolePermissions(user?.role);
  if (permissions && permissions.length > 0) {
    return permissionMatches(permissions, permission);
  }
  if (isAdminUser(user)) return true;
  return false;
};

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'No token provided' });
      return;
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };

    // Dev-mode fallback user when DB is unavailable. Gated behind the same flag
    // as the login fallback so it can never be reached in production.
    if (decoded.id === 'dev-admin-local' && isDevAuthFallbackEnabled()) {
      req.user = {
        _id: 'dev-admin-local',
        name: 'WelcomeTech Admin',
        email: 'admin@welcometech.qa',
        role: 'admin',
        isActive: true,
      } as unknown as IUser;
      next();
      return;
    }

    const user = await User.findById(decoded.id).select('-password');
    
    if (!user || !user.isActive) {
      res.status(401).json({ success: false, message: 'User not found or inactive' });
      return;
    }

    user.role = await resolveStoredRole(user.role) as any;

    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export const attachUser = protect;

export const requireRole = (...roles: string[]) => {
  const normalizedAllowed = roles.map((r) => r.toLowerCase().trim());
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    if (isAdminUser(req.user)) {
      next();
      return;
    }

    const roleName = getRoleName(req.user.role);

    if (!roleName || !normalizedAllowed.includes(roleName)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }
    next();
  };
};

export const checkPermission = (permission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    if (!hasPermission(req.user, permission)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }
    next();
  };
};
