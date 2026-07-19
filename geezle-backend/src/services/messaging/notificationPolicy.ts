/**
 * Phase 22.1 — Mute-aware messaging notification policy (pure helpers + docs in code).
 *
 * Precedence (highest wins for suppression):
 * 1. Block — if sender is blocked by receiver, never notify (handled upstream when known).
 * 2. Mute — if ConversationParticipant.isMuted for receiver, suppress push + in-app new_message
 *    (mentions / group @me will be layered in 22.2; for 22.1 all muted = suppress).
 * 3. Direct message — only notify unmuted participants who are not the sender.
 * 4. forcePush on system templates must NOT override conversation mute for new_message.
 */

export type MuteFilterInput = {
  receiverIds: string[];
  mutedUserIds: Iterable<string>;
  senderId?: string | null;
  /** Reserved for 22.2 @mention bypass; ignored when false (default). */
  allowMentionBypass?: boolean;
  mentionedUserIds?: Iterable<string>;
};

export const filterReceiversForMessagePush = (input: MuteFilterInput): string[] => {
  const senderId = String(input.senderId || '').trim();
  const muted = new Set(
    Array.from(input.mutedUserIds || [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );
  const mentionBypass =
    input.allowMentionBypass === true
      ? new Set(
          Array.from(input.mentionedUserIds || [])
            .map((id) => String(id || '').trim())
            .filter(Boolean)
        )
      : null;

  return Array.from(
    new Set(
      (input.receiverIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => Boolean(id) && id !== senderId)
        .filter((id) => {
          if (!muted.has(id)) return true;
          if (mentionBypass && mentionBypass.has(id)) return true;
          return false;
        })
    )
  );
};

export const MESSAGING_MUTE_POLICY_VERSION = '22.1';
