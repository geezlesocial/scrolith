/**
 * Scrolith Call ringtone lifecycle tests (node:test + tsx).
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

const memoryStore: Record<string, string> = {};
const audioInstances: any[] = [];

function createMockAudio() {
  const attrs: Record<string, string> = {};
  const listeners: Record<string, Array<() => void>> = {};
  const el: any = {
    src: '',
    loop: false,
    volume: 1,
    muted: false,
    paused: true,
    currentTime: 0,
    setAttribute(name: string, value: string) {
      attrs[name] = String(value);
    },
    getAttribute(name: string) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    addEventListener(type: string, cb: () => void) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(cb);
    },
    removeEventListener(type: string, cb: () => void) {
      listeners[type] = (listeners[type] || []).filter((fn) => fn !== cb);
    },
    load() {
      (listeners.canplaythrough || []).forEach((fn) => fn());
    },
    play() {
      el.paused = false;
      return Promise.resolve();
    },
    pause() {
      el.paused = true;
    }
  };
  audioInstances.push(el);
  return el;
}

function installGlobals() {
  audioInstances.length = 0;
  Object.keys(memoryStore).forEach((k) => delete memoryStore[k]);
  (globalThis as any).window = globalThis;
  (globalThis as any).document = {
    addEventListener() {},
    removeEventListener() {}
  };
  (globalThis as any).localStorage = {
    getItem: (k: string) =>
      Object.prototype.hasOwnProperty.call(memoryStore, k) ? memoryStore[k] : null,
    setItem: (k: string, v: string) => {
      memoryStore[k] = String(v);
    },
    removeItem: (k: string) => {
      delete memoryStore[k];
    },
    clear: () => {
      Object.keys(memoryStore).forEach((key) => delete memoryStore[key]);
    }
  };
  (globalThis as any).sessionStorage = (globalThis as any).localStorage;
  (globalThis as any).Audio = createMockAudio;
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { vibrate: () => true },
      configurable: true,
      writable: true
    });
  } catch {
    try {
      (globalThis as any).navigator.vibrate = () => true;
    } catch {
      // optional
    }
  }
  (globalThis as any).CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, init?: { detail?: any }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  (globalThis as any).addEventListener = () => undefined;
  (globalThis as any).removeEventListener = () => undefined;
  (globalThis as any).dispatchEvent = () => true;
  (globalThis as any).matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {}
  });
}

installGlobals();

const prefs = await import('../../src/messages/callRingtonePreferences.ts');
const ringtone = await import('../../src/messages/scrolithCallRingtone.ts');

describe('callRingtonePreferences', () => {
  beforeEach(() => {
    installGlobals();
    prefs.saveCallRingtonePreferences({ ...prefs.DEFAULT_CALL_RINGTONE_PREFERENCES });
  });

  it('defaults enable Scrolith Call tones', () => {
    const p = prefs.loadCallRingtonePreferences();
    assert.equal(p.ringtoneEnabled, true);
    assert.ok(p.incomingVolume > 0);
    assert.ok(p.outgoingVolume > 0);
  });

  it('silent mode blocks playback', () => {
    prefs.saveCallRingtonePreferences({ silentMode: true });
    assert.equal(prefs.isRingtonePlaybackAllowed(), false);
  });

  it('disabled ringtone blocks playback', () => {
    prefs.saveCallRingtonePreferences({ ringtoneEnabled: false, silentMode: false });
    assert.equal(prefs.isRingtonePlaybackAllowed(), false);
  });

  it('clamps volumes', () => {
    const next = prefs.saveCallRingtonePreferences({ incomingVolume: 2, outgoingVolume: -1 });
    assert.equal(next.incomingVolume, 1);
    assert.equal(next.outgoingVolume, 0);
  });
});

describe('scrolithCallRingtone lifecycle', () => {
  beforeEach(() => {
    installGlobals();
    prefs.saveCallRingtonePreferences({ ...prefs.DEFAULT_CALL_RINGTONE_PREFERENCES });
    ringtone.__resetScrolithCallRingtoneEngineForTests();
  });

  it('uses branded asset paths', () => {
    assert.match(ringtone.SCROLITH_CALL_SOURCES[0], /you-have-call-in-scrolith-ringtone/);
    assert.ok(ringtone.SCROLITH_CALL_SOURCES.some((source) => /scrolith-call/.test(source)));
    assert.match(ringtone.SCROLITH_RINGBACK_SOURCES[0], /scrolith-ringback/);
  });

  it('dedupes incoming start for same callId', async () => {
    const a = await ringtone.startScrolithCallTone({ callId: 'c1', role: 'incoming' });
    assert.equal(a.started, true);
    const b = await ringtone.startScrolithCallTone({ callId: 'c1', role: 'incoming' });
    assert.equal(b.reason, 'already_playing');
    assert.equal(audioInstances.length, 1);
    assert.equal(ringtone.isScrolithCallTonePlaying(), true);
    assert.equal(ringtone.getScrolithCallRingtoneSession()?.role, 'incoming');
  });

  it('outgoing ringback supersedes incoming', async () => {
    await ringtone.startScrolithCallTone({ callId: 'c1', role: 'incoming' });
    const out = await ringtone.startScrolithCallTone({ callId: 'c1', role: 'outgoing' });
    assert.equal(out.started, true);
    assert.equal(ringtone.getScrolithCallRingtoneSession()?.role, 'outgoing');
    assert.equal(audioInstances.length, 1);
  });

  it('stop clears session immediately', async () => {
    await ringtone.startScrolithCallTone({ callId: 'c9', role: 'incoming' });
    ringtone.stopScrolithCallTone('answered');
    assert.equal(ringtone.getScrolithCallRingtoneSession(), null);
    assert.equal(ringtone.isScrolithCallTonePlaying(), false);
    assert.equal(audioInstances[0].paused, true);
    assert.equal(audioInstances[0].currentTime, 0);
  });

  it('rapid calls do not leak Audio elements', async () => {
    for (let i = 0; i < 5; i++) {
      await ringtone.startScrolithCallTone({ callId: `c${i}`, role: 'incoming' });
      ringtone.stopScrolithCallTone('ended');
    }
    assert.equal(audioInstances.length, 1);
  });

  it('disabled prefs refuse start', async () => {
    prefs.saveCallRingtonePreferences({ ringtoneEnabled: false });
    ringtone.__resetScrolithCallRingtoneEngineForTests();
    const result = await ringtone.startScrolithCallTone({ callId: 'cx', role: 'incoming' });
    assert.equal(result.started, false);
    assert.equal(result.reason, 'disabled');
  });

  it('duplicate socket-style events cannot stack loops', async () => {
    await ringtone.startScrolithCallTone({ callId: 'dup', role: 'incoming' });
    await ringtone.startScrolithCallTone({ callId: 'dup', role: 'incoming' });
    await ringtone.startScrolithCallTone({ callId: 'dup', role: 'incoming' });
    assert.equal(audioInstances.length, 1);
    assert.equal(audioInstances[0].loop, true);
  });
});
