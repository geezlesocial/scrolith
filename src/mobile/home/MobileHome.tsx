import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Briefcase, Coins, CreditCard, Eye, FileText, LayoutDashboard, LogOut, Plus, Settings, Star, Users } from 'lucide-react';

import { useContent } from '../../context/ContentContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useMessages } from '../../context/MessageContext';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import { useUser } from '../../context/UserContext';

import MobileHeader from './components/MobileHeader';
import MobileBottomNav, { MobileHomeLayoutSettings, MobileTabKey } from './components/MobileBottomNav';
import SearchScreen, { SearchCategory } from './components/SearchScreen';

type MobileHomeLayoutConfig = {
  header?: {
    messagesEnabled?: boolean;
    quickMenuEnabled?: boolean;
  };
  accountMenu?: {
    dashboard?: boolean;
    viewAs?: boolean;
    switchCurrency?: boolean;
    postProject?: boolean;
    yourBriefs?: boolean;
    referFriend?: boolean;
    billingPayments?: boolean;
    settings?: boolean;
    logout?: boolean;
  };
  messagesPopup?: {
    enabled?: boolean;
    previewLimit?: number;
  };
  quickMenu?: {
    createPost?: boolean;
    settings?: boolean;
  };
  bottomTabs?: Partial<Record<MobileTabKey, boolean>>;
  feed?: {
    showPromoted?: boolean;
    promotedFrequency?: number;
    showSuggestedPeople?: boolean;
    showSuggestedPages?: boolean;
    showTrendingTags?: boolean;
    showRecommendedGigsJobs?: boolean;
  };
  postCard?: {
    reactionsEnabled?: boolean;
    commentsEnabled?: boolean;
    repostsEnabled?: boolean;
    sendEnabled?: boolean;
    linkPreviewEnabled?: boolean;
    mediaPreviewEnabled?: boolean;
    mentionsEnabled?: boolean;
    hashtagsEnabled?: boolean;
  };
  search?: {
    enabled?: boolean;
    categories?: SearchCategory[];
  };
};

const DEFAULT_LAYOUT: MobileHomeLayoutConfig = {
  header: {
    messagesEnabled: true,
    quickMenuEnabled: true
  },
  accountMenu: {
    dashboard: true,
    viewAs: true,
    switchCurrency: true,
    postProject: true,
    yourBriefs: true,
    referFriend: true,
    billingPayments: true,
    settings: true,
    logout: true
  },
  messagesPopup: {
    enabled: true,
    previewLimit: 6
  },
  quickMenu: {
    createPost: true,
    settings: true
  },
  bottomTabs: {
    home: true,
    network: true,
    post: true,
    notifications: true,
    jobs: true,
    messages: false
  },
  feed: {
    showPromoted: true,
    promotedFrequency: 6,
    showSuggestedPeople: true,
    showSuggestedPages: true,
    showTrendingTags: true,
    showRecommendedGigsJobs: false
  },
  postCard: {
    reactionsEnabled: true,
    commentsEnabled: true,
    repostsEnabled: true,
    sendEnabled: true,
    linkPreviewEnabled: true,
    mediaPreviewEnabled: true,
    mentionsEnabled: true,
    hashtagsEnabled: true
  },
  search: {
    enabled: true,
    categories: ['posts', 'people', 'pages', 'jobs', 'gigs']
  }
};

const relativeTime = (iso?: string | null) => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const seconds = Math.max(0, Math.floor(diff / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const isObjectLike = (value: any): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const deepMerge = <T extends Record<string, any>>(base: T, patch: any): T => {
  if (!isObjectLike(patch)) return base;
  const out: any = { ...base };
  Object.keys(patch).forEach((key) => {
    const next = (patch as any)[key];
    const prev = (out as any)[key];
    if (isObjectLike(prev) && isObjectLike(next)) {
      out[key] = deepMerge(prev, next);
    } else if (next !== undefined) {
      out[key] = next;
    }
  });
  return out as T;
};

const resolveActiveTab = (pathname: string): MobileTabKey => {
  const clean = String(pathname || '')
    .replace(/^\/+/, '')
    .split('?')[0]
    .split('#')[0];
  const parts = clean.split('/').filter(Boolean);
  const idx = parts[0] === 'm' ? 1 : 0;
  const segment = String(parts[idx] || 'home').toLowerCase();
  if (segment === 'network') return 'network';
  if (segment === 'post') return 'post';
  if (segment === 'notifications') return 'notifications';
  if (segment === 'jobs') return 'jobs';
  if (segment === 'messages') return 'messages';
  return 'home';
};

const useViewportIsMobile = (threshold = 900) => {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < threshold : true));
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < threshold);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, [threshold]);
  return isMobile;
};

const Sheet = ({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/50 p-3">
      <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const SheetItem = ({
  icon,
  label,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
  >
    <div className="rounded-xl bg-slate-100 p-2 text-slate-700">{icon}</div>
    <span>{label}</span>
  </button>
);

const MobileHome = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobileViewport = useViewportIsMobile(900);

  const { user, logout } = useUser();
  const { settings, loading } = useContent();
  const { isConnected } = useSocket();
  const { currency, availableCurrencies, setCurrency } = useCurrency();
  const {
    unreadCount: messagesUnread,
    conversations: messageConversations,
    loading: messagesLoading,
    error: messagesError,
    refreshMessages
  } = useMessages();
  const { notifications } = useNotification();

  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);

  const allowDesktopOverride =
    new URLSearchParams(location.search).get('desktop') === '1' ||
    new URLSearchParams(location.search).get('view') === 'desktop';

  if (!isMobileViewport && !allowDesktopOverride) {
    return <Navigate to="/" replace />;
  }

  const rawLayout = (settings as any)?.mobileHomeLayout ?? (settings as any)?.mobile_home_layout ?? null;
  const layout = useMemo(() => deepMerge(DEFAULT_LAYOUT, rawLayout), [rawLayout]);

  const notificationsUnread = useMemo(() => {
    const list = Array.isArray(notifications) ? notifications : [];
    return list.filter((n: any) => !(n?.isRead ?? n?.is_read) && !n?.dismissed).length;
  }, [notifications]);

  const activeTab = resolveActiveTab(location.pathname);

  const bottomNavSettings: MobileHomeLayoutSettings = {
    bottomTabs: layout.bottomTabs,
    badges: {
      notificationsUnread,
      messagesUnread
    }
  };

  const searchCategories = (layout.search?.categories || DEFAULT_LAYOUT.search?.categories || []) as SearchCategory[];
  const searchEnabled = layout.search?.enabled !== false;
  const headerMessagesEnabled = layout.header?.messagesEnabled !== false && layout.messagesPopup?.enabled !== false;
  const headerQuickMenuEnabled = layout.header?.quickMenuEnabled !== false;

  const onTabChange = (tab: MobileTabKey) => {
    if (tab === 'messages') {
      navigate('/messages');
      return;
    }
    navigate(`/m/${tab}`);
  };

  const normalizedRole = String(user?.role || '').trim().toLowerCase();
  const dashboardPath =
    normalizedRole.includes('admin')
      ? '/admin/dashboard'
      : normalizedRole.includes('freelancer')
        ? '/freelancer/dashboard'
        : normalizedRole.includes('employer') || normalizedRole.includes('client')
          ? '/client/dashboard'
          : '/';

  const postProjectPath =
    normalizedRole.includes('employer') || normalizedRole.includes('client') ? '/create-job' : '/create-gig';

  const billingPath = normalizedRole.includes('admin')
    ? '/admin/dashboard?tab=finance'
    : normalizedRole.includes('employer') || normalizedRole.includes('client')
      ? '/client/dashboard?tab=wallet'
      : '/freelancer/dashboard?tab=wallet';

  const accountMenu = (layout.accountMenu || DEFAULT_LAYOUT.accountMenu || {}) as NonNullable<
    MobileHomeLayoutConfig['accountMenu']
  >;
  const quickMenu = (layout.quickMenu || DEFAULT_LAYOUT.quickMenu || {}) as NonNullable<MobileHomeLayoutConfig['quickMenu']>;
  const messagesPreviewLimit = Math.max(
    1,
    Math.min(20, Number(layout.messagesPopup?.previewLimit ?? DEFAULT_LAYOUT.messagesPopup?.previewLimit ?? 6) || 6)
  );

  const previewConversations = useMemo(() => {
    const list = Array.isArray(messageConversations) ? messageConversations : [];
    const sorted = [...list].sort((a: any, b: any) => {
      const atA = new Date(a?.lastMessageAt || a?.last_message_at || 0).getTime();
      const atB = new Date(b?.lastMessageAt || b?.last_message_at || 0).getTime();
      return (Number.isFinite(atB) ? atB : 0) - (Number.isFinite(atA) ? atA : 0);
    });
    return sorted.slice(0, messagesPreviewLimit);
  }, [messageConversations, messagesPreviewLimit]);

  return (
    <div className="min-h-screen bg-slate-50">
      <MobileHeader
        user={user}
        loading={loading}
        socketConnected={isConnected}
        settings={{ search: layout.search }}
        messagesUnread={messagesUnread}
        showMessages={headerMessagesEnabled}
        showQuickMenu={headerQuickMenuEnabled}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenMessages={() => {
          setMessagesOpen(true);
          void refreshMessages({ force: true });
        }}
        onOpenQuickMenu={() => setQuickMenuOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
      />

      <div className="pt-14 pb-20">
        <Outlet
          context={{
            mobileLayout: layout
          }}
        />
      </div>

      <MobileBottomNav activeTab={activeTab} onChange={onTabChange} settings={bottomNavSettings} />

      {searchOpen ? (
        <div className="fixed inset-0 z-[900] overflow-y-auto bg-slate-50 pt-14 pb-20">
          <SearchScreen
            enabled={searchEnabled}
            categories={searchCategories.length ? searchCategories : (DEFAULT_LAYOUT.search?.categories as SearchCategory[])}
            onClose={() => setSearchOpen(false)}
          />
        </div>
      ) : null}

      <Sheet open={profileOpen} title="Account" onClose={() => setProfileOpen(false)}>
        <div className="space-y-1">
          {accountMenu.dashboard !== false ? (
            <SheetItem
              icon={<LayoutDashboard className="h-4 w-4" />}
              label="Dashboard"
              onClick={() => {
                setProfileOpen(false);
                navigate(dashboardPath);
              }}
            />
          ) : null}

          {accountMenu.viewAs !== false ? (
            <SheetItem
              icon={<Eye className="h-4 w-4" />}
              label="View as"
              onClick={() => {
                setProfileOpen(false);
                if (user?.username) {
                  navigate(`/u/${encodeURIComponent(String(user.username))}`);
                  return;
                }
                if (user?.id) {
                  navigate(`/profile/${encodeURIComponent(String(user.id))}`);
                }
              }}
            />
          ) : null}

          {accountMenu.switchCurrency !== false ? (
            <SheetItem
              icon={<Coins className="h-4 w-4" />}
              label={`Switch currency (${currency?.code || 'USD'})`}
              onClick={() => {
                setProfileOpen(false);
                setCurrencyOpen(true);
              }}
            />
          ) : null}

          {accountMenu.postProject !== false ? (
            <SheetItem
              icon={<Briefcase className="h-4 w-4" />}
              label="Post project"
              onClick={() => {
                setProfileOpen(false);
                navigate(postProjectPath);
              }}
            />
          ) : null}

          {accountMenu.yourBriefs !== false ? (
            <SheetItem
              icon={<FileText className="h-4 w-4" />}
              label="Your briefs"
              onClick={() => {
                setProfileOpen(false);
                navigate('/m/briefs');
              }}
            />
          ) : null}

          {accountMenu.referFriend !== false ? (
            <SheetItem
              icon={<Users className="h-4 w-4" />}
              label="Refer a Friend"
              onClick={() => {
                setProfileOpen(false);
                navigate('/affiliate-program');
              }}
            />
          ) : null}

          {accountMenu.billingPayments !== false ? (
            <SheetItem
              icon={<CreditCard className="h-4 w-4" />}
              label="Billing and Payments"
              onClick={() => {
                setProfileOpen(false);
                navigate(billingPath);
              }}
            />
          ) : null}

          {accountMenu.settings !== false ? (
            <SheetItem
              icon={<Settings className="h-4 w-4" />}
              label="Settings"
              onClick={() => {
                setProfileOpen(false);
                navigate('/settings');
              }}
            />
          ) : null}

          {accountMenu.logout !== false ? (
            <SheetItem
              icon={<LogOut className="h-4 w-4" />}
              label="Logout"
              onClick={() => {
                setProfileOpen(false);
                logout();
              }}
            />
          ) : null}
        </div>
      </Sheet>

      <Sheet open={messagesOpen} title="Messages" onClose={() => setMessagesOpen(false)}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {messagesUnread > 0 ? `${messagesUnread} unread` : 'Inbox'}
            </div>
            <button
              type="button"
              onClick={() => void refreshMessages({ force: true })}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
            >
              Refresh
            </button>
          </div>

          {messagesError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {messagesError}
            </div>
          ) : null}

          <div className="max-h-[60vh] space-y-1 overflow-auto pr-1">
            {messagesLoading && previewConversations.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                Loading conversations...
              </div>
            ) : null}

            {!messagesLoading && previewConversations.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                No conversations yet.
              </div>
            ) : null}

            {previewConversations.map((conversation: any) => {
              const convoId = String(conversation?.id || '').trim();
              const participants = Array.isArray(conversation?.participants) ? conversation.participants : [];
              const other =
                participants.find((p: any) => String(p?.id || '').trim() && String(p.id) !== String(user?.id)) ||
                participants[0] ||
                null;
              const name = String(other?.name || 'Conversation').trim();
              const avatarUrl = other?.avatar || other?.avatar_url || null;
              const lastMessage = String(conversation?.lastMessage || conversation?.last_message || '').trim();
              const lastAt = conversation?.lastMessageAt || conversation?.last_message_at || null;
              const unread = Number(conversation?.unreadCount ?? conversation?.unread_count ?? 0) || 0;
              const starred = Boolean(conversation?.isStarred ?? conversation?.is_starred ?? false);

              return (
                <button
                  key={convoId}
                  type="button"
                  onClick={() => {
                    setMessagesOpen(false);
                    if (convoId) navigate(`/messages/${encodeURIComponent(convoId)}`);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left hover:bg-slate-50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                      {avatarUrl ? <img src={avatarUrl} alt={name} className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
                        {starred ? <Star className="h-4 w-4 text-amber-500" /> : null}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {lastMessage || 'Tap to open conversation'}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="text-[10px] font-semibold text-slate-400">{relativeTime(lastAt) || ''}</div>
                    {unread > 0 ? (
                      <span className="min-w-[18px] rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              setMessagesOpen(false);
              navigate('/messages');
            }}
            className="w-full rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            View all messages
          </button>
        </div>
      </Sheet>

      <Sheet open={currencyOpen} title="Switch currency" onClose={() => setCurrencyOpen(false)}>
        <div className="space-y-3">
          <div className="text-xs text-slate-500">
            Current: <span className="font-semibold text-slate-900">{currency?.code || 'USD'}</span>
          </div>

          <div className="max-h-[60vh] space-y-1 overflow-auto pr-1">
            {(Array.isArray(availableCurrencies) ? availableCurrencies : []).map((c: any) => {
              const code = String(c?.code || '').trim().toUpperCase();
              if (!code) return null;
              const name = String(c?.name || code).trim();
              const symbol = String(c?.symbol || '').trim();
              const selected = String(currency?.code || '').toUpperCase() === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    setCurrency(code);
                    setCurrencyOpen(false);
                  }}
                  className={[
                    'flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left',
                    selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{code}</div>
                    <div className={selected ? 'mt-0.5 truncate text-xs text-slate-200' : 'mt-0.5 truncate text-xs text-slate-500'}>
                      {name}
                    </div>
                  </div>
                  <div className={selected ? 'text-lg font-semibold text-white' : 'text-lg font-semibold text-slate-700'}>
                    {symbol || ''}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Sheet>

      <Sheet open={quickMenuOpen} title="Quick menu" onClose={() => setQuickMenuOpen(false)}>
        <div className="space-y-1">
          {quickMenu.createPost !== false ? (
            <SheetItem
              icon={<Plus className="h-4 w-4" />}
              label="Create post"
              onClick={() => {
                setQuickMenuOpen(false);
                navigate('/m/post');
              }}
            />
          ) : null}

          {quickMenu.settings !== false ? (
            <SheetItem
              icon={<Settings className="h-4 w-4" />}
              label="Settings"
              onClick={() => {
                setQuickMenuOpen(false);
                navigate('/settings');
              }}
            />
          ) : null}
        </div>
      </Sheet>
    </div>
  );
};

export default MobileHome;
