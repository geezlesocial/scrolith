import type { User } from '../types';
import { resolveUserAvatarUrl } from '../utils/userAvatar';

const STORAGE_KEY = 'scrolith:remembered-profiles:v1';
const MAX_PROFILES = 3;
const FEATURE_ENV = String(import.meta.env.VITE_RETAINED_PROFILE_SWITCHER || '').toLowerCase();

export type RememberedProfile = {
  version: 1;
  userId: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  role?: string;
  lastUsedAt: string;
};

export const retainedProfileSwitcherEnabled = () => FEATURE_ENV !== 'false' && FEATURE_ENV !== '0';

const read = (): RememberedProfile[] => {
  if (typeof window === 'undefined' || !retainedProfileSwitcherEnabled()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry === 'object' && String(entry.userId || '').trim())
      .map((entry) => ({
        version: 1 as const,
        userId: String(entry.userId).trim(),
        displayName: String(entry.displayName || 'Scrolith member').trim().slice(0, 120),
        username: String(entry.username || '').trim().slice(0, 80) || undefined,
        avatarUrl: String(entry.avatarUrl || '').trim().slice(0, 1000) || undefined,
        role: String(entry.role || '').trim().slice(0, 40) || undefined,
        lastUsedAt: String(entry.lastUsedAt || '').trim() || new Date(0).toISOString()
      }))
      .slice(0, MAX_PROFILES);
  } catch {
    return [];
  }
};

const write = (profiles: RememberedProfile[]) => {
  if (typeof window === 'undefined' || !retainedProfileSwitcherEnabled()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles.slice(0, MAX_PROFILES)));
    window.dispatchEvent(new CustomEvent('scrolith:remembered-profiles-changed'));
  } catch {
    // Private browsing/storage quotas must never affect authentication.
  }
};

export const getRememberedProfiles = () => read();

export const rememberAuthenticatedProfile = (user?: Partial<User> | null) => {
  const userId = String(user?.id || '').trim();
  if (!userId || !retainedProfileSwitcherEnabled()) return;
  const profile: RememberedProfile = {
    version: 1,
    userId,
    displayName: String(user?.name || user?.username || 'Scrolith member').trim().slice(0, 120),
    username: String(user?.username || '').trim().slice(0, 80) || undefined,
    avatarUrl: resolveUserAvatarUrl(user) || undefined,
    role: String(user?.role || '').trim().slice(0, 40) || undefined,
    lastUsedAt: new Date().toISOString()
  };
  const next = [profile, ...read().filter((entry) => entry.userId !== userId)];
  write(next);
};

export const removeRememberedProfile = (userId: string) => {
  const normalized = String(userId || '').trim();
  if (!normalized) return;
  write(read().filter((entry) => entry.userId !== normalized));
};

export const clearRememberedProfiles = () => write([]);

export const initialsForRememberedProfile = (profile: Pick<RememberedProfile, 'displayName'>) =>
  profile.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'S';
