import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import GigCard from '../components/GigCard';
import { commerceService } from '../services/commerce';

const BrowseTalent = () => {
  const [gigs, setGigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await commerceService.getGigs();
        if (active) setGigs(Array.isArray(data) ? data : []);
      } catch (err: any) {
        if (active) {
          setError(err?.message || 'Failed to load gigs.');
          setGigs([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="bg-gray-50 min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Browse Talent & Gigs</h1>
        
        {loading && (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading gigs...
          </div>
        )}
        {!loading && error && (
          <div className="py-12 text-center text-red-600">{error}</div>
        )}
        {!loading && !error && gigs.length === 0 && (
          <div className="py-12 text-center text-gray-500">No gigs are live yet.</div>
        )}
        {!loading && !error && gigs.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {gigs.map((gig) => (
              <GigCard key={gig.id} gig={gig} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BrowseTalent;
