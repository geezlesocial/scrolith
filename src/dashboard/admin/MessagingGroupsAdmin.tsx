/**
 * Phase 29.4 — Enterprise Messaging Groups Administration
 * Admin → Messages → Messaging Groups (operational control center)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  MessageSquare,
  Lock,
  Shield,
  Search,
  RefreshCw,
  Loader2,
  Crown,
  Ban,
  Unlock,
  Archive,
  FileDown,
  AlertTriangle,
  Settings,
  LayoutDashboard,
  List,
  ClipboardList,
  UserPlus,
  BarChart3
} from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

type SubTab =
  | 'overview'
  | 'groups'
  | 'detail'
  | 'join-requests'
  | 'audit'
  | 'templates'
  | 'settings'
  | 'analytics'
  | 'danger';

const SUB_NAV: { id: SubTab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'groups', label: 'Groups', icon: List },
  { id: 'join-requests', label: 'Join Requests', icon: UserPlus },
  { id: 'audit', label: 'Audit Logs', icon: ClipboardList },
  { id: 'templates', label: 'Policies', icon: Shield },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'System Settings', icon: Settings },
  { id: 'danger', label: 'Danger Zone', icon: AlertTriangle }
];

const StatCard: React.FC<{ title: string; value: string | number; hint?: string; accent?: string }> = ({
  title,
  value,
  hint,
  accent = 'indigo'
}) => (
  <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm`}>
    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
    <div className={`mt-1 text-2xl font-bold text-${accent}-700 text-slate-900`}>{value}</div>
    {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
  </div>
);

const MessagingGroupsAdmin: React.FC = () => {
  const { showNotification } = useNotification();
  const [tab, setTab] = useState<SubTab>('overview');
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 0 });
  const [search, setSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [memberUserId, setMemberUserId] = useState('');
  const [transferUserId, setTransferUserId] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await AdminService.getMessagingGroupsOverview();
      setOverview(data);
    } catch (e: any) {
      showNotification('error', 'Messaging Groups', e?.message || 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  const loadGroups = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const res = await AdminService.listMessagingGroups({
          page,
          limit: 25,
          q: search || undefined,
          visibility: visibilityFilter || undefined
        });
        setGroups(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
        if (res?.pagination) setPagination(res.pagination);
      } catch (e: any) {
        showNotification('error', 'Messaging Groups', e?.message || 'Failed to list groups');
        setGroups([]);
      } finally {
        setLoading(false);
      }
    },
    [search, visibilityFilter, showNotification]
  );

  const loadDetail = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const data = await AdminService.getMessagingGroup(id);
        setDetail(data);
        setSelectedId(id);
        setTab('detail');
      } catch (e: any) {
        showNotification('error', 'Messaging Groups', e?.message || 'Failed to load group');
      } finally {
        setLoading(false);
      }
    },
    [showNotification]
  );

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminService.getMessagingGroupsAudit({ limit: 100 });
      setAudit(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
    } catch {
      setAudit([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadJoinRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminService.listMessagingGroupJoinRequests({ status: 'PENDING' });
      setJoinRequests(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
    } catch {
      setJoinRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await AdminService.getMessagingGroupTemplates();
      setTemplates(Array.isArray(res?.system) ? res.system : Array.isArray(res?.data?.system) ? res.data.system : []);
    } catch {
      setTemplates([]);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await AdminService.getMessagingGroupSettings();
      setSettings(res?.data || res || null);
    } catch {
      setSettings(null);
    }
  }, []);

  useEffect(() => {
    if (tab === 'overview') void loadOverview();
    if (tab === 'groups') void loadGroups(1);
    if (tab === 'audit') void loadAudit();
    if (tab === 'join-requests') void loadJoinRequests();
    if (tab === 'templates') void loadTemplates();
    if (tab === 'settings' || tab === 'danger') void loadSettings();
    if (tab === 'analytics') void loadOverview();
  }, [tab, loadOverview, loadGroups, loadAudit, loadJoinRequests, loadTemplates, loadSettings]);

  const runAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const id = selectedId || String(extra.conversationId || '');
    if (!id) {
      showNotification('error', 'Action', 'Select a group first');
      return;
    }
    setActionBusy(true);
    try {
      await AdminService.messagingGroupAction(id, { action, ...extra });
      showNotification('success', 'Messaging Groups', `Action “${action}” completed`);
      await loadDetail(id);
      if (tab === 'groups') void loadGroups(pagination.page);
      if (tab === 'overview') void loadOverview();
    } catch (e: any) {
      showNotification('error', 'Action failed', e?.message || 'Request failed');
    } finally {
      setActionBusy(false);
    }
  };

  const totals = overview?.totals || {};
  const series = useMemo(() => overview?.activitySeries || [], [overview]);

  return (
    <div className="space-y-4" data-testid="admin-messaging-groups">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Messaging Groups</h1>
          <p className="text-sm text-slate-500">
            Enterprise control center for messaging groups (not Community Groups).
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (tab === 'overview' || tab === 'analytics') void loadOverview();
            if (tab === 'groups') void loadGroups(pagination.page);
            if (tab === 'audit') void loadAudit();
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      <nav className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1" aria-label="Messaging groups admin sections">
        {SUB_NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            data-testid={`mg-admin-tab-${id}`}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold sm:text-sm ${
              tab === id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </nav>

      {loading && !overview && !groups.length ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : null}

      {tab === 'overview' || tab === 'analytics' ? (
        <div className="space-y-4" data-testid="mg-admin-overview">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <StatCard title="Total groups" value={totals.totalGroups ?? '—'} />
            <StatCard title="Public" value={totals.publicGroups ?? '—'} />
            <StatCard title="Private" value={totals.privateGroups ?? '—'} />
            <StatCard title="Secret" value={totals.secretGroups ?? '—'} />
            <StatCard title="Messages today" value={totals.messagesToday ?? '—'} />
            <StatCard title="Pending joins" value={totals.pendingJoinRequests ?? '—'} />
            <StatCard title="Active invites" value={totals.activeInvites ?? '—'} />
            <StatCard title="Locked" value={totals.lockedGroups ?? '—'} />
            <StatCard title="Announcement" value={totals.announcementGroups ?? '—'} />
            <StatCard title="Avg members" value={totals.averageMembers ?? '—'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">7-day group message activity</h3>
              <div className="mt-3 flex h-32 items-end gap-1">
                {series.map((row: any) => {
                  const max = Math.max(...series.map((s: any) => Number(s.messages) || 0), 1);
                  const h = Math.max(4, Math.round((Number(row.messages) / max) * 100));
                  return (
                    <div key={row.date} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t bg-indigo-500/80"
                        style={{ height: `${h}%` }}
                        title={`${row.date}: ${row.messages}`}
                      />
                      <span className="text-[9px] text-slate-400">{String(row.date).slice(5)}</span>
                    </div>
                  );
                })}
                {!series.length ? <p className="text-xs text-slate-500">No activity series yet.</p> : null}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Largest groups</h3>
              <ul className="mt-2 space-y-2">
                {(overview?.largestGroups || []).map((g: any) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => void loadDetail(g.id)}
                    >
                      <span className="truncate font-medium text-slate-800">{g.title}</span>
                      <span className="text-xs text-slate-500">
                        {g.memberCount ?? '—'} · {g.visibility}
                      </span>
                    </button>
                  </li>
                ))}
                {!overview?.largestGroups?.length ? (
                  <li className="text-xs text-slate-500">No groups yet.</li>
                ) : null}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'groups' ? (
        <div className="space-y-3" data-testid="mg-admin-directory">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void loadGroups(1)}
                placeholder="Search groups…"
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <select
              value={visibilityFilter}
              onChange={(e) => setVisibilityFilter(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">All visibility</option>
              <option value="PUBLIC">Public</option>
              <option value="PRIVATE">Private</option>
              <option value="SECRET">Secret</option>
              <option value="UNLISTED">Unlisted</option>
            </select>
            <button
              type="button"
              onClick={() => void loadGroups(1)}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => void AdminService.exportMessagingGroups('groups').then((d) => {
                const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `messaging-groups-export-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              })}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
            >
              <FileDown className="h-4 w-4" /> Export
            </button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Visibility</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Members</th>
                  <th className="px-3 py-2">Messages</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">
                      <button type="button" className="text-left hover:text-indigo-600" onClick={() => void loadDetail(g.id)}>
                        {g.emoji ? `${g.emoji} ` : ''}
                        {g.title}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-xs">{g.visibility}</td>
                    <td className="px-3 py-2 text-xs">{g.messagingMode}</td>
                    <td className="px-3 py-2">{g.memberCount}</td>
                    <td className="px-3 py-2">{g.messageCount}</td>
                    <td className="px-3 py-2 text-xs">{g.owner?.name || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {g.locked ? (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800">Locked</span>
                      ) : g.archivedAt ? (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5">Archived</span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Active</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-indigo-600"
                        onClick={() => void loadDetail(g.id)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
                {!groups.length ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-500">
                      No messaging groups found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {pagination.pages > 1 ? (
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => void loadGroups(pagination.page - 1)}
                className="rounded-lg border px-2 py-1 disabled:opacity-40"
              >
                Prev
              </button>
              <span>
                Page {pagination.page} / {pagination.pages}
              </span>
              <button
                type="button"
                disabled={pagination.page >= pagination.pages}
                onClick={() => void loadGroups(pagination.page + 1)}
                className="rounded-lg border px-2 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'detail' && detail ? (
        <div className="space-y-4" data-testid="mg-admin-detail">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {detail.emoji ? `${detail.emoji} ` : ''}
                  {detail.title || 'Untitled'}
                </h2>
                <p className="text-sm text-slate-500">{detail.description || 'No description'}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{detail.visibility}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{detail.messagingMode}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{detail.memberCount} members</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{detail.messageCount} messages</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void runAction('lock')}
                  className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <Lock className="h-3.5 w-3.5" /> Lock
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void runAction('unlock')}
                  className="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold"
                >
                  <Unlock className="h-3.5 w-3.5" /> Unlock
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void runAction('archive')}
                  className="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold"
                >
                  <Archive className="h-3.5 w-3.5" /> Archive
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
                <Users className="h-4 w-4" /> Members
              </h3>
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                {(detail.members || []).map((m: any) => (
                  <li key={m.userId} className="flex items-center justify-between rounded-lg border border-slate-50 px-2 py-1.5">
                    <span>
                      {m.name}{' '}
                      <span className="text-xs text-slate-500">({m.role})</span>
                    </span>
                    {m.role !== 'OWNER' ? (
                      <span className="flex gap-1">
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-indigo-600"
                          onClick={() => void runAction('set_role', { userId: m.userId, role: 'ADMIN' })}
                        >
                          Admin
                        </button>
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-rose-600"
                          onClick={() => void runAction('kick', { userId: m.userId })}
                        >
                          Kick
                        </button>
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-rose-800"
                          onClick={() => void runAction('ban', { userId: m.userId, reason: 'Admin ban' })}
                        >
                          Ban
                        </button>
                      </span>
                    ) : (
                      <Crown className="h-3.5 w-3.5 text-amber-500" />
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <input
                  value={transferUserId}
                  onChange={(e) => setTransferUserId(e.target.value)}
                  placeholder="User id to make owner"
                  className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  disabled={actionBusy || !transferUserId.trim()}
                  onClick={() => void runAction('transfer_ownership', { userId: transferUserId.trim() })}
                  className="rounded-lg bg-amber-600 px-2 py-1 text-xs font-semibold text-white"
                >
                  Transfer
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold">Modes & policies</h3>
              <div className="flex flex-wrap gap-2">
                {['EVERYONE', 'ADMINS_ONLY', 'ANNOUNCEMENT', 'READ_ONLY', 'LOCKED'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void runAction('set_mode', { messagingMode: mode })}
                    className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                      detail.messagingMode === mode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {['PRIVATE', 'PUBLIC', 'SECRET', 'UNLISTED'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void runAction('set_visibility', { visibility: v })}
                    className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                      detail.visibility === v ? 'bg-slate-900 text-white' : 'bg-slate-100'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <h3 className="mb-2 mt-4 text-sm font-semibold">Invites ({(detail.invites || []).length})</h3>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
                {(detail.invites || []).map((inv: any) => (
                  <li key={inv.id} className="flex justify-between gap-2 rounded border border-slate-50 px-2 py-1">
                    <span className="font-mono">{inv.code}</span>
                    <span>{inv.status}</span>
                    {inv.status === 'PENDING' ? (
                      <button
                        type="button"
                        className="text-rose-600"
                        onClick={() => void runAction('revoke_invite', { inviteId: inv.id })}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <h3 className="mb-2 mt-4 text-sm font-semibold">Recent audit</h3>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-[11px] text-slate-600">
                {(detail.audit || []).slice(0, 20).map((a: any) => (
                  <li key={a.id}>
                    {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''} · {a.action}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'join-requests' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="mg-admin-join-requests">
          <h3 className="text-sm font-semibold">Pending join requests</h3>
          <ul className="mt-3 space-y-2">
            {joinRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
                <span>
                  User {r.userId} → group {r.conversationId}
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-indigo-600"
                  onClick={() => void loadDetail(r.conversationId)}
                >
                  Open group
                </button>
              </li>
            ))}
            {!joinRequests.length ? <li className="text-sm text-slate-500">No pending requests.</li> : null}
          </ul>
        </div>
      ) : null}

      {tab === 'audit' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="mg-admin-audit">
          <div className="mb-2 flex justify-between">
            <h3 className="text-sm font-semibold">Audit log</h3>
            <button
              type="button"
              className="text-xs font-semibold text-indigo-600"
              onClick={() =>
                void AdminService.exportMessagingGroups('audit').then((d) => {
                  const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `messaging-groups-audit-${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                })
              }
            >
              Export JSON
            </button>
          </div>
          <ul className="max-h-96 space-y-1 overflow-y-auto text-xs">
            {audit.map((a) => (
              <li key={a.id} className="rounded border border-slate-50 px-2 py-1.5">
                <span className="text-slate-400">
                  {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}
                </span>{' '}
                · <span className="font-semibold">{a.action}</span> · group {a.conversationId}
                {a.targetUserId ? ` · user ${a.targetUserId}` : ''}
              </li>
            ))}
            {!audit.length ? <li className="text-slate-500">No audit rows (migration may be pending).</li> : null}
          </ul>
        </div>
      ) : null}

      {tab === 'templates' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="mg-admin-templates">
          {templates.map((t) => (
            <div key={t.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-slate-900">{t.label}</h3>
              <p className="mt-1 text-xs text-slate-500">
                {t.visibility} · {t.joinPolicy} · {t.messagingMode}
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                Select a group in directory, open detail, then apply template via action API with templateKey=
                {t.key}.
              </p>
              <button
                type="button"
                disabled={!selectedId || actionBusy}
                onClick={() => void runAction('apply_template', { templateKey: t.key })}
                className="mt-3 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Apply to selected
              </button>
            </div>
          ))}
          {!templates.length ? <p className="text-sm text-slate-500">No templates loaded.</p> : null}
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className="max-w-xl space-y-3 rounded-2xl border border-slate-200 bg-white p-4" data-testid="mg-admin-settings">
          <h3 className="text-sm font-semibold">Global messaging group defaults</h3>
          {settings ? (
            <>
              {(
                [
                  ['defaultVisibility', 'Default visibility'],
                  ['defaultJoinPolicy', 'Default join policy'],
                  ['defaultSlowModeSeconds', 'Default slow mode (sec)'],
                  ['maxMembers', 'Max members'],
                  ['maxPins', 'Max pins'],
                  ['maxInvites', 'Max invites'],
                  ['maxFileSizeMb', 'Max file size (MB)'],
                  ['rateLimitPerMinute', 'Rate limit / min'],
                  ['retentionDays', 'Retention days'],
                  ['auditRetentionDays', 'Audit retention days']
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-xs">
                  <span className="font-semibold text-slate-600">{label}</span>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={settings[key] ?? ''}
                    onChange={(e) =>
                      setSettings((s: any) => ({
                        ...s,
                        [key]: e.target.value
                      }))
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                onClick={() =>
                  void AdminService.saveMessagingGroupSettings(settings)
                    .then(() => showNotification('success', 'Settings', 'Saved'))
                    .catch((e: any) => showNotification('error', 'Settings', e?.message || 'Failed'))
                }
              >
                Save settings
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-500">Unable to load settings (admin permission may be required).</p>
          )}
        </div>
      ) : null}

      {tab === 'danger' ? (
        <div className="max-w-lg space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4" data-testid="mg-admin-danger">
          <h3 className="flex items-center gap-2 font-semibold text-rose-900">
            <AlertTriangle className="h-5 w-5" /> Danger zone
          </h3>
          <p className="text-sm text-rose-800">
            Destructive group actions require a selected group from the directory. Confirm carefully — DMs are
            never affected.
          </p>
          <p className="text-xs text-rose-700">Selected: {selectedId || 'none'}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!selectedId || actionBusy}
              onClick={() => {
                if (window.confirm('Force lock this group?')) void runAction('force_lock', { reason: 'Admin force lock' });
              }}
              className="rounded-xl bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Force lock
            </button>
            <button
              type="button"
              disabled={!selectedId || actionBusy}
              onClick={() => {
                if (window.confirm('Emergency lockdown?'))
                  void runAction('emergency_lockdown', { reason: 'Emergency' });
              }}
              className="rounded-xl bg-rose-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Emergency lockdown
            </button>
            <button
              type="button"
              disabled={!selectedId || actionBusy}
              onClick={() => {
                if (window.confirm('Archive/disable this group?')) void runAction('disable');
              }}
              className="rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-800 disabled:opacity-40"
            >
              Disable group
            </button>
          </div>
          <div className="flex gap-2 pt-2">
            <input
              value={memberUserId}
              onChange={(e) => setMemberUserId(e.target.value)}
              placeholder="User id to ban"
              className="min-w-0 flex-1 rounded-xl border border-rose-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!selectedId || !memberUserId.trim() || actionBusy}
              onClick={() =>
                void runAction('ban', { userId: memberUserId.trim(), reason: 'Admin danger ban' })
              }
              className="inline-flex items-center gap-1 rounded-xl bg-rose-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              <Ban className="h-4 w-4" /> Ban user
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MessagingGroupsAdmin;
