/**
 * Live platform flag assembly + media-mode authorization helpers for call sockets.
 * Keeps accept/media paths server-authoritative (no hard-coded enabledVoiceCalls: true).
 */

import type { PlatformVoiceFlags, CallMediaMode } from './messengerCallPolicy.service';
import { getMessengerVideoPlatformFlags, normalizeMediaMode } from './messengerVideoConfig.service';

export type MessengerVoiceConfigLike = {
  enabledVoiceCalls?: boolean | null;
  enabledConferenceCalls?: boolean | null;
  enabledVideoCalls?: boolean | null;
  maxParticipants?: number | null;
  blockedUserIds?: unknown;
  videoBlockedUserIds?: unknown;
};

export const buildLivePlatformVoiceFlags = (
  config: MessengerVoiceConfigLike,
  options?: {
    maxParticipants?: number;
    videoFlags?: ReturnType<typeof getMessengerVideoPlatformFlags>;
  }
): PlatformVoiceFlags => {
  const videoFlags = options?.videoFlags || getMessengerVideoPlatformFlags();
  const blocked = Array.isArray(config?.blockedUserIds)
    ? (config.blockedUserIds as unknown[]).map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  return {
    enabledVoiceCalls: Boolean(config?.enabledVoiceCalls),
    enabledConferenceCalls: Boolean(config?.enabledConferenceCalls),
    maxParticipants: Math.max(
      2,
      Math.min(20, Number(options?.maxParticipants ?? config?.maxParticipants ?? 20) || 20)
    ),
    blockedUserIds: blocked,
    enabledVideoCalls: videoFlags.enabledVideoCalls && config?.enabledVideoCalls !== false,
    videoBlockedUserIds: Array.isArray(config?.videoBlockedUserIds)
      ? (config.videoBlockedUserIds as unknown[]).map((id) => String(id || '').trim()).filter(Boolean)
      : [],
    enabledScreenSharing: videoFlags.enabledScreenSharing,
    maxVideoParticipants: videoFlags.maxVideoParticipants
  };
};

export const getVideoDisabledUserIds = async (
  prismaClient: any,
  userIds: string[]
): Promise<string[]> => {
  const ids = Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length || !prismaClient?.userSettings?.findMany) return [];
  try {
    const rows = await prismaClient.userSettings.findMany({
      where: {
        userId: { in: ids },
        videoCallsEnabled: false
      },
      select: { userId: true }
    });
    return Array.isArray(rows)
      ? rows.map((row: any) => String(row?.userId || '').trim()).filter(Boolean)
      : [];
  } catch (error: any) {
    const code = String(error?.code || '').trim();
    const message = String(error?.message || '');
    if (code === 'P2022' || message.includes('videoCallsEnabled')) return [];
    throw error;
  }
};

export const isVideoCallingEnabledForUser = async (
  prismaClient: any,
  userId: string
): Promise<boolean> => {
  const id = String(userId || '').trim();
  if (!id || !prismaClient?.userSettings?.findUnique) return true;
  try {
    const settings = await prismaClient.userSettings.findUnique({
      where: { userId: id },
      select: { videoCallsEnabled: true }
    });
    return settings?.videoCallsEnabled !== false;
  } catch (error: any) {
    const code = String(error?.code || '').trim();
    const message = String(error?.message || '');
    if (code === 'P2022' || message.includes('videoCallsEnabled')) return true;
    throw error;
  }
};

/** Default missing/legacy metadata to audio (never assume video). */
export const resolveCallStoredMediaMode = (metadata: unknown): CallMediaMode => {
  if (!metadata || typeof metadata !== 'object') return 'audio';
  return normalizeMediaMode((metadata as any).mediaMode);
};

export type MediaKind = 'camera' | 'screen' | 'microphone';
export type MediaAction = 'start' | 'stop' | 'toggle' | 'state';

/**
 * Decide whether a media control requires video-mode authorization and/or upgrades call mediaMode.
 */
export const resolveMediaControlIntent = (params: {
  kind: string;
  action: string;
  callMediaMode: CallMediaMode;
  enabled?: boolean;
}): {
  kind: MediaKind | null;
  action: MediaAction | null;
  requiresJoined: boolean;
  requiresVideoAuth: boolean;
  upgradesCallToVideo: boolean;
  effectiveEnabled: boolean;
  policyAction: 'mute_self' | 'toggle_video' | 'screen_share';
  authMediaMode: CallMediaMode;
} => {
  const kindRaw = String(params.kind || '')
    .trim()
    .toLowerCase();
  const actionRaw = String(params.action || '')
    .trim()
    .toLowerCase();
  const kind: MediaKind | null =
    kindRaw === 'camera' || kindRaw === 'screen' || kindRaw === 'microphone' ? kindRaw : null;
  const action: MediaAction | null =
    actionRaw === 'start' || actionRaw === 'stop' || actionRaw === 'toggle' || actionRaw === 'state'
      ? actionRaw
      : null;

  const effectiveEnabled =
    action === 'stop'
      ? false
      : action === 'start'
        ? true
        : params.enabled === undefined
          ? true
          : Boolean(params.enabled);

  if (!kind || !action) {
    return {
      kind: null,
      action: null,
      requiresJoined: true,
      requiresVideoAuth: false,
      upgradesCallToVideo: false,
      effectiveEnabled,
      policyAction: 'mute_self',
      authMediaMode: params.callMediaMode
    };
  }

  if (kind === 'microphone') {
    return {
      kind,
      action,
      requiresJoined: true,
      requiresVideoAuth: false,
      upgradesCallToVideo: false,
      effectiveEnabled,
      policyAction: 'mute_self',
      authMediaMode: params.callMediaMode
    };
  }

  // Camera/screen publish or unmute video on an audio call → upgrade intent.
  const turningOn = effectiveEnabled !== false && action !== 'stop';
  const upgradesCallToVideo = turningOn && params.callMediaMode !== 'video';
  const requiresVideoAuth = turningOn || action === 'toggle' || params.callMediaMode === 'video';

  return {
    kind,
    action,
    requiresJoined: true,
    requiresVideoAuth,
    upgradesCallToVideo,
    effectiveEnabled,
    policyAction: kind === 'screen' ? 'screen_share' : 'toggle_video',
    authMediaMode: turningOn || params.callMediaMode === 'video' ? 'video' : 'audio'
  };
};

export const participantIsJoined = (participants: any[] | undefined, userId: string): boolean => {
  if (!Array.isArray(participants)) return false;
  const id = String(userId || '').trim();
  return participants.some(
    (entry: any) =>
      String(entry?.userId || '').trim() === id &&
      String(entry?.status || '')
        .trim()
        .toUpperCase() === 'JOINED'
  );
};

export const countJoinedParticipants = (participants: any[] | undefined): number => {
  if (!Array.isArray(participants)) return 0;
  return participants.filter(
    (entry: any) =>
      String(entry?.status || '')
        .trim()
        .toUpperCase() === 'JOINED'
  ).length;
};
