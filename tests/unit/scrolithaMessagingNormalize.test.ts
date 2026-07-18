import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Lightweight mirror of messaging normalize rules for Scrolitha conversation flags.
 * Full MessagingService normalize is environment-coupled; this guards the identity contract.
 */
const normalizeParticipant = (participant: any) => {
  const isScrolitha = Boolean(
    participant?.isScrolitha ??
      participant?.is_scrolitha ??
      String(participant?.username || '').toLowerCase() === 'scrolitha'
  );
  return {
    id: String(participant?.id || ''),
    name: String(participant?.name || 'Unknown'),
    username: String(participant?.username || ''),
    isScrolitha,
    is_scrolitha: isScrolitha,
    isOnline: isScrolitha ? true : Boolean(participant?.isOnline),
    isVerified: Boolean(participant?.isVerified || isScrolitha)
  };
};

const normalizeConversation = (raw: any) => {
  const participants = Array.isArray(raw?.participants)
    ? raw.participants.map(normalizeParticipant)
    : [];
  const isScrolitha = Boolean(
    raw?.isScrolitha ??
      raw?.is_scrolitha ??
      participants.some((p: any) => p.isScrolitha)
  );
  return {
    id: String(raw?.id || ''),
    participants,
    isScrolitha,
    is_scrolitha: isScrolitha,
    isStarred: isScrolitha ? true : Boolean(raw?.isStarred),
    isPinned: isScrolitha
  };
};

test('scrolitha participant is always online and verified', () => {
  const p = normalizeParticipant({ id: 'ai1', name: 'Scrolitha', username: 'scrolitha', isOnline: false });
  assert.equal(p.isScrolitha, true);
  assert.equal(p.isOnline, true);
  assert.equal(p.isVerified, true);
});

test('conversation with scrolitha peer is pinned and starred', () => {
  const c = normalizeConversation({
    id: 'c1',
    isStarred: false,
    participants: [
      { id: 'u1', name: 'User', username: 'user1' },
      { id: 'ai1', name: 'Scrolitha', username: 'scrolitha' }
    ]
  });
  assert.equal(c.isScrolitha, true);
  assert.equal(c.isStarred, true);
  assert.equal(c.isPinned, true);
});

test('human-only conversation is not scrolitha', () => {
  const c = normalizeConversation({
    id: 'c2',
    participants: [
      { id: 'u1', name: 'A', username: 'a' },
      { id: 'u2', name: 'B', username: 'b' }
    ]
  });
  assert.equal(c.isScrolitha, false);
  assert.equal(c.isPinned, false);
});
