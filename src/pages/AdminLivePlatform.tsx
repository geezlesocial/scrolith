import React, { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_LIVE_DIAGNOSTICS_CONFIG,
  LiveService,
  type LiveConfig,
  type LiveRestriction,
  type LiveSession
} from '../services/live';
import { useNotification } from '../context/NotificationContext';

const getTransportLabel = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'webrtc-relay') return 'Relay WebRTC';
  if (normalized === 'webrtc-direct') return 'Direct WebRTC';
  if (normalized === 'hls-fallback') return 'HLS fallback';
  return 'Unknown';
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return 'No event yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No event yet';
  return date.toLocaleString();
};

const AdminLivePlatform: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<LiveConfig | null>(null);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [restrictions, setRestrictions] = useState<LiveRestriction[]>([]);
  const [moderationBusyUserId, setModerationBusyUserId] = useState<string | null>(null);
  const [moderationReason, setModerationReason] = useState('');
  const diagnosticsConfig = config?.diagnosticsConfig || DEFAULT_LIVE_DIAGNOSTICS_CONFIG;

  const updateExperienceBoolean = useCallback((key: string, value: boolean) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            experienceConfig: {
              ...(prev.experienceConfig || {}),
              [key]: value
            }
          }
        : prev
    );
  }, []);

  const updateExperienceNumber = useCallback((key: string, value: number) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            experienceConfig: {
              ...(prev.experienceConfig || {}),
              [key]: Number.isFinite(value) ? value : 0
            }
          }
        : prev
    );
  }, []);

  const updateExperienceText = useCallback((key: string, value: string) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            experienceConfig: {
              ...(prev.experienceConfig || {}),
              [key]: value
            }
          }
        : prev
    );
  }, []);

  const updateDiagnosticsBoolean = useCallback((key: string, value: boolean) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            diagnosticsConfig: {
              ...(prev.diagnosticsConfig || DEFAULT_LIVE_DIAGNOSTICS_CONFIG),
              [key]: value
            }
          }
        : prev
    );
  }, []);

  const updateDiagnosticsNumber = useCallback((key: string, value: number) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            diagnosticsConfig: {
              ...(prev.diagnosticsConfig || DEFAULT_LIVE_DIAGNOSTICS_CONFIG),
              [key]: Number.isFinite(value) ? value : 0
            }
          }
        : prev
    );
  }, []);

  const updateDiagnosticsThreshold = useCallback((key: string, value: number) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            diagnosticsConfig: {
              ...(prev.diagnosticsConfig || DEFAULT_LIVE_DIAGNOSTICS_CONFIG),
              alertThresholds: {
                ...((prev.diagnosticsConfig || DEFAULT_LIVE_DIAGNOSTICS_CONFIG).alertThresholds || {}),
                [key]: Number.isFinite(value) ? value : 0
              }
            }
          }
        : prev
    );
  }, []);

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
      const endedSessionCount = Math.max(0, Number(updated?.endedSessionCount || 0));
      showNotification(
        'success',
        'Admin Live',
        endedSessionCount > 0
          ? `Config saved. ${endedSessionCount} live session${endedSessionCount === 1 ? '' : 's'} were ended immediately.`
          : 'Config saved.'
      );
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

  const sessionsWithAlerts = sessions.filter((session) => (session.diagnosticsSummary?.alerts || []).length > 0).length;
  const sessionsWithFallback = sessions.filter((session) => Number(session.diagnosticsSummary?.fallbackTransitions || 0) > 0).length;
  const totalSignalFailures = sessions.reduce(
    (sum, session) => sum + Number(session.diagnosticsSummary?.signalFailures || 0),
    0
  );
  const roundTripSamples = sessions
    .map((session) => Number(session.diagnosticsSummary?.latestRoundTripTimeMs || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const averageRoundTrip = roundTripSamples.length
    ? Math.round(roundTripSamples.reduce((sum, value) => sum + value, 0) / roundTripSamples.length)
    : 0;

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
        <p className="mt-1 text-sm text-slate-500">
          Control livestream runtime settings and moderation. Disabling livestream removes Live and Go Live entry points
          across web, desktop, mobile web, and the mobile app in real time.
        </p>
        {config ? (
          <div className="mt-4 space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                <span className="mb-1 block">Enable recording</span>
                <input
                  type="checkbox"
                  checked={Boolean(config.enableRecording)}
                  onChange={(event) =>
                    setConfig((prev) => (prev ? { ...prev, enableRecording: event.target.checked } : prev))
                  }
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
                <span className="mb-1 block">Max guest speakers</span>
                <input
                  type="number"
                  value={Number(config.maxGuests || 6)}
                  onChange={(event) =>
                    setConfig((prev) => (prev ? { ...prev, maxGuests: Number(event.target.value || 6) } : prev))
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
              <label className="text-xs text-slate-600">
                <span className="mb-1 block">Default visibility</span>
                <select
                  value={String(config.defaultVisibility || 'public')}
                  onChange={(event) =>
                    setConfig((prev) => (prev ? { ...prev, defaultVisibility: event.target.value } : prev))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="public">Public</option>
                  <option value="network">Network</option>
                  <option value="followers">Followers</option>
                  <option value="private">Private</option>
                </select>
              </label>
              <label className="text-xs text-slate-600">
                <span className="mb-1 block">Reaction rate limit / minute</span>
                <input
                  type="number"
                  value={Number(config.rateLimitReactionsPerMinute || 80)}
                  onChange={(event) =>
                    setConfig((prev) =>
                      prev ? { ...prev, rateLimitReactionsPerMinute: Number(event.target.value || 80) } : prev
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600">
                <span className="mb-1 block">Chat rate limit / minute</span>
                <input
                  type="number"
                  value={Number(config.rateLimitChatPerMinute || 40)}
                  onChange={(event) =>
                    setConfig((prev) =>
                      prev ? { ...prev, rateLimitChatPerMinute: Number(event.target.value || 40) } : prev
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Viewer Experience Controls</h3>
              <p className="mt-1 text-xs text-slate-500">
                Control reactions, sharing, feed reposts, Dash quick access, featured live rails, and standby recovery without disturbing the stream surface.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block">Enable reactions</span>
                  <input
                    type="checkbox"
                    checked={Boolean(config.experienceConfig?.enableReactions)}
                    onChange={(event) => updateExperienceBoolean('enableReactions', event.target.checked)}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block">Enable share sheet</span>
                  <input
                    type="checkbox"
                    checked={Boolean(config.experienceConfig?.enableShare)}
                    onChange={(event) => updateExperienceBoolean('enableShare', event.target.checked)}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block">Enable repost to feed</span>
                  <input
                    type="checkbox"
                    checked={Boolean(config.experienceConfig?.enableRepost)}
                    onChange={(event) => updateExperienceBoolean('enableRepost', event.target.checked)}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block">Enable Dash quick action</span>
                  <input
                    type="checkbox"
                    checked={Boolean(config.experienceConfig?.enableDashQuickAction)}
                    onChange={(event) => updateExperienceBoolean('enableDashQuickAction', event.target.checked)}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block">Enable gift shoutouts</span>
                  <input
                    type="checkbox"
                    checked={Boolean(config.experienceConfig?.enableGiftShoutouts)}
                    onChange={(event) => updateExperienceBoolean('enableGiftShoutouts', event.target.checked)}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block">Enable standby recovery</span>
                  <input
                    type="checkbox"
                    checked={Boolean(config.experienceConfig?.enableStandbyRecovery)}
                    onChange={(event) => updateExperienceBoolean('enableStandbyRecovery', event.target.checked)}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block">Keep viewer layout stable</span>
                  <input
                    type="checkbox"
                    checked={Boolean(config.experienceConfig?.keepViewerLayoutStable)}
                    onChange={(event) => updateExperienceBoolean('keepViewerLayoutStable', event.target.checked)}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block">Show featured live in Scroll</span>
                  <input
                    type="checkbox"
                    checked={Boolean(config.experienceConfig?.showFeaturedRailInScrollFeed)}
                    onChange={(event) => updateExperienceBoolean('showFeaturedRailInScrollFeed', event.target.checked)}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block">Show featured live in community</span>
                  <input
                    type="checkbox"
                    checked={Boolean(config.experienceConfig?.showFeaturedRailInCommunityHome)}
                    onChange={(event) => updateExperienceBoolean('showFeaturedRailInCommunityHome', event.target.checked)}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span className="mb-1 block">Show featured live in member home</span>
                  <input
                    type="checkbox"
                    checked={Boolean(config.experienceConfig?.showFeaturedRailInMemberHome)}
                    onChange={(event) => updateExperienceBoolean('showFeaturedRailInMemberHome', event.target.checked)}
                  />
                </label>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-900">On-stream policy notice</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Delay the compliance notice so it does not interrupt short streams, then repeat it on your own moderation cadence.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs text-slate-600">
                    <span className="mb-1 block">Enable policy notice</span>
                    <input
                      type="checkbox"
                      checked={Boolean(config.experienceConfig?.enableSafetyNotice)}
                      onChange={(event) => updateExperienceBoolean('enableSafetyNotice', event.target.checked)}
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    <span className="mb-1 block">First notice delay (minutes)</span>
                    <input
                      type="number"
                      min={0}
                      max={240}
                      value={Number(config.experienceConfig?.safetyNoticeDelayMinutes ?? 15)}
                      onChange={(event) =>
                        updateExperienceNumber('safetyNoticeDelayMinutes', Number(event.target.value || 15))
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    <span className="mb-1 block">Repeat interval (minutes)</span>
                    <input
                      type="number"
                      min={1}
                      max={240}
                      value={Number(config.experienceConfig?.safetyNoticeRepeatMinutes ?? 15)}
                      onChange={(event) =>
                        updateExperienceNumber('safetyNoticeRepeatMinutes', Number(event.target.value || 15))
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    <span className="mb-1 block">Visible duration (seconds)</span>
                    <input
                      type="number"
                      min={3}
                      max={120}
                      value={Number(config.experienceConfig?.safetyNoticeVisibleSeconds ?? 15)}
                      onChange={(event) =>
                        updateExperienceNumber('safetyNoticeVisibleSeconds', Number(event.target.value || 15))
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <label className="mt-4 block text-xs text-slate-600">
                  <span className="mb-1 block">Policy notice copy</span>
                  <textarea
                    rows={3}
                    value={String(config.experienceConfig?.safetyNoticeText ?? '')}
                    onChange={(event) => updateExperienceText('safetyNoticeText', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    placeholder="Write the notice shown over livestream video."
                  />
                </label>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-900">Live diagnostics and quality alerts</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Persist connection-state telemetry, retain session traces for operators, and control when live-quality alerts should surface in admin.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="text-xs text-slate-600">
                    <span className="mb-1 block">Enable diagnostics</span>
                    <input
                      type="checkbox"
                      checked={Boolean(diagnosticsConfig.enabled)}
                      onChange={(event) => updateDiagnosticsBoolean('enabled', event.target.checked)}
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    <span className="mb-1 block">Allow session event logs in admin</span>
                    <input
                      type="checkbox"
                      checked={Boolean(diagnosticsConfig.sessionDiagnosticsAccess)}
                      onChange={(event) => updateDiagnosticsBoolean('sessionDiagnosticsAccess', event.target.checked)}
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    <span className="mb-1 block">Viewer trace runtime</span>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {config.realtimeConfig?.diagnosticsEnabled ? 'Enabled' : 'Disabled'}
                    </div>
                  </label>
                  <label className="text-xs text-slate-600">
                    <span className="mb-1 block">Retention days</span>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={Number(diagnosticsConfig.retentionDays || 14)}
                      onChange={(event) => updateDiagnosticsNumber('retentionDays', Number(event.target.value || 14))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    <span className="mb-1 block">Max events per session</span>
                    <input
                      type="number"
                      min={20}
                      max={500}
                      value={Number(diagnosticsConfig.maxEventsPerSession || 120)}
                      onChange={(event) =>
                        updateDiagnosticsNumber('maxEventsPerSession', Number(event.target.value || 120))
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h5 className="text-sm font-semibold text-slate-900">Alert thresholds</h5>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <label className="text-xs text-slate-600">
                      <span className="mb-1 block">Retry count</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={Number(diagnosticsConfig.alertThresholds.viewerRetryCount || 3)}
                        onChange={(event) =>
                          updateDiagnosticsThreshold('viewerRetryCount', Number(event.target.value || 3))
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs text-slate-600">
                      <span className="mb-1 block">RTT ms</span>
                      <input
                        type="number"
                        min={100}
                        max={10000}
                        value={Number(diagnosticsConfig.alertThresholds.roundTripTimeMs || 1200)}
                        onChange={(event) =>
                          updateDiagnosticsThreshold('roundTripTimeMs', Number(event.target.value || 1200))
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs text-slate-600">
                      <span className="mb-1 block">Signal failures</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={Number(diagnosticsConfig.alertThresholds.signalFailures || 3)}
                        onChange={(event) =>
                          updateDiagnosticsThreshold('signalFailures', Number(event.target.value || 3))
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs text-slate-600">
                      <span className="mb-1 block">Disconnects</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={Number(diagnosticsConfig.alertThresholds.socketDisconnects || 2)}
                        onChange={(event) =>
                          updateDiagnosticsThreshold('socketDisconnects', Number(event.target.value || 2))
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs text-slate-600">
                      <span className="mb-1 block">Fallback transitions</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={Number(diagnosticsConfig.alertThresholds.fallbackTransitions || 1)}
                        onChange={(event) =>
                          updateDiagnosticsThreshold('fallbackTransitions', Number(event.target.value || 1))
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
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
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sessions with alerts</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{sessionsWithAlerts}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Avg RTT</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{averageRoundTrip ? `${averageRoundTrip} ms` : '--'}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Signal failures</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{totalSignalFailures}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Fallback sessions</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{sessionsWithFallback}</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {sessions.length === 0 ? (
            <div className="text-sm text-slate-500">No sessions found.</div>
          ) : (
            sessions.map((session) => {
              const summary = session.diagnosticsSummary;
              const recentEvents = Array.isArray(session.diagnosticsEvents) ? session.diagnosticsEvents.slice(-5).reverse() : [];
              return (
                <div key={session.id} className="rounded-xl border border-slate-200 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{session.title || 'Untitled session'}</p>
                      <p className="text-xs text-slate-500">
                        {String(session.status || 'scheduled').toUpperCase()} | Viewers {Number(session.viewerCount || 0)} | Peak{' '}
                        {Number(session.peakViewerCount || 0)}
                      </p>
                      <p className="text-[11px] text-slate-500">Host: {session.host?.name || session.hostUserId}</p>
                      <p className="text-[11px] text-slate-400">Last diagnostic event: {formatTimestamp(summary?.lastEventAt)}</p>
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

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Transport</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {getTransportLabel(summary?.latestTransportMode)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Peak retries</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{Number(summary?.peakRetryCount || 0)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Signal failures</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{Number(summary?.signalFailures || 0)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Round-trip time</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {summary?.latestRoundTripTimeMs ? `${summary.latestRoundTripTimeMs} ms` : '--'}
                      </p>
                    </div>
                  </div>

                  {(summary?.alerts || []).length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {summary?.alerts?.map((alert) => (
                        <span
                          key={`${session.id}-${alert}`}
                          className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700"
                        >
                          {alert}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {(summary?.failureReasons || []).length ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Failure reasons</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {summary?.failureReasons?.map((entry) => (
                          <span
                            key={`${session.id}-${entry.reason}`}
                            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-700"
                          >
                            {entry.reason} · {entry.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {diagnosticsConfig.sessionDiagnosticsAccess ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recent diagnostics</p>
                      {recentEvents.length === 0 ? (
                        <p className="mt-2 text-xs text-slate-500">No session diagnostics captured yet.</p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {recentEvents.map((event) => (
                            <div
                              key={event.id}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-slate-800">{event.stage}</span>
                                <span className="text-[11px] text-slate-400">{formatTimestamp(event.at)}</span>
                              </div>
                              <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                {String(event.severity || 'info').toUpperCase()} · {String(event.source || 'client').toUpperCase()}
                              </p>
                              <p className="mt-1 text-slate-600">
                                {event.reason || event.message || 'No extra context recorded.'}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-slate-500">
                      Session event logs are hidden by current diagnostics access policy.
                    </p>
                  )}
                </div>
              );
            })
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
                  {row.user?.name || row.userId} | {String(row.type || '').toUpperCase()}
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
