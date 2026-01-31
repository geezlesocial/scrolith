import React, { useEffect, useState } from 'react';
import { useUser } from '../../context/UserContext';
import { AdService } from '../services/ads';

const MyAds: React.FC = () => {
  const { user } = useUser();
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await AdService.getMyAds();
        setAds(data || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    if (user?.id) load();
  }, [user?.id]);

  const pay = async (adId: string) => {
    try {
      const j = await AdService.payAd(adId);
      if (j?.success === false) throw new Error(j.message || 'Payment failed');
      // refresh
      setAds(ads.map(a => a.id === adId ? { ...a, status: 'AWAITING_PAYMENT' } : a));
    } catch (e: any) { alert(e?.message || String(e)); }
  };

  const submit = async (adId: string) => {
    try {
      const j = await AdService.submitAd(adId);
      if (j?.success === false) throw new Error(j.message || 'Submit failed');
      setAds(ads.map(a => a.id === adId ? { ...a, status: 'SUBMITTED_FOR_REVIEW' } : a));
    } catch (e: any) { alert(e?.message || String(e)); }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">My Ads</h2>
        </div>

        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="space-y-3">
            {ads.length === 0 && <div className="text-sm text-gray-500">You have no ad campaigns.</div>}
            {ads.map(ad => (
              <div key={ad.id} className="p-3 border rounded flex justify-between items-center">
                <div>
                  <div className="font-medium">{ad.title}</div>
                  <div className="text-xs text-gray-500">Placement: {ad.placement} • Status: {ad.status}</div>
                </div>
                <div className="flex items-center space-x-2">
                  {ad.status === 'DRAFT' && <button onClick={() => pay(ad.id)} className="px-3 py-1 bg-yellow-500 text-white rounded">Pay</button>}
                  {(ad.status === 'PAID' || ad.status === 'AWAITING_PAYMENT') && (
                    <button onClick={() => submit(ad.id)} className="px-3 py-1 bg-indigo-600 text-white rounded">Submit</button>
                  )}
                  <a href={`/community/ads/${ad.id}`} className="px-3 py-1 border rounded text-sm">View</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyAds;
