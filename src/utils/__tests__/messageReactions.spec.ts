import { describe, expect, it } from 'vitest';
import {
  applyLocalReactionToggle,
  getMyReaction,
  getReactionChipEntries,
  getReactionCounts
} from '../../services/messagingComposer';
import type { Message } from '../../types';

const baseMessage = (overrides: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    conversation_id: 'c1',
    conversationId: 'c1',
    sender_id: 'u1',
    senderId: 'u1',
    receiver_id: 'u2',
    text: 'hello',
    timestamp: new Date().toISOString(),
    is_read: false,
    reactions: [],
    ...overrides
  }) as Message;

describe('message inbox reactions', () => {
  it('toggles reaction optimistically for the actor', () => {
    const msg = baseMessage();
    const reacted = applyLocalReactionToggle(msg, 'u2', '👍');
    expect(getMyReaction(reacted, 'u2')).toBe('👍');
    expect(getReactionCounts(reacted)['👍']).toBe(1);
    expect(getReactionChipEntries(reacted)).toEqual([{ emoji: '👍', count: 1 }]);

    const removed = applyLocalReactionToggle(reacted, 'u2', '👍');
    expect(getMyReaction(removed, 'u2')).toBeNull();
    expect(getReactionChipEntries(removed)).toEqual([]);
  });

  it('shows aggregated chips for both participants', () => {
    const msg = baseMessage({
      reactions: [
        { userId: 'u1', user_id: 'u1', emoji: '❤️', timestamp: new Date().toISOString() },
        { userId: 'u2', user_id: 'u2', emoji: '👍', timestamp: new Date().toISOString() },
        { userId: 'u3', user_id: 'u3', emoji: '❤️', timestamp: new Date().toISOString() }
      ] as any
    });
    const chips = getReactionChipEntries(msg);
    expect(chips.find((c) => c.emoji === '❤️')?.count).toBe(2);
    expect(chips.find((c) => c.emoji === '👍')?.count).toBe(1);
    expect(getMyReaction(msg, 'u1')).toBe('❤️');
    expect(getMyReaction(msg, 'u2')).toBe('👍');
  });

  it('prefers reactionSummary when present', () => {
    const msg = baseMessage({
      reactions: [],
      reactionSummary: { '😂': 3 }
    } as any);
    expect(getReactionCounts(msg)).toEqual({ '😂': 3 });
    expect(getReactionChipEntries(msg)).toEqual([{ emoji: '😂', count: 3 }]);
  });
});
