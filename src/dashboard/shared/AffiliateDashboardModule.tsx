import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, DollarSign, Link as LinkIcon, RefreshCcw, Send, Wallet } from 'lucide-react';
import { MarketingService } from '../../services/marketing';
import { AffiliateDashboardData } from '../../types';
import { useNotification } from '../../context/NotificationContext';

const formatMoney = (amount: number, currency: string) => {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const safeCurrency = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: safeCurrency }).format(safeAmount);
  } catch {
    return `${safeCurrency} ${safeAmount.toFixed(2)}`;
  }
};

const statusLabel = (status: string) => {
  if (status === 'approved') return { text: 'Approved', className: 'bg-green-100 text-green-700' };
  if (status === 'pending') return { text: 'Pending review', className: 'bg-amber-100 text-amber-700' };
  if (status === 'rejected') return { text: 'Rejected', className: 'bg-red-100 text-red-700' };
  return { text: 'Not applied', className: 'bg-gray-100 text-gray-700' };
};

const AffiliateDashboardModule: React.FC = () => {
  const { showNotification } = useNotification();
  const [data, setData] = useState<AffiliateDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [applicationInput, setApplicationInput] = useState({
    website: '',
    promotionStrategy: '',
    audienceSize: '0 - 1k'
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await MarketingService.getMyAffiliateDashboard();
      setData(payload);
    } catch (error: any) {
      showNotification('error', 'Affiliate module', error?.message || 'Unable to load affiliate dashboard.');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const badge = useMemo(() => statusLabel(data?.status || 'not_applied'), [data?.status]);

  const handleApply = async () => {
    if (!applicationInput.website.trim()) {
      showNotification('warning', 'Website required', 'Please add your website or social profile URL.');
      return;
    }
    setApplying(true);
    try {
      await MarketingService.submitApplication(applicationInput);
      showNotification('success', 'Application submitted', 'Your affiliate application is now under review.');
      await load();
    } catch (error: any) {
      showNotification('error', 'Application failed', error?.message || 'Unable to submit application.');
    } finally {
      setApplying(false);
    }
  };

  const handleWithdraw = async () => {
    if (!data) return;
    const available = Number(data.summary?.availableBalance || 0);
    const minWithdrawal = Number(data.summary?.minimumWithdrawalAmount || 0);
    if (available < minWithdrawal) {
      showNotification(
        'warning',
        'Minimum not reached',
        `You need at least ${formatMoney(minWithdrawal, data.summary?.payoutCurrency || 'USD')} to withdraw.`
      );
      return;
    }

    setWithdrawing(true);
    try {
      await MarketingService.requestAffiliateWithdrawal();
      showNotification('success', 'Payout completed', 'Funds were transferred to your Scrolith wallet.');
      await load();
    } catch (error: any) {
      showNotification('error', 'Withdrawal failed', error?.message || 'Unable to process withdrawal.');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleCopyLink = async () => {
    const referralLink = data?.referralLink;
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      showNotification('success', 'Copied', 'Referral link copied to clipboard.');
    } catch {
      showNotification('warning', 'Copy failed', 'Unable to copy referral link.');
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Loading affiliate dashboard...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
        Unable to load affiliate dashboard.
      </div>
    );
  }

  const payoutCurrency = data.summary?.payoutCurrency || data.settings?.payoutCurrency || 'USD';
  const minWithdrawal = Number(data.summary?.minimumWithdrawalAmount || data.settings?.minimumWithdrawalAmount || 0);
  const availableBalance = Number(data.summary?.availableBalance || 0);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Affiliate Program</h2>
            <p className="text-sm text-gray-500">Track referral earnings and withdraw payouts to your Scrolith wallet.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.className}`}>{badge.text}</span>
            <button
              onClick={load}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {data.status === 'approved' && data.partner ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Total Earnings</p>
              <p className="mt-2 text-lg font-bold text-gray-900">
                {formatMoney(Number(data.summary?.totalEarnings || 0), payoutCurrency)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Available</p>
              <p className="mt-2 text-lg font-bold text-green-600">
                {formatMoney(availableBalance, payoutCurrency)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Withdrawn</p>
              <p className="mt-2 text-lg font-bold text-gray-900">
                {formatMoney(Number(data.summary?.totalWithdrawn || 0), payoutCurrency)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Referrals</p>
              <p className="mt-2 text-lg font-bold text-gray-900">{Number(data.summary?.totalReferrals || 0)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Affiliate Code</p>
                <p className="mt-2 inline-flex items-center rounded-lg bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-900">
                  {data.partner.code}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Referral Link</p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    readOnly
                    value={data.referralLink || ''}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
              Minimum withdrawal: {formatMoney(minWithdrawal, payoutCurrency)}. Current available:
              {' '}
              {formatMoney(availableBalance, payoutCurrency)}.
            </div>

            <div className="flex items-center justify-end">
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Wallet className="h-4 w-4" />
                {withdrawing ? 'Processing...' : 'Withdraw to Wallet'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Recent Referral Earnings</h3>
            {data.earnings.length === 0 ? (
              <p className="text-xs text-gray-500">No earnings yet. Share your referral link to start earning.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Order</th>
                      <th className="py-2 pr-3">Rate</th>
                      <th className="py-2 pr-3 text-right">Commission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.earnings.slice(0, 8).map((earning) => (
                      <tr key={earning.id}>
                        <td className="py-2 pr-3 text-xs text-gray-600">{new Date(earning.createdAt).toLocaleString()}</td>
                        <td className="py-2 pr-3 text-xs text-gray-700">{earning.orderId}</td>
                        <td className="py-2 pr-3 text-xs text-gray-700">{Number(earning.commissionRate || 0)}%</td>
                        <td className="py-2 pr-3 text-right font-semibold text-green-600">
                          {formatMoney(Number(earning.commissionAmount || 0), earning.currency || payoutCurrency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            {data.status === 'pending' && 'Your affiliate application is pending admin review.'}
            {data.status === 'rejected' && (data.application?.reviewNote || 'Your last affiliate application was rejected. You can submit a new one.')}
            {data.status === 'not_applied' && 'Apply to join the affiliate program and start earning on referral first purchases.'}
          </div>

          {(data.status === 'not_applied' || data.status === 'rejected') && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Website / Profile URL</label>
                <input
                  value={applicationInput.website}
                  onChange={(event) => setApplicationInput((prev) => ({ ...prev, website: event.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="https://your-profile.com"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Audience Size</label>
                <select
                  value={applicationInput.audienceSize}
                  onChange={(event) => setApplicationInput((prev) => ({ ...prev, audienceSize: event.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option>0 - 1k</option>
                  <option>1k - 10k</option>
                  <option>10k - 50k</option>
                  <option>50k - 100k</option>
                  <option>100k+</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Promotion Strategy</label>
                <textarea
                  value={applicationInput.promotionStrategy}
                  onChange={(event) => setApplicationInput((prev) => ({ ...prev, promotionStrategy: event.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm min-h-[96px]"
                  placeholder="How will you promote Scrolith?"
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  {applying ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-2">Program Rules</h3>
        <div className="grid grid-cols-1 gap-3 text-xs text-gray-600 md:grid-cols-3">
          <p className="inline-flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" /> First purchase commission: {Number(data.settings?.firstPurchaseCommissionPercent || 0)}%</p>
          <p className="inline-flex items-center gap-2"><Wallet className="h-3.5 w-3.5" /> Minimum withdrawal: {formatMoney(minWithdrawal, payoutCurrency)}</p>
          <p className="inline-flex items-center gap-2"><LinkIcon className="h-3.5 w-3.5" /> Eligible users are tracked via referral linking.</p>
        </div>
      </div>
    </div>
  );
};

export default AffiliateDashboardModule;

