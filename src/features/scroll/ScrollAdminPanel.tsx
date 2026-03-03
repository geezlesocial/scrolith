import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, ShieldAlert, Trash2, RefreshCw } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { ScrollService, type ScrollConfig, type ScrollVideo } from '../../services/scroll';

const numberValue = (value: any, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const ScrollAdminPanel: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [config, setConfig] = useState<ScrollConfig | null>(null);
  const [videos, setVideos] = useState<ScrollVideo[]>([]);
  const [reports, setReports] = useState<any[]>([]);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [cfg, list, reportList] = await Promise.all([
        ScrollService.getAdminConfig(),
        ScrollService.getAdminVideos({ limit: 40 }),
        ScrollService.getAdminReports({ limit: 80 })
      ]);
      setConfig(cfg);
      setVideos(Array.isArray(list) ? list : []);
      setReports(Array.isArray(reportList) ? reportList : []);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to load Scroll admin data.';
      showNotification('error', 'Scroll Management', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const pendingReports = useMemo(
    () => reports.filter((entry) => String(entry?.status || '').toLowerCase() === 'pending').length,
    [reports]
  );

  const handleSave = async () => {
    if (!config) return;
    try {
      setSaving(true);
      const saved = await ScrollService.saveAdminConfig({
        ...config,
        maxDurationSeconds: Math.max(5, Math.min(600, Math.round(numberValue(config.maxDurationSeconds, 90)))),
        impressionThresholdSeconds: Math.max(
          1,
          Math.min(15, Math.round(numberValue(config.impressionThresholdSeconds, 2)))
        )
      });
      setConfig(saved);
      showNotification('success', 'Scroll Management', 'Scroll config saved.');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to save config.';
      showNotification('error', 'Scroll Management', message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (video: ScrollVideo) => {
    const reason = window.prompt('Removal reason', 'Policy violation or manual moderation') || '';
    if (!reason.trim()) return;
    try {
      setRemovingId(video.id);
      await ScrollService.removeAdminVideo(video.id, reason.trim());
      setVideos((prev) => prev.filter((entry) => entry.id !== video.id));
      showNotification('success', 'Scroll Management', 'Video removed.');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to remove video.';
      showNotification('error', 'Scroll Management', message);
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        <div className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Scroll management...
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Scroll config unavailable. Run backend migration if schema is missing.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Scroll Management</h2>
            <p className="text-sm text-slate-500">
              Control short-form video feed behavior, moderation, and monetization toggles.
            </p>
          </div>
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAll()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Config
            </button>
          </div>
        </div>

        {config._schemaMissing ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Scroll database tables are not ready. Run backend migration before production use.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(config.enabled)}
              onChange={(event) => setConfig((prev) => (prev ? { ...prev, enabled: event.target.checked } : prev))}
            />
            Enable Scroll module
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(config.aiLabelRequired)}
              onChange={(event) =>
                setConfig((prev) => (prev ? { ...prev, aiLabelRequired: event.target.checked } : prev))
              }
            />
            Require AI label
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(config.autoModeration)}
              onChange={(event) =>
                setConfig((prev) => (prev ? { ...prev, autoModeration: event.target.checked } : prev))
              }
            />
            Auto moderation
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(config.monetizationEnabled)}
              onChange={(event) =>
                setConfig((prev) => (prev ? { ...prev, monetizationEnabled: event.target.checked } : prev))
              }
            />
            Monetization enabled
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Max duration (seconds)</span>
            <input
              type="number"
              value={config.maxDurationSeconds}
              min={5}
              max={600}
              onChange={(event) =>
                setConfig((prev) =>
                  prev ? { ...prev, maxDurationSeconds: numberValue(event.target.value, prev.maxDurationSeconds) } : prev
                )
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Impression threshold (seconds)</span>
            <input
              type="number"
              value={config.impressionThresholdSeconds}
              min={1}
              max={15}
              onChange={(event) =>
                setConfig((prev) =>
                  prev
                    ? { ...prev, impressionThresholdSeconds: numberValue(event.target.value, prev.impressionThresholdSeconds) }
                    : prev
                )
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Reported videos</h3>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
            <ShieldAlert className="h-3.5 w-3.5" />
            {pendingReports} pending
          </span>
        </div>
        {reports.length === 0 ? (
          <p className="text-sm text-slate-500">No reports.</p>
        ) : (
          <div className="space-y-2">
            {reports.slice(0, 10).map((report) => (
              <div key={report.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <p className="font-semibold text-slate-800">{report.reason}</p>
                <p className="text-xs text-slate-500">
                  Scroll: {report.scrollId} - Status: {report.status} - Reporter: {report.reportedById}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-slate-900">Latest videos</h3>
        {videos.length === 0 ? (
          <p className="text-sm text-slate-500">No videos found.</p>
        ) : (
          <div className="space-y-3">
            {videos.map((video) => (
              <div key={video.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{video.title || video.description || video.id}</p>
                  <p className="text-xs text-slate-500">
                    by {video.author?.name || video.authorId} - likes {video.metrics.likes} - views {video.metrics.impressions}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={removingId === video.id}
                  onClick={() => void handleRemove(video)}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                >
                  {removingId === video.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default ScrollAdminPanel;
