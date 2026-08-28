import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Building2,
  CalendarDays,
  MapPin,
  Megaphone,
  ShoppingBag,
  Sparkles,
  Tag,
  Users
} from 'lucide-react';
import type { FeedStreamEntry } from '../../utils/feedStream';
import FollowButton from '../../community/components/FollowButton';
import EnterpriseAvatar from '../common/EnterpriseAvatar';
import EnterpriseImage from '../common/EnterpriseImage';
import ScrollVideoPreview from './ScrollVideoPreview';
import { useUser } from '../../context/UserContext';
import {
  SafeDate,
  SafeLocation,
  SafePrice,
  SafeText,
  resolveListingMediaCandidates,
  safeJoin
} from '../../utils/safeRender';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { resolvePostAttachmentMediaUrl } from '../../utils/postAttachmentMedia';
import { resolveUserAvatarUrl } from '../../utils/userAvatar';
import {
  buildScrollVideoUrl,
  normalizeScrollVideoRecommendation,
  type ScrollVideoRecommendationTarget
} from '../../utils/scrollVideoRoutes';
import { resolveVideoRecommendationScrollSource } from '../../utils/feedVideoScrollDestination';
import {
  buildPostVideoScrollViewerPath,
  stashPendingPostVideoScrollViewerSource,
  type PendingPostVideoScrollViewerSource
} from '../../utils/postVideoScrollBridge';
import {
  trackScrollPreviewAttempt,
  trackScrollPreviewBlocked,
  trackScrollPreviewStarted,
  trackScrollRecommendationClick
} from '../../utils/scrollRecommendationAnalytics';

type FeedMixedCardProps = {
  entry: FeedStreamEntry;
  compact?: boolean;
  className?: string;
  sourceSurface?: string;
  sourcePosition?: number;
};

type CardModel = {
  kind: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  meta: string[];
  href: string;
  cta: string;
  mediaCandidates: string[];
  mediaPlaceholder: 'marketplace' | 'job' | 'generic' | 'avatar';
  avatarUser?: any;
  priceLabel?: string;
  external?: boolean;
  followId?: string;
  followType?: 'user' | 'page';
  badge?: string;
  /** Phase 22.1B */
  scrollTarget?: ScrollVideoRecommendationTarget | null;
  postVideoSource?: PendingPostVideoScrollViewerSource | null;
  disabledNav?: boolean;
  creatorHref?: string;
};

const resolveMediaUrl = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') {
    return resolvePostAttachmentMediaUrl(value) || resolveAssetUrl(value) || value;
  }
  if (typeof value === 'object') {
    return (
      resolvePostAttachmentMediaUrl(value) ||
      resolveAssetUrl((value as any).url || (value as any).src || '') ||
      ''
    );
  }
  return '';
};

/**
 * Phase 21.1.1 — Heterogeneous feed cards with safe rendering + media/avatar polish.
 * No ranking. Orchestrator order only.
 */
const FeedMixedCard: React.FC<FeedMixedCardProps> = ({
  entry,
  compact = false,
  className = '',
  sourceSurface = 'member_home',
  sourcePosition
}) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const data = entry?.data || {};
  const why = SafeText(entry?.raw?.why || data?.why || data?.whyRecommended || '');

  const card: CardModel | null = useMemo(() => {
    switch (entry.kind) {
      case 'scroll': {
        const target = normalizeScrollVideoRecommendation(entry);
        const title = SafeText(
          target?.title || data.title || data.description || data.name,
          'Scroll video'
        );
        const creatorName = SafeText(
          target?.creatorName || data.author?.displayName || data.author?.name,
          'Creator'
        );
        const creatorUsername = SafeText(
          target?.creatorUsername || data.author?.username
        ).replace(/^@/, '');
        const creatorHref = creatorUsername
          ? `/u/${encodeURIComponent(creatorUsername)}`
          : target?.creatorId
            ? `/profile/${encodeURIComponent(target.creatorId)}`
            : '';
        const href = target?.scrollVideoId
          ? buildScrollVideoUrl(target.scrollVideoId)
          : '';
        const mediaCandidates = [
          resolveMediaUrl(target?.thumbnailUrl),
          resolveMediaUrl(target?.mediaUrl),
          resolveMediaUrl(data.media),
          resolveMediaUrl(entry?.raw?.media),
          resolveUserAvatarUrl(data.author)
        ].filter(Boolean);
        return {
          kind: 'scroll',
          eyebrow: 'Scroll video',
          title,
          subtitle: creatorUsername ? `@${creatorUsername}` : creatorName,
          meta: [SafeDate(data.createdAt)].filter(Boolean) as string[],
          href: href || '#',
          cta: 'Open',
          mediaCandidates,
          mediaPlaceholder: 'generic' as const,
          avatarUser: data.author || { name: creatorName },
          scrollTarget: target,
          disabledNav: !target?.scrollVideoId,
          creatorHref: creatorHref || undefined,
          badge: 'Video'
        };
      }
      case 'job': {
        const title = SafeText(data.title, 'Open role');
        const href = data.id ? `/jobs/${encodeURIComponent(String(data.id))}` : '/jobs';
        const budget = SafePrice(data.budget || data.salary || data.compensation, {
          currency: data.currency
        });
        const company = SafeText(
          data.clientName || data.companyName || data.author?.displayName || data.employer?.name,
          'Employer'
        );
        const category = SafeText(data.category || data.subcategory);
        const location = SafeLocation(data.location || data.city || data.region);
        const mediaCandidates = [
          resolveMediaUrl(data.clientAvatar),
          resolveMediaUrl(data.image),
          resolveMediaUrl(data.logo),
          resolveUserAvatarUrl(data.client || data.employer || data.author)
        ].filter(Boolean);
        return {
          kind: 'job',
          eyebrow: 'Job opportunity',
          title,
          subtitle: safeJoin([company, category, budget]),
          meta: [location, SafeDate(data.createdAt || data.postedAt)].filter(Boolean) as string[],
          href,
          cta: 'View job',
          mediaCandidates,
          mediaPlaceholder: 'job' as const,
          avatarUser: data.client || data.employer || { name: company },
          priceLabel: budget || undefined,
          badge: SafeText(data.employmentType || data.type)
        };
      }
      case 'gig': {
        const title = SafeText(data.title, 'Service');
        const href = data.id ? `/gigs/${encodeURIComponent(String(data.id))}` : '/gigs';
        const price = SafePrice(data.price || data.budget, { currency: data.currency });
        const seller = SafeText(
          data.freelancerName || data.author?.displayName || data.seller?.name,
          'Freelancer'
        );
        const category = SafeText(data.category || data.subcategory);
        const mediaCandidates = [
          ...resolveListingMediaCandidates(data).map(resolveMediaUrl),
          resolveUserAvatarUrl({
            avatarUrl: data.freelancerAvatar,
            profilePhotoFileId: data.freelancerProfilePhotoFileId
          })
        ].filter(Boolean);
        return {
          kind: 'gig',
          eyebrow: 'Freelance service',
          title,
          subtitle: safeJoin([seller, category, price]),
          meta: [SafeDate(data.createdAt)].filter(Boolean) as string[],
          href,
          cta: 'View service',
          mediaCandidates,
          mediaPlaceholder: 'marketplace' as const,
          avatarUser: {
            name: seller,
            avatarUrl: data.freelancerAvatar,
            profilePhotoFileId: data.freelancerProfilePhotoFileId
          },
          priceLabel: price || undefined
        };
      }
      case 'marketplace': {
        const title = SafeText(data.title || data.name, 'Listing');
        const slugOrId = SafeText(
          data.slug ||
            data.listingSlug ||
            data.listing_slug ||
            data.listingId ||
            data.listing_id ||
            data.id ||
            data._id
        );
        const href = slugOrId ? `/marketplace/listing/${encodeURIComponent(slugOrId)}` : '/marketplace';
        const price = SafePrice(data.price || data.amount || data.pricing, {
          currency: data.currency || data.price?.currency
        });
        const category = SafeText(data.category || data.categoryName || data.category?.name);
        const condition = SafeText(data.condition || data.itemCondition);
        const location = SafeLocation(data.location || data.city || data.region || data.seller?.location);
        const seller = SafeText(
          data.sellerName || data.seller?.name || data.seller?.displayName || data.author?.displayName,
          'Seller'
        );
        const availability = SafeText(data.availability || data.status || data.stockStatus);
        const mediaCandidates = resolveListingMediaCandidates(data)
          .map(resolveMediaUrl)
          .filter(Boolean);
        return {
          kind: 'marketplace',
          eyebrow: 'Marketplace',
          title,
          subtitle: safeJoin([price, category, condition]),
          meta: [location, seller, availability, SafeDate(data.createdAt || data.postedAt)].filter(
            Boolean
          ) as string[],
          href,
          cta: 'View listing',
          mediaCandidates,
          mediaPlaceholder: 'marketplace' as const,
          avatarUser: data.seller || { name: seller, avatarUrl: data.sellerAvatar },
          priceLabel: price || undefined,
          badge: condition || undefined
        };
      }
      case 'person': {
        const name = SafeText(
          data.name || data.displayName || data.account?.name,
          'Professional'
        );
        const username = SafeText(data.username || data.account?.username).replace(/^@/, '');
        const href = username
          ? `/u/${encodeURIComponent(username)}`
          : data.id
            ? `/profile/${encodeURIComponent(String(data.id))}`
            : '/home';
        const headline = SafeText(data.headline || data.industry || data.account?.industry, 'Grow your network');
        return {
          kind: 'person',
          eyebrow: 'Suggested professional',
          title: name,
          subtitle: username ? `@${username}` : headline,
          meta: [SafeText(data.location), SafeText(data.role)].filter(Boolean) as string[],
          href,
          cta: 'View profile',
          mediaCandidates: [resolveUserAvatarUrl(data), resolveUserAvatarUrl(data.account)].filter(
            Boolean
          ) as string[],
          mediaPlaceholder: 'avatar' as const,
          avatarUser: data.account || data,
          followId: SafeText(data.id || data.account?.id),
          followType: 'user' as const
        };
      }
      case 'page': {
        const name = SafeText(data.name || data.displayName, 'Page');
        const slug = SafeText(data.slug || data.handle || data.username);
        const href = slug ? `/company/${encodeURIComponent(slug)}` : '/home';
        return {
          kind: 'page',
          eyebrow: 'Suggested page',
          title: name,
          subtitle: SafeText(data.industry || data.category, 'Company page'),
          meta: [SafeLocation(data.location)].filter(Boolean) as string[],
          href,
          cta: 'View page',
          mediaCandidates: [
            resolveMediaUrl(data.logoUrl || data.logo || data.avatarUrl),
            resolveUserAvatarUrl(data)
          ].filter(Boolean) as string[],
          mediaPlaceholder: 'avatar' as const,
          avatarUser: data,
          followId: SafeText(data.id),
          followType: 'page' as const
        };
      }
      case 'community': {
        const name = SafeText(data.name || data.title, 'Community');
        const slug = SafeText(data.slug || data.id);
        const href = slug ? `/community/groups/${encodeURIComponent(slug)}` : '/community';
        const members = SafeText(data.memberCount || data.membersCount);
        const description = SafeText(data.description);
        return {
          kind: 'community',
          eyebrow: 'Community',
          title: name,
          subtitle: description || (members ? `${members} members` : 'Join the conversation'),
          meta: [members ? `${members} members` : ''].filter(Boolean) as string[],
          href,
          cta: 'Explore',
          mediaCandidates: [
            resolveMediaUrl(data.avatarUrl || data.coverUrl || data.image || data.logo)
          ].filter(Boolean) as string[],
          mediaPlaceholder: 'generic' as const,
          avatarUser: { name }
        };
      }
      case 'ad': {
        const title = SafeText(data.title, 'Sponsored');
        const href = SafeText(data.destinationUrl || data.destination_url || data.url, '/');
        return {
          kind: 'ad',
          eyebrow: 'Sponsored',
          title,
          subtitle: SafeText(data.body || data.description, 'Promoted opportunity').slice(0, 140),
          meta: [],
          href,
          cta: 'Learn more',
          mediaCandidates: [resolveMediaUrl(data.mediaUrl || data.image || data.creativeUrl)].filter(
            Boolean
          ) as string[],
          mediaPlaceholder: 'generic' as const,
          external: href.startsWith('http')
        };
      }
      case 'event': {
        const title = SafeText(data.title || data.name, 'Event');
        const href = data.id
          ? `/community/events/${encodeURIComponent(String(data.id))}`
          : '/community';
        return {
          kind: 'event',
          eyebrow: 'Event',
          title,
          subtitle: safeJoin([
            SafeDate(data.startsAt || data.startAt || data.startTime),
            SafeLocation(data.location)
          ]),
          meta: [SafeText(data.type)].filter(Boolean) as string[],
          href,
          cta: 'View event',
          mediaCandidates: [resolveMediaUrl(data.coverUrl || data.image)].filter(Boolean) as string[],
          mediaPlaceholder: 'generic' as const
        };
      }
      case 'story': {
        const title = SafeText(
          data.title || data.name || data.content || data.text || data.caption,
          'Recommended for you'
        ).slice(0, 120);
        const storyId = String(data.id || data.sourceId || entry.raw?.sourceId || '').trim();
        const baseHref = /community/i.test(sourceSurface) ? '/community' : '/member-home';
        const search = new URLSearchParams({ tab: 'stories' });
        if (storyId) search.set('story', storyId);
        return {
          kind: 'story',
          eyebrow: 'Story',
          title,
          subtitle: SafeText(data.subtitle || data.description || data.status, 'Active story'),
          meta: ['Active story'],
          href: `${baseHref}?${search.toString()}#stories`,
          cta: 'Open',
          mediaCandidates: [resolveMediaUrl(data.media || data.mediaUrl || data.image || data.thumbnailUrl)].filter(
            Boolean
          ) as string[],
          mediaPlaceholder: 'generic' as const
        };
      }
      default: {
        // Phase 22.1B — never send Scroll-like unknowns to /home; use safe discovery sinks.
        const title = SafeText(data.title || data.name || data.content, 'Recommended for you').slice(
          0,
          120
        );
        const kind = entry.kind || 'unknown';
        const postVideoSource = resolveVideoRecommendationScrollSource(entry);
        const safeHref = postVideoSource ? buildPostVideoScrollViewerPath(postVideoSource) : '/member-home';
        return {
          kind,
          eyebrow: kind === 'unknown' ? 'For you' : SafeText(kind, 'For you'),
          title: title || 'Discover more on Scrolith',
          subtitle: why || 'Curated for your professional graph',
          meta: [],
          href: safeHref,
          cta: postVideoSource ? 'Open in Scroll' : 'Open',
          mediaCandidates: [postVideoSource?.thumbnailUrl].filter(Boolean) as string[],
          mediaPlaceholder: 'generic' as const,
          postVideoSource,
          badge: postVideoSource ? 'Video' : undefined
        };
      }
    }
  }, [entry, data, sourceSurface, why]);

  if (!card) return null;

  const isMarketplaceLike = card.kind === 'marketplace' || card.kind === 'gig';
  const isScroll = card.kind === 'scroll';
  const isPostVideoScroll = Boolean(card.postVideoSource);
  const showHero =
    isMarketplaceLike ||
    card.kind === 'job' ||
    card.kind === 'event' ||
    card.kind === 'ad' ||
    Boolean(card.postVideoSource && card.mediaCandidates.length);
  const scrollTarget = card.scrollTarget;
  const stashPostVideoSource = () => {
    if (!card.postVideoSource) return;
    stashPendingPostVideoScrollViewerSource(card.postVideoSource);
  };

  const emitScrollClick = () => {
    if (!scrollTarget?.scrollVideoId) return;
    trackScrollRecommendationClick({
      recommendationId: scrollTarget.recommendationId,
      scrollVideoId: scrollTarget.scrollVideoId,
      sourceSurface,
      sourcePosition: sourcePosition ?? null,
      destination: '/scroll'
    });
  };

  const body = (
    <article
      className={`overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md ${className}`}
      data-testid="feed-mixed-card"
      data-feed-kind={card.kind}
      data-phase={isScroll ? '22.1B' : '21.1.1'}
      data-scroll-video-id={scrollTarget?.scrollVideoId || undefined}
      data-scroll-href={isScroll || isPostVideoScroll ? card.href : undefined}
    >
      {isScroll ? (
        <ScrollVideoPreview
          src={scrollTarget?.previewUrl || scrollTarget?.mediaUrl}
          poster={scrollTarget?.thumbnailUrl || card.mediaCandidates[0]}
          title={card.title}
          onPreviewStarted={() => {
            trackScrollPreviewAttempt(sourceSurface);
            trackScrollPreviewStarted(sourceSurface, scrollTarget?.scrollVideoId);
          }}
          onPreviewBlocked={() => trackScrollPreviewBlocked(sourceSurface)}
        />
      ) : showHero ? (
        <EnterpriseImage
          candidates={card.mediaCandidates}
          alt={card.title}
          width={compact ? 640 : 720}
          height={compact ? 280 : 320}
          aspectRatio="16 / 9"
          rounded="rounded-none"
          className="w-full"
          placeholder={card.mediaPlaceholder}
        />
      ) : null}

      <div className={compact ? 'p-3' : 'p-4'}>
        <div className="flex items-start gap-3">
          {!showHero ? (
            card.avatarUser || card.mediaCandidates[0] ? (
              <EnterpriseAvatar
                user={card.avatarUser}
                src={card.mediaCandidates[0]}
                name={card.title}
                size={compact ? 'sm' : 'md'}
                rounded={card.kind === 'page' || card.kind === 'community' ? 'xl' : 'full'}
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                {card.kind === 'job' ? (
                  <Briefcase className="h-4 w-4" />
                ) : card.kind === 'page' ? (
                  <Building2 className="h-4 w-4" />
                ) : card.kind === 'community' ? (
                  <Users className="h-4 w-4" />
                ) : card.kind === 'ad' ? (
                  <Megaphone className="h-4 w-4" />
                ) : card.kind === 'event' ? (
                  <CalendarDays className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </div>
            )
          ) : card.avatarUser ? (
            <EnterpriseAvatar user={card.avatarUser} size="sm" className="mt-0.5" />
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {card.eyebrow}
              </span>
              {card.badge ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  <Tag className="h-3 w-3" />
                  {card.badge}
                </span>
              ) : null}
            </div>

            <h3 className="mt-0.5 text-[15px] font-semibold leading-snug text-slate-900 line-clamp-2">
              {card.title}
            </h3>

            {card.priceLabel ? (
              <div className="mt-1 text-sm font-semibold text-emerald-700">{card.priceLabel}</div>
            ) : null}

            {card.subtitle ? (
              card.creatorHref ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    navigate(card.creatorHref!);
                  }}
                  className="mt-0.5 block max-w-full truncate text-left text-xs leading-relaxed text-slate-600 hover:text-indigo-600"
                  data-testid="feed-mixed-card-creator"
                >
                  {card.subtitle}
                </button>
              ) : (
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600 line-clamp-2">{card.subtitle}</p>
              )
            ) : null}

            {card.meta.length ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                {card.meta.map((item) => (
                  <span key={item} className="inline-flex items-center gap-1">
                    {/city|location|,/i.test(item) ? <MapPin className="h-3 w-3" /> : null}
                    {item}
                  </span>
                ))}
              </div>
            ) : null}

            {why && card.kind !== 'ad' ? (
              <p className="mt-1.5 text-[11px] font-medium text-indigo-600/90 line-clamp-2">{why}</p>
            ) : null}

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {/* CTA must be a real control — never nested inside a parent Link with Follow. */}
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (card.disabledNav || !card.href || card.href === '#') return;
                  if (isScroll) emitScrollClick();
                  if (isPostVideoScroll) stashPostVideoSource();
                  if (card.external) {
                    window.open(card.href, '_blank', 'noopener,noreferrer');
                    return;
                  }
                  navigate(
                    card.href,
                    isPostVideoScroll && card.postVideoSource
                      ? { state: { pendingViewerSource: card.postVideoSource } }
                      : undefined
                  );
                }}
                className="inline-flex min-h-[36px] items-center rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
                data-testid="feed-mixed-card-cta"
              >
                {card.cta}
              </button>
              {card.followId && card.followType ? (
                <div
                  className="inline-flex"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  data-testid="feed-mixed-card-follow"
                >
                  <FollowButton
                    targetType={card.followType}
                    targetUserId={card.followId}
                    currentUserId={user?.id}
                    initialIsFollowing={Boolean(
                      data?.isFollowing ??
                        data?.viewer?.isFollowing ??
                        data?.account?.isFollowing
                    )}
                    onRequireLogin={() => navigate('/auth/login')}
                    className="min-h-[36px] rounded-full border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 shadow-none hover:bg-slate-50"
                  />
                </div>
              ) : null}
              {isMarketplaceLike ? (
                <>
                  <span className="text-[11px] font-medium text-slate-400">Save</span>
                  <span className="text-[11px] font-medium text-slate-400">Share</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </article>
  );

  // Cards with Follow must NOT be wrapped in <Link>/<a> — nested interactive
  // controls inside links cause full navigation / "page reload" on mobile WebView.
  const hasFollowAction = Boolean(card.followId && card.followType);
  const interactiveShell = hasFollowAction || card.kind === 'person' || card.kind === 'page';

  if (card.disabledNav || !card.href || card.href === '#') {
    return (
      <div
        className="block opacity-95"
        data-testid="feed-mixed-card-disabled-nav"
        aria-disabled="true"
      >
        {body}
        {isScroll ? (
          <p className="px-4 pb-3 text-[11px] text-amber-700">
            This Scroll video is unavailable right now.
          </p>
        ) : null}
      </div>
    );
  }

  if (interactiveShell) {
    return (
      <div
        className="block focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-slate-400"
        data-testid="feed-mixed-card-interactive"
        data-feed-kind={card.kind}
      >
        {body}
      </div>
    );
  }

  if (card.external) {
    return (
      <a
        href={card.href}
        target="_blank"
        rel="noopener noreferrer"
        className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
      >
        {body}
      </a>
    );
  }

  return (
    <Link
      to={card.href}
      state={
        isPostVideoScroll && card.postVideoSource
          ? { pendingViewerSource: card.postVideoSource }
          : undefined
      }
      onClick={() => {
        if (isScroll) emitScrollClick();
        if (isPostVideoScroll) stashPostVideoSource();
      }}
      className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
      data-testid={isScroll || isPostVideoScroll ? 'feed-mixed-card-scroll-link' : undefined}
    >
      {body}
    </Link>
  );
};

export default React.memo(FeedMixedCard);
