import { Request, Response } from 'express';
import Role from '../models/Role';
import { AuthRequest } from '../middleware/auth';

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DEFAULT_ADMIN_PERMISSIONS = [
  'dashboard',
  'customers',
  'leads',
  'tasks',
  'products',
  'calls',
  'amc',
  'tickets',
  'payments',
  'proposals',
  'reports',
  'employees',
  'settings',
  'roles',
];

const ensureDefaultAdminRole = async (): Promise<void> => {
  const existingAdmin = await Role.findOne({ name: { $regex: '^admin$', $options: 'i' } });
  if (existingAdmin) {
    if (existingAdmin.hasFullAccess !== true) {
      existingAdmin.hasFullAccess = true;
      await existingAdmin.save();
    }
    return;
  }

  await Role.create({
    name: 'Admin',
    description: 'Full system access and management permissions',
    permissions: DEFAULT_ADMIN_PERMISSIONS,
    hasFullAccess: true,
    isSystem: true,
    isActive: true,
  });
};

export const getRoles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureDefaultAdminRole();

    const { search } = req.query;
    const filter: Record<string, unknown> = {};
    if (typeof search === 'string' && search.trim()) {
      const value = escapeRe(search.trim());
      filter.$or = [
        { name: { $regex: value, $options: 'i' } },
        { description: { $regex: value, $options: 'i' } },
      ];
    }
    const roles = await Role.find(filter).sort({ _id: 1 });
    res.status(200).json({ success: true, data: roles });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getActiveRoles = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureDefaultAdminRole();
    const roles = await Role.find({ isActive: true }).sort({ name: 1 });
    res.status(200).json({ success: true, data: roles });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, permissions, hasFullAccess } = req.body;
    const isFull = Boolean(hasFullAccess) || (Array.isArray(permissions) && permissions.includes('*'));
    const role = await Role.create({
      name,
      description,
      permissions: isFull && (!permissions || !permissions.length) ? ['*'] : permissions,
      hasFullAccess: isFull,
    });
    res.status(201).json({ success: true, data: role });
  } catch (err: any) {
    if (err.code === 11000) {
      res.status(400).json({ success: false, message: 'Role name already exists' });
      return;
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, permissions, hasFullAccess, isActive } = req.body;
    const role = await Role.findById(req.params.id);
    
    if (!role) {
      res.status(404).json({ success: false, message: 'Role not found' });
      return;
    }

    if (role.isSystem && name !== role.name) {
      res.status(400).json({ success: false, message: 'Cannot rename system role' });
      return;
    }

    role.name = name || role.name;
    role.description = description !== undefined ? description : role.description;
    role.permissions = permissions || role.permissions;
    if (hasFullAccess !== undefined) {
      role.hasFullAccess = Boolean(hasFullAccess);
      if (role.hasFullAccess && (!role.permissions || role.permissions.length === 0)) {
        role.permissions = ['*'];
      }
    }
    role.isActive = isActive !== undefined ? isActive : role.isActive;

    await role.save();
    res.status(200).json({ success: true, data: role });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      res.status(404).json({ success: false, message: 'Role not found' });
      return;
    }
    if (role.isSystem) {
      res.status(400).json({ success: false, message: 'System roles cannot be deleted' });
      return;
    }
    await Role.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Role deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
