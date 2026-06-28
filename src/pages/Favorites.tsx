import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Heart, MapPin, ShoppingBag } from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';
import {
  FAVORITES_RATE_LIMIT_MESSAGE,
  FavoritesService,
  isFavoritesRateLimitedError
} from '../services/favorites';
import { useCurrency } from '../context/CurrencyContext';
import GigCard from '../components/GigCard';
import ProBadge from '../components/ProBadge';

type FavoriteTab = 'marketplace' | 'gigs' | 'jobs';

const Favorites = () => {
  const { toggleFavorite, favorites } = useFavorites();
  const { formatPrice } = useCurrency();
  const [activeTab, setActiveTab] = useState<FavoriteTab>('marketplace');
  const [marketplaceListings, setMarketplaceListings] = useState<any[]>([]);
  const [gigs, setGigs] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFavorites = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await FavoritesService.getExpanded();
      setMarketplaceListings(Array.isArray(data.marketplace) ? data.marketplace : []);
      setGigs(Array.isArray(data.gigs) ? data.gigs : []);
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (err: any) {
      setError(isFavoritesRateLimitedError(err) ? FAVORITES_RATE_LIMIT_MESSAGE : err?.message || 'Failed to load favorites.');
      setMarketplaceListings([]);
      setGigs([]);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFavorites();
  }, []);

  useEffect(() => {
    if (!favorites.length) {
      setMarketplaceListings([]);
      setGigs([]);
      setJobs([]);
      return;
    }
    setMarketplaceListings((prev) => prev.filter((listing) => favorites.some((fav) => fav.entityType === 'marketplace' && fav.entityId === listing.id)));
    setGigs((prev) => prev.filter((gig) => favorites.some((fav) => fav.entityType === 'gig' && fav.entityId === gig.id)));
    setJobs((prev) => prev.filter((job) => favorites.some((fav) => fav.entityType === 'job' && fav.entityId === job.id)));
  }, [favorites]);

  const counts = useMemo(
    () => ({
      marketplace: marketplaceListings.length,
      gigs: gigs.length,
      jobs: jobs.length
    }),
    [gigs.length, jobs.length, marketplaceListings.length]
  );

  const removeFavorite = async (entityType: 'marketplace' | 'gig' | 'job', entityId: string) => {
    setError(null);
    try {
      await toggleFavorite(entityType, entityId);
      if (entityType === 'marketplace') {
        setMarketplaceListings((prev) => prev.filter((listing) => listing.id !== entityId));
      } else if (entityType === 'gig') {
        setGigs((prev) => prev.filter((gig) => gig.id !== entityId));
      } else {
        setJobs((prev) => prev.filter((job) => job.id !== entityId));
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update favorites.');
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fbff_0%,#f4f1ea_42%,#eef2ff_100%)] px-4 pb-14 pt-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-rose-700">
                <Heart className="h-3.5 w-3.5 fill-current" />
                Favorites
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">Saved items across Scrolith</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                  Review marketplace items, gigs, and jobs you saved so you can compare, revisit, and act without losing context.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <MetricCard label="Marketplace" value={counts.marketplace} />
              <MetricCard label="Gigs" value={counts.gigs} />
              <MetricCard label="Jobs" value={counts.jobs} />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
            <FavoritesTab
              active={activeTab === 'marketplace'}
              label={`Marketplace (${counts.marketplace})`}
              onClick={() => setActiveTab('marketplace')}
            />
            <FavoritesTab
              active={activeTab === 'gigs'}
              label={`Saved Gigs (${counts.gigs})`}
              onClick={() => setActiveTab('gigs')}
            />
            <FavoritesTab
              active={activeTab === 'jobs'}
              label={`Saved Jobs (${counts.jobs})`}
              onClick={() => setActiveTab('jobs')}
            />
          </div>

          <div className="mt-6 animate-fade-in">
            {error && (
              <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {loading && <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-10 text-center text-slate-500">Loading favorites...</div>}

            {activeTab === 'marketplace' && !loading && (
              marketplaceListings.length > 0 ? (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {marketplaceListings.map((listing) => {
                    const cover =
                      listing.coverImage ||
                      (Array.isArray(listing.images) && listing.images[0]
                        ? (typeof listing.images[0] === 'string' ? listing.images[0] : listing.images[0]?.url)
                        : '');
                    return (
                      <article key={listing.id} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                        <Link to={`/marketplace/listing/${encodeURIComponent(listing.slug || listing.id)}`} className="block">
                          <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                            {cover ? (
                              <img src={cover} alt={listing.title} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-slate-400">
                                <ShoppingBag className="h-10 w-10" />
                              </div>
                            )}
                            <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 backdrop-blur">
                              Marketplace
                            </div>
                          </div>
                          <div className="space-y-3 p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="line-clamp-2 text-lg font-semibold text-slate-950">{listing.title}</h3>
                                <p className="mt-1 text-sm text-slate-500">{listing.seller?.name || 'Scrolith seller'}</p>
                              </div>
                              <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-950">
                                {typeof listing.price === 'number' ? formatPrice(listing.price) : listing.price || 'Price on request'}
                              </div>
                            </div>
                            <p className="line-clamp-3 text-sm leading-6 text-slate-600">{listing.summary || listing.description || 'Saved marketplace listing.'}</p>
                            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                              {listing.location && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1">
                                  <MapPin className="h-3.5 w-3.5" />
                                  {listing.location}
                                </span>
                              )}
                              {Array.isArray(listing.images) && listing.images.length > 0 && (
                                <span className="rounded-full bg-slate-50 px-2.5 py-1">{listing.images.length} images</span>
                              )}
                            </div>
                          </div>
                        </Link>
                        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
                          <Link
                            to={`/marketplace/listing/${encodeURIComponent(listing.slug || listing.id)}`}
                            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                          >
                            Open listing
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => void removeFavorite('marketplace', listing.id)}
                            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                          >
                            <Heart className="h-4 w-4 fill-current" />
                            Remove
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState type="marketplace" />
              )
            )}

            {activeTab === 'gigs' && !loading && (
              gigs.length > 0 ? (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {gigs.map((gig) => (
                    <div key={gig.id} className="relative">
                      <GigCard gig={gig} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState type="gigs" />
              )
            )}

            {activeTab === 'jobs' && !loading && (
              jobs.length > 0 ? (
                <div className="space-y-4">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      className="relative flex items-start justify-between gap-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
                    >
                      <Link to={`/jobs/${job.id}`} className="flex-1">
                        <h3 className="font-bold text-lg text-slate-950 mb-1">{job.title}</h3>
                        <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                          <span className="inline-flex items-center gap-2">
                            <span>{job.clientName || job.employerName || 'Client'}</span>
                            <ProBadge role="employer" isPro={(job as any)?.clientIsPro} />
                          </span>
                          <span>-</span>
                          <span className="font-medium text-emerald-600">
                            {typeof job.budget === 'number' ? formatPrice(job.budget) : (job.budget || job.price || '-')}
                          </span>
                          <span>-</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{job.type}</span>
                        </div>
                        <p className="line-clamp-2 text-sm text-slate-600">{job.description}</p>
                      </Link>
                      <button
                        onClick={() => void removeFavorite('job', job.id)}
                        className="rounded-full p-2 text-red-500 transition hover:bg-red-50"
                        title="Remove from favorites"
                      >
                        <Heart className="w-5 h-5 fill-current" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState type="jobs" />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const FavoritesTab: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      'rounded-full border px-4 py-2 text-sm font-semibold transition',
      active
        ? 'border-slate-900 bg-slate-900 text-white'
        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
    ].join(' ')}
  >
    {label}
  </button>
);

const MetricCard: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
    <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
  </div>
);

const EmptyState = ({ type }: { type: FavoriteTab }) => (
  <div className="rounded-[28px] border border-dashed border-slate-300 bg-white py-20 text-center">
    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50">
      <Heart className="h-8 w-8 text-slate-300" />
    </div>
    <h3 className="text-lg font-bold text-slate-950">
      {type === 'marketplace' ? 'No saved marketplace listings yet' : `No saved ${type} yet`}
    </h3>
    <p className="mb-6 text-slate-500">
      {type === 'marketplace'
        ? 'Save marketplace items to compare products and revisit sellers later.'
        : 'Browse Scrolith and save the opportunities you want to revisit.'}
    </p>
    <Link
      to={type === 'marketplace' ? '/marketplace' : type === 'gigs' ? '/browse' : '/browse-jobs'}
      className="rounded-full bg-slate-900 px-6 py-2.5 font-semibold text-white transition hover:bg-slate-800"
    >
      {type === 'marketplace' ? 'Browse Marketplace' : `Browse ${type === 'gigs' ? 'Talent' : 'Jobs'}`}
    </Link>
  </div>
);

export default Favorites;
