import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageSquare,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  XCircle
} from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import {
  ScrollService,
  type ScrollConfig,
  type ScrollPostingRestriction,
  type ScrollReport,
  type ScrollVideo
} from '../../services/scroll';

type ComposerMode = 'message' | 'warning' | 'restrict';
const MAX_SCROLL_VIDEO_DURATION_SECONDS = 2 * 60 * 60;

const numberValue = (value: any, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const formatDurationWindow = (secondsValue: number) => {
  const totalSeconds = Math.max(0, Math.round(Number(secondsValue) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours ? `${hours}h` : null, minutes ? `${minutes}m` : null, `${seconds}s`].filter(Boolean).join(' ');
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
};

const ScrollAdminPanel: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ScrollConfig | null>(null);
  const [videos, setVideos] = useState<ScrollVideo[]>([]);
  const [reports, setReports] = useState<ScrollReport[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [liftingRestrictionId, setLiftingRestrictionId] = useState<string | null>(null);
  const [composeVideo, setComposeVideo] = useState<ScrollVideo | null>(null);
  const [composeMode, setComposeMode] = useState<ComposerMode | null>(null);
  const [composeText, setComposeText] = useState('');
  const [composeNote, setComposeNote] = useState('');
  const [restrictionHours, setRestrictionHours] = useState(72);
  const [actionBusy, setActionBusy] = useState(false);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [cfg, list, reportList] = await Promise.all([
        ScrollService.getAdminConfig(),
        ScrollService.getAdminVideos({ limit: 100 }),
        ScrollService.getAdminReports({ limit: 120 })
      ]);
      setConfig(cfg);
      setVideos(Array.isArray(list) ? list : []);
      setReports(Array.isArray(reportList) ? reportList : []);
    } catch (error: any) {
      showNotification('error', 'Scroll Management', error?.response?.data?.error || error?.message || 'Failed to load Scroll admin data.');
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
  const activeVideos = useMemo(
    () => videos.filter((entry) => String(entry?.status || '').toLowerCase() === 'active').length,
    [videos]
  );
  const restrictedOwners = useMemo(
    () => videos.filter((entry) => entry.activePostingRestriction?.id).length,
    [videos]
  );

  const patchVideo = (nextVideo: ScrollVideo) => {
    setVideos((prev) => prev.map((entry) => (entry.id === nextVideo.id ? nextVideo : entry)));
  };

  const patchReport = (nextReport: ScrollReport) => {
    setReports((prev) => prev.map((entry) => (entry.id === nextReport.id ? nextReport : entry)));
    if (nextReport.scroll?.id) patchVideo(nextReport.scroll);
  };

  const patchRestriction = (userId: string, restriction: ScrollPostingRestriction | null) => {
    setVideos((prev) =>
      prev.map((entry) =>
        entry.authorId === userId
          ? {
              ...entry,
              activePostingRestriction: restriction
            }
          : entry
      )
    );
  };

  const resetComposer = () => {
    setComposeVideo(null);
    setComposeMode(null);
    setComposeText('');
    setComposeNote('');
    setRestrictionHours(72);
    setActionBusy(false);
  };

  const handleSave = async () => {
    if (!config) return;
    try {
      setSaving(true);
      const saved = await ScrollService.saveAdminConfig({
        ...config,
        maxDurationSeconds: clamp(Math.round(numberValue(config.maxDurationSeconds, 90)), 5, MAX_SCROLL_VIDEO_DURATION_SECONDS),
        impressionThresholdSeconds: clamp(Math.round(numberValue(config.impressionThresholdSeconds, 2)), 1, 15),
        headlinePreviewCharacters: clamp(Math.round(numberValue(config.headlinePreviewCharacters, 72)), 40, 220),
        descriptionPreviewCharacters: clamp(Math.round(numberValue(config.descriptionPreviewCharacters, 120)), 60, 480)
      });
      setConfig(saved);
      showNotification('success', 'Scroll Management', 'Scroll config saved.');
    } catch (error: any) {
      showNotification('error', 'Scroll Management', error?.response?.data?.error || error?.message || 'Failed to save config.');
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
      patchVideo({ ...video, status: 'removed' });
      showNotification('success', 'Scroll Management', 'Video removed.');
    } catch (error: any) {
      showNotification('error', 'Scroll Management', error?.response?.data?.error || error?.message || 'Failed to remove video.');
    } finally {
      setRemovingId(null);
    }
  };

  const handleReview = async (report: ScrollReport, action: 'resolve' | 'dismiss' | 'remove') => {
    const note =
      window.prompt(
        action === 'remove' ? 'Review note and removal reason' : 'Review note (optional)',
        action === 'remove' ? 'Removed after moderation review.' : ''
      ) || '';
    try {
      setReviewBusyId(report.id);
      const updated = await ScrollService.reviewAdminReport(report.id, { action, note: note.trim() || undefined });
      patchReport(updated);
      showNotification('success', 'Scroll Management', action === 'remove' ? 'Report resolved and video removed.' : 'Report reviewed.');
    } catch (error: any) {
      showNotification('error', 'Scroll Management', error?.response?.data?.error || error?.message || 'Failed to review report.');
    } finally {
      setReviewBusyId(null);
    }
  };

  const submitComposer = async () => {
    if (!composeVideo?.id || !composeMode) return;
    try {
      setActionBusy(true);
      if (!composeText.trim()) {
        showNotification('info', 'Scroll Management', composeMode === 'restrict' ? 'Provide a restriction reason.' : 'Enter a message first.');
        return;
      }
      if (composeMode === 'message') {
        await ScrollService.sendAdminMessage(composeVideo.id, { message: composeText.trim() });
        showNotification('success', 'Scroll Management', 'Message sent to the Scroll owner.');
      } else if (composeMode === 'warning') {
        await ScrollService.sendAdminWarning(composeVideo.id, { message: composeText.trim() });
        showNotification('success', 'Scroll Management', 'Warning sent to the Scroll owner.');
      } else {
        const restriction = await ScrollService.restrictOwnerPosting(composeVideo.authorId, {
          reason: composeText.trim(),
          note: composeNote.trim() || null,
          durationHours: clamp(Math.round(numberValue(restrictionHours, 72)), 1, 24 * 365)
        });
        patchRestriction(composeVideo.authorId, restriction);
        showNotification('success', 'Scroll Management', 'Posting restriction applied.');
      }
      resetComposer();
    } catch (error: any) {
      showNotification('error', 'Scroll Management', error?.response?.data?.error || error?.message || 'Admin action failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleLiftRestriction = async (video: ScrollVideo) => {
    const restrictionId = String(video.activePostingRestriction?.id || '').trim();
    if (!restrictionId) return;
    try {
      setLiftingRestrictionId(restrictionId);
      const lifted = await ScrollService.liftOwnerPostingRestriction(video.authorId, restrictionId);
      patchRestriction(video.authorId, lifted?.liftedAt ? null : lifted);
      showNotification('success', 'Scroll Management', 'Posting restriction lifted.');
    } catch (error: any) {
      showNotification('error', 'Scroll Management', error?.response?.data?.error || error?.message || 'Failed to lift restriction.');
    } finally {
      setLiftingRestrictionId(null);
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
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">Scroll config unavailable.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'All videos', value: videos.length, tone: 'text-slate-900' },
          { label: 'Active videos', value: activeVideos, tone: 'text-emerald-700' },
          { label: 'Pending reports', value: pendingReports, tone: 'text-amber-700' },
          { label: 'Restricted owners', value: restrictedOwners, tone: 'text-rose-700' }
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{card.label}</div>
            <div className={`mt-2 text-2xl font-bold ${card.tone}`}>{card.value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Scroll Management</h2>
            <p className="text-sm text-slate-500">Control moderation and how much headline or description text shows before viewers click more.</p>
          </div>
          <div className="inline-flex items-center gap-2">
            <button type="button" onClick={() => void loadAll()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Config
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
            <input type="checkbox" checked={Boolean(config.enabled)} onChange={(event) => setConfig((prev) => (prev ? { ...prev, enabled: event.target.checked } : prev))} />
            Enable Scroll module
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
            <input type="checkbox" checked={Boolean(config.aiLabelRequired)} onChange={(event) => setConfig((prev) => (prev ? { ...prev, aiLabelRequired: event.target.checked } : prev))} />
            Require AI label
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
            <input type="checkbox" checked={Boolean(config.autoModeration)} onChange={(event) => setConfig((prev) => (prev ? { ...prev, autoModeration: event.target.checked } : prev))} />
            Auto moderation
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
            <input type="checkbox" checked={Boolean(config.monetizationEnabled)} onChange={(event) => setConfig((prev) => (prev ? { ...prev, monetizationEnabled: event.target.checked } : prev))} />
            Monetization enabled
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Max duration (seconds)</span>
            <input
              type="number"
              value={config.maxDurationSeconds}
              min={5}
              max={MAX_SCROLL_VIDEO_DURATION_SECONDS}
              onChange={(event) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        maxDurationSeconds: numberValue(event.target.value, prev.maxDurationSeconds)
                      }
                    : prev
                )
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Up to 2 hours per Scroll video. Current window: {formatDurationWindow(config.maxDurationSeconds)}.
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Impression threshold (seconds)</span>
            <input type="number" value={config.impressionThresholdSeconds} min={1} max={15} onChange={(event) => setConfig((prev) => (prev ? { ...prev, impressionThresholdSeconds: numberValue(event.target.value, prev.impressionThresholdSeconds) } : prev))} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Headline preview characters</span>
            <input type="number" value={config.headlinePreviewCharacters} min={40} max={220} onChange={(event) => setConfig((prev) => (prev ? { ...prev, headlinePreviewCharacters: numberValue(event.target.value, prev.headlinePreviewCharacters) } : prev))} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Description preview characters</span>
            <input type="number" value={config.descriptionPreviewCharacters} min={60} max={480} onChange={(event) => setConfig((prev) => (prev ? { ...prev, descriptionPreviewCharacters: numberValue(event.target.value, prev.descriptionPreviewCharacters) } : prev))} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Reported videos</h3>
            <p className="text-sm text-slate-500">Review abuse reports and remove or dismiss flagged Scroll posts.</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
            <ShieldAlert className="h-3.5 w-3.5" />
            {pendingReports} pending
          </span>
        </div>

        {reports.length === 0 ? (
          <p className="text-sm text-slate-500">No reports.</p>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <div key={report.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{report.reason}</span>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${String(report.status || '').toLowerCase() === 'pending' ? 'bg-amber-100 text-amber-800' : String(report.status || '').toLowerCase() === 'dismissed' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}>{report.status}</span>
                    </div>
                    <p className="text-xs text-slate-500">Reporter: {report.reporter?.name || report.reporter?.email || report.reportedById}{report.reporter?.email ? ` · ${report.reporter.email}` : ''}</p>
                    <p className="text-xs text-slate-500">Scroll: {report.scroll?.title || report.scroll?.description || report.scrollId}</p>
                    <p className="text-xs text-slate-500">Owner: {report.scroll?.author?.name || report.scroll?.authorId}{report.scroll?.author?.email ? ` · ${report.scroll.author.email}` : ''}</p>
                    <p className="text-xs text-slate-400">Reported {formatDateTime(report.createdAt)}</p>
                    {report.reviewNote ? <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{report.reviewNote}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => void handleReview(report, 'resolve')} disabled={reviewBusyId === report.id} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">
                      {reviewBusyId === report.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Resolve
                    </button>
                    <button type="button" onClick={() => void handleReview(report, 'dismiss')} disabled={reviewBusyId === report.id} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                      <XCircle className="h-4 w-4" />
                      Dismiss
                    </button>
                    <button type="button" onClick={() => void handleReview(report, 'remove')} disabled={reviewBusyId === report.id} className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60">
                      <Trash2 className="h-4 w-4" />
                      Remove video
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-slate-900">All video posts</h3>
          <p className="text-sm text-slate-500">See poster accounts, send owner messages or warnings, remove posts, and apply timed posting restrictions.</p>
        </div>
        {videos.length === 0 ? (
          <p className="text-sm text-slate-500">No videos found.</p>
        ) : (
          <div className="space-y-3">
            {videos.map((video) => {
              const isRemoving = removingId === video.id;
              const activeRestriction = video.activePostingRestriction;
              const isLifting = liftingRestrictionId === activeRestriction?.id;
              return (
                <div key={video.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{video.title || video.description || video.id}</p>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${String(video.status || '').toLowerCase() === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{video.status}</span>
                        {Number(video.pendingReportCount || 0) > 0 ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">{video.pendingReportCount} pending report{Number(video.pendingReportCount) === 1 ? '' : 's'}</span> : null}
                      </div>
                      <p className="text-xs text-slate-500">Owner: {video.author?.name || video.authorId}{video.author?.email ? ` · ${video.author.email}` : ''}{video.author?.role ? ` · ${video.author.role}` : ''}</p>
                      <p className="text-xs text-slate-500">Created {formatDateTime(video.createdAt)} · {video.metrics.impressions} impressions · {video.metrics.likes} likes</p>
                      {video.location ? <p className="text-xs text-slate-500">Location: {video.location}</p> : null}
                      {activeRestriction?.id ? (
                        <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>Posting restricted until {formatDateTime(activeRestriction.endsAt)}{activeRestriction.reason ? ` · ${activeRestriction.reason}` : ''}</span>
                            <button type="button" onClick={() => void handleLiftRestriction(video)} disabled={isLifting} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1 font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60">
                              {isLifting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock3 className="h-3.5 w-3.5" />}
                              Lift restriction
                            </button>
                          </div>
                          {activeRestriction.note ? <div className="mt-1 text-rose-600">{activeRestriction.note}</div> : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => { setComposeVideo(video); setComposeMode('message'); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        <MessageSquare className="h-4 w-4" />
                        Message
                      </button>
                      <button type="button" onClick={() => { setComposeVideo(video); setComposeMode('warning'); }} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50">
                        <AlertTriangle className="h-4 w-4" />
                        Warn
                      </button>
                      <button type="button" onClick={() => { setComposeVideo(video); setComposeMode('restrict'); }} className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
                        <Clock3 className="h-4 w-4" />
                        Restrict
                      </button>
                      <button type="button" disabled={isRemoving} onClick={() => void handleRemove(video)} className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60">
                        {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {composeVideo && composeMode ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">{composeMode === 'message' ? 'Message Scroll owner' : composeMode === 'warning' ? 'Send warning' : 'Restrict Scroll posting'}</h4>
                <p className="mt-1 text-sm text-slate-500">Target: {composeVideo.author?.name || composeVideo.authorId}{composeVideo.author?.email ? ` · ${composeVideo.author.email}` : ''}</p>
              </div>
              <button type="button" onClick={resetComposer} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Close</button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Scroll: {composeVideo.title || composeVideo.description || composeVideo.id}</div>
              {composeMode === 'restrict' ? (
                <>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Restriction reason</span>
                    <textarea value={composeText} onChange={(event) => setComposeText(event.target.value)} rows={3} placeholder="Explain why this owner is being restricted from posting Scroll videos." className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500" />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Moderator note</span>
                    <textarea value={composeNote} onChange={(event) => setComposeNote(event.target.value)} rows={2} placeholder="Optional internal note." className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500" />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Restriction period (hours)</span>
                    <input type="number" value={restrictionHours} min={1} max={24 * 365} onChange={(event) => setRestrictionHours(numberValue(event.target.value, 72))} className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500" />
                  </label>
                </>
              ) : (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">{composeMode === 'message' ? 'Message' : 'Warning'}</span>
                  <textarea value={composeText} onChange={(event) => setComposeText(event.target.value)} rows={5} placeholder={composeMode === 'message' ? 'Send operational guidance or a direct admin message.' : 'Explain the policy concern or moderation warning clearly.'} className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500" />
                </label>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button type="button" onClick={resetComposer} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => void submitComposer()} disabled={actionBusy} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {composeMode === 'message' ? 'Send message' : composeMode === 'warning' ? 'Send warning' : 'Apply restriction'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ScrollAdminPanel;
