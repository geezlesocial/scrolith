import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play, Send, Square, Trash2, X } from 'lucide-react';
import {
  acquireMicrophoneStream,
  classifyMicrophoneError,
  createVoiceFile,
  formatVoiceDuration,
  isUsableVoiceBlob,
  isVoiceRecordingSupported,
  logVoiceDiagnostic,
  pickSupportedAudioMimeType,
  type VoiceErrorInfo
} from '../utils/voiceRecording';

type VoiceRecorderProps = {
  disabled?: boolean;
  maxDurationSeconds?: number;
  onRecorded: (blob: Blob, durationMs: number) => Promise<void> | void;
  onError?: (message: string) => void;
  className?: string;
};

type Phase =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'preview'
  | 'uploading'
  | 'error';

/**
 * Phase 21.1.2R — production voice recorder.
 * User-gesture getUserMedia, precise errors, mobile-safe banner, lifecycle cleanup.
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
  const [errorInfo, setErrorInfo] = useState<VoiceErrorInfo | null>(null);
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
  const startingRef = useRef(false);
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
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onerror = null;
        mediaRecorderRef.current.onstop = null;
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    blobRef.current = null;
    accumulatedMsRef.current = 0;
    startedAtRef.current = 0;
    setElapsedMs(0);
    revokePreview();
  };

  useEffect(() => () => fullCleanup(), []);

  const reportError = (info: VoiceErrorInfo, stage: string) => {
    setErrorInfo(info);
    setPhase('error');
    logVoiceDiagnostic({
      stage,
      category: info.category,
      mimeType: mimeTypeRef.current,
      recorderState: mediaRecorderRef.current?.state,
      technical: info.technical
    } as any);
    onError?.(info.message);
  };

  const tickElapsed = () => {
    if (mediaRecorderRef.current?.state !== 'recording') return;
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

  const beginRecorder = (stream: MediaStream) => {
    streamRef.current = stream;
    const mimeType = pickSupportedAudioMimeType();
    mimeTypeRef.current = mimeType;
    // Prefer explicit MIME when supported; else let the engine choose.
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    // Capture actual mime if engine negotiated a different type
    try {
      if (recorder.mimeType) mimeTypeRef.current = recorder.mimeType;
    } catch {
      // ignore
    }
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
      reportError(
        {
          category: 'unknown',
          message: 'Recording failed. Please try again.',
          retryable: true
        },
        'recorder_error'
      );
      fullCleanup();
      setPhase('idle');
    };

    startedAtRef.current = Date.now();
    accumulatedMsRef.current = 0;
    setElapsedMs(0);
    try {
      recorder.start(250);
    } catch {
      try {
        recorder.start();
      } catch (error: any) {
        stopTracks();
        throw error;
      }
    }
    setPhase('recording');
    setErrorInfo(null);
    startTimer();
    logVoiceDiagnostic({
      stage: 'recording_started',
      mimeType: mimeTypeRef.current,
      recorderState: recorder.state
    });
  };

  /**
   * Must be invoked from a click/touch handler (user gesture).
   * Does not pre-probe permission on mount.
   */
  const startRecording = async () => {
    if (disabled || startingRef.current) return;
    if (phase === 'recording' || phase === 'uploading' || phase === 'requesting_permission') return;

    startingRef.current = true;
    setErrorInfo(null);
    revokePreview();
    blobRef.current = null;
    chunksRef.current = [];
    accumulatedMsRef.current = 0;
    setElapsedMs(0);
    setPhase('requesting_permission');

    if (!isVoiceRecordingSupported()) {
      const info = classifyMicrophoneError({ name: 'Unsupported' });
      reportError(info, 'unsupported');
      setPhase('idle');
      startingRef.current = false;
      return;
    }

    // Ensure no stale stream holds the device.
    stopTracks();
    mediaRecorderRef.current = null;

    try {
      let stream: MediaStream;
      try {
        stream = await acquireMicrophoneStream();
      } catch (firstError) {
        // One recovery attempt: release anything leftover and retry once.
        stopTracks();
        const classified = classifyMicrophoneError(firstError);
        if (classified.category === 'microphone_busy' || classified.category === 'unknown' || classified.category === 'overconstrained') {
          await new Promise((r) => setTimeout(r, 120));
          stream = await acquireMicrophoneStream();
        } else {
          throw firstError;
        }
      }
      beginRecorder(stream);
    } catch (error: any) {
      fullCleanup();
      setPhase('idle');
      const info = classifyMicrophoneError(error);
      reportError(info, 'get_user_media');
    } finally {
      startingRef.current = false;
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
    if (!recorder || phase === 'stopping') return;
    setPhase('stopping');

    const finalize = (duration: number) => {
      clearTimer();
      stopTracks();
      setElapsedMs(duration);
      // Brief wait: some WebViews flush last chunk after stop.
      const blob = buildBlobFromChunks();
      chunksRef.current = [];
      mediaRecorderRef.current = null;

      const minDuration = 350;
      if (!isUsableVoiceBlob(blob, { minBytes: 32, minDurationMs: minDuration, durationMs: duration })) {
        const tooShort = duration < minDuration;
        reportError(
          {
            category: tooShort ? 'too_short' : 'empty_blob',
            message: tooShort
              ? 'Recording was too short. Hold a moment longer, then stop.'
              : 'Recording was empty. Check the microphone and try again.',
            retryable: true
          },
          'blob_validate'
        );
        fullCleanup();
        setPhase('idle');
        return;
      }
      blobRef.current = blob;
      const url = URL.createObjectURL(blob!);
      setPreviewUrl(url);
      setPhase('preview');
      setErrorInfo(null);
      logVoiceDiagnostic({
        stage: 'preview_ready',
        mimeType: mimeTypeRef.current,
        blobSize: blob!.size,
        durationMs: duration
      });
    };

    if (recorder.state === 'inactive') {
      const duration = Math.max(accumulatedMsRef.current, elapsedMs);
      finalize(duration);
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (recorder.state === 'recording') {
          accumulatedMsRef.current += Date.now() - startedAtRef.current;
        }
        const duration = Math.max(accumulatedMsRef.current, elapsedMs, 1);
        // Allow late dataavailable events
        window.setTimeout(() => {
          finalize(duration);
          resolve();
        }, 80);
      };

      recorder.onstop = () => finish();

      try {
        if (typeof recorder.requestData === 'function') recorder.requestData();
      } catch {
        // ignore
      }
      try {
        if (recorder.state === 'paused') {
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
      // Safety timeout if onstop never fires
      window.setTimeout(() => finish(), 1500);
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
    setErrorInfo(null);
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
    if (!isUsableVoiceBlob(blob, { minBytes: 32 })) {
      reportError(
        { category: 'empty_blob', message: 'Nothing to send. Record again.', retryable: true },
        'send_validate'
      );
      return;
    }
    setPhase('uploading');
    setErrorInfo(null);
    try {
      const file = createVoiceFile(blob!, mimeTypeRef.current);
      const asBlob = file.slice(0, file.size, file.type);
      await onRecorded(asBlob, Math.max(1, elapsedMs));
      fullCleanup();
      setPhase('idle');
      setErrorInfo(null);
      logVoiceDiagnostic({
        stage: 'upload_sent',
        mimeType: mimeTypeRef.current,
        blobSize: blob!.size,
        durationMs: elapsedMs
      });
    } catch (error: any) {
      setPhase('preview');
      reportError(
        {
          category: 'upload_failed',
          message: error?.message || 'Failed to send voice note.',
          technical: String(error?.message || ''),
          retryable: true
        },
        'upload'
      );
      setPhase('preview');
    }
  };

  const secondsLabel = formatVoiceDuration(elapsedMs);
  const isBusy = phase === 'uploading' || phase === 'requesting_permission';
  const showMic = phase === 'idle' || phase === 'error';

  return (
    <div
      className={`inline-flex w-full max-w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end ${className}`}
      data-testid="voice-recorder"
      data-phase="21.1.2R"
      data-voice-phase={phase}
    >
      {errorInfo ? (
        <div
          className="order-first w-full max-w-full rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-950 sm:max-w-[18rem]"
          role="status"
          data-testid="voice-recorder-error"
          data-error-category={errorInfo.category}
        >
          <p className="font-semibold">Microphone unavailable</p>
          <p className="mt-0.5 text-amber-900/90">{errorInfo.message}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {errorInfo.retryable && showMic ? (
              <button
                type="button"
                className="rounded-full bg-amber-900 px-2.5 py-1 text-[10px] font-bold text-white"
                onClick={() => void startRecording()}
              >
                Retry
              </button>
            ) : null}
            <button
              type="button"
              className="text-[10px] font-semibold text-amber-900 underline"
              onClick={() => setErrorInfo(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
        {phase === 'requesting_permission' ? (
          <span className="inline-flex h-9 items-center gap-2 rounded-full bg-slate-800 px-3 text-xs font-semibold text-white">
            <Loader2 className="h-4 w-4 animate-spin" />
            Requesting mic…
          </span>
        ) : null}

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
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-white shadow-sm hover:bg-slate-700"
                title="Pause"
                aria-label="Pause recording"
              >
                <Pause className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={resumeRecording}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                title="Resume"
                aria-label="Resume recording"
              >
                <Play className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => void stopToPreview()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow-md ring-2 ring-red-200 hover:bg-red-700"
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

        {phase === 'preview' || phase === 'stopping' ? (
          <>
            <span className="inline-flex min-w-[3rem] items-center justify-center rounded-full bg-slate-900 px-2 py-1 text-[11px] font-bold text-white tabular-nums">
              {secondsLabel}
            </span>
            {phase === 'preview' ? (
              <>
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
                  className="inline-flex h-9 min-w-[2.25rem] items-center justify-center gap-1 rounded-full bg-blue-600 px-3 text-white shadow-md hover:bg-blue-700"
                  title="Send voice note"
                  aria-label="Send voice note"
                >
                  <Send className="h-4 w-4" />
                </button>
              </>
            ) : (
              <span className="inline-flex h-9 items-center gap-2 rounded-full bg-slate-700 px-3 text-xs font-semibold text-white">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </span>
            )}
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
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md ring-2 ring-blue-200/80 transition hover:from-blue-700 hover:to-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
            title="Record voice note"
            aria-label="Record voice note"
          >
            <Mic className="h-5 w-5" strokeWidth={2.25} />
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default VoiceRecorder;
