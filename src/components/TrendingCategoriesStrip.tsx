import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { AdminService } from "../services/admin";
import { CMSService } from "../services/cms";
import { commerceService } from "../services/commerce";
import { ListingCategory, TrendingConfig, UserRole } from "../types";
import { useUser } from "../context/UserContext";
import { useSocket } from "../context/SocketContext";

type TrendingCategoryView = ListingCategory & {
  iconUrl?: string | null;
};

interface Props {
  config?: TrendingConfig; // optional override from Landing
}

const normalizeCategory = (cat: any): TrendingCategoryView | null => {
  if (!cat) return null;
  const name = cat.name ?? cat.label ?? cat.title ?? "";
  const id = cat.id ?? cat._id ?? cat.slug ?? name;
  if (!id || !name) return null;

  const slug = cat.slug ?? String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const count = Number(cat.count ?? cat.total ?? cat.listings ?? 0);

  return {
    ...cat,
    id: String(id),
    name: String(name),
    slug: String(slug),
    status: cat.status ?? "active",
    type: cat.type ?? "gig",
    count: Number.isFinite(count) ? count : 0,
    sortOrder: cat.sortOrder ?? cat.sort_order ?? 0,
    subcategories: Array.isArray(cat.subcategories) ? cat.subcategories : [],
    iconUrl: cat.iconUrl ?? cat.icon_url ?? cat.icon ?? cat.logo ?? cat.image ?? null,
  };
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

const TrendingCategoriesStrip: React.FC<Props> = ({ config: configOverride }) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { socket } = useSocket();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  const [categories, setCategories] = useState<TrendingCategoryView[]>([]);
  const [config, setConfig] = useState<TrendingConfig | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const userRole = (user?.role || UserRole.GUEST) as any;
  const normalizedUserRole = normalizeRole(userRole || UserRole.GUEST);

  const effectiveConfig = useMemo(() => configOverride ?? config, [configOverride, config]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      // Trending config (CMS)
      const conf = configOverride ?? (await CMSService.getTrendingConfig());
      if (!mountedRef.current) return;
      setConfig(conf);

      // Categories (from existing Admin endpoints; NO mock fallback)
      let gigCats: TrendingCategoryView[] = [];
      let jobCats: TrendingCategoryView[] = [];
      try {
        const [gigs, jobs] = await Promise.all([
          AdminService.getGigCategories(),
          AdminService.getJobCategories(),
        ]);
        gigCats = (Array.isArray(gigs) ? gigs : [])
          .map(normalizeCategory)
          .filter((c): c is TrendingCategoryView => Boolean(c));
        jobCats = (Array.isArray(jobs) ? jobs : [])
          .map(normalizeCategory)
          .filter((c): c is TrendingCategoryView => Boolean(c));
      } catch (error) {
        console.warn("Trending categories admin fetch failed, falling back to public categories", error);
      }

      if (!mountedRef.current) return;

      let allCats = [...gigCats, ...jobCats]
        .filter((c: ListingCategory) => c && (!c.status || String(c.status).toLowerCase() === "active"));

      if (allCats.length === 0) {
        const publicCats = await commerceService.getCategories().catch(() => []);
        allCats = (Array.isArray(publicCats) ? publicCats : [])
          .map(normalizeCategory)
          .filter((c): c is TrendingCategoryView => Boolean(c))
          .filter((c) => !c.status || String(c.status).toLowerCase() === "active");
      }

      // Determine list by configured IDs or popularity
      const categoryIds = ((conf as any)?.category_ids || (conf as any)?.categoryIds || [])
        .map((id: any) => String(id).trim())
        .filter(Boolean);
      const normalizedIds = categoryIds.map((id: string) => id.toLowerCase());
      const getMatchIndex = (cat: TrendingCategoryView) => {
        const id = String(cat.id || "").toLowerCase();
        const slug = String(cat.slug || "").toLowerCase();
        const name = String(cat.name || "").toLowerCase();
        return normalizedIds.findIndex((entry) => entry === id || entry === slug || entry === name);
      };

      let displayCats: TrendingCategoryView[] = allCats;

      if (normalizedIds.length > 0) {
        const matched = allCats.filter((c) => getMatchIndex(c) !== -1);
        displayCats = matched.length > 0
          ? matched.sort((a, b) => getMatchIndex(a) - getMatchIndex(b))
          : allCats;
      } else {
        // popularity sort; safe for undefined
        displayCats = allCats.sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
      }

      if (!mountedRef.current) return;

      // Debug: log effective config and resolved categories for non-admin users
      try {
        if (normalizedUserRole !== (UserRole as any).ADMIN && typeof console !== 'undefined') {
          // eslint-disable-next-line no-console
          console.info('[Trending Debug] effectiveConfig=', conf, 'normalizedUserRole=', normalizedUserRole, 'categoryIds=', categoryIds, 'allCatsCount=', allCats.length, 'matchedCount=', displayCats.length, 'allCatsSample=', (allCats || []).slice(0, 6).map(c => ({ id: c.id, slug: c.slug, name: c.name })), 'displayCatsSample=', (displayCats || []).slice(0, 12).map(c => ({ id: c.id, slug: c.slug, name: c.name })));
        }
      } catch (e) {
        // ignore debug failures
      }

      setCategories(displayCats);
    } catch (error: any) {
      console.error("Error loading trending categories:", error);
      if (!mountedRef.current) return;
      setLoadError("Failed to load trending categories");
      setCategories([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [configOverride]);

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, [loadData]);

  useEffect(() => {
    if (!socket) return;
    const handleRefresh = () => loadData();
    socket.on("cms:trending_updated", handleRefresh);
    socket.on("cms:trending_config_updated", handleRefresh);
    socket.on("cms:trending_categories_updated", handleRefresh);
    return () => {
      socket.off("cms:trending_updated", handleRefresh);
      socket.off("cms:trending_config_updated", handleRefresh);
      socket.off("cms:trending_categories_updated", handleRefresh);
    };
  }, [socket, loadData]);

  useEffect(() => {
    if (socket) return;
    const id = window.setInterval(() => {
      loadData();
    }, 5000);
    return () => window.clearInterval(id);
  }, [socket, loadData]);


  const scroll = (direction: "left" | "right") => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const scrollAmount = 320;
    const newScrollLeft = direction === "left" ? el.scrollLeft - scrollAmount : el.scrollLeft + scrollAmount;

    el.scrollTo({ left: newScrollLeft, behavior: "smooth" });
  };

  const checkScrollButtons = () => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
  };

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    el.addEventListener("scroll", checkScrollButtons);
    checkScrollButtons();

    return () => el.removeEventListener("scroll", checkScrollButtons);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length]);

  // Auto-scroll (optional, but default is manual in your spec)
  useEffect(() => {
    const cfg = effectiveConfig as any;
    if (!cfg) return;

    const behavior = cfg.scroll_behavior || cfg.scrollBehavior || "manual";
    const intervalMs = cfg.auto_slide_interval ?? cfg.autoSlideInterval ?? 0;

    if (behavior !== "auto" || !intervalMs || intervalMs <= 0) return;

    const id = setInterval(() => {
      const el = scrollContainerRef.current;
      if (!el) return;

      const { scrollLeft, scrollWidth, clientWidth } = el;
      if (scrollLeft + clientWidth >= scrollWidth - 5) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        scroll("right");
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [effectiveConfig]);

  // Visibility rules (after hooks)
  if (loading) {
    return (
      <div className="bg-white border-b border-gray-100 py-3">
        <div className="max-w-7xl mx-auto px-4 text-sm text-gray-500">
          Loading trending categories...
        </div>
      </div>
    );
  }

  // If config exists, enforce enable + role visibility
  if (effectiveConfig) {
    const visibilityList = normalizeRoleList((effectiveConfig as any)?.visibility);
    const isVisible =
      visibilityList.length > 0
        ? visibilityList.includes("all") || visibilityList.includes(normalizedUserRole)
        : true;

    if (!(effectiveConfig as any).enabled || !isVisible || categories.length === 0) {
      return null;
    }
  } else {
    // No config: do not show (production-only, no mock)
    return null;
  }

  const showIcons = Boolean((effectiveConfig as any)?.show_icons ?? (effectiveConfig as any)?.showIcons ?? false);
  const stripTitle = (effectiveConfig as any)?.title ?? "";
  const showTitle = Boolean(stripTitle);

  return (
    <div className="bg-[#f7f4ee] border-b border-[#e8e1d6] relative z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center">
        {/* Label */}
        {showTitle ? (
          <div className="flex items-center mr-6 text-[#0b0b0a] whitespace-nowrap">
            <TrendingUp className="w-5 h-5 mr-2 text-[#0f6b4f]" />
            <span className="text-base font-semibold tracking-tight">{stripTitle}</span>
          </div>
        ) : null}

        <div className="relative flex-1 overflow-hidden group">
          {canScrollLeft && (
            <button
              onClick={() => scroll("left")}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white shadow-lg p-2 rounded-full text-[#0b0b0a] hover:text-[#0f6b4f] border border-[#e8e1d6] transition-transform hover:scale-110"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          <div
            ref={scrollContainerRef}
            className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth px-1 items-center"
          >
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => navigate(`/browse?category=${encodeURIComponent(cat.name)}`)}
                className="
                  group flex-shrink-0
                  w-[180px] sm:w-[200px]
                  p-4
                  bg-white
                  border border-[#e8e1d6]
                  rounded-2xl
                  text-left
                  transition-all
                  hover:shadow-[0_18px_40px_-30px_rgba(11,11,10,0.6)]
                  hover:-translate-y-1
                "
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[#f2efe7] flex items-center justify-center text-[#0f6b4f]">
                    {showIcons && (cat as any).iconUrl ? (
                      <img src={(cat as any).iconUrl} alt="" className="w-6 h-6 object-contain" />
                    ) : (
                      <span className="text-lg font-bold">{cat.name.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-[#0b0b0a] leading-tight">
                    {cat.name}
                  </div>
                </div>
                {typeof (cat as any).count === "number" ? (
                  <div className="mt-3 text-xs text-[#6b645b]">{(cat as any).count}</div>
                ) : null}
              </button>
            ))}
          </div>

          {canScrollRight && (
            <button
              onClick={() => scroll("right")}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white shadow-lg p-2 rounded-full text-[#0b0b0a] hover:text-[#0f6b4f] border border-[#e8e1d6] transition-transform hover:scale-110"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {loadError ? (
        <div className="max-w-7xl mx-auto px-4 pb-3 text-xs text-red-500">
          {loadError}
        </div>
      ) : null}

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default TrendingCategoriesStrip;
