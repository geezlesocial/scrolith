import React, { useEffect, useState } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import { FavoritesService } from '../services/favorites';
import { useCurrency } from '../context/CurrencyContext';
import GigCard from '../components/GigCard';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';

const Favorites = () => {
  const { toggleFavorite } = useFavorites();
  const { formatPrice } = useCurrency();
  const [activeTab, setActiveTab] = useState<'gigs' | 'jobs'>('gigs');
  const [gigs, setGigs] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFavorites = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await FavoritesService.getExpanded();
      setGigs(Array.isArray(data.gigs) ? data.gigs : []);
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load favorites.');
      setGigs([]);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFavorites();
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
      setError(err?.message || 'Failed to update favorites.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center mb-8">
          <Heart className="w-8 h-8 text-red-500 mr-3 fill-current" />
          <h1 className="text-3xl font-bold text-gray-900">My Favorites</h1>
        </div>

        <div className="flex space-x-4 mb-8 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('gigs')}
            className={`pb-4 px-4 font-medium text-sm transition-colors relative ${
              activeTab === 'gigs' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Saved Gigs ({gigs.length})
            {activeTab === 'gigs' && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('jobs')}
            className={`pb-4 px-4 font-medium text-sm transition-colors relative ${
              activeTab === 'jobs' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Saved Jobs ({jobs.length})
            {activeTab === 'jobs' && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600"></div>
            )}
          </button>
        </div>

        <div className="animate-fade-in">
          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading && <div className="p-10 text-center text-gray-500">Loading favorites...</div>}

          {activeTab === 'gigs' && !loading && (
            gigs.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {gigs.map((gig) => (
                  <div key={gig.id} className="relative group">
                    <GigCard gig={gig} />
                    <button
                      onClick={() => removeFavorite('gig', gig.id)}
                      className="absolute top-2 right-2 bg-white p-2 rounded-full shadow hover:bg-red-50 text-red-500 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove from favorites"
                    >
                      <Heart className="w-4 h-4 fill-current" />
                    </button>
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
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition flex justify-between items-start relative group"
                  >
                    <Link to={`/jobs/${job.id}`} className="flex-1">
                      <h3 className="font-bold text-lg text-gray-900 mb-1">{job.title}</h3>
                      <div className="text-sm text-gray-500 mb-2 flex items-center gap-2">
                        <span>{job.clientName || job.employerName || 'Client'}</span>
                        <span>-</span>
                        <span className="font-medium text-green-600">
                          {typeof job.budget === 'number' ? formatPrice(job.budget) : (job.budget || job.price || '-')}
                        </span>
                        <span>-</span>
                        <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">{job.type}</span>
                      </div>
                      <p className="text-gray-600 text-sm line-clamp-2">{job.description}</p>
                    </Link>
                    <button
                      onClick={() => removeFavorite('job', job.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-full transition"
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
  );
};

const EmptyState = ({ type }: { type: string }) => (
  <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
      <Heart className="w-8 h-8 text-gray-300" />
    </div>
    <h3 className="text-lg font-bold text-gray-900">No saved {type} yet</h3>
    <p className="text-gray-500 mb-6">Browse the marketplace and click the heart icon to save items for later.</p>
    <Link
      to={type === 'gigs' ? '/browse' : '/browse-jobs'}
      className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition"
    >
      Browse {type === 'gigs' ? 'Talent' : 'Jobs'}
    </Link>
  </div>
);

export default Favorites;
