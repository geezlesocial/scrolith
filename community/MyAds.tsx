import React, { useEffect, useState } from 'react';
import { useUser } from '../context/UserContext';

const MyAds: React.FC = () => {
  const { user } = useUser();
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/community/ads/me');
      const j = await r.json();
      if (j.success) setAds(j.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const onAdEvent = () => { load(); };
    window.addEventListener('community:ad_status_updated', onAdEvent as EventListener);
    window.addEventListener('community:ad_payment_initiated', onAdEvent as EventListener);
    window.addEventListener('community:ad_payment_completed', onAdEvent as EventListener);
    return () => {
      window.removeEventListener('community:ad_status_updated', onAdEvent as EventListener);
      window.removeEventListener('community:ad_payment_initiated', onAdEvent as EventListener);
      window.removeEventListener('community:ad_payment_completed', onAdEvent as EventListener);
    };
  }, [user?.id]);

  const pay = async (adId: string) => {
    try {
      const r = await fetch(`/api/community/ads/${adId}/pay`, { method: 'POST' });
      const j = await r.json();
      if (!j.success) throw new Error(j.error?.message || 'Payment failed');
      load();
    } catch (e) { alert(String(e)); }
  };

  const submit = async (adId: string) => {
    try {
      const r = await fetch(`/api/community/ads/${adId}/submit`, { method: 'POST' });
      const j = await r.json();
      if (!j.success) throw new Error(j.error?.message || 'Submit failed');
      load();
    } catch (e) { alert(String(e)); }
  };

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">My Ads</h2>
        </div>
        {loading ? (<div>Loading...</div>) : (
          <div className="space-y-4">
            {ads.length === 0 && <div className="text-sm text-gray-500">No ad campaigns yet.</div>}
            {ads.map(ad => (
              <div key={ad.id} className="p-4 border rounded flex justify-between items-center">
                <div>
                  <div className="font-semibold">{ad.title}</div>
                  <div className="text-sm text-gray-500">Status: {ad.status}</div>
                  <div className="text-sm text-gray-400">Budget: {ad.budget} {ad.currency}</div>
                </div>
                <div className="flex items-center space-x-2">
                  {ad.status === 'DRAFT' && <button onClick={() => pay(ad.id)} className="px-3 py-1 bg-indigo-600 text-white rounded">Pay</button>}
                  {ad.status === 'PAID' && <button onClick={() => submit(ad.id)} className="px-3 py-1 bg-yellow-600 text-white rounded">Submit</button>}
                  <button onClick={() => navigator.clipboard.writeText(window.location.origin + '/community/ads/' + ad.id)} className="px-3 py-1 border rounded">Copy Link</button>
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
