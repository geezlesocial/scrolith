import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import {
  canEnhanceVideoInBrowser,
  enhanceImageFile,
  enhanceVideoFile,
  isScrolithaMediaEnhancementEnabled
} from '../../services/scrolithaMediaEnhancer';

type Props = {
  file: File | null | undefined;
  kind: 'image' | 'video';
  onAccept: (file: File) => void | Promise<void>;
  onDismiss?: () => void;
  dark?: boolean;
};

const ScrolithaMediaEnhanceOffer: React.FC<Props> = ({ file, kind, onAccept, onDismiss, dark = false }) => {
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [enhancedFile, setEnhancedFile] = useState<File | null>(null);
  const [enhancedUrl, setEnhancedUrl] = useState('');
  const [error, setError] = useState('');
  const enabled = isScrolithaMediaEnhancementEnabled();
  const supported = kind === 'image' || canEnhanceVideoInBrowser();

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      setEnhancedFile(null);
      setEnhancedUrl('');
      setError('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setEnhancedFile(null);
    setEnhancedUrl('');
    setError('');
    return () => {
      URL.revokeObjectURL(url);
      setPreviewUrl('');
    };
  }, [file, kind]);

  useEffect(() => {
    if (!enhancedFile) {
      setEnhancedUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(enhancedFile);
    setEnhancedUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setEnhancedUrl('');
    };
  }, [enhancedFile]);

  const preview = useMemo(() => {
    if (!previewUrl || !enhancedUrl) return null;
    if (kind === 'video') {
      return (
        <div className="grid grid-cols-2 gap-2 overflow-hidden rounded-xl">
          <video src={previewUrl} controls muted playsInline className="h-24 w-full rounded-lg bg-black object-cover" aria-label="Original video" />
          <video src={enhancedUrl} controls muted playsInline className="h-24 w-full rounded-lg bg-black object-cover" aria-label="Scrolitha enhanced video" />
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-2 overflow-hidden rounded-xl">
        <img src={previewUrl} alt="Original media" className="h-24 w-full object-cover" />
        <img src={enhancedUrl} alt="Scrolitha enhancement preview" className="h-24 w-full object-cover" />
      </div>
    );
  }, [enhancedUrl, kind, previewUrl]);

  if (!enabled || !file) return null;

  if (!supported) {
    return (
      <div className={`mt-2 rounded-2xl border p-3 ${dark ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-slate-50 text-slate-900'}`}>
        <p className="text-sm font-semibold">Enhance with Scrolitha</p>
        <p className={`mt-1 text-xs ${dark ? 'text-white/70' : 'text-slate-600'}`}>
          Video enhancement is not available in this browser. You can continue with the original media.
        </p>
        <button type="button" onClick={onDismiss} className="mt-3 rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">
          Keep as is
        </button>
      </div>
    );
  }

  const improve = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const enhanced = kind === 'image' ? await enhanceImageFile(file) : await enhanceVideoFile(file);
      setEnhancedFile(enhanced);
    } catch (enhancementError) {
      console.error('Scrolitha media enhancement failed', enhancementError);
      setError('Scrolitha could not enhance this file right now. Your original is still available.');
    } finally {
      setBusy(false);
    }
  };

  const useEnhanced = async () => {
    if (!enhancedFile || busy) return;
    setBusy(true);
    try {
      await onAccept(enhancedFile);
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    if (busy) return;
    setEnhancedFile(null);
    setEnhancedUrl('');
    setError('');
  };

  return (
    <div className={`mt-2 rounded-2xl border p-3 ${dark ? 'border-cyan-300/20 bg-cyan-400/10 text-white' : 'border-indigo-200 bg-indigo-50 text-slate-900'}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${dark ? 'bg-cyan-300/15 text-cyan-200' : 'bg-white text-indigo-600'}`}>
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Enhance with Scrolitha</p>
          <p className={`mt-1 text-xs ${dark ? 'text-white/70' : 'text-slate-600'}`}>
            Improve clarity, color, and visual polish. Your original stays safe until you approve the result.
          </p>
          {preview}
          {enhancedFile && <p className="mt-2 text-xs font-medium text-emerald-700">Review the comparison, then choose which version to use.</p>}
          {error && <p className="mt-2 text-xs font-medium text-rose-600" role="alert">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {enhancedFile ? (
              <>
                <button type="button" onClick={useEnhanced} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                  Use enhanced
                </button>
                <button type="button" onClick={retry} disabled={busy} className={`rounded-full border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${dark ? 'border-white/20 text-white/80' : 'border-slate-300 text-slate-700'}`}>
                  Try again
                </button>
              </>
            ) : (
              <button type="button" onClick={improve} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                {busy ? 'Improving…' : 'Improve with Scrolitha'}
              </button>
            )}
            <button type="button" onClick={onDismiss} disabled={busy} className={`rounded-full border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${dark ? 'border-white/20 text-white/80' : 'border-slate-300 text-slate-700'}`}>
              {enhancedFile ? 'Keep original' : 'Keep as is'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScrolithaMediaEnhanceOffer;
