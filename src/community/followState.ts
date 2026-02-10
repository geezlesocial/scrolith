import { useEffect, useSyncExternalStore } from 'react';

type FollowStateMap = Record<string, boolean>;

let followState: FollowStateMap = {};
const listeners = new Set<() => void>();

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => followState;

export const setFollowStatus = (targetUserId: string, isFollowing: boolean) => {
  const id = String(targetUserId || '').trim();
  if (!id) return;
  if (followState[id] === isFollowing) return;
  followState = { ...followState, [id]: isFollowing };
  emitChange();
};

export const setFollowStatuses = (updates: FollowStateMap) => {
  const entries = Object.entries(updates || {}).map(([id, value]) => [String(id || '').trim(), Boolean(value)] as const);
  if (!entries.length) return;

  let changed = false;
  const next = { ...followState };

  entries.forEach(([id, value]) => {
    if (!id) return;
    if (next[id] === value) return;
    next[id] = value;
    changed = true;
  });

  if (!changed) return;
  followState = next;
  emitChange();
};

export const resetFollowState = () => {
  if (!Object.keys(followState).length) return;
  followState = {};
  emitChange();
};

export const applyFollowUpdatePayload = (payload: any, currentUserId?: string) => {
  const targetUserId = String(payload?.targetUserId || payload?.targetId || '').trim();
  if (!targetUserId) return;

  const actorUserId = String(payload?.actorUserId || payload?.followerId || '').trim();
  if (currentUserId && actorUserId && actorUserId !== String(currentUserId)) {
    return;
  }

  const explicit = payload?.isFollowing;
  const inferred = String(payload?.action || '').toLowerCase() === 'follow';
  const isFollowing = typeof explicit === 'boolean' ? explicit : inferred;
  setFollowStatus(targetUserId, isFollowing);
};

export const useFollowStateMap = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

export const useFollowStatus = (targetUserId?: string, initialStatus?: boolean) => {
  const map = useFollowStateMap();
  const id = String(targetUserId || '').trim();
  const value = id ? map[id] : undefined;

  useEffect(() => {
    if (!id) return;
    if (value !== undefined) return;
    if (initialStatus === undefined) return;
    setFollowStatus(id, Boolean(initialStatus));
  }, [id, value, initialStatus]);

  if (!id) return undefined;
  if (value !== undefined) return value;
  return initialStatus;
};
