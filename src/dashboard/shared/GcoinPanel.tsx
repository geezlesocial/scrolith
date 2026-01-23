import React, { useEffect, useMemo, useState } from 'react';
import { Coins, RefreshCw, ArrowRightLeft } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { GcoinService } from '../../services/gcoin';
import { useCurrency } from '../../context/CurrencyContext';
import { GcoinSettings, GcoinTransaction, GcoinWallet } from '../../types';

const GcoinPanel = () => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const { formatPrice } = useCurrency();
  const [wallet, setWallet] = useState<GcoinWallet | null>(null);
  const [settings, setSettings] = useState<GcoinSettings | null>(null);
  const [transactions, setTransactions] = useState<GcoinTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [amount, setAmount] = useState(0);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [gw, gs, tx] = await Promise.all([
        GcoinService.getWallet(user.id),
        GcoinService.getSettings(),
        GcoinService.getTransactions(user.id)
      ]);
      setWallet(gw);
      setSettings(gs);
      setTransactions(tx);
    } catch (err: any) {
      showNotification('error', 'Gcoin Load Failed', err?.message || 'Unable to load Gcoin data.');
      setWallet(null);
      setTransactions([]);
      setError(err?.message || 'Unable to load Gcoin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const conversionRate = settings?.conversionRate ?? 0;
  const canConvert = Boolean(settings?.conversionEnabled && wallet && wallet.balance > 0);

  const maxConversion = wallet?.balance || 0;
  const fiatValue = useMemo(() => amount * conversionRate, [amount, conversionRate]);

  const submitConversion = async () => {
    if (!user || !canConvert || amount <= 0) return;
    setConverting(true);
    try {
      await GcoinService.requestConversion(user.id, amount);
      showNotification('success', 'Conversion Requested', 'Your request has been submitted for review.');
      setAmount(0);
      await load();
    } catch (err: any) {
      showNotification('error', 'Conversion Failed', err?.message || 'Unable to request conversion.');
    } finally {
      setConverting(false);
    }
  };

  if (loading) {
    return <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />;
  }

  if (error) {
    return (
      <div className="p-6 bg-white rounded-xl border border-gray-200">
        <div className="text-red-600 text-sm">{error}</div>
        <button onClick={load} className="mt-3 px-3 py-2 rounded-lg border text-xs font-bold">
          Retry
        </button>
      </div>
    );
  }

  if (!wallet) {
    return <div className="p-6 bg-white rounded-xl border border-gray-200">Gcoin wallet not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center">
            <Coins className="w-6 h-6 mr-2 text-yellow-600" /> Gcoin Wallet
          </h2>
          <p className="text-sm text-gray-500">Track your Gcoin balance and transactions.</p>
        </div>
        <button onClick={load} className="px-3 py-2 rounded-lg border text-sm font-bold inline-flex items-center">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase font-bold">Balance</div>
          <div className="text-3xl font-extrabold text-gray-900 mt-2">{wallet.balance} GC</div>
          <div className="text-xs text-gray-500 mt-1">{formatPrice(wallet.balance * conversionRate)}</div>
        </div>
        <div className="bg-white border rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase font-bold">Recipient ID</div>
          <div className="text-sm font-bold text-gray-900 mt-2 break-all">{wallet.recipientId || 'Pending'}</div>
          <div className="text-xs text-gray-500 mt-1">Share this to receive transfers.</div>
        </div>
        <div className="bg-white border rounded-xl p-5">
          <div className="text-xs text-gray-500 uppercase font-bold">Status</div>
          <div className="text-lg font-bold text-gray-900 mt-2">{wallet.status || 'active'}</div>
          <div className="text-xs text-gray-500 mt-1">{wallet.fraudScore ? `Score: ${wallet.fraudScore}` : 'No alerts'}</div>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Convert Gcoin to Wallet Funds</h3>
          <span className="text-xs text-gray-500">Rate: {conversionRate || 0}</span>
        </div>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="number"
            min={0}
            max={maxConversion}
            className="flex-1 border rounded-xl p-3 text-sm"
            placeholder="Amount in GC"
            value={amount || ''}
            onChange={(e) => setAmount(Number(e.target.value || 0))}
            disabled={!canConvert}
          />
          <button
            onClick={submitConversion}
            disabled={!canConvert || converting || amount <= 0}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center"
          >
            <ArrowRightLeft className="w-4 h-4 mr-2" />
            {converting ? 'Submitting...' : 'Request Conversion'}
          </button>
        </div>
        <div className="text-xs text-gray-500">Estimated value: {formatPrice(fiatValue)}</div>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b font-bold text-gray-900">Transactions</div>
        {transactions.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No Gcoin transactions yet.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td className="px-6 py-3">{tx.type}</td>
                  <td className="px-6 py-3 font-bold">{tx.amount} GC</td>
                  <td className="px-6 py-3">{tx.status}</td>
                  <td className="px-6 py-3">{new Date(tx.timestamp).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default GcoinPanel;
