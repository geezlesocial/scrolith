import React, { useCallback, useEffect, useState } from 'react';
import { LiveService, type LiveConfig, type LiveRestriction, type LiveSession } from '../services/live';
import { useNotification } from '../context/NotificationContext';

const AdminLivePlatform: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<LiveConfig | null>(null);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [restrictions, setRestrictions] = useState<LiveRestriction[]>([]);
  const [moderationBusyUserId, setModerationBusyUserId] = useState<string | null>(null);
  const [moderationReason, setModerationReason] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [nextConfig, nextSessions, nextRestrictions] = await Promise.all([
        LiveService.getAdminConfig(),
        LiveService.getAdminSessions({ limit: 80 }),
        LiveService.getAdminRestrictions({ status: 'active', limit: 120 })
      ]);
      setConfig(nextConfig);
      setSessions(Array.isArray(nextSessions) ? nextSessions : []);
      setRestrictions(Array.isArray(nextRestrictions) ? nextRestrictions : []);
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

  const restrictUser = useCallback(
    async (userId: string) => {
      const normalized = String(userId || '').trim();
      if (!normalized || moderationBusyUserId) return;
      const reason = String(moderationReason || '').trim() || undefined;
      try {
        setModerationBusyUserId(normalized);
        await LiveService.restrictAdminUser(normalized, { reason, minutes: 120 });
        showNotification('success', 'Admin Live', 'User livestream restricted for 120 minutes.');
        await load();
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to restrict livestream user.';
        showNotification('error', 'Admin Live', message);
      } finally {
        setModerationBusyUserId(null);
      }
    },
    [load, moderationBusyUserId, moderationReason, showNotification]
  );

  const banUser = useCallback(
    async (userId: string) => {
      const normalized = String(userId || '').trim();
      if (!normalized || moderationBusyUserId) return;
      const reason = String(moderationReason || '').trim() || undefined;
      try {
        setModerationBusyUserId(normalized);
        await LiveService.banAdminUser(normalized, { reason });
        showNotification('success', 'Admin Live', 'User livestream privileges banned.');
        await load();
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to ban livestream user.';
        showNotification('error', 'Admin Live', message);
      } finally {
        setModerationBusyUserId(null);
      }
    },
    [load, moderationBusyUserId, moderationReason, showNotification]
  );

  const restoreUser = useCallback(
    async (userId: string) => {
      const normalized = String(userId || '').trim();
      if (!normalized || moderationBusyUserId) return;
      try {
        setModerationBusyUserId(normalized);
        await LiveService.restoreAdminUser(normalized);
        showNotification('success', 'Admin Live', 'User livestream permissions restored.');
        await load();
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to restore livestream user.';
        showNotification('error', 'Admin Live', message);
      } finally {
        setModerationBusyUserId(null);
      }
    },
    [load, moderationBusyUserId, showNotification]
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
        <div className="mt-3">
          <input
            type="text"
            value={moderationReason}
            onChange={(event) => setModerationReason(event.target.value)}
            placeholder="Moderation reason (for restrict/ban actions)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700"
          />
        </div>
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
                    <p className="text-[11px] text-slate-500">Host: {session.host?.name || session.hostUserId}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void forceEnd(session)}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                    >
                      Force End
                    </button>
                    <button
                      type="button"
                      onClick={() => void restrictUser(session.hostUserId)}
                      disabled={moderationBusyUserId === session.hostUserId}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                    >
                      Restrict
                    </button>
                    <button
                      type="button"
                      onClick={() => void banUser(session.hostUserId)}
                      disabled={moderationBusyUserId === session.hostUserId}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                    >
                      Ban
                    </button>
                    <button
                      type="button"
                      onClick={() => void restoreUser(session.hostUserId)}
                      disabled={moderationBusyUserId === session.hostUserId}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      Restore
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Active Livestream Restrictions</h2>
        <div className="mt-3 space-y-2">
          {restrictions.length === 0 ? (
            <p className="text-sm text-slate-500">No active restrictions.</p>
          ) : (
            restrictions.map((row) => (
              <div key={row.id || `${row.userId}-${row.type}`} className="rounded-xl border border-slate-200 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">
                  {row.user?.name || row.userId} • {String(row.type || '').toUpperCase()}
                </p>
                <p className="text-xs text-slate-500">
                  {row.reason || 'No reason provided.'}
                  {row.expiresAt ? ` Expires: ${new Date(row.expiresAt).toLocaleString()}` : ''}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLivePlatform;
