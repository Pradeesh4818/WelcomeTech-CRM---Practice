import { create } from 'zustand';
import { User } from '../types';
import api from '../utils/api';
import { clearStoredAuth, getStoredToken, getStoredUser, setStoredAuth, setStoredUser } from '../utils/authStorage';
import { unregisterFCMToken } from '../utils/fcmClient';
import { useThemeStore } from './themeStore';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: (() => {
    try { return JSON.parse(getStoredUser() || 'null'); } catch { return null; }
  })(),
  token: getStoredToken(),
  isAuthenticated: !!getStoredToken(),
  isLoading: false,

  login: async (email, password, rememberMe = true) => {
    set({ isLoading: true });
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data } = await api.post('/auth/login', { email: normalizedEmail, password });

      // Support both payload styles:
      // 1) { token, user }
      // 2) { success: true, data: { token, user } }
      const authPayload = data?.data?.token ? data.data : data;
      const token = authPayload?.token;
      const user = authPayload?.user as User | undefined;

      if (!token || !user) {
        throw new Error('Invalid login response received from server');
      }

      setStoredAuth(token, JSON.stringify(user), rememberMe);
      if (user.theme) {
        useThemeStore.getState().setTheme(user.theme);
        localStorage.setItem('wt_user_theme_set', 'true');
      }
      set({ user, token, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    void unregisterFCMToken();
    clearStoredAuth();
    try {
      localStorage.removeItem('wt_user_theme_set');
    } catch {}
    set({ user: null, token: null, isAuthenticated: false });
  },


  setUser: (user) => {
    setStoredUser(JSON.stringify(user));
    set({ user });
  },
}));
