import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useContent } from '../../context/ContentContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useMessages } from '../../context/MessageContext';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import { useUser } from '../../context/UserContext';

import MobileHeader from './components/MobileHeader';
import MobileBottomNav, { MobileHomeLayoutSettings, MobileTabKey } from './components/MobileBottomNav';
import type { SearchCategory } from './components/SearchScreen';

const SearchScreen = lazy(() => import('./components/SearchScreen'));
const MobileHomeSheets = lazy(() => import('./components/MobileHomeSheets'));

type MobileHomeLayoutConfig = {
  header?: {
    messagesEnabled?: boolean;
    quickMenuEnabled?: boolean;
  };
  stories?: {
    enabled?: boolean;
    maxItems?: number;
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
    switchUser?: boolean;
    browseJobs?: boolean;
    browseGigs?: boolean;
    projectBrief?: boolean;
    gigCreation?: boolean;
    settings?: boolean;
  };
  postComposer?: {
    visibilityEnabled?: boolean;
    allowedVisibilities?: string[];
    defaultVisibility?: string;
    graphicWarningEnabled?: boolean;
    graphicWarningLabel?: string;
    graphicWarningBlurMedia?: boolean;
    topics?: string[];
    locations?: string[];
  };
  bottomTabs?: Partial<Record<MobileTabKey, boolean>>;
  feed?: {
    showPromoted?: boolean;
    promotedFrequency?: number;
    listingCardEveryPosts?: number;
    maxListingCardsPerFeed?: number;
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
  stories: {
    enabled: true,
    maxItems: 12
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
    switchUser: true,
    browseJobs: true,
    browseGigs: true,
    projectBrief: true,
    gigCreation: true,
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
    showRecommendedGigsJobs: true
  },
  postComposer: {
    visibilityEnabled: true,
    allowedVisibilities: ['public', 'network', 'friends', 'private'],
    defaultVisibility: 'public',
    graphicWarningEnabled: true,
    graphicWarningLabel: 'Graphic warning',
    graphicWarningBlurMedia: true,
    topics: ['Product', 'Design', 'Engineering', 'Marketing', 'Sales', 'Leadership'],
    locations: ['Global', 'North America', 'Europe', 'Africa', 'Asia']
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

const MobileHome = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobileViewport = useViewportIsMobile(900);

  const { user, logout, updateUser } = useUser();
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
  const { notifications, showNotification } = useNotification();

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
  const layout = useMemo(() => {
    const merged = deepMerge(DEFAULT_LAYOUT, rawLayout);
    const next = deepMerge(DEFAULT_LAYOUT, merged);
    const rawFeed = isObjectLike((rawLayout as any)?.feed) ? (rawLayout as any).feed : {};
    const memberHome = isObjectLike((settings as any)?.memberHome) ? (settings as any).memberHome : {};
    const memberHomeAds = isObjectLike((memberHome as any)?.ads) ? (memberHome as any).ads : {};
    const listingPolicy = isObjectLike((settings as any)?.system?.listings?.featurePolicy)
      ? (settings as any).system.listings.featurePolicy
      : {};

    if (rawFeed.showPromoted === undefined && memberHomeAds.enabled !== undefined) {
      next.feed = { ...(next.feed || {}), showPromoted: Boolean(memberHomeAds.enabled) };
    }

    if (rawFeed.promotedFrequency === undefined) {
      const inlineFrequency = Number(memberHomeAds.inlineFrequency);
      if (Number.isFinite(inlineFrequency) && inlineFrequency >= 2) {
        next.feed = { ...(next.feed || {}), promotedFrequency: inlineFrequency };
      }
    }

    if ((rawFeed as any).listingCardEveryPosts === undefined) {
      const everyPosts = Number(
        (listingPolicy as any)?.feedCardEveryPosts ?? (settings as any)?.feedCardEveryPosts
      );
      if (Number.isFinite(everyPosts) && everyPosts >= 1) {
        next.feed = { ...(next.feed || {}), listingCardEveryPosts: Math.floor(everyPosts) };
      }
    }

    if ((rawFeed as any).maxListingCardsPerFeed === undefined) {
      const maxListingCards = Number(
        (listingPolicy as any)?.maxListingCardsPerFeed ?? (settings as any)?.maxListingCardsPerFeed
      );
      if (Number.isFinite(maxListingCards) && maxListingCards >= 1) {
        next.feed = { ...(next.feed || {}), maxListingCardsPerFeed: Math.floor(maxListingCards) };
      }
    }

    return next;
  }, [rawLayout, settings]);

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

  const activeRoleOverride = useMemo(() => {
    try {
      return sessionStorage.getItem('activeRole');
    } catch {
      return null;
    }
  }, [user?.role]);

  const effectiveRole = activeRoleOverride || user?.role || '';
  const normalizedRole = String(effectiveRole || '').trim().toLowerCase();

  const isFreelancerMode = normalizedRole.includes('freelancer') || normalizedRole.includes('seller');
  const isClientMode = normalizedRole.includes('employer') || normalizedRole.includes('client') || normalizedRole.includes('buyer');

  const dashboardPath =
    normalizedRole.includes('admin')
      ? '/admin/dashboard'
      : isFreelancerMode
        ? '/freelancer/dashboard'
        : isClientMode
          ? '/client/dashboard'
          : '/';

  const postProjectPath = isClientMode ? '/create-job' : '/create-gig';

  const billingPath = normalizedRole.includes('admin')
    ? '/admin/dashboard?tab=finance'
    : isClientMode
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

  const switchUserInPlace = () => {
    if (!user) return;
    if (normalizedRole.includes('admin')) return;

    const nextRole = isFreelancerMode ? 'EMPLOYER' : 'FREELANCER';
    updateUser({ role: nextRole } as any);
    try {
      sessionStorage.setItem('activeRole', nextRole);
    } catch {}
    showNotification?.(
      'success',
      'Switch user',
      nextRole === 'FREELANCER' ? 'Now in Freelancer mode.' : 'Now in Client mode.'
    );
  };

  const anySheetOpen = profileOpen || messagesOpen || currencyOpen || quickMenuOpen;

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
          <Suspense
            fallback={
              <div className="px-4 py-6 text-sm font-medium text-slate-500">
                Loading search...
              </div>
            }
          >
            <SearchScreen
              enabled={searchEnabled}
              categories={searchCategories.length ? searchCategories : (DEFAULT_LAYOUT.search?.categories as SearchCategory[])}
              onClose={() => setSearchOpen(false)}
            />
          </Suspense>
        </div>
      ) : null}

      {anySheetOpen ? (
        <Suspense fallback={<div className="fixed inset-0 z-[1000] bg-slate-900/20" />}>
          <MobileHomeSheets
            profileOpen={profileOpen}
            messagesOpen={messagesOpen}
            currencyOpen={currencyOpen}
            quickMenuOpen={quickMenuOpen}
            onCloseProfile={() => setProfileOpen(false)}
            onCloseMessages={() => setMessagesOpen(false)}
            onCloseCurrency={() => setCurrencyOpen(false)}
            onCloseQuickMenu={() => setQuickMenuOpen(false)}
            accountMenu={accountMenu}
            quickMenu={quickMenu}
            currencyCode={currency?.code || 'USD'}
            availableCurrencies={Array.isArray(availableCurrencies) ? availableCurrencies : []}
            onSelectCurrency={(code: string) => {
              setCurrency(code);
              setCurrencyOpen(false);
            }}
            messagesUnread={messagesUnread}
            messagesLoading={messagesLoading}
            messagesError={messagesError}
            previewConversations={previewConversations}
            currentUserId={user?.id ? String(user.id) : null}
            onRefreshMessages={() => void refreshMessages({ force: true })}
            onOpenConversation={(conversationId: string) => {
              setMessagesOpen(false);
              if (conversationId) navigate(`/messages/${encodeURIComponent(conversationId)}`);
            }}
            onOpenAllMessages={() => {
              setMessagesOpen(false);
              navigate('/messages');
            }}
            normalizedRole={normalizedRole}
            isFreelancerMode={isFreelancerMode}
            onDashboard={() => {
              setProfileOpen(false);
              navigate(dashboardPath);
            }}
            onViewAs={() => {
              setProfileOpen(false);
              if (user?.username) {
                navigate(`/u/${encodeURIComponent(String(user.username))}`);
                return;
              }
              if (user?.id) {
                navigate(`/profile/${encodeURIComponent(String(user.id))}`);
              }
            }}
            onSwitchCurrency={() => {
              setProfileOpen(false);
              setCurrencyOpen(true);
            }}
            onPostProject={() => {
              setProfileOpen(false);
              navigate(postProjectPath);
            }}
            onYourBriefs={() => {
              setProfileOpen(false);
              navigate('/m/briefs');
            }}
            onReferFriend={() => {
              setProfileOpen(false);
              navigate('/affiliate-program');
            }}
            onBilling={() => {
              setProfileOpen(false);
              navigate(billingPath);
            }}
            onSettings={() => {
              setProfileOpen(false);
              navigate('/settings');
            }}
            onLogout={() => {
              setProfileOpen(false);
              logout();
            }}
            onSwitchUserMode={() => {
              setQuickMenuOpen(false);
              switchUserInPlace();
              navigate('/m/home');
            }}
            onCreatePost={() => {
              setQuickMenuOpen(false);
              navigate('/m/post');
            }}
            onBrowseJobs={() => {
              setQuickMenuOpen(false);
              navigate('/browse-jobs');
            }}
            onBrowseGigs={() => {
              setQuickMenuOpen(false);
              navigate('/browse');
            }}
            onProjectBriefs={() => {
              setQuickMenuOpen(false);
              navigate('/m/briefs');
            }}
            onGigCreation={() => {
              setQuickMenuOpen(false);
              navigate('/create-gig');
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

export default MobileHome;
