import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { HomeSlide, HeroSearchConfig } from "../types";
import { UserRole } from "../types";
import { useUser } from "../context/UserContext";
import { ChevronLeft, ChevronRight } from "lucide-react";
import SearchInput from "./SearchInput";
import { resolveAssetUrl } from "../utils/assetUrl";

interface HomeSliderProps {
  slides: HomeSlide[];
  heroConfig?: HeroSearchConfig | null;
  searchMode?: "keyword" | "semantic";
}

function normalizeRole(role: any): string {
  if (!role) return "guest";
  const r = String(role).toLowerCase();
  if (r === "public") return "guest";
  if (r === "client") return "employer";
  if (r === "all" || r === "*") return "all";
  return r;
}

function normalizeRoleList(list: any): string[] {
  if (Array.isArray(list)) return list.map((x) => normalizeRole(x));
  if (typeof list === "string") {
    return list
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => normalizeRole(entry));
  }
  return [];
}

function normalizeBoolean(value: any, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    return Boolean(normalized);
  }
  return Boolean(value);
}

const ensureArray = <T,>(value: any): T[] => (Array.isArray(value) ? value : []);

const toOverlayColor = (value: unknown, alpha = 0.35): string => {
  const fallback = `rgba(0, 0, 0, ${alpha})`;
  if (typeof value !== "string") return fallback;
  const color = value.trim();
  if (!color) return fallback;

  const shortHex = color.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("").map((ch) => parseInt(ch + ch, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const fullHex = color.match(/^#([0-9a-f]{6})$/i);
  if (fullHex) {
    const hex = fullHex[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const rgb = color.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(",").map((part) => Number(part.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every((part) => Number.isFinite(part))) {
      return `rgba(${Math.max(0, Math.min(255, parts[0]))}, ${Math.max(0, Math.min(255, parts[1]))}, ${Math.max(0, Math.min(255, parts[2]))}, ${alpha})`;
    }
  }

  return fallback;
};

const HomeSlider: React.FC<HomeSliderProps> = ({ slides, heroConfig, searchMode = "keyword" }) => {
  const { user } = useUser();
  const navigate = useNavigate();

  const [currentIndex, setCurrentIndex] = useState(0);

  const role = useMemo(() => normalizeRole((user as any)?.role || UserRole.GUEST), [user]);

  const headline =
    (heroConfig as any)?.headline ||
    (heroConfig as any)?.title ||
    "Find top talent and opportunities on Scrolith";
  const subheadline =
    (heroConfig as any)?.subheadline ||
    (heroConfig as any)?.subtitle ||
    "Hire experts, discover gigs, and grow faster with AI-powered matching.";
  const searchPlaceholder =
    (heroConfig as any)?.searchPlaceholder || (heroConfig as any)?.search_placeholder || "Search gigs, jobs, or talent";
  const searchButtonLabel =
    (heroConfig as any)?.searchButtonLabel || (heroConfig as any)?.search_button_label || "Search";
  const searchButtonAriaLabel =
    (heroConfig as any)?.searchButtonAriaLabel || (heroConfig as any)?.search_button_aria_label || "Search";
  const searchResultsUrl =
    (heroConfig as any)?.searchResultsUrl || (heroConfig as any)?.search_results_url || "";
  const aiBadgeLabel =
    (heroConfig as any)?.aiBadgeLabel || (heroConfig as any)?.ai_badge_label || "";
  const aiBadgeDescription =
    (heroConfig as any)?.aiBadgeDescription || (heroConfig as any)?.ai_badge_description || "";
  const rawSize = (heroConfig as any)?.searchSize || (heroConfig as any)?.search_size || "large";
  const normalizedSize =
    rawSize === "extra-large" || rawSize === "extraLarge" ? "xl" : String(rawSize).toLowerCase();
  const searchSize = (["normal", "large", "xl"].includes(normalizedSize)
    ? normalizedSize
    : "large") as "normal" | "large" | "xl";

  const quickTags = useMemo(() => {
    return ensureArray<any>((heroConfig as any)?.quickTags ?? (heroConfig as any)?.quick_tags)
      .map((tag: any, index: number) => {
        if (!tag) return null;
        const label = tag.label ?? tag.name ?? tag.title ?? "";
        const url = tag.url ?? tag.link ?? tag.href ?? "";
        const bgColor = tag.bgColor ?? tag.bg_color ?? tag.color ?? "";
        return {
          id: tag.id || `qt-${index}`,
          label,
          url,
          bgColor,
        };
      })
      .filter((tag: any) => tag && tag.label);
  }, [heroConfig]);

  const trustedBrands = (heroConfig as any)?.trustedBrands ?? (heroConfig as any)?.trusted_brands ?? {};
  const valueProp = (heroConfig as any)?.valueProp ?? (heroConfig as any)?.value_prop ?? {};
  const trustedLogos = ensureArray<any>(trustedBrands?.logos ?? trustedBrands?.items ?? []).filter(
    (logo: any) => logo && (logo.src || logo.image)
  );
  const valueBadges = ensureArray<any>(valueProp?.badges ?? valueProp?.items ?? []);

  const visibleSlides = useMemo(() => {
    const safeSlides = Array.isArray(slides) ? slides : [];

    const filtered = safeSlides
      .filter((s: any) => {
        const isActive = normalizeBoolean(
          s?.isActive ?? s?.is_active ?? s?.enabled ?? s?.is_enabled,
          true
        );

        // If no roleVisibility, show to all
        const rv = normalizeRoleList(s?.roleVisibility ?? s?.role_visibility ?? []);
        if (rv.length === 0) return isActive;
        if (rv.includes("all")) return isActive;
        return isActive && rv.includes(role);
      })
      .map((s: any) => ({
        ...s,
        mediaType: s.mediaType || s.media_type || "image",
        mediaUrl: resolveAssetUrl(s.mediaUrl || s.media_url || s.image_url || s.video_url || ""),
        redirectUrl: s.redirectUrl || s.redirect_url || s.link || s.url || "",
        sortOrder: s.sortOrder ?? s.sort_order ?? 0,
        backgroundColor: s.backgroundColor || s.background_color || s.bgColor || "#000000",
      }))
      .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));

    return filtered as HomeSlide[];
  }, [slides, role]);

  const totalSlides = Math.max(visibleSlides.length, 1);

  useEffect(() => {
    // keep index in range
    if (currentIndex >= visibleSlides.length) setCurrentIndex(0);
  }, [visibleSlides.length, currentIndex]);

  useEffect(() => {
    if (visibleSlides.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % visibleSlides.length);
    }, 6000);

    return () => clearInterval(interval);
  }, [visibleSlides.length]);

  const slidesForRender =
    visibleSlides.length > 0
      ? visibleSlides
      : ([
          {
            id: "fallback",
            mediaType: "image",
            mediaUrl: "",
            title: "",
            subtitle: "",
            redirectUrl: "",
            roleVisibility: [],
            sortOrder: 0,
            isActive: true,
            createdAt: "",
            updatedAt: "",
            backgroundColor: "#0b0b0a",
          },
        ] as HomeSlide[]);

  const current = slidesForRender[currentIndex] || slidesForRender[0];

  const handleSlideClick = () => {
    const redirectUrl = (current as any)?.redirectUrl || (current as any)?.redirect_url;
    if (!redirectUrl) return;

    if (redirectUrl.startsWith("http")) {
      window.location.href = redirectUrl;
    } else {
      navigate(redirectUrl);
    }
  };

  const nextSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % totalSlides);
  };

  const prevSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  const openUrl = (url: string) => {
    if (!url) return;
    if (url.startsWith("http")) {
      window.location.href = url;
    } else {
      navigate(url);
    }
  };

  const handleQuickTagClick = (tag: any) => {
    if (!tag) return;
    if (tag.url) {
      openUrl(tag.url);
      return;
    }
    if (searchResultsUrl && tag.label) {
      const isExternal = searchResultsUrl.startsWith("http");
      const url = isExternal ? new URL(searchResultsUrl) : new URL(searchResultsUrl, window.location.origin);
      url.searchParams.set("q", tag.label);
      openUrl(isExternal ? url.toString() : `${url.pathname}${url.search}`);
    }
  };

  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="relative w-full h-[620px] sm:h-[660px] md:h-[710px] lg:h-[760px] xl:h-[820px] overflow-hidden bg-gray-900 group cursor-pointer"
      onClick={handleSlideClick}
      role="button"
      aria-label="Homepage slider"
    >
      {/* Slides */}
      {slidesForRender.map((slide, index) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-all duration-1000 ease-in-out ${
            index === currentIndex ? "opacity-100 z-10 scale-100" : "opacity-0 z-0 scale-105"
          }`}
          style={{ backgroundColor: (slide as any).backgroundColor || "#000" }}
        >
          <div className="absolute inset-0 w-full h-full">
            {(slide as any).mediaType === "video" && (slide as any).mediaUrl ? (
              <video
                src={(slide as any).mediaUrl}
                autoPlay
                muted
                loop
                playsInline
                preload={index === currentIndex ? "auto" : "metadata"}
                width={1920}
                height={820}
                className="w-full h-full object-cover object-center brightness-75"
              />
            ) : (slide as any).mediaUrl ? (
              <img
                src={(slide as any).mediaUrl || ""}
                alt={(slide as any).title || "Slide"}
                width={1920}
                height={820}
                loading={index === currentIndex ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={index === currentIndex ? "high" : "low"}
                className="w-full h-full object-cover object-center brightness-75"
              />
            ) : (
              <div className="h-full w-full bg-[radial-gradient(circle_at_18%_22%,#1e40af_0%,#0f172a_48%,#020617_100%)]" />
            )}

            <div
              className="absolute inset-0 mix-blend-multiply"
              style={{ backgroundColor: toOverlayColor((slide as any).backgroundColor || (slide as any).background_color) }}
            />
            <div className="absolute inset-0 bg-black/15" />

            {/* Optional caption (safe, non-blocking) */}
            {((slide as any).title || (slide as any).subtitle) && (
              <div className="absolute top-8 left-6 right-6 z-20 max-w-3xl">
                <div className="bg-black/35 backdrop-blur-sm rounded-xl p-4 sm:p-5 border border-white/10">
                  {(slide as any).title ? (
                    <h3 className="text-white font-bold text-xl sm:text-2xl leading-tight">
                      {(slide as any).title}
                    </h3>
                  ) : null}
                  {(slide as any).subtitle ? (
                    <p className="text-white/85 text-sm sm:text-base mt-1">{(slide as any).subtitle}</p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Slider Search + Trust Messaging */}
      <div className="absolute inset-0 z-30 flex items-end pointer-events-none">
        <div className="w-full max-w-6xl mx-auto px-4 pb-16 pointer-events-auto" onClick={stopPropagation}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
            <div className="lg:col-span-7 bg-black/45 border border-white/10 backdrop-blur-md rounded-2xl p-5 sm:p-6">
              {aiBadgeLabel || aiBadgeDescription ? (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-white/70">
                  {aiBadgeLabel ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/15 text-white text-[11px] font-semibold uppercase tracking-wide">
                      {aiBadgeLabel}
                    </span>
                  ) : null}
                  {aiBadgeDescription ? <span className="text-[11px]">{aiBadgeDescription}</span> : null}
                </div>
              ) : null}
              {headline ? (
                <h1 className="text-white font-semibold text-2xl sm:text-3xl leading-tight">{headline}</h1>
              ) : null}
              {subheadline ? (
                <p className="text-white/80 text-sm sm:text-base mt-2">{subheadline}</p>
              ) : null}

              <div className="mt-4">
                <SearchInput
                  placeholder={searchPlaceholder}
                  size={searchSize}
                  showButton
                  buttonLabel={searchButtonLabel}
                  buttonAriaLabel={searchButtonAriaLabel || searchButtonLabel || searchPlaceholder}
                  searchMode={searchMode}
                  searchPath={searchResultsUrl || undefined}
                />
              </div>

              {quickTags.length > 0 ? (
                <div className="pt-4 flex flex-wrap gap-2">
                  {quickTags.map((tag: any) => (
                    <button
                      key={tag.id || tag.label}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickTagClick(tag);
                      }}
                      className="rounded-full px-4 py-2 text-xs sm:text-sm font-medium text-white/90 hover:text-white transition"
                      style={{ background: tag.bgColor || "rgba(255,255,255,0.18)" }}
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {(trustedBrands?.enabled || valueProp?.enabled) && (
              <div className="lg:col-span-5 bg-black/35 border border-white/10 backdrop-blur-md rounded-2xl p-5 sm:p-6 space-y-5">
                {trustedBrands?.enabled && trustedLogos.length > 0 ? (
                  <div>
                    {trustedBrands?.title ? (
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/70 mb-3">
                        {trustedBrands.title}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-4 items-center">
                      {trustedLogos.map((logo: any) => (
                        <button
                          key={logo.id || logo.src}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (logo?.url) openUrl(logo.url);
                          }}
                          className={logo?.url ? "opacity-90 hover:opacity-100 transition" : "opacity-90"}
                          aria-label={logo.alt || ""}
                        >
                          <img
                            src={resolveAssetUrl(logo.src || logo.image)}
                            alt={logo.alt || ""}
                            className="h-6 w-auto object-contain"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {valueProp?.enabled ? (
                  <div className="space-y-4">
                    {valueProp?.heading ? (
                      <p className="text-white text-sm sm:text-base font-semibold">{valueProp.heading}</p>
                    ) : null}

                    {valueBadges.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {valueBadges.map((badge: any) => (
                          <div
                            key={badge.id || badge.label}
                            className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/85"
                          >
                            {badge.icon ? (
                              <img src={resolveAssetUrl(badge.icon)} alt="" className="h-3.5 w-3.5 object-contain" />
                            ) : null}
                            <span>{badge.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {(valueProp?.primaryCta?.label && valueProp?.primaryCta?.url) ||
                    (valueProp?.secondaryCta?.label && valueProp?.secondaryCta?.url) ? (
                      <div className="flex flex-wrap gap-3">
                        {valueProp?.primaryCta?.label && valueProp?.primaryCta?.url ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openUrl(valueProp.primaryCta.url);
                            }}
                            className="px-4 py-2 rounded-full bg-white text-gray-900 text-sm font-semibold hover:bg-gray-100 transition"
                          >
                            {valueProp.primaryCta.label}
                          </button>
                        ) : null}
                        {valueProp?.secondaryCta?.label && valueProp?.secondaryCta?.url ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openUrl(valueProp.secondaryCta.url);
                            }}
                            className="px-4 py-2 rounded-full border border-white/25 text-white text-sm font-semibold hover:border-white/60 transition"
                          >
                            {valueProp.secondaryCta.label}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      {visibleSlides.length > 1 && (
        <>
          <button
            onClick={prevSlide}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-40 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all opacity-0 group-hover:opacity-100"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={nextSlide}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-40 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all opacity-0 group-hover:opacity-100"
            aria-label="Next slide"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}
    </div>
  );
};

export default HomeSlider;
