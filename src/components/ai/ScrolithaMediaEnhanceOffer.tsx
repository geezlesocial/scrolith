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
  const enabled = isScrolithaMediaEnhancementEnabled();
  const supported = kind === 'image' || canEnhanceVideoInBrowser();

  useEffect(() => {
    if (!file || kind !== 'image') return undefined;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, kind]);

  const preview = useMemo(() => {
    if (!previewUrl) return null;
    return (
      <div className="grid grid-cols-2 gap-2 overflow-hidden rounded-xl">
        <img src={previewUrl} alt="Original media" className="h-24 w-full object-cover" />
        <img
          src={previewUrl}
          alt="Scrolitha enhancement preview"
          className="h-24 w-full object-cover"
          style={{ filter: 'brightness(1.04) contrast(1.08) saturate(1.08)' }}
        />
      </div>
    );
  }, [previewUrl]);

  if (!enabled || !file || !supported) return null;

  const improve = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const enhanced = kind === 'image' ? await enhanceImageFile(file) : await enhanceVideoFile(file);
      await onAccept(enhanced);
    } catch (error) {
      console.error('Scrolitha media enhancement failed', error);
      onDismiss?.();
    } finally {
      setBusy(false);
    }
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
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={improve} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
              {busy ? 'Improving…' : 'Improve with Scrolitha'}
            </button>
            <button type="button" onClick={onDismiss} disabled={busy} className={`rounded-full border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${dark ? 'border-white/20 text-white/80' : 'border-slate-300 text-slate-700'}`}>
              Keep as is
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScrolithaMediaEnhanceOffer;
