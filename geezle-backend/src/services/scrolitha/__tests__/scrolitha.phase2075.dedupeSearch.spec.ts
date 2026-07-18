import test from 'node:test';
import assert from 'node:assert/strict';

const participantPairKey = (a: string, b: string) => [a, b].sort().join(':');

const isExactScrolithaDm = (
  conversation: { type?: string | null; participants?: Array<{ userId?: string | null }> | null },
  userId: string,
  platformUserId: string
) => {
  if (String(conversation?.type || '').toUpperCase() !== 'DIRECT') return false;
  const ids = Array.from(
    new Set((conversation.participants || []).map((p) => String(p.userId || '').trim()).filter(Boolean))
  );
  return ids.length === 2 && ids.includes(userId) && ids.includes(platformUserId);
};

test('participant pair key is order-independent', () => {
  assert.equal(participantPairKey('user-a', 'scrolitha'), participantPairKey('scrolitha', 'user-a'));
});

test('exact scrolitha dm requires both participants only', () => {
  const uid = 'user-1';
  const pid = 'scrolitha-1';
  assert.equal(
    isExactScrolithaDm({ type: 'DIRECT', participants: [{ userId: uid }, { userId: pid }] }, uid, pid),
    true
  );
  assert.equal(
    isExactScrolithaDm({ type: 'DIRECT', participants: [{ userId: pid }, { userId: uid }] }, uid, pid),
    true
  );
  assert.equal(
    isExactScrolithaDm(
      { type: 'DIRECT', participants: [{ userId: uid }, { userId: pid }, { userId: 'x' }] },
      uid,
      pid
    ),
    false
  );
  assert.equal(
    isExactScrolithaDm({ type: 'GROUP', participants: [{ userId: uid }, { userId: pid }] }, uid, pid),
    false
  );
});

test('survivor selection prefers more messages then recency', () => {
  const ordered = [
    { id: 'a', _count: { messages: 2 }, lastMessageAt: new Date('2026-01-01'), createdAt: new Date('2026-01-01') },
    { id: 'b', _count: { messages: 10 }, lastMessageAt: new Date('2026-01-02'), createdAt: new Date('2026-01-03') },
    { id: 'c', _count: { messages: 10 }, lastMessageAt: new Date('2026-02-01'), createdAt: new Date('2026-01-04') }
  ].sort((a, b) => {
    const aCount = Number(a._count?.messages || 0);
    const bCount = Number(b._count?.messages || 0);
    if (aCount !== bCount) return bCount - aCount;
    const aAct = new Date(a.lastMessageAt || 0).getTime();
    const bAct = new Date(b.lastMessageAt || 0).getTime();
    if (aAct !== bAct) return bAct - aAct;
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });
  assert.equal(ordered[0].id, 'c');
});
