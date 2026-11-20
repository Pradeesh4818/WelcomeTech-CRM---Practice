const appScope = import.meta.env.VITE_APP_SCOPE || 'live';

export const STORAGE_KEYS = {
  token: `wt_token_${appScope}`,
  user: `wt_user_${appScope}`,
  sidebarOpen: `sidebar_open_${appScope}`,
} as const;
