import React, { useEffect, useState } from 'react';
import { AdService } from '../services/ads';
import AdCard from '../components/AdCard';
import { AdCampaign } from '../types';
import { useNotification } from '../context/NotificationContext';

const MyAds = () => {
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const { showNotification } = useNotification();

  const load = async () => {
    setLoading(true);
    try {
      const data = await AdService.getMyAds();
      setAds(data);
    } catch (e: any) {
      showNotification('error', 'Load failed', e?.message || 'Unable to load your ads.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const handleAdEvents = (e: any) => {
      try { load(); } catch (err) { /* ignore */ }
    };
    window.addEventListener('community:ad_status_updated', handleAdEvents as EventListener);
    window.addEventListener('community:ad_created', handleAdEvents as EventListener);
    return () => {
      window.removeEventListener('community:ad_status_updated', handleAdEvents as EventListener);
      window.removeEventListener('community:ad_created', handleAdEvents as EventListener);
    };
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this ad?')) return;
    try {
      await AdService.deleteCampaign(id);
      showNotification('success', 'Deleted', 'Ad removed.');
      setAds(ads.filter(a => a.id !== id));
    } catch (e: any) {
      showNotification('error', 'Delete failed', e?.message || 'Unable to delete ad.');
    }
  };

  const handlePay = async (adId: string) => {
    if (!confirm('Proceed to pay for this ad?')) return;
    setPayingId(adId);
    try {
      showNotification('info', 'Processing', 'Sending payment...');
      const res = await AdService.payAd(adId);
      if (res?.success === false) {
        showNotification('error', 'Payment failed', res?.message || 'Unable to process payment.');
        return;
      }
      showNotification('success', 'Paid', res?.message || 'Ad payment initiated.');
      await load();
    } catch (e: any) {
      showNotification('error', 'Payment error', e?.message || 'Unable to process payment.');
    } finally {
      setPayingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">My Ads</h2>
      </div>

      {loading ? (
        <div className="p-6 bg-white rounded-xl">Loading...</div>
      ) : ads.length === 0 ? (
        <div className="p-6 bg-white rounded-xl">You have no ads. Create one from the Ads Manager.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {ads.map((ad) => (
            <div key={ad.id} className="bg-white p-4 rounded-xl border">
              <AdCard ad={ad} showDonate={false} />
              <div className="mt-3 flex gap-2">
                <button className="px-3 py-1 rounded bg-blue-600 text-white text-sm">Edit</button>
                { (String(ad.status || '').toLowerCase() === 'awaiting_payment' || String(ad.status || '').toLowerCase() === 'awaiting-payment') && (
                  <button onClick={() => handlePay(ad.id)} disabled={payingId === ad.id} className={`px-3 py-1 rounded ${payingId === ad.id ? 'bg-gray-400' : 'bg-green-600'} text-white text-sm`}>
                    {payingId === ad.id ? 'Processing…' : 'Pay'}
                  </button>
                ) }
                <button onClick={() => handleDelete(ad.id)} className="px-3 py-1 rounded bg-red-600 text-white text-sm">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyAds;
