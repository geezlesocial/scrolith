import React, { useCallback, useEffect, useState } from 'react';
import { Phone, Volume2 } from 'lucide-react';
import {
  loadCallRingtonePreferences,
  saveCallRingtonePreferences,
  type CallRingtonePreferences
} from '../../messages/callRingtonePreferences';
import { preloadScrolithCallRingtones, startScrolithCallTone, stopScrolithCallTone } from '../../messages/scrolithCallRingtone';

/**
 * Local ringtone preferences (do not affect WebRTC call media).
 */
const CallRingtoneSettingsPanel: React.FC = () => {
  const [prefs, setPrefs] = useState<CallRingtonePreferences>(() => loadCallRingtonePreferences());
  const [previewBusy, setPreviewBusy] = useState(false);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent).detail as CallRingtonePreferences | undefined;
      if (detail) setPrefs(detail);
    };
    window.addEventListener('scrolith:call-ringtone-preferences', onChange as EventListener);
    return () => {
      window.removeEventListener('scrolith:call-ringtone-preferences', onChange as EventListener);
      stopScrolithCallTone('manual');
    };
  }, []);

  const update = useCallback((patch: Partial<CallRingtonePreferences>) => {
    setPrefs(saveCallRingtonePreferences(patch));
  }, []);

  const preview = useCallback(
    async (role: 'incoming' | 'outgoing') => {
      setPreviewBusy(true);
      try {
        await preloadScrolithCallRingtones();
        stopScrolithCallTone('manual');
        await startScrolithCallTone({ callId: `preview-${role}`, role });
        window.setTimeout(() => {
          stopScrolithCallTone('manual');
          setPreviewBusy(false);
        }, 3200);
      } catch {
        setPreviewBusy(false);
      }
    },
    []
  );

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      aria-labelledby="scrolith-call-ringtone-heading"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Phone className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="scrolith-call-ringtone-heading" className="text-base font-semibold text-slate-900">
            Scrolith Call ringtone
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Official <strong>Scrolith Call</strong> tone for incoming voice and video calls, plus a separate
            ringback while you wait for an answer. These settings never change active call microphone or
            speaker audio.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <label className="flex items-center justify-between gap-3 text-sm text-slate-800">
          <span>Enable ringtone &amp; ringback</span>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={prefs.ringtoneEnabled && !prefs.silentMode}
            onChange={(e) =>
              update({
                ringtoneEnabled: e.target.checked,
                silentMode: e.target.checked ? false : prefs.silentMode
              })
            }
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-sm text-slate-800">
          <span>Silent mode (suppress all call tones)</span>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={prefs.silentMode}
            onChange={(e) => update({ silentMode: e.target.checked })}
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-sm text-slate-800">
          <span>Vibrate on incoming (mobile)</span>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={prefs.vibrationEnabled}
            onChange={(e) => update({ vibrationEnabled: e.target.checked })}
          />
        </label>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800" htmlFor="incoming-vol">
            <Volume2 className="h-4 w-4" aria-hidden />
            Incoming “Scrolith Call” volume
          </label>
          <input
            id="incoming-vol"
            type="range"
            min={0}
            max={100}
            value={Math.round(prefs.incomingVolume * 100)}
            onChange={(e) => update({ incomingVolume: Number(e.target.value) / 100 })}
            className="mt-2 w-full"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(prefs.incomingVolume * 100)}
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800" htmlFor="outgoing-vol">
            <Volume2 className="h-4 w-4" aria-hidden />
            Outgoing ringback volume
          </label>
          <input
            id="outgoing-vol"
            type="range"
            min={0}
            max={100}
            value={Math.round(prefs.outgoingVolume * 100)}
            onChange={(e) => update({ outgoingVolume: Number(e.target.value) / 100 })}
            className="mt-2 w-full"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(prefs.outgoingVolume * 100)}
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={previewBusy || prefs.silentMode || !prefs.ringtoneEnabled}
            onClick={() => void preview('incoming')}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Preview Scrolith Call
          </button>
          <button
            type="button"
            disabled={previewBusy || prefs.silentMode || !prefs.ringtoneEnabled}
            onClick={() => void preview('outgoing')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Preview ringback
          </button>
        </div>
      </div>
    </section>
  );
};

export default CallRingtoneSettingsPanel;
