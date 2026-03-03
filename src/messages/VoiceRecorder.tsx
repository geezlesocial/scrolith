import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

type VoiceRecorderProps = {
  disabled?: boolean;
  maxDurationSeconds?: number;
  onRecorded: (blob: Blob, durationMs: number) => Promise<void> | void;
  onError?: (message: string) => void;
  className?: string;
};

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  disabled,
  maxDurationSeconds = 180,
  onRecorded,
  onError,
  className = ''
}) => {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const cleanupStream = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  useEffect(() => () => cleanupStream(), []);

  const preferredMimeType = () => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
    for (const value of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(value)) return value;
    }
    return '';
  };

  const startRecording = async () => {
    if (disabled || recording || processing) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.('Audio recording is not supported on this device/browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      setElapsedMs(0);

      const mimeType = preferredMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const duration = Math.max(0, Date.now() - startedAtRef.current);
        const blobType = mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: blobType });
        chunksRef.current = [];
        cleanupStream();
        setRecording(false);
        setProcessing(true);
        try {
          await onRecorded(blob, duration);
        } finally {
          setProcessing(false);
        }
      };

      recorder.start(250);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const next = Date.now() - startedAtRef.current;
        setElapsedMs(next);
        if (next >= maxDurationSeconds * 1000 && mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 200);
    } catch (error: any) {
      cleanupStream();
      setRecording(false);
      onError?.(error?.message || 'Unable to start recording.');
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;
    mediaRecorderRef.current.stop();
  };

  const seconds = Math.max(0, Math.round(elapsedMs / 1000));

  return (
    <button
      type="button"
      disabled={Boolean(disabled) || processing}
      onClick={recording ? stopRecording : () => void startRecording()}
      className={`inline-flex items-center gap-1.5 rounded-full p-2 transition ${
        recording
          ? 'bg-red-600 text-white hover:bg-red-700'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      } disabled:opacity-50 ${className}`}
      title={recording ? `Stop recording (${seconds}s)` : 'Record voice note'}
    >
      {processing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : recording ? (
        <>
          <Square className="h-4 w-4" />
          <span className="text-[10px] font-semibold">{seconds}s</span>
        </>
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </button>
  );
};

export default VoiceRecorder;
