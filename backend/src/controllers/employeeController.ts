import { Response } from 'express';
import fs from 'fs';
import mongoose from 'mongoose';
import User from '../models/User';
import Role from '../models/Role';
import Call from '../models/Call';
import Task, { TaskStatus } from '../models/Task';
import { AuthRequest, getRoleName, isAdminUser } from '../middleware/auth';
import { Settings } from '../models/Settings';
import { COUNTRY_PHONE_RULES, DEFAULT_COUNTRY, normalizePhone, toDigitsOnly, validatePhoneNumber } from '../utils/phoneValidation';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const LEGACY_ASSIGNABLE_ROLES = new Set(['admin', 'manager', 'engineer', 'sales_executive']);

const normalizeRoleKey = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const resolveAssignableRole = async (role: unknown): Promise<string | mongoose.Types.ObjectId> => {
  const value = String(role || '').trim();
  if (!value) return 'engineer';

  if (mongoose.Types.ObjectId.isValid(value)) {
    const roleDoc = await Role.findOne({ _id: value, isActive: true });
    if (!roleDoc) throw new Error('Selected role is inactive or no longer exists');
    return roleDoc._id as mongoose.Types.ObjectId;
  }

  const roleDoc = await Role.findOne({
    name: { $regex: `^${escapeRe(value)}$`, $options: 'i' },
    isActive: true,
  });
  if (roleDoc) return roleDoc._id as mongoose.Types.ObjectId;

  const legacyRole = normalizeRoleKey(value);
  if (LEGACY_ASSIGNABLE_ROLES.has(legacyRole)) return legacyRole;

  throw new Error('Selected role is inactive or no longer exists');
};

// Resolve a role value (string name or ObjectId) to its lowercase role name.
const resolveRoleName = async (roleValue: unknown): Promise<string> => {
  if (!roleValue) return '';
  if (typeof roleValue === 'object' && (roleValue as { name?: string }).name) {
    return String((roleValue as { name?: string }).name).toLowerCase();
  }
  const str = String(roleValue).trim();
  if (mongoose.Types.ObjectId.isValid(str)) {
    const roleDoc = await Role.findById(str);
    if (roleDoc) return getRoleName(roleDoc);
  }
  return getRoleName(str);
};

// Is this employee the system administrator (protected account)?
const isAdminEmployee = async (emp: { role?: unknown; email?: string }): Promise<boolean> => {
  const roleName = await resolveRoleName(emp?.role);
  return roleName === 'admin' || emp?.email === 'admin@welcometech.qa';
};

// Does this resolved assignment grant the admin role?
const assignmentIsAdmin = async (resolved: string | mongoose.Types.ObjectId): Promise<boolean> => {
  if (typeof resolved === 'string') return normalizeRoleKey(resolved) === 'admin';
  const roleDoc = await Role.findById(resolved);
  return getRoleName(roleDoc) === 'admin';
};

export const getEmployees = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, role, status, page, limit, includeAdmins, all } = req.query;
    const filter: Record<string, unknown> = {};

    const adminRoleDocs = await Role.find({ name: { $regex: /^(admin|superadmin)$/i } }).select('_id');
    const adminRoleIds = adminRoleDocs.map((r) => r._id);
    const adminRoleIdentifiers = ['admin', 'superadmin', ...adminRoleIds];

    if (role && typeof role === 'string' && role !== 'all') {
      const roleValues: unknown[] = [role];
      const roleObjectIds = new Set<string>();
      if (!mongoose.Types.ObjectId.isValid(role)) {
        // Users created via a Role record store its ObjectId, so a role name must match those too.
        const namedRoles = await Role.find({ name: { $regex: `^${escapeRe(role.trim())}$`, $options: 'i' } }).select('_id');
        namedRoles.forEach((r) => { roleValues.push(r._id); roleObjectIds.add(String(r._id)); });
      }
      if (mongoose.Types.ObjectId.isValid(role)) {
        const roleObjectId = new mongoose.Types.ObjectId(role);
        const roleDoc = await Role.findById(roleObjectId);
        roleValues.push(roleObjectId);
        if (roleDoc) {
          roleValues.push(roleDoc.name, normalizeRoleKey(roleDoc.name));
        }
      }
      filter.role = { $in: Array.from(new Set(roleValues.map((value) => String(value)))).map((value) => (
        mongoose.Types.ObjectId.isValid(value) && (value === role || roleObjectIds.has(value)) ? new mongoose.Types.ObjectId(value) : value
      )) };
    } else if (includeAdmins !== 'true') {
      // By default, exclude admin users from Employee List
      filter.role = { $nin: adminRoleIdentifiers };
      filter.email = { $ne: 'admin@welcometech.qa' };
    }

    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;
    if (search && typeof search === 'string') {
      const re = new RegExp(escapeRe(search.trim()), 'i');
      filter.$or = [{ name: re }, { email: re }, { phone: re }];
    }

    const isUnbounded = all === 'true' || limit === 'all' || limit === '0' || (!page && !limit);
    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = isUnbounded ? 0 : Math.max(Number(limit) || 10, 1);
    const skip = isUnbounded ? 0 : (pageNum - 1) * limitNum;

    const [employees, total] = await Promise.all([
      isUnbounded
        ? User.find(filter).select('-password').sort({ name: 1 })
        : User.find(filter).select('-password').sort({ _id: 1 }).skip(skip).limit(limitNum),
      User.countDocuments(filter),
    ]);
    const employeeIds = employees.map((emp) => emp._id);
    const openTaskCounts = employeeIds.length
      ? await Task.aggregate([
          {
            $match: {
              isActive: true,
              $or: [
                { assignedTo: { $in: employeeIds }, status: { $in: ['todo', 'in_progress', 'blocked', 'review'] as TaskStatus[] } },
                { forwardedBy: { $in: employeeIds }, status: { $ne: 'done' } },
              ],
            },
          },
          {
            $project: {
              userToCredit: {
                $cond: [
                  { $in: ['$assignedTo', employeeIds] },
                  '$assignedTo',
                  '$forwardedBy',
                ],
              },
            },
          },
          { $group: { _id: '$userToCredit', count: { $sum: 1 } } },
        ])
      : [];
    const openTaskCountByUser = new Map(openTaskCounts.map((row) => [String(row._id), row.count]));

    const withStats = await Promise.all(
      employees.map(async (emp) => {
        const [totalCalls, resolvedCalls] = await Promise.all([
          Call.countDocuments({ engineer: emp._id }),
          Call.countDocuments({ engineer: emp._id, status: 'resolved' }),
        ]);
        return { ...emp.toObject(), totalCalls, resolvedCalls, openTaskCount: openTaskCountByUser.get(String(emp._id)) || 0 };
      })
    );

    res.status(200).json({
      success: true,
      data: withStats,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit))
    });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const getEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const emp = await User.findById(req.params.id).select('-password');
    if (!emp) { res.status(404).json({ success: false, message: 'Employee not found' }); return; }
    res.status(200).json({ success: true, data: emp });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const createEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, password, confirmPassword, role, phone, address, salary, passportNumber, passportExpiryDate, qidNumber, qidExpiryDate } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: 'Name, email and password are required' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      return;
    }
    if (confirmPassword && password !== confirmPassword) {
      res.status(400).json({ success: false, message: 'Passwords do not match' });
      return;
    }
    let normalizedPhone: string | undefined;
    if (typeof phone === 'string' && phone.trim()) {
      if (!validatePhoneNumber(phone)) {
        res.status(400).json({
          success: false,
          message: `Invalid phone format or length for the provided country code.`,
        });
        return;
      }
      normalizedPhone = normalizePhone(phone);
    }

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) {
      res.status(400).json({ success: false, message: 'Email already in use' });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const avatarPath = files?.['avatar']?.[0]?.path;
    const passportPath = files?.['passport']?.[0]?.path;
    const qidPath = files?.['qidDocument']?.[0]?.path;
    const documents = (files?.['documents'] ?? []).map((f) => ({
      name: f.originalname,
      path: f.path,
      uploadedAt: new Date(),
    }));

    let resolvedRole: string | mongoose.Types.ObjectId;
    try {
      resolvedRole = await resolveAssignableRole(role);
    } catch (error) {
      res.status(400).json({ success: false, message: (error as Error).message });
      return;
    }

    // Only an admin may create another admin account.
    if (await assignmentIsAdmin(resolvedRole) && !isAdminUser(req.user)) {
      res.status(403).json({ success: false, message: 'Only an administrator can assign the admin role.' });
      return;
    }

    const emp = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: resolvedRole,
      salary: toNumberOrUndefined(salary),
      phone: normalizedPhone,
      address: address || undefined,
      avatar: avatarPath || undefined,
      passport: passportPath || undefined,
      passportNumber: passportNumber || undefined,
      passportExpiryDate: passportExpiryDate ? new Date(passportExpiryDate) : undefined,
      qidDocument: qidPath || undefined,
      qidNumber: qidNumber ? String(qidNumber).trim() : undefined,
      qidExpiryDate: qidExpiryDate ? new Date(qidExpiryDate) : undefined,
      documents,
      isActive: true,
    });

    res.status(201).json({ success: true, data: emp.toJSON() });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
};

export const updateEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, role, phone, address, isActive, salary, password, confirmPassword, passportNumber, passportExpiryDate, qidNumber, qidExpiryDate } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

    const emp = await User.findById(req.params.id);
    if (!emp) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }

    if (name) emp.name = name.trim();
    if (email) {
      const norm = email.toLowerCase().trim();
      if (norm !== emp.email) {
        const dupe = await User.findOne({ email: norm, _id: { $ne: emp._id } });
        if (dupe) {
          res.status(400).json({ success: false, message: 'Email already in use' });
          return;
        }
      }
      emp.email = norm;
    }
    if (role) {
      let nextRole: string | mongoose.Types.ObjectId;
      try {
        nextRole = await resolveAssignableRole(role);
      } catch (error) {
        res.status(400).json({ success: false, message: (error as Error).message });
        return;
      }
      // Non-admins cannot grant the admin role, nor alter an existing admin account.
      if (!isAdminUser(req.user) && (await assignmentIsAdmin(nextRole) || await isAdminEmployee(emp))) {
        res.status(403).json({ success: false, message: 'Only an administrator can assign or modify the admin role.' });
        return;
      }
      emp.role = nextRole;
    }

    if (phone !== undefined) {
      const phoneString = String(phone || '').trim();
      if (!phoneString) {
        emp.phone = undefined;
      } else {
        if (!validatePhoneNumber(phoneString)) {
          res.status(400).json({
            success: false,
            message: `Invalid phone format or length for the provided country code.`,
          });
          return;
        }
        emp.phone = normalizePhone(phoneString);
      }
    }

    if (address !== undefined) emp.address = address;
    if (salary !== undefined) emp.salary = toNumberOrUndefined(salary);
    if (isActive !== undefined) emp.isActive = isActive === 'true' || isActive === true;

    if (passportNumber !== undefined) emp.passportNumber = passportNumber || undefined;
    if (passportExpiryDate !== undefined) emp.passportExpiryDate = passportExpiryDate ? new Date(passportExpiryDate) : undefined;
    if (qidNumber !== undefined) emp.qidNumber = qidNumber || undefined;
    if (qidExpiryDate !== undefined) emp.qidExpiryDate = qidExpiryDate ? new Date(qidExpiryDate) : undefined;

    if (password) {
      if (password.length < 6) {
        res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        return;
      }
      if (confirmPassword && password !== confirmPassword) {
        res.status(400).json({ success: false, message: 'Passwords do not match' });
        return;
      }
      emp.password = password;
    }

    if (files?.['avatar']?.[0]) emp.avatar = files['avatar'][0].path;
    if (files?.['passport']?.[0]) emp.passport = files['passport'][0].path;
    if (files?.['qidDocument']?.[0]) emp.qidDocument = files['qidDocument'][0].path;

    if (files?.['documents']?.length) {
      const newDocs = files['documents'].map((f) => ({
        name: f.originalname,
        path: f.path,
        uploadedAt: new Date(),
      }));
      if (!emp.documents) emp.documents = [];
      emp.documents.push(...newDocs);
    }

    await emp.save();
    res.status(200).json({ success: true, data: emp.toJSON() });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
};

export const changeEmployeePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { password, confirmPassword } = req.body;
    if (!password || password.length < 6) {
      res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      return;
    }
    if (confirmPassword && password !== confirmPassword) {
      res.status(400).json({ success: false, message: 'Passwords do not match' });
      return;
    }
    const emp = await User.findById(req.params.id);
    if (!emp) { res.status(404).json({ success: false, message: 'Employee not found' }); return; }
    // Only an admin may reset an administrator account's password.
    if (await isAdminEmployee(emp) && !isAdminUser(req.user)) {
      res.status(403).json({ success: false, message: 'Only an administrator can change an administrator account password.' });
      return;
    }
    emp.password = password;
    await emp.save();
    res.status(200).json({ success: true, message: 'Password updated' });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const removeEmployeeDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { docIndex } = req.body;
    const emp = await User.findById(req.params.id);
    if (!emp) { res.status(404).json({ success: false, message: 'Employee not found' }); return; }

    const docs: Array<{ name: string; path: string }> = (emp as any).documents || [];
    const idx = Number(docIndex);
    if (idx >= 0 && idx < docs.length) {
      const docPath = docs[idx].path;
      try { if (docPath) fs.unlinkSync(docPath); } catch { /* ignore */ }
      docs.splice(idx, 1);
    }

    await User.findByIdAndUpdate(req.params.id, { documents: docs });
    res.status(200).json({ success: true, message: 'Document removed' });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const deleteEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const emp = await User.findById(req.params.id);
    if (!emp) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }

    const roleName = await resolveRoleName(emp.role);
    const normalizedEmail = (emp.email || '').toLowerCase().trim();
    const isPrimaryAdmin = normalizedEmail === 'admin@welcometech.qa' || normalizedEmail === 'admin@welcomtech.qa';
    const isTargetAdmin = roleName === 'admin' || roleName === 'superadmin' || isPrimaryAdmin;

    // 1. Primary system administrator cannot be deleted under any circumstances
    if (isPrimaryAdmin) {
      res.status(400).json({ success: false, message: 'Cannot delete the primary system administrator account' });
      return;
    }

    // 2. Extra protections when deleting an administrator account
    if (isTargetAdmin) {
      // Only administrators can delete admin accounts
      if (!isAdminUser(req.user)) {
        res.status(403).json({ success: false, message: 'Only an administrator can delete an administrator account' });
        return;
      }

      // Admins cannot delete their own account
      if (req.user?._id && String(req.user._id) === String(emp._id)) {
        res.status(400).json({ success: false, message: 'You cannot delete your own account' });
        return;
      }

      // Cannot delete if this is the last remaining administrator in the system
      const adminRoleDocs = await Role.find({ name: { $regex: /^(admin|superadmin)$/i } }).select('_id');
      const adminRoleIds = adminRoleDocs.map((r) => r._id);
      const adminRoleIdentifiers = ['admin', 'superadmin', ...adminRoleIds];

      const adminCount = await User.countDocuments({
        $or: [
          { email: { $in: ['admin@welcometech.qa', 'admin@welcomtech.qa'] } },
          { role: { $in: adminRoleIdentifiers } },
        ],
      });

      if (adminCount <= 1) {
        res.status(400).json({ success: false, message: 'Cannot delete the only remaining administrator account' });
        return;
      }
    }

    // Clean up any uploaded document files if present
    const docs: Array<{ name: string; path: string }> = (emp as any).documents || [];
    for (const doc of docs) {
      try { if (doc?.path && fs.existsSync(doc.path)) fs.unlinkSync(doc.path); } catch { /* ignore */ }
    }

    await User.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: isTargetAdmin ? 'Admin deleted' : 'Employee deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Server error' });
  }
};
