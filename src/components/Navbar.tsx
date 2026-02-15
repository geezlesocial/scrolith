// src/components/Navbar.tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import * as LucideIcons from "lucide-react";
import { ChevronDown, Heart, ShoppingCart } from "lucide-react";
import { useUser } from "../context/UserContext";
import { useContent } from "../context/ContentContext";
import { useNotification } from "../context/NotificationContext";
import { useCurrency } from "../context/CurrencyContext";
import { useSocket } from "../context/SocketContext";
import { useFavorites } from "../context/FavoritesContext";
import { useCart } from "../context/CartContext";
import { CMSService } from "../services/cms";
import { HeaderConfig, ActivityConfig, UserRole, HeroSearchConfig } from "../types";
import SearchInput from "./SearchInput";
import { getNotificationActionUrl, getNotificationBucket } from "../utils/notificationRouting";

type LucideIconComponent = React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

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

  const { user, isAuthenticated, logout } = useUser();
  const { settings } = useContent();
  const { notifications, markAsRead } = useNotification();
  const { currency, setCurrency, availableCurrencies } = useCurrency();
  const { socket } = useSocket();
  const { favorites } = useFavorites();
  const { cart } = useCart();

  const [headerConfig, setHeaderConfig] = useState<HeaderConfig | null>(null);
  const [activityConfig, setActivityConfig] = useState<ActivityConfig | null>(null);
  const [heroSearchConfig, setHeroSearchConfig] = useState<HeroSearchConfig | null>(null);

  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationTab, setNotificationTab] = useState<'home' | 'community'>('home');
  const [showMessagesDropdown, setShowMessagesDropdown] = useState(false);
  const [showHelpDropdown, setShowHelpDropdown] = useState(false);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showGuestPrimaryDropdown, setShowGuestPrimaryDropdown] = useState(false);
  const [showGuestExploreDropdown, setShowGuestExploreDropdown] = useState(false);

  const [loading, setLoading] = useState(true);

  const notifRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const currencyRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const guestPrimaryRef = useRef<HTMLDivElement>(null);
  const guestExploreRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

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
        CMSService.getHeroSearchConfig(),
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
  }, []);

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

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) setShowNotifications(false);
      if (msgRef.current && !msgRef.current.contains(event.target as Node)) setShowMessagesDropdown(false);
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) setShowHelpDropdown(false);
      if (currencyRef.current && !currencyRef.current.contains(event.target as Node)) setShowCurrencyDropdown(false);
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setShowProfileDropdown(false);
      if (guestPrimaryRef.current && !guestPrimaryRef.current.contains(event.target as Node)) setShowGuestPrimaryDropdown(false);
      if (guestExploreRef.current && !guestExploreRef.current.contains(event.target as Node)) setShowGuestExploreDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    try {
      logout();
    } finally {
      navigate('/');
    }
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
  const isHome = location.pathname === "/";
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
    return renderLink(
      item,
      `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        location.pathname === url
          ? "text-blue-600 bg-blue-50"
          : "text-gray-700 hover:text-blue-600 hover:bg-gray-50"
      }`
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
                  <Link
                    key={item.id || url}
                    to={url}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2 hover:bg-gray-50 hover:text-blue-600"
                  >
                    {content}
                  </Link>
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
      return "inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700";
    }
    if (variant === "ghost") {
      return "inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold text-gray-700 hover:bg-gray-100";
    }
    if (variant === "outline") {
      return "inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50";
    }
    return "inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50";
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
      <Link key={item.id || url} to={url} className={baseClass} onClick={() => setShowProfileDropdown(false)}>
        {content}
      </Link>
    );
  };

  const getDynamicIcon = (type: string, size: number, style: "outline" | "filled") => {
    const raw = String(type || "").trim().toLowerCase();
    const aliasMap: Record<string, string> = {
      message: "MessageSquare",
      messages: "MessageSquare",
      "message-square": "MessageSquare",
      "messageSquare": "MessageSquare",
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
    };

    const alias = aliasMap[raw];
    if (alias) {
      const AliasIcon = (LucideIcons as Record<string, LucideIconComponent>)[alias];
      if (AliasIcon) {
        return <AliasIcon size={size} className={`${style === "filled" ? "fill-current" : ""}`} />;
      }
    }

    const pascalCaseType = raw
      .split(/[-_\s]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");

    const IconComponent = (LucideIcons as Record<string, LucideIconComponent>)[pascalCaseType];

    if (IconComponent) {
      return <IconComponent size={size} className={`${style === "filled" ? "fill-current" : ""}`} />;
    }
    return <LucideIcons.Star size={size} className={`${style === "filled" ? "fill-current" : ""}`} />;
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

  const searchPlaceholder = String(pick(hsc, 'searchPlaceholder', 'search_placeholder') ?? '');
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

  const headerWrapperClass = `${isHome ? "relative" : "sticky top-0"} z-40 bg-white border-b border-gray-200`;
  const brandName = String(pick(hc, 'title') ?? settings?.siteName ?? '');
  const avatarName = String(pick(uobj, 'name', 'username', 'email') ?? '');
  const avatarUrl = String(pick(uobj, 'avatar') ?? (avatarName ? `https://ui-avatars.com/api/?name=${encodeURIComponent(avatarName)}&background=0D8ABC&color=fff` : ''));

  const headerActions = (pick(hc, 'actions') as Record<string, unknown>) || {};
  const headerSearchMode = String(pick(hc, 'searchMode', 'search_mode') ?? 'keyword');

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

  if (loading) {
    return (
      <nav className={headerWrapperClass}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gray-200 rounded animate-pulse"></div>
              <div className="ml-3 w-24 h-6 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="hidden md:flex items-center space-x-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ))}
            </div>
            <div className="flex items-center space-x-2">
              <div className="h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <div className={headerWrapperClass}>
      {/* TOP NAV */}
      <nav className="bg-white transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            {/* Left: Logo */}
            <div className="flex items-center">
              <Link
                to={(headerConfig as any)?.homeUrl || (headerConfig as any)?.home_url || "/"}
                className="flex-shrink-0 flex items-center mr-8"
              >
                {(headerConfig as any)?.logoUrl || (headerConfig as any)?.logo_url || settings?.logoUrl ? (
                  <img
                    src={(headerConfig as any)?.logoUrl || (headerConfig as any)?.logo_url || settings?.logoUrl}
                    alt={brandName || ""}
                    className="h-8 w-auto object-contain"
                  />
                ) : (
                  <div className="w-8 h-8 bg-gray-200 rounded-lg" aria-hidden="true" />
                )}
                {brandName ? (
                  <span className="ml-2 text-xl font-bold text-gray-900 hidden sm:block">{brandName}</span>
                ) : null}
              </Link>
            </div>

            {/* Center: Navigation Links */}
            <div className="hidden md:flex md:items-center md:space-x-6">
              {!isAuthenticated ? (
                <>
                  {renderDropdown(guestPrimaryDropdown, showGuestPrimaryDropdown, setShowGuestPrimaryDropdown, guestPrimaryRef)}
                  {renderDropdown(guestExploreDropdown, showGuestExploreDropdown, setShowGuestExploreDropdown, guestExploreRef)}
                </>
              ) : null}
              {(() => {
                const rawNav = Array.isArray((headerConfig as any)?.navigation) ? (headerConfig as any).navigation : [];
                const navCopy = Array.from(rawNav);
                const filteredNav = navCopy.filter((item: any) => {
                  const label = String(item?.label || '').toLowerCase();
                  const url = resolveUrl(item);
                  if (label === 'dashboard') return false;
                  if (url && (url.startsWith('/freelancer/dashboard') || url.startsWith('/client/dashboard') || url === '/dashboard')) {
                    return false;
                  }
                  return true;
                });
                // Do not inject "My Ads" into the global header — it's available in dashboards only
                return filteredNav.map(renderNavItem);
              })()}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center space-x-2 md:space-x-4">
              {/* Dynamic Activity Icons */}
              {isAuthenticated && activityConfig ? (
                <div className="flex items-center space-x-1 sm:space-x-2">
                  {Array.isArray(ac?.icons) &&
                      (ac?.icons as any[])
                        .filter((icon: any) => {
                          if (!icon.isEnabled) return false;
                          const roles = normalizeRoleList(icon.roles);
                          if (roles.length === 0) return true;
                          if (roles.includes("all") || roles.includes("*")) return true;
                          return roles.includes(normalizedUserRole);
                        })
                        .filter((icon: any) => isActionEnabled(icon.actionType || icon.type))
                        .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
                        .map((icon: any) => (
                        <div
                          key={icon.id}
                          ref={(icon.actionType || icon.type) === "notifications" ? notifRef : (icon.actionType || icon.type) === "messages" ? msgRef : helpRef}
                        >
                          <button
                            onClick={() => {
                              const actionType = icon.actionType || icon.type;
                              if (actionType === "notifications") setShowNotifications(!showNotifications);
                              if (actionType === "messages") setShowMessagesDropdown(!showMessagesDropdown);
                              if (actionType === "profile") {
                                if (profileEnabled) {
                                  setShowProfileDropdown(!showProfileDropdown);
                                } else {
                                  window.location.href = "/profile/edit";
                                }
                              }
                              if (actionType === "help") setShowHelpDropdown(!showHelpDropdown);
                              if (actionType === "favorites") {
                                const favUrl = icon.url ?? icon.link ?? icon.href ?? "";
                                if (favUrl) {
                                  window.location.href = favUrl;
                                }
                              }
                            }}
                            className={`text-gray-500 hover:text-gray-900 p-2 rounded-full hover:bg-gray-100 relative flex items-center ${
                              icon.showLabel ? "flex-col items-center space-y-1" : ""
                            }`}
                            title={icon.label}
                          >
                            {getDynamicIcon(icon.displayType || icon.type || icon.actionType, acIconSize, acIconStyle)}
                            {acShowBadges &&
                              (icon.actionType || icon.type) === "notifications" &&
                              unreadNotificationCounts.total > 0 && (
                                <span
                                  className="absolute top-1 right-1 h-4 min-w-[16px] px-1 rounded-full text-white text-[10px] flex items-center justify-center font-bold"
                                  style={{ backgroundColor: acBadgeColor }}
                                >
                                  {unreadNotificationCounts.total}
                                </span>
                              )}
                            {icon.showLabel && <span className="text-[10px] font-medium hidden lg:block">{icon.label}</span>}
                          </button>

                          {/* Notifications Dropdown */}
                          {(icon.actionType || icon.type) === "notifications" && showNotifications && (
                            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fade-in-up">
                              <div className="px-4 py-3 border-b border-gray-50 bg-gray-50">
                                <div className="flex justify-between items-center">
                                  <h3 className="font-bold text-sm text-gray-700">Notifications</h3>
                                  <span className="text-xs text-gray-500">{visibleUnreadCount} new {notificationTabLabel}</span>
                                </div>
                                <div className="mt-2 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setNotificationTab('home');
                                    }}
                                    className={[
                                      'rounded-full px-3 py-1 text-[11px] font-semibold',
                                      notificationTab === 'home' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'
                                    ].join(' ')}
                                  >
                                    Home{unreadNotificationCounts.home ? ` (${unreadNotificationCounts.home})` : ''}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setNotificationTab('community');
                                    }}
                                    className={[
                                      'rounded-full px-3 py-1 text-[11px] font-semibold',
                                      notificationTab === 'community'
                                        ? 'bg-slate-900 text-white'
                                        : 'bg-white text-slate-700 border border-slate-200'
                                    ].join(' ')}
                                  >
                                    Community{unreadNotificationCounts.community ? ` (${unreadNotificationCounts.community})` : ''}
                                  </button>
                                </div>
                              </div>
                              <div className="max-h-96 overflow-y-auto">
                                {visibleNotifications.length === 0 ? (
                                  <div className="p-6 text-center text-gray-400 text-sm">No new notifications</div>
                                ) : (
                                  visibleNotifications.map((notif) => {
                                    const actorName =
                                      (pick(notif as any, 'actorName', 'actor_name') as string | undefined) ||
                                      ((pick(notif as any, 'metadata') as any)?.actorName as string | undefined);
                                    const actorAvatar =
                                      (pick(notif as any, 'actorAvatar', 'actor_avatar') as string | undefined) ||
                                      ((pick(notif as any, 'metadata') as any)?.actorAvatar as string | undefined);
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
                                        <h4 className={`text-sm ${!notif.isRead ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
                                          {notif.title}
                                        </h4>
                                        <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">
                                          {new Date((pick(notif as any, 'timestamp') as string) ?? Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-500 line-clamp-2">{(pick(notif as any, 'message') as string) ?? ''}</p>
                                      {!notif.isRead && <span className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></span>}
                                    </div>
                                  );
                                  })
                                )}
                              </div>
                            </div>
                          )}

                          {/* Messages Dropdown */}
                          {(icon.actionType || icon.type) === "messages" && showMessagesDropdown && (
                            <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fade-in-up">
                              <div className="px-4 py-3 border-b border-gray-50 bg-gray-50 flex justify-between items-center">
                                <h3 className="font-bold text-sm text-gray-700">Messages</h3>
                              </div>
                              <div className="p-4 text-sm text-gray-600">
                                <p className="mb-3">Open your inbox to view conversations.</p>
                                <Link
                                  to="/messages"
                                  className="inline-flex items-center px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                                  onClick={() => setShowMessagesDropdown(false)}
                                >
                                  Go to Messages
                                </Link>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                </div>
              ) : null}

              {isAuthenticated && (
                <div className="flex items-center gap-2">
                  <Link
                    to="/favorites"
                    className="relative inline-flex items-center gap-2 px-3 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Heart className={`w-4 h-4 ${favoritesCount ? 'text-red-500 fill-current' : 'text-gray-500'}`} />
                    <span className="hidden sm:inline">Favorites</span>
                    {favoritesCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full text-white text-[10px] flex items-center justify-center font-bold bg-red-500">
                        {favoritesCount}
                      </span>
                    )}
                  </Link>
                  <Link
                    to="/cart"
                    className="relative inline-flex items-center gap-2 px-3 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <ShoppingCart className={`w-4 h-4 ${cartCount ? 'text-blue-600' : 'text-gray-500'}`} />
                    <span className="hidden sm:inline">Cart</span>
                    {cartCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full text-white text-[10px] flex items-center justify-center font-bold bg-blue-600">
                        {cartCount}
                      </span>
                    )}
                  </Link>
                </div>
              )}

              {isAuthenticated && showRoleSwitch
                ? renderLink(
                    { id: "role-switch-nav", label: roleSwitchLabel, url: roleSwitchUrl },
                    "hidden lg:inline-flex items-center px-3 py-2 text-sm font-semibold text-gray-700 border border-gray-200 rounded-full hover:bg-gray-50"
                  )
                : null}

              {/* Direct Dashboard links removed to avoid duplicate header entries */}

              {/* Profile Dropdown */}
              {isAuthenticated && user ? (
                profileEnabled ? (
                  <div className="relative ml-3" ref={profileRef}>
                    <button
                      onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                      className="flex items-center space-x-2 focus:outline-none"
                    >
                      {avatarUrl ? (
                        <img
                          className="h-8 w-8 rounded-full object-cover border border-indigo-200"
                          src={avatarUrl}
                          alt={avatarName || ""}
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-gray-200" aria-hidden="true" />
                      )}
                      {avatarName ? (
                        <span className="hidden lg:block text-sm font-medium text-gray-700">{avatarName}</span>
                      ) : null}
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    </button>

                    {showProfileDropdown && (
                      <div className="origin-top-right absolute right-0 mt-2 w-72 rounded-xl shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50 animate-fade-in-up">
                        <div className="py-2">
                          {(["primary", "business_tools", "utilities"] as const).map((groupKey, index) => {
                            const items = groupedProfileItems[groupKey] || [];
                            if (items.length === 0) return null;
                            const groupLabel = profileMenuGroupLabels[groupKey];
                            return (
                              <div
                                key={groupKey}
                                className={index === 0 ? "pb-1" : "border-t border-gray-100 pt-2 pb-1"}
                              >
                                {groupLabel ? (
                                  <div className="px-4 pb-1 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                                    {groupLabel}
                                  </div>
                                ) : null}
                                {items.map((item: any) => renderProfileItem(item))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null
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
        </div>
      </nav>

      {/* HEADER SEARCH (non-home only) */}
      {showHeaderSearch ? (
        <div className="bg-white border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="max-w-3xl mx-auto">
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
