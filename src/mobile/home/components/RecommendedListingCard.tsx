import React, { useMemo, useState } from 'react';
import {
  BriefcaseIcon as Briefcase,
  ChevronRightIcon as ChevronRight,
  ImageIcon,
  SparklesIcon as Sparkles,
  TagIcon as Tag
} from '../../../components/icons/ShellIcons';
import { Link } from 'react-router-dom';
import VerifiedBadge from '../../../components/common/VerifiedBadge';
import { resolveVerificationLevel } from '../../../utils/verification';
import { resolveAssetUrl } from '../../../utils/assetUrl';

type JobLike = {
  id: string;
  title?: string | null;
  category?: string | null;
  subcategory?: string | null;
  budget?: any;
  createdAt?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  clientAvatar?: string | null;
  clientIsVerified?: boolean;
  client_is_verified?: boolean;
  clientVerified?: boolean;
  clientVerificationLevel?: string | null;
  client_verification_level?: string | null;
  clientBadgeType?: string | null;
  client_badge_type?: string | null;
  clientIsPro?: boolean;
  clientType?: string | null;
  image?: string | null;
  images?: string[] | null;
};

type GigLike = {
  id: string;
  title?: string | null;
  category?: string | null;
  subcategory?: string | null;
  price?: any;
  createdAt?: string | null;
  freelancerId?: string | null;
  freelancerName?: string | null;
  freelancerAvatar?: string | null;
  freelancerIsVerified?: boolean;
  freelancer_is_verified?: boolean;
  freelancerVerified?: boolean;
  freelancerVerificationLevel?: string | null;
  freelancer_verification_level?: string | null;
  freelancerBadgeType?: string | null;
  freelancer_badge_type?: string | null;
  freelancerIsPro?: boolean;
  freelancerType?: string | null;
  image?: string | null;
  images?: string[] | null;
};

const formatMoney = (value: any) => {
  const amount =
    typeof value === 'number'
      ? value
      : typeof value?.amount === 'number'
        ? value.amount
        : typeof value?.minAmount === 'number'
          ? value.minAmount
          : typeof value?.maxAmount === 'number'
            ? value.maxAmount
            : null;
  if (amount === null) return null;
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount);
  } catch {
    return String(amount);
  }
};

const firstString = (values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const pickFirstFromList = (values: unknown): string => {
  if (!Array.isArray(values)) return '';
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const resolveListingImage = (row: any) => {
  const raw = firstString([
    row?.image,
    row?.coverImage,
    row?.cover,
    row?.thumbnailUrl,
    row?.thumbnail_url,
    row?.previewImage,
    row?.preview_image,
    pickFirstFromList(row?.images),
    pickFirstFromList(row?.media),
    row?.clientAvatar,
    row?.freelancerAvatar
  ]);
  return raw ? resolveAssetUrl(raw) : '';
};

export default function RecommendedListingCard({
  kind,
  title,
  items,
  seeAllHref,
  onContact
}: {
  kind: 'jobs' | 'gigs';
  title: string;
  items: Array<JobLike | GigLike>;
  seeAllHref?: string;
  onContact?: (payload: { kind: 'jobs' | 'gigs'; item: JobLike | GigLike }) => void;
}) {
  const icon = kind === 'jobs' ? <Briefcase className="h-4 w-4" /> : <Tag className="h-4 w-4" />;
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const getImageState = useMemo(
    () => (id: string, row: any) => {
      const imageKey = `${kind}:${id}`;
      const imageUrl = resolveListingImage(row);
      const canRenderImage = Boolean(imageUrl) && !failedImages[imageKey];
      return { imageKey, imageUrl, canRenderImage };
    },
    [kind, failedImages]
  );

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="rounded-xl bg-slate-100 p-2 text-slate-700">{icon}</span>
            <span className="break-words [overflow-wrap:anywhere]">{title}</span>
            <Sparkles className="h-4 w-4 text-amber-500" aria-label="Recommended" />
          </div>
          <div className="mt-1 text-xs text-slate-500">Picked for you based on your current mode.</div>
        </div>
        {seeAllHref ? (
          <Link
            to={seeAllHref}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            See all <ChevronRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {items.slice(0, 2).map((row) => {
          const id = String((row as any)?.id || '').trim();
          if (!id) return null;
          if (kind === 'jobs') {
            const job = row as JobLike;
            const isClientVerified = Boolean(job.clientIsVerified ?? job.client_is_verified ?? job.clientVerified);
            const clientVerificationLevel = resolveVerificationLevel({
              verificationLevel:
                job.clientVerificationLevel ||
                job.client_verification_level ||
                job.clientBadgeType ||
                job.client_badge_type,
              isVerified: isClientVerified,
              isPro: job.clientIsPro,
              type: job.clientType || 'business'
            });
            const budget = formatMoney(job.budget);
            const href = `/jobs/${encodeURIComponent(id)}`;
            const canContact = Boolean(job.clientId) && Boolean(onContact);
            const { imageKey, imageUrl, canRenderImage } = getImageState(id, job);
            return (
              <div key={id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={href}
                      className="block text-sm font-semibold leading-snug text-slate-900 break-words [overflow-wrap:anywhere] hover:underline"
                    >
                      {job.title || 'Job opportunity'}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {job.category ? <span className="rounded-full bg-slate-100 px-2 py-0.5">{job.category}</span> : null}
                      {budget ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">${budget}</span> : null}
                      {job.clientName ? <span className="break-words [overflow-wrap:anywhere]">by {job.clientName}</span> : null}
                      {clientVerificationLevel ? <VerifiedBadge size={16} level={clientVerificationLevel} className="ml-1" /> : null}
                    </div>
                  </div>
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    {job.clientAvatar ? <img src={job.clientAvatar} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                </div>
                <Link to={href} className="mt-3 block overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {canRenderImage ? (
                    <img
                      src={imageUrl}
                      alt={job.title || 'Featured job'}
                      className="h-32 w-full object-cover"
                      loading="lazy"
                      onError={() => setFailedImages((prev) => ({ ...prev, [imageKey]: true }))}
                    />
                  ) : (
                    <div className="flex h-32 w-full items-center justify-center gap-2 bg-gradient-to-br from-slate-100 via-slate-50 to-white text-slate-500">
                      <ImageIcon className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-wide">Job Image</span>
                    </div>
                  )}
                </Link>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Link
                    to={href}
                    className="rounded-full border border-slate-200 px-2 py-1 text-center text-[11px] font-semibold uppercase text-slate-700"
                  >
                    View
                  </Link>
                  <Link
                    to={`${href}?intent=apply`}
                    className="rounded-full bg-slate-900 px-2 py-1 text-center text-[11px] font-semibold uppercase text-white"
                  >
                    Apply
                  </Link>
                  <button
                    type="button"
                    disabled={!canContact}
                    onClick={() => onContact?.({ kind: 'jobs', item: job })}
                    className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold uppercase text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Contact
                  </button>
                </div>
              </div>
            );
          }

          const gig = row as GigLike;
          const isFreelancerVerified = Boolean(
            gig.freelancerIsVerified ?? gig.freelancer_is_verified ?? gig.freelancerVerified
          );
          const freelancerVerificationLevel = resolveVerificationLevel({
            verificationLevel:
              gig.freelancerVerificationLevel ||
              gig.freelancer_verification_level ||
              gig.freelancerBadgeType ||
              gig.freelancer_badge_type,
            isVerified: isFreelancerVerified,
            isPro: gig.freelancerIsPro,
            type: gig.freelancerType || 'user'
          });
          const price = formatMoney(gig.price);
          const href = `/gigs/${encodeURIComponent(id)}`;
          const canContact = Boolean(gig.freelancerId) && Boolean(onContact);
          const { imageKey, imageUrl, canRenderImage } = getImageState(id, gig);
          return (
            <div key={id} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={href}
                    className="block text-sm font-semibold leading-snug text-slate-900 break-words [overflow-wrap:anywhere] hover:underline"
                  >
                    {gig.title || 'Service offer'}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {gig.category ? <span className="rounded-full bg-slate-100 px-2 py-0.5">{gig.category}</span> : null}
                    {price ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">${price}</span> : null}
                    {gig.freelancerName ? <span className="break-words [overflow-wrap:anywhere]">by {gig.freelancerName}</span> : null}
                    {freelancerVerificationLevel ? <VerifiedBadge size={16} level={freelancerVerificationLevel} className="ml-1" /> : null}
                  </div>
                </div>
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                  {gig.freelancerAvatar ? <img src={gig.freelancerAvatar} alt="" className="h-full w-full object-cover" /> : null}
                </div>
              </div>
              <Link to={href} className="mt-3 block overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {canRenderImage ? (
                  <img
                    src={imageUrl}
                    alt={gig.title || 'Featured gig'}
                    className="h-32 w-full object-cover"
                    loading="lazy"
                    onError={() => setFailedImages((prev) => ({ ...prev, [imageKey]: true }))}
                  />
                ) : (
                  <div className="flex h-32 w-full items-center justify-center gap-2 bg-gradient-to-br from-slate-100 via-slate-50 to-white text-slate-500">
                    <ImageIcon className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wide">Gig Image</span>
                  </div>
                )}
              </Link>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Link
                  to={href}
                  className="rounded-full border border-slate-200 px-2 py-1 text-center text-[11px] font-semibold uppercase text-slate-700"
                >
                  View
                </Link>
                <Link
                  to={`${href}?intent=buy`}
                  className="rounded-full bg-slate-900 px-2 py-1 text-center text-[11px] font-semibold uppercase text-white"
                >
                  Buy
                </Link>
                <button
                  type="button"
                  disabled={!canContact}
                  onClick={() => onContact?.({ kind: 'gigs', item: gig })}
                  className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold uppercase text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Contact
                </button>
              </div>
            </div>
          );
        })}

        {!items.length ? <div className="text-sm text-slate-500">No recommendations right now.</div> : null}
      </div>
    </div>
  );
}
