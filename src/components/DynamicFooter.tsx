import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CMSService } from '../services/cms';
import { FooterConfig, UserRole } from '../types';
import { useUser } from '../context/UserContext';
import { useContent } from '../context/ContentContext';
import { useSocket } from '../context/SocketContext';

const FOOTER_CACHE_KEY = 'scrolith.footer.config.v1';
const FOOTER_CACHE_TTL_MS = 5 * 60 * 1000;

type FooterCacheEntry = {
  config: FooterConfig;
  cachedAt: number;
};

let footerCache: FooterCacheEntry | null = null;
let footerRequest: Promise<FooterConfig> | null = null;

const ensureArray = <T,>(value: any): T[] => (Array.isArray(value) ? value : []);

const normalizeRole = (role: any): string => {
  if (!role) return 'guest';
  const normalized = String(role).toLowerCase().trim();
  if (normalized === 'public') return 'guest';
  if (normalized === 'client') return 'employer';
  if (normalized === 'all' || normalized === '*') return 'all';
  return normalized;
};

const normalizeRoleList = (value: any): string[] => {
  if (Array.isArray(value)) return value.map(normalizeRole);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(normalizeRole);
  }
  return [];
};

const isVisibleToRole = (value: any, role: string) => {
  const roles = normalizeRoleList(value);
  if (roles.length === 0) return true;
  if (roles.includes('all') || roles.includes('*')) return true;
  return roles.includes(role);
};

const resolveUrl = (item: any) => item?.url ?? item?.href ?? item?.link ?? '';

const isExternalUrl = (item: any, url: string) => {
  const type = String(item?.type || '').toLowerCase();
  if (type === 'external') return true;
  return url.startsWith('http');
};

const readCachedFooter = (): FooterCacheEntry | null => {
  if (footerCache && Date.now() - footerCache.cachedAt < FOOTER_CACHE_TTL_MS) {
    return footerCache;
  }

  if (typeof window === 'undefined') return footerCache;

  try {
    const raw = window.sessionStorage.getItem(FOOTER_CACHE_KEY);
    if (!raw) return footerCache;
    const parsed = JSON.parse(raw) as FooterCacheEntry;
    if (!parsed?.config || !parsed?.cachedAt) return footerCache;
    if (Date.now() - parsed.cachedAt >= FOOTER_CACHE_TTL_MS) return footerCache;
    footerCache = parsed;
    return parsed;
  } catch {
    return footerCache;
  }
};

const writeCachedFooter = (config: FooterConfig) => {
  const nextEntry: FooterCacheEntry = {
    config,
    cachedAt: Date.now()
  };
  footerCache = nextEntry;

  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(FOOTER_CACHE_KEY, JSON.stringify(nextEntry));
  } catch {
    // ignore storage failures
  }
};

const getFooterConfigCached = async (force = false): Promise<FooterConfig> => {
  const cached = !force ? readCachedFooter() : null;
  if (cached?.config) {
    return cached.config;
  }

  if (!force && footerRequest) {
    return footerRequest;
  }

  footerRequest = CMSService.getFooterConfig()
    .then((data) => {
      writeCachedFooter(data);
      return data;
    })
    .finally(() => {
      footerRequest = null;
    });

  return footerRequest;
};

const buildFallbackFooter = (): FooterConfig =>
  ({
    id: 'default',
    description: '',
    copyright: '',
    columns: [],
    contact: {
      admin_email: '',
      support_email: '',
      ticket_route: ''
    },
    socials: [],
    logo_url: ''
  } as any);

const DynamicFooter = () => {
  const cachedEntry = readCachedFooter();
  const [config, setConfig] = useState<FooterConfig | null>(cachedEntry?.config ?? null);
  const [loading, setLoading] = useState(!cachedEntry?.config);
  const navigate = useNavigate();
  const { user } = useUser();
  const { settings } = useContent();
  const { socket } = useSocket();

  const role = normalizeRole(user?.role || UserRole.GUEST);
  const socialLabelTitle =
    (config as any)?.social_label_title || (config as any)?.socialLabelTitle || '';
  const socialOffsetEnabled =
    Boolean(socialLabelTitle) && ensureArray<any>((config as any)?.socials).length > 0;

  useEffect(() => {
    let mounted = true;

    const loadConfig = async (force = false) => {
      try {
        const data = await getFooterConfigCached(force);
        if (mounted) {
          setConfig(data);
        }
      } catch (error) {
        console.error('Failed to load footer config:', error);
        if (mounted) {
          setConfig(buildFallbackFooter());
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadConfig();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleFooterUpdated = async () => {
      try {
        const data = await getFooterConfigCached(true);
        setConfig(data);
      } catch (error) {
        console.error('Failed to refresh footer config:', error);
      }
    };
    socket.on('cms:footer_updated', handleFooterUpdated);
    return () => {
      socket.off('cms:footer_updated', handleFooterUpdated);
    };
  }, [socket]);

  useEffect(() => {
    const root = document.documentElement;
    const offset = socialOffsetEnabled ? '44px' : '0px';
    root.style.setProperty('--support-widget-offset', offset);
    return () => {
      root.style.setProperty('--support-widget-offset', '0px');
    };
  }, [socialOffsetEnabled]);

  if (loading && !config) {
    return (
      <footer className="bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-10 sm:px-6 lg:px-8">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.85fr)]">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
              <div className="h-8 w-40 animate-pulse rounded-full bg-white/10" />
              <div className="mt-4 h-4 max-w-md animate-pulse rounded-full bg-white/10" />
              <div className="mt-2 h-4 max-w-sm animate-pulse rounded-full bg-white/10" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="h-4 w-24 animate-pulse rounded-full bg-white/10" />
                  <div className="mt-4 space-y-3">
                    <div className="h-3 w-full animate-pulse rounded-full bg-white/10" />
                    <div className="h-3 w-4/5 animate-pulse rounded-full bg-white/10" />
                    <div className="h-3 w-3/5 animate-pulse rounded-full bg-white/10" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </footer>
    );
  }

  if (!config) {
    return null;
  }

  const footerDescription = config.description || '';
  const footerLogo =
    config.logo_url || (config as any).logoUrl || settings?.logo_url || settings?.logoUrl || '';
  const brandName = (settings as any)?.siteName || (settings as any)?.site_name || '';
  const baseColumns = ensureArray<any>(config.columns);
  const contact = (config as any).contact || {};

  const contactLinks = [
    contact.support_email
      ? {
          id: 'contact-support',
          label: contact.support_email,
          url: `mailto:${contact.support_email}`,
          type: 'external',
          visibility: []
        }
      : null,
    contact.admin_email
      ? {
          id: 'contact-admin',
          label: contact.admin_email,
          url: `mailto:${contact.admin_email}`,
          type: 'external',
          visibility: []
        }
      : null,
    contact.ticket_route
      ? {
          id: 'contact-ticket',
          label: contact.ticket_route,
          url: contact.ticket_route,
          type: contact.ticket_route.startsWith('http') ? 'external' : 'internal',
          visibility: []
        }
      : null
  ].filter(Boolean);

  const columns = contactLinks.length
    ? [...baseColumns, { id: 'footer-contact', title: '', links: contactLinks }]
    : baseColumns;

  const socials = ensureArray<any>(config.socials).filter(
    (social: any) => social && social.url && social.enabled !== false
  );
  const hasSocialArea = socials.length > 0;

  const hasContent =
    Boolean(footerDescription) ||
    Boolean(footerLogo) ||
    Boolean(brandName) ||
    columns.length > 0 ||
    hasSocialArea ||
    Boolean(config.copyright);

  if (!hasContent) {
    return null;
  }

  const handleLinkClick = (url: string, isExternal: boolean, event: React.MouseEvent) => {
    if (isExternal) return;
    event.preventDefault();
    navigate(url);
  };

  const renderFooterLink = (link: any) => {
    const url = resolveUrl(link);
    if (!url || !link.label) return null;
    if (!isVisibleToRole(link.visibility, role)) return null;

    const external = isExternalUrl(link, url);
    if (external) {
      return (
        <a
          key={link.id || url}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="break-words text-sm leading-6 text-slate-300 transition-colors hover:text-white sm:text-[15px]"
        >
          {link.label}
        </a>
      );
    }

    return (
      <a
        key={link.id || url}
        href={url}
        className="break-words text-sm leading-6 text-slate-300 transition-colors hover:text-white sm:text-[15px]"
        onClick={(event) => handleLinkClick(url, false, event)}
      >
        {link.label}
      </a>
    );
  };

  const renderSocial = (social: any) => {
    const icon = String(social.icon || '');
    const showImage = icon.startsWith('http') || icon.startsWith('/');
    const label = social.platform || social.name || social.url || '';
    const fallbackLabel = label ? label.slice(0, 1) : '';

    return (
      <a
        key={social.id || social.url}
        href={social.url}
        target="_blank"
        rel="noreferrer"
        className="text-slate-300 transition-colors hover:text-white"
      >
        <span className="sr-only">{label}</span>
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-xs font-semibold uppercase shadow-[0_10px_24px_rgba(15,23,42,0.3)] backdrop-blur">
          {showImage ? (
            <img src={icon} alt="" className="h-4 w-4 object-contain" loading="lazy" decoding="async" />
          ) : (
            fallbackLabel
          )}
        </div>
      </a>
    );
  };

  return (
    <footer className="bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.85fr)]">
          {(footerLogo || brandName || footerDescription) && (
            <div className="rounded-3xl border border-white/10 bg-[linear-gradient(160deg,rgba(15,23,42,0.96),rgba(30,41,59,0.88))] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.32)] sm:p-8">
              <div className="flex flex-col items-start gap-4 text-left sm:flex-row sm:items-center sm:gap-5">
                {footerLogo ? (
                  <img
                    src={footerLogo}
                    alt={brandName || ''}
                    width={160}
                    height={32}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    className="h-9 w-auto max-w-[12rem] object-contain sm:h-10"
                  />
                ) : null}
                {brandName ? <span className="text-xl font-bold tracking-tight sm:text-2xl">{brandName}</span> : null}
              </div>
              {footerDescription ? (
                <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-[15px]">{footerDescription}</p>
              ) : null}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {columns.map((column: any, index: number) => {
              const links = ensureArray<any>(column.links).filter((link: any) => link?.label && resolveUrl(link));
              const visibleLinks = links.filter((link: any) => isVisibleToRole(link.visibility, role));
              if (visibleLinks.length === 0) return null;

              return (
                <section
                  key={column.id || index}
                  className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_45px_rgba(2,6,23,0.18)]"
                >
                  {column.title ? (
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{column.title}</h3>
                  ) : (
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Links</h3>
                  )}
                  <ul className="mt-4 space-y-3">
                    {visibleLinks.map((link: any) => (
                      <li key={link.id || link.url}>{renderFooterLink(link)}</li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-end sm:justify-between">
          {config.copyright ? (
            <p className="max-w-2xl text-center text-xs leading-6 text-slate-400 sm:text-left sm:text-sm">{config.copyright}</p>
          ) : (
            <span />
          )}
          {hasSocialArea ? (
            <div className="flex flex-col items-center gap-3 sm:items-end">
              {socialLabelTitle ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{socialLabelTitle}</p>
              ) : null}
              <div className="flex flex-wrap justify-center gap-3 sm:justify-end">{socials.map(renderSocial)}</div>
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
};

export default DynamicFooter;
