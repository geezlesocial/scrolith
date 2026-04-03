export const RECENT_NETWORK_RECOVERY_WINDOW_MS = 8_000;

export const shouldAttemptRealtimeConnections = (input: {
  isOnline: boolean;
  isNativePlatform: boolean;
  isAppActive: boolean;
}) => {
  if (!input.isOnline) return false;
  if (input.isNativePlatform) return input.isAppActive;
  return true;
};

export const isRecentlyRestoredOnline = (input: {
  isOnline: boolean;
  lastOnlineAt: number | null;
  now?: number;
  windowMs?: number;
}) => {
  if (!input.isOnline) return false;
  const lastOnlineAt = Number(input.lastOnlineAt || 0);
  if (!lastOnlineAt) return false;
  const now = Number(input.now || Date.now());
  const windowMs = Math.max(500, Number(input.windowMs || RECENT_NETWORK_RECOVERY_WINDOW_MS));
  return now - lastOnlineAt <= windowMs;
};
