/**
 * Scrolith Call ringtone engine — enterprise incoming / outgoing call tones.
 *
 * Incoming: "Scrolith Call" (looping branded asset)
 * Outgoing: separate ringback (looping)
 *
 * Guarantees:
 * - Single active tone instance (incoming XOR ringback)
 * - Deduped start by callId + role
 * - Immediate stop on lifecycle end
 * - Prefetch after first user gesture (autoplay policy)
 * - Does not touch WebRTC call audio elements
 */

import {
  isRingtonePlaybackAllowed,
  loadCallRingtonePreferences,
  type CallRingtonePreferences
} from './callRingtonePreferences';

export type RingtoneRole = 'incoming' | 'outgoing';
export type RingtoneStopReason =
  | 'answered'
  | 'rejected'
  | 'cancelled'
  | 'timeout'
  | 'ended'
  | 'failed'
  | 'busy'
  | 'left'
  | 'superseded'
  | 'disabled'
  | 'manual';

export type RingtoneSession = {
  callId: string;
  role: RingtoneRole;
  startedAt: number;
};

/** Public assets under /sounds (WAV for broad browser support; gapless loop). */
export const SCROLITH_CALL_SOURCES = [
  '/sounds/you-have-call-in-scrolith-ringtone.mp3',
  '/sounds/scrolith-call.wav'
] as const;

export const SCROLITH_RINGBACK_SOURCES = [
  '/sounds/scrolith-ringback.wav',
  '/sounds/you-have-call-in-scrolith-ringtone.mp3'
] as const;

const PRELOAD_MARK = 'scrolith-ringtone-preloaded';

type EngineState = {
  audio: HTMLAudioElement | null;
  session: RingtoneSession | null;
  preloaded: boolean;
  unlockBound: boolean;
  prefs: CallRingtonePreferences;
  vibrationTimer: number | null;
};

const state: EngineState = {
  audio: null,
  session: null,
  preloaded: false,
  unlockBound: false,
  prefs: loadCallRingtonePreferences(),
  vibrationTimer: null
};

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const prefersReducedSound = (): boolean => {
  try {
    if (!isBrowser()) return false;
    // Prefer reduced motion as a soft signal when users avoid sensory load.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      // Still allow soft ring at lower volume unless silent/disabled.
      return false;
    }
    // Experimental / future a11y media queries — safe no-op if unsupported.
    if (window.matchMedia?.('(prefers-reduced-data: reduce)').matches) {
      return false;
    }
  } catch {
    // ignore
  }
  return false;
};

const pickSources = (role: RingtoneRole): readonly string[] =>
  role === 'incoming' ? SCROLITH_CALL_SOURCES : SCROLITH_RINGBACK_SOURCES;

const ensureAudioElement = (): HTMLAudioElement | null => {
  if (!isBrowser()) return null;
  if (state.audio) return state.audio;
  const el = new Audio();
  el.preload = 'auto';
  el.loop = true;
  el.setAttribute('playsinline', 'true');
  el.setAttribute('data-scrolith-ringtone', 'true');
  // Never mix into call media: separate element, no remote stream.
  state.audio = el;
  return el;
};

const stopVibration = () => {
  if (state.vibrationTimer != null) {
    window.clearInterval(state.vibrationTimer);
    state.vibrationTimer = null;
  }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(0);
    }
  } catch {
    // noop
  }
};

const startVibration = () => {
  stopVibration();
  if (!state.prefs.vibrationEnabled) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    // Short branded pulse pattern, repeated while ringing.
    navigator.vibrate([180, 120, 180, 900]);
    state.vibrationTimer = window.setInterval(() => {
      try {
        navigator.vibrate([180, 120, 180, 900]);
      } catch {
        // noop
      }
    }, 1600);
    try {
      (state.vibrationTimer as unknown as { unref?: () => void }).unref?.();
    } catch {
      // browser
    }
  } catch {
    // noop
  }
};

const applyVolume = (role: RingtoneRole) => {
  const el = state.audio;
  if (!el) return;
  let vol = role === 'incoming' ? state.prefs.incomingVolume : state.prefs.outgoingVolume;
  if (prefersReducedSound()) {
    vol = Math.min(vol, 0.35);
  }
  el.volume = Math.max(0, Math.min(1, vol));
  el.muted = false;
};

const loadSources = (role: RingtoneRole): Promise<void> => {
  const el = ensureAudioElement();
  if (!el) return Promise.resolve();
  const sources = pickSources(role);
  if (!sources.length) return Promise.resolve();

  return new Promise((resolve) => {
    let index = 0;

    const tryNext = () => {
      const source = sources[index++];
      if (!source) {
        resolve();
        return;
      }

      let settled = false;
      let timer: number | null = null;
      const cleanup = () => {
        el.removeEventListener('canplaythrough', onLoaded);
        el.removeEventListener('loadeddata', onLoaded);
        el.removeEventListener('error', onError);
        if (timer != null) {
          window.clearTimeout(timer);
          timer = null;
        }
      };
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (ok) {
          resolve();
        } else {
          tryNext();
        }
      };
      const onLoaded = () => finish(true);
      const onError = () => finish(false);

      el.addEventListener('canplaythrough', onLoaded, { once: true });
      el.addEventListener('loadeddata', onLoaded, { once: true });
      el.addEventListener('error', onError, { once: true });

      timer = window.setTimeout(() => {
        finish(Number(el.readyState || 0) >= 2);
      }, 1500);
      try {
        (timer as unknown as { unref?: () => void }).unref?.();
      } catch {
        // browser timers have no unref
      }

      if (
        el.getAttribute('data-src-role') === role &&
        el.getAttribute('data-src-value') === source &&
        Number(el.readyState || 0) >= 2
      ) {
        finish(true);
        return;
      }

      el.setAttribute('data-src-role', role);
      el.setAttribute('data-src-value', source);
      el.src = source;
      try {
        el.load();
      } catch {
        finish(false);
      }
    };

    tryNext();
  });
};

/**
 * Stop any active ringtone/ringback immediately.
 */
export const stopScrolithCallTone = (reason: RingtoneStopReason = 'manual'): RingtoneSession | null => {
  const prev = state.session;
  stopVibration();
  const el = state.audio;
  if (el) {
    try {
      el.pause();
      el.currentTime = 0;
    } catch {
      // noop
    }
  }
  state.session = null;
  try {
    window.dispatchEvent(
      new CustomEvent('scrolith:call-ringtone', {
        detail: { type: 'stop', reason, previous: prev }
      })
    );
  } catch {
    // noop
  }
  return prev;
};

/**
 * Start looping tone for a call. Dedupes identical sessions; supersedes the other role.
 */
export const startScrolithCallTone = async (options: {
  callId: string;
  role: RingtoneRole;
}): Promise<{ started: boolean; reason?: string }> => {
  const callId = String(options.callId || '').trim();
  const role = options.role;
  if (!callId || !isBrowser()) {
    return { started: false, reason: 'invalid' };
  }

  state.prefs = loadCallRingtonePreferences();
  if (!isRingtonePlaybackAllowed(state.prefs)) {
    stopScrolithCallTone('disabled');
    return { started: false, reason: 'disabled' };
  }

  // Deduplicate: same call + role already playing.
  if (
    state.session &&
    state.session.callId === callId &&
    state.session.role === role &&
    state.audio &&
    !state.audio.paused
  ) {
    return { started: true, reason: 'already_playing' };
  }

  // Supersede any other tone (only one instance).
  if (state.session) {
    stopScrolithCallTone('superseded');
  }

  const el = ensureAudioElement();
  if (!el) return { started: false, reason: 'no_audio_element' };

  await loadSources(role);
  applyVolume(role);
  el.loop = true;

  try {
    // Reset to start for minimal perceived delay.
    try {
      el.currentTime = 0;
    } catch {
      // ignore
    }
    const playPromise = el.play();
    if (playPromise && typeof playPromise.then === 'function') {
      await playPromise;
    }
  } catch (error: any) {
    // Autoplay blocked — wait for unlock; still record session intent for retry.
    state.session = { callId, role, startedAt: Date.now() };
    try {
      window.dispatchEvent(
        new CustomEvent('scrolith:call-ringtone', {
          detail: {
            type: 'autoplay_blocked',
            callId,
            role,
            message: String(error?.message || 'Autoplay blocked')
          }
        })
      );
    } catch {
      // noop
    }
    return { started: false, reason: 'autoplay_blocked' };
  }

  state.session = { callId, role, startedAt: Date.now() };
  if (role === 'incoming') {
    startVibration();
  } else {
    stopVibration();
  }

  try {
    window.dispatchEvent(
      new CustomEvent('scrolith:call-ringtone', {
        detail: { type: 'start', callId, role }
      })
    );
  } catch {
    // noop
  }

  return { started: true };
};

/**
 * Retry play after user gesture when autoplay was blocked.
 */
export const resumeScrolithCallToneIfPending = async (): Promise<boolean> => {
  if (!state.session) return false;
  if (!isRingtonePlaybackAllowed()) return false;
  const el = ensureAudioElement();
  if (!el) return false;
  const role = state.session.role;
  await loadSources(role);
  applyVolume(role);
  try {
    await el.play();
    if (role === 'incoming') startVibration();
    return true;
  } catch {
    return false;
  }
};

/**
 * Prefetch assets after first user interaction (call site or app shell).
 */
export const preloadScrolithCallRingtones = async (): Promise<void> => {
  if (!isBrowser()) return;
  state.prefs = loadCallRingtonePreferences();
  const el = ensureAudioElement();
  if (!el) return;

  // Warm both assets by sequential load (single element).
  for (const role of ['incoming', 'outgoing'] as RingtoneRole[]) {
    await loadSources(role);
  }
  state.preloaded = true;
  try {
    sessionStorage.setItem(PRELOAD_MARK, '1');
  } catch {
    // noop
  }

  // Unlock audio graph with a muted play/pause when possible.
  try {
    const prevVol = el.volume;
    el.volume = 0.001;
    el.muted = true;
    await el.play();
    el.pause();
    el.currentTime = 0;
    el.muted = false;
    el.volume = prevVol;
  } catch {
    // still mark preloaded; real play may need later gesture
  }
};

/**
 * Bind once: any pointer/key gesture preloads + resumes pending tone.
 */
export const bindScrolithCallRingtoneUnlock = (): (() => void) => {
  if (!isBrowser() || state.unlockBound) {
    return () => undefined;
  }
  state.unlockBound = true;

  const onGesture = () => {
    void (async () => {
      if (state.session) {
        await resumeScrolithCallToneIfPending();
        return;
      }
      await preloadScrolithCallRingtones();
    })();
  };

  const opts: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener('pointerdown', onGesture, opts);
  window.addEventListener('pointerup', onGesture, opts);
  window.addEventListener('click', onGesture, opts);
  window.addEventListener('keydown', onGesture, opts);
  window.addEventListener('touchstart', onGesture, opts);
  window.addEventListener('touchend', onGesture, opts);

  try {
    window.addEventListener('scrolith:call-ringtone-preferences', (() => {
      state.prefs = loadCallRingtonePreferences();
      if (state.session) applyVolume(state.session.role);
      if (!isRingtonePlaybackAllowed(state.prefs)) {
        stopScrolithCallTone('disabled');
      }
    }) as EventListener);
  } catch {
    // noop
  }

  return () => {
    window.removeEventListener('pointerdown', onGesture, opts as any);
    window.removeEventListener('pointerup', onGesture, opts as any);
    window.removeEventListener('click', onGesture, opts as any);
    window.removeEventListener('keydown', onGesture, opts as any);
    window.removeEventListener('touchstart', onGesture, opts as any);
    window.removeEventListener('touchend', onGesture, opts as any);
    state.unlockBound = false;
  };
};

export const getScrolithCallRingtoneSession = (): RingtoneSession | null => state.session;

export const isScrolithCallTonePlaying = (): boolean => {
  if (!state.session || !state.audio) return false;
  return !state.audio.paused;
};

/** Test helper — reset singleton (does not remove unlock listeners). */
export const __resetScrolithCallRingtoneEngineForTests = () => {
  stopScrolithCallTone('manual');
  state.audio = null;
  state.preloaded = false;
  state.prefs = loadCallRingtonePreferences();
};
