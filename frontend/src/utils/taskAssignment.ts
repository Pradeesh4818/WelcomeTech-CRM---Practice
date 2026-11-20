import { User } from '../types';

export const openTaskCountLabel = (user: Pick<User, 'name' | 'openTaskCount'>): string =>
  `${user.name} (${user.openTaskCount ?? 0})`;
