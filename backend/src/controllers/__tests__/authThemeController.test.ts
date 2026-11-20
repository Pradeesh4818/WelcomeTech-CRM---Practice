import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateThemePreference, getMe } from '../authController';
import User from '../../models/User';

vi.mock('../../models/User', () => ({
  default: {
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
  },
}));

describe('authThemeController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateThemePreference', () => {
    it('rejects invalid theme values', async () => {
      const req: any = {
        user: { _id: 'user123' },
        body: { theme: 'neon' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await updateThemePreference(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Theme must be light or dark' })
      );
    });

    it('rejects empty or missing theme', async () => {
      const req: any = {
        user: { _id: 'user123' },
        body: {},
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await updateThemePreference(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('successfully updates and persists theme to dark mode in database', async () => {
      vi.mocked(User.findByIdAndUpdate).mockResolvedValue({
        _id: 'user123',
        name: 'Admin User',
        theme: 'dark',
      } as any);

      const req: any = {
        user: { _id: 'user123' },
        body: { theme: 'dark' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await updateThemePreference(req, res);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user123', { theme: 'dark' }, { new: true });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, theme: 'dark' });
    });

    it('successfully updates and persists theme to light mode in database', async () => {
      vi.mocked(User.findByIdAndUpdate).mockResolvedValue({
        _id: 'user123',
        name: 'Admin User',
        theme: 'light',
      } as any);

      const req: any = {
        user: { _id: 'user123' },
        body: { theme: 'light' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await updateThemePreference(req, res);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user123', { theme: 'light' }, { new: true });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, theme: 'light' });
    });
  });

  describe('getMe', () => {
    it('returns saved user theme preference from session user', async () => {
      const req: any = {
        user: {
          _id: 'user123',
          name: 'WelcomeTech Admin',
          email: 'admin@welcometech.qa',
          role: 'admin',
          theme: 'dark',
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getMe(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          user: expect.objectContaining({
            theme: 'dark',
          }),
        })
      );
    });

    it('defaults theme to light if user has no saved theme', async () => {
      const req: any = {
        user: {
          _id: 'user123',
          name: 'Employee',
          email: 'emp@welcometech.qa',
          role: 'engineer',
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getMe(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          user: expect.objectContaining({
            theme: 'light',
          }),
        })
      );
    });
  });
});
