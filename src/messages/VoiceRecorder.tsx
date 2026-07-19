import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play, Send, Square, Trash2, X } from 'lucide-react';
import {
  createVoiceFile,
  formatVoiceDuration,
  isUsableVoiceBlob,
  mapMicrophoneError,
  pickSupportedAudioMimeType
} from '../utils/voiceRecording';

type VoiceRecorderProps = {
  disabled?: boolean;
  maxDurationSeconds?: number;
  onRecorded: (blob: Blob, durationMs: number) => Promise<void> | void;
  onError?: (message: string) => void;
  className?: string;
};

type Phase = 'idle' | 'recording' | 'paused' | 'preview' | 'uploading';

/**
 * Phase 21.1.2 — production voice recorder.
 * High-contrast UI, pause/resume, preview-before-send, robust MediaRecorder lifecycle.
 */
const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  disabled,
  maxDurationSeconds = 180,
  onRecorded,
  onError,
  className = ''
}) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [permissionHint, setPermissionHint] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeTypeRef = useRef<string>('');
  const startedAtRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const maxMs = Math.max(5, maxDurationSeconds) * 1000;

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
  };

  const revokePreview = () => {
    if (previewUrl) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch {
        // ignore
      }
    }
    setPreviewUrl(null);
    setPreviewPlaying(false);
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        // ignore
      }
      audioRef.current = null;
    }
  };

  const fullCleanup = () => {
    clearTimer();
    stopTracks();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    blobRef.current = null;
    accumulatedMsRef.current = 0;
    startedAtRef.current = 0;
    setElapsedMs(0);
    revokePreview();
  };

  useEffect(() => () => fullCleanup(), []);

  // Recover automatically when microphone permission is granted after a denial.
  useEffect(() => {
    let statusRef: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => {
      if (cancelled) return;
      if (statusRef?.state === 'granted' && permissionHint) {
        setPermissionHint(null);
      }
    };
    try {
      if (navigator.permissions?.query) {
        void navigator.permissions.query({ name: 'microphone' as PermissionName }).then((status) => {
          if (cancelled) return;
          statusRef = status;
          status.addEventListener('change', onChange);
          if (status.state === 'granted' && permissionHint) {
            setPermissionHint(null);
          }
        });
      }
    } catch {
      // Permissions API not available (some WebViews).
    }
    return () => {
      cancelled = true;
      try {
        statusRef?.removeEventListener('change', onChange);
      } catch {
        // ignore
      }
    };
  }, [permissionHint]);

  const tickElapsed = () => {
    if (phase !== 'recording' && mediaRecorderRef.current?.state !== 'recording') return;
    const live = Date.now() - startedAtRef.current;
    const total = accumulatedMsRef.current + live;
    setElapsedMs(total);
    if (total >= maxMs && mediaRecorderRef.current?.state === 'recording') {
      void stopToPreview();
    }
  };

  const startTimer = () => {
    clearTimer();
    timerRef.current = window.setInterval(tickElapsed, 200);
  };

  const startRecording = async () => {
    if (disabled || phase === 'recording' || phase === 'uploading') return;
    setPermissionHint(null);
    revokePreview();
    blobRef.current = null;
    chunksRef.current = [];
    accumulatedMsRef.current = 0;
    setElapsedMs(0);

    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const msg = mapMicrophoneError({ name: 'Unsupported' });
      setPermissionHint(msg);
      onError?.(msg);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;
      const mimeType = pickSupportedAudioMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        const msg = 'Recording failed. Please try again.';
        setPermissionHint(msg);
        onError?.(msg);
        fullCleanup();
        setPhase('idle');
      };

      startedAtRef.current = Date.now();
      // Timeslice improves blob completeness on Android WebView / Chrome.
      try {
        recorder.start(250);
      } catch {
        recorder.start();
      }
      setPhase('recording');
      startTimer();
    } catch (error: any) {
      fullCleanup();
      setPhase('idle');
      const msg = mapMicrophoneError(error);
      setPermissionHint(msg);
      onError?.(msg);
    }
  };

  const pauseRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    try {
      if (typeof recorder.requestData === 'function') recorder.requestData();
    } catch {
      // ignore
    }
    try {
      recorder.pause();
    } catch {
      return;
    }
    accumulatedMsRef.current += Date.now() - startedAtRef.current;
    clearTimer();
    setPhase('paused');
    setElapsedMs(accumulatedMsRef.current);
  };

  const resumeRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    try {
      recorder.resume();
    } catch {
      return;
    }
    startedAtRef.current = Date.now();
    setPhase('recording');
    startTimer();
  };

  const buildBlobFromChunks = (): Blob | null => {
    if (!chunksRef.current.length) return null;
    const type = mimeTypeRef.current || 'audio/webm';
    return new Blob(chunksRef.current, { type });
  };

  const stopToPreview = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'inactive') {
      const blob = buildBlobFromChunks();
      stopTracks();
      clearTimer();
      if (!isUsableVoiceBlob(blob)) {
        const msg = 'Recording was too short or empty. Hold a moment longer, then stop.';
        setPermissionHint(msg);
        onError?.(msg);
        fullCleanup();
        setPhase('idle');
        return;
      }
      blobRef.current = blob;
      const url = URL.createObjectURL(blob!);
      setPreviewUrl(url);
      setPhase('preview');
      return;
    }

    await new Promise<void>((resolve) => {
      const finish = () => {
        if (recorder.state === 'recording' || recorder.state === 'paused') {
          accumulatedMsRef.current +=
            recorder.state === 'recording' ? Date.now() - startedAtRef.current : 0;
        }
        clearTimer();
        stopTracks();
        const duration = Math.max(accumulatedMsRef.current, elapsedMs);
        setElapsedMs(duration);
        const blob = buildBlobFromChunks();
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        if (!isUsableVoiceBlob(blob)) {
          const msg = 'Recording was too short or empty. Hold a moment longer, then stop.';
          setPermissionHint(msg);
          onError?.(msg);
          fullCleanup();
          setPhase('idle');
          resolve();
          return;
        }
        blobRef.current = blob;
        const url = URL.createObjectURL(blob!);
        setPreviewUrl(url);
        setPhase('preview');
        resolve();
      };

      const previous = recorder.onstop;
      recorder.onstop = () => {
        try {
          previous?.call(recorder, new Event('stop'));
        } catch {
          // ignore
        }
        finish();
      };

      try {
        if (typeof recorder.requestData === 'function') recorder.requestData();
      } catch {
        // ignore
      }
      try {
        if (recorder.state === 'paused') {
          // Some browsers require resume before stop after pause.
          try {
            recorder.resume();
          } catch {
            // ignore
          }
        }
        recorder.stop();
      } catch {
        finish();
      }
    });
  };

  const cancelAll = () => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
    } catch {
      // ignore
    }
    fullCleanup();
    setPhase('idle');
    setPermissionHint(null);
  };

  const togglePreviewPlay = async () => {
    if (!previewUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(previewUrl);
      audioRef.current.onended = () => setPreviewPlaying(false);
    }
    if (previewPlaying) {
      audioRef.current.pause();
      setPreviewPlaying(false);
      return;
    }
    try {
      await audioRef.current.play();
      setPreviewPlaying(true);
    } catch {
      setPreviewPlaying(false);
    }
  };

  const sendRecording = async () => {
    const blob = blobRef.current;
    if (!isUsableVoiceBlob(blob)) {
      const msg = 'Nothing to send. Record again.';
      setPermissionHint(msg);
      onError?.(msg);
      return;
    }
    setPhase('uploading');
    try {
      // Ensure File constructor consumers get a named type.
      const file = createVoiceFile(blob!, mimeTypeRef.current);
      const asBlob = file.slice(0, file.size, file.type);
      await onRecorded(asBlob, Math.max(1, elapsedMs));
      fullCleanup();
      setPhase('idle');
      setPermissionHint(null);
    } catch (error: any) {
      setPhase('preview');
      const msg = error?.message || 'Failed to send voice note.';
      setPermissionHint(msg);
      onError?.(msg);
    }
  };

  const secondsLabel = formatVoiceDuration(elapsedMs);
  const isBusy = phase === 'uploading';
  const showMic = phase === 'idle';

  return (
    <div className={`inline-flex flex-col items-end gap-1 ${className}`} data-testid="voice-recorder" data-phase="21.1.2">
      <div className="inline-flex items-center gap-1.5">
        {phase === 'recording' || phase === 'paused' ? (
          <>
            <span
              className={`inline-flex min-w-[3rem] items-center justify-center rounded-full px-2 py-1 text-[11px] font-bold tabular-nums ${
                phase === 'recording' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
              }`}
              aria-live="polite"
            >
              {phase === 'recording' ? (
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              ) : null}
              {secondsLabel}
            </span>
            {phase === 'recording' ? (
              <button
                type="button"
                onClick={pauseRecording}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-white shadow-sm hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"
                title="Pause"
                aria-label="Pause recording"
              >
                <Pause className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={resumeRecording}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                title="Resume"
                aria-label="Resume recording"
              >
                <Play className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => void stopToPreview()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow-md ring-2 ring-red-200 hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
              title="Stop"
              aria-label="Stop recording"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
            <button
              type="button"
              onClick={cancelAll}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              title="Cancel"
              aria-label="Cancel recording"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : null}

        {phase === 'preview' ? (
          <>
            <span className="inline-flex min-w-[3rem] items-center justify-center rounded-full bg-slate-900 px-2 py-1 text-[11px] font-bold text-white tabular-nums">
              {secondsLabel}
            </span>
            <button
              type="button"
              onClick={() => void togglePreviewPlay()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm hover:bg-indigo-700"
              title={previewPlaying ? 'Pause preview' : 'Play preview'}
              aria-label={previewPlaying ? 'Pause preview' : 'Play preview'}
            >
              {previewPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={cancelAll}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              title="Discard"
              aria-label="Discard recording"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void sendRecording()}
              className="inline-flex h-9 min-w-[2.25rem] items-center justify-center gap-1 rounded-full bg-blue-600 px-3 text-white shadow-md hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              title="Send voice note"
              aria-label="Send voice note"
            >
              <Send className="h-4 w-4" />
            </button>
          </>
        ) : null}

        {phase === 'uploading' ? (
          <span className="inline-flex h-9 items-center gap-2 rounded-full bg-blue-600 px-3 text-xs font-semibold text-white">
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending…
          </span>
        ) : null}

        {showMic ? (
          <button
            type="button"
            disabled={Boolean(disabled) || isBusy}
            onClick={() => void startRecording()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md ring-2 ring-blue-200/80 transition hover:from-blue-700 hover:to-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
            title="Record voice note"
            aria-label="Record voice note"
          >
            <Mic className="h-5 w-5" strokeWidth={2.25} />
          </button>
        ) : null}
      </div>

      {permissionHint ? (
        <div
          className="max-w-[16rem] rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900"
          role="status"
        >
          <p>{permissionHint}</p>
          {phase === 'idle' ? (
            <button
              type="button"
              className="mt-1 font-semibold text-amber-950 underline"
              onClick={() => void startRecording()}
            >
              Retry microphone
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default VoiceRecorder;
