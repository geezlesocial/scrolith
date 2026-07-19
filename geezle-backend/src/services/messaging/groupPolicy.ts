/**
 * Phase 22.2 — group role and notification policy (pure helpers).
 */

export type MemberRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER';
export type NotificationLevel = 'ALL' | 'MENTIONS' | 'NONE';

const ROLE_RANK: Record<MemberRole, number> = {
  OWNER: 40,
  ADMIN: 30,
  MODERATOR: 20,
  MEMBER: 10
};

export const normalizeMemberRole = (value: unknown): MemberRole => {
  const v = String(value || 'MEMBER').trim().toUpperCase();
  if (v === 'OWNER' || v === 'ADMIN' || v === 'MODERATOR' || v === 'MEMBER') return v;
  return 'MEMBER';
};

export const normalizeNotificationLevel = (value: unknown): NotificationLevel => {
  const v = String(value || 'ALL').trim().toUpperCase();
  if (v === 'ALL' || v === 'MENTIONS' || v === 'NONE') return v;
  return 'ALL';
};

export const roleAtLeast = (role: MemberRole, min: MemberRole): boolean =>
  ROLE_RANK[normalizeMemberRole(role)] >= ROLE_RANK[normalizeMemberRole(min)];

/** Who may manage members / invites */
export const canManageMembers = (role: MemberRole): boolean => roleAtLeast(role, 'ADMIN');

/** Who may edit group title/avatar/description */
export const canEditGroupMeta = (role: MemberRole): boolean => roleAtLeast(role, 'ADMIN');

/** Who may promote/demote (owners only for owner transfer) */
export const canChangeRoles = (actor: MemberRole, target: MemberRole, next: MemberRole): boolean => {
  const a = normalizeMemberRole(actor);
  const t = normalizeMemberRole(target);
  const n = normalizeMemberRole(next);
  if (a === 'OWNER') return n !== 'OWNER' || t === 'OWNER'; // owner can set any except creating second owner without transfer
  if (a === 'ADMIN') return t === 'MEMBER' || t === 'MODERATOR' ? n === 'MEMBER' || n === 'MODERATOR' : false;
  return false;
};

export const canRemoveMember = (actor: MemberRole, target: MemberRole): boolean => {
  const a = normalizeMemberRole(actor);
  const t = normalizeMemberRole(target);
  if (t === 'OWNER') return false;
  if (a === 'OWNER') return true;
  if (a === 'ADMIN') return t === 'MEMBER' || t === 'MODERATOR';
  return false;
};

/**
 * Should this receiver get a push/in-app for a group message?
 * Precedence: isMuted forces suppress unless mention bypass;
 * then notifications level: NONE < MENTIONS < ALL.
 */
export const shouldNotifyGroupReceiver = (params: {
  isMuted: boolean;
  notifications: NotificationLevel;
  isMentioned: boolean;
  isSender: boolean;
}): boolean => {
  if (params.isSender) return false;
  const level = normalizeNotificationLevel(params.notifications);
  if (params.isMuted) {
    // Mention bypass only when muted but mentioned (22.2)
    return Boolean(params.isMentioned);
  }
  if (level === 'NONE') return false;
  if (level === 'MENTIONS') return Boolean(params.isMentioned);
  return true; // ALL
};

/** Extract @username tokens from message text (without @). */
export const extractMentionUsernames = (text: string): string[] => {
  const raw = String(text || '');
  const matches = raw.match(/@([a-zA-Z0-9._-]{2,40})/g) || [];
  const names = matches.map((m) => m.slice(1).toLowerCase());
  return Array.from(new Set(names));
};

export const generateInviteCode = (): string => {
  const rand =
    typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function'
      ? (crypto as any).randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `g${rand.slice(0, 16)}`;
};

export const GROUP_POLICY_VERSION = '22.2';
