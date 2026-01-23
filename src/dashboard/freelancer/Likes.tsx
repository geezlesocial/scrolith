import React, { useEffect, useState } from 'react';
import { FavoritesService } from '../../services/favorites';
import Skeleton from '../shared/Skeleton';

type TopGig = { id: string; title: string; likes: number };
type RecentLike = { entityType: string; entityId: string; createdAt: string };

export default function FreelancerLikes() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileLikes, setProfileLikes] = useState(0);
  const [gigLikes, setGigLikes] = useState(0);
  const [totalLikes, setTotalLikes] = useState(0);
  const [topGigs, setTopGigs] = useState<TopGig[]>([]);
  const [recent, setRecent] = useState<RecentLike[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await FavoritesService.getReceived();
      setProfileLikes(data.profileLikes);
      setGigLikes(data.gigLikes);
      setTotalLikes(data.totalLikes);
      setTopGigs(data.topGigs || []);
      setRecent(data.recent || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load likes');
      setProfileLikes(0);
      setGigLikes(0);
      setTotalLikes(0);
      setTopGigs([]);
      setRecent([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Skeleton rows={4} />;

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700">{error}</p>
        <button onClick={load} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Likes</h2>
          <p className="text-sm text-gray-500">Engagement from clients across your profile and gigs.</p>
        </div>
        <button onClick={load} className="px-4 py-2 rounded-lg border text-sm font-bold text-gray-700 hover:bg-gray-50">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <div className="text-sm text-gray-500">Total Likes</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">{totalLikes}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <div className="text-sm text-gray-500">Profile Likes</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">{profileLikes}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <div className="text-sm text-gray-500">Gig Likes</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">{gigLikes}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded-xl p-6">
          <h3 className="font-bold text-gray-900 mb-4">Top Liked Gigs</h3>
          {topGigs.length === 0 ? (
            <p className="text-sm text-gray-500">No likes on your gigs yet.</p>
          ) : (
            <div className="space-y-3">
              {topGigs.map((gig) => (
                <div key={gig.id} className="flex items-center justify-between">
                  <div className="font-medium text-gray-900">{gig.title}</div>
                  <div className="text-sm text-indigo-600 font-bold">{gig.likes} likes</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border rounded-xl p-6">
          <h3 className="font-bold text-gray-900 mb-4">Recent Activity</h3>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-500">No recent likes.</p>
          ) : (
            <div className="space-y-3 text-sm text-gray-600">
              {recent.map((entry, idx) => (
                <div key={`${entry.entityId}-${idx}`} className="flex items-center justify-between">
                  <div className="capitalize">{entry.entityType.replace('_', ' ')} liked</div>
                  <div className="text-xs text-gray-400">
                    {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
