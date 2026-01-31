import React, { useEffect, useState } from 'react';
import { GcoinService } from '../services/gcoin';
import { useUser } from '../context/UserContext';
import SendGcoinModal from '../components/SendGcoinModal';

const GcoinDash: React.FC = () => {
  const { user } = useUser();
  const [wallet, setWallet] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSend, setOpenSend] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (!user?.id) return;
        const w = await GcoinService.getWallet(user.id);
        setWallet(w);
        const t = await GcoinService.getTransactions(user.id);
        setTxs(t || []);
      } catch (e) {
        console.error('Failed to load gcoin dash', e);
      } finally {
        setLoading(false);
      }
    };
    load();
    const onGcoinEvent = async (e: any) => {
      try {
        if (!user?.id) return;
        const w = await GcoinService.getWallet(user.id);
        setWallet(w);
        const t = await GcoinService.getTransactions(user.id);
        setTxs(t || []);
      } catch (err) { console.error('Failed to refresh gcoin on event', err); }
    };
    window.addEventListener('community:gcoin_transaction_created', onGcoinEvent as EventListener);
    window.addEventListener('community:gcoin_balance_updated', onGcoinEvent as EventListener);
    window.addEventListener('community:gcoin_conversion_processed', onGcoinEvent as EventListener);
    return () => {
      window.removeEventListener('community:gcoin_transaction_created', onGcoinEvent as EventListener);
      window.removeEventListener('community:gcoin_balance_updated', onGcoinEvent as EventListener);
      window.removeEventListener('community:gcoin_conversion_processed', onGcoinEvent as EventListener);
    };
  }, [user?.id]);

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Gcoin Dashboard</h2>
          <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={() => setOpenSend(true)}>Send Gcoin</button>
        </div>

        {loading ? (
          <div>Loading...</div>
        ) : (
          <div>
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">Balance</div>
                  <div className="text-3xl font-bold text-indigo-700">{wallet?.balance ?? 0} Gcoin</div>
                  <div className="text-sm text-gray-400">Lifetime earned: {wallet?.lifetimeEarned ?? 0} Gcoin</div>
                </div>
                <div>
                  {wallet?.status === 'frozen' ? (
                    <div className="text-xs px-3 py-1 rounded bg-red-100 text-red-800 font-semibold">Frozen</div>
                  ) : wallet?.status === 'pending' ? (
                    <div className="text-xs px-3 py-1 rounded bg-yellow-100 text-yellow-800 font-semibold">Pending</div>
                  ) : (
                    <div className="text-xs px-3 py-1 rounded bg-green-100 text-green-800 font-semibold">Available</div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Transactions</h3>
              <div className="space-y-2">
                {txs.length === 0 && <div className="text-sm text-gray-500">No transactions yet.</div>}
                {txs.map((t) => (
                  <div key={t.id} className="p-3 border border-gray-100 rounded flex justify-between items-center">
                    <div>
                      <div className="font-medium">{t.type}</div>
                      <div className="text-sm text-gray-500">{t.reason || t.source || ''}</div>
                    </div>
                    <div className={`font-bold ${t.amount < 0 ? 'text-red-500' : 'text-green-600'}`}>{t.amount}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <SendGcoinModal isOpen={openSend} onClose={() => setOpenSend(false)} />
    </div>
  );
};

export default GcoinDash;
