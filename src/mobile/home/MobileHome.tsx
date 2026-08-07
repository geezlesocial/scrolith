import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';

import { useContent } from '../../context/ContentContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useMessages } from '../../context/MessageContext';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import { useUser } from '../../context/UserContext';
import { resolveUserAvatarUrl } from '../../utils/userAvatar';
import type { ScrollVideo } from '../../services/scroll';
import type { PendingPostVideoScrollViewerSource } from '../../utils/postVideoScrollBridge';

import MobileHeader from './components/MobileHeader';
import MobileBottomNav, { MobileHomeLayoutSettings, MobileTabKey } from './components/MobileBottomNav';
import SearchScreen, { type SearchCategory } from './components/SearchScreen';
import { DEFAULT_MEMBER_HOME_LOCATIONS, DEFAULT_MEMBER_HOME_TOPICS } from '../../constants/defaultAudienceOptions';
import MobileFeedScreen from './screens/MobileFeedScreen';
import MobileNetworkScreen from './screens/MobileNetworkScreen';
import MobilePostScreen from './screens/MobilePostScreen';
import MobileNotificationsScreen from './screens/MobileNotificationsScreen';
import MobileJobsScreen from './screens/MobileJobsScreen';
import ScrollFeed from '../../features/scroll/ScrollFeed';
import MobileHomeSheets from './components/MobileHomeSheets';
import {
  buildMessagingSoftOpenState,
  prefetchMessagesWorkspace
} from '../../services/messagingSoftOpen';

// Lazy: soft chat chrome must not inflate mobile home initial bundle.
const MobileMessagingOverlay = React.lazy(
  () => import('../../components/messaging/MobileMessagingOverlay')
);
import {
  MOBILE_PAGE_CONTAINER_CLASS,
  MOBILE_SHELL_MAIN_PAD_CLASS,
  shouldUseMobileShellViewport
} from './mobileShellLayout';

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
    community?: boolean;
    marketplace?: boolean;
    groups?: boolean;
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

type PendingShellNavigation = {
  to: string;
  options?: {
    replace?: boolean;
    state?: Record<string, unknown>;
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
    community: true,
    marketplace: true,
    groups: true,
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
    topics: DEFAULT_MEMBER_HOME_TOPICS,
    locations: DEFAULT_MEMBER_HOME_LOCATIONS
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

const isMobileOverlayTab = (tab: MobileTabKey): tab is Exclude<MobileTabKey, 'home' | 'messages'> =>
  tab === 'network' || tab === 'post' || tab === 'notifications' || tab === 'jobs';

const useViewportIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => shouldUseMobileShellViewport());
  useEffect(() => {
    const onResize = () => setIsMobile(shouldUseMobileShellViewport());
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return isMobile;
};

const MobileHome = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobileViewport = useViewportIsMobile();

  const { user, logout, updateUser } = useUser();
  const resolvedUserAvatar = resolveUserAvatarUrl(user);
  const { settings, loading } = useContent();
  const { isConnected } = useSocket();
  const { currency, availableCurrencies, setCurrency } = useCurrency();
  const {
    unreadCount: messagesUnread,
    conversations: messageConversations,
    loading: messagesLoading,
    error: messagesError,
    refreshMessages,
    ensureThreadLoaded
  } = useMessages();
  const { notifications, refreshNotifications, showNotification } = useNotification();

  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  /** Soft-open conversation overlay — keeps MobileHome feed mounted (no platform reload). */
  const [softConversationId, setSoftConversationId] = useState<string | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const routeTab = resolveActiveTab(location.pathname);
  const [activePanelTab, setActivePanelTab] = useState<Exclude<MobileTabKey, 'home' | 'messages'> | null>(
    isMobileOverlayTab(routeTab) ? routeTab : null
  );
  const [scrollOverlay, setScrollOverlay] = useState<{
    key: number;
    initialItems: ScrollVideo[];
    initialActiveScrollId: string | null;
    initialViewerSource: PendingPostVideoScrollViewerSource | null;
    initialSeriesId: string | null;
  } | null>(null);

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

  const activeTab = activePanelTab || 'home';
  const shellLayerKeyRef = useRef<string | null>(null);
  const pendingShellNavigationRef = useRef<PendingShellNavigation | null>(null);
  const [pendingShellNavigationToken, setPendingShellNavigationToken] = useState(0);

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

  useEffect(() => {
    setActivePanelTab(isMobileOverlayTab(routeTab) ? routeTab : null);
  }, [routeTab]);

  useEffect(() => {
    if (activePanelTab !== 'notifications') return;
    void refreshNotifications?.({ force: true }).catch(() => {});
  }, [activePanelTab, refreshNotifications]);

  const clearShellLayers = useCallback(() => {
    setSearchOpen(false);
    setProfileOpen(false);
    setQuickMenuOpen(false);
    setMessagesOpen(false);
    setCurrencyOpen(false);
    setActivePanelTab(null);
    setScrollOverlay(null);
    setSoftConversationId(null);
  }, []);

  const shellLayerKey = useMemo(() => {
    if (scrollOverlay) {
      return `scroll:${
        scrollOverlay.initialSeriesId ||
        scrollOverlay.initialActiveScrollId ||
        scrollOverlay.initialViewerSource?.fileId ||
        scrollOverlay.key
      }`;
    }
    if (softConversationId) return `conversation:${softConversationId}`;
    if (searchOpen) return 'search';
    if (messagesOpen) return 'messages';
    if (quickMenuOpen) return 'quick-menu';
    if (profileOpen) return 'profile';
    if (currencyOpen) return 'currency';
    return null;
  }, [
    currencyOpen,
    messagesOpen,
    profileOpen,
    quickMenuOpen,
    scrollOverlay,
    searchOpen,
    softConversationId
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const previous = shellLayerKeyRef.current;
    const currentState = { ...(window.history.state || {}) };
    if (!previous && shellLayerKey) {
      const nextState = { ...currentState, __scrolithMobileShellLayer: shellLayerKey };
      window.history.pushState(nextState, '', window.location.href);
    } else if (previous && shellLayerKey && previous !== shellLayerKey) {
      const nextState = { ...currentState, __scrolithMobileShellLayer: shellLayerKey };
      window.history.replaceState(nextState, '', window.location.href);
    } else if (previous && !shellLayerKey && currentState.__scrolithMobileShellLayer) {
      const nextState = { ...currentState };
      delete nextState.__scrolithMobileShellLayer;
      window.history.replaceState(nextState, '', window.location.href);
    }
    shellLayerKeyRef.current = shellLayerKey;
  }, [shellLayerKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const marker = window.history.state?.__scrolithMobileShellLayer;
      if (!marker) {
        clearShellLayers();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [clearShellLayers]);

  useEffect(() => {
    const pending = pendingShellNavigationRef.current;
    if (!pending || shellLayerKey) return;
    pendingShellNavigationRef.current = null;
    navigate(pending.to, pending.options);
  }, [navigate, pendingShellNavigationToken, shellLayerKey]);

  const closeTopShellLayer = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.state?.__scrolithMobileShellLayer) {
      window.history.back();
      return;
    }
    clearShellLayers();
  }, [clearShellLayers]);

  const dismissShellLayers = useCallback(() => {
    flushSync(() => {
      clearShellLayers();
    });
    shellLayerKeyRef.current = null;
    if (typeof window === 'undefined') return;
    const currentState = { ...(window.history.state || {}) };
    if (!currentState.__scrolithMobileShellLayer) return;
    delete currentState.__scrolithMobileShellLayer;
    window.history.replaceState(currentState, '', window.location.href);
  }, [clearShellLayers]);

  const navigateFromShell = useCallback(
    (to: string, options?: { replace?: boolean; state?: Record<string, unknown> }) => {
      pendingShellNavigationRef.current = {
        to,
        options: {
          ...options,
          state: {
            ...(options?.state || {}),
            fromMobileHome: true,
            fromShellPath: location.pathname
          }
        }
      };
      dismissShellLayers();
      setPendingShellNavigationToken((value) => value + 1);
    },
    [dismissShellLayers, location.pathname]
  );

  const closeSoftConversation = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.state?.__scrolithMobileShellLayer) {
      const marker = String(window.history.state.__scrolithMobileShellLayer || '');
      if (marker.startsWith('conversation:')) {
        window.history.back();
        return;
      }
    }
    setSoftConversationId(null);
  }, []);

  const openPanelFromShell = useCallback(
    (tab: Exclude<MobileTabKey, 'home' | 'messages'>) => {
      dismissShellLayers();
      flushSync(() => {
        setActivePanelTab(tab);
      });
      const nextPath = `/m/${tab}`;
      if (location.pathname !== nextPath) {
        navigate(nextPath);
      }
    },
    [dismissShellLayers, location.pathname, navigate]
  );

  const onTabChange = useCallback((tab: MobileTabKey) => {
    if (tab === activeTab) {
      window.dispatchEvent(
        new CustomEvent('mobile-home:tab-reselected', {
          detail: { tab }
        })
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (tab === 'messages') {
      // Soft open: no full-platform reload.
      setSoftConversationId(null);
      setMessagesOpen(true);
      void refreshMessages({ force: false });
      return;
    }
    if (tab === 'home') {
      setActivePanelTab(null);
      setScrollOverlay(null);
      if (location.pathname !== '/m/home') {
        navigate('/m/home', { replace: true });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Soft panel open — keep feed mounted under the sheet (no hard remount of app shell).
    setScrollOverlay(null);
    setActivePanelTab(tab);
    const nextPath = `/m/${tab}`;
    if (location.pathname !== nextPath) {
      navigate(nextPath, { replace: false });
    }
  }, [activeTab, location.pathname, navigate, refreshMessages]);

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

  const accountDashboardPath = normalizedRole.includes('admin')
    ? '/admin/dashboard'
    : isClientMode
      ? '/client/dashboard'
      : isFreelancerMode
        ? '/freelancer/dashboard'
        : '/dashboard';

  const accountProfilePath = useMemo(() => {
    const userRecord = (user || {}) as any;
    const username = [
      userRecord.username,
      userRecord.profileUsername,
      userRecord.profile_username,
      userRecord.handle,
      userRecord.slug
    ]
      .map((value) => String(value || '').trim())
      .find(Boolean);

    if (username) {
      return `/u/${encodeURIComponent(username)}`;
    }

    const id = [userRecord.id, userRecord.userId, userRecord.user_id, userRecord._id]
      .map((value) => String(value || '').trim())
      .find(Boolean);

    return id ? `/profile/${encodeURIComponent(id)}` : '/profile/edit';
  }, [user]);

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
  const handleOpenScrollOverlay = useMemo(
    () => (scroll: ScrollVideo) => {
      const normalizedId = String(scroll?.id || '').trim();
      if (!normalizedId) return;
      flushSync(() => {
        setActivePanelTab(null);
        setScrollOverlay({
          key: Date.now(),
          initialItems: [scroll],
          initialActiveScrollId: normalizedId,
          initialViewerSource: null,
          initialSeriesId: null
        });
      });
    },
    []
  );
  const handleOpenPostVideoScroll = useMemo(
    () => (source: PendingPostVideoScrollViewerSource) => {
      flushSync(() => {
        setActivePanelTab(null);
        setScrollOverlay({
          key: Date.now(),
          initialItems: [],
          initialActiveScrollId: null,
          initialViewerSource: source,
          initialSeriesId: null
        });
      });
    },
    []
  );
  const handleOpenScrollSeries = useMemo(
    () => (seriesId: string, scrollId?: string | null) => {
      const normalizedSeriesId = String(seriesId || '').trim();
      if (!normalizedSeriesId) return;
      const normalizedScrollId = String(scrollId || '').trim() || null;
      flushSync(() => {
        setActivePanelTab(null);
        setScrollOverlay({
          key: Date.now(),
          initialItems: [],
          initialActiveScrollId: normalizedScrollId,
          initialViewerSource: null,
          initialSeriesId: normalizedSeriesId
        });
      });
    },
    []
  );
  const closeActivePanel = useMemo(
    () => () => {
      dismissShellLayers();
      if (location.pathname !== '/m/home') {
        navigate('/m/home', { replace: true });
      }
    },
    [dismissShellLayers, location.pathname, navigate]
  );
  const renderOverlayPanel = () => {
    if (!activePanelTab) return null;
    const titleMap: Record<Exclude<MobileTabKey, 'home' | 'messages'>, string> = {
      network: 'My Network',
      post: 'Post',
      notifications: 'Notifications',
      jobs: 'Jobs'
    };
    // Soft sheet: keep feed mounted underneath; panel scrolls independently (no full app reload).
    return (
      <div
        className="fixed inset-0 z-[820] flex flex-col bg-slate-50/97 backdrop-blur-sm animate-in fade-in duration-150"
        style={{ paddingTop: 'var(--scrolith-shell-header-offset, 3.5rem)' }}
        role="dialog"
        aria-modal="true"
        aria-label={titleMap[activePanelTab]}
      >
        <div className="shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className={`${MOBILE_PAGE_CONTAINER_CLASS} flex items-center justify-between py-3`}>
            <div className="text-sm font-semibold text-slate-900">{titleMap[activePanelTab]}</div>
            <button
              type="button"
              onClick={closeActivePanel}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 touch-manipulation active:bg-slate-50"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Close
            </button>
          </div>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
          style={{
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            paddingBottom: 'var(--scrolith-shell-bottom-offset, 4.25rem)'
          }}
        >
          <Suspense
            fallback={
              <div className="px-4 py-6 text-sm font-medium text-slate-500">
                Loading {titleMap[activePanelTab].toLowerCase()}...
              </div>
            }
          >
            {activePanelTab === 'network' ? <MobileNetworkScreen /> : null}
            {activePanelTab === 'post' ? <MobilePostScreen mobileLayout={layout} onClose={closeActivePanel} /> : null}
            {activePanelTab === 'notifications' ? <MobileNotificationsScreen onNavigate={navigateFromShell} /> : null}
            {activePanelTab === 'jobs' ? <MobileJobsScreen /> : null}
          </Suspense>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-[100%] bg-slate-50" style={{ touchAction: 'pan-y pinch-zoom' }}>
      <MobileHeader
        user={user}
        loading={loading}
        socketConnected={isConnected}
        settings={{ search: layout.search }}
        messagesUnread={messagesUnread}
        showMessages={headerMessagesEnabled}
        showQuickMenu={headerQuickMenuEnabled}
        onOpenSearch={() => {
          flushSync(() => {
            setSearchOpen(true);
          });
        }}
        onOpenMessages={() => {
          flushSync(() => {
            setSoftConversationId(null);
            setMessagesOpen(true);
          });
          // Soft inbox preview refresh — avoid force thrash that feels like a reload.
          void refreshMessages({ force: false });
        }}
        onOpenQuickMenu={() => {
          flushSync(() => {
            setQuickMenuOpen(true);
          });
        }}
        onOpenProfile={() => {
          flushSync(() => {
            setProfileOpen(true);
          });
        }}
      />

      <div
        className={`${MOBILE_SHELL_MAIN_PAD_CLASS} mobile-home-feed`}
        style={{ touchAction: 'pan-y pinch-zoom', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {/^\/m\/briefs(\/|$)/.test(location.pathname) ? (
          <Outlet
            context={{
              mobileLayout: layout
            }}
          />
        ) : (
          <Suspense
            fallback={
              <div className="px-4 py-6 text-sm font-medium text-slate-500">
                Loading feed...
              </div>
            }
          >
            <MobileFeedScreen
              mobileLayout={layout}
              onOpenScroll={handleOpenScrollOverlay}
              onOpenPostVideoScroll={handleOpenPostVideoScroll}
              onOpenScrollSeries={handleOpenScrollSeries}
            />
          </Suspense>
        )}
      </div>

      {!scrollOverlay ? <MobileBottomNav activeTab={activeTab} onChange={onTabChange} settings={bottomNavSettings} /> : null}

      {searchOpen ? (
        <div className={`fixed inset-0 z-[900] overflow-y-auto overscroll-contain bg-slate-50 ${MOBILE_SHELL_MAIN_PAD_CLASS}`}>
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
              onClose={closeTopShellLayer}
              onNavigate={dismissShellLayers}
              onNavigateUrl={navigateFromShell}
            />
          </Suspense>
        </div>
      ) : null}

      {renderOverlayPanel()}

      {scrollOverlay ? (
        <div className="fixed inset-0 z-[860] bg-black">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center bg-black text-sm font-medium text-white/80">
                Loading Scroll...
              </div>
            }
          >
            <ScrollFeed
              key={scrollOverlay.key}
              embedded
              onClose={closeTopShellLayer}
              initialItems={scrollOverlay.initialItems}
              initialActiveScrollId={scrollOverlay.initialActiveScrollId}
              initialViewerSource={scrollOverlay.initialViewerSource}
              initialSeriesId={scrollOverlay.initialSeriesId}
            />
          </Suspense>
        </div>
      ) : null}

      {softConversationId ? (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[920] flex items-center justify-center bg-white text-sm font-medium text-slate-600">
              Opening conversation…
            </div>
          }
        >
          <MobileMessagingOverlay
            conversationId={softConversationId}
            onClose={closeSoftConversation}
          />
        </Suspense>
      ) : null}

      {anySheetOpen ? (
        <MobileHomeSheets
          profileOpen={profileOpen}
          messagesOpen={messagesOpen}
          currencyOpen={currencyOpen}
          quickMenuOpen={quickMenuOpen}
          onCloseProfile={closeTopShellLayer}
          onCloseMessages={closeTopShellLayer}
          onCloseCurrency={closeTopShellLayer}
          onCloseQuickMenu={closeTopShellLayer}
          accountMenu={accountMenu}
          quickMenu={quickMenu}
          currencyCode={currency?.code || 'USD'}
          availableCurrencies={Array.isArray(availableCurrencies) ? availableCurrencies : []}
          onSelectCurrency={(code: string) => {
            setCurrency(code);
            setCurrencyOpen(false);
          }}
          messagesUnread={messagesUnread}
          notificationsUnread={notificationsUnread}
          socketConnected={Boolean(isConnected)}
          messagesLoading={messagesLoading}
          messagesError={messagesError}
          previewConversations={previewConversations}
          currentUserId={user?.id ? String(user.id) : null}
          userName={user?.name || null}
          userAvatar={resolvedUserAvatar || null}
          onRefreshMessages={() => void refreshMessages({ force: false })}
          onOpenConversation={(conversationId: string) => {
            const id = String(conversationId || '').trim();
            if (!id) return;
            // Soft in-place chat: home feed stays mounted (web mobile + Android).
            void ensureThreadLoaded(id);
            prefetchMessagesWorkspace();
            flushSync(() => {
              setMessagesOpen(false);
              setSoftConversationId(id);
            });
          }}
          onOpenParticipantProfile={(profilePath: string) => {
            const path = String(profilePath || '').trim();
            if (!path) return;
            navigateFromShell(path);
          }}
          onOpenAllMessages={() => {
            prefetchMessagesWorkspace();
            navigateFromShell('/messages', {
              state: buildMessagingSoftOpenState({
                fromHeaderMessages: true,
                fromMobileHome: true
              })
            });
          }}
          onOpenNotifications={() => {
            openPanelFromShell('notifications');
          }}
          normalizedRole={normalizedRole}
          isFreelancerMode={isFreelancerMode}
          onDashboard={() => {
            navigateFromShell(accountDashboardPath);
          }}
          onViewAs={() => {
            navigateFromShell(accountProfilePath);
          }}
          onSwitchCurrency={() => {
            setProfileOpen(false);
            setCurrencyOpen(true);
          }}
          onPostProject={() => {
            navigateFromShell(postProjectPath);
          }}
          onYourBriefs={() => {
            navigateFromShell('/m/briefs');
          }}
          onReferFriend={() => {
            navigateFromShell('/affiliate-program');
          }}
          onBilling={() => {
            navigateFromShell(billingPath);
          }}
          onSettings={() => {
            navigateFromShell('/settings');
          }}
          onLogout={() => {
            pendingShellNavigationRef.current = null;
            dismissShellLayers();
            logout();
          }}
          onSwitchUserMode={() => {
            pendingShellNavigationRef.current = null;
            dismissShellLayers();
            switchUserInPlace();
            if (location.pathname !== '/m/home') {
              navigate('/m/home');
            }
          }}
          onCreatePost={() => {
            openPanelFromShell('post');
          }}
          onBrowseJobs={() => {
            openPanelFromShell('jobs');
          }}
          onBrowseGigs={() => {
            navigateFromShell('/browse');
          }}
          onCommunity={() => {
            navigateFromShell('/community');
          }}
          onMarketplace={() => {
            navigateFromShell('/marketplace');
          }}
          onGroups={() => {
            navigateFromShell('/community/clubs');
          }}
          onProjectBriefs={() => {
            navigateFromShell('/m/briefs');
          }}
          onGigCreation={() => {
            navigateFromShell('/create-gig');
          }}
        />
      ) : null}
    </div>
  );
};

export default MobileHome;
