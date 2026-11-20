import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User';
import Role from '../models/Role';
import { AuthRequest, getRolePermissions, isDevAuthFallbackEnabled } from '../middleware/auth';

const signToken = (id: string): string => {
  return jwt.sign({ id }, process.env.JWT_SECRET as string, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  } as jwt.SignOptions);
};

const shouldUseDevAuthFallback = isDevAuthFallbackEnabled;

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveStoredRole = async (role: unknown): Promise<unknown> => {
  if (!role) return role;

  if (typeof role === 'string') {
    const value = role.trim();
    if (!value) return value;

    if (mongoose.Types.ObjectId.isValid(value)) {
      const roleById = await Role.findById(value);
      if (roleById) return roleById;
    }

    const roleByName = await Role.findOne({ name: { $regex: `^${escapeRe(value)}$`, $options: 'i' } });
    return roleByName || role;
  }

  const maybeRole = role as { name?: string };
  if (maybeRole.name) return role;

  if (mongoose.Types.ObjectId.isValid(String(role))) {
    const roleById = await Role.findById(role);
    if (roleById) return roleById;
  }

  return role;
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }

    const dbConnected = mongoose.connection.readyState === 1;
    if (!dbConnected && shouldUseDevAuthFallback()) {
      const isDefaultAdmin = (email === 'admin@welcometech.qa' || email === 'admin@welcomtech.qa') && (password === 'Admin@123#' || password === 'password123');
      if (!isDefaultAdmin) {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
        return;
      }

      const token = signToken('dev-admin-local');
      res.status(200).json({
        success: true,
        token,
        user: {
          _id: 'dev-admin-local',
          name: 'WelcomeTech Admin',
          email: 'admin@welcometech.qa',
          role: 'admin',
          permissions: ['*'],
          avatar: '',
        },
      });
      return;
    }

    const searchEmails = [email];
    if (email.endsWith('@welcomtech.qa')) {
      searchEmails.push(email.replace('@welcomtech.qa', '@welcometech.qa'));
    } else if (email.endsWith('@welcometech.qa')) {
      searchEmails.push(email.replace('@welcometech.qa', '@welcomtech.qa'));
    }

    const user = await User.findOne({ email: { $in: searchEmails } }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }
    if (!user.isActive) {
      res.status(401).json({ success: false, message: 'Account is deactivated' });
      return;
    }
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    const token = signToken(String(user._id));
    
    const resolvedRole = await resolveStoredRole(user.role);
    const roleName = typeof resolvedRole === 'string' ? resolvedRole : (resolvedRole as any)?.name;
    const permissions: string[] = getRolePermissions(resolvedRole);
    const hasFullAccess = Boolean((resolvedRole as any)?.hasFullAccess || roleName?.toLowerCase() === 'admin' || permissions.includes('*'));

    res.status(200).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: roleName,
        permissions,
        hasFullAccess,
        avatar: user.avatar,
        theme: user.theme || 'light',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    const roleName = typeof role === 'string' ? role : (role as any)?.name;
    const permissions = getRolePermissions(role);
    const hasFullAccess = Boolean((role as any)?.hasFullAccess || roleName?.toLowerCase() === 'admin' || permissions.includes('*'));
    const user = typeof (req.user as any)?.toJSON === 'function' ? (req.user as any).toJSON() : req.user;
    res.status(200).json({
      success: true,
      user: {
        ...user,
        role: roleName,
        permissions,
        hasFullAccess,
        theme: user?.theme || 'light',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, avatar, theme, phone, address } = req.body;
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (theme && ['light', 'dark'].includes(theme)) updateData.theme = theme;

    const user = await User.findByIdAndUpdate(
      req.user?._id,
      updateData,
      { new: true, runValidators: true }
    );
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const updateThemePreference = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { theme } = req.body;
    if (!theme || !['light', 'dark'].includes(theme)) {
      res.status(400).json({ success: false, message: 'Theme must be light or dark' });
      return;
    }
    if (String(req.user?._id) === 'dev-admin-local') {
      res.status(200).json({ success: true, theme });
      return;
    }
    const user = await User.findByIdAndUpdate(
      req.user?._id,
      { theme },
      { new: true }
    );
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.status(200).json({ success: true, theme: user?.theme });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user?._id).select('+password');
    if (!user || !(await user.comparePassword(currentPassword))) {
      res.status(401).json({ success: false, message: 'Current password is incorrect' });
      return;
    }
    user.password = newPassword;
    await user.save();
    res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const registerFCMToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, message: 'Valid token is required' });
      return;
    }

    if (req.user?._id && String(req.user._id) !== 'dev-admin-local') {
      await User.findByIdAndUpdate(req.user._id, {
        $addToSet: { fcmTokens: token.trim() },
      });
    }

    res.status(200).json({ success: true, message: 'FCM token registered successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error registering FCM token' });
  }
};

export const removeFCMToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, message: 'Valid token is required' });
      return;
    }

    if (req.user?._id && String(req.user._id) !== 'dev-admin-local') {
      await User.findByIdAndUpdate(req.user._id, {
        $pull: { fcmTokens: token.trim() },
      });
    }

    res.status(200).json({ success: true, message: 'FCM token removed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error removing FCM token' });
  }
};


