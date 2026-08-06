import React, { useEffect, useState } from 'react';
import { Clock, Heart, ShoppingCart, Tag } from 'lucide-react';
import ProBadge from '../components/ProBadge';
import VerifiedBadge from '../components/common/VerifiedBadge';
import { resolveVerificationLevel } from '../utils/verification';
import { Link } from 'react-router-dom';
import { jobsApi } from '../services/jobs';
import { Job } from '../types';
import { useFavorites } from '../context/FavoritesContext';
import { useCart } from '../context/CartContext';
import { useNotification } from '../context/NotificationContext';
import { FAVORITES_RATE_LIMIT_MESSAGE, isFavoritesRateLimitedError } from '../services/favorites';
import ListingBodyContent from '../components/ListingBodyContent';

const BrowseJobs = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { toggleFavorite, isFavorite } = useFavorites();
  const { addJobToCart, isJobInCart } = useCart();
  const { showNotification } = useNotification();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data: any = await jobsApi.getJobs({ status: 'active', limit: 50 });
        const list = Array.isArray(data?.jobs) ? data.jobs : Array.isArray(data) ? data : [];
        if (mounted) setJobs(list);
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Failed to load jobs');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleFavorite = async (event: React.MouseEvent, jobId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (busyKey) return;
    const liked = isFavorite('job', jobId);
    setBusyKey(`fav:${jobId}`);
    try {
      await toggleFavorite('job', jobId);
      showNotification(
        'success',
        liked ? 'Removed from favorites' : 'Saved to favorites',
        liked ? 'Job removed from your favorites.' : 'Job added to your favorites.'
      );
    } catch (err: any) {
      showNotification(
        'error',
        'Favorites',
        isFavoritesRateLimitedError(err) ? FAVORITES_RATE_LIMIT_MESSAGE : err?.message || 'Unable to update favorite.'
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handleAddToCart = async (event: React.MouseEvent, jobId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (busyKey) return;
    if (isJobInCart(jobId)) {
      showNotification('info', 'Already in cart', 'This job is already in your cart.');
      return;
    }
    setBusyKey(`cart:${jobId}`);
    try {
      await addJobToCart(jobId, 1);
      showNotification('success', 'Added to cart', 'Job added to your cart.');
    } catch (err: any) {
      showNotification('error', 'Cart', err?.message || 'Unable to add job to cart.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Browse Jobs</h1>

        <div className="space-y-4">
          {loading && (
            <div className="bg-white shadow rounded-lg p-6 text-gray-500">Loading jobs...</div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
              {error}
            </div>
          )}
          {!loading && !error && jobs.length === 0 && (
            <div className="bg-white shadow rounded-lg p-6 text-gray-500">No jobs available right now.</div>
          )}
          {jobs.map((job) => {
            const isClientVerified = Boolean(
              (job as any)?.clientIsVerified ?? (job as any)?.client_is_verified ?? (job as any)?.clientVerified
            );
            const clientVerificationLevel = resolveVerificationLevel({
              verificationLevel:
                (job as any)?.clientVerificationLevel ||
                (job as any)?.client_verification_level ||
                (job as any)?.clientBadgeType ||
                (job as any)?.client_badge_type,
              isVerified: isClientVerified,
              isPro: (job as any)?.clientIsPro,
              type: (job as any)?.clientType || 'business'
            });
            return (
            <article key={job.id} className="bg-white shadow rounded-lg p-6 hover:shadow-md transition">
              <div className="flex justify-between items-start">
                <div>
                  <Link to={`/jobs/${job.id}`} className="hover:text-blue-600">
                    <h2 className="text-xl font-bold text-gray-900">{job.title}</h2>
                  </Link>
                  <div className="mt-1 flex items-center text-sm text-gray-500 space-x-4">
                     <span>{job.type}</span>
                     <span>-</span>
                     <span>{job.budget}</span>
                     <span>-</span>
                     <span className="inline-flex items-center gap-2">
                       <span>{job.clientName}</span>
                       {clientVerificationLevel ? (
                         <VerifiedBadge
                           size={16}
                           level={clientVerificationLevel}
                           className="ml-1"
                           subjectRole={(job as any)?.clientType === 'business' ? 'business' : 'employer'}
                           subjectType={(job as any)?.clientType || 'business'}
                         />
                       ) : null}
                       <ProBadge role="employer" isPro={(job as any)?.clientIsPro} />
                     </span>
                  </div>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {job.status}
                </span>
              </div>
              <ListingBodyContent
                content={job.description}
                preview
                previewMaxLength={160}
                className="mt-4 text-gray-600 line-clamp-2"
                as="p"
              />
              <div className="mt-4 flex items-center justify-between">
                 <div className="flex items-center space-x-2">
                    {(job.tags || []).map((tag) => (
                        <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            <Tag className="w-3 h-3 mr-1" />{tag}
                        </span>
                    ))}
                 </div>
                 <div className="flex items-center text-sm text-gray-500">
                    <Clock className="w-4 h-4 mr-1"/>
                    Posted {new Date(job.postedTime).toLocaleDateString()}
                 </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={(event) => handleFavorite(event, job.id)}
                  disabled={busyKey === `fav:${job.id}`}
                  className={`inline-flex items-center rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    isFavorite('job', job.id)
                      ? 'border-red-200 bg-red-50 text-red-600'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  } disabled:opacity-60`}
                >
                  <Heart className={`mr-1.5 h-3.5 w-3.5 ${isFavorite('job', job.id) ? 'fill-current' : ''}`} />
                  {isFavorite('job', job.id) ? 'Favorited' : 'Favorite'}
                </button>
                <button
                  type="button"
                  onClick={(event) => handleAddToCart(event, job.id)}
                  disabled={busyKey === `cart:${job.id}` || isJobInCart(job.id)}
                  className={`inline-flex items-center rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    isJobInCart(job.id)
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  } disabled:opacity-60`}
                >
                  <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                  {isJobInCart(job.id) ? 'In Cart' : 'Add to Cart'}
                </button>
                <Link
                  to={`/jobs/${job.id}`}
                  className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                >
                  View Details
                </Link>
              </div>
            </article>
          );
          })}
        </div>
      </div>
    </div>
  );
};

export default BrowseJobs;
