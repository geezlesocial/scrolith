import React from "react";
import { Link } from "react-router-dom";
import {
  FooterCtaStripContent,
  GuidesGridContent,
  MadeOnGeezleContent,
  MarketplaceTilesContent,
  PopularServicesContent,
  PromoBannersContent,
  TrustValueContent,
  VideoFeatureContent,
} from "../../types";

const ensureArray = <T,>(value: any): T[] => (Array.isArray(value) ? value : []);

const resolveUrl = (item: any) => item?.url ?? item?.href ?? item?.link ?? "";

const isExternalUrl = (url: string) => /^https?:\/\//i.test(url);

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
                    <img src={item.image} alt={item.title || ""} className="h-full w-full object-cover" />
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
                      <img src={item.image} alt={item.heading || ""} className="w-full h-48 md:h-56 object-contain" />
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
                  <img src={item.icon} alt={item.title || ""} className="h-6 w-6 object-contain" />
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
                        <img src={item.image} alt={item.title || ""} className="h-full w-full object-cover" />
                      ) : item.icon ? (
                        <img src={item.icon} alt={item.title || ""} className="h-6 w-6 object-contain" />
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
                  <img src={item.image} alt={item.title || ""} className="h-full w-full object-cover" />
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

export const MadeOnGeezleSection: React.FC<{ content: MadeOnGeezleContent; style?: any }> = ({
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
                  <img src={item.image} alt={item.title || ""} className="w-full object-cover" />
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
