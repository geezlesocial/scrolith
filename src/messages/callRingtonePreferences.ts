/**
 * User preferences for Scrolith Call ringtone / ringback.
 * Stored locally so they never affect active WebRTC call media.
 */

export type CallRingtonePreferences = {
  /** Master enable for both tones (silent mode when false). */
  ringtoneEnabled: boolean;
  /** Incoming "Scrolith Call" volume 0..1 */
  incomingVolume: number;
  /** Outgoing ringback volume 0..1 */
  outgoingVolume: number;
  /** Mobile vibration on incoming ring when supported. */
  vibrationEnabled: boolean;
  /** When true, never autoplay tones (user must re-enable). */
  silentMode: boolean;
};

const STORAGE_KEY = 'scrolith.callRingtone.v1';

export const DEFAULT_CALL_RINGTONE_PREFERENCES: CallRingtonePreferences = {
  ringtoneEnabled: true,
  incomingVolume: 0.85,
  outgoingVolume: 0.55,
  vibrationEnabled: true,
  silentMode: false
};

const clamp01 = (value: number, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
};

export const sanitizeCallRingtonePreferences = (
  input: Partial<CallRingtonePreferences> | null | undefined
): CallRingtonePreferences => {
  const base = { ...DEFAULT_CALL_RINGTONE_PREFERENCES, ...(input || {}) };
  return {
    ringtoneEnabled: Boolean(base.ringtoneEnabled),
    incomingVolume: clamp01(base.incomingVolume, DEFAULT_CALL_RINGTONE_PREFERENCES.incomingVolume),
    outgoingVolume: clamp01(base.outgoingVolume, DEFAULT_CALL_RINGTONE_PREFERENCES.outgoingVolume),
    vibrationEnabled: Boolean(base.vibrationEnabled),
    silentMode: Boolean(base.silentMode)
  };
};

export const loadCallRingtonePreferences = (): CallRingtonePreferences => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ...DEFAULT_CALL_RINGTONE_PREFERENCES };
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CALL_RINGTONE_PREFERENCES };
    return sanitizeCallRingtonePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CALL_RINGTONE_PREFERENCES };
  }
};

export const saveCallRingtonePreferences = (
  partial: Partial<CallRingtonePreferences>
): CallRingtonePreferences => {
  const next = sanitizeCallRingtonePreferences({
    ...loadCallRingtonePreferences(),
    ...partial
  });
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // private mode / quota
  }
  try {
    window.dispatchEvent(
      new CustomEvent('scrolith:call-ringtone-preferences', { detail: next })
    );
  } catch {
    // noop
  }
  return next;
};

export const isRingtonePlaybackAllowed = (prefs?: CallRingtonePreferences): boolean => {
  const p = prefs || loadCallRingtonePreferences();
  if (p.silentMode) return false;
  if (!p.ringtoneEnabled) return false;
  return true;
};
