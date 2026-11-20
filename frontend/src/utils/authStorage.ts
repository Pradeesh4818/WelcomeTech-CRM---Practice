import { STORAGE_KEYS } from './storageKeys';

// "Remember me" persists auth in localStorage (survives browser restarts);
// otherwise it lives in sessionStorage and is cleared when the tab closes.
// All readers check both so the token is found regardless of which was used.

const safeLocal = {
  getItem: (k: string) => {
    try { return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null; } catch { return null; }
  },
  setItem: (k: string, v: string) => {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); } catch {}
  },
  removeItem: (k: string) => {
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); } catch {}
  },
};

const safeSession = {
  getItem: (k: string) => {
    try { return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(k) : null; } catch { return null; }
  },
  setItem: (k: string, v: string) => {
    try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(k, v); } catch {}
  },
  removeItem: (k: string) => {
    try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(k); } catch {}
  },
};

export const getStoredToken = (): string | null =>
  safeLocal.getItem(STORAGE_KEYS.token) || safeSession.getItem(STORAGE_KEYS.token);

export const getStoredUser = (): string | null =>
  safeLocal.getItem(STORAGE_KEYS.user) || safeSession.getItem(STORAGE_KEYS.user);

export const setStoredAuth = (token: string, user: string, remember: boolean = true): void => {
  safeLocal.setItem(STORAGE_KEYS.token, token);
  safeLocal.setItem(STORAGE_KEYS.user, user);
  safeSession.setItem(STORAGE_KEYS.token, token);
  safeSession.setItem(STORAGE_KEYS.user, user);
};

export const setStoredUser = (user: string): void => {
  if (safeLocal.getItem(STORAGE_KEYS.token)) safeLocal.setItem(STORAGE_KEYS.user, user);
  else safeSession.setItem(STORAGE_KEYS.user, user);
};

export const clearStoredAuth = (): void => {
  safeLocal.removeItem(STORAGE_KEYS.token);
  safeLocal.removeItem(STORAGE_KEYS.user);
  safeSession.removeItem(STORAGE_KEYS.token);
  safeSession.removeItem(STORAGE_KEYS.user);
};
