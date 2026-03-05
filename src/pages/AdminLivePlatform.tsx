import React, { useCallback, useEffect, useState } from 'react';
import { LiveService, type LiveConfig, type LiveSession } from '../services/live';
import { useNotification } from '../context/NotificationContext';

const AdminLivePlatform: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<LiveConfig | null>(null);
  const [sessions, setSessions] = useState<LiveSession[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [nextConfig, nextSessions] = await Promise.all([
        LiveService.getAdminConfig(),
        LiveService.getAdminSessions({ limit: 80 })
      ]);
      setConfig(nextConfig);
      setSessions(Array.isArray(nextSessions) ? nextSessions : []);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to load live admin panel.';
      showNotification('error', 'Admin Live', message);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveConfig = useCallback(async () => {
    if (!config) return;
    try {
      setSaving(true);
      const updated = await LiveService.saveAdminConfig(config);
      setConfig(updated);
      showNotification('success', 'Admin Live', 'Config saved.');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to save config.';
      showNotification('error', 'Admin Live', message);
    } finally {
      setSaving(false);
    }
  }, [config, showNotification]);

  const forceEnd = useCallback(
    async (session: LiveSession) => {
      try {
        const updated = await LiveService.endAdminSession(session.id);
        setSessions((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
        showNotification('success', 'Admin Live', 'Session ended.');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to end session.';
        showNotification('error', 'Admin Live', message);
      }
    },
    [showNotification]
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          Loading admin live controls...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Admin Live Platform</h1>
        <p className="mt-1 text-sm text-slate-500">Control livestream runtime settings and moderation.</p>
        {config ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-slate-600">
              <span className="mb-1 block">Enable livestream</span>
              <input
                type="checkbox"
                checked={Boolean(config.enabled)}
                onChange={(event) => setConfig((prev) => (prev ? { ...prev, enabled: event.target.checked } : prev))}
              />
            </label>
            <label className="text-xs text-slate-600">
              <span className="mb-1 block">Enable conference</span>
              <input
                type="checkbox"
                checked={Boolean(config.enableConference)}
                onChange={(event) =>
                  setConfig((prev) => (prev ? { ...prev, enableConference: event.target.checked } : prev))
                }
              />
            </label>
            <label className="text-xs text-slate-600">
              <span className="mb-1 block">Enable gifts</span>
              <input
                type="checkbox"
                checked={Boolean(config.enableGifts)}
                onChange={(event) => setConfig((prev) => (prev ? { ...prev, enableGifts: event.target.checked } : prev))}
              />
            </label>
            <label className="text-xs text-slate-600">
              <span className="mb-1 block">Max participants</span>
              <input
                type="number"
                value={Number(config.maxParticipants || 20)}
                onChange={(event) =>
                  setConfig((prev) => (prev ? { ...prev, maxParticipants: Number(event.target.value || 20) } : prev))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-slate-600">
              <span className="mb-1 block">Min gift (Gcoin)</span>
              <input
                type="number"
                value={Number(config.minGiftGcoin || 1)}
                onChange={(event) =>
                  setConfig((prev) => (prev ? { ...prev, minGiftGcoin: Number(event.target.value || 1) } : prev))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-slate-600">
              <span className="mb-1 block">Max gift (Gcoin)</span>
              <input
                type="number"
                value={Number(config.maxGiftGcoin || 50000)}
                onChange={(event) =>
                  setConfig((prev) => (prev ? { ...prev, maxGiftGcoin: Number(event.target.value || 50000) } : prev))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void saveConfig()}
          disabled={saving || !config}
          className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Config'}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Live Sessions</h2>
        <div className="mt-4 space-y-3">
          {sessions.length === 0 ? (
            <div className="text-sm text-slate-500">No sessions found.</div>
          ) : (
            sessions.map((session) => (
              <div key={session.id} className="rounded-xl border border-slate-200 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{session.title || 'Untitled session'}</p>
                    <p className="text-xs text-slate-500">
                      {String(session.status || 'scheduled').toUpperCase()} • Viewers {Number(session.viewerCount || 0)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void forceEnd(session)}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                  >
                    Force End
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLivePlatform;
