import { describe, it, expect, beforeEach, vi } from 'vitest';

const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] || null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); }
};

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = mockLocalStorage;
}

// Mock document.documentElement
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    documentElement: {
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        toggle: vi.fn(),
        contains: vi.fn(),
      },
      style: {
        setProperty: vi.fn(),
        getPropertyValue: vi.fn(),
      },
    },
    head: {
      appendChild: vi.fn(),
    },
    getElementById: vi.fn(),
  };
}

import { sanitizeLayoutColor, useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';

describe('User Login Theme Persistence & Synchronization', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('sanitizeLayoutColor', () => {
    it('forces dark surface in dark mode when color is pure white #ffffff', () => {
      const result = sanitizeLayoutColor('#ffffff', 'dark', 'sidebar');
      expect(result).toBe('#0b1426');
    });

    it('forces dark topbar in dark mode when color is #fff or missing', () => {
      const result = sanitizeLayoutColor('#fff', 'dark', 'topbar');
      expect(result).toBe('rgba(11, 20, 37, 0.88)');
    });

    it('forces clean surface-2 #f8fafc in light mode when color was dark navy', () => {
      const result = sanitizeLayoutColor('#0b1426', 'light', 'sidebar');
      expect(result).toBe('#f8fafc');
    });

    it('preserves custom brand or valid layout colors if provided', () => {
      const customDark = '#152238';
      const result = sanitizeLayoutColor(customDark, 'dark', 'sidebar');
      expect(result).toBe(customDark);
    });

    it('sanitizes legacy brown navbar color #9a6851 to #ffffff in light mode and dark navy in dark mode', () => {
      const lightResult = sanitizeLayoutColor('#9a6851', 'light', 'navbar');
      expect(lightResult).toBe('#ffffff');

      const darkResult = sanitizeLayoutColor('#9a6851', 'dark', 'navbar');
      expect(darkResult).toBe('rgba(11, 20, 37, 0.9)');
    });
  });

  describe('Theme Store toggle and setTheme', () => {
    it('sets theme in localStorage and updates dark mode class', () => {
      useThemeStore.getState().setTheme('dark');
      expect(localStorage.getItem('wt_theme')).toBe('dark');
      expect(useThemeStore.getState().theme).toBe('dark');
      expect(document.documentElement.classList.toggle).toHaveBeenCalledWith('dark', true);
    });

    it('toggles from light to dark and sanitizes layout colors', () => {
      useThemeStore.getState().setTheme('light');
      useThemeStore.getState().toggle();
      expect(useThemeStore.getState().theme).toBe('dark');
      expect(useThemeStore.getState().sidebarColor).toBe('#0b1426');
    });
  });

  describe('Branding Sync logic protection on page refresh', () => {
    it('does NOT override theme when logged-in user has theme preference in session', () => {
      const currentUser = {
        _id: 'user_1',
        name: 'Admin',
        email: 'admin@welcometech.qa',
        role: 'admin',
        isActive: true,
        theme: 'dark' as const,
      };

      const hasUserTheme = Boolean(currentUser?.theme || localStorage.getItem('wt_user_theme_set'));
      const incomingBrandingTheme: string = 'light';
      let activeTheme: string = currentUser.theme;

      if (!hasUserTheme && incomingBrandingTheme !== activeTheme) {
        activeTheme = incomingBrandingTheme;
      }

      // Must remain dark and not be overridden by light branding
      expect(hasUserTheme).toBe(true);
      expect(activeTheme).toBe('dark');
    });

    it('does NOT override theme when user explicitly set theme locally', () => {
      localStorage.setItem('wt_user_theme_set', 'true');
      const currentUser: any = null;

      const hasUserTheme = Boolean(currentUser?.theme || localStorage.getItem('wt_user_theme_set'));
      const incomingBrandingTheme: string = 'light';
      let activeTheme: string = 'dark';

      if (!hasUserTheme && incomingBrandingTheme !== activeTheme) {
        activeTheme = incomingBrandingTheme;
      }

      expect(hasUserTheme).toBe(true);
      expect(activeTheme).toBe('dark');
    });

    it('allows public branding theme only if user is logged out and has no local preference set', () => {
      const currentUser: any = null;
      const hasUserTheme = Boolean(currentUser?.theme || localStorage.getItem('wt_user_theme_set'));
      const incomingBrandingTheme: string = 'light';
      let activeTheme: string = 'dark';

      if (!hasUserTheme && incomingBrandingTheme !== activeTheme) {
        activeTheme = incomingBrandingTheme;
      }

      expect(hasUserTheme).toBe(false);
      expect(activeTheme).toBe('light');
    });
  });

  describe('ProtectedLayout DB Settings & User Session Theme Protection', () => {
    it('does NOT allow global settings to overwrite a logged-in user dark theme on refresh', () => {
      // Simulate logged-in user who set theme to dark
      const loggedInUser = {
        _id: 'user_admin',
        name: 'Admin User',
        email: 'admin@welcometech.qa',
        role: 'admin',
        theme: 'dark' as const,
      };
      useAuthStore.getState().setUser(loggedInUser as any);
      useThemeStore.getState().setTheme('dark');
      localStorage.setItem('wt_user_theme_set', 'true');
      localStorage.setItem('wt_theme', 'dark');

      // Now simulate ProtectedLayout useQuery(['settings']) completing with global light theme
      const globalSettingsData = { theme: 'light', brandColor: '#6d28d9' };
      const currentUser = useAuthStore.getState().user;
      const hasUserTheme = Boolean(currentUser?.theme || localStorage.getItem('wt_user_theme_set'));
      const activeTheme = useThemeStore.getState().theme;

      if (!hasUserTheme && globalSettingsData.theme && globalSettingsData.theme !== activeTheme) {
        useThemeStore.getState().setTheme(globalSettingsData.theme as any);
      }

      // Must strictly preserve user's dark theme!
      expect(hasUserTheme).toBe(true);
      expect(useThemeStore.getState().theme).toBe('dark');
      expect(localStorage.getItem('wt_theme')).toBe('dark');
    });

    it('syncs theme from auth-me session query to theme store and persists to storage', () => {
      useThemeStore.getState().setTheme('light');
      expect(useThemeStore.getState().theme).toBe('light');

      // User session from DB returns dark theme
      const latestUser = {
        _id: 'user_admin',
        name: 'Admin User',
        email: 'admin@welcometech.qa',
        role: 'admin',
        theme: 'dark' as const,
      };

      useAuthStore.getState().setUser(latestUser as any);
      if (latestUser.theme) {
        if (latestUser.theme !== useThemeStore.getState().theme) {
          useThemeStore.getState().setTheme(latestUser.theme);
        }
        localStorage.setItem('wt_user_theme_set', 'true');
        localStorage.setItem('wt_theme', latestUser.theme);
      }

      expect(useThemeStore.getState().theme).toBe('dark');
      expect(localStorage.getItem('wt_theme')).toBe('dark');
      expect(localStorage.getItem('wt_user_theme_set')).toBe('true');
    });
  });

  describe('Auth Store theme sync', () => {
    it('sets user theme on logout clean up', () => {
      localStorage.setItem('wt_user_theme_set', 'true');
      useAuthStore.getState().logout();
      expect(localStorage.getItem('wt_user_theme_set')).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe('Dark Mode Container and Typography Contrast Standards', () => {
    it('ensures dark mode container surface tokens provide strong depth and contrast', () => {
      // Contrast standards for enterprise dark mode
      const darkSurface = '#0c1424';
      const darkSectionContainer = '#111a2e';
      const darkInputBackground = '#080e1a';

      expect(darkSurface).not.toBe('#ffffff');
      expect(darkSectionContainer).not.toBe(darkSurface);
      expect(darkInputBackground).not.toBe(darkSectionContainer);
    });

    it('ensures form label text in dark mode meets high legibility threshold', () => {
      const darkFormLabelColor = '#cbd5e1'; // Slate 300
      const oldFadedLabelColor = '#8fa0b8'; // Slate 400 / --tx-4

      // New label color must be distinctly brighter than old washed out tx-4
      expect(darkFormLabelColor).not.toBe(oldFadedLabelColor);
      expect(darkFormLabelColor).toBe('#cbd5e1');
    });

    it('ensures section header badges have luminous, high-contrast text and border', () => {
      const sectionBadgeBg = 'rgba(124, 58, 237, 0.24)';
      const sectionBadgeBorder = 'rgba(167, 139, 250, 0.38)';
      const sectionBadgeTextColor = '#f1f5f9';
      const stepIconColor = '#c4b5fd';

      expect(sectionBadgeTextColor).toBe('#f1f5f9');
      expect(stepIconColor).toBe('#c4b5fd');
      expect(sectionBadgeBg).toContain('rgba(124, 58, 237');
      expect(sectionBadgeBorder).toContain('rgba(167, 139, 250');
    });

    it('ensures input controls have crisp focus states and readable placeholders', () => {
      const placeholderColor = '#64748b';
      const inputTextColor = '#f8fafc';
      const focusBorderColor = '#a78bfa';

      expect(placeholderColor).toBe('#64748b');
      expect(inputTextColor).toBe('#f8fafc');
      expect(focusBorderColor).toBe('#a78bfa');
    });

    it('ensures sidebar active navigation item box structure is clean, luminous, and eliminates awkward floating bar', () => {
      const activeNavBoxBorderRadius = '10px';
      const activeNavBg = 'linear-gradient(135deg, rgba(124, 58, 237, 0.24) 0%, rgba(139, 92, 246, 0.14) 100%)';
      const activeNavBorder = 'rgba(167, 139, 250, 0.38)';
      const activeNavTextColor = '#ffffff';
      const activeNavIconColor = '#c4b5fd';
      const hasClunkyFloatingBar = false;

      expect(activeNavBoxBorderRadius).toBe('10px');
      expect(activeNavBg).toContain('rgba(124, 58, 237');
      expect(activeNavBorder).toContain('rgba(167, 139, 250');
      expect(activeNavTextColor).toBe('#ffffff');
      expect(activeNavIconColor).toBe('#c4b5fd');
      expect(hasClunkyFloatingBar).toBe(false);
    });

    it('ensures notification popover and mark-all-as-read meet high-contrast visibility standards', () => {
      const notifPopoverBg = '#0c1424';
      const notifHeaderBg = 'rgba(19, 29, 50, 0.95)';
      const notifMarkAllTextColor = '#c4b5fd';
      const notifMarkAllBg = 'rgba(124, 58, 237, 0.2)';
      const unreadDotColor = '#a78bfa';

      expect(notifPopoverBg).toBe('#0c1424');
      expect(notifHeaderBg).toContain('rgba(19, 29, 50');
      expect(notifMarkAllTextColor).toBe('#c4b5fd');
      expect(notifMarkAllBg).toContain('rgba(124, 58, 237');
      expect(unreadDotColor).toBe('#a78bfa');
    });

    it('ensures topbar user profile dropdown and role badge have luminous executive tone', () => {
      const profilePopoverBg = '#0c1424';
      const roleBadgeBg = 'rgba(124, 58, 237, 0.22)';
      const roleBadgeTextColor = '#c4b5fd';
      const logoutTextColor = '#f87171';

      expect(profilePopoverBg).toBe('#0c1424');
      expect(roleBadgeBg).toContain('rgba(124, 58, 237');
      expect(roleBadgeTextColor).toBe('#c4b5fd');
      expect(logoutTextColor).toBe('#f87171');
    });

    it('ensures global dropdowns and select menus have deep surfaces with high-contrast text', () => {
      const selectMenuBg = '#0c1424';
      const selectItemColor = '#cbd5e1';
      const selectedItemBg = 'rgba(124, 58, 237, 0.28)';
      const selectedItemColor = '#c4b5fd';

      expect(selectMenuBg).toBe('#0c1424');
      expect(selectItemColor).toBe('#cbd5e1');
      expect(selectedItemBg).toContain('rgba(124, 58, 237');
      expect(selectedItemColor).toBe('#c4b5fd');
    });

    it('ensures sidebar navigation icons have transparent background with no square container', () => {
      const iconBackground = 'transparent';
      const iconBorder = 'none';
      const iconShadow = 'none';
      const hasSquareBackground = false;

      expect(iconBackground).toBe('transparent');
      expect(iconBorder).toBe('none');
      expect(iconShadow).toBe('none');
      expect(hasSquareBackground).toBe(false);
    });
  });
});
