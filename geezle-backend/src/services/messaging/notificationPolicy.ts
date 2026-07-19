/**
 * Phase 22.1 / 22.2 — Mute + group notification policy (pure helpers).
 *
 * Precedence:
 * 1. Block — if sender is blocked by receiver, never notify (upstream).
 * 2. Sender never notified.
 * 3. Mute (isMuted):
 *    - 22.1: suppress all
 *    - 22.2: mention bypass when mentionedUserIds includes receiver and allowMentionBypass
 * 4. Group notification level (when provided):
 *    - NONE → suppress (unless mention bypass while muted handled above)
 *    - MENTIONS → only if mentioned
 *    - ALL → notify
 * 5. forcePush must NOT override mute/level for new_message.
 */

import {
  normalizeNotificationLevel,
  shouldNotifyGroupReceiver,
  type NotificationLevel
} from './groupPolicy';

export type MuteFilterInput = {
  receiverIds: string[];
  mutedUserIds: Iterable<string>;
  senderId?: string | null;
  /** Phase 22.2 — enable @mention bypass for muted members */
  allowMentionBypass?: boolean;
  mentionedUserIds?: Iterable<string>;
  /** Phase 22.2 — optional per-user notification levels (group) */
  notificationLevelByUserId?: Record<string, NotificationLevel | string>;
  isGroup?: boolean;
};

export const filterReceiversForMessagePush = (input: MuteFilterInput): string[] => {
  const senderId = String(input.senderId || '').trim();
  const muted = new Set(
    Array.from(input.mutedUserIds || [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );
  const mentioned = new Set(
    Array.from(input.mentionedUserIds || [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );
  const allowMentionBypass = input.allowMentionBypass === true;
  const levels = input.notificationLevelByUserId || {};
  const isGroup = Boolean(input.isGroup);

  return Array.from(
    new Set(
      (input.receiverIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => Boolean(id) && id !== senderId)
        .filter((id) => {
          const isMentioned = mentioned.has(id);
          const isMuted = muted.has(id);
          if (isGroup || levels[id]) {
            return shouldNotifyGroupReceiver({
              isMuted,
              notifications: normalizeNotificationLevel(levels[id] || 'ALL'),
              isMentioned: allowMentionBypass ? isMentioned : false,
              isSender: false
            });
          }
          // DIRECT (or no levels): mute suppress with optional mention bypass
          if (!isMuted) return true;
          return allowMentionBypass && isMentioned;
        })
    )
  );
};

export const MESSAGING_MUTE_POLICY_VERSION = '22.2';
