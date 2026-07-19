import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Pause, Play, RefreshCw } from 'lucide-react';
import { formatVoiceDuration, logVoiceDiagnostic } from '../../utils/voiceRecording';
import { getDeterministicWaveform } from '../../utils/voiceWaveform';

type VoiceNotePlayerProps = {
  src: string;
  durationMsHint?: number;
  name?: string;
  outgoing?: boolean;
  /** Stable id for waveform cache / React identity (attachment or message id). */
  attachmentId?: string | null;
  onDownload?: () => void;
  onRequestRefreshSrc?: () => Promise<string | null | void> | string | null | void;
  className?: string;
};

const SPEEDS = [1, 1.5, 2] as const;
const BAR_COUNT = 28;
/** Progress visual updates ~8/s — avoids layout thrash from native timeupdate storms. */
const PROGRESS_MIN_INTERVAL_MS = 125;

/**
 * Phase 21.1.2S — layout-stable voice player.
 * Root causes fixed: per-timeupdate React re-renders, duration-dependent waveform rebuild,
 * conditional error height, unstable parent callbacks remounting Audio.
 */
const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  src,
  durationMsHint = 0,
  name = 'Voice note',
  outgoing = false,
  attachmentId,
  onDownload,
  onRequestRefreshSrc,
  className = ''
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const refreshSrcRef = useRef(onRequestRefreshSrc);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const seekRef = useRef<HTMLInputElement | null>(null);
  const currentLabelRef = useRef<HTMLSpanElement | null>(null);
  const durationLabelRef = useRef<HTMLSpanElement | null>(null);
  const durationMsRef = useRef(Math.max(0, durationMsHint));
  const currentMsRef = useRef(0);
  const lastProgressPaintRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const autoRetriedRef = useRef(false);
  const mountedRef = useRef(true);

  const [activeSrc, setActiveSrc] = useState(src);
  const [playing, setPlaying] = useState(false);
  const [durationMs, setDurationMs] = useState(Math.max(0, durationMsHint));
  const [speedIdx, setSpeedIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Reserved error slot: never collapse card height when retry appears.
  const [hasErrorSlot, setHasErrorSlot] = useState(false);

  const shell = outgoing
    ? 'border-white/25 bg-white/10 text-white'
    : 'border-slate-200 bg-slate-50 text-slate-800';
  const muted = outgoing ? 'text-white/80' : 'text-slate-500';
  const track = outgoing ? 'bg-white/25' : 'bg-slate-200';
  const fill = outgoing ? 'bg-white' : 'bg-blue-600';

  const waveformSeed = useMemo(() => {
    const id = String(attachmentId || '').trim();
    if (id) return id;
    // Strip volatile query (retry=) so remounts keep the same shape.
    return String(src || 'voice').split('?')[0];
  }, [attachmentId, src]);

  const bars = useMemo(() => getDeterministicWaveform(waveformSeed, BAR_COUNT), [waveformSeed]);

  useEffect(() => {
    refreshSrcRef.current = onRequestRefreshSrc;
  }, [onRequestRefreshSrc]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const paintProgress = useCallback((ms: number, force = false) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!force && now - lastProgressPaintRef.current < PROGRESS_MIN_INTERVAL_MS) return;
    lastProgressPaintRef.current = now;
    currentMsRef.current = ms;
    const total = durationMsRef.current;
    const ratio = total > 0 ? Math.min(1, Math.max(0, ms / total)) : 0;
    if (progressFillRef.current) {
      progressFillRef.current.style.transform = `scaleX(${ratio})`;
    }
    if (seekRef.current && document.activeElement !== seekRef.current) {
      seekRef.current.value = String(Math.round(ratio * 1000));
    }
    if (currentLabelRef.current) {
      currentLabelRef.current.textContent = formatVoiceDuration(ms);
    }
  }, []);

  const stopRaf = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const startRaf = () => {
    stopRaf();
    const tick = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused) {
        rafRef.current = null;
        return;
      }
      paintProgress(Math.round(audio.currentTime * 1000));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    setActiveSrc(src);
    autoRetriedRef.current = false;
  }, [src]);

  useEffect(() => {
    if (!activeSrc) {
      setLoading(false);
      setError('Audio unavailable');
      setHasErrorSlot(true);
      return;
    }

    const audio = new Audio();
    audio.preload = 'metadata';
    try {
      (audio as any).playsInline = true;
      audio.setAttribute('playsinline', 'true');
    } catch {
      // ignore
    }
    audio.src = activeSrc;
    audioRef.current = audio;
    setLoading(true);
    setError(null);
    setPlaying(false);
    currentMsRef.current = 0;
    paintProgress(0, true);

    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        const ms = Math.round(audio.duration * 1000);
        durationMsRef.current = ms;
        setDurationMs(ms);
        if (durationLabelRef.current) {
          durationLabelRef.current.textContent = formatVoiceDuration(ms);
        }
      }
      setLoading(false);
    };
    const onEnd = () => {
      stopRaf();
      setPlaying(false);
      paintProgress(0, true);
      try {
        audio.currentTime = 0;
      } catch {
        // ignore
      }
    };
    const onErr = () => {
      stopRaf();
      const mediaError = audio.error;
      const code = mediaError?.code;
      const detail =
        code === 1
          ? 'aborted'
          : code === 2
            ? 'network'
            : code === 3
              ? 'decode'
              : code === 4
                ? 'src_not_supported'
                : 'unknown';
      logVoiceDiagnostic({
        stage: 'playback_error',
        category: detail === 'decode' || detail === 'src_not_supported' ? 'codec_failed' : 'playback_failed',
        technical: `MediaError ${code || 0} ${detail}`
      } as any);
      setLoading(false);
      setPlaying(false);
      setHasErrorSlot(true);

      if (!autoRetriedRef.current) {
        autoRetriedRef.current = true;
        void (async () => {
          try {
            const refresh = refreshSrcRef.current;
            if (refresh) {
              const next = await refresh();
              if (next && String(next) !== activeSrc && mountedRef.current) {
                setActiveSrc(String(next));
                return;
              }
            }
            audio.load();
            if (mountedRef.current) {
              setLoading(true);
              setError(null);
            }
          } catch {
            if (mountedRef.current) {
              setError('Playback failed. Tap retry.');
            }
          }
        })();
        return;
      }
      setError(
        detail === 'src_not_supported' || detail === 'decode'
          ? 'This voice note format is not supported on this device. Try download.'
          : 'Playback failed. Tap retry.'
      );
    };
    const onCanPlay = () => setLoading(false);

    audio.addEventListener('loadedmetadata', onMeta);
    // Intentionally NOT binding timeupdate → React setState (layout jank source).
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('error', onErr);
    audio.addEventListener('canplay', onCanPlay);

    return () => {
      stopRaf();
      audio.pause();
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('error', onErr);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeAttribute('src');
      try {
        audio.load();
      } catch {
        // ignore
      }
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh via ref; paintProgress stable
  }, [activeSrc]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEEDS[speedIdx] || 1;
    }
  }, [speedIdx]);

  useEffect(() => {
    durationMsRef.current = durationMs;
    if (durationLabelRef.current) {
      durationLabelRef.current.textContent = formatVoiceDuration(durationMs);
    }
  }, [durationMs]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      stopRaf();
      setPlaying(false);
      paintProgress(Math.round(audio.currentTime * 1000), true);
      return;
    }
    try {
      setError(null);
      await audio.play();
      setPlaying(true);
      startRaf();
    } catch (err: any) {
      stopRaf();
      logVoiceDiagnostic({
        stage: 'playback_play_reject',
        category: 'playback_failed',
        technical: String(err?.name || err?.message || 'play_failed')
      } as any);
      setHasErrorSlot(true);
      setError('Unable to play. Tap retry.');
      setPlaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, paintProgress]);

  const onSeekInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const ratio = Number(event.target.value) / 1000;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const next = Math.min(1, Math.max(0, ratio)) * audio.duration;
    audio.currentTime = next;
    paintProgress(Math.round(next * 1000), true);
  };

  const retry = async () => {
    setError(null);
    setLoading(true);
    autoRetriedRef.current = false;
    try {
      const refresh = refreshSrcRef.current;
      if (refresh) {
        const next = await refresh();
        if (next) {
          setActiveSrc(String(next));
          return;
        }
      }
      const audio = audioRef.current;
      if (audio) {
        audio.load();
        try {
          await audio.play();
          setPlaying(true);
          setLoading(false);
          startRaf();
        } catch {
          setPlaying(false);
          setLoading(false);
          setHasErrorSlot(true);
          setError('Playback failed. Tap retry.');
        }
      } else {
        setActiveSrc(`${src}${src.includes('?') ? '&' : '?'}retry=${Date.now()}`);
      }
    } catch {
      setLoading(false);
      setHasErrorSlot(true);
      setError('Playback failed. Tap retry.');
    }
  };

  return (
    <div
      className={`voice-note-player flex w-full min-w-[13.5rem] max-w-sm flex-col gap-1.5 rounded-2xl border px-3 py-2.5 ${shell} ${className}`}
      data-testid="voice-note-player"
      data-phase="21.1.2S"
      data-attachment-id={attachmentId || undefined}
      onClick={(e) => e.stopPropagation()}
      style={{
        // Contain layout/paint so progress animations cannot reflow the message list.
        contain: 'layout paint',
        minHeight: hasErrorSlot ? '5.75rem' : '4.5rem'
      }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void togglePlay()}
          disabled={loading && !error}
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none ${
            outgoing
              ? 'bg-white text-blue-700 focus-visible:outline-white'
              : 'bg-blue-600 text-white focus-visible:outline-blue-600'
          } disabled:opacity-60`}
          aria-label={playing ? 'Pause voice note' : 'Play voice note'}
          title={playing ? 'Pause' : 'Play'}
        >
          {loading && !error ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          ) : playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="ml-0.5 h-4 w-4" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          {/* Fixed-height waveform: bars never change; progress is a transform-only fill. */}
          <div
            className="relative mb-1 h-6 w-full overflow-hidden rounded-sm"
            aria-hidden
            data-testid="voice-waveform"
          >
            {/* Progress: transform-only fill — never changes bar count/heights */}
            <div
              ref={progressFillRef}
              className={`pointer-events-none absolute inset-y-0 left-0 w-full origin-left will-change-transform ${fill} opacity-25 motion-reduce:transition-none`}
              style={{ transform: 'scaleX(0)' }}
              data-testid="voice-progress-fill"
            />
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {bars.map((h, i) => (
                <span
                  key={i}
                  className={`w-[3px] shrink-0 rounded-full ${track}`}
                  style={{ height: `${Math.round(h * 100)}%` }}
                />
              ))}
            </div>
          </div>
          <input
            ref={seekRef}
            type="range"
            min={0}
            max={1000}
            defaultValue={0}
            onChange={onSeekInput}
            className="h-1.5 w-full cursor-pointer accent-blue-600"
            aria-label={`Seek ${name}`}
          />
          <div
            className={`mt-0.5 flex items-center justify-between text-[10px] font-medium tabular-nums ${muted}`}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            <span ref={currentLabelRef} className="inline-block min-w-[2.25rem]">
              {formatVoiceDuration(0)}
            </span>
            <span ref={durationLabelRef} className="inline-block min-w-[2.25rem] text-right">
              {formatVoiceDuration(durationMs)}
            </span>
          </div>
        </div>

        <div className="flex w-10 shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
            className={`inline-flex h-6 w-10 items-center justify-center rounded-full text-[10px] font-bold tabular-nums ${
              outgoing ? 'bg-white/15 hover:bg-white/25' : 'bg-slate-200 hover:bg-slate-300'
            }`}
            aria-label={`Playback speed ${SPEEDS[speedIdx]}x`}
            title="Change speed"
          >
            {SPEEDS[speedIdx]}x
          </button>
          {onDownload ? (
            <button
              type="button"
              onClick={onDownload}
              className={`inline-flex h-6 w-6 items-center justify-center rounded ${
                outgoing ? 'hover:bg-white/15' : 'hover:bg-slate-200'
              }`}
              aria-label={`Download ${name}`}
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="inline-flex h-6 w-6" aria-hidden />
          )}
        </div>
      </div>

      {/* Always-reserved error band when error ever appeared — prevents card height jump */}
      <div
        className={`grid transition-[grid-template-rows] duration-150 motion-reduce:transition-none ${
          error || hasErrorSlot ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
        aria-live="polite"
      >
        <div className="overflow-hidden">
          <div
            className={`flex min-h-[1.25rem] items-center gap-2 text-[11px] ${
              outgoing ? 'text-amber-100' : 'text-amber-800'
            } ${error ? 'opacity-100' : 'opacity-0'}`}
            role="status"
          >
            <span className="min-w-0 flex-1 truncate">{error || ' '}</span>
            <button
              type="button"
              onClick={() => void retry()}
              className="inline-flex shrink-0 items-center gap-1 font-semibold underline"
              aria-label="Retry playback"
              tabIndex={error ? 0 : -1}
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(VoiceNotePlayer);
