import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthSocialButtons from "../../auth/AuthSocialButtons";
import { useUser } from "../../context/UserContext";
import { loadPublicCurrencyCatalog } from "../../context/CurrencyContext";
import { type Gig } from "../../services/gigs";
import { CMSService } from "../../services/cms";
import { listMarketplaceListings } from "../../services/marketplace";
import OptimizedImage from "../media/OptimizedImage";
import { getApiBaseUrl } from "../../utils/apiBase";
import { resolveAssetUrl, resolveResponsiveAssetUrl } from "../../utils/assetUrl";
import { resolveGuestMarketplaceCategoryLabel } from "../../utils/guestCategoryLabel";
import { resolveGuestMarketplaceListingImage, resolveMediaUrl } from "../../utils/guestMarketplaceMedia";
import {
  BriefcaseIcon as Briefcase
} from "../icons/ShellIcons";
import {
  FooterCtaStripContent,
  GuestCommunityPreviewContent,
  GuestFeatureShowcaseContent,
  GuestFinalCtaContent,
  GuestHeroAuthContent,
  GuestPathsContent,
  GuestTrendingPreviewContent,
  GuestWhatIsScrolithContent,
  GuidesGridContent,
  MadeOnScrolithContent,
  MarketplaceTilesContent,
  PopularServicesContent,
  PromoBannersContent,
  TrustValueContent,
  VideoFeatureContent,
  AuthPagesConfig,
  UserRole,
} from "../../types";
import {
  GuestAuthCard,
  GuestAuthModal,
  GuestScrolithaPanel,
  isInlineGuestAuthUrl,
  normalizeGuestAuthTab
} from "./GuestAuthExperience";

const ensureArray = <T = any,>(value: any): T[] => (Array.isArray(value) ? value : []);
const SCROLITH_LOGO = "/logo-64.png";
const GUEST_NETWORKING_IMAGE = "/images/guest-diverse-networking.webp";
const GUEST_NETWORKING_IMAGE_FALLBACK = "/images/guest-diverse-networking.jpg";

const resolveUrl = (item: any) => item?.url ?? item?.href ?? item?.link ?? "";

const responsiveImageUrl = (
  value: string | undefined | null,
  width: number,
  height: number,
  fit: 'cover' | 'contain' | 'inside' = 'cover'
) => resolveResponsiveAssetUrl(value || '', { width, height, fit, quality: 72 });

const isExternalUrl = (url: string) => /^https?:\/\//i.test(url);

const normalizeKey = (value: any) => String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");

const isMarketplaceTab = (tab: any): boolean => {
  const source = [
    tab?.id,
    tab?.key,
    tab?.label,
    tab?.title,
    tab?.description
  ].map((value) => normalizeKey(value)).join("|");

  return (
    source.includes("marketplace") ||
    source.includes("professionalservices") ||
    source.includes("servicesmarketplace") ||
    source.includes("service")
  );
};

const isCommunityTab = (tab: any): boolean => {
  const source = [
    tab?.id,
    tab?.key,
    tab?.label,
    tab?.title,
    tab?.description
  ].map((value) => normalizeKey(value)).join("|");

  return source.includes("community") || source.includes("feed");
};

const isMessagingTab = (tab: any): boolean => {
  const source = [
    tab?.id,
    tab?.key,
    tab?.label,
    tab?.title,
    tab?.description
  ].map((value) => normalizeKey(value)).join("|");

  return source.includes("messaging") || source.includes("message") || source.includes("chat");
};

const isAiAssistantTab = (tab: any): boolean => {
  const source = [
    tab?.id,
    tab?.key,
    tab?.label,
    tab?.title,
    tab?.description
  ].map((value) => normalizeKey(value)).join("|");

  return source.includes("aiassistant") || source.includes("scrolitha") || source.includes("assistant") || source.includes("ai");
};

const isPaymentsTab = (tab: any): boolean => {
  const source = [
    tab?.id,
    tab?.key,
    tab?.label,
    tab?.title,
    tab?.description
  ].map((value) => normalizeKey(value)).join("|");

  return source.includes("payment") || source.includes("wallet") || source.includes("payout");
};

const getGigImage = (gig: any): string => {
  // Phase 18.3: never String() object-shaped media (produces "[object Object]").
  return resolveGuestMarketplaceListingImage(gig) || "";
};

const getGigPrice = (gig: any): string => {
  const rawPrice = gig?.price;
  const amount =
    typeof rawPrice === "number"
      ? rawPrice
      : Number(rawPrice?.amount ?? rawPrice?.minAmount ?? rawPrice?.min_amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return "View pricing";
  return `From $${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const getGigUrl = (gig: any) => `/marketplace/listing/${encodeURIComponent(String(gig?.slug || gig?.id || ""))}`;

const extractGigsFromPayload = (payload: any): Gig[] => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.gigs)) return data.gigs;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

type GuestCommunityPreviewItem = {
  id: string;
  title: string;
  author: string;
  comments: number;
  reactions: number;
};

const extractCommunityPreviewItems = (payload: any): GuestCommunityPreviewItem[] => {
  const data = payload?.data ?? payload;
  const rows = ensureArray<any>(data?.items ?? data?.posts ?? data?.data ?? data);
  return rows
    .map((item, index) => {
      const reactionsMap = item?.interactions?.reactions;
      const reactions = reactionsMap && typeof reactionsMap === "object"
        ? Object.values(reactionsMap as Record<string, unknown>).reduce(
            (sum: number, value) => sum + Number(value || 0),
            0
          )
        : Number(item?.likesCount ?? item?.interactions?.likes ?? 0);

      return {
        id: String(item?.id || `community-preview-${index}`),
        title: String(item?.title || item?.content || "Community update").trim(),
        author: String(item?.authorName || item?.author?.displayName || item?.author?.name || "Scrolith member"),
        comments: Number(item?.interactions?.comments ?? item?.commentsCount ?? 0),
        reactions
      };
    })
    .filter((item) => item.title)
    .slice(0, 4);
};

type GuestMessagingPreviewItem = {
  id: string;
  title: string;
  activity: string;
  replies: number;
};

type GuestMarketplacePreviewItem = {
  id: string;
  title: string;
  seller: string;
  category: string;
  price?: number;
  /** Normalized image URL only — never object-coerced text. */
  image?: string | null;
  slug?: string;
};

/** Phase 17B: no synthetic demo listings — live APIs or honest empty states only. */

const extractMessagingPreviewItems = (threadsPayload: any, feedPayload: any): GuestMessagingPreviewItem[] => {
  const threadRows = ensureArray<any>(threadsPayload?.data ?? threadsPayload);
  const fromThreads = threadRows.map((item, index) => ({
    id: String(item?.id || `thread-preview-${index}`),
    title: String(item?.title || item?.content || "Live discussion").trim(),
    activity: String(item?.category || "Community thread"),
    replies: Number(item?.commentsCount ?? item?.replyCount ?? item?.repliesCount ?? 0)
  }));

  if (fromThreads.length) {
    return fromThreads.slice(0, 4);
  }

  const fallbackRows = extractCommunityPreviewItems(feedPayload);
  return fallbackRows.map((item, index) => ({
    id: item.id || `message-feed-${index}`,
    title: item.title,
    activity: `by ${item.author}`,
    replies: item.comments
  })).slice(0, 4);
};

const extractMarketplacePreviewItems = (payload: any): GuestMarketplacePreviewItem[] => {
  const data = payload?.data ?? payload ?? {};
  const rows = ensureArray<any>(data?.items ?? data?.listings ?? data?.data ?? data);
  return rows
    .map((item, index) => {
      // Prefer first non-video media object when media is an array of objects.
      const preferredMedia = Array.isArray(item?.media)
        ? item.media.find((entry: any) => String(entry?.type || entry?.mimeType || entry?.mime_type || 'image').toLowerCase().indexOf('video') === -1) ||
          item.media[0]
        : item?.media;
      const image =
        resolveGuestMarketplaceListingImage(item) ||
        resolveMediaUrl(preferredMedia) ||
        null;

      return {
        id: String(item?.id || item?.slug || `marketplace-preview-${index}`),
        title: String(item?.title || item?.name || 'Marketplace listing').trim(),
        seller: String(item?.sellerName || item?.seller_name || item?.authorName || item?.author?.displayName || 'Scrolith seller'),
        // Phase 18.5: category may be object-shaped ({ name, slug, ... }); never String(object).
        category: resolveGuestMarketplaceCategoryLabel(item),
        price: Number(item?.price?.amount ?? item?.price ?? item?.startingPrice ?? item?.budget ?? 0) || undefined,
        image: image || undefined,
        slug: String(item?.slug || item?.id || '')
      };
    })
    .filter((item) => item.title)
    .slice(0, 3);
};

type GuestAiPreview = {
  provider: string;
  model: string;
  status: string;
  backup: boolean;
  routing: string[];
};

const extractAiPreview = (payload: any): GuestAiPreview => {
  const data = payload?.data ?? payload ?? {};
  const scrolitha = data?.scrolitha || data?.providers?.scrolitha || {};
  const provider = String(scrolitha?.provider || scrolitha?.runtime || "scrolitha").toUpperCase();
  const model = String(scrolitha?.model || data?.providers?.google?.model || "Scrolitha");
  const status = String(scrolitha?.status || "operational");
  const backup = Boolean(scrolitha?.backupEngineAvailable);
  const routing = Object.entries(data?.routing || {})
    .map(([key, value]) => `${String(key).replace(/_/g, " ")}: ${String(value)}`)
    .slice(0, 4);
  return { provider, model, status, backup, routing };
};

type GuestPaymentsPreview = {
  currencies: Array<{ code: string; symbol: string; rateUpdatedAt?: string }>;
  methods: Array<{ id: string; name: string; mode: string }>;
};

const extractPaymentsPreview = (currenciesPayload: any, methodsPayload: any): GuestPaymentsPreview => {
  const currenciesRaw = ensureArray<any>(currenciesPayload?.data ?? currenciesPayload);
  const methodsRaw = ensureArray<any>(methodsPayload?.data ?? methodsPayload);

  return {
    currencies: currenciesRaw
      .filter((item) => item?.isActive !== false)
      .slice(0, 4)
      .map((item) => ({
        code: String(item?.code || ""),
        symbol: String(item?.symbol || ""),
        rateUpdatedAt: item?.rateUpdatedAt ? String(item.rateUpdatedAt) : undefined
      })),
    methods: methodsRaw
      .slice(0, 4)
      .map((item) => ({
        id: String(item?.id || ""),
        name: String(item?.name || "Gateway"),
        mode: String(item?.mode || "live")
      }))
  };
};

const fetchGuestJson = async (path: string): Promise<any> => {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "GET",
    credentials: "omit",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`guest_preview_${response.status}`);
  return response.json();
};

const scheduleGuestIdleTask = (callback: () => void, timeout = 1200) => {
  if (typeof window === "undefined") return () => {};
  const idleCallback = (window as any).requestIdleCallback;
  if (typeof idleCallback === "function") {
    const id = idleCallback(callback, { timeout });
    return () => {
      const cancelIdleCallback = (window as any).cancelIdleCallback;
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(id);
    };
  }
  const timer = window.setTimeout(callback, timeout);
  return () => window.clearTimeout(timer);
};

const MarketplacePreviewImage: React.FC<{
  image?: string | null;
  title: string;
}> = ({ image, title }) => {
  const [failed, setFailed] = React.useState(false);
  // Guard against residual object-coercion artifacts and non-string props.
  const safeImage = resolveMediaUrl(image);
  const resolvedImage = !failed && safeImage ? safeImage : "";
  const altText = String(title || "Marketplace listing").replace(/\[object Object\]/gi, "").trim() || "Marketplace listing";

  if (!resolvedImage) {
    return (
      <div
        className="flex h-full min-h-[6rem] w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 px-3 text-center"
        role="img"
        aria-label="Image unavailable"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm">
          <Briefcase className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Marketplace listing
        </span>
        <span className="text-[10px] font-medium text-slate-400">Image unavailable</span>
      </div>
    );
  }

  return (
    <OptimizedImage
      src={resolvedImage}
      alt={altText}
      width={360}
      height={216}
      fit="cover"
      quality={72}
      loading="lazy"
      decoding="async"
      sizes="(min-width: 1280px) 18vw, (min-width: 768px) 28vw, 92vw"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
    />
  );
};

const Wrapper: React.FC<{
  url?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ url, className, style, children }) => {
  if (!url) return <div className={className} style={style}>{children}</div>;
  if (isExternalUrl(url)) {
    return (
      <a href={url} className={className} style={style} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link to={url} className={className} style={style}>
      {children}
    </Link>
  );
};

const ActionLink: React.FC<{
  label?: string;
  url?: string;
  className?: string;
}> = ({ label, url, className }) => {
  if (!label || !url) return null;
  if (isExternalUrl(url)) {
    return (
      <a href={url} className={className} target="_blank" rel="noreferrer">
        {label}
      </a>
    );
  }
  return (
    <Link to={url} className={className}>
      {label}
    </Link>
  );
};

const getEmbedUrl = (videoUrl?: string): string | null => {
  if (!videoUrl) return null;
  try {
    const url = new URL(videoUrl);
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.hostname.includes("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
};

export const GuestHeroAuthSection: React.FC<{ content: GuestHeroAuthContent; style?: any }> = ({
  content,
  style
}) => {
  const { isAuthenticated } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const popupSettings = content?.authPopup || {};
  const popupEnabled = popupSettings.enabled !== false;
  const popupDelaySecondsRaw = Number(popupSettings.delaySeconds);
  const popupDelaySeconds = Number.isFinite(popupDelaySecondsRaw)
    ? Math.max(15, Math.min(900, Math.trunc(popupDelaySecondsRaw)))
    : 120;
  const popupSessionKey = React.useMemo(
    () => `scrolith:guest-home-auth-popup:${location.pathname}`,
    [location.pathname]
  );
  const [isAuthModalOpen, setIsAuthModalOpen] = React.useState(false);
  const [authConfig, setAuthConfig] = React.useState<AuthPagesConfig | null>(null);
  const [modalTab, setModalTab] = React.useState<"login" | "signup">(
    normalizeGuestAuthTab(popupSettings.defaultTab || content?.defaultTab)
  );

  const backgroundImageUrl = responsiveImageUrl(String(content?.heroBackgroundUrl || '').trim(), 960, 720, 'cover');
  const sideBanners = ensureArray<any>((content as any)?.sideBanners);
  const trustPoints = ensureArray<string>((content as any)?.trustPoints);
  const sideImageUrl = responsiveImageUrl(String((content as any)?.sideImageUrl || '').trim(), 640, 360, 'cover');
  const sideImageAlt = String((content as any)?.sideImageAlt || 'Scrolith platform preview').trim();
  const brandLogos = ensureArray<any>((content as any)?.brandLogos);
  const showHeroBrandFallback = !sideImageUrl && brandLogos.length === 0;
  const compactMode = (content as any)?.compactMode !== false;
  const displayedTrustPoints = (trustPoints.length ? trustPoints : ['Realtime marketplace', 'Secure payments', 'Verified talent'])
    .slice(0, compactMode ? 3 : 6);
  const heroSignalCards = displayedTrustPoints.slice(0, 3).map((point, index) => ({
    title: point,
    subtitle: ["Live signal", "Verified flow", "Enterprise-ready"][index] || "Live signal",
    accent: ["from-sky-500 to-cyan-500", "from-violet-500 to-fuchsia-500", "from-emerald-500 to-lime-500"][index] || "from-slate-500 to-slate-700"
  }));
  const displayedBanners = (sideBanners.length
    ? sideBanners
    : [
        { title: 'Smart Hiring Pipeline', subtitle: 'Post, screen, and hire with automated workflows.' },
        { title: 'Creator Growth Engine', subtitle: 'Publish once and distribute across network, stories, and scroll.' }
      ]).slice(0, compactMode ? 2 : 3);

  React.useEffect(() => {
    let mounted = true;
    const cancel = scheduleGuestIdleTask(() => {
      void CMSService.getAuthPagesConfig()
        .then((data) => {
          if (mounted) setAuthConfig(data || null);
        })
        .catch(() => {
          if (mounted) setAuthConfig(null);
        });
    }, 900);
    return () => {
      mounted = false;
      cancel();
    };
  }, []);

  React.useEffect(() => {
    setModalTab(normalizeGuestAuthTab(popupSettings.defaultTab || content?.defaultTab));
  }, [content?.defaultTab, popupSettings.defaultTab]);

  React.useEffect(() => {
    if (isAuthenticated) {
      setIsAuthModalOpen(false);
      return;
    }
    if (!popupEnabled) return;
    try {
      if (sessionStorage.getItem(popupSessionKey) === "dismissed") return;
    } catch {}
    const timer = window.setTimeout(() => {
      setModalTab(normalizeGuestAuthTab(popupSettings.defaultTab || content?.defaultTab));
      setIsAuthModalOpen(true);
    }, popupDelaySeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [
    content?.defaultTab,
    isAuthenticated,
    popupDelaySeconds,
    popupEnabled,
    popupSessionKey,
    popupSettings.defaultTab
  ]);

  const openAuthModal = React.useCallback(
    (nextTab?: "login" | "signup") => {
      setModalTab(nextTab || normalizeGuestAuthTab(popupSettings.defaultTab || content?.defaultTab));
      setIsAuthModalOpen(true);
    },
    [content?.defaultTab, popupSettings.defaultTab]
  );

  const closeAuthModal = React.useCallback(() => {
    setIsAuthModalOpen(false);
    try {
      sessionStorage.setItem(popupSessionKey, "dismissed");
    } catch {}
  }, [popupSessionKey]);

  const handleHeroAction = React.useCallback(
    (url: string | undefined, fallbackTab: "login" | "signup") => {
      const target = String(url || "").trim();
      if (isInlineGuestAuthUrl(target)) {
        openAuthModal(target.includes("/auth/login") ? "login" : fallbackTab);
        return;
      }
      if (!target) {
        openAuthModal(fallbackTab);
        return;
      }
      if (isExternalUrl(target)) {
        window.open(target, "_blank", "noopener,noreferrer");
        return;
      }
      navigate(target);
    },
    [navigate, openAuthModal]
  );
  const socialConfig = authConfig?.social_auth ?? (authConfig as any)?.socialAuth;

  return (
    <>
      <section
        className="overflow-x-clip py-6 sm:py-12"
        style={{ background: style?.background || "linear-gradient(180deg, #f8fafc 0%, #ffffff 55%, #f8fafc 100%)" }}
      >
      <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-4 px-4 sm:gap-5 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:gap-8 lg:px-8">
        <div
          className="relative min-w-0 overflow-hidden rounded-[30px] border border-slate-200/90 bg-gradient-to-br from-white via-white to-indigo-50/45 p-5 shadow-[0_28px_70px_-32px_rgba(15,23,42,0.26)] sm:rounded-[34px] sm:p-7 lg:p-8"
          style={!backgroundImageUrl ? undefined : { backgroundColor: 'rgba(255,255,255,0.92)' }}
        >
          <div className="pointer-events-none absolute -left-12 -top-12 h-40 w-40 rounded-full bg-indigo-200/35 blur-3xl motion-safe:animate-pulse" />
          <div className="pointer-events-none absolute -bottom-16 right-0 h-48 w-48 rounded-full bg-cyan-200/35 blur-3xl motion-safe:animate-pulse" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-indigo-300 to-transparent opacity-70" />
          {backgroundImageUrl ? (
            <OptimizedImage
              src={String(content?.heroBackgroundUrl || '').trim()}
              alt=""
              aria-hidden="true"
              width={960}
              height={720}
              fit="cover"
              quality={72}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              sizes="(min-width: 1024px) 52vw, 100vw"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          <div className={backgroundImageUrl ? 'relative z-10 min-w-0 rounded-[24px] border border-white/70 bg-white/92 p-4 backdrop-blur-sm sm:p-5' : 'min-w-0'}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-indigo-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700 shadow-[0_10px_24px_-18px_rgba(79,70,229,0.7)]">
                <img src={SCROLITH_LOGO} alt="Scrolith" width={16} height={16} className="h-4 w-4 rounded-full object-contain" loading="eager" decoding="async" />
                Scrolith Enterprise
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800 shadow-sm">
                Work · Market · AI · Community
              </span>
            </div>
            <h1 className="max-w-[16ch] text-balance text-[clamp(1.85rem,3.7vw,2.9rem)] font-extrabold leading-[0.98] tracking-[-0.045em] text-slate-950 sm:max-w-[18ch] lg:max-w-[16ch]">
              {content?.headline || 'Build your next opportunity on Scrolith'}
            </h1>
            {content?.subheadline ? (
              <p className="mt-4 max-w-2xl text-[15px] leading-7 text-slate-600 sm:text-base sm:leading-8">{content.subheadline}</p>
            ) : (
              <p className="mt-4 max-w-2xl text-[15px] leading-7 text-slate-600 sm:text-base sm:leading-8">
                One professional graph where talent, clients, companies, and communities grow together — powered by
                Scrolitha AI and enterprise-grade trust.
              </p>
            )}
            {content?.description ? (
              <p className="mt-3 max-w-2xl text-[14px] leading-7 text-slate-500 sm:text-sm sm:leading-7">{content.description}</p>
            ) : null}
            <p className="mt-3 max-w-2xl text-xs font-medium leading-6 text-slate-500 sm:text-[13px]">
              Join free in minutes. Start with a stronger feed, clearer opportunities, and an AI coach that understands
              work — not just chat.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => handleHeroAction(content?.primaryCtaUrl, "signup")}
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_-20px_rgba(15,23,42,0.7)] transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 sm:w-auto"
              >
                {content?.primaryCtaLabel || "Create account"}
              </button>
              <button
                type="button"
                onClick={() => handleHeroAction(content?.secondaryCtaUrl, "login")}
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-slate-300 bg-white/90 px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 sm:w-auto"
              >
                {content?.secondaryCtaLabel || "Log in"}
              </button>
            </div>
            <div className="mt-5 grid gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">
              {displayedTrustPoints.map((point, index) => (
                <div
                  key={`trust-point-${index}`}
                  className="min-w-0 rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 px-3 py-3 text-[11px] font-semibold text-slate-700 shadow-sm"
                >
                  <span className="block truncate">{point}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-[24px] border border-slate-200/80 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 text-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.6)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-indigo-200/85">Live work graph</p>
                  <p className="mt-1 text-sm font-semibold text-white/95 sm:text-base">Work, talent, and commerce moving together in real time.</p>
                </div>
                <span className="shrink-0 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/90">
                  Realtime
                </span>
              </div>
              <div className="mt-4 grid gap-2 min-[420px]:grid-cols-3">
                {heroSignalCards.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="min-w-0 rounded-2xl border border-white/10 bg-white/8 p-3 shadow-[0_12px_28px_-20px_rgba(15,23,42,0.75)] backdrop-blur-sm">
                    <div className={`mb-2 h-1.5 w-10 rounded-full bg-gradient-to-r ${item.accent}`} />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">{item.subtitle}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-white">{item.title}</p>
                  </div>
                ))}
              </div>
            </div>
            {content?.enableSocialLogin !== false ? (
              <div className="mt-5 rounded-[24px] border border-slate-200 bg-white/85 p-3.5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.26)] backdrop-blur-sm">
                <AuthSocialButtons mode="signup" role={UserRole.FREELANCER} config={socialConfig || undefined} redirectTo="/" />
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {displayedBanners.map((banner, index) => (
                <div key={banner.id || `side-banner-${index}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white/90 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                  {banner.image ? (
                    <div className="mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white/60">
                      <OptimizedImage
                        src={banner.image}
                        alt={banner.title || `Scrolith highlight ${index + 1}`}
                        width={320}
                        height={160}
                        fit="cover"
                        quality={72}
                        loading="lazy"
                        decoding="async"
                        sizes="(min-width: 1024px) 15vw, (min-width: 640px) 30vw, 88vw"
                        className="h-20 w-full object-cover"
                      />
                    </div>
                  ) : null}
                  <p className="break-words text-sm font-semibold text-slate-900 sm:text-[15px]">{banner.title || `Scrolith Advantage ${index + 1}`}</p>
                  {banner.subtitle ? <p className="mt-1 break-words text-xs leading-6 text-slate-600 sm:text-sm">{banner.subtitle}</p> : null}
                </div>
              ))}
            </div>
            {sideImageUrl ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-2 backdrop-blur-sm">
                <OptimizedImage
                  src={String((content as any)?.sideImageUrl || '').trim()}
                  alt={sideImageAlt}
                  width={640}
                  height={360}
                  fit="cover"
                  quality={72}
                  loading={backgroundImageUrl ? 'lazy' : 'eager'}
                  decoding="async"
                  sizes="(min-width: 1024px) 34vw, 100vw"
                  className="h-44 w-full rounded-xl object-cover sm:h-48 lg:h-52"
                />
              </div>
            ) : null}
            {brandLogos.length ? (
              <div className="mt-4 rounded-2xl border border-slate-200/70 bg-white/80 p-3 backdrop-blur-sm">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Trusted by teams worldwide</p>
                <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 sm:grid-cols-4">
                  {brandLogos.slice(0, 8).map((logo, index) => (
                    <Wrapper
                      key={logo.id || `brand-logo-${index}`}
                      url={logo.url}
                      className="flex min-w-0 h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-2"
                    >
                      {logo.image ? (
                        <OptimizedImage
                          src={logo.image}
                          alt={logo.label || `Brand ${index + 1}`}
                          width={96}
                          height={48}
                          fit="contain"
                          quality={72}
                          loading="lazy"
                          decoding="async"
                          disableSrcSet
                          className="max-h-6 w-auto object-contain"
                        />
                      ) : (
                        <span className="truncate text-[11px] font-semibold text-slate-600">{logo.label || `Brand ${index + 1}`}</span>
                      )}
                    </Wrapper>
                  ))}
                </div>
              </div>
            ) : null}
            {showHeroBrandFallback ? (
              <div className="mt-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-4">
                <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                  <img
                    src={SCROLITH_LOGO}
                    alt="Scrolith"
                    width={16}
                    height={16}
                    loading="lazy"
                    decoding="async"
                    className="h-4 w-4 rounded-full object-contain"
                  />
                  Scrolith Enterprise Label
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {["Trusted by global teams", "Realtime collaboration", "Enterprise-grade delivery"].map((label) => (
                    <div key={label} className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-white px-2.5 py-2">
                      <img
                        src={SCROLITH_LOGO}
                        alt=""
                        aria-hidden="true"
                        width={14}
                        height={14}
                        loading="lazy"
                        decoding="async"
                        className="h-3.5 w-3.5 rounded-full object-contain"
                      />
                      <span className="text-[11px] font-semibold text-slate-700">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <figure className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.38)]">
              <picture>
                <source srcSet={GUEST_NETWORKING_IMAGE} type="image/webp" />
                <img
                  src={GUEST_NETWORKING_IMAGE_FALLBACK}
                  alt="Diverse professionals connecting on Scrolith - social and professional networking platform"
                  width={1280}
                  height={720}
                  loading="lazy"
                  decoding="async"
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="block h-auto w-full object-cover"
                />
              </picture>
            </figure>
          </div>
          {backgroundImageUrl ? <div className="absolute inset-0 bg-gradient-to-t from-white/55 via-white/20 to-transparent" /> : null}
        </div>

        <div className="min-w-0 space-y-4 sm:space-y-5 lg:sticky lg:top-24 lg:self-start">
          <GuestAuthCard content={content} />
          <GuestScrolithaPanel content={content} onRequestAuth={openAuthModal} />
        </div>
      </div>
      </section>
      <GuestAuthModal
        open={isAuthModalOpen}
        onClose={closeAuthModal}
        content={content}
        defaultTab={modalTab}
      />
    </>
  );
};

export const GuestWhatIsScrolithSection: React.FC<{ content: GuestWhatIsScrolithContent; style?: any }> = ({
  content,
  style
}) => {
  const cards = ensureArray(content?.cards);
  const compactMode = content?.compactMode !== false;
  const maxCards = Number.isFinite(Number(content?.maxCards))
    ? Math.max(3, Math.min(8, Math.trunc(Number(content?.maxCards))))
    : 4;
  const visibleCards = compactMode ? cards.slice(0, maxCards) : cards;
  if (!content?.title && !content?.subtitle && visibleCards.length === 0) return null;
  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background || "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)" }}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-8 text-center sm:mb-10">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Why teams choose Scrolith</p>
            {content?.title ? <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{content.title}</h2> : null}
            {content?.subtitle ? <p className="mt-2 text-sm text-slate-600 sm:text-base">{content.subtitle}</p> : null}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visibleCards.map((card, index) => (
            <div key={card.id || `guest-card-${index}`} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <div className="mb-3 h-1.5 w-14 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
              {card.icon || card.image ? (
                <div className="mb-3 flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
                  <OptimizedImage
                    src={card.icon || card.image}
                    alt={card.title || `Feature ${index + 1}`}
                    width={24}
                    height={24}
                    fit="contain"
                    quality={72}
                    loading="lazy"
                    decoding="async"
                    disableSrcSet
                    className="h-6 w-6 object-contain"
                  />
                </div>
              ) : null}
              {card.title ? <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3> : null}
              {card.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export const GuestPathsSection: React.FC<{ content: GuestPathsContent; style?: any }> = ({ content, style }) => {
  const freelancerBullets = ensureArray<string>(content?.freelancerBullets);
  const employerBullets = ensureArray<string>(content?.employerBullets);
  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background || "#ffffff" }}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-8 text-center">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Onboarding paths</p>
            {content?.title ? <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{content.title}</h2> : null}
            {content?.subtitle ? <p className="mt-2 text-sm text-slate-600 sm:text-base">{content.subtitle}</p> : null}
          </div>
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">
            <p className="mb-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Talent track</p>
            <h3 className="text-lg font-semibold text-emerald-900">{content?.freelancerTitle || 'Freelancer'}</h3>
            <ul className="mt-3 space-y-2 text-sm text-emerald-900">
              {freelancerBullets.map((bullet, index) => (
                <li key={`freelancer-bullet-${index}`} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            <ActionLink
              label={content?.freelancerCtaLabel || 'Start freelancing'}
              url={content?.freelancerCtaUrl || '/auth/signup'}
              className="mt-5 inline-flex rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            />
          </div>
          <div className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm">
            <p className="mb-3 inline-flex rounded-full bg-blue-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">Business track</p>
            <h3 className="text-lg font-semibold text-blue-900">{content?.employerTitle || 'Employer'}</h3>
            <ul className="mt-3 space-y-2 text-sm text-blue-900">
              {employerBullets.map((bullet, index) => (
                <li key={`employer-bullet-${index}`} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-600" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            <ActionLink
              label={content?.employerCtaLabel || 'Start hiring'}
              url={content?.employerCtaUrl || '/auth/signup'}
              className="mt-5 inline-flex rounded-full bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export const GuestFeatureShowcaseSection: React.FC<{ content: GuestFeatureShowcaseContent; style?: any }> = ({
  content,
  style
}) => {
  const tabs = ensureArray(content?.tabs);
  const compactMode = content?.compactMode !== false;
  const maxTabs = Number.isFinite(Number(content?.maxTabs))
    ? Math.max(3, Math.min(8, Math.trunc(Number(content?.maxTabs))))
    : 5;
  const visibleTabs = compactMode ? tabs.slice(0, maxTabs) : tabs;
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [marketplacePreview, setMarketplacePreview] = React.useState<{
    loading: boolean;
    loaded: boolean;
    gigs: Gig[];
    retryAfterSeconds: number | null;
  }>({ loading: false, loaded: false, gigs: [], retryAfterSeconds: null });
  const [communityPreview, setCommunityPreview] = React.useState<{
    loading: boolean;
    loaded: boolean;
    items: GuestCommunityPreviewItem[];
  }>({ loading: false, loaded: false, items: [] });
  const [messagingPreview, setMessagingPreview] = React.useState<{
    loading: boolean;
    loaded: boolean;
    items: GuestMessagingPreviewItem[];
  }>({ loading: false, loaded: false, items: [] });
  const [aiPreview, setAiPreview] = React.useState<{
    loading: boolean;
    loaded: boolean;
    data: GuestAiPreview | null;
  }>({ loading: false, loaded: false, data: null });
  const [paymentsPreview, setPaymentsPreview] = React.useState<{
    loading: boolean;
    loaded: boolean;
    data: GuestPaymentsPreview | null;
  }>({ loading: false, loaded: false, data: null });
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const marketplacePreviewRequestRef = React.useRef(false);
  const communityPreviewRequestRef = React.useRef(false);
  const messagingPreviewRequestRef = React.useRef(false);
  const aiPreviewRequestRef = React.useRef(false);
  const paymentsPreviewRequestRef = React.useRef(false);
  const [shouldLoadMarketplacePreview, setShouldLoadMarketplacePreview] = React.useState(false);
  const activeTab = visibleTabs[activeIndex] || visibleTabs[0];
  const hasMarketplaceTab = visibleTabs.some(isMarketplaceTab);
  const hasCommunityTab = visibleTabs.some(isCommunityTab);
  const hasMessagingTab = visibleTabs.some(isMessagingTab);
  const hasAiAssistantTab = visibleTabs.some(isAiAssistantTab);
  const hasPaymentsTab = visibleTabs.some(isPaymentsTab);
  const hasAnyLivePreviewTab =
    hasMarketplaceTab || hasCommunityTab || hasMessagingTab || hasAiAssistantTab || hasPaymentsTab;
  const showMarketplacePreview = isMarketplaceTab(activeTab);
  const showCommunityPreview = isCommunityTab(activeTab);
  const showMessagingPreview = isMessagingTab(activeTab);
  const showAiPreview = isAiAssistantTab(activeTab);
  const showPaymentsPreview = isPaymentsTab(activeTab);

  React.useEffect(() => {
    if (!hasAnyLivePreviewTab) return undefined;
    if (shouldLoadMarketplacePreview) return undefined;

    const markReady = () => setShouldLoadMarketplacePreview(true);

    if (typeof window === "undefined") return undefined;
    if (!("IntersectionObserver" in window)) {
      const timer = window.setTimeout(markReady, 1800);
      return () => window.clearTimeout(timer);
    }

    const target = sectionRef.current;
    if (!target) {
      const timer = window.setTimeout(markReady, 1200);
      return () => window.clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
          markReady();
          observer.disconnect();
        }
      },
      { rootMargin: "640px 0px" }
    );
    observer.observe(target);

    const failSafe = window.setTimeout(markReady, 4200);
    return () => {
      window.clearTimeout(failSafe);
      observer.disconnect();
    };
  }, [hasAnyLivePreviewTab, shouldLoadMarketplacePreview]);

  React.useEffect(() => {
    if (!hasMarketplaceTab || !showMarketplacePreview || !shouldLoadMarketplacePreview || marketplacePreview.loaded || marketplacePreviewRequestRef.current) return undefined;
    let cancelled = false;
    marketplacePreviewRequestRef.current = true;

    const loadMarketplacePreview = async () => {
      setMarketplacePreview((prev) => ({ ...prev, loading: true }));
      try {
        const withTimeout = <T,>(request: Promise<T>, timeoutMs = 7000): Promise<T> =>
          new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error("marketplace_preview_timeout")), timeoutMs);
            request
              .then((value) => {
                window.clearTimeout(timer);
                resolve(value);
              })
              .catch((error) => {
                window.clearTimeout(timer);
                reject(error);
              });
          });

        let previewItems = extractMarketplacePreviewItems(
          await withTimeout(listMarketplaceListings({ page: 1, pageSize: 3, status: 'active', sort: 'recommended' }, { skipRetry: true }), 7000)
        );

        if (!previewItems.length) {
          try {
            previewItems = extractMarketplacePreviewItems(
              await withTimeout(listMarketplaceListings({ page: 1, pageSize: 3, status: 'active', sort: 'popular' }, { skipRetry: true }), 5000)
            );
          } catch {
            previewItems = [];
          }
        }

        if (!previewItems.length) {
          try {
            const homepage = await withTimeout(CMSService.getGuestHomepage(), 7000);
            previewItems = extractMarketplacePreviewItems(homepage);
          } catch {
            previewItems = [];
          }
        }

        if (!cancelled) {
          setMarketplacePreview({ loading: false, loaded: true, gigs: previewItems as any, retryAfterSeconds: null });
        }
      } catch (error: any) {
        if (!cancelled) {
          const retryAfter = Number(error?.response?.headers?.['retry-after'] || error?.response?.headers?.['Retry-After']);
          setMarketplacePreview({ loading: false, loaded: true, gigs: [], retryAfterSeconds: error?.response?.status === 429 && Number.isFinite(retryAfter) ? Math.max(1, Math.ceil(retryAfter)) : null });
        }
      } finally {
        if (!cancelled) {
          marketplacePreviewRequestRef.current = false;
        }
      }
    };

    void loadMarketplacePreview();
    return () => {
      cancelled = true;
    };
  }, [hasMarketplaceTab, marketplacePreview.loaded, shouldLoadMarketplacePreview, showMarketplacePreview]);

  React.useEffect(() => {
    if (!hasCommunityTab || !showCommunityPreview || !shouldLoadMarketplacePreview || communityPreview.loaded || communityPreviewRequestRef.current) return undefined;
    let cancelled = false;
    communityPreviewRequestRef.current = true;

    const loadCommunityPreview = async () => {
      setCommunityPreview((prev) => ({ ...prev, loading: true }));
      try {
        const payload = await fetchGuestJson("/community/feed?limit=4&scope=public");
        const homepage = await CMSService.getGuestHomepage().catch(() => null);
        if (!cancelled) {
          const liveItems = extractCommunityPreviewItems(payload);
          const homepageItems = extractCommunityPreviewItems(homepage);
          const items = liveItems.length ? liveItems : homepageItems;
          setCommunityPreview({ loading: false, loaded: true, items });
        }
      } catch {
        if (!cancelled) {
          setCommunityPreview({ loading: false, loaded: true, items: [] });
        }
      } finally {
        if (!cancelled) communityPreviewRequestRef.current = false;
      }
    };

    void loadCommunityPreview();
    return () => {
      cancelled = true;
    };
  }, [communityPreview.loaded, hasCommunityTab, shouldLoadMarketplacePreview, showCommunityPreview]);

  React.useEffect(() => {
    if (!hasMessagingTab || !showMessagingPreview || !shouldLoadMarketplacePreview || messagingPreview.loaded || messagingPreviewRequestRef.current) return undefined;
    let cancelled = false;
    messagingPreviewRequestRef.current = true;

    const loadMessagingPreview = async () => {
      setMessagingPreview((prev) => ({ ...prev, loading: true }));
      try {
        const [threadsPayload, feedPayload] = await Promise.allSettled([
          fetchGuestJson("/community/threads?limit=4"),
          fetchGuestJson("/community/feed?limit=4&scope=public")
        ]);

        const threads = threadsPayload.status === "fulfilled" ? threadsPayload.value : null;
        const feed = feedPayload.status === "fulfilled" ? feedPayload.value : null;
        const homepage = await CMSService.getGuestHomepage().catch(() => null);
        const primaryItems = extractMessagingPreviewItems(threads, feed);
        const homepageItems = extractMessagingPreviewItems(homepage, homepage);
        const items = primaryItems.length ? primaryItems : homepageItems;

        if (!cancelled) {
          setMessagingPreview({ loading: false, loaded: true, items });
        }
      } catch {
        if (!cancelled) {
          setMessagingPreview({ loading: false, loaded: true, items: [] });
        }
      } finally {
        if (!cancelled) messagingPreviewRequestRef.current = false;
      }
    };

    void loadMessagingPreview();
    return () => {
      cancelled = true;
    };
  }, [hasMessagingTab, messagingPreview.loaded, shouldLoadMarketplacePreview, showMessagingPreview]);

  React.useEffect(() => {
    if (!hasAiAssistantTab || !showAiPreview || !shouldLoadMarketplacePreview || aiPreview.loaded || aiPreviewRequestRef.current) return undefined;
    let cancelled = false;
    aiPreviewRequestRef.current = true;

    const loadAiPreview = async () => {
      setAiPreview((prev) => ({ ...prev, loading: true }));
      try {
        const payload = await fetchGuestJson("/ai/config");
        if (!cancelled) {
          setAiPreview({ loading: false, loaded: true, data: extractAiPreview(payload) });
        }
      } catch {
        if (!cancelled) {
          setAiPreview({ loading: false, loaded: true, data: null });
        }
      } finally {
        if (!cancelled) aiPreviewRequestRef.current = false;
      }
    };

    void loadAiPreview();
    return () => {
      cancelled = true;
    };
  }, [aiPreview.loaded, hasAiAssistantTab, shouldLoadMarketplacePreview, showAiPreview]);

  React.useEffect(() => {
    if (!hasPaymentsTab || !showPaymentsPreview || !shouldLoadMarketplacePreview || paymentsPreview.loaded || paymentsPreviewRequestRef.current) return undefined;
    let cancelled = false;
    paymentsPreviewRequestRef.current = true;

    const loadPaymentsPreview = async () => {
      setPaymentsPreview((prev) => ({ ...prev, loading: true }));
      try {
        const [currenciesPayload, methodsPayload] = await Promise.all([
          loadPublicCurrencyCatalog().then((catalog) => ({ data: catalog.list, meta: { baseCurrency: catalog.baseCurrency } })),
          fetchGuestJson("/payments/methods/active")
        ]);
        if (!cancelled) {
          setPaymentsPreview({
            loading: false,
            loaded: true,
            data: extractPaymentsPreview(currenciesPayload, methodsPayload)
          });
        }
      } catch {
        if (!cancelled) {
          setPaymentsPreview({ loading: false, loaded: true, data: null });
        }
      } finally {
        if (!cancelled) paymentsPreviewRequestRef.current = false;
      }
    };

    void loadPaymentsPreview();
    return () => {
      cancelled = true;
    };
  }, [hasPaymentsTab, paymentsPreview.loaded, shouldLoadMarketplacePreview, showPaymentsPreview]);

  if (!content?.title && visibleTabs.length === 0) return null;
  return (
    <section
      ref={sectionRef}
      className="py-12 sm:py-16"
      style={{ background: style?.background || "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)" }}
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-6 text-center sm:mb-8">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Live product tour</p>
            {content?.title ? <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{content.title}</h2> : null}
            {content?.subtitle ? <p className="mt-2 text-sm text-slate-600 sm:text-base">{content.subtitle}</p> : null}
          </div>
        )}
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/60 sm:p-6">
          <div className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-2">
            {visibleTabs.map((tab, index) => (
              <button
                key={tab.id || `showcase-tab-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  index === activeIndex
                    ? 'bg-slate-900 text-white shadow-md shadow-slate-300'
                    : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
                aria-pressed={index === activeIndex}
              >
                {tab.label || tab.title || `Feature ${index + 1}`}
              </button>
            ))}
          </div>
          {activeTab ? (
            <div className="grid gap-4 lg:grid-cols-5 lg:items-stretch">
              <div className="lg:col-span-2">
                <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-5 sm:p-6">
                  <p className="mb-3 inline-flex rounded-full bg-slate-900/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Real-time preview
                  </p>
                <h3 className="text-xl font-semibold text-slate-900">{activeTab.title || activeTab.label}</h3>
                {activeTab.description ? <p className="mt-2 text-sm leading-7 text-slate-600">{activeTab.description}</p> : null}
                  <div className="mt-5 space-y-2 text-xs text-slate-500">
                    <p>Data updates from live platform endpoints.</p>
                    <p>Preview stays aligned with admin-managed homepage settings.</p>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">Live endpoints</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">CMS controlled</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">Enterprise ready</span>
                  </div>
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 lg:col-span-3">
                {showMarketplacePreview ? (
                  <div className="relative min-h-[13rem] bg-gradient-to-br from-slate-50 via-white to-blue-50 p-3 sm:min-h-[16rem] sm:p-4">
                    <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-blue-200/40 blur-2xl motion-safe:animate-pulse" />
                    {!shouldLoadMarketplacePreview || marketplacePreview.loading ? (
                      <div className="grid h-full gap-3 sm:grid-cols-3">
                        {[0, 1, 2].map((item) => (
                          <div key={`marketplace-preview-skeleton-${item}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            <div className="h-24 animate-pulse bg-slate-200" />
                            <div className="space-y-2 p-3">
                              <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
                              <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : marketplacePreview.gigs.length ? (
                      <div className="grid gap-3 sm:grid-cols-3">
                        {marketplacePreview.gigs.map((gig, index) => {
                          const image = getGigImage(gig);
                          const url = getGigUrl(gig);
                          return (
                            <Link
                              key={gig.id || `marketplace-preview-gig-${index}`}
                              to={url}
                              className="group min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-100"
                            >
                              <div className="relative h-24 overflow-hidden bg-slate-100 sm:h-28">
                                <MarketplacePreviewImage image={image} title={gig.title || "Marketplace service"} />
                                <div className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm">
                                  {resolveGuestMarketplaceCategoryLabel(gig)}
                                </div>
                              </div>
                              <div className="p-3">
                                <p className="line-clamp-2 text-xs font-semibold leading-5 text-slate-900">
                                  {gig.title || "Professional service"}
                                </p>
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <span className="truncate text-[11px] text-slate-500">
                                    {(gig as any).freelancerName || "Scrolith Pro"}
                                  </span>
                                  <span className="whitespace-nowrap text-[11px] font-bold text-blue-700">
                                    {getGigPrice(gig)}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid h-full min-h-[12rem] place-items-center rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 text-center">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{marketplacePreview.retryAfterSeconds ? 'Marketplace preview is temporarily busy.' : 'No live marketplace listings available right now.'}</p>
                          {marketplacePreview.retryAfterSeconds ? (
                            <p className="mt-1 text-xs leading-5 text-slate-500">Try again in about {marketplacePreview.retryAfterSeconds} seconds. You can continue browsing Scrolith.</p>
                          ) : null}
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            We only show real production listings — never placeholders.
                          </p>
                          <Link
                            to="/auth/signup"
                            className="mt-3 inline-flex min-h-[40px] items-center text-xs font-semibold text-blue-700 underline-offset-2 hover:underline"
                          >
                            Create free account
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                ) : showCommunityPreview ? (
                  <div className="relative min-h-[13rem] bg-gradient-to-br from-slate-50 via-white to-indigo-50 p-3 sm:min-h-[16rem] sm:p-4">
                    <div className="pointer-events-none absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-indigo-200/40 blur-2xl motion-safe:animate-pulse" />
                    {(!shouldLoadMarketplacePreview || communityPreview.loading) ? (
                      <div className="space-y-3">
                        {[0, 1, 2].map((item) => (
                          <div key={`community-preview-skeleton-${item}`} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="h-3 w-2/5 animate-pulse rounded bg-slate-200" />
                            <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-slate-100" />
                            <div className="mt-1 h-3 w-3/5 animate-pulse rounded bg-slate-100" />
                          </div>
                        ))}
                      </div>
                    ) : communityPreview.items.length ? (
                      <div className="space-y-3">
                        {communityPreview.items.map((item) => (
                          <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                            <p className="line-clamp-2 text-xs font-semibold text-slate-900">{item.title}</p>
                            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                              <span className="truncate">by {item.author}</span>
                              <span>{item.comments} comments · {item.reactions} reactions</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid h-full min-h-[12rem] place-items-center rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 text-center">
                        <p className="text-sm font-semibold text-slate-700">Community feed preview is updating in real time.</p>
                      </div>
                    )}
                  </div>
                ) : showMessagingPreview ? (
                  <div className="relative min-h-[13rem] bg-gradient-to-br from-slate-50 via-white to-violet-50 p-3 sm:min-h-[16rem] sm:p-4">
                    {(!shouldLoadMarketplacePreview || messagingPreview.loading) ? (
                      <div className="space-y-3">
                        {[0, 1, 2].map((item) => (
                          <div key={`messaging-preview-skeleton-${item}`} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="h-3 w-2/5 animate-pulse rounded bg-slate-200" />
                            <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-slate-100" />
                            <div className="mt-1 h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                          </div>
                        ))}
                      </div>
                    ) : messagingPreview.items.length ? (
                      <div className="space-y-3">
                        {messagingPreview.items.map((item) => (
                          <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-xs font-semibold text-slate-900">{item.title}</p>
                              <span className="whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                                {item.replies} replies
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">{item.activity}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid h-full min-h-[12rem] place-items-center rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 text-center">
                        <p className="text-sm font-semibold text-slate-700">Messaging preview is syncing with live discussions.</p>
                      </div>
                    )}
                  </div>
                ) : showAiPreview ? (
                  <div className="relative min-h-[13rem] bg-gradient-to-br from-slate-50 via-white to-cyan-50 p-3 sm:min-h-[16rem] sm:p-4">
                    {(!shouldLoadMarketplacePreview || aiPreview.loading) ? (
                      <div className="space-y-3">
                        <div className="h-10 animate-pulse rounded-xl bg-white" />
                        <div className="h-10 animate-pulse rounded-xl bg-white" />
                        <div className="h-10 animate-pulse rounded-xl bg-white" />
                      </div>
                    ) : aiPreview.data ? (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-xs font-semibold text-slate-900">Runtime: {aiPreview.data.provider}</p>
                          <p className="mt-1 text-[11px] text-slate-600">Model: {aiPreview.data.model}</p>
                          <p className="mt-1 text-[11px] text-emerald-700">Status: {aiPreview.data.status}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-xs font-semibold text-slate-900">
                            Backup engine: {aiPreview.data.backup ? "Available" : "Unavailable"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {aiPreview.data.routing.map((route) => (
                              <span key={route} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                                {route}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid h-full min-h-[12rem] place-items-center rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 text-center">
                        <p className="text-sm font-semibold text-slate-700">Scrolitha preview is temporarily unavailable.</p>
                      </div>
                    )}
                  </div>
                ) : showPaymentsPreview ? (
                  <div className="relative min-h-[13rem] bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-3 sm:min-h-[16rem] sm:p-4">
                    {(!shouldLoadMarketplacePreview || paymentsPreview.loading) ? (
                      <div className="space-y-3">
                        <div className="h-10 animate-pulse rounded-xl bg-white" />
                        <div className="h-10 animate-pulse rounded-xl bg-white" />
                        <div className="h-10 animate-pulse rounded-xl bg-white" />
                      </div>
                    ) : paymentsPreview.data ? (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-xs font-semibold text-slate-900">Active payment methods</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {paymentsPreview.data.methods.map((method) => (
                              <span key={method.id} className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                                {method.name} ({method.mode})
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-xs font-semibold text-slate-900">Active settlement currencies</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {paymentsPreview.data.currencies.map((currency) => (
                              <span key={currency.code} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">
                                {currency.symbol}{currency.code}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid h-full min-h-[12rem] place-items-center rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 text-center">
                        <p className="text-sm font-semibold text-slate-700">Payments preview is temporarily unavailable.</p>
                      </div>
                    )}
                  </div>
                ) : activeTab.image ? (
                  <OptimizedImage
                    src={activeTab.image}
                    alt={activeTab.title || ''}
                    width={720}
                    height={416}
                    fit="cover"
                    quality={72}
                    loading="lazy"
                    decoding="async"
                    sizes="(min-width: 1024px) 36vw, 100vw"
                    className="h-52 w-full object-cover sm:h-64"
                  />
                ) : (
                  <div className="flex h-52 w-full items-center justify-center text-sm font-medium text-slate-500 sm:h-64">
                    Feature preview
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export const GuestTrendingPreviewSection: React.FC<{ content: GuestTrendingPreviewContent; style?: any }> = ({
  content,
  style
}) => {
  const jobs = ensureArray(content?.jobs);
  const gigs = ensureArray(content?.gigs);
  const posts = ensureArray(content?.posts);
  const compactMode = content?.compactMode !== false;
  const maxItems = Number.isFinite(Number(content?.maxItems))
    ? Math.max(2, Math.min(6, Math.trunc(Number(content?.maxItems))))
    : 3;
  const showEmptyState = content?.showEmptyState === true;
  const hasData = jobs.length > 0 || gigs.length > 0 || posts.length > 0;
  if (!hasData && !showEmptyState) return null;

  const emptyJoin = (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-4 text-center">
      <p className="text-xs font-medium text-slate-600">No live items from the platform right now.</p>
      <Link
        to="/auth/signup"
        className="mt-2 inline-flex min-h-[40px] items-center text-xs font-semibold text-blue-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        Create free account to explore
      </Link>
    </div>
  );

  return (
    <section className="guest-live-ecosystem py-12 sm:py-16" style={{ background: style?.background || "#ffffff" }}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle || hasData) && (
          <div className="mb-6 text-center sm:mb-8">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">Live ecosystem</p>
            </div>
            {content?.title ? <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{content.title}</h2> : (
              <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Opportunities moving on Scrolith right now</h2>
            )}
            {content?.subtitle ? (
              <p className="mt-2 text-sm text-slate-600 sm:text-base">{content.subtitle}</p>
            ) : (
              <p className="mt-2 text-sm text-slate-600 sm:text-base">
                Real jobs, gigs, and discussions from production — not demos. Join to engage.
              </p>
            )}
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{content?.jobsTitle || 'Trending Jobs'}</h3>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                Hiring
              </span>
            </div>
            <div className="mt-3 space-y-3">
              {jobs.slice(0, compactMode ? maxItems : 6).map((job, index) => (
                <Link
                  key={`${job.id || 'job'}-${index}`}
                  to="/auth/login"
                  className="block rounded-xl border border-slate-100 p-3 transition hover:border-blue-100 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  <p className="text-sm font-medium text-slate-800">{job.title || 'Job opening'}</p>
                  <p className="mt-1 text-xs text-slate-500">{job.type || 'Role'}{job.budget ? ` | ${job.budget}` : ''}</p>
                </Link>
              ))}
              {jobs.length === 0 ? emptyJoin : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{content?.gigsTitle || 'Trending Gigs'}</h3>
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                Marketplace
              </span>
            </div>
            <div className="mt-3 space-y-3">
              {gigs.slice(0, compactMode ? maxItems : 6).map((gig, index) => (
                <Link
                  key={`${gig.id || 'gig'}-${index}`}
                  to="/auth/login"
                  className="block rounded-xl border border-slate-100 p-3 transition hover:border-violet-100 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                >
                  <p className="text-sm font-medium text-slate-800">{gig.title || 'Professional service'}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {typeof gig.price === 'number' ? `$${gig.price}` : 'Price on request'}
                    {gig.rating ? ` | ${gig.rating.toFixed ? gig.rating.toFixed(1) : gig.rating}*` : ''}
                  </p>
                </Link>
              ))}
              {gigs.length === 0 ? emptyJoin : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{content?.postsTitle || 'Popular Posts'}</h3>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                Community
              </span>
            </div>
            <div className="mt-3 space-y-3">
              {posts.slice(0, compactMode ? maxItems : 6).map((post, index) => (
                <Link
                  key={`${post.id || 'post'}-${index}`}
                  to="/auth/login"
                  className="block rounded-xl border border-slate-100 p-3 transition hover:border-emerald-100 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                >
                  <p className="text-sm font-medium text-slate-800">{post.title || 'Community discussion'}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{post.content || ''}</p>
                </Link>
              ))}
              {posts.length === 0 ? emptyJoin : null}
            </div>
          </div>
        </div>
        {hasData ? (
          <p className="mt-5 text-center text-xs text-slate-500">
            Sourced from live platform content. Sign in to apply, message, and engage.
          </p>
        ) : null}
      </div>
    </section>
  );
};

export const GuestCommunityPreviewSection: React.FC<{ content: GuestCommunityPreviewContent; style?: any }> = ({
  content,
  style
}) => {
  const posts = ensureArray(content?.posts);
  const compactMode = content?.compactMode !== false;
  const maxItems = Number.isFinite(Number(content?.maxItems))
    ? Math.max(2, Math.min(8, Math.trunc(Number(content?.maxItems))))
    : 4;
  const showEmptyState = content?.showEmptyState === true;
  if (posts.length === 0 && !showEmptyState) return null;

  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background || "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)" }}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-6 text-center sm:mb-8">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Community momentum</p>
            {content?.title ? <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{content.title}</h2> : null}
            {content?.subtitle ? <p className="mt-2 text-sm text-slate-600 sm:text-base">{content.subtitle}</p> : null}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {posts.slice(0, compactMode ? maxItems : 8).map((post, index) => (
            <div key={`${post.id || 'community-post'}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="mb-3 flex items-center gap-3">
                {post.author?.avatar ? (
                  <OptimizedImage
                    src={post.author.avatar}
                    alt={post.author?.name || 'User'}
                    width={40}
                    height={40}
                    fit="cover"
                    quality={72}
                    loading="lazy"
                    decoding="async"
                    disableSrcSet
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                    {(post.author?.name || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-slate-900">{post.author?.name || 'Scrolith user'}</p>
                  <p className="text-xs text-slate-500">@{post.author?.username || 'community'}</p>
                </div>
              </div>
              {post.title ? <p className="text-sm font-semibold text-slate-900">{post.title}</p> : null}
              <p className="mt-1 line-clamp-3 text-sm text-slate-600">{post.content || ''}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>{post.likesCount || 0} reactions</span>
                <span>{post.commentsCount || 0} comments</span>
              </div>
            </div>
          ))}
          {posts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-500">
              Community preview is updating. Sign up to unlock live discussions and interactions.
            </div>
          ) : null}
        </div>
        <div className="mt-6 text-center">
          <ActionLink
            label={content?.ctaLabel || 'Sign up to interact'}
            url={content?.ctaUrl || '/auth/signup'}
            className="inline-flex items-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          />
        </div>
      </div>
    </section>
  );
};

export const GuestFinalCtaSection: React.FC<{ content: GuestFinalCtaContent; style?: any }> = ({
  content,
  style
}) => {
  if (!content?.title && !content?.subtitle) return null;
  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className="rounded-3xl border border-slate-200 px-6 py-10 text-center shadow-xl shadow-indigo-300/30 sm:px-10"
          style={{ background: style?.background || 'linear-gradient(120deg, #0f172a 0%, #4f46e5 60%, #7c3aed 100%)' }}
        >
          <div className="mb-4 flex items-center justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-50">
              <img src={SCROLITH_LOGO} alt="Scrolith" width={16} height={16} className="h-4 w-4 rounded-full object-contain" loading="lazy" decoding="async" />
              Scrolith global platform
            </span>
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-100">Ready to scale globally</p>
          {content?.title ? <h2 className="text-2xl font-bold text-white sm:text-3xl">{content.title}</h2> : null}
          {content?.subtitle ? <p className="mx-auto mt-2 max-w-3xl text-sm text-blue-100 sm:text-base">{content.subtitle}</p> : null}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <ActionLink
              label={content?.primaryCtaLabel || 'Sign up'}
              url={content?.primaryCtaUrl || '/auth/signup'}
              className="inline-flex min-h-[44px] items-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            />
            <ActionLink
              label={content?.secondaryCtaLabel || 'Login'}
              url={content?.secondaryCtaUrl || '/auth/login'}
              className="inline-flex min-h-[44px] items-center rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export const PopularServicesSection: React.FC<{ content: PopularServicesContent; style?: any }> = ({
  content,
  style,
}) => {
  const items = ensureArray(content?.items);
  if (!content?.title && !content?.subtitle && items.length === 0) return null;

  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-8 sm:mb-10 text-center">
            {content?.title && (
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{content.title}</h2>
            )}
            {content?.subtitle && (
              <p className="mt-2 text-sm sm:text-base text-gray-600">{content.subtitle}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {items.map((item, index) => {
            const url = resolveUrl(item);
            return (
              <Wrapper
                key={item.id || `popular-${index}`}
                url={url}
                className="group rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-lg transition"
              >
                {item.image && (
                  <div className="h-40 w-full overflow-hidden bg-gray-100">
                    <OptimizedImage
                      src={item.image}
                      alt={item.title || ""}
                      width={480}
                      height={320}
                      fit="cover"
                      quality={72}
                      loading="lazy"
                      decoding="async"
                      sizes="(min-width: 1024px) 23vw, (min-width: 640px) 42vw, 92vw"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <div className="p-4 space-y-2">
                  {item.badge && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600">
                      {item.badge}
                    </span>
                  )}
                  {item.title && <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>}
                  {item.subtitle && <p className="text-xs text-gray-500">{item.subtitle}</p>}
                  {(item.meta || item.price || item.rating) && (
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      {item.meta && <span>{item.meta}</span>}
                      {item.price && <span>{item.price}</span>}
                      {item.rating && <span>{item.rating}</span>}
                    </div>
                  )}
                </div>
              </Wrapper>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export const PromoBannersSection: React.FC<{ content: PromoBannersContent; style?: any }> = ({
  content,
  style,
}) => {
  const items = ensureArray(content?.items);
  if (!content?.title && items.length === 0) return null;

  return (
    <section className="py-10 sm:py-12" style={{ background: style?.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {content?.title && (
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">{content.title}</h2>
        )}

        <div className={`grid gap-6 ${items.length > 1 ? "md:grid-cols-2" : "grid-cols-1"}`}>
          {items.map((item, index) => {
            const isImageLeft = item.imagePosition === "left";
            const bannerStyle = item.background ? { background: item.background, color: item.textColor } : undefined;
            return (
              <div
                key={item.id || `promo-${index}`}
                className="rounded-3xl overflow-hidden border border-gray-200 bg-white shadow-sm"
                style={bannerStyle}
              >
                <div className={`flex flex-col md:flex-row ${isImageLeft ? "md:flex-row-reverse" : ""}`}>
                  <div className="flex-1 p-6 sm:p-8 space-y-4">
                    {item.heading && (
                      <h3 className="text-xl sm:text-2xl font-semibold text-current">{item.heading}</h3>
                    )}
                    {item.body && <p className="text-sm sm:text-base text-current opacity-80">{item.body}</p>}
                    <ActionLink
                      label={item.ctaLabel}
                      url={item.ctaUrl}
                      className="inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 transition"
                    />
                  </div>
                  {item.image && (
                    <div className="md:w-1/2 bg-white/20 flex items-center justify-center p-6">
                      <OptimizedImage
                        src={item.image}
                        alt={item.heading || ""}
                        width={560}
                        height={320}
                        fit="contain"
                        quality={72}
                        loading="lazy"
                        decoding="async"
                        sizes="(min-width: 1024px) 24vw, 100vw"
                        className="w-full h-48 md:h-56 object-contain"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export const TrustValueSection: React.FC<{ content: TrustValueContent; style?: any }> = ({
  content,
  style,
}) => {
  const items = ensureArray(content?.items);
  if (!content?.title && !content?.subtitle && items.length === 0) return null;

  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-8 text-center">
            {content?.title && <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{content.title}</h2>}
            {content?.subtitle && <p className="mt-2 text-sm sm:text-base text-gray-600">{content.subtitle}</p>}
          </div>
        )}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <div
              key={item.id || `trust-${index}`}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              {item.icon && (
                <div className="mb-4 h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <OptimizedImage
                    src={item.icon}
                    alt={item.title || ""}
                    width={24}
                    height={24}
                    fit="contain"
                    quality={72}
                    loading="lazy"
                    decoding="async"
                    disableSrcSet
                    className="h-6 w-6 object-contain"
                  />
                </div>
              )}
              {item.title && <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>}
              {item.description && <p className="mt-2 text-sm text-gray-600">{item.description}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export const VideoFeatureSection: React.FC<{ content: VideoFeatureContent; style?: any }> = ({
  content,
  style,
}) => {
  const embedUrl = getEmbedUrl(content?.videoUrl);
  if (!content?.title && !content?.subtitle && !content?.videoUrl) return null;

  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className="space-y-4">
            {content?.eyebrow && (
              <div className="inline-flex px-3 py-1 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                {content.eyebrow}
              </div>
            )}
            {content?.title && <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{content.title}</h2>}
            {content?.subtitle && <p className="text-sm sm:text-base text-gray-600">{content.subtitle}</p>}
            <ActionLink
              label={content?.ctaLabel}
              url={content?.ctaUrl}
              className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 transition"
            />
          </div>
          <div className="rounded-2xl overflow-hidden border border-gray-200 bg-black">
            {embedUrl ? (
              <iframe
                src={embedUrl}
                title={content?.title || ""}
                className="w-full h-56 sm:h-72 lg:h-80"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : content?.videoUrl ? (
              <video
                src={content.videoUrl}
                poster={content.poster}
                controls
                className="w-full h-56 sm:h-72 lg:h-80 object-cover"
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export const MarketplaceTilesSection: React.FC<{ content: MarketplaceTilesContent; style?: any }> = ({
  content,
  style,
}) => {
  const items = ensureArray(content?.items);
  if (!content?.title && !content?.subtitle && items.length === 0) return null;

  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-8 text-center">
            {content?.title && <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{content.title}</h2>}
            {content?.subtitle && <p className="mt-2 text-sm sm:text-base text-gray-600">{content.subtitle}</p>}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, index) => {
            const url = resolveUrl(item);
            const tileStyle = item.background ? { background: item.background, color: item.textColor } : undefined;
            const tileClass = `rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-lg transition ${
              item.background ? "" : "bg-white"
            }`;
            return (
              <Wrapper
                key={item.id || `tile-${index}`}
                url={url}
                className={tileClass}
                style={tileStyle}
              >
                <div className="space-y-3">
                  {(item.icon || item.image) && (
                <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden">
                      {item.image ? (
                        <OptimizedImage
                          src={item.image}
                          alt={item.title || ""}
                          width={48}
                          height={48}
                          fit="cover"
                          quality={72}
                          loading="lazy"
                          decoding="async"
                          disableSrcSet
                          className="h-full w-full object-cover"
                        />
                      ) : item.icon ? (
                        <OptimizedImage
                          src={item.icon}
                          alt={item.title || ""}
                          width={24}
                          height={24}
                          fit="contain"
                          quality={72}
                          loading="lazy"
                          decoding="async"
                          disableSrcSet
                          className="h-6 w-6 object-contain"
                        />
                      ) : null}
                    </div>
                  )}
                  {item.badge && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600">
                      {item.badge}
                    </span>
                  )}
                  {item.title && <h3 className="text-sm font-semibold text-current">{item.title}</h3>}
                  {item.subtitle && <p className="text-xs text-current opacity-70">{item.subtitle}</p>}
                </div>
              </Wrapper>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export const GuidesGridSection: React.FC<{ content: GuidesGridContent; style?: any }> = ({
  content,
  style,
}) => {
  const items = ensureArray(content?.items);
  if (!content?.title && !content?.subtitle && items.length === 0) return null;

  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-8">
            {content?.title && <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{content.title}</h2>}
            {content?.subtitle && <p className="mt-2 text-sm sm:text-base text-gray-600">{content.subtitle}</p>}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <Wrapper
              key={item.id || `guide-${index}`}
              url={resolveUrl(item)}
              className="group rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-lg transition"
            >
              {item.image && (
                <div className="h-40 w-full overflow-hidden bg-gray-100">
                  <OptimizedImage
                    src={item.image}
                    alt={item.title || ""}
                    width={480}
                    height={320}
                    fit="cover"
                    quality={72}
                    loading="lazy"
                    decoding="async"
                    sizes="(min-width: 1024px) 23vw, (min-width: 640px) 42vw, 92vw"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <div className="p-5 space-y-2">
                {item.category && (
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">
                    {item.category}
                  </span>
                )}
                {item.title && <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>}
                {item.excerpt && <p className="text-xs text-gray-600">{item.excerpt}</p>}
              </div>
            </Wrapper>
          ))}
        </div>
      </div>
    </section>
  );
};

export const MadeOnScrolithSection: React.FC<{ content: MadeOnScrolithContent; style?: any }> = ({
  content,
  style,
}) => {
  const items = ensureArray(content?.items);
  if (!content?.title && !content?.subtitle && items.length === 0) return null;

  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-8">
            {content?.title && <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{content.title}</h2>}
            {content?.subtitle && <p className="mt-2 text-sm sm:text-base text-gray-600">{content.subtitle}</p>}
          </div>
        )}
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4">
          {items.map((item, index) => (
            <Wrapper
              key={item.id || `made-${index}`}
              url={resolveUrl(item)}
              className="mb-4 block break-inside-avoid"
            >
              {item.image && (
                <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition">
                  <OptimizedImage
                    src={item.image}
                    alt={item.title || ""}
                    width={480}
                    height={640}
                    fit="cover"
                    quality={72}
                    loading="lazy"
                    decoding="async"
                    sizes="(min-width: 1280px) 18vw, (min-width: 768px) 24vw, 46vw"
                    className="w-full object-cover"
                  />
                </div>
              )}
            </Wrapper>
          ))}
        </div>
      </div>
    </section>
  );
};

export const FooterCtaStripSection: React.FC<{ content: FooterCtaStripContent; style?: any }> = ({
  content,
  style,
}) => {
  if (!content?.title && !content?.subtitle && !content?.ctaLabel) return null;
  const background = content?.background || style?.background || "#2f1c24";
  const textColor = content?.textColor || style?.textColor || "#ffffff";

  return (
    <section className="py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl px-6 sm:px-10 py-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6"
          style={{ background, color: textColor }}
        >
          <div className="space-y-2">
            {content?.title && <h2 className="text-2xl sm:text-3xl font-semibold">{content.title}</h2>}
            {content?.subtitle && <p className="text-sm sm:text-base opacity-80">{content.subtitle}</p>}
          </div>
          <div className="flex flex-wrap gap-3">
            <ActionLink
              label={content?.ctaLabel}
              url={content?.ctaUrl}
              className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold bg-white text-gray-900 hover:bg-gray-100 transition"
            />
            <ActionLink
              label={content?.secondaryCtaLabel}
              url={content?.secondaryCtaUrl}
              className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold border border-white/50 text-white hover:border-white transition"
            />
          </div>
        </div>
      </div>
    </section>
  );
};


