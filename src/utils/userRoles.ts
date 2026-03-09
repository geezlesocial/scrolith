import type { UserRole } from '../types';

export const USER_ROLES: Record<'GUEST' | 'FREELANCER' | 'EMPLOYER' | 'ADMIN' | 'MODERATOR', UserRole> = {
  GUEST: 'guest',
  FREELANCER: 'freelancer',
  EMPLOYER: 'employer',
  ADMIN: 'admin',
  MODERATOR: 'moderator'
};
