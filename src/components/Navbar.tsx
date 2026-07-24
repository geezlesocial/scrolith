// src/components/Navbar.tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BellIcon as Bell,
  BriefcaseIcon as Briefcase,
  ChevronDownIcon as ChevronDown,
  CreditCardIcon as CreditCard,
  FileTextIcon as FileText,
  FolderIcon as Folder,
  GlobeIcon as Globe,
  HeartIcon as Heart,
  HelpCircleIcon as HelpCircle,
  HomeIcon as Home,
  LayoutDashboardIcon as LayoutDashboard,
  LogOutIcon as LogOut,
  MailIcon as Mail,
  MessageSquareIcon as MessageSquare,
  PlusIcon as Plus,
  SearchIcon as Search,
  SettingsIcon as Settings,
  ShieldIcon as Shield,
  ShoppingCartIcon as ShoppingCart,
  StarIcon as Star,
  UserIcon as User,
  UserPlusIcon as UserPlus,
  UsersIcon as Users
} from "./icons/ShellIcons";
import { useUser } from "../context/UserContext";
import { useContent } from "../context/ContentContext";
import { useNotification } from "../context/NotificationContext";
import { useCurrency } from "../context/CurrencyContext";
import { useSocket } from "../context/SocketContext";
import { useFavorites } from "../context/FavoritesContext";
import { useCart } from "../context/CartContext";
import { useMessages } from "../context/MessageContext";
import { CMSService } from "../services/cms";
import { HeaderConfig, ActivityConfig, UserRole, HeroSearchConfig } from "../types";
import SearchInput from "./SearchInput";
import EnterpriseAvatar from "./common/EnterpriseAvatar";
import { getNotificationActionUrl, getNotificationBucket, isExternalNotificationUrl } from "../utils/notificationRouting";
import { resolveOptimizedStaticImageUrl, resolveResponsiveAssetUrl } from "../utils/assetUrl";
import { HeaderMessagesPopover } from "./messaging";
import { formatMessagingBadgeCount } from "../services/messagingSurfaces";
import { HeaderPrimaryNavItem, HeaderUnreadBadge } from "./header";
import "./header/enterpriseHeader.css";

type LucideIconComponent = React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

const HEADER_SEARCH_PLACEHOLDER =
  "Search people, jobs, gigs, posts, pages, communities, or marketplace";

const formatBadgeCount = (count: number) => formatMessagingBadgeCount(count);

const resolveNavIconKey = (item: { label?: string; url?: string; icon?: string }) => {
  const iconHint = String(item?.icon || "").toLowerCase().trim();
  if (iconHint) return iconHint;
  const label = String(item?.label || "").toLowerCase();
  const url = String(item?.url || "").toLowerCase();
  if (label.includes("home") || url === "/" || url === "") return "home";
  if (label.includes("job") || url.includes("job") || url.includes("browse-jobs")) return "briefcase";
  if (label.includes("community") || url.includes("community") || label.includes("network")) return "users";
  if (label.includes("message") || url.includes("message") || label.includes("messaging")) return "messages";
  if (label.includes("notification") || url.includes("notification")) return "notifications";
  if (label.includes("profile") || url.includes("profile") || label === "me") return "profile";
  if (label.includes("gig") || label.includes("talent") || url.includes("browse")) return "briefcase";
  if (label.includes("market") || url.includes("market")) return "star";
  return "star";
};

const toPascalCase = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");

const NAVBAR_ICON_REGISTRY: Record<string, LucideIconComponent> = {
  Bell,
  Briefcase,
  CreditCard,
  FileText,
  Folder,
  Globe,
  Heart,
  HelpCircle,
  Home,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Shield,
  Star,
  User,
  UserPlus,
  Users
};

const NAVBAR_ICON_ALIAS: Record<string, string> = {
  message: "MessageSquare",
  messages: "MessageSquare",
  "message-square": "MessageSquare",
  chat: "MessageSquare",
  notification: "Bell",
  notifications: "Bell",
  bell: "Bell",
  help: "HelpCircle",
  support: "HelpCircle",
  favorites: "Heart",
  favorite: "Heart",
  heart: "Heart",
  profile: "User",
  user: "User",
  dashboard: "LayoutDashboard",
  currency: "Globe",
  settings: "Settings",
  signout: "LogOut",
  "sign-out": "LogOut",
  users: "Users",
  community: "Users",
  network: "Users",
  home: "Home",
  jobs: "Briefcase",
  briefcase: "Briefcase",
  briefcaseicon: "Briefcase"
};

const normalizeBoolean = (value: any, fallback: boolean) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    return Boolean(normalized);
  }
  return Boolean(value);
};

const normalizeRole = (role: any): string => {
  if (!role) return "guest";
  const r = String(role).toLowerCase().trim();
  if (r === "public") return "guest";
  if (r === "client") return "employer";
  if (r === "all" || r === "*") return "all";
  return r;
};

const normalizeRoleList = (value: any): string[] => {
  if (Array.isArray(value)) return value.map(normalizeRole);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(normalizeRole);
  }
  return [];
};

const ensureArray = <T,>(value: any): T[] => (Array.isArray(value) ? value : []);

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";

  const { user, isAuthenticated, logout } = useUser();
  const { settings } = useContent();
  const { notifications, markAsRead } = useNotification();
  const { currency, setCurrency, availableCurrencies } = useCurrency();
  const { socket } = useSocket();
  const { favorites } = useFavorites();
  const { cart } = useCart();
  const { unreadCount: messagesUnreadCount } = useMessages();

  const [headerConfig, setHeaderConfig] = useState<HeaderConfig | null>(null);
  const [activityConfig, setActivityConfig] = useState<ActivityConfig | null>(null);
  const [heroSearchConfig, setHeroSearchConfig] = useState<HeroSearchConfig | null>(null);

  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationTab, setNotificationTab] = useState<'home' | 'community'>('home');
  const [showMessagesDropdown, setShowMessagesDropdown] = useState(false);
  const [showHelpDropdown, setShowHelpDropdown] = useState(false);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showGuestPrimaryDropdown, setShowGuestPrimaryDropdown] = useState(false);
  const [showGuestExploreDropdown, setShowGuestExploreDropdown] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isDesktopNav, setIsDesktopNav] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    try {
      return window.matchMedia("(min-width: 1024px)").matches;
    } catch {
      return false;
    }
  });

  const [loading, setLoading] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const notificationListRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const currencyRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLDivElement>(null);
  const guestPrimaryRef = useRef<HTMLDivElement>(null);
  const guestExploreRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const [notificationScrollTop, setNotificationScrollTop] = useState(0);
  const [notificationViewportHeight, setNotificationViewportHeight] = useState(0);

  const _asRecord = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);
  const hc = _asRecord(headerConfig);
  const ac = _asRecord(activityConfig);
  const hsc = _asRecord(heroSearchConfig);
  const uobj = _asRecord(user);
  const pick = (obj: Record<string, unknown> | null | undefined, ...keys: string[]) => {
    if (!obj) return undefined;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
    }
    return undefined;
  };

  const _acDesign = (ac && (ac.design || ac.design)) as Record<string, unknown> | undefined;
  const acIconSize = Number(_acDesign?.iconSize ?? _acDesign?.icon_size ?? 20);
  const acIconStyle = (String(_acDesign?.iconStyle ?? _acDesign?.icon_style ?? 'outline') === 'filled' ? 'filled' : 'outline') as 'outline' | 'filled';
  const acBadgeColor = String(_acDesign?.badgeColor ?? _acDesign?.badge_color ?? '#EF4444');
  const acShowBadges = Boolean(_acDesign?.showBadges ?? _acDesign?.show_badges ?? true);
  const normalizeActivityType = (value: any) => {
    const raw = String(value || '').toLowerCase().trim();
    if (['bell', 'notification', 'notifications'].includes(raw)) return 'notifications';
    if (['message', 'messages', 'chat'].includes(raw)) return 'messages';
    if (['user', 'profile', 'account'].includes(raw)) return 'profile';
    if (['favorite', 'favorites', 'heart'].includes(raw)) return 'favorites';
    if (['help', 'support', 'question'].includes(raw)) return 'help';
    return raw;
  };
  const refreshConfigs = useCallback(async () => {
    try {
      const [header, activity, heroCfg] = await Promise.all([
        CMSService.getHeaderConfig(),
        CMSService.getActivityConfig(),
        isHome ? Promise.resolve(null) : CMSService.getHeroSearchConfig(),
      ]);

      if (!mountedRef.current) return;

      const hdr = _asRecord(header);
      setHeaderConfig({
        ...(header as any),
        navigation: ensureArray<any>(hdr?.navigation),
        userMenu: ensureArray<any>(hdr?.userMenu),
      } as unknown as HeaderConfig);

      const act = _asRecord(activity);
      const normalizedIcons = Array.isArray(act?.icons)
        ? (act?.icons as any[]).map((icon: any) => {
            const rawType = icon.type ?? icon.icon ?? icon.kind ?? '';
            const actionType = normalizeActivityType(rawType);
            return {
              ...icon,
              type: rawType,
              actionType,
              displayType: icon.displayType ?? rawType ?? actionType,
              isEnabled: icon.isEnabled ?? icon.is_enabled ?? true,
              showLabel: icon.showLabel ?? icon.show_label ?? false,
              sortOrder: icon.sortOrder ?? icon.sort_order ?? 0,
              roles: normalizeRoleList(icon.roles),
            };
          })
        : [];

      const normalizedHelpMenu = Array.isArray(act?.helpMenu || act?.help_menu)
        ? ((act?.helpMenu as any[]) || (act?.help_menu as any[])).map((link: any) => ({
            ...link,
            isEnabled: link.isEnabled ?? link.is_enabled ?? true,
          }))
        : [];

      const designSource = (act?.design as Record<string, unknown>) || {};
      const normalizedDesign = {
        iconStyle: designSource.iconStyle || designSource.icon_style || "outline",
        iconSize: designSource.iconSize || designSource.icon_size || 20,
        badgeColor: designSource.badgeColor || designSource.badge_color || "#EF4444",
        showBadges: designSource.showBadges ?? designSource.show_badges ?? true,
      };

      setActivityConfig({
        ...(activity as any),
        icons: normalizedIcons,
        helpMenu: normalizedHelpMenu,
        design: normalizedDesign,
      } as ActivityConfig);

      setHeroSearchConfig(heroCfg);
    } catch (error) {
      console.error("Failed to load navbar configs:", error);

      if (!mountedRef.current) return;

      // Minimal fallback to avoid crashes
      setHeaderConfig({
        navigation: [],
        userMenu: [],
        searchEnabled: true,
        searchMode: 'keyword'
      } as unknown as HeaderConfig);

      setActivityConfig({
        icons: [],
        helpMenu: [],
        design: { iconStyle: 'outline', iconSize: 20, badgeColor: '#EF4444', showBadges: true },
      } as ActivityConfig);

      setHeroSearchConfig({
        headline: '',
        subheadline: '',
        searchPlaceholder: '',
        searchSize: 'large',
        quickTags: [],
        trustedBrands: { enabled: false, title: '', logos: [] },
        valueProp: { enabled: false, heading: '', badges: [] },
      } as HeroSearchConfig);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [isHome]);

  useEffect(() => {
    mountedRef.current = true;
    refreshConfigs();
    return () => {
      mountedRef.current = false;
    };
  }, [refreshConfigs]);

  useEffect(() => {
    if (!socket) return;
    const handleRefresh = () => {
      refreshConfigs();
    };
    socket.on("cms:header_updated", handleRefresh);
    socket.on("cms:activity_updated", handleRefresh);
    socket.on("cms:hero_search_updated", handleRefresh);
    return () => {
      socket.off("cms:header_updated", handleRefresh);
      socket.off("cms:activity_updated", handleRefresh);
      socket.off("cms:hero_search_updated", handleRefresh);
    };
  }, [socket, refreshConfigs]);

  useEffect(() => {
    if (socket) return;
    const id = window.setInterval(() => {
      refreshConfigs();
    }, 5000);
    return () => window.clearInterval(id);
  }, [socket, refreshConfigs]);

  const closeAllHeaderPopovers = useCallback(() => {
    setShowNotifications(false);
    setShowMessagesDropdown(false);
    setShowHelpDropdown(false);
    setShowCurrencyDropdown(false);
    setShowProfileDropdown(false);
    setShowCreateMenu(false);
    setShowGuestPrimaryDropdown(false);
    setShowGuestExploreDropdown(false);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) setShowNotifications(false);
      if (msgRef.current && !msgRef.current.contains(target)) setShowMessagesDropdown(false);
      if (helpRef.current && !helpRef.current.contains(target)) setShowHelpDropdown(false);
      if (currencyRef.current && !currencyRef.current.contains(target)) setShowCurrencyDropdown(false);
      if (profileRef.current && !profileRef.current.contains(target)) setShowProfileDropdown(false);
      if (createRef.current && !createRef.current.contains(target)) setShowCreateMenu(false);
      if (guestPrimaryRef.current && !guestPrimaryRef.current.contains(target)) setShowGuestPrimaryDropdown(false);
      if (guestExploreRef.current && !guestExploreRef.current.contains(target)) setShowGuestExploreDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Escape closes the topmost open header popover first.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (showCreateMenu) {
        event.preventDefault();
        setShowCreateMenu(false);
        return;
      }
      if (showProfileDropdown) {
        event.preventDefault();
        setShowProfileDropdown(false);
        return;
      }
      if (showHelpDropdown) {
        event.preventDefault();
        setShowHelpDropdown(false);
        return;
      }
      if (showMessagesDropdown) {
        event.preventDefault();
        setShowMessagesDropdown(false);
        return;
      }
      if (showNotifications) {
        event.preventDefault();
        setShowNotifications(false);
        return;
      }
      if (showCurrencyDropdown) {
        event.preventDefault();
        setShowCurrencyDropdown(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    showCreateMenu,
    showProfileDropdown,
    showHelpDropdown,
    showMessagesDropdown,
    showNotifications,
    showCurrencyDropdown
  ]);

  // Desktop sticky header: subtle shadow after scroll (no layout jump)
  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 2);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Single mount for desktop vs compact bars so dropdown refs stay unique
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktopNav(Boolean(media.matches));
    sync();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  const handleLogout = () => {
    logout();
  };

  const resolveNotificationActorProfileUrl = (notification: any): string | undefined => {
    const metadata = (pick(notification as any, 'metadata') as any) || {};
    const actorUsername =
      (pick(notification as any, 'actorUsername', 'actor_username') as string | undefined) ||
      (metadata.actorUsername as string | undefined);
    const actorId =
      (pick(notification as any, 'actorId', 'actor_id') as string | undefined) ||
      (metadata.actorId as string | undefined);
    if (actorUsername) return `/u/${encodeURIComponent(actorUsername)}`;
    if (actorId) return `/profile/${encodeURIComponent(actorId)}`;
    return undefined;
  };

  const handleNotificationClick = (id: string, actionUrl?: string) => {
    markAsRead(id);
    setShowNotifications(false);
    if (actionUrl) {
      if (isExternalNotificationUrl(actionUrl)) {
        window.location.href = actionUrl;
        return;
      }
      navigate(actionUrl);
    }
  };

  const handleNotificationActorClick = (
    event: React.MouseEvent,
    notificationId: string,
    profileUrl?: string
  ) => {
    event.preventDefault();
    event.stopPropagation();
    markAsRead(notificationId);
    setShowNotifications(false);
    if (profileUrl) navigate(profileUrl);
  };

  const userRole = user?.role || UserRole.GUEST;
  const normalizedUserRole = normalizeRole(userRole || UserRole.GUEST);
  const favoritesCount = favorites?.length || 0;
  const cartCount = cart?.totalItems || 0;

  const notificationBuckets = useMemo(() => {
    const home: any[] = [];
    const community: any[] = [];
    (Array.isArray(notifications) ? notifications : []).forEach((n) => {
      (getNotificationBucket(n) === 'community' ? community : home).push(n);
    });
    return { home, community };
  }, [notifications]);

  const unreadNotificationCounts = useMemo(() => {
    const countUnread = (rows: any[]) => rows.filter((n) => !Boolean(n?.isRead ?? n?.is_read)).length;
    return {
      home: countUnread(notificationBuckets.home),
      community: countUnread(notificationBuckets.community),
      total: countUnread(Array.isArray(notifications) ? notifications : [])
    };
  }, [notifications, notificationBuckets]);

  const visibleNotifications = notificationTab === 'community' ? notificationBuckets.community : notificationBuckets.home;
  const visibleUnreadCount =
    notificationTab === 'community' ? unreadNotificationCounts.community : unreadNotificationCounts.home;
  const notificationTabLabel = notificationTab === 'community' ? 'Community' : 'Home';
  const notificationItemHeight = 86;
  const notificationOverscan = 4;
  const notificationWindow = useMemo(() => {
    const itemCount = visibleNotifications.length;
    if (itemCount === 0) return { start: 0, end: 0, top: 0, bottom: 0 };
    const viewport = Math.max(notificationViewportHeight, 320);
    const start = Math.max(0, Math.floor(notificationScrollTop / notificationItemHeight) - notificationOverscan);
    const end = Math.min(
      itemCount,
      Math.ceil((notificationScrollTop + viewport) / notificationItemHeight) + notificationOverscan
    );
    return {
      start,
      end,
      top: start * notificationItemHeight,
      bottom: Math.max(0, (itemCount - end) * notificationItemHeight)
    };
  }, [notificationItemHeight, notificationOverscan, notificationScrollTop, notificationViewportHeight, visibleNotifications.length]);
  const virtualNotifications = useMemo(
    () => visibleNotifications.slice(notificationWindow.start, notificationWindow.end),
    [visibleNotifications, notificationWindow.start, notificationWindow.end]
  );

  useEffect(() => {
    if (!showNotifications) return;
    const node = notificationListRef.current;
    if (!node) return;
    const syncMetrics = () => {
      setNotificationViewportHeight(node.clientHeight || 0);
      setNotificationScrollTop(node.scrollTop || 0);
    };
    syncMetrics();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncMetrics);
      return () => window.removeEventListener('resize', syncMetrics);
    }
    const observer = new ResizeObserver(syncMetrics);
    observer.observe(node);
    return () => observer.disconnect();
  }, [showNotifications, notificationTab, visibleNotifications.length]);
  const isPathActive = (path: string) => {
    if (!path) return false;
    if (location.pathname === path) return true;
    return location.pathname.startsWith(path + '/') || location.pathname.startsWith(path + '?');
  };

  const resolveUrl = (item: any) => item?.url ?? item?.href ?? item?.link ?? "";

  const isVisibleToRole = (item: any) => {
    const normalizedVisibility = normalizeRoleList(
      item?.visibility ?? item?.roles ?? item?.target_roles ?? item?.visible_to ?? item?.visibleTo
    );
    if (normalizedVisibility.length === 0) return true;
    if (normalizedVisibility.includes("all") || normalizedVisibility.includes("*")) return true;
    return normalizedVisibility.includes(normalizedUserRole);
  };

  const renderLink = (item: any, className: string, onClick?: () => void) => {
    const url = resolveUrl(item);
    if (!url) return null;
    const isExternal = url.startsWith("http");

    // Compute active state for internal links
    const isActiveInternal = !isExternal && isPathActive(url);
    const activeClasses = isActiveInternal ? 'text-blue-600 bg-blue-50' : '';

    if (isExternal) {
      return (
        <a
          key={item.id || url}
          href={url}
          target="_blank"
          rel="noreferrer"
          className={`${className} ${activeClasses}`.trim()}
          onClick={onClick}
        >
          {item.label}
        </a>
      );
    }

    return (
      <Link key={item.id || url} to={url} className={`${className} ${activeClasses}`.trim()} onClick={onClick}>
        {item.label}
      </Link>
    );
  };

  const renderNavItem = (item: any) => {
    const url = resolveUrl(item);
    if (!item || !item.label || !url) return null;
    if (!isVisibleToRole(item)) return null;
    const active = isPathActive(url);
    return renderLink(
      item,
      `px-3 py-2 rounded-md text-sm font-medium motion-safe:transition-colors ${
        active
          ? "text-blue-600 bg-blue-50 font-semibold"
          : "text-gray-700 hover:text-blue-600 hover:bg-gray-50"
      }`
    );
  };

  const renderCountBadge = (count: number, color?: string, className = "") => (
    <HeaderUnreadBadge count={count} color={color || acBadgeColor || "#EF4444"} className={className} />
  );

  const renderDesktopNavLink = (item: any) => {
    const url = resolveUrl(item);
    if (!item || !item.label || !url || !isVisibleToRole(item)) return null;
    const isExternal = url.startsWith("http");
    const active = !isExternal && isPathActive(url);
    // Prefer CMS-provided icon; fall back to label/url heuristics only when icon is absent.
    const iconKey = resolveNavIconKey({ label: item.label, url, icon: item.icon });
    const iconEl = getDynamicIcon(iconKey, 20, active ? "filled" : acIconStyle);

    return (
      <HeaderPrimaryNavItem
        key={item.id || url}
        label={String(item.label)}
        icon={iconEl}
        href={url}
        external={isExternal}
        active={active}
        as="link"
        ariaCurrent={active ? "page" : undefined}
        title={String(item.label)}
      />
    );
  };

  const renderDropdown = (
    dropdown: any,
    isOpen: boolean,
    setOpen: (open: boolean) => void,
    ref: React.RefObject<HTMLDivElement>
  ) => {
    if (!dropdown || !dropdown.label || !isVisibleToRole(dropdown)) return null;
    const items = ensureArray<any>(dropdown.items ?? dropdown.links ?? dropdown.menu).filter(
      (item: any) => item?.label && resolveUrl(item) && isVisibleToRole(item)
    );
    if (items.length === 0) return null;

    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!isOpen)}
          className="text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-50 transition"
        >
          {dropdown.label}
          <ChevronDown className="w-3 h-3" />
        </button>
      {isOpen && (
          <div className="absolute left-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fade-in-up">
            <div className="py-2">
              {items.map((item: any) => {
                const url = resolveUrl(item);
                const description = item.description || item.subtitle || item.tagline;
                const content = (
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-900">{item.label}</span>
                    {description ? (
                      <span className="text-xs text-gray-500">{description}</span>
                    ) : null}
                  </div>
                );
                if (!url) return null;
                if (item.type === "external" || item.external) {
                  return (
                    <a
                      key={item.id || url}
                      href={url}
                      onClick={() => setOpen(false)}
                      className="block px-4 py-2 hover:bg-gray-50 hover:text-blue-600"
                      target={item.target || "_blank"}
                      rel="noopener noreferrer"
                    >
                      {content}
                    </a>
                  );
                }
                return (
                  <button
                    key={item.id || url}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate(url);
                    }}
                    className="block w-full px-4 py-2 text-left hover:bg-gray-50 hover:text-blue-600"
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          </div>
        )}
    </div>
  );
};

  const getCtaClass = (cta: any) => {
    const variant = String(cta?.variant || cta?.style || "").toLowerCase();
    if (variant === "primary") {
      return "inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 sm:px-4";
    }
    if (variant === "ghost") {
      return "inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 sm:px-4";
    }
    if (variant === "outline") {
      return "inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 sm:px-4";
    }
    return "inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 sm:px-4";
  };

  const renderProfileItem = (item: any) => {
    const type = String(item?.type || "link").toLowerCase();
    const iconName = item?.icon || item?.iconName;
    const IconEl = iconName ? getDynamicIcon(String(iconName), Math.max(14, acIconSize - 4), acIconStyle) : null;

    if (type === "currency_switcher") {
      return (
        <div key={item.id || item.label} className="relative px-4 py-2" ref={currencyRef}>
          <button
            onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
            className="w-full flex items-center justify-between text-sm text-gray-700 hover:text-gray-900"
          >
            <span className="flex items-center gap-2">{IconEl && <span className="text-gray-500">{IconEl}</span>}{item.label}</span>
            <span className="flex items-center gap-1 text-gray-500">
              {currency.code}
              <ChevronDown className="w-3 h-3" />
            </span>
          </button>
          {showCurrencyDropdown && (
            <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 max-h-64 overflow-y-auto animate-fade-in-up">
              {availableCurrencies
                .filter((c) => c.isActive)
                .map((c) => (
                  <button
                    key={c.code}
                    onClick={() => {
                      setCurrency(c.code);
                      setShowCurrencyDropdown(false);
                    }}
                    className={`block w-full text-left px-4 py-2 text-xs hover:bg-gray-50 flex justify-between items-center ${
                      currency.code === c.code ? "font-bold text-blue-600 bg-blue-50" : "text-gray-700"
                    }`}
                  >
                    <span>{c.code}</span>
                    <span className="text-gray-400">{c.symbol}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      );
    }

    if (type === "sign_out") {
      return (
        <button
          key={item.id || item.label}
          onClick={handleLogout}
          className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
        >
          {IconEl && <span className="mr-3 text-red-600">{IconEl}</span>}
          {item.label}
        </button>
      );
    }

    // Default: render a link with optional icon
    const url = resolveUrl(item);
    if (!url) return null;
    const isExternal = url.startsWith("http");
    const baseClass = "block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600";
    const content = (
      <div className="flex items-center">
        {IconEl && <span className="mr-3 text-gray-500">{IconEl}</span>}
        <span>{item.label}</span>
      </div>
    );

    if (isExternal) {
      return (
        <a key={item.id || url} href={url} target="_blank" rel="noreferrer" className={baseClass} onClick={() => setShowProfileDropdown(false)}>
          {content}
        </a>
      );
    }

    return (
      <button
        key={item.id || url}
        type="button"
        className={`${baseClass} w-full text-left`}
        onClick={() => {
          setShowProfileDropdown(false);
          navigate(url);
        }}
      >
        {content}
      </button>
    );
  };

  const getDynamicIcon = (type: string, size: number, style: "outline" | "filled") => {
    const raw = String(type || "").trim();
    const normalized = raw.toLowerCase();
    const mappedName = NAVBAR_ICON_ALIAS[normalized] || toPascalCase(raw);
    const IconComponent = NAVBAR_ICON_REGISTRY[mappedName];

    if (IconComponent) {
      return <IconComponent size={size} className={`${style === "filled" ? "fill-current" : ""}`} />;
    }
    return <Star size={size} className={`${style === "filled" ? "fill-current" : ""}`} />;
  };

  const isActionEnabled = (type: string) => {
    if (type === "notifications") return normalizeBoolean(headerActions.notifications, true);
    if (type === "messages") return normalizeBoolean(headerActions.messages, true);
    if (type === "favorites") return normalizeBoolean(headerActions.lists, true);
    return true;
  };

  const showHeaderSearch = useMemo(() => {
    const enabled = pick(hc, 'searchEnabled', 'search_enabled');
    return !isHome && normalizeBoolean(enabled, true);
  }, [hc, isHome]);

  const profileEnabled = normalizeBoolean(
    (pick(hc, 'actions') as any)?.profile ?? pick(hc, 'profileEnabled') ?? pick(hc, 'profile_enabled'),
    true
  );

  const searchPlaceholder =
    String(pick(hsc, 'searchPlaceholder', 'search_placeholder') ?? '').trim() ||
    HEADER_SEARCH_PLACEHOLDER;
  const searchButtonLabel = String(pick(hsc, 'searchButtonLabel', 'search_button_label') ?? '');
  const searchButtonAriaLabel = String(pick(hsc, 'searchButtonAriaLabel', 'search_button_aria_label') ?? '') || String(searchButtonLabel || searchPlaceholder);
  const searchResultsUrl = String(pick(hsc, 'searchResultsUrl', 'search_results_url') ?? '');
  const rawSize = String(pick(hsc, 'searchSize', 'search_size') ?? 'large');
  const sizeKey = String(rawSize).toLowerCase();
  const normalizedSize =
    sizeKey === "xl" || sizeKey === "extralarge" || sizeKey === "extra_large" ? "xl" : sizeKey;
  const searchSize = (["normal", "large", "xl"].includes(normalizedSize) ? normalizedSize : "large") as
    | "normal"
    | "large"
    | "xl";

  const headerWrapperClass = [
    "scrolith-enterprise-header",
    isHome ? "relative" : "sticky top-0",
    isScrolled && !isHome ? "is-scrolled" : ""
  ]
    .filter(Boolean)
    .join(" ");

  const filteredNavigation = useMemo(() => {
    const rawNav = Array.isArray((headerConfig as any)?.navigation)
      ? (headerConfig as any).navigation
      : [];
    return rawNav.filter((item: any) => {
      const label = String(item?.label || "").toLowerCase();
      const url = resolveUrl(item);
      if (label === "dashboard") return false;
      if (
        url &&
        (url.startsWith("/freelancer/dashboard") ||
          url.startsWith("/client/dashboard") ||
          url === "/dashboard")
      ) {
        return false;
      }
      return Boolean(item?.label && url && isVisibleToRole(item));
    });
  }, [headerConfig, normalizedUserRole, location.pathname]);

  const brandName = String(pick(hc, 'title') ?? settings?.siteName ?? 'Scrolith');
  const rawBrandLogo = String(
    (headerConfig as any)?.logoUrl ||
    (headerConfig as any)?.logo_url ||
    settings?.logoUrl ||
    settings?.logo_url ||
    '/logo.png'
  );
  const brandLogoSrc = resolveOptimizedStaticImageUrl(
    resolveResponsiveAssetUrl(
      rawBrandLogo,
      { width: 320, height: 64 }
    )
  );
  const avatarName = String(pick(uobj, 'name', 'username', 'email') ?? '');
  // Phase 21.1.2 — raw photo URL only; EnterpriseAvatar handles initials fallback (no ui-avatars / blank white).
  const avatarUrl = resolveResponsiveAssetUrl(
    String(pick(uobj, 'avatar') ?? ''),
    { width: 96, height: 96, fit: 'cover' }
  );

  const headerActions = (pick(hc, 'actions') as Record<string, unknown>) || {};
  const headerSearchMode = String(pick(hc, 'searchMode', 'search_mode') ?? 'keyword');

  const visibleActivityIcons = useMemo(() => {
    if (!isAuthenticated || !activityConfig || !Array.isArray(ac?.icons)) return [];
    return (ac.icons as any[])
      .filter((icon: any) => {
        if (!icon.isEnabled) return false;
        const roles = normalizeRoleList(icon.roles);
        if (roles.length === 0) return true;
        if (roles.includes("all") || roles.includes("*")) return true;
        return roles.includes(normalizedUserRole);
      })
      .filter((icon: any) => isActionEnabled(icon.actionType || icon.type))
      .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [isAuthenticated, activityConfig, ac, normalizedUserRole, headerActions]);

  const centerActivityTypes = useMemo(
    () => new Set(["messages", "notifications", "profile"]),
    []
  );

  const desktopCenterActivityIcons = useMemo(
    () =>
      visibleActivityIcons.filter((icon: any) =>
        centerActivityTypes.has(String(icon.actionType || icon.type || "").toLowerCase())
      ),
    [visibleActivityIcons, centerActivityTypes]
  );

  const desktopRightActivityIcons = useMemo(
    () =>
      visibleActivityIcons.filter((icon: any) => {
        const actionType = String(icon.actionType || icon.type || "").toLowerCase();
        // Favorites has a dedicated right control; profile is the avatar menu
        if (actionType === "favorites" || actionType === "profile") return false;
        if (centerActivityTypes.has(actionType)) return false;
        return true;
      }),
    [visibleActivityIcons, centerActivityTypes]
  );

  const mobileActivityIcons = useMemo(
    () =>
      visibleActivityIcons.filter((icon: any) => {
        const actionType = String(icon.actionType || icon.type || "").toLowerCase();
        // Favorites/cart are dedicated links; avoid duplicates on compact bars
        return actionType !== "favorites";
      }),
    [visibleActivityIcons]
  );

  const roleSwitchConfig = (pick(hc, 'roleSwitch') as Record<string, unknown>) ?? (pick(hc, 'role_switch') as Record<string, unknown>) ?? {};
  const roleSwitchVisibility = normalizeRoleList(roleSwitchConfig.visibility);
  const roleSwitchVisibleForRole =
    roleSwitchVisibility.length === 0 ||
    roleSwitchVisibility.includes("all") ||
    roleSwitchVisibility.includes("*") ||
    roleSwitchVisibility.includes(normalizedUserRole);
  const roleSwitchLabel =
    normalizedUserRole === "freelancer"
      ? roleSwitchConfig.buyer_label ?? roleSwitchConfig.buyerLabel ?? ""
      : normalizedUserRole === "employer"
        ? roleSwitchConfig.seller_label ?? roleSwitchConfig.sellerLabel ?? ""
        : "";
  const roleSwitchUrl =
    normalizedUserRole === "freelancer"
      ? roleSwitchConfig.buyer_url ?? roleSwitchConfig.buyerUrl ?? ""
      : normalizedUserRole === "employer"
        ? roleSwitchConfig.seller_url ?? roleSwitchConfig.sellerUrl ?? ""
        : "";
  const showRoleSwitch =
    isAuthenticated &&
    roleSwitchVisibleForRole &&
    !!roleSwitchLabel &&
    !!roleSwitchUrl &&
    normalizeBoolean(headerActions.switchSelling ?? headerActions.switch_selling, true);

  const guestPrimaryDropdown = pick(hc, 'guestPrimaryDropdown') ?? pick(hc, 'guest_primary_dropdown');
  const guestExploreDropdown = pick(hc, 'guestExploreDropdown') ?? pick(hc, 'guest_explore_dropdown');
  const guestCtas = ensureArray<any>(pick(hc, 'guestCtas') ?? pick(hc, 'guest_ctas') ?? pick(hc, 'guestActions'))
    .filter((cta: any) => cta?.label && resolveUrl(cta) && isVisibleToRole(cta));
  const resolvedGuestCtas = guestCtas.length
    ? guestCtas
    : [
        { id: "guest-sign-in", label: "Sign In", url: "/auth/login", variant: "ghost", visibility: ["guest", "all"] },
        { id: "guest-join", label: "Join", url: "/auth/signup", variant: "primary", visibility: ["guest", "all"] },
      ];

  const normalizeProfileGroup = (group: any) => {
    const raw = String(group || "").toLowerCase().replace(/\s+/g, "_");
    if (raw === "business_tools" || raw === "businesstools") return "business_tools";
    if (raw === "utilities" || raw === "utility") return "utilities";
    return "primary";
  };

  const profileMenuGroupLabels = (pick(hc, 'profileMenuGroupLabels') ?? pick(hc, 'profile_menu_group_labels')) ?? {};

  const rawProfileMenuItems = ensureArray<any>(
    (headerConfig as any)?.userMenu || (headerConfig as any)?.profileMenu || (headerConfig as any)?.profile_menu
  ).filter((item: any) => {
    if (!item || !isVisibleToRole(item)) return false;
    const type = String(item.type || "link").toLowerCase();
    if (type === "currency_switcher" || type === "sign_out") {
      return Boolean(item.label);
    }
    return Boolean(item.label && resolveUrl(item));
  });

  const groupedProfileItems: Record<string, any[]> = {
    primary: [],
    business_tools: [],
    utilities: [],
  };

  rawProfileMenuItems.forEach((item: any) => {
    const groupKey = normalizeProfileGroup(item.group ?? item.section ?? item.menu_group);
    groupedProfileItems[groupKey] = groupedProfileItems[groupKey] || [];
    groupedProfileItems[groupKey].push(item);
  });

  if (showRoleSwitch) {
    const hasRoleSwitch = rawProfileMenuItems.some(
      (item: any) => resolveUrl(item) === roleSwitchUrl || item?.type === "role_switch"
    );
    if (!hasRoleSwitch) {
      groupedProfileItems.primary.unshift({
        id: "role-switch",
        label: roleSwitchLabel,
        url: roleSwitchUrl,
        type: "link",
        group: "primary",
      });
    }
  }

  // Ensure a Dashboard link exists in the profile menu for mobile/compact views
  const dashboardLinkUrl = normalizedUserRole === "freelancer" ? "/freelancer/dashboard" : normalizedUserRole === "employer" ? "/client/dashboard" : "";
  if (isAuthenticated && dashboardLinkUrl) {
    const hasDashboard = rawProfileMenuItems.some((item: any) => resolveUrl(item) === dashboardLinkUrl);
    if (!hasDashboard) {
      groupedProfileItems.primary.unshift({
        id: "nav-dashboard",
        label: "Dashboard",
        url: dashboardLinkUrl,
        type: "link",
        group: "primary",
      });
    }
  }

  // If we're on the freelancer dashboard page, provide a compact, predictable
  // avatar dropdown menu depending on whether the view is employer or freelancer.
  // This ensures the toggle shows the exact items requested by product.
  try {
    const urlParamsLocal = new URLSearchParams(location.search);
    const asParamLocal = (urlParamsLocal.get('as') || '').toString().toLowerCase();
    // Apply the avatar dropdown override for any signed-in user so the toggle
    // appears on every page while authenticated.
    const applyOverride = Boolean(isAuthenticated);

    if (applyOverride) {
      if (asParamLocal === 'employer') {
        // Employer view menu
        groupedProfileItems.primary = [
          { id: 'nav-profile', label: 'Profile', url: '/profile/edit', type: 'link', icon: 'User' },
          { id: 'nav-dashboard', label: 'Dashboard', url: '/client/dashboard', type: 'link', icon: 'LayoutDashboard' },
          { id: 'nav-currency', label: 'Switch Currency', type: 'currency_switcher', icon: 'Globe' },
          { id: 'nav-refer', label: 'Refer a friend', url: '/affiliate-program', type: 'link', icon: 'UserPlus' },
          { id: 'nav-billing', label: 'Billing and payments', url: '/client/dashboard?tab=wallet', type: 'link', icon: 'CreditCard' },
          { id: 'nav-settings', label: 'Settings', url: '/client/dashboard?tab=settings', type: 'link', icon: 'Settings' },
          { id: 'nav-signout', label: 'Sign out', type: 'sign_out', icon: 'LogOut' },
        ];
        groupedProfileItems.business_tools = [];
        groupedProfileItems.utilities = [];
      } else {
        // Freelancer view menu
        groupedProfileItems.primary = [
          { id: 'nav-my-profile', label: 'My Profile', url: '/freelancer/dashboard?tab=profile', type: 'link', icon: 'User' },
          { id: 'nav-dashboard', label: 'Dashboard', url: '/freelancer/dashboard', type: 'link', icon: 'LayoutDashboard' },
          { id: 'nav-currency', label: 'Switch Currency', type: 'currency_switcher', icon: 'Globe' },
          // Point freelancers to the client dashboard's project-briefs page so they can create briefs
          { id: 'nav-post-brief', label: 'Post a project brief', url: '/client/dashboard/project-briefs', type: 'link', icon: 'FileText' },
          { id: 'nav-your-briefs', label: 'Your briefs', url: '/client/dashboard?tab=jobs', type: 'link', icon: 'Folder' },
          { id: 'nav-refer', label: 'Refer a friend', url: '/affiliate-program', type: 'link', icon: 'UserPlus' },
          { id: 'nav-billing', label: 'Billing and payments', url: '/freelancer/dashboard?tab=wallet', type: 'link', icon: 'CreditCard' },
          { id: 'nav-settings', label: 'Settings', url: '/freelancer/dashboard?tab=settings', type: 'link', icon: 'Settings' },
          { id: 'nav-signout', label: 'Sign Out', type: 'sign_out', icon: 'LogOut' },
        ];
        groupedProfileItems.business_tools = [];
        groupedProfileItems.utilities = [];
      }
    }
  } catch (e) {
    // ignore URL parsing errors
  }

  if (isAuthenticated) {
    const hasEditProfile = rawProfileMenuItems.some((item: any) => resolveUrl(item) === "/profile/edit");
    if (!hasEditProfile) {
      groupedProfileItems.primary.push({
        id: "nav-edit-profile",
        label: "Edit Profile",
        url: "/profile/edit",
        type: "link",
        group: "primary",
      });
    }

    const hasSettings = rawProfileMenuItems.some((item: any) => resolveUrl(item) === "/settings");
    if (!hasSettings) {
      groupedProfileItems.utilities.push({
        id: "nav-settings",
        label: "Settings",
        url: "/settings",
        type: "link",
        group: "utilities",
      });
    }
  }

  const homeUrl = (headerConfig as any)?.homeUrl || (headerConfig as any)?.home_url || "/";
  const messagesActive = isPathActive("/messages");
  const notificationsActive = isPathActive("/notifications");
  const profilePathActive = isPathActive("/profile") || isPathActive("/freelancer/dashboard") || isPathActive("/client/dashboard");

  const renderNotificationsDropdown = () =>
    showNotifications ? (
      <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fade-in-up">
        <div className="px-4 py-3 border-b border-gray-50 bg-gray-50">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm text-gray-700">Notifications</h3>
            <span className="text-xs text-gray-500">
              {visibleUnreadCount} new {notificationTabLabel}
            </span>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setNotificationTab("home");
              }}
              className={[
                "rounded-full px-3 py-1 text-[11px] font-semibold",
                notificationTab === "home"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 border border-slate-200"
              ].join(" ")}
            >
              Home{unreadNotificationCounts.home ? ` (${unreadNotificationCounts.home})` : ""}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setNotificationTab("community");
              }}
              className={[
                "rounded-full px-3 py-1 text-[11px] font-semibold",
                notificationTab === "community"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 border border-slate-200"
              ].join(" ")}
            >
              Community
              {unreadNotificationCounts.community ? ` (${unreadNotificationCounts.community})` : ""}
            </button>
          </div>
        </div>
        <div
          ref={notificationListRef}
          className="max-h-96 overflow-y-auto"
          onScroll={(event) => setNotificationScrollTop(event.currentTarget.scrollTop)}
        >
          {visibleNotifications.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No new notifications</div>
          ) : (
            <>
              {notificationWindow.top > 0 ? (
                <div aria-hidden className="pointer-events-none" style={{ height: notificationWindow.top }} />
              ) : null}
              {virtualNotifications.map((notif) => {
                const actorName =
                  (pick(notif as any, "actorName", "actor_name") as string | undefined) ||
                  ((pick(notif as any, "metadata") as any)?.actorName as string | undefined);
                const actorAvatar =
                  (pick(notif as any, "actorAvatar", "actor_avatar") as string | undefined) ||
                  ((pick(notif as any, "metadata") as any)?.actorAvatar as string | undefined);
                const actorProfileUrl = resolveNotificationActorProfileUrl(notif);
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif.id, getNotificationActionUrl(notif))}
                    className={`p-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors relative ${
                      !notif.isRead ? "bg-blue-50/30" : ""
                    }`}
                  >
                    {actorName && (
                      <button
                        type="button"
                        onClick={(event) => handleNotificationActorClick(event, notif.id, actorProfileUrl)}
                        className="mb-2 flex items-center gap-2 hover:opacity-90"
                      >
                        <div className="h-6 w-6 overflow-hidden rounded-full bg-gray-100">
                          {actorAvatar ? (
                            <img src={actorAvatar} alt={actorName} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <span className="text-xs font-semibold text-gray-600">{actorName}</span>
                      </button>
                    )}
                    <div className="flex justify-between items-start mb-1">
                      <h4
                        className={`text-sm ${
                          !notif.isRead ? "font-bold text-gray-900" : "font-medium text-gray-700"
                        }`}
                      >
                        {notif.title}
                      </h4>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">
                        {new Date(
                          (pick(notif as any, "timestamp") as string) ?? Date.now()
                        ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">
                      {(pick(notif as any, "message") as string) ?? ""}
                    </p>
                    {!notif.isRead && (
                      <span className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
                    )}
                  </div>
                );
              })}
              {notificationWindow.bottom > 0 ? (
                <div
                  aria-hidden
                  className="pointer-events-none"
                  style={{ height: notificationWindow.bottom }}
                />
              ) : null}
            </>
          )}
        </div>
        <div className="border-t border-gray-100 p-2">
          <Link
            to="/notifications"
            onClick={() => setShowNotifications(false)}
            className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            Open Notification Center
          </Link>
        </div>
      </div>
    ) : null;

  const messagesPopoverId = "scrolith-header-messages-popover";

  const renderMessagesDropdown = () => (
    // Desktop + web mobile: full conversation list. Selecting a name/row soft-opens
    // chat (dock on desktop, SPA soft navigate on mobile) — no platform hard reload.
    <HeaderMessagesPopover
      open={showMessagesDropdown}
      onClose={() => setShowMessagesDropdown(false)}
      triggerRef={msgRef}
      id={messagesPopoverId}
    />
  );

  const handleActivityIconClick = (icon: any) => {
    const actionType = icon.actionType || icon.type;
    // One intentional top-level header surface at a time.
    if (actionType === "notifications") {
      const next = !showNotifications;
      closeAllHeaderPopovers();
      setShowNotifications(next);
      return;
    }
    if (actionType === "messages") {
      const next = !showMessagesDropdown;
      closeAllHeaderPopovers();
      setShowMessagesDropdown(next);
      return;
    }
    if (actionType === "profile") {
      if (profileEnabled) {
        const next = !showProfileDropdown;
        closeAllHeaderPopovers();
        setShowProfileDropdown(next);
      } else {
        navigate("/profile/edit");
      }
      return;
    }
    if (actionType === "help") {
      const next = !showHelpDropdown;
      closeAllHeaderPopovers();
      setShowHelpDropdown(next);
      return;
    }
    if (actionType === "favorites") {
      const favUrl = icon.url ?? icon.link ?? icon.href ?? "";
      if (favUrl) {
        if (favUrl.startsWith("http")) {
          window.location.href = favUrl;
        } else {
          navigate(favUrl);
        }
      }
    }
  };

  const getActivityBadgeCount = (actionType: string) => {
    if (actionType === "notifications") return unreadNotificationCounts.total;
    if (actionType === "messages") return messagesUnreadCount || 0;
    return 0;
  };

  const isActivityActive = (actionType: string) => {
    if (actionType === "messages") return messagesActive;
    if (actionType === "notifications") return notificationsActive;
    if (actionType === "profile") return profilePathActive || showProfileDropdown;
    return false;
  };

  const renderActivityIconControl = (
    icon: any,
    opts: { desktopStyle?: boolean; showDesktopLabel?: boolean } = {}
  ) => {
    const actionType = String(icon.actionType || icon.type || "").toLowerCase();
    const desktopStyle = Boolean(opts.desktopStyle);
    const showDesktopLabel = Boolean(opts.showDesktopLabel);
    const badgeCount = getActivityBadgeCount(actionType);
    const active = isActivityActive(actionType);
    const ref =
      actionType === "notifications"
        ? notifRef
        : actionType === "messages"
          ? msgRef
          : actionType === "help"
            ? helpRef
            : undefined;

    // CMS-provided label/icon remain authoritative for desktop primary shell.
    const cmsLabel = String(icon.label || actionType);
    const ariaCountLabel =
      actionType === "messages" && messagesUnreadCount > 0
        ? `${cmsLabel}, ${messagesUnreadCount} unread`
        : actionType === "notifications" && badgeCount > 0
          ? `${cmsLabel}, ${badgeCount} unread`
          : cmsLabel;

    const expanded =
      actionType === "notifications"
        ? showNotifications
        : actionType === "messages"
          ? showMessagesDropdown
          : actionType === "help"
            ? showHelpDropdown
            : actionType === "profile"
              ? showProfileDropdown
              : undefined;

    const hasPopup = ["notifications", "messages", "help", "profile"].includes(actionType);
    const iconKey = icon.displayType || icon.type || icon.actionType || icon.icon;

    if (desktopStyle) {
      return (
        <div
          key={icon.id || actionType}
          className="relative flex-shrink-0"
          ref={ref}
          data-header-activity={actionType}
        >
          <HeaderPrimaryNavItem
            as="button"
            label={cmsLabel}
            icon={getDynamicIcon(iconKey, 20, active ? "filled" : acIconStyle)}
            active={active || Boolean(expanded)}
            badgeCount={badgeCount}
            badgeColor={acBadgeColor}
            showBadge={Boolean(acShowBadges)}
            onClick={() => handleActivityIconClick(icon)}
            title={cmsLabel}
            ariaLabel={ariaCountLabel}
            ariaExpanded={expanded}
            ariaControls={
              actionType === "messages" && showMessagesDropdown && isDesktopNav
                ? messagesPopoverId
                : undefined
            }
            ariaHaspopup={hasPopup ? "dialog" : undefined}
          />

          {actionType === "notifications" ? renderNotificationsDropdown() : null}
          {actionType === "messages" ? renderMessagesDropdown() : null}

          {actionType === "help" && showHelpDropdown ? (
            <div className="absolute right-0 z-[70] mt-2 w-64 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg animate-fade-in-up">
              <div className="py-2">
                {ensureArray<any>((activityConfig as any)?.helpMenu).map((link: any) => {
                  if (!link?.label || !resolveUrl(link) || link.isEnabled === false) return null;
                  return renderLink(
                    link,
                    "block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600",
                    () => setShowHelpDropdown(false)
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      );
    }

    // Mobile / non-desktop activity controls (structure preserved).
    const buttonClass = [
      "relative flex min-h-10 min-w-10 items-center justify-center rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
      "motion-safe:transition-colors",
      icon.showLabel ? "flex-col space-y-1" : ""
    ].join(" ");

    return (
      <div key={icon.id || actionType} className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => handleActivityIconClick(icon)}
          className={buttonClass}
          title={cmsLabel}
          aria-label={ariaCountLabel}
          aria-expanded={expanded}
          aria-controls={
            actionType === "messages" && showMessagesDropdown && isDesktopNav
              ? messagesPopoverId
              : undefined
          }
          aria-haspopup={hasPopup ? "dialog" : undefined}
        >
          <span className="relative flex h-7 w-7 items-center justify-center">
            {getDynamicIcon(iconKey, acIconSize, active ? "filled" : acIconStyle)}
            {acShowBadges ? renderCountBadge(badgeCount, acBadgeColor, "top-0 right-0") : null}
          </span>
          {showDesktopLabel || icon.showLabel ? (
            <span className="hidden text-[10px] font-medium lg:block">{cmsLabel}</span>
          ) : null}
        </button>

        {actionType === "notifications" ? renderNotificationsDropdown() : null}
        {actionType === "messages" ? renderMessagesDropdown() : null}

        {actionType === "help" && showHelpDropdown ? (
          <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg animate-fade-in-up">
            <div className="py-2">
              {ensureArray<any>((activityConfig as any)?.helpMenu).map((link: any) => {
                if (!link?.label || !resolveUrl(link) || link.isEnabled === false) return null;
                return renderLink(
                  link,
                  "block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600",
                  () => setShowHelpDropdown(false)
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderFavoritesControl = (compact = false) => (
    <Link
      to="/favorites"
      className={["scrolith-header-utility relative", compact ? "is-compact" : ""].filter(Boolean).join(" ")}
      aria-label={`Favorites${favoritesCount ? `, ${favoritesCount} saved` : ""}`}
      title="Favorites"
    >
      <span className="relative inline-flex h-5 w-5 items-center justify-center">
        <Heart
          className={`h-4 w-4 ${favoritesCount ? "fill-current text-red-500" : "text-slate-500"}`}
        />
        {renderCountBadge(favoritesCount, "#EF4444", "top-[-6px] right-[-8px]")}
      </span>
      {!compact ? <span className="hidden 2xl:inline">Favorites</span> : null}
    </Link>
  );

  const renderCartControl = (compact = false) => (
    <Link
      to="/cart"
      className={["scrolith-header-utility relative", compact ? "is-compact" : ""].filter(Boolean).join(" ")}
      aria-label={`Cart${cartCount ? `, ${cartCount} items` : ""}`}
      title="Cart"
    >
      <span className="relative inline-flex h-5 w-5 items-center justify-center">
        <ShoppingCart className={`h-4 w-4 ${cartCount ? "text-blue-600" : "text-slate-500"}`} />
        {renderCountBadge(cartCount, "#2563EB", "top-[-6px] right-[-8px]")}
      </span>
      {!compact ? <span className="hidden 2xl:inline">Cart</span> : null}
    </Link>
  );

  const createMenuItems = useMemo(() => {
    // Only surface create actions already available on the platform via existing routes.
    const items: Array<{ id: string; label: string; url: string; roles?: string[] }> = [
      { id: "create-post", label: "Post", url: "/member-home" },
      { id: "create-job", label: "Job", url: "/create-job", roles: ["employer", "admin"] },
      { id: "create-gig", label: "Gig", url: "/create-gig", roles: ["freelancer", "admin"] },
      { id: "create-marketplace", label: "Marketplace listing", url: "/marketplace/create" }
    ];
    return items.filter((item) => {
      if (!item.roles || item.roles.length === 0) return true;
      return item.roles.includes(normalizedUserRole) || normalizedUserRole === "admin";
    });
  }, [normalizedUserRole]);

  const renderCreateControl = () => {
    if (!isAuthenticated || createMenuItems.length === 0) return null;
    return (
      <div className="relative" ref={createRef}>
        <button
          type="button"
          className="scrolith-header-utility !border-blue-200 !bg-blue-600 !text-white hover:!bg-blue-700 hover:!text-white"
          aria-label="Create"
          aria-expanded={showCreateMenu}
          aria-haspopup="menu"
          title="Create"
          onClick={() => {
            const next = !showCreateMenu;
            closeAllHeaderPopovers();
            setShowCreateMenu(next);
          }}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden 2xl:inline">Create</span>
        </button>
        {showCreateMenu ? (
          <div
            role="menu"
            aria-label="Create content"
            className="absolute right-0 z-[70] mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
          >
            {createMenuItems.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-700 focus:outline-none focus-visible:bg-blue-50"
                onClick={() => {
                  setShowCreateMenu(false);
                  navigate(item.url);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderProfileMenu = () =>
    showProfileDropdown ? (
      <div
        role="menu"
        aria-label="Account menu"
        className="absolute right-0 z-[70] mt-2 w-72 origin-top-right overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5"
      >
        <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-4 py-3">
          <p className="truncate text-sm font-semibold text-slate-900">{avatarName || "Account"}</p>
          <p className="truncate text-xs capitalize text-slate-500">{normalizedUserRole}</p>
        </div>
        <div className="py-2">
          {(["primary", "business_tools", "utilities"] as const).map((groupKey, index) => {
            const items = groupedProfileItems[groupKey] || [];
            if (items.length === 0) return null;
            const groupLabel = profileMenuGroupLabels[groupKey];
            return (
              <div
                key={groupKey}
                className={index === 0 ? "pb-1" : "border-t border-slate-100 pt-2 pb-1"}
              >
                {groupLabel ? (
                  <div className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {groupLabel}
                  </div>
                ) : null}
                {items.map((item: any) => renderProfileItem(item))}
              </div>
            );
          })}
        </div>
      </div>
    ) : null;

  const renderAvatarControl = () =>
    isAuthenticated && user && profileEnabled ? (
      <div className="relative ml-1 lg:ml-1.5" ref={profileRef}>
        <button
          type="button"
          onClick={() => {
            const next = !showProfileDropdown;
            closeAllHeaderPopovers();
            setShowProfileDropdown(next);
          }}
          className="scrolith-header-profile"
          aria-label="Open account menu"
          aria-expanded={showProfileDropdown}
          aria-haspopup="menu"
        >
          <EnterpriseAvatar
            user={user}
            src={avatarUrl || undefined}
            name={avatarName}
            size="sm"
            className="scrolith-header-profile__avatar !h-9 !w-9"
            alt=""
          />
          <span className="hidden max-w-[7.5rem] truncate text-sm font-semibold text-slate-800 2xl:block">
            {avatarName || "Account"}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 motion-safe:transition-transform ${
              showProfileDropdown ? "rotate-180" : ""
            }`}
          />
        </button>
        {renderProfileMenu()}
      </div>
    ) : null;

  if (loading) {
    return (
      <nav className={headerWrapperClass} aria-busy="true" aria-label="Main navigation loading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="scrolith-enterprise-header__inner justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-200" />
              <div className="hidden h-10 w-72 animate-pulse rounded-full bg-slate-200 lg:block" />
            </div>
            <div className="hidden items-center gap-2 lg:flex">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-11 w-14 animate-pulse rounded-xl bg-slate-200" />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
              <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
              <div className="h-10 w-28 animate-pulse rounded-full bg-slate-200" />
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <div className={`${headerWrapperClass} overflow-x-clip`} data-testid="scrolith-enterprise-header">
      <nav className="bg-transparent" aria-label="Primary">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {isDesktopNav ? (
            /* ===== Desktop enterprise header (lg+) ===== */
            <div
              className="scrolith-enterprise-header__inner"
              data-header-layout="three-zone-grid"
            >
              {/* LEFT: Brand + Search — may shrink; search compresses first */}
              <div className="scrolith-header-zone scrolith-header-zone--left" data-header-zone="left">
                <Link
                  to={homeUrl}
                  className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                  aria-label={brandName ? `${brandName} home` : "Scrolith home"}
                >
                  {brandLogoSrc ? (
                    <img
                      src={brandLogoSrc}
                      alt=""
                      width={160}
                      height={32}
                      decoding="async"
                      className="h-8 w-auto max-w-[7.5rem] object-contain xl:max-w-[9.5rem]"
                    />
                  ) : (
                    <div
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white"
                      aria-hidden="true"
                    >
                      S
                    </div>
                  )}
                  {brandName ? (
                    <span className="hidden truncate text-[1.05rem] font-bold tracking-tight text-slate-900 xl:block">
                      {brandName}
                    </span>
                  ) : null}
                </Link>

                {showHeaderSearch ? (
                  <div className="scrolith-header-search-shell">
                    <SearchInput
                      placeholder={searchPlaceholder}
                      size="header"
                      showButton={false}
                      searchMode={headerSearchMode}
                      searchPath={searchResultsUrl || undefined}
                      buttonAriaLabel={searchButtonAriaLabel || searchPlaceholder}
                    />
                  </div>
                ) : null}
              </div>

              {/* CENTER: CMS navigation + Messages/Notifications activity (admin-owned) */}
              <div
                className="scrolith-header-zone scrolith-header-zone--center"
                data-header-zone="center"
              >
                <div
                  className="scrolith-header-nav-track"
                  role="navigation"
                  aria-label="Main sections"
                  data-testid="scrolith-header-primary-nav"
                >
                  {!isAuthenticated ? (
                    <div className="flex items-center gap-2 px-2">
                      {renderDropdown(
                        guestPrimaryDropdown,
                        showGuestPrimaryDropdown,
                        setShowGuestPrimaryDropdown,
                        guestPrimaryRef
                      )}
                      {renderDropdown(
                        guestExploreDropdown,
                        showGuestExploreDropdown,
                        setShowGuestExploreDropdown,
                        guestExploreRef
                      )}
                    </div>
                  ) : null}
                  {filteredNavigation.map((item: any) => renderDesktopNavLink(item))}
                  {isAuthenticated
                    ? desktopCenterActivityIcons.map((icon: any) =>
                        renderActivityIconControl(icon, {
                          desktopStyle: true,
                          showDesktopLabel: true
                        })
                      )
                    : null}
                </div>
              </div>

              {/* RIGHT: Fixed utilities + account — never underlaps center nav */}
              <div
                className="scrolith-header-zone scrolith-header-zone--right"
                data-header-zone="right"
              >
                {isAuthenticated
                  ? desktopRightActivityIcons.map((icon: any) =>
                      renderActivityIconControl(icon, { desktopStyle: false })
                    )
                  : null}

                {isAuthenticated ? (
                  <div className="scrolith-header-utility-cluster" data-testid="scrolith-header-utility-cluster">
                    {renderFavoritesControl(false)}
                    {renderCartControl(false)}
                    {renderCreateControl()}
                  </div>
                ) : null}

                {isAuthenticated && showRoleSwitch
                  ? renderLink(
                      { id: "role-switch-nav", label: roleSwitchLabel, url: roleSwitchUrl },
                      "scrolith-header-utility hidden xl:inline-flex !px-3 !py-1.5 text-xs"
                    )
                  : null}

                {isAuthenticated && user ? (
                  renderAvatarControl()
                ) : (
                  <div className="flex items-center gap-2">
                    {resolvedGuestCtas.map((cta: any) =>
                      renderLink(
                        cta,
                        getCtaClass(cta),
                        () => {
                          setShowGuestPrimaryDropdown(false);
                          setShowGuestExploreDropdown(false);
                        }
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ===== Mobile + tablet bar (structure preserved) ===== */
            <div className="flex h-16 items-center justify-between gap-3 sm:gap-4">
              <div className="flex min-w-0 flex-1 items-center">
                <Link
                  to={homeUrl}
                  className="flex min-w-0 items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 sm:mr-4"
                >
                  {brandLogoSrc ? (
                    <img
                      src={brandLogoSrc}
                      alt={brandName || ""}
                      width={160}
                      height={32}
                      decoding="async"
                      className="h-7 w-auto max-w-[7.5rem] object-contain sm:h-8 sm:max-w-[10rem]"
                    />
                  ) : (
                    <div className="h-8 w-8 flex-shrink-0 rounded-lg bg-gray-200" aria-hidden="true" />
                  )}
                  {brandName ? (
                    <span className="hidden truncate text-xl font-bold text-gray-900 sm:block">
                      {brandName}
                    </span>
                  ) : null}
                </Link>
              </div>

              <div className="hidden items-center gap-3 md:flex">
                {!isAuthenticated ? (
                  <>
                    {renderDropdown(
                      guestPrimaryDropdown,
                      showGuestPrimaryDropdown,
                      setShowGuestPrimaryDropdown,
                      guestPrimaryRef
                    )}
                    {renderDropdown(
                      guestExploreDropdown,
                      showGuestExploreDropdown,
                      setShowGuestExploreDropdown,
                      guestExploreRef
                    )}
                  </>
                ) : null}
                {filteredNavigation.map((item: any) => renderNavItem(item))}
              </div>

              <div className="ml-auto flex flex-shrink-0 items-center gap-1.5 sm:gap-2 md:gap-3">
                {isAuthenticated ? (
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    {mobileActivityIcons.map((icon: any) => renderActivityIconControl(icon))}
                  </div>
                ) : null}

                {isAuthenticated ? (
                  <div className="flex items-center gap-1.5">
                    {renderFavoritesControl(true)}
                    {renderCartControl(true)}
                  </div>
                ) : null}

                {isAuthenticated && user ? (
                  renderAvatarControl()
                ) : (
                  <div className="flex items-center space-x-2">
                    {resolvedGuestCtas.map((cta: any) =>
                      renderLink(
                        cta,
                        getCtaClass(cta),
                        () => {
                          setShowGuestPrimaryDropdown(false);
                          setShowGuestExploreDropdown(false);
                        }
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Search below bar: mobile/tablet only (desktop search is inline) */}
      {showHeaderSearch && !isDesktopNav ? (
        <div className="overflow-x-clip border-t border-gray-100 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4">
            <div className="mx-auto max-w-3xl">
              <SearchInput
                placeholder={searchPlaceholder}
                size={searchSize}
                showButton
                buttonLabel={searchButtonLabel}
                buttonAriaLabel={searchButtonAriaLabel || searchButtonLabel || searchPlaceholder}
                searchMode={headerSearchMode}
                searchPath={searchResultsUrl || undefined}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Navbar;
