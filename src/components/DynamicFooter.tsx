import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CMSService } from '../services/cms';
import { FooterConfig, UserRole } from '../types';
import { useUser } from '../context/UserContext';
import { useContent } from '../context/ContentContext';
import { useSocket } from '../context/SocketContext';

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

const DynamicFooter = () => {
  const [config, setConfig] = useState<FooterConfig | null>(null);
  const [loading, setLoading] = useState(true);
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

    const loadConfig = async () => {
      try {
        const data = await CMSService.getFooterConfig();
        if (mounted) {
          setConfig(data);
        }
      } catch (error) {
        console.error('Failed to load footer config:', error);
        if (mounted) {
          setConfig({
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
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadConfig();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleFooterUpdated = async () => {
      try {
        const data = await CMSService.getFooterConfig();
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

  if (loading) {
    return (
      <footer className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center text-gray-400">Loading footer...</div>
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
          className="text-base text-gray-400 hover:text-white transition-colors"
        >
          {link.label}
        </a>
      );
    }

    return (
      <a
        key={link.id || url}
        href={url}
        className="text-base text-gray-400 hover:text-white transition-colors"
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
        className="text-gray-400 hover:text-white transition-colors"
      >
        <span className="sr-only">{label}</span>
        <div className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center text-xs font-semibold uppercase">
          {showImage ? <img src={icon} alt="" className="w-4 h-4 object-contain" /> : fallbackLabel}
        </div>
      </a>
    );
  };

  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {(footerLogo || brandName || footerDescription) && (
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center">
                {footerLogo ? (
                  <img
                    src={footerLogo}
                    alt={brandName || ''}
                    width={160}
                    height={32}
                    loading="lazy"
                    decoding="async"
                    className="h-8 w-auto object-contain"
                  />
                ) : null}
                {brandName ? <span className="ml-2 text-xl font-bold">{brandName}</span> : null}
              </div>
              {footerDescription ? <p className="mt-4 text-gray-300 max-w-md">{footerDescription}</p> : null}
            </div>
          )}

          {columns.map((column: any, index: number) => {
            const links = ensureArray<any>(column.links).filter((link: any) => link?.label && resolveUrl(link));
            const visibleLinks = links.filter((link: any) => isVisibleToRole(link.visibility, role));
            if (visibleLinks.length === 0) return null;

            return (
              <div key={column.id || index}>
                {column.title ? (
                  <h3 className="text-sm font-semibold text-gray-300 tracking-wider uppercase">{column.title}</h3>
                ) : null}
                <ul className="mt-4 space-y-4">
                  {visibleLinks.map((link: any) => (
                    <li key={link.id || link.url}>{renderFooterLink(link)}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-12 pt-8 border-t border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4">
          {config.copyright ? <p className="text-gray-400 text-sm">{config.copyright}</p> : <span />}
          {hasSocialArea ? (
            <div className="flex flex-col items-center md:items-end gap-2">
              {socialLabelTitle ? (
                <p className="text-xs font-semibold tracking-widest uppercase text-gray-400">{socialLabelTitle}</p>
              ) : null}
              <div className="flex space-x-4">{socials.map(renderSocial)}</div>
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
};

export default DynamicFooter;
