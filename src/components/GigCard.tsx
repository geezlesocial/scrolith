import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock3, Heart, ShoppingCart, Sparkles, Star } from 'lucide-react';
import { useCurrency } from '../context/CurrencyContext';
import { useFavorites } from '../context/FavoritesContext';
import { useCart } from '../context/CartContext';
import { useNotification } from '../context/NotificationContext';
import { Gig } from '../types';
import ProBadge from './ProBadge';
import VerifiedBadge from './common/VerifiedBadge';
import { resolveVerificationLevel } from '../utils/verification';
import { resolveAssetUrl } from '../utils/assetUrl';

interface GigCardProps {
  gig: Gig;
}

const GigCard: React.FC<GigCardProps> = ({ gig }) => {
  const { formatPrice } = useCurrency();
  const { toggleFavorite, isFavorite } = useFavorites();
  const { addToCart, isInCart } = useCart();
  const { showNotification } = useNotification();
  const [working, setWorking] = useState(false);

  const priceValue = typeof gig.price === 'number' ? gig.price : (gig as any)?.price?.amount ?? 0;
  const imageUrl = resolveAssetUrl(gig.image || (Array.isArray(gig.images) ? gig.images[0] : '') || '');
  const freelancerAvatar = resolveAssetUrl(gig.freelancerAvatar || '');
  const isFreelancerVerified = Boolean(
    (gig as any)?.freelancerIsVerified ?? (gig as any)?.freelancer_is_verified ?? (gig as any)?.freelancerVerified
  );
  const freelancerVerificationLevel = resolveVerificationLevel({
    verificationLevel:
      (gig as any)?.freelancerVerificationLevel ||
      (gig as any)?.freelancer_verification_level ||
      (gig as any)?.freelancerBadgeType ||
      (gig as any)?.freelancer_badge_type,
    isVerified: isFreelancerVerified,
    isPro: (gig as any)?.freelancerIsPro,
    type: (gig as any)?.freelancerType || 'user'
  });
  const freelancerTrustScore = (gig as any)?.freelancerTrustScore ?? (gig as any)?.freelancer_trust_score ?? null;
  const freelancerTrustTier = (gig as any)?.freelancerTrustTier ?? (gig as any)?.freelancer_trust_tier ?? '';
  const freelancerCompletedJobs =
    (gig as any)?.freelancerCompletedJobs ?? (gig as any)?.freelancer_completed_jobs ?? null;
  const freelancerResponseTimeHours =
    (gig as any)?.freelancerResponseTimeHours ?? (gig as any)?.freelancer_response_time_hours ?? null;
  const liked = isFavorite('gig', gig.id);
  const inCart = isInCart(gig.id);
  const ratingValue = Number.isFinite(Number(gig.rating)) ? Number(gig.rating) : 0;
  const reviewCount = Number.isFinite(Number(gig.reviews)) ? Number(gig.reviews) : 0;
  const packageCount = Array.isArray(gig.packages) ? gig.packages.length : 0;

  const minimumDeliveryDays = useMemo(() => {
    if (!Array.isArray(gig.packages) || gig.packages.length === 0) return null;
    const deliveryCandidates = gig.packages
      .map((pkg) => Number(pkg?.deliveryDays ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!deliveryCandidates.length) return null;
    return Math.min(...deliveryCandidates);
  }, [gig.packages]);

  const responseLabel = useMemo(() => {
    if (typeof gig.avgResponseTime === 'string' && gig.avgResponseTime.trim()) {
      return gig.avgResponseTime.trim();
    }
    const responseHours = Number(freelancerResponseTimeHours);
    if (Number.isFinite(responseHours) && responseHours > 0) {
      if (responseHours < 1) return 'Under 1 hour';
      return `${Math.round(responseHours)}h avg response`;
    }
    return 'Fast response';
  }, [gig.avgResponseTime, freelancerResponseTimeHours]);

  const primaryBadge = gig.isFeatured
    ? 'Featured'
    : gig.isTopSelected
      ? 'Top picked'
      : gig.isRecommended
        ? 'Recommended'
        : null;
  const categoryLabel = gig.subcategory || gig.category || 'Service';
  const trustLabel = typeof freelancerTrustScore === 'number' ? `Trust ${Math.round(freelancerTrustScore)}` : null;

  const descriptionPreview = useMemo(() => {
    const cleanDescription = String(gig.description || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleanDescription || 'Professional delivery with clear communication, scoped execution, and revision support.';
  }, [gig.description]);

  const tagChips = useMemo(
    () =>
      [gig.category, gig.subcategory, ...(Array.isArray(gig.tags) ? gig.tags : [])]
        .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index)
        .slice(0, 3) as string[],
    [gig.category, gig.subcategory, gig.tags]
  );

  const deliveryLabel = minimumDeliveryDays
    ? `${minimumDeliveryDays} day${minimumDeliveryDays === 1 ? '' : 's'} delivery`
    : 'Flexible timeline';
  const offerSummary = packageCount > 1 ? `${packageCount} packages available` : 'Single-package offer';

  const handleFavorite = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (working) return;
    setWorking(true);
    try {
      await toggleFavorite('gig', gig.id);
      showNotification(
        'success',
        liked ? 'Removed' : 'Saved',
        liked ? 'Gig removed from favorites.' : 'Gig added to favorites.'
      );
    } catch (error: any) {
      showNotification('error', 'Favorites', error?.message || 'Unable to update favorites.');
    } finally {
      setWorking(false);
    }
  };

  const handleAddToCart = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (working) return;
    if (inCart) {
      showNotification('info', 'Already in cart', 'This gig is already in your cart.');
      return;
    }
    setWorking(true);
    try {
      await addToCart(gig.id, 1);
      showNotification('success', 'Added to cart', 'Gig added to your cart.');
    } catch (error: any) {
      showNotification('error', 'Cart', error?.message || 'Unable to add gig to cart.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_22px_60px_rgba(15,23,42,0.14)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-24 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_58%),linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(255,255,255,0)_100%)]" />

      <div className="absolute right-4 top-4 z-20 flex flex-col gap-2">
        <button
          onClick={handleFavorite}
          disabled={working}
          aria-pressed={liked}
          aria-label={liked ? 'Remove from favorites' : 'Save to favorites'}
          className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition duration-200 hover:scale-105 ${liked ? 'border-red-200 bg-red-50/95 text-red-500' : 'border-white/70 bg-white/90 text-slate-600 hover:bg-white'}`}
          title={liked ? 'Remove from favorites' : 'Save to favorites'}
        >
          <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
        </button>
        <button
          onClick={handleAddToCart}
          disabled={working}
          aria-label={inCart ? 'Gig already in cart' : 'Add gig to cart'}
          className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition duration-200 hover:scale-105 ${inCart ? 'border-blue-200 bg-blue-50/95 text-blue-600' : 'border-white/70 bg-white/90 text-slate-600 hover:bg-white'}`}
          title={inCart ? 'In cart' : 'Add to cart'}
        >
          <ShoppingCart className="h-4 w-4" />
        </button>
      </div>

      <Link to={`/gigs/${gig.id}`} className="flex h-full flex-col">
        <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={gig.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_60%),linear-gradient(135deg,_#e2e8f0_0%,_#f8fafc_100%)] px-6 text-center text-slate-500">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/80 bg-white/80 shadow-sm">
                <Sparkles className="h-6 w-6 text-slate-700" />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-800">{categoryLabel}</p>
              <p className="mt-1 text-xs text-slate-500">Professional service listing</p>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/20 to-transparent" />
          <div className="absolute left-4 right-16 top-4 z-10 flex flex-wrap gap-2">
            <span className="inline-flex max-w-full items-center rounded-full border border-white/20 bg-slate-950/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md">
              <span className="truncate">{categoryLabel}</span>
            </span>
            {primaryBadge ? (
              <span className="inline-flex items-center rounded-full border border-white/35 bg-white/18 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md">
                {primaryBadge}
              </span>
            ) : null}
          </div>
          <div className="absolute inset-x-0 bottom-0 z-10 p-4">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">Starting at</p>
                <p className="mt-1 truncate text-2xl font-bold tracking-tight text-white">{formatPrice(priceValue)}</p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-slate-950/55 px-3 py-2 text-xs font-semibold text-white backdrop-blur-md">
                <Clock3 className="h-3.5 w-3.5 text-white/80" />
                <span>{deliveryLabel}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col p-5 sm:p-6">
          <div className="flex items-start gap-3">
            {freelancerAvatar ? (
              <img src={freelancerAvatar} alt={gig.freelancerName} className="h-10 w-10 flex-shrink-0 rounded-full object-cover ring-2 ring-slate-100" />
            ) : (
              <div className="h-10 w-10 flex-shrink-0 rounded-full bg-slate-200 ring-2 ring-slate-100" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-slate-900">{gig.freelancerName}</span>
                {freelancerVerificationLevel ? (
                  <VerifiedBadge
                    size={16}
                    level={freelancerVerificationLevel}
                    className="shrink-0"
                    subjectRole="freelancer"
                    subjectType={(gig as any)?.freelancerType || 'user'}
                  />
                ) : null}
                <ProBadge role="freelancer" isPro={(gig as any)?.freelancerIsPro} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="font-medium text-slate-600">{responseLabel}</span>
                {freelancerTrustTier ? <span className="capitalize">{freelancerTrustTier}</span> : null}
                {typeof freelancerCompletedJobs === 'number' && freelancerCompletedJobs > 0 ? (
                  <span>{freelancerCompletedJobs} completed</span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <h3 className="line-clamp-2 text-base font-semibold leading-7 text-slate-900 transition-colors group-hover:text-blue-700 sm:text-lg">
              {gig.title}
            </h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{descriptionPreview}</p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">
              <Star className="mr-1 h-3.5 w-3.5 fill-current" />
              {ratingValue.toFixed(1)} <span className="ml-1 font-medium text-amber-700/80">({reviewCount})</span>
            </span>
            {trustLabel ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                {trustLabel}
              </span>
            ) : null}
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600">
              {offerSummary}
            </span>
          </div>

          {tagChips.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {tagChips.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-auto pt-5">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 transition group-hover:border-slate-300 group-hover:bg-white">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {packageCount > 1 ? 'Packages from' : 'Offer ready'}
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-900">{formatPrice(priceValue)}</p>
              </div>
              <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
                View gig
                <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default GigCard;
