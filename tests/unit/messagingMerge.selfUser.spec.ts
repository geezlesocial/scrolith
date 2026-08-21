import { describe, expect, it } from 'vitest';
import {
  getConversationMergeKey,
  mergeDirectConversations
} from '../../src/services/messagingMerge';
import { getMessagingSurfaceConversations } from '../../src/services/messagingSurfaces';

describe('DIRECT inbox merge (self user id)', () => {
  const self = 'user-self';
  const peerA = 'user-peer-a';
  const peerB = 'user-peer-b';

  it('makes merge key peer-relative and order-independent when self is known', () => {
    const left = {
      id: 'c1',
      type: 'direct',
      participants: [{ id: self }, { id: peerA }]
    } as any;
    const right = {
      id: 'c2',
      type: 'direct',
      participants: [{ id: peerA }, { id: self }]
    } as any;
    expect(getConversationMergeKey(left, self)).toBe(getConversationMergeKey(right, self));
    expect(getConversationMergeKey(left, self)).toBe(`direct:peer:${peerA}`);
  });

  it('collapses peer-only and full-pair rows into one conversation', () => {
    const peerOnly = {
      id: 'c-peer-only',
      type: 'direct',
      participants: [{ id: peerA }],
      lastMessageAt: '2026-07-25T12:00:00.000Z',
      messages: [{ id: 'm1', text: 'hi', senderId: peerA, timestamp: '2026-07-25T12:00:00.000Z' }]
    } as any;
    const fullPair = {
      id: 'c-full',
      type: 'direct',
      participants: [{ id: peerA }, { id: self }],
      lastMessageAt: '2026-07-25T11:00:00.000Z',
      messages: [{ id: 'm2', text: 'older', senderId: self, timestamp: '2026-07-25T11:00:00.000Z' }]
    } as any;
    const merged = mergeDirectConversations([peerOnly, fullPair], self);
    expect(merged).toHaveLength(1);
    // Prefer row that includes the viewer when timestamps would otherwise prefer peer-only.
    expect(merged[0].id).toBe('c-full');
    expect((merged[0].messages || []).map((m: any) => m.id).sort()).toEqual(['m1', 'm2']);
    expect((merged[0] as any).mergedFromIds).toEqual(expect.arrayContaining(['c-peer-only', 'c-full']));
  });

  it('collapses two full-pair rows for the same peer even with different last messages', () => {
    const newer = {
      id: 'c-new',
      type: 'direct',
      participants: [{ id: self }, { id: peerA, name: "Mu'axxam" }],
      lastMessageAt: '2026-07-25T18:59:00.000Z',
      lastMessage: 'Image',
      unreadCount: 5
    } as any;
    const older = {
      id: 'c-old',
      type: 'direct',
      participants: [{ id: self }, { id: peerA, name: "Mu'axxam" }],
      lastMessageAt: '2026-07-25T15:48:00.000Z',
      lastMessage: 'Suggested professional Follow button',
      unreadCount: 5
    } as any;
    const merged = mergeDirectConversations([newer, older], self);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('c-new');
    expect(Number(merged[0].unreadCount)).toBe(10);
  });

  it('dedupes the compact header and dock preview source like /messages', () => {
    const preview = getMessagingSurfaceConversations(
      [
        {
          id: 'call-thread-new',
          type: 'direct',
          participants: [{ id: self }, { id: peerA, name: "Mu'axxam" }],
          lastMessage: 'Call ended · 14s · 2 participants',
          lastMessageAt: '2026-07-25T18:59:00.000Z'
        },
        {
          id: 'call-thread-old',
          type: 'direct',
          participants: [{ id: self }, { id: peerA, name: "Mu'axxam" }],
          lastMessage: 'Missed call',
          lastMessageAt: '2026-07-25T15:48:00.000Z'
        }
      ] as any,
      self,
      'all',
      10
    );

    expect(preview).toHaveLength(1);
    expect(preview[0].id).toBe('call-thread-new');
  });

  it('keeps different peers separate', () => {
    const a = {
      id: 'c-a',
      type: 'direct',
      participants: [{ id: peerA }, { id: self }],
      lastMessageAt: '2026-07-25T12:00:00.000Z'
    } as any;
    const b = {
      id: 'c-b',
      type: 'direct',
      participants: [{ id: peerB }, { id: self }],
      lastMessageAt: '2026-07-25T12:00:00.000Z'
    } as any;
    const merged = mergeDirectConversations([a, b], self);
    expect(merged).toHaveLength(2);
  });

  it('does not merge GROUP conversations as DIRECT', () => {
    const group = {
      id: 'g1',
      type: 'group',
      participants: [{ id: self }, { id: peerA }, { id: peerB }],
      lastMessageAt: '2026-07-25T12:00:00.000Z'
    } as any;
    const direct = {
      id: 'd1',
      type: 'direct',
      participants: [{ id: self }, { id: peerA }],
      lastMessageAt: '2026-07-25T12:00:00.000Z'
    } as any;
    const merged = mergeDirectConversations([group, direct], self);
    expect(merged.map((c) => c.id).sort()).toEqual(['d1', 'g1']);
  });

  it('preserves unread count when merging duplicate rows', () => {
    const a = {
      id: 'c1',
      type: 'direct',
      participants: [{ id: peerA }],
      unreadCount: 2,
      lastMessageAt: '2026-07-25T12:00:00.000Z'
    } as any;
    const b = {
      id: 'c2',
      type: 'direct',
      participants: [{ id: peerA }, { id: self }],
      unread_count: 3,
      lastMessageAt: '2026-07-25T11:00:00.000Z'
    } as any;
    const merged = mergeDirectConversations([a, b], self);
    expect(merged).toHaveLength(1);
    expect(Number(merged[0].unreadCount ?? merged[0].unread_count)).toBe(5);
  });

  it('merges rows with missing type when not a group', () => {
    const a = {
      id: 'c1',
      participants: [{ id: self }, { id: peerA }],
      lastMessageAt: '2026-07-25T12:00:00.000Z'
    } as any;
    const b = {
      id: 'c2',
      type: 'direct',
      participants: [{ id: peerA }, { id: self }],
      lastMessageAt: '2026-07-25T11:00:00.000Z'
    } as any;
    const merged = mergeDirectConversations([a, b], self);
    expect(merged).toHaveLength(1);
  });
});
