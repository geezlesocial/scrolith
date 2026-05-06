import React, { useEffect, useState } from 'react';
import {
  FAVORITES_RATE_LIMIT_MESSAGE,
  FavoritesService,
  isFavoritesRateLimitedError
} from '../../services/favorites';
import { useFavorites } from '../../context/FavoritesContext';
import { useCurrency } from '../../context/CurrencyContext';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import Skeleton from '../shared/Skeleton';

export default function EmployerFavorites() {
  const { toggleFavorite } = useFavorites();
  const { formatPrice } = useCurrency();
  const [activeTab, setActiveTab] = useState<'gigs' | 'jobs'>('gigs');
  const [gigs, setGigs] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await FavoritesService.getExpanded();
      setGigs(Array.isArray(data.gigs) ? data.gigs : []);
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (err: any) {
      setError(isFavoritesRateLimitedError(err) ? FAVORITES_RATE_LIMIT_MESSAGE : err?.message || 'Failed to load favorites');
      setGigs([]);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const removeFavorite = async (entityType: 'gig' | 'job', entityId: string) => {
    setError(null);
    try {
      await toggleFavorite(entityType, entityId);
      if (entityType === 'gig') {
        setGigs((prev) => prev.filter((g) => g.id !== entityId));
      } else {
        setJobs((prev) => prev.filter((j) => j.id !== entityId));
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update favorites');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Favorites</h2>
        <p className="text-sm text-gray-500">Saved gigs and jobs you want to revisit.</p>
      </div>

      <div className="flex space-x-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('gigs')}
          className={`pb-3 px-4 text-sm font-bold ${
            activeTab === 'gigs' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'
          }`}
        >
          Gigs ({gigs.length})
        </button>
        <button
          onClick={() => setActiveTab('jobs')}
          className={`pb-3 px-4 text-sm font-bold ${
            activeTab === 'jobs' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'
          }`}
        >
          Jobs ({jobs.length})
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <Skeleton rows={6} />
      ) : (
        <>
          {activeTab === 'gigs' && (
            gigs.length === 0 ? (
              <div className="bg-white border rounded-xl p-10 text-center text-gray-500">
                No saved gigs yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {gigs.map((gig) => (
                  <div key={gig.id} className="bg-white border rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-gray-900">{gig.title}</div>
                      <button
                        onClick={() => removeFavorite('gig', gig.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-full"
                        title="Remove"
                      >
                        <Heart className="w-4 h-4 fill-current" />
                      </button>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">{gig.freelancerName}</div>
                    <div className="text-sm text-gray-700 mt-3">
                      {typeof gig.price === 'number' ? formatPrice(gig.price) : gig.price}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === 'jobs' && (
            jobs.length === 0 ? (
              <div className="bg-white border rounded-xl p-10 text-center text-gray-500">
                No saved jobs yet.
              </div>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div key={job.id} className="bg-white border rounded-xl p-5 flex justify-between items-start">
                    <Link to={`/jobs/${job.id}`} className="flex-1">
                      <div className="font-bold text-gray-900">{job.title}</div>
                      <div className="text-sm text-gray-500 mt-1">{job.clientName || 'Client'}</div>
                      <div className="text-sm text-gray-700 mt-2">
                        {typeof job.budget === 'number' ? formatPrice(job.budget) : job.budget}
                      </div>
                    </Link>
                    <button
                      onClick={() => removeFavorite('job', job.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-full"
                      title="Remove"
                    >
                      <Heart className="w-4 h-4 fill-current" />
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
