/**
 * Phase 21.1.2S — deterministic voice-note waveform bars (once per attachment).
 * Never use Math.random() or rebuild from playback time.
 */

const cache = new Map<string, number[]>();
const MAX_CACHE = 200;

const stableHash = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/**
 * Returns BAR_COUNT heights in [0.28, 1] derived solely from `seed`.
 * Cached so React remounts re-use the same shape.
 */
export const getDeterministicWaveform = (seed: string, barCount = 28): number[] => {
  const key = `${barCount}:${String(seed || 'voice')}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const bars: number[] = [];
  let h = stableHash(key || 'voice');
  for (let i = 0; i < barCount; i += 1) {
    h = Math.imul(h ^ (i + 1), 0x9e3779b1) >>> 0;
    // Smooth envelope so bars look intentional without audio analysis.
    const envelope = 0.55 + 0.45 * Math.sin((i / barCount) * Math.PI);
    const noise = (h % 1000) / 1000;
    const height = 0.28 + 0.72 * envelope * (0.45 + 0.55 * noise);
    bars.push(Math.min(1, Math.max(0.28, height)));
  }

  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, bars);
  return bars;
};

export const clearWaveformCacheForTests = () => cache.clear();

export const waveformCacheSize = () => cache.size;
