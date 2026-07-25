/**
 * Enterprise messenger voice / conference call authorization.
 * Platform admin config always wins; group policyJson.callPolicy extends without schema break.
 */

export type GroupCallRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER' | 'NONE';

export type CallStartScope =
  | 'OWNER_ONLY'
  | 'OWNERS_ADMINS'
  | 'OWNERS_ADMINS_MODS'
  | 'ALL_MEMBERS'
  | 'NOBODY';

export type CallJoinScope =
  | 'INVITED_ONLY'
  | 'OWNERS_ADMINS'
  | 'OWNERS_ADMINS_MODS'
  | 'ALL_MEMBERS';

export type CallInviteScope =
  | 'OWNER_ONLY'
  | 'OWNERS_ADMINS'
  | 'OWNERS_ADMINS_MODS'
  | 'CALL_PARTICIPANTS';

export type CallParticipationMode = 'OPEN' | 'REQUEST' | 'INVITE_ONLY' | 'ADMIN_APPROVAL';

export type GroupCallAvailability =
  | 'ENABLED'
  | 'VOICE_ONLY'
  | 'CONFERENCE_ENABLED'
  | 'DISABLED';

export type GroupCallPolicy = {
  whoCanStart: CallStartScope;
  whoCanJoin: CallJoinScope;
  whoCanInvite: CallInviteScope;
  participationMode: CallParticipationMode;
  availability: GroupCallAvailability;
  /** When false, video media is denied for this group (audio may still work). */
  allowVideo: boolean;
  /** When false, screen sharing is denied for this group. */
  allowScreenShare: boolean;
};

export type PlatformVoiceFlags = {
  enabledVoiceCalls: boolean;
  enabledConferenceCalls: boolean;
  maxParticipants: number;
  blockedUserIds: string[];
  /** Phase 1 video — defaults true when omitted (backward compatible). */
  enabledVideoCalls?: boolean;
  videoBlockedUserIds?: string[];
  enabledScreenSharing?: boolean;
  maxVideoParticipants?: number;
};

export type CallMediaMode = 'audio' | 'video';

export type CallAction =
  | 'start'
  | 'join'
  | 'invite'
  | 'accept'
  | 'reject'
  | 'leave'
  | 'end_all'
  | 'mute_self'
  | 'mute_other'
  | 'remove'
  | 'signal'
  | 'approve_join'
  | 'request_join'
  | 'screen_share'
  | 'toggle_video';

const DEFAULT_POLICY: GroupCallPolicy = {
  whoCanStart: 'ALL_MEMBERS',
  whoCanJoin: 'ALL_MEMBERS',
  whoCanInvite: 'OWNERS_ADMINS_MODS',
  participationMode: 'OPEN',
  availability: 'ENABLED',
  allowVideo: true,
  allowScreenShare: true
};

const ROLE_RANK: Record<GroupCallRole, number> = {
  NONE: 0,
  MEMBER: 1,
  MODERATOR: 2,
  ADMIN: 3,
  OWNER: 4
};

const normalizeRole = (raw: unknown): GroupCallRole => {
  const value = String(raw || '')
    .trim()
    .toUpperCase();
  if (value === 'OWNER' || value === 'CO_OWNER' || value === 'COOWNER') return 'OWNER';
  if (value === 'ADMIN' || value === 'ADMINISTRATOR') return 'ADMIN';
  if (value === 'MODERATOR' || value === 'MOD') return 'MODERATOR';
  if (value === 'MEMBER' || value === 'USER') return 'MEMBER';
  return 'NONE';
};

const normalizeStartScope = (raw: unknown): CallStartScope => {
  const v = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (['OWNER_ONLY', 'OWNER'].includes(v)) return 'OWNER_ONLY';
  if (['OWNERS_ADMINS', 'OWNER_ADMIN', 'ADMINS'].includes(v)) return 'OWNERS_ADMINS';
  if (['OWNERS_ADMINS_MODS', 'OWNERS_ADMINS_MODERATORS', 'MODS'].includes(v)) {
    return 'OWNERS_ADMINS_MODS';
  }
  if (['NOBODY', 'NONE', 'DISABLED'].includes(v)) return 'NOBODY';
  if (['ALL_MEMBERS', 'EVERYONE', 'ALL'].includes(v)) return 'ALL_MEMBERS';
  return DEFAULT_POLICY.whoCanStart;
};

const normalizeJoinScope = (raw: unknown): CallJoinScope => {
  const v = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (['INVITED_ONLY', 'INVITE_ONLY', 'INVITED'].includes(v)) return 'INVITED_ONLY';
  if (['OWNERS_ADMINS', 'OWNER_ADMIN'].includes(v)) return 'OWNERS_ADMINS';
  if (['OWNERS_ADMINS_MODS', 'OWNERS_ADMINS_MODERATORS'].includes(v)) return 'OWNERS_ADMINS_MODS';
  return 'ALL_MEMBERS';
};

const normalizeInviteScope = (raw: unknown): CallInviteScope => {
  const v = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (['OWNER_ONLY', 'OWNER'].includes(v)) return 'OWNER_ONLY';
  if (['OWNERS_ADMINS', 'OWNER_ADMIN'].includes(v)) return 'OWNERS_ADMINS';
  if (['CALL_PARTICIPANTS', 'ANY_PARTICIPANT', 'PARTICIPANTS'].includes(v)) {
    return 'CALL_PARTICIPANTS';
  }
  return 'OWNERS_ADMINS_MODS';
};

const normalizeParticipationMode = (raw: unknown): CallParticipationMode => {
  const v = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (['REQUEST', 'REQUEST_PERMISSION', 'APPROVAL'].includes(v)) return 'REQUEST';
  if (['INVITE_ONLY', 'INVITATION_REQUIRED'].includes(v)) return 'INVITE_ONLY';
  if (['ADMIN_APPROVAL', 'ADMINS_APPROVE'].includes(v)) return 'ADMIN_APPROVAL';
  return 'OPEN';
};

const normalizeAvailability = (raw: unknown): GroupCallAvailability => {
  const v = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (['DISABLED', 'OFF', 'NONE'].includes(v)) return 'DISABLED';
  if (['VOICE_ONLY', 'DIRECT_ONLY'].includes(v)) return 'VOICE_ONLY';
  if (['CONFERENCE_ENABLED', 'CONFERENCE_ONLY'].includes(v)) return 'CONFERENCE_ENABLED';
  return 'ENABLED';
};

export const roleMeetsStartScope = (role: GroupCallRole, scope: CallStartScope): boolean => {
  if (scope === 'NOBODY') return false;
  if (scope === 'ALL_MEMBERS') return ROLE_RANK[role] >= ROLE_RANK.MEMBER;
  if (scope === 'OWNERS_ADMINS_MODS') return ROLE_RANK[role] >= ROLE_RANK.MODERATOR;
  if (scope === 'OWNERS_ADMINS') return ROLE_RANK[role] >= ROLE_RANK.ADMIN;
  if (scope === 'OWNER_ONLY') return role === 'OWNER';
  return false;
};

export const roleMeetsJoinScope = (role: GroupCallRole, scope: CallJoinScope): boolean => {
  if (scope === 'ALL_MEMBERS') return ROLE_RANK[role] >= ROLE_RANK.MEMBER;
  if (scope === 'OWNERS_ADMINS_MODS') return ROLE_RANK[role] >= ROLE_RANK.MODERATOR;
  if (scope === 'OWNERS_ADMINS') return ROLE_RANK[role] >= ROLE_RANK.ADMIN;
  // INVITED_ONLY — join allowed only if already invited (checked by caller)
  return ROLE_RANK[role] >= ROLE_RANK.MEMBER;
};

export const roleMeetsInviteScope = (role: GroupCallRole, scope: CallInviteScope): boolean => {
  if (scope === 'CALL_PARTICIPANTS') return ROLE_RANK[role] >= ROLE_RANK.MEMBER;
  if (scope === 'OWNERS_ADMINS_MODS') return ROLE_RANK[role] >= ROLE_RANK.MODERATOR;
  if (scope === 'OWNERS_ADMINS') return ROLE_RANK[role] >= ROLE_RANK.ADMIN;
  if (scope === 'OWNER_ONLY') return role === 'OWNER';
  return false;
};

export const canModerateCall = (role: GroupCallRole): boolean => ROLE_RANK[role] >= ROLE_RANK.MODERATOR;

export const canEndCallForEveryone = (role: GroupCallRole, isInitiator: boolean): boolean =>
  isInitiator || ROLE_RANK[role] >= ROLE_RANK.ADMIN;

/**
 * Resolve group call policy from ConversationSettings.policyJson + allowVoice.
 * Missing keys keep backward-compatible defaults (all members, open join).
 */
export const resolveGroupCallPolicy = (input?: {
  allowVoice?: boolean | null;
  policyJson?: any;
  permissionOverrides?: any;
}): GroupCallPolicy => {
  const policyJson =
    input?.policyJson && typeof input.policyJson === 'object' ? input.policyJson : {};
  const overrides =
    input?.permissionOverrides && typeof input.permissionOverrides === 'object'
      ? input.permissionOverrides
      : {};
  const raw =
    (policyJson as any).callPolicy ||
    (policyJson as any).voiceCallPolicy ||
    (overrides as any).callPolicy ||
    {};

  const allowVideoRaw = raw.allowVideo ?? raw.videoEnabled ?? raw.enableVideo;
  const allowScreenRaw =
    raw.allowScreenShare ?? raw.allowScreenSharing ?? raw.screenShareEnabled ?? raw.enableScreenShare;

  const policy: GroupCallPolicy = {
    whoCanStart: normalizeStartScope(raw.whoCanStart ?? raw.startScope),
    whoCanJoin: normalizeJoinScope(raw.whoCanJoin ?? raw.joinScope),
    whoCanInvite: normalizeInviteScope(raw.whoCanInvite ?? raw.inviteScope),
    participationMode: normalizeParticipationMode(raw.participationMode ?? raw.joinMode),
    availability: normalizeAvailability(raw.availability ?? raw.callAvailability),
    allowVideo: allowVideoRaw === undefined || allowVideoRaw === null ? true : Boolean(allowVideoRaw),
    allowScreenShare:
      allowScreenRaw === undefined || allowScreenRaw === null ? true : Boolean(allowScreenRaw)
  };

  // Content toggle allowVoice=false disables group voice/conference calls.
  if (input?.allowVoice === false) {
    policy.availability = 'DISABLED';
  }
  return policy;
};

export const mergeCallPolicyIntoPolicyJson = (
  existingPolicyJson: any,
  callPolicyPartial: Partial<GroupCallPolicy>
): Record<string, any> => {
  const base =
    existingPolicyJson && typeof existingPolicyJson === 'object' ? { ...existingPolicyJson } : {};
  const current = resolveGroupCallPolicy({ policyJson: base });
  base.callPolicy = {
    whoCanStart: callPolicyPartial.whoCanStart || current.whoCanStart,
    whoCanJoin: callPolicyPartial.whoCanJoin || current.whoCanJoin,
    whoCanInvite: callPolicyPartial.whoCanInvite || current.whoCanInvite,
    participationMode: callPolicyPartial.participationMode || current.participationMode,
    availability: callPolicyPartial.availability || current.availability,
    allowVideo:
      callPolicyPartial.allowVideo === undefined ? current.allowVideo : Boolean(callPolicyPartial.allowVideo),
    allowScreenShare:
      callPolicyPartial.allowScreenShare === undefined
        ? current.allowScreenShare
        : Boolean(callPolicyPartial.allowScreenShare)
  };
  return base;
};

export type AuthorizeCallResult =
  | { allowed: true; role: GroupCallRole; policy: GroupCallPolicy }
  | { allowed: false; code: string; error: string; role: GroupCallRole; policy: GroupCallPolicy };

/**
 * Authorize a call action under platform + group policy.
 * Direct (1:1) conversations use MEMBER role + open defaults.
 */
export const authorizeCallAction = (params: {
  action: CallAction;
  platform: PlatformVoiceFlags;
  actorUserId: string;
  isPlatformAdmin?: boolean;
  conversationType?: string;
  memberRole?: unknown;
  memberDeletedAt?: unknown;
  groupPolicy?: GroupCallPolicy;
  isConference?: boolean;
  isInvited?: boolean;
  isInitiator?: boolean;
  participantCount?: number;
  /** True when requester has an approved join request for this call. */
  isJoinApproved?: boolean;
  /** audio (default) | video — Phase 1 media mode */
  mediaMode?: CallMediaMode;
}): AuthorizeCallResult => {
  const role = normalizeRole(params.memberRole);
  const policy = params.groupPolicy || DEFAULT_POLICY;
  const mediaMode: CallMediaMode = params.mediaMode === 'video' ? 'video' : 'audio';
  const isGroup =
    String(params.conversationType || '')
      .trim()
      .toUpperCase() === 'GROUP';

  if (params.memberDeletedAt) {
    return {
      allowed: false,
      code: 'MEMBERSHIP_REVOKED',
      error: 'You are no longer an active member of this conversation.',
      role,
      policy
    };
  }

  if (!params.isPlatformAdmin && role === 'NONE' && isGroup) {
    return {
      allowed: false,
      code: 'NOT_A_MEMBER',
      error: 'Active group membership is required for calls.',
      role,
      policy
    };
  }

  if (!params.platform.enabledVoiceCalls) {
    return {
      allowed: false,
      code: 'VOICE_CALLS_DISABLED',
      error: 'Voice calls are disabled by the platform administrator.',
      role,
      policy
    };
  }

  const blocked = Array.isArray(params.platform.blockedUserIds)
    ? params.platform.blockedUserIds.map((id) => String(id || '').trim())
    : [];
  if (blocked.includes(String(params.actorUserId || '').trim())) {
    return {
      allowed: false,
      code: 'VOICE_BLOCKED',
      error: 'Voice features are blocked for this account.',
      role,
      policy
    };
  }

  if (params.isConference && !params.platform.enabledConferenceCalls) {
    return {
      allowed: false,
      code: 'CONFERENCE_DISABLED',
      error: 'Conference calls are disabled by the platform administrator.',
      role,
      policy
    };
  }

  // Platform video gate (default enabled when flag omitted — voice-only clients unchanged).
  const videoEnabled = params.platform.enabledVideoCalls !== false;
  const screenEnabled = params.platform.enabledScreenSharing !== false;
  const videoBlocked = Array.isArray(params.platform.videoBlockedUserIds)
    ? params.platform.videoBlockedUserIds.map((id) => String(id || '').trim())
    : [];

  if ((mediaMode === 'video' || params.action === 'toggle_video') && !videoEnabled) {
    return {
      allowed: false,
      code: 'VIDEO_CALLS_DISABLED',
      error: 'Video calls are disabled by the platform administrator.',
      role,
      policy
    };
  }

  if (
    (mediaMode === 'video' || params.action === 'toggle_video' || params.action === 'screen_share') &&
    videoBlocked.includes(String(params.actorUserId || '').trim())
  ) {
    return {
      allowed: false,
      code: 'VIDEO_BLOCKED_FOR_USER',
      error: 'Video calling is disabled for this account by an administrator.',
      role,
      policy
    };
  }

  if (params.action === 'screen_share') {
    if (!videoEnabled) {
      return {
        allowed: false,
        code: 'VIDEO_CALLS_DISABLED',
        error: 'Video features are disabled; screen sharing is unavailable.',
        role,
        policy
      };
    }
    if (!screenEnabled) {
      return {
        allowed: false,
        code: 'SCREEN_SHARING_DISABLED',
        error: 'Screen sharing is disabled by the platform administrator.',
        role,
        policy
      };
    }
  }

  const max = Math.max(2, Math.min(20, Number(params.platform.maxParticipants || 20) || 20));
  if (
    typeof params.participantCount === 'number' &&
    params.participantCount > max &&
    (params.action === 'start' ||
      params.action === 'invite' ||
      params.action === 'join' ||
      params.action === 'accept')
  ) {
    return {
      allowed: false,
      code: 'MAX_PARTICIPANTS_EXCEEDED',
      error: `Maximum ${max} participants allowed.`,
      role,
      policy
    };
  }

  const maxVideo = Math.max(
    2,
    Math.min(12, Number(params.platform.maxVideoParticipants || 6) || 6)
  );
  // R-03: enforce video mesh cap on accept *and* mid-call upgrades (toggle_video / screen_share).
  if (
    mediaMode === 'video' &&
    typeof params.participantCount === 'number' &&
    params.participantCount > maxVideo &&
    (params.action === 'start' ||
      params.action === 'invite' ||
      params.action === 'join' ||
      params.action === 'accept' ||
      params.action === 'toggle_video' ||
      params.action === 'screen_share')
  ) {
    return {
      allowed: false,
      code: 'MAX_VIDEO_PARTICIPANTS_EXCEEDED',
      error: `Maximum ${maxVideo} video participants allowed on mesh topology.`,
      role,
      policy
    };
  }

  // Direct DMs: membership is enough for start/join/invite (platform flags already checked).
  if (!isGroup) {
    return { allowed: true, role: role === 'NONE' ? 'MEMBER' : role, policy: DEFAULT_POLICY };
  }

  if (policy.availability === 'DISABLED') {
    return {
      allowed: false,
      code: 'GROUP_CALLS_DISABLED',
      error: 'Calls are disabled for this group.',
      role,
      policy
    };
  }
  if (policy.availability === 'VOICE_ONLY' && params.isConference) {
    return {
      allowed: false,
      code: 'GROUP_CONFERENCE_DISABLED',
      error: 'This group allows direct voice calls only.',
      role,
      policy
    };
  }

  if (
    (mediaMode === 'video' || params.action === 'toggle_video') &&
    policy.allowVideo === false
  ) {
    return {
      allowed: false,
      code: 'GROUP_VIDEO_DISABLED',
      error: 'Video is disabled for this group.',
      role,
      policy
    };
  }

  if (params.action === 'screen_share' && policy.allowScreenShare === false) {
    return {
      allowed: false,
      code: 'GROUP_SCREEN_SHARE_DISABLED',
      error: 'Screen sharing is disabled for this group.',
      role,
      policy
    };
  }

  const effectiveRole = params.isPlatformAdmin ? 'OWNER' : role;

  switch (params.action) {
    case 'start':
      if (!roleMeetsStartScope(effectiveRole, policy.whoCanStart)) {
        return {
          allowed: false,
          code: 'GROUP_CALL_START_DENIED',
          error: 'Your role cannot start calls in this group.',
          role,
          policy
        };
      }
      return { allowed: true, role: effectiveRole, policy };

    case 'toggle_video':
    case 'screen_share':
      // Must already be a call participant context; membership + media gates above.
      if (!roleMeetsJoinScope(effectiveRole, policy.whoCanJoin) && !params.isInitiator && !params.isInvited) {
        return {
          allowed: false,
          code: 'GROUP_CALL_JOIN_DENIED',
          error: 'Your role cannot publish media in this group call.',
          role,
          policy
        };
      }
      return { allowed: true, role: effectiveRole, policy };

    case 'join':
    case 'accept':
      if (policy.whoCanJoin === 'INVITED_ONLY' && !params.isInvited && !params.isInitiator) {
        return {
          allowed: false,
          code: 'GROUP_CALL_INVITE_REQUIRED',
          error: 'An invitation is required to join this group call.',
          role,
          policy
        };
      }
      if (!roleMeetsJoinScope(effectiveRole, policy.whoCanJoin)) {
        return {
          allowed: false,
          code: 'GROUP_CALL_JOIN_DENIED',
          error: 'Your role cannot join calls in this group.',
          role,
          policy
        };
      }
      if (
        (policy.participationMode === 'INVITE_ONLY' || policy.participationMode === 'ADMIN_APPROVAL') &&
        !params.isInvited &&
        !params.isInitiator &&
        !params.isJoinApproved &&
        !canModerateCall(effectiveRole)
      ) {
        return {
          allowed: false,
          code: 'GROUP_CALL_JOIN_MODE_DENIED',
          error: 'This group call requires an invitation or approval.',
          role,
          policy
        };
      }
      // REQUEST mode: members must have an approved join request (or be invited/host/mod).
      if (
        policy.participationMode === 'REQUEST' &&
        !params.isInvited &&
        !params.isInitiator &&
        !params.isJoinApproved &&
        !canModerateCall(effectiveRole)
      ) {
        return {
          allowed: false,
          code: 'GROUP_CALL_JOIN_REQUEST_REQUIRED',
          error: 'You must request to join this call and wait for approval.',
          role,
          policy
        };
      }
      return { allowed: true, role: effectiveRole, policy };

    case 'request_join':
      if (policy.participationMode !== 'REQUEST' && policy.participationMode !== 'ADMIN_APPROVAL') {
        return {
          allowed: false,
          code: 'GROUP_CALL_REQUEST_NOT_REQUIRED',
          error: 'This call does not use join-request mode.',
          role,
          policy
        };
      }
      if (!roleMeetsJoinScope(effectiveRole, policy.whoCanJoin)) {
        return {
          allowed: false,
          code: 'GROUP_CALL_JOIN_DENIED',
          error: 'Your role cannot join calls in this group.',
          role,
          policy
        };
      }
      return { allowed: true, role: effectiveRole, policy };

    case 'invite':
      if (!roleMeetsInviteScope(effectiveRole, policy.whoCanInvite)) {
        return {
          allowed: false,
          code: 'GROUP_CALL_INVITE_DENIED',
          error: 'Your role cannot invite participants to this group call.',
          role,
          policy
        };
      }
      return { allowed: true, role: effectiveRole, policy };

    case 'end_all':
    case 'remove':
    case 'mute_other':
      if (!canEndCallForEveryone(effectiveRole, Boolean(params.isInitiator)) && params.action === 'end_all') {
        return {
          allowed: false,
          code: 'GROUP_CALL_END_DENIED',
          error: 'Only the host or group administrators can end the call for everyone.',
          role,
          policy
        };
      }
      if (
        (params.action === 'remove' || params.action === 'mute_other') &&
        !canModerateCall(effectiveRole) &&
        !params.isInitiator
      ) {
        return {
          allowed: false,
          code: 'GROUP_CALL_MODERATE_DENIED',
          error: 'You cannot moderate participants in this call.',
          role,
          policy
        };
      }
      return { allowed: true, role: effectiveRole, policy };

    case 'leave':
    case 'reject':
    case 'mute_self':
    case 'signal':
    case 'approve_join':
      if (params.action === 'approve_join' && !canModerateCall(effectiveRole)) {
        return {
          allowed: false,
          code: 'GROUP_CALL_APPROVE_DENIED',
          error: 'Only moderators and administrators can approve join requests.',
          role,
          policy
        };
      }
      return { allowed: true, role: effectiveRole, policy };

    default:
      return { allowed: true, role: effectiveRole, policy };
  }
};

export const DEFAULT_GROUP_CALL_POLICY = DEFAULT_POLICY;
export const normalizeGroupCallRole = normalizeRole;
