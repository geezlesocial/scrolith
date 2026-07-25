/**
 * Atomic accept + media-upgrade capacity (R-02 / R-03).
 * Serializes concurrent transitions per call via SELECT ... FOR UPDATE on VoiceCall.
 */

import type { PlatformVoiceFlags, CallMediaMode, AuthorizeCallResult, GroupCallPolicy } from './messengerCallPolicy.service';
import { authorizeCallAction } from './messengerCallPolicy.service';
import { countJoinedParticipants, participantIsJoined, resolveCallStoredMediaMode } from './messengerCallPlatform.service';

export type CapacityPrisma = {
  $queryRaw: (query: TemplateStringsArray | any, ...values: any[]) => Promise<any>;
  $executeRaw: (query: TemplateStringsArray | any, ...values: any[]) => Promise<any>;
  $transaction: <T>(fn: (tx: CapacityPrisma) => Promise<T>, options?: any) => Promise<T>;
  voiceCall: {
    findUnique: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
  voiceCallParticipant: {
    findMany: (args: any) => Promise<any[]>;
    updateMany: (args: any) => Promise<any>;
    count: (args: any) => Promise<number>;
  };
};

const ACTIVE = ['INITIATED', 'RINGING', 'ACTIVE'];

export type AtomicAcceptInput = {
  callId: string;
  userId: string;
  platform: PlatformVoiceFlags;
  conversationType?: string;
  memberRole?: unknown;
  memberDeletedAt?: unknown;
  groupPolicy?: GroupCallPolicy;
  isPlatformAdmin?: boolean;
  isJoinApproved?: boolean;
  isConference?: boolean;
};

export type AtomicAcceptResult =
  | {
      ok: true;
      idempotent: boolean;
      callMediaMode: CallMediaMode;
      conversationId: string;
      participantIds: string[];
      joinedAt: string;
    }
  | { ok: false; code: string; error: string };

/**
 * Accept under row lock: re-read JOINED count, authorize, transition JOINED/ACTIVE.
 */
export const atomicAcceptCall = async (
  prisma: CapacityPrisma,
  input: AtomicAcceptInput
): Promise<AtomicAcceptResult> => {
  return prisma.$transaction(
    async (tx) => {
      // Serialize all accept/media upgrades for this call.
      const locked: any[] = await tx.$queryRaw`
        SELECT id, status, "callType", "initiatorId", "conversationId", metadata
        FROM "VoiceCall"
        WHERE id = ${input.callId}
        FOR UPDATE
      `;
      const row = Array.isArray(locked) ? locked[0] : null;
      if (!row) {
        return { ok: false, code: 'CALL_NOT_FOUND', error: 'Call not found or access denied.' };
      }
      const status = String(row.status || '').toUpperCase();
      if (!ACTIVE.includes(status)) {
        return { ok: false, code: 'CALL_NOT_ACTIVE', error: 'This call is no longer active.' };
      }

      const participants = await tx.voiceCallParticipant.findMany({
        where: { callId: input.callId }
      });
      const participantIds = participants
        .map((p: any) => String(p.userId || '').trim())
        .filter(Boolean);
      if (!participantIds.includes(input.userId)) {
        return { ok: false, code: 'CALL_NOT_FOUND', error: 'Call not found or access denied.' };
      }

      const alreadyJoined = participantIsJoined(participants, input.userId);
      if (alreadyJoined && status === 'ACTIVE') {
        return {
          ok: true,
          idempotent: true,
          callMediaMode: resolveCallStoredMediaMode(row.metadata),
          conversationId: String(row.conversationId || ''),
          participantIds,
          joinedAt: new Date().toISOString()
        };
      }

      const selfRow = participants.find(
        (p: any) => String(p.userId || '').trim() === input.userId
      );
      const selfStatus = String(selfRow?.status || '')
        .trim()
        .toUpperCase();
      const isInvited = ['INVITED', 'JOINED'].includes(selfStatus);
      const isInitiator = String(row.initiatorId || '') === input.userId;

      const joinedCount = countJoinedParticipants(participants);
      const participantCount = joinedCount + (alreadyJoined ? 0 : 1);
      const callMediaMode = resolveCallStoredMediaMode(row.metadata);
      const isConference =
        input.isConference !== undefined
          ? input.isConference
          : String(row.callType || '').toUpperCase() === 'CONFERENCE';

      const auth = authorizeCallAction({
        action: 'accept',
        platform: input.platform,
        actorUserId: input.userId,
        isPlatformAdmin: input.isPlatformAdmin,
        conversationType: input.conversationType,
        memberRole: input.memberRole,
        memberDeletedAt: input.memberDeletedAt,
        groupPolicy: input.groupPolicy,
        isConference,
        isInvited: isInvited || isInitiator,
        isInitiator,
        isJoinApproved: input.isJoinApproved,
        mediaMode: callMediaMode,
        participantCount
      });
      if (!auth.allowed) {
        return {
          ok: false,
          code: (auth as { code: string }).code,
          error: (auth as { error: string }).error
        };
      }

      const joinedAt = new Date();
      await tx.voiceCallParticipant.updateMany({
        where: { callId: input.callId, userId: input.userId },
        data: { status: 'JOINED', joinedAt, leftAt: null }
      });
      const callUpdate: Record<string, unknown> = { status: 'ACTIVE' };
      if (status !== 'ACTIVE') {
        callUpdate.startedAt = joinedAt;
      }
      await tx.voiceCall.update({
        where: { id: input.callId },
        data: callUpdate
      });

      return {
        ok: true,
        idempotent: false,
        callMediaMode,
        conversationId: String(row.conversationId || ''),
        participantIds,
        joinedAt: joinedAt.toISOString()
      };
    },
    { maxWait: 5000, timeout: 10000 }
  );
};

export type AtomicMediaUpgradeInput = {
  callId: string;
  userId: string;
  platform: PlatformVoiceFlags;
  conversationType?: string;
  memberRole?: unknown;
  memberDeletedAt?: unknown;
  groupPolicy?: GroupCallPolicy;
  isPlatformAdmin?: boolean;
  /** Policy action after resolveMediaControlIntent */
  policyAction: 'toggle_video' | 'screen_share' | 'mute_self';
  /** Whether this action requires video-mode auth / upgrade */
  upgradesCallToVideo: boolean;
  authMediaMode: CallMediaMode;
  kind: 'camera' | 'screen' | 'microphone';
  action: string;
  enabled: boolean;
  nextMetadataPatch: (prevMeta: Record<string, any>) => Record<string, any>;
};

export type AtomicMediaUpgradeResult =
  | {
      ok: true;
      mediaMode: CallMediaMode;
      mediaModeUpgraded: boolean;
      metadata: Record<string, any>;
      participantIds: string[];
    }
  | { ok: false; code: string; error: string };

/**
 * Media control under the same call row lock. Enforces video caps on upgrades.
 */
export const atomicMediaUpgrade = async (
  prisma: CapacityPrisma,
  input: AtomicMediaUpgradeInput
): Promise<AtomicMediaUpgradeResult> => {
  return prisma.$transaction(
    async (tx) => {
      const locked: any[] = await tx.$queryRaw`
        SELECT id, status, "callType", "initiatorId", "conversationId", metadata
        FROM "VoiceCall"
        WHERE id = ${input.callId}
        FOR UPDATE
      `;
      const row = Array.isArray(locked) ? locked[0] : null;
      if (!row) {
        return { ok: false, code: 'CALL_NOT_FOUND', error: 'Call not found or access denied.' };
      }
      const status = String(row.status || '').toUpperCase();
      if (!ACTIVE.includes(status)) {
        return { ok: false, code: 'CALL_NOT_ACTIVE', error: 'This call is no longer active.' };
      }

      const participants = await tx.voiceCallParticipant.findMany({
        where: { callId: input.callId }
      });
      const participantIds = participants
        .map((p: any) => String(p.userId || '').trim())
        .filter(Boolean);
      if (!participantIds.includes(input.userId)) {
        return { ok: false, code: 'CALL_NOT_FOUND', error: 'Call not found or access denied.' };
      }

      const isJoined = participantIsJoined(participants, input.userId);
      const isInitiator = String(row.initiatorId || '') === input.userId;
      if (!isJoined && !isInitiator) {
        return {
          ok: false,
          code: 'MEDIA_NOT_JOINED',
          error: 'Join the call before changing media.'
        };
      }

      const joinedCount = Math.max(1, countJoinedParticipants(participants) || participants.length);
      const storedMode = resolveCallStoredMediaMode(row.metadata);
      const isConference = String(row.callType || '').toUpperCase() === 'CONFERENCE';

      const auth = authorizeCallAction({
        action: input.policyAction,
        platform: input.platform,
        actorUserId: input.userId,
        isPlatformAdmin: input.isPlatformAdmin,
        conversationType: input.conversationType,
        memberRole: input.memberRole,
        memberDeletedAt: input.memberDeletedAt,
        groupPolicy: input.groupPolicy,
        isConference,
        isInitiator,
        isInvited: isJoined || isInitiator,
        isJoinApproved: true,
        mediaMode: input.authMediaMode,
        participantCount: joinedCount
      });
      if (!auth.allowed) {
        return {
          ok: false,
          code: (auth as { code: string }).code,
          error: (auth as { error: string }).error
        };
      }

      const prevMeta =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? { ...(row.metadata as any) }
          : {};

      let mediaModeUpgraded = false;
      if (input.upgradesCallToVideo && storedMode !== 'video') {
        prevMeta.mediaMode = 'video';
        prevMeta.mediaModeUpgradedAt = new Date().toISOString();
        prevMeta.mediaModeUpgradedBy = input.userId;
        mediaModeUpgraded = true;
      } else if (!prevMeta.mediaMode) {
        prevMeta.mediaMode = storedMode;
      }

      const nextMeta = input.nextMetadataPatch(prevMeta);

      await tx.voiceCall.update({
        where: { id: input.callId },
        data: { metadata: nextMeta }
      });

      const finalMode =
        String(nextMeta.mediaMode || storedMode).toLowerCase() === 'video' ? 'video' : 'audio';

      return {
        ok: true,
        mediaMode: finalMode as CallMediaMode,
        mediaModeUpgraded,
        metadata: nextMeta,
        participantIds
      };
    },
    { maxWait: 5000, timeout: 10000 }
  );
};

/** Pure capacity recheck used by unit tests (no DB). */
export const wouldExceedVideoCap = (params: {
  joinedCount: number;
  maxVideoParticipants: number;
  mediaMode: CallMediaMode;
  action: string;
}): boolean => {
  if (params.mediaMode !== 'video') return false;
  const maxVideo = Math.max(2, Math.min(12, Number(params.maxVideoParticipants || 6) || 6));
  const actions = new Set([
    'start',
    'invite',
    'join',
    'accept',
    'toggle_video',
    'screen_share'
  ]);
  if (!actions.has(params.action)) return false;
  return params.joinedCount > maxVideo;
};
