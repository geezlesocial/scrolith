import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, Pause, Play, RefreshCw } from 'lucide-react';
import { formatVoiceDuration, logVoiceDiagnostic } from '../../utils/voiceRecording';

type VoiceNotePlayerProps = {
  src: string;
  durationMsHint?: number;
  name?: string;
  outgoing?: boolean;
  onDownload?: () => void;
  onRequestRefreshSrc?: () => Promise<string | null | void> | string | null | void;
  className?: string;
};

const SPEEDS = [1, 1.5, 2] as const;

/**
 * Phase 21.1.2R — enterprise voice-note playback with retry + media error capture.
 */
const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  src,
  durationMsHint = 0,
  name = 'Voice note',
  outgoing = false,
  onDownload,
  onRequestRefreshSrc,
  className = ''
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeSrc, setActiveSrc] = useState(src);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(Math.max(0, durationMsHint));
  const [speedIdx, setSpeedIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const autoRetriedRef = useRef(false);

  const shell = outgoing
    ? 'border-white/25 bg-white/10 text-white'
    : 'border-slate-200 bg-slate-50 text-slate-800';
  const muted = outgoing ? 'text-white/80' : 'text-slate-500';
  const accent = outgoing ? 'bg-white' : 'bg-blue-600';
  const track = outgoing ? 'bg-white/25' : 'bg-slate-200';

  useEffect(() => {
    setActiveSrc(src);
    autoRetriedRef.current = false;
  }, [src]);

  useEffect(() => {
    if (!activeSrc) {
      setLoading(false);
      setError('Audio unavailable');
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
    // Blob/object URLs from messaging media do not need CORS; leave crossOrigin unset.
    audio.src = activeSrc;
    audioRef.current = audio;
    setLoading(true);
    setError(null);
    setPlaying(false);
    setCurrentMs(0);

    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationMs(Math.round(audio.duration * 1000));
      }
      setLoading(false);
    };
    const onTime = () => setCurrentMs(Math.round(audio.currentTime * 1000));
    const onEnd = () => {
      setPlaying(false);
      setCurrentMs(0);
      try {
        audio.currentTime = 0;
      } catch {
        // ignore
      }
    };
    const onErr = () => {
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

      // Auto-retry once (refresh URL if possible)
      if (!autoRetriedRef.current) {
        autoRetriedRef.current = true;
        void (async () => {
          try {
            if (onRequestRefreshSrc) {
              const next = await onRequestRefreshSrc();
              if (next && String(next) !== activeSrc) {
                setActiveSrc(String(next));
                return;
              }
            }
            // Hard reload same src
            audio.load();
            setLoading(true);
            setError(null);
          } catch {
            setError('Playback failed. Tap retry.');
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
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('error', onErr);
    audio.addEventListener('canplay', onCanPlay);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('timeupdate', onTime);
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
  }, [activeSrc, onRequestRefreshSrc]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEEDS[speedIdx] || 1;
    }
  }, [speedIdx]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    try {
      setError(null);
      await audio.play();
      setPlaying(true);
    } catch (err: any) {
      logVoiceDiagnostic({
        stage: 'playback_play_reject',
        category: 'playback_failed',
        technical: String(err?.name || err?.message || 'play_failed')
      } as any);
      setError('Unable to play. Tap retry.');
      setPlaying(false);
    }
  }, [playing]);

  const seek = (ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const next = Math.min(1, Math.max(0, ratio)) * audio.duration;
    audio.currentTime = next;
    setCurrentMs(Math.round(next * 1000));
  };

  const retry = async () => {
    setError(null);
    setLoading(true);
    autoRetriedRef.current = false;
    try {
      if (onRequestRefreshSrc) {
        const next = await onRequestRefreshSrc();
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
        } catch {
          setPlaying(false);
          setLoading(false);
          setError('Playback failed. Tap retry.');
        }
      } else {
        setActiveSrc(`${src}${src.includes('?') ? '&' : '?'}retry=${Date.now()}`);
      }
    } catch {
      setLoading(false);
      setError('Playback failed. Tap retry.');
    }
  };

  const progress = durationMs > 0 ? Math.min(1, currentMs / durationMs) : 0;
  const bars = Array.from({ length: 24 }, (_, i) => {
    const wave = 0.35 + 0.55 * Math.abs(Math.sin((i + 1) * 0.7 + (durationMs % 17) * 0.1));
    return wave;
  });

  return (
    <div
      className={`flex w-full min-w-[12rem] max-w-sm flex-col gap-1.5 rounded-2xl border px-3 py-2.5 ${shell} ${className}`}
      data-testid="voice-note-player"
      data-phase="21.1.2R"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void togglePlay()}
          disabled={loading && !error}
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
            outgoing
              ? 'bg-white text-blue-700 focus-visible:outline-white'
              : 'bg-blue-600 text-white focus-visible:outline-blue-600'
          } disabled:opacity-60`}
          aria-label={playing ? 'Pause voice note' : 'Play voice note'}
          title={playing ? 'Pause' : 'Play'}
        >
          {loading && !error ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="ml-0.5 h-4 w-4" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex h-6 items-end gap-[2px]" aria-hidden>
            {bars.map((h, i) => {
              const active = i / bars.length <= progress;
              return (
                <span
                  key={i}
                  className={`w-[3px] rounded-full transition-colors ${active ? accent : track}`}
                  style={{ height: `${Math.round(h * 100)}%` }}
                />
              );
            })}
          </div>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(progress * 1000)}
            onChange={(e) => seek(Number(e.target.value) / 1000)}
            className="h-1.5 w-full cursor-pointer accent-blue-600"
            aria-label={`Seek ${name}`}
          />
          <div className={`mt-0.5 flex items-center justify-between text-[10px] font-medium tabular-nums ${muted}`}>
            <span>{formatVoiceDuration(currentMs)}</span>
            <span>{formatVoiceDuration(durationMs)}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
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
              className={`rounded p-0.5 ${outgoing ? 'hover:bg-white/15' : 'hover:bg-slate-200'}`}
              aria-label={`Download ${name}`}
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div
          className={`flex items-center gap-2 text-[11px] ${outgoing ? 'text-amber-100' : 'text-amber-800'}`}
          role="status"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => void retry()}
            className="inline-flex items-center gap-1 font-semibold underline"
            aria-label="Retry playback"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default React.memo(VoiceNotePlayer);
