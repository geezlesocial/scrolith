/**
 * Phase 29.1 — Enterprise Messaging Groups permission engine (pure).
 * Role ranks remain OWNER / ADMIN / MODERATOR / MEMBER (Phase 22.2).
 * Profile overlays: guest | readOnly | bot | coOwner.
 */

import type { MemberRole } from './groupPolicy';
import { normalizeMemberRole } from './groupPolicy';

export type MessagingMode =
  | 'EVERYONE'
  | 'ADMINS_ONLY'
  | 'MODS_PLUS'
  | 'ANNOUNCEMENT'
  | 'READ_ONLY'
  | 'LOCKED';

export type ProfileKey = 'guest' | 'readOnly' | 'bot' | 'coOwner' | null | undefined;

export type PermissionKey =
  | 'canSend'
  | 'canReply'
  | 'canUploadFiles'
  | 'canUploadImages'
  | 'canUploadVideo'
  | 'canUploadAudio'
  | 'canUploadDocuments'
  | 'canPin'
  | 'canDeleteOwn'
  | 'canDeleteOthers'
  | 'canMentionEveryone'
  | 'canCreatePoll'
  | 'canInvite'
  | 'canKick'
  | 'canBan'
  | 'canApproveJoin'
  | 'canEditGroup'
  | 'canChangePhoto'
  | 'canChangeBanner'
  | 'canChangeDescription'
  | 'canExportChat'
  | 'canViewMembers'
  | 'canViewAnalytics'
  | 'canCreateEvents'
  | 'canCreateThreads'
  | 'canScheduleMessages';

export type PermissionMap = Record<PermissionKey, boolean>;

const ALL_KEYS: PermissionKey[] = [
  'canSend',
  'canReply',
  'canUploadFiles',
  'canUploadImages',
  'canUploadVideo',
  'canUploadAudio',
  'canUploadDocuments',
  'canPin',
  'canDeleteOwn',
  'canDeleteOthers',
  'canMentionEveryone',
  'canCreatePoll',
  'canInvite',
  'canKick',
  'canBan',
  'canApproveJoin',
  'canEditGroup',
  'canChangePhoto',
  'canChangeBanner',
  'canChangeDescription',
  'canExportChat',
  'canViewMembers',
  'canViewAnalytics',
  'canCreateEvents',
  'canCreateThreads',
  'canScheduleMessages'
];

const denyAll = (): PermissionMap =>
  ALL_KEYS.reduce((acc, k) => {
    acc[k] = false;
    return acc;
  }, {} as PermissionMap);

const ROLE_DEFAULTS: Record<MemberRole, PermissionMap> = {
  OWNER: {
    canSend: true,
    canReply: true,
    canUploadFiles: true,
    canUploadImages: true,
    canUploadVideo: true,
    canUploadAudio: true,
    canUploadDocuments: true,
    canPin: true,
    canDeleteOwn: true,
    canDeleteOthers: true,
    canMentionEveryone: true,
    canCreatePoll: true,
    canInvite: true,
    canKick: true,
    canBan: true,
    canApproveJoin: true,
    canEditGroup: true,
    canChangePhoto: true,
    canChangeBanner: true,
    canChangeDescription: true,
    canExportChat: true,
    canViewMembers: true,
    canViewAnalytics: true,
    canCreateEvents: true,
    canCreateThreads: true,
    canScheduleMessages: true
  },
  ADMIN: {
    canSend: true,
    canReply: true,
    canUploadFiles: true,
    canUploadImages: true,
    canUploadVideo: true,
    canUploadAudio: true,
    canUploadDocuments: true,
    canPin: true,
    canDeleteOwn: true,
    canDeleteOthers: true,
    canMentionEveryone: true,
    canCreatePoll: true,
    canInvite: true,
    canKick: true,
    canBan: true,
    canApproveJoin: true,
    canEditGroup: true,
    canChangePhoto: true,
    canChangeBanner: true,
    canChangeDescription: true,
    canExportChat: true,
    canViewMembers: true,
    canViewAnalytics: true,
    canCreateEvents: true,
    canCreateThreads: true,
    canScheduleMessages: true
  },
  MODERATOR: {
    canSend: true,
    canReply: true,
    canUploadFiles: true,
    canUploadImages: true,
    canUploadVideo: true,
    canUploadAudio: true,
    canUploadDocuments: true,
    canPin: true,
    canDeleteOwn: true,
    canDeleteOthers: true,
    canMentionEveryone: false,
    canCreatePoll: true,
    canInvite: false,
    canKick: false,
    canBan: false,
    canApproveJoin: true,
    canEditGroup: false,
    canChangePhoto: false,
    canChangeBanner: false,
    canChangeDescription: false,
    canExportChat: false,
    canViewMembers: true,
    canViewAnalytics: false,
    canCreateEvents: true,
    canCreateThreads: true,
    canScheduleMessages: false
  },
  MEMBER: {
    canSend: true,
    canReply: true,
    canUploadFiles: true,
    canUploadImages: true,
    canUploadVideo: true,
    canUploadAudio: true,
    canUploadDocuments: true,
    canPin: false,
    canDeleteOwn: true,
    canDeleteOthers: false,
    canMentionEveryone: false,
    canCreatePoll: true,
    canInvite: false,
    canKick: false,
    canBan: false,
    canApproveJoin: false,
    canEditGroup: false,
    canChangePhoto: false,
    canChangeBanner: false,
    canChangeDescription: false,
    canExportChat: false,
    canViewMembers: true,
    canViewAnalytics: false,
    canCreateEvents: true,
    canCreateThreads: true,
    canScheduleMessages: false
  }
};

const PROFILE_OVERLAYS: Record<string, Partial<PermissionMap>> = {
  guest: {
    canSend: false,
    canReply: true,
    canUploadFiles: false,
    canUploadImages: false,
    canUploadVideo: false,
    canUploadAudio: false,
    canUploadDocuments: false,
    canCreatePoll: false,
    canCreateEvents: false,
    canCreateThreads: false,
    canViewMembers: false
  },
  readOnly: {
    canSend: false,
    canReply: false,
    canUploadFiles: false,
    canUploadImages: false,
    canUploadVideo: false,
    canUploadAudio: false,
    canUploadDocuments: false,
    canDeleteOwn: false,
    canCreatePoll: false,
    canCreateEvents: false,
    canCreateThreads: false
  },
  bot: {
    canInvite: false,
    canKick: false,
    canBan: false,
    canEditGroup: false,
    canApproveJoin: false,
    canExportChat: false
  },
  coOwner: {
    // coOwner uses ADMIN role + full admin matrix (no extra needed if already ADMIN)
  }
};

export const normalizeMessagingMode = (value: unknown): MessagingMode => {
  const v = String(value || 'EVERYONE').trim().toUpperCase();
  if (
    v === 'EVERYONE' ||
    v === 'ADMINS_ONLY' ||
    v === 'MODS_PLUS' ||
    v === 'ANNOUNCEMENT' ||
    v === 'READ_ONLY' ||
    v === 'LOCKED'
  ) {
    return v;
  }
  return 'EVERYONE';
};

export const normalizeProfileKey = (value: unknown): ProfileKey => {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'guest' || v === 'readonly' || v === 'read_only') return v === 'guest' ? 'guest' : 'readOnly';
  if (v === 'bot') return 'bot';
  if (v === 'coowner' || v === 'co_owner') return 'coOwner';
  return null;
};

const mergeMaps = (base: PermissionMap, patch?: Partial<PermissionMap> | null): PermissionMap => {
  if (!patch || typeof patch !== 'object') return { ...base };
  const next = { ...base };
  for (const key of ALL_KEYS) {
    if (typeof (patch as any)[key] === 'boolean') {
      next[key] = Boolean((patch as any)[key]);
    }
  }
  return next;
};

const pickRoleOverrides = (
  role: MemberRole,
  conversationOverrides?: Record<string, Partial<PermissionMap>> | null
): Partial<PermissionMap> | null => {
  if (!conversationOverrides || typeof conversationOverrides !== 'object') return null;
  return (
    conversationOverrides[role] ||
    conversationOverrides[role.toLowerCase()] ||
    conversationOverrides[String(role).toUpperCase()] ||
    null
  );
};

/**
 * Compute effective permissions for a member (ignores messagingMode — apply separately).
 */
export const computeEffectivePermissions = (input: {
  role: MemberRole | string;
  profileKey?: ProfileKey;
  conversationOverrides?: Record<string, Partial<PermissionMap>> | null;
  participantOverrides?: Partial<PermissionMap> | null;
}): PermissionMap => {
  const role = normalizeMemberRole(input.role);
  let map = { ...ROLE_DEFAULTS[role] };
  const profile = normalizeProfileKey(input.profileKey);
  if (profile && PROFILE_OVERLAYS[profile]) {
    map = mergeMaps(map, PROFILE_OVERLAYS[profile]);
  }
  map = mergeMaps(map, pickRoleOverrides(role, input.conversationOverrides || null));
  map = mergeMaps(map, input.participantOverrides || null);
  return map;
};

export const hasPermission = (
  perms: PermissionMap,
  key: PermissionKey
): boolean => Boolean(perms[key]);

/**
 * Messaging mode may suppress send/reply even if matrix allows.
 */
export const modeAllowsSend = (mode: MessagingMode | string, role: MemberRole | string): boolean => {
  const m = normalizeMessagingMode(mode);
  const r = normalizeMemberRole(role);
  if (m === 'LOCKED') return false;
  if (m === 'READ_ONLY') return r === 'OWNER';
  if (m === 'ADMINS_ONLY' || m === 'ANNOUNCEMENT') return r === 'OWNER' || r === 'ADMIN';
  if (m === 'MODS_PLUS') return r === 'OWNER' || r === 'ADMIN' || r === 'MODERATOR';
  return true; // EVERYONE
};

export const canSendWithMode = (input: {
  role: MemberRole | string;
  profileKey?: ProfileKey;
  messagingMode: MessagingMode | string;
  conversationOverrides?: Record<string, Partial<PermissionMap>> | null;
  participantOverrides?: Partial<PermissionMap> | null;
}): { allowed: boolean; reason: string; permissions: PermissionMap } => {
  const role = normalizeMemberRole(input.role);
  const permissions = computeEffectivePermissions(input);
  if (!modeAllowsSend(input.messagingMode, role)) {
    return {
      allowed: false,
      reason: `messaging_mode_${normalizeMessagingMode(input.messagingMode).toLowerCase()}`,
      permissions
    };
  }
  if (!permissions.canSend) {
    return { allowed: false, reason: 'permission_can_send', permissions };
  }
  return { allowed: true, reason: 'allowed', permissions };
};

export const PERMISSION_ENGINE_VERSION = '29.1';
export const PERMISSION_KEYS = ALL_KEYS;
export const defaultPermissionsForRole = (role: MemberRole | string): PermissionMap => ({
  ...ROLE_DEFAULTS[normalizeMemberRole(role)]
});
export { denyAll, ALL_KEYS as ALL_PERMISSION_KEYS };
