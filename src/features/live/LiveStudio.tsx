import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, Radio, RefreshCw, Video } from 'lucide-react';
import { LiveService, type LiveSession, type LiveVisibility } from '../../services/live';
import { useNotification } from '../../context/NotificationContext';

const VISIBILITY_OPTIONS: Array<{ value: LiveVisibility; label: string }> = [
  { value: 'public', label: 'Public' },
  { value: 'network', label: 'Network' },
  { value: 'followers', label: 'Followers' },
  { value: 'private', label: 'Private' }
];

const LiveStudio: React.FC = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<LiveVisibility>('public');
  const [inviteDraft, setInviteDraft] = useState('');
  const [inviteBusySessionId, setInviteBusySessionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await LiveService.getMyLive();
      setSessions(Array.isArray(response?.hosted) ? response.hosted : []);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to load livestream studio.';
      showNotification('error', 'Live Studio', message);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    void load();
  }, [load]);

  const createSession = useCallback(async () => {
    if (!title.trim()) {
      showNotification('warning', 'Live Studio', 'Session title is required.');
      return;
    }
    try {
      setCreating(true);
      const created = await LiveService.createSession({
        title: title.trim(),
        description: description.trim(),
        visibility
      });
      setSessions((prev) => [created, ...prev.filter((entry) => entry.id !== created.id)]);
      showNotification('success', 'Live Studio', 'Livestream session created.');
      setTitle('');
      setDescription('');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to create session.';
      showNotification('error', 'Live Studio', message);
    } finally {
      setCreating(false);
    }
  }, [description, showNotification, title, visibility]);

  const startSession = useCallback(
    async (session: LiveSession) => {
      try {
        const updated = await LiveService.startSession(session.id);
        setSessions((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
        showNotification('success', 'Live Studio', 'Livestream started.');
        navigate(`/live/${encodeURIComponent(updated.id)}`);
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to start livestream.';
        showNotification('error', 'Live Studio', message);
      }
    },
    [navigate, showNotification]
  );

  const endSession = useCallback(
    async (session: LiveSession) => {
      try {
        const updated = await LiveService.endSession(session.id);
        setSessions((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
        showNotification('success', 'Live Studio', 'Livestream ended.');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to end livestream.';
        showNotification('error', 'Live Studio', message);
      }
    },
    [showNotification]
  );

  const inviteUsers = useCallback(
    async (session: LiveSession) => {
      const ids = inviteDraft
        .split(/[,\s]+/g)
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (!ids.length) {
        showNotification('warning', 'Live Studio', 'Enter at least one user ID to invite.');
        return;
      }
      try {
        setInviteBusySessionId(session.id);
        await LiveService.invite(session.id, ids);
        showNotification('success', 'Live Studio', `Invited ${ids.length} participant(s).`);
        setInviteDraft('');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to invite participants.';
        showNotification('error', 'Live Studio', message);
      } finally {
        setInviteBusySessionId(null);
      }
    },
    [inviteDraft, showNotification]
  );

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      ),
    [sessions]
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Live Studio</h1>
            <p className="text-sm text-slate-500">Create and manage livestream sessions in real time.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            placeholder="Session title"
          />
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as LiveVisibility)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          >
            {VISIBILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="lg:col-span-2 min-h-[90px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            placeholder="Session description"
          />
          <button
            type="button"
            onClick={() => void createSession()}
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <PlusCircle className="h-4 w-4" />
            {creating ? 'Creating...' : 'Create Session'}
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            Loading livestream sessions...
          </div>
        ) : sortedSessions.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            No livestream sessions yet.
          </div>
        ) : (
          sortedSessions.map((session) => {
            const isLive = String(session.status || '').toLowerCase() === 'live';
            const isEnded = String(session.status || '').toLowerCase() === 'ended';
            return (
              <div key={session.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-slate-900">{session.title || 'Untitled live session'}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {String(session.visibility || 'public').toUpperCase()} • {String(session.status || 'scheduled').toUpperCase()}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">{session.description || 'No description provided.'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!isLive && !isEnded ? (
                      <button
                        type="button"
                        onClick={() => void startSession(session)}
                        className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <Radio className="h-3.5 w-3.5" />
                        Start
                      </button>
                    ) : null}
                    {isLive ? (
                      <button
                        type="button"
                        onClick={() => void endSession(session)}
                        className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                      >
                        End
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => navigate(`/live/${encodeURIComponent(session.id)}`)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Video className="h-3.5 w-3.5" />
                      Open Viewer
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  Viewers: {Number(session.viewerCount || 0)} • Reactions: 👍 {Number(session.likesCount || 0)} • ❤️{' '}
                  {Number(session.lovesCount || 0)}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={inviteBusySessionId === session.id ? '' : inviteDraft}
                    onChange={(event) => setInviteDraft(event.target.value)}
                    className="min-w-[220px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                    placeholder="Invite user IDs (comma separated)"
                  />
                  <button
                    type="button"
                    onClick={() => void inviteUsers(session)}
                    disabled={inviteBusySessionId === session.id}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {inviteBusySessionId === session.id ? 'Inviting...' : 'Invite'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default LiveStudio;
