import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bookmark, LogOut, Plus, Settings, User } from 'lucide-react';

import { useContent } from '../../context/ContentContext';
import { useMessages } from '../../context/MessageContext';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import { useUser } from '../../context/UserContext';

import MobileHeader from './components/MobileHeader';
import MobileBottomNav, { MobileHomeLayoutSettings, MobileTabKey } from './components/MobileBottomNav';
import SearchScreen, { SearchCategory } from './components/SearchScreen';

type MobileHomeLayoutConfig = {
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
  const { unreadCount: messagesUnread } = useMessages();
  const { notifications } = useNotification();

  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);

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

  const onTabChange = (tab: MobileTabKey) => {
    if (tab === 'messages') {
      navigate('/messages');
      return;
    }
    navigate(`/m/${tab}`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <MobileHeader
        user={user}
        loading={loading}
        socketConnected={isConnected}
        settings={{ search: layout.search }}
        onOpenSearch={() => setSearchOpen(true)}
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
          <SheetItem
            icon={<User className="h-4 w-4" />}
            label="Profile"
            onClick={() => {
              setProfileOpen(false);
              if (user?.id) navigate(`/profile/${encodeURIComponent(String(user.id))}`);
            }}
          />
          <SheetItem
            icon={<Settings className="h-4 w-4" />}
            label="Settings"
            onClick={() => {
              setProfileOpen(false);
              navigate('/settings');
            }}
          />
          <SheetItem
            icon={<Bookmark className="h-4 w-4" />}
            label="Saved"
            onClick={() => {
              setProfileOpen(false);
              navigate('/favorites');
            }}
          />
          <SheetItem
            icon={<LogOut className="h-4 w-4" />}
            label="Logout"
            onClick={() => {
              setProfileOpen(false);
              logout();
            }}
          />
        </div>
      </Sheet>

      <Sheet open={quickMenuOpen} title="Quick menu" onClose={() => setQuickMenuOpen(false)}>
        <div className="space-y-1">
          <SheetItem
            icon={<Plus className="h-4 w-4" />}
            label="Create post"
            onClick={() => {
              setQuickMenuOpen(false);
              navigate('/m/post');
            }}
          />
          <SheetItem
            icon={<Settings className="h-4 w-4" />}
            label="Settings"
            onClick={() => {
              setQuickMenuOpen(false);
              navigate('/settings');
            }}
          />
        </div>
      </Sheet>
    </div>
  );
};

export default MobileHome;
