import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Archive,
  Bell,
  Check,
  CheckCheck,
  Filter,
  Focus,
  Loader2,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  X
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useUser } from '../context/UserContext';
import { useSocket } from '../context/SocketContext';
import {
  NotificationService,
  type NotificationInboxQuery,
  type NotificationSummary
} from '../services/notifications';
import {
  getNotificationActionUrl,
  getNotificationCategoryLabel,
  isExternalNotificationUrl
} from '../utils/notificationRouting';
import { getNotificationCategoryMeta } from '../utils/notificationTaxonomy';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'personal', label: 'Personal' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'messaging_groups', label: 'Groups' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'communities', label: 'Communities' },
  { id: 'business', label: 'Business' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'security', label: 'Security' },
  { id: 'support', label: 'Support' },
  { id: 'system', label: 'System' },
  { id: 'admin', label: 'Admin' }
] as const;

type QuickFilter =
  | 'all'
  | 'unread'
  | 'read'
  | 'archived'
  | 'high'
  | 'critical'
  | 'pinned'
  | 'today'
  | 'week'
  | 'older';

const formatRelative = (value?: string | null) => {
  if (!value) return '';
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString();
};

const priorityTone = (priority?: string | null) => {
  const p = String(priority || 'normal').toLowerCase();
  if (p === 'critical') return 'bg-red-100 text-red-700 border-red-200';
  if (p === 'high') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (p === 'low' || p === 'silent') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-blue-50 text-blue-700 border-blue-100';
};

const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useUser();
  const { markAsRead, refreshNotifications, showNotification } = useNotification();
  const { socket } = useSocket();

  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<NotificationSummary>({
    unread: 0,
    total: 0,
    archived: 0,
    critical: 0,
    high: 0,
    pinned: 0,
    byCategory: {}
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [focusSession, setFocusSession] = useState<any>(null);
  const [focusMenuOpen, setFocusMenuOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchTimer = useRef<number | null>(null);

  const category = (searchParams.get('category') || 'all').toLowerCase();
  const quick = (searchParams.get('filter') || 'all').toLowerCase() as QuickFilter;

  const query: NotificationInboxQuery = useMemo(() => {
    const base: NotificationInboxQuery = {
      limit: 40,
      category: category === 'all' ? undefined : category,
      q: searchQuery || undefined
    };
    if (quick === 'unread') base.unreadOnly = true;
    if (quick === 'read') base.readOnly = true;
    if (quick === 'archived') {
      base.archivedOnly = true;
      base.includeArchived = true;
    }
    if (quick === 'high') base.highPriorityOnly = true;
    if (quick === 'critical') base.criticalOnly = true;
    if (quick === 'pinned') base.pinnedOnly = true;
    if (quick === 'today') base.timeRange = 'today';
    if (quick === 'week') base.timeRange = 'week';
    if (quick === 'older') base.timeRange = 'older';
    return base;
  }, [category, quick, searchQuery]);

  const loadSummary = useCallback(async () => {
    try {
      const data = await NotificationService.getSummary();
      setSummary(data);
    } catch {
      // ignore
    }
  }, []);

  const loadFocus = useCallback(async () => {
    try {
      const session = await NotificationService.getFocusMode();
      setFocusSession(session || null);
    } catch {
      setFocusSession(null);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void loadFocus();
  }, [isAuthenticated, loadFocus]);

  const loadFirstPage = useCallback(async () => {
    if (!isAuthenticated) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const page = await NotificationService.getPage(query);
      setItems(page.items || []);
      setHasMore(Boolean(page.pagination?.hasMore));
      setCursor(page.pagination?.nextCursor || null);
      setSelected(new Set());
      await loadSummary();
    } catch (error: any) {
      showNotification('error', 'Notifications', error?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, loadSummary, query, showNotification]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await NotificationService.getPage({ ...query, cursor });
      setItems((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        const next = [...prev];
        for (const row of page.items || []) {
          if (!seen.has(row.id)) next.push(row);
        }
        return next;
      });
      setHasMore(Boolean(page.pagination?.hasMore));
      setCursor(page.pagination?.nextCursor || null);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, loadingMore, query]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      const next = new URLSearchParams(searchParams);
      if (searchInput.trim()) next.set('q', searchInput.trim());
      else next.delete('q');
      setSearchParams(next, { replace: true });
    }, 350);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Realtime: refresh on new notification socket events
  useEffect(() => {
    if (!socket) return;
    const onNew = () => {
      void loadFirstPage();
      void refreshNotifications?.({ force: true }).catch(() => {});
    };
    const onRead = () => {
      void loadSummary();
    };
    socket.on?.('notifications:new', onNew);
    socket.on?.('notifications:read', onRead);
    return () => {
      socket.off?.('notifications:new', onNew);
      socket.off?.('notifications:read', onRead);
    };
  }, [socket, loadFirstPage, loadSummary, refreshNotifications]);

  // Infinite scroll
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const onScroll = () => {
      if (node.scrollTop + node.clientHeight >= node.scrollHeight - 120) {
        void loadMore();
      }
    };
    node.addEventListener('scroll', onScroll);
    return () => node.removeEventListener('scroll', onScroll);
  }, [loadMore]);

  const setCategory = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'all') next.delete('category');
    else next.set('category', id);
    setSearchParams(next, { replace: true });
  };

  const setQuick = (id: QuickFilter) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'all') next.delete('filter');
    else next.set('filter', id);
    setSearchParams(next, { replace: true });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(items.map((n) => String(n.id))));
  };

  const runBulk = async (
    action: 'read' | 'unread' | 'archive' | 'unarchive' | 'delete' | 'pin' | 'unpin'
  ) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBusy(true);
    try {
      await NotificationService.bulkUpdate(action, ids);
      if (action === 'read') ids.forEach((id) => markAsRead(id));
      showNotification('success', 'Notifications', `Updated ${ids.length} notification(s).`);
      await loadFirstPage();
      void refreshNotifications?.({ force: true }).catch(() => {});
    } catch (error: any) {
      showNotification('error', 'Notifications', error?.response?.data?.error || error?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const openNotification = async (n: any) => {
    const id = String(n.id || '');
    if (id && !(n.isRead ?? n.is_read)) {
      try {
        await NotificationService.markAsRead([id]);
        markAsRead(id);
        setItems((prev) =>
          prev.map((row) => (row.id === id ? { ...row, isRead: true, is_read: true } : row))
        );
        void loadSummary();
      } catch {
        // continue navigation
      }
    }
    const url = getNotificationActionUrl(n) || n.deepLink || n.actionUrl || n.action_url;
    if (!url) return;
    if (isExternalNotificationUrl(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(url);
  };

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <Bell className="mx-auto h-10 w-10 text-slate-400" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Notification Center</h1>
        <p className="mt-2 text-slate-600">Sign in to view your notifications.</p>
        <Link to="/auth/login" className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
              <Bell className="h-7 w-7 text-blue-600" aria-hidden />
              Notification Center
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Unified inbox for messages, jobs, marketplace, wallet, security, and system updates.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setFocusMenuOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
                  focusSession
                    ? 'border-violet-300 bg-violet-50 text-violet-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
                aria-expanded={focusMenuOpen}
                aria-haspopup="menu"
                aria-label={focusSession ? 'Focus mode active' : 'Focus mode'}
              >
                <Focus className="h-4 w-4" />
                {focusSession
                  ? focusSession.indefinite
                    ? 'Focus on'
                    : focusSession.endsAt
                      ? `Focus · ${Math.max(1, Math.round((new Date(focusSession.endsAt).getTime() - Date.now()) / 60000))}m`
                      : 'Focus on'
                  : 'Focus'}
              </button>
              {focusMenuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
                >
                  {focusSession ? (
                    <>
                      <p className="px-2 py-1 text-xs text-slate-500">
                        Critical & security allowed by default
                      </p>
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full rounded-md px-2 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                        onClick={async () => {
                          await NotificationService.stopFocusMode();
                          setFocusSession(null);
                          setFocusMenuOpen(false);
                          showNotification('success', 'Focus mode', 'Disabled.');
                        }}
                      >
                        Turn off Focus Mode
                      </button>
                    </>
                  ) : (
                    <>
                      {[30, 60, 120, 240].map((m) => (
                        <button
                          key={m}
                          type="button"
                          role="menuitem"
                          className="w-full rounded-md px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          onClick={async () => {
                            const session = await NotificationService.startFocusMode({
                              durationMinutes: m,
                              silencePush: true,
                              allowCritical: true,
                              allowSecurity: true
                            });
                            setFocusSession(session);
                            setFocusMenuOpen(false);
                            showNotification('success', 'Focus mode', `On for ${m} minutes.`);
                          }}
                        >
                          {m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? 's' : ''}`}
                        </button>
                      ))}
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full rounded-md px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        onClick={async () => {
                          const session = await NotificationService.startFocusMode({ indefinite: true });
                          setFocusSession(session);
                          setFocusMenuOpen(false);
                        }}
                      >
                        Until I turn it off
                      </button>
                      <Link
                        to="/settings/notifications"
                        role="menuitem"
                        className="block w-full rounded-md px-2 py-2 text-left text-sm text-blue-600 hover:bg-blue-50"
                        onClick={() => setFocusMenuOpen(false)}
                      >
                        More options…
                      </Link>
                    </>
                  )}
                </div>
              ) : null}
            </div>
            <Link
              to="/settings/notifications"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-label="Notification settings"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
            <button
              type="button"
              onClick={() => void loadFirstPage()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-label="Refresh notifications"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              disabled={busy || summary.unread === 0}
              onClick={async () => {
                setBusy(true);
                try {
                  await NotificationService.markAllAsRead();
                  showNotification('success', 'Notifications', 'All marked as read.');
                  await loadFirstPage();
                  void refreshNotifications?.({ force: true }).catch(() => {});
                } catch (e: any) {
                  showNotification('error', 'Notifications', e?.message || 'Failed');
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </button>
          </div>
        </header>
        {focusSession ? (
          <div
            className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900"
            role="status"
            aria-live="polite"
          >
            <span>
              Focus Mode is on
              {focusSession.endsAt && !focusSession.indefinite
                ? ` · ends ${new Date(focusSession.endsAt).toLocaleTimeString()}`
                : focusSession.indefinite
                  ? ' · until you disable it'
                  : ''}
              . Critical and security alerts still deliver.
            </span>
            <button
              type="button"
              className="font-medium underline"
              onClick={async () => {
                await NotificationService.stopFocusMode();
                setFocusSession(null);
              }}
            >
              Disable
            </button>
          </div>
        ) : null}

        {/* Counters */}
        <section
          className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6"
          aria-label="Notification counters"
        >
          {[
            { label: 'Unread', value: summary.unread, tone: 'text-blue-700' },
            { label: 'Total', value: summary.total, tone: 'text-slate-800' },
            { label: 'Critical', value: summary.critical || 0, tone: 'text-red-700' },
            { label: 'High priority', value: summary.high || 0, tone: 'text-amber-700' },
            { label: 'Pinned', value: summary.pinned || 0, tone: 'text-violet-700' },
            { label: 'Archived', value: summary.archived || 0, tone: 'text-slate-600' }
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{c.label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${c.tone}`}>{c.value}</p>
            </div>
          ))}
        </section>

        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          {/* Categories */}
          <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Categories">
            <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Categories</p>
            <nav className="space-y-0.5">
              {CATEGORIES.map((c) => {
                const active = category === c.id;
                const count =
                  c.id === 'all'
                    ? summary.unread
                    : Number(summary.byCategory?.[c.id] || summary.byCategory?.[c.id.replace(/_/g, '')] || 0);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                      active
                        ? 'bg-blue-50 text-blue-800'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span>{c.label}</span>
                    {count > 0 ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-600">
                        {count > 99 ? '99+' : count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Search + filters */}
            <div className="border-b border-slate-100 p-3 sm:p-4">
              <label className="relative block">
                <span className="sr-only">Search notifications</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search title, body, category…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none ring-blue-500 focus:bg-white focus:ring-2"
                />
                {searchInput ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    onClick={() => setSearchInput('')}
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </label>

              <div className="mt-3 flex flex-wrap gap-1.5" role="toolbar" aria-label="Quick filters">
                {(
                  [
                    ['all', 'All'],
                    ['unread', 'Unread'],
                    ['read', 'Read'],
                    ['pinned', 'Pinned'],
                    ['critical', 'Critical'],
                    ['high', 'High priority'],
                    ['archived', 'Archived'],
                    ['today', 'Today'],
                    ['week', 'This week'],
                    ['older', 'Older']
                  ] as Array<[QuickFilter, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setQuick(id)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      quick === id
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {id === 'all' ? <Filter className="h-3 w-3" /> : null}
                    {label}
                  </button>
                ))}
              </div>

              {/* Bulk bar */}
              {selected.size > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
                  <span className="text-xs font-semibold text-blue-900">{selected.size} selected</span>
                  <button type="button" className="text-xs font-medium text-blue-700 underline" onClick={selectAllVisible}>
                    {selected.size === items.length ? 'Clear' : 'Select all visible'}
                  </button>
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    {(
                      [
                        ['read', 'Mark read', Check],
                        ['unread', 'Mark unread', Bell],
                        ['pin', 'Pin', Pin],
                        ['unpin', 'Unpin', PinOff],
                        ['archive', 'Archive', Archive],
                        ['delete', 'Delete', Trash2]
                      ] as const
                    ).map(([action, label, Icon]) => (
                      <button
                        key={action}
                        type="button"
                        disabled={busy}
                        onClick={() => void runBulk(action)}
                        className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-900 hover:bg-blue-50 disabled:opacity-50"
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* List */}
            <div
              ref={listRef}
              className="max-h-[min(70vh,720px)] overflow-y-auto"
              role="list"
              aria-label="Notification inbox"
              aria-busy={loading}
            >
              {loading ? (
                <div className="space-y-3 p-4" aria-hidden>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="animate-pulse rounded-xl border border-slate-100 p-4">
                      <div className="flex gap-3">
                        <div className="h-10 w-10 rounded-full bg-slate-200" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-1/3 rounded bg-slate-200" />
                          <div className="h-3 w-2/3 rounded bg-slate-100" />
                          <div className="h-3 w-1/4 rounded bg-slate-100" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-16 text-center">
                  <div className="rounded-full bg-slate-100 p-4">
                    <Bell className="h-8 w-8 text-slate-400" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-slate-900">You&apos;re all caught up</h2>
                  <p className="mt-1 max-w-sm text-sm text-slate-500">
                    {searchQuery || quick !== 'all' || category !== 'all'
                      ? 'No notifications match your current filters. Try clearing search or filters.'
                      : 'New activity from messages, jobs, marketplace, and more will show up here.'}
                  </p>
                </div>
              ) : (
                items.map((n) => {
                  const id = String(n.id);
                  const isRead = Boolean(n.isRead ?? n.is_read);
                  const isPinned = Boolean(n.isPinned || n.pinnedAt);
                  const priority = String(n.priority || 'normal');
                  const catMeta = getNotificationCategoryMeta({
                    type: n.type,
                    category: n.category,
                    entityType: n.entityType,
                    title: n.title,
                    metadata: n.meta || n.metadata
                  });
                  const catLabel =
                    n.categoryLabel ||
                    getNotificationCategoryLabel({
                      type: n.type,
                      category: n.category,
                      entityType: n.entityType,
                      title: n.title,
                      metadata: n.meta || n.metadata
                    }) ||
                    catMeta.label;
                  const avatar = n.actorAvatar || n.actor_avatar || null;
                  const actorName = n.actorName || n.actor_name || null;
                  const checked = selected.has(id);

                  return (
                    <article
                      key={id}
                      role="listitem"
                      className={`border-b border-slate-100 transition ${
                        isRead ? 'bg-white' : 'bg-blue-50/40'
                      } hover:bg-slate-50`}
                    >
                      <div className="flex gap-3 px-3 py-3 sm:px-4">
                        <div className="flex flex-col items-center gap-2 pt-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelect(id)}
                            aria-label={`Select notification ${n.title || id}`}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          {!isRead ? (
                            <span className="h-2 w-2 rounded-full bg-blue-600" aria-label="Unread" />
                          ) : (
                            <span className="h-2 w-2" aria-hidden />
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => void openNotification(n)}
                          className="flex min-w-0 flex-1 gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-lg"
                        >
                          <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-full bg-slate-200">
                            {avatar ? (
                              <img src={avatar} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">
                                {(actorName || catLabel || 'N').slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            {isPinned ? (
                              <span className="absolute -right-0.5 -top-0.5 rounded-full bg-violet-600 p-0.5 text-white">
                                <Pin className="h-2.5 w-2.5" aria-label="Pinned" />
                              </span>
                            ) : null}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                {catLabel}
                              </span>
                              {priority !== 'normal' && priority !== 'silent' ? (
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${priorityTone(
                                    priority
                                  )}`}
                                >
                                  {priority}
                                </span>
                              ) : null}
                              <span className="ml-auto text-xs tabular-nums text-slate-400">
                                {formatRelative(n.createdAt || n.created_at || n.timestamp)}
                              </span>
                            </div>
                            <h3
                              className={`mt-1 truncate text-sm ${
                                isRead ? 'font-medium text-slate-800' : 'font-semibold text-slate-950'
                              }`}
                            >
                              {n.title || 'Notification'}
                            </h3>
                            <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">
                              {n.message || n.body || ''}
                            </p>
                            {actorName ? (
                              <p className="mt-1 text-xs text-slate-400">From {actorName}</p>
                            ) : null}
                          </div>
                        </button>
                      </div>
                    </article>
                  );
                })
              )}

              {loadingMore ? (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading more…
                </div>
              ) : null}
              {!loading && hasMore && !loadingMore ? (
                <div className="p-3 text-center">
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    className="text-sm font-semibold text-blue-700 hover:underline"
                  >
                    Load more
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;
