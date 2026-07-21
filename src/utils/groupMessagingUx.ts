/**
 * Phase 29.3 — pure UX helpers for Enterprise Messaging Groups.
 * Keep DM-safe: only use when conversation is a group.
 */

export type TyperEntry = { userId?: string; name?: string; startedAt?: string };

/** Multi-typer label: "John is typing" / "John and Mary are typing" / "3 people are typing" */
export const formatMultiTyperLabel = (
  typers: TyperEntry[] | null | undefined,
  selfUserId?: string | null
): string | null => {
  const self = String(selfUserId || '').trim();
  const names = Array.from(
    new Set(
      (typers || [])
        .filter((t) => {
          const id = String(t?.userId || '').trim();
          return id && id !== self;
        })
        .map((t) => String(t?.name || 'Someone').trim() || 'Someone')
    )
  );
  if (!names.length) return null;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
};

export const formatMultiRecorderLabel = (
  recorders: TyperEntry[] | null | undefined,
  selfUserId?: string | null
): string | null => {
  const self = String(selfUserId || '').trim();
  const names = Array.from(
    new Set(
      (recorders || [])
        .filter((t) => {
          const id = String(t?.userId || '').trim();
          return id && id !== self;
        })
        .map((t) => String(t?.name || 'Someone').trim() || 'Someone')
    )
  );
  if (!names.length) return null;
  if (names.length === 1) return `${names[0]} is recording…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are recording…`;
  return `${names.length} people are recording…`;
};

export type GroupComposerRestriction = {
  blocked: boolean;
  message: string;
  code?: string;
};

/**
 * Dynamic composer restriction banner for groups.
 */
export const resolveGroupComposerRestriction = (input: {
  isGroup: boolean;
  messagingMode?: string | null;
  slowModeSeconds?: number | null;
  slowModeRemainingSec?: number | null;
  content?: Record<string, boolean | undefined> | null;
  canSend?: boolean | null;
  lockedAt?: string | null;
  sendAckStatus?: string | null;
}): GroupComposerRestriction => {
  if (!input.isGroup) return { blocked: false, message: '' };

  const mode = String(input.messagingMode || 'EVERYONE').toUpperCase();
  if (mode === 'LOCKED' || input.lockedAt) {
    return { blocked: true, message: 'Group is locked. Only unlock restores messaging.', code: 'group_locked' };
  }
  if (mode === 'READ_ONLY') {
    return { blocked: true, message: 'This group is read-only.', code: 'read_only' };
  }
  if (mode === 'ANNOUNCEMENT' || mode === 'ADMINS_ONLY') {
    if (input.canSend === false) {
      return {
        blocked: true,
        message: mode === 'ANNOUNCEMENT' ? 'Only admins can send announcements.' : 'Only admins can send messages.',
        code: 'admins_only'
      };
    }
  }
  if (mode === 'MODS_PLUS' && input.canSend === false) {
    return { blocked: true, message: 'Only moderators and admins can send messages.', code: 'mods_plus' };
  }
  if (input.canSend === false) {
    return { blocked: true, message: 'You do not have permission to send messages.', code: 'permission_denied' };
  }

  const remaining = Number(input.slowModeRemainingSec || 0);
  if (remaining > 0) {
    return {
      blocked: true,
      message: `Slow mode: wait ${remaining}s before sending again.`,
      code: 'slow_mode'
    };
  }
  const slow = Number(input.slowModeSeconds || 0);
  if (slow > 0 && input.sendAckStatus === 'slow_mode') {
    return { blocked: true, message: `Slow mode: ${slow} seconds between messages.`, code: 'slow_mode' };
  }

  const content = input.content || {};
  if (content.allowImages === false) {
    return { blocked: false, message: 'Images are disabled in this group.', code: 'images_disabled' };
  }
  if (content.allowFiles === false) {
    return { blocked: false, message: 'File uploads are disabled in this group.', code: 'files_disabled' };
  }
  if (content.allowVoice === false) {
    return { blocked: false, message: 'Voice notes are disabled in this group.', code: 'voice_disabled' };
  }

  return { blocked: false, message: '' };
};

export const VISIBILITY_HELP: Record<string, string> = {
  PUBLIC: 'Searchable and discoverable. Anyone may join based on join policy.',
  PRIVATE: 'Hidden from discovery. Members only by invite or approval.',
  SECRET: 'Highest privacy. Not searchable, no previews, invite-only.',
  UNLISTED: 'Not listed in discovery, but may be shared via link (less strict than Secret).'
};

export const JOIN_POLICY_HELP: Record<string, string> = {
  OPEN: 'Anyone can join immediately (public groups).',
  REQUEST: 'People request to join; admins approve.',
  INVITE_ONLY: 'Only invite links or direct adds. Forced for Secret groups.'
};

export const GROUP_UX_VERSION = '29.3';
