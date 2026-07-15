import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  Building2,
  FileText,
  MessageSquare,
  ShoppingBag,
  Sparkles,
  Users,
  User
} from 'lucide-react';
import OptimizedImage from '../media/OptimizedImage';
import type { SearchResult } from '../../services/enterpriseSearch.types';
import { EnterpriseSearchService } from '../../services/enterpriseSearch';
import { HighlightMatch } from '../../search/highlightMatch';
import { formatSearchExplanation } from '../../services/enterpriseSearch';

const domainIcon = (type: string) => {
  switch (type) {
    case 'person':
    case 'freelancer':
      return User;
    case 'company':
    case 'page':
      return Building2;
    case 'job':
      return Briefcase;
    case 'service':
      return Sparkles;
    case 'marketplace_listing':
    case 'product':
      return ShoppingBag;
    case 'community':
    case 'group':
      return Users;
    case 'discussion':
      return MessageSquare;
    case 'post':
    default:
      return FileText;
  }
};

const domainLabel = (type: string) => {
  const map: Record<string, string> = {
    person: 'Person',
    freelancer: 'Freelancer',
    company: 'Company',
    page: 'Page',
    job: 'Job',
    service: 'Service',
    marketplace_listing: 'Marketplace',
    product: 'Product',
    community: 'Community',
    group: 'Group',
    discussion: 'Discussion',
    post: 'Post'
  };
  return map[type] || type;
};

export function EnterpriseSearchResultCard({
  item,
  query,
  onOpen
}: {
  item: SearchResult;
  query: string;
  onOpen?: (item: SearchResult) => void;
}) {
  const Icon = domainIcon(item.entityType);
  const image = item.media?.avatarUrl || item.media?.imageUrl || null;
  const explanation = formatSearchExplanation(item);
  const verified = Boolean(item.attributes?.verified);
  const price = item.attributes?.price;

  const handleClick = () => {
    onOpen?.(item);
    if (item.trackingToken && !String(item.trackingToken).startsWith('legacy:')) {
      EnterpriseSearchService.feedback({
        action: 'click',
        entityType: item.entityType,
        entityId: item.entityId,
        trackingToken: item.trackingToken,
        surface: 'search_results'
      }).catch(() => undefined);
    }
  };

  return (
    <Link
      to={item.url || '/search'}
      onClick={handleClick}
      className="group flex min-h-[9rem] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
          {image ? (
            <OptimizedImage
              src={image}
              alt=""
              width={96}
              height={96}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Icon className="h-6 w-6 text-slate-500" aria-hidden />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {domainLabel(item.entityType)}
            </span>
            {verified ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                Verified
              </span>
            ) : null}
            {price != null && Number.isFinite(Number(price)) ? (
              <span className="text-xs font-semibold text-emerald-700">${Number(price).toFixed(0)}</span>
            ) : null}
          </div>
          <h3 className="mt-2 line-clamp-2 text-base font-bold text-slate-950 group-hover:text-slate-700">
            <HighlightMatch text={item.title} query={query} />
          </h3>
          {item.subtitle || item.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-slate-500">
              <HighlightMatch text={String(item.subtitle || item.description)} query={query} />
            </p>
          ) : null}
          {explanation ? (
            <p className="mt-2 line-clamp-1 text-xs font-medium text-indigo-600/90" title={explanation}>
              Recommended because {explanation}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between pt-4 text-xs font-semibold text-slate-400">
        <span>Open result</span>
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
      </div>
    </Link>
  );
}
