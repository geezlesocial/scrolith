import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Building2,
  CalendarDays,
  Megaphone,
  ShoppingBag,
  Sparkles,
  Users
} from 'lucide-react';
import OptimizedImage from '../media/OptimizedImage';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { resolveUserAvatarUrl } from '../../utils/userAvatar';
import type { FeedStreamEntry } from '../../utils/feedStream';
import FollowButton from '../../community/components/FollowButton';

type FeedMixedCardProps = {
  entry: FeedStreamEntry;
  compact?: boolean;
  className?: string;
};

const money = (value: any) => {
  const amount =
    typeof value === 'number'
      ? value
      : typeof value?.amount === 'number'
        ? value.amount
        : typeof value?.minAmount === 'number'
          ? value.minAmount
          : Number(value) || null;
  if (amount == null || !Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
      amount
    );
  } catch {
    return `$${amount}`;
  }
};

/**
 * Phase 21.0.1 — Heterogeneous feed cards.
 * Renders orchestrator non-post types only. No ranking.
 */
const FeedMixedCard: React.FC<FeedMixedCardProps> = ({ entry, compact = false, className = '' }) => {
  const data = entry?.data || {};
  const why = String(entry?.raw?.why || data?.why || data?.whyRecommended || '').trim();

  const card = useMemo(() => {
    switch (entry.kind) {
      case 'job': {
        const title = String(data.title || 'Open role').trim();
        const href = data.id ? `/jobs/${encodeURIComponent(String(data.id))}` : '/jobs';
        const budget = money(data.budget || data.salary);
        const company = String(data.clientName || data.companyName || data.author?.displayName || 'Employer').trim();
        const logo = resolveAssetUrl(data.clientAvatar || data.image || data.logo || '') || null;
        return {
          eyebrow: 'Job opportunity',
          title,
          subtitle: [company, data.category, budget].filter(Boolean).join(' · '),
          href,
          icon: <Briefcase className="h-4 w-4" />,
          media: logo,
          cta: 'View job'
        };
      }
      case 'gig': {
        const title = String(data.title || 'Service').trim();
        const href = data.id ? `/gigs/${encodeURIComponent(String(data.id))}` : '/gigs';
        const price = money(data.price || data.budget);
        const seller = String(data.freelancerName || data.author?.displayName || 'Freelancer').trim();
        const media = resolveAssetUrl(data.image || (Array.isArray(data.images) ? data.images[0] : '') || '') || null;
        return {
          eyebrow: 'Freelance service',
          title,
          subtitle: [seller, data.category, price].filter(Boolean).join(' · '),
          href,
          icon: <Sparkles className="h-4 w-4" />,
          media,
          cta: 'View service'
        };
      }
      case 'marketplace': {
        const title = String(data.title || data.name || 'Listing').trim();
        const href = data.id ? `/marketplace/${encodeURIComponent(String(data.id))}` : '/marketplace';
        const price = money(data.price || data.amount);
        const media =
          resolveAssetUrl(data.image || data.thumbnail || (Array.isArray(data.images) ? data.images[0] : '') || '') ||
          null;
        return {
          eyebrow: 'Marketplace',
          title,
          subtitle: [data.category, price].filter(Boolean).join(' · '),
          href,
          icon: <ShoppingBag className="h-4 w-4" />,
          media,
          cta: 'View listing'
        };
      }
      case 'person': {
        const name = String(data.name || data.displayName || data.account?.name || 'Professional').trim();
        const username = String(data.username || data.account?.username || '').replace(/^@/, '');
        const href = username ? `/u/${encodeURIComponent(username)}` : data.id ? `/profile/${encodeURIComponent(String(data.id))}` : '/home';
        const avatar = resolveUserAvatarUrl(data) || resolveAssetUrl(data.avatarUrl || data.avatar || '') || null;
        return {
          eyebrow: 'Suggested professional',
          title: name,
          subtitle: username ? `@${username}` : String(data.headline || data.industry || 'Grow your network'),
          href,
          icon: <Users className="h-4 w-4" />,
          media: avatar,
          cta: 'View profile',
          followId: String(data.id || data.account?.id || ''),
          followType: 'user' as const
        };
      }
      case 'page': {
        const name = String(data.name || data.displayName || 'Page').trim();
        const slug = String(data.slug || data.handle || data.username || '').trim();
        const href = slug ? `/company/${encodeURIComponent(slug)}` : '/home';
        const logo = resolveAssetUrl(data.logoUrl || data.logo || data.avatarUrl || '') || null;
        return {
          eyebrow: 'Suggested page',
          title: name,
          subtitle: String(data.industry || data.category || 'Company page'),
          href,
          icon: <Building2 className="h-4 w-4" />,
          media: logo,
          cta: 'View page',
          followId: String(data.id || ''),
          followType: 'page' as const
        };
      }
      case 'community': {
        const name = String(data.name || data.title || 'Community').trim();
        const slug = String(data.slug || data.id || '').trim();
        const href = slug ? `/community/groups/${encodeURIComponent(slug)}` : '/community';
        const media = resolveAssetUrl(data.avatarUrl || data.coverUrl || data.image || '') || null;
        return {
          eyebrow: 'Community',
          title: name,
          subtitle: String(data.description || data.memberCount ? `${data.memberCount || ''} members` : 'Join the conversation'),
          href,
          icon: <Users className="h-4 w-4" />,
          media,
          cta: 'Explore'
        };
      }
      case 'ad': {
        const title = String(data.title || 'Sponsored').trim();
        const href = String(data.destinationUrl || data.destination_url || data.url || '/').trim() || '/';
        const media = resolveAssetUrl(data.mediaUrl || data.image || '') || null;
        return {
          eyebrow: 'Sponsored',
          title,
          subtitle: String(data.body || data.description || 'Promoted opportunity').slice(0, 140),
          href,
          icon: <Megaphone className="h-4 w-4" />,
          media,
          cta: 'Learn more',
          external: href.startsWith('http')
        };
      }
      case 'event': {
        const title = String(data.title || data.name || 'Event').trim();
        const href = data.id ? `/community/events/${encodeURIComponent(String(data.id))}` : '/community';
        return {
          eyebrow: 'Event',
          title,
          subtitle: String(data.startsAt || data.startAt || data.location || 'Upcoming'),
          href,
          icon: <CalendarDays className="h-4 w-4" />,
          media: resolveAssetUrl(data.coverUrl || data.image || '') || null,
          cta: 'View event'
        };
      }
      case 'story':
      case 'scroll':
      case 'featured':
      case 'trending':
      default: {
        const title = String(data.title || data.name || data.content || 'Recommended for you').trim().slice(0, 120);
        return {
          eyebrow: entry.kind === 'unknown' ? 'For you' : entry.kind,
          title: title || 'Discover more on Scrolith',
          subtitle: why || 'Curated for your professional graph',
          href: '/home',
          icon: <Sparkles className="h-4 w-4" />,
          media: null,
          cta: 'Open'
        };
      }
    }
  }, [entry.kind, data, why]);

  if (!card) return null;

  const body = (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md ${
        compact ? 'p-3' : 'p-4'
      } ${className}`}
      data-testid="feed-mixed-card"
      data-feed-kind={entry.kind}
      data-phase="21.0.1"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-600">
          {card.media ? (
            <OptimizedImage
              src={card.media}
              alt=""
              className="h-full w-full object-cover"
              width={40}
              height={40}
              loading="lazy"
            />
          ) : (
            card.icon
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{card.eyebrow}</div>
          <div className="mt-0.5 text-sm font-semibold text-slate-900 line-clamp-2">{card.title}</div>
          {card.subtitle ? <div className="mt-0.5 text-xs text-slate-600 line-clamp-2">{card.subtitle}</div> : null}
          {why && entry.kind !== 'ad' ? (
            <div className="mt-1.5 text-[11px] font-medium text-indigo-600/90 line-clamp-2">{why}</div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-blue-700">{card.cta}</span>
            {card.followId && card.followType ? (
              <span
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <FollowButton targetType={card.followType} targetUserId={card.followId} />
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  if (card.external) {
    return (
      <a href={card.href} target="_blank" rel="noopener noreferrer" className="block">
        {body}
      </a>
    );
  }

  return (
    <Link to={card.href} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400">
      {body}
    </Link>
  );
};

export default React.memo(FeedMixedCard);
