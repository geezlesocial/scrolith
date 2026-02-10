import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { plansApi, UserPlansSnapshot } from '../../services/plans';
import { walletApi } from '../../services/wallet';
import { Plan } from '../../types';
import { CheckCircle, CreditCard, ShieldCheck, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const normalizeRole = (role?: string) => (role || '').toString().toLowerCase();

const isKycApproved = (status?: string | null) => {
  const normalized = (status || '').toString().toLowerCase();
  return normalized === 'verified' || normalized === 'approved';
};

const formatMoney = (value?: number | null, currency?: string | null) => {
  const amount = Number(value || 0);
  const cur = currency || 'USD';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(amount);
};

const formatInterval = (interval?: string | null) => {
  if (!interval) return '';
  if (interval === 'monthly') return 'per month';
  if (interval === 'yearly') return 'per year';
  if (interval === 'lifetime') return 'lifetime';
  return interval;
};

const Membership = () => {
  const { user, updateUser } = useUser();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [snapshot, setSnapshot] = useState<UserPlansSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);

  const roleType = useMemo(() => {
    const role = normalizeRole(user?.role);
    if (role.includes('freelancer') || role.includes('seller')) return 'freelancer';
    if (role.includes('employer') || role.includes('client')) return 'employer';
    return 'freelancer';
  }, [user?.role]);

  const kycApproved = isKycApproved(user?.kycStatus ?? user?.kyc_status);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [planList, planStatus, wallet] = await Promise.all([
        plansApi.listPlans({ type: roleType }),
        plansApi.getMyPlans().catch(() => null),
        walletApi.getWalletInfo().catch(() => null)
      ]);
      setPlans(Array.isArray(planList) ? planList : []);
      if (planStatus) setSnapshot(planStatus);
      setWalletBalance(Number(wallet?.availableBalance ?? wallet?.available_balance ?? 0));
    } catch (error: any) {
      showNotification('error', 'Load Failed', error?.message || 'Unable to load membership plans.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, roleType]);

  const currentPlan = roleType === 'freelancer' ? snapshot?.freelancer : snapshot?.employer;

  const syncUserFromSnapshot = (next: UserPlansSnapshot) => {
    if (!user) return;
    const freelancer = next.freelancer;
    const employer = next.employer;
    updateUser({
      isProFreelancer: freelancer.isPro,
      is_pro_freelancer: freelancer.isPro,
      isProEmployer: employer.isPro,
      is_pro_employer: employer.isPro,
      freelancerPlanId: freelancer.planId ?? null,
      freelancer_plan_id: freelancer.planId ?? null,
      freelancerPlanName: freelancer.planName ?? null,
      freelancer_plan_name: freelancer.planName ?? null,
      freelancerPlanInterval: freelancer.interval ?? null,
      freelancer_plan_interval: freelancer.interval ?? null,
      freelancerPlanPrice: freelancer.price ?? null,
      freelancer_plan_price: freelancer.price ?? null,
      freelancerPlanCurrency: freelancer.currency ?? null,
      freelancer_plan_currency: freelancer.currency ?? null,
      freelancerPlanActive: freelancer.active,
      freelancer_plan_active: freelancer.active,
      freelancerPlanPurchasedAt: freelancer.purchasedAt ?? null,
      freelancer_plan_purchased_at: freelancer.purchasedAt ?? null,
      freelancerPlanExpiresAt: freelancer.expiresAt ?? null,
      freelancer_plan_expires_at: freelancer.expiresAt ?? null,
      employerPlanId: employer.planId ?? null,
      employer_plan_id: employer.planId ?? null,
      employerPlanName: employer.planName ?? null,
      employer_plan_name: employer.planName ?? null,
      employerPlanInterval: employer.interval ?? null,
      employer_plan_interval: employer.interval ?? null,
      employerPlanPrice: employer.price ?? null,
      employer_plan_price: employer.price ?? null,
      employerPlanCurrency: employer.currency ?? null,
      employer_plan_currency: employer.currency ?? null,
      employerPlanActive: employer.active,
      employer_plan_active: employer.active,
      employerPlanPurchasedAt: employer.purchasedAt ?? null,
      employer_plan_purchased_at: employer.purchasedAt ?? null,
      employerPlanExpiresAt: employer.expiresAt ?? null,
      employer_plan_expires_at: employer.expiresAt ?? null
    });
  };

  const handlePurchase = async (plan: Plan) => {
    if (!user) return;
    if (!kycApproved) {
      showNotification('alert', 'KYC Required', 'Please complete KYC verification before purchasing a plan.');
      navigate(`/${roleType === 'freelancer' ? 'freelancer' : 'client'}/dashboard?tab=kyc`);
      return;
    }
    if (Number(walletBalance) < Number(plan.price || 0)) {
      showNotification('alert', 'Insufficient Wallet Balance', 'Please add funds to your wallet to purchase this plan.');
      navigate(`/${roleType === 'freelancer' ? 'freelancer' : 'client'}/dashboard?tab=wallet`);
      return;
    }
    setPurchasingId(plan.id);
    try {
      const updated = await plansApi.purchasePlan(plan.id);
      setSnapshot(updated);
      syncUserFromSnapshot(updated);
      showNotification('success', 'Plan Activated', `${plan.name} is now active.`);
      await loadData();
    } catch (error: any) {
      showNotification('error', 'Purchase Failed', error?.message || 'Unable to purchase this plan.');
    } finally {
      setPurchasingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Membership</h2>
          <p className="text-sm text-gray-500">Upgrade to unlock Pro verified labels and premium features.</p>
        </div>
        <button
          onClick={loadData}
          className="px-4 py-2 rounded-xl border bg-white text-sm font-bold hover:bg-gray-50 inline-flex items-center"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>

      {!kycApproved && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 mt-0.5" />
          <div>
            <p className="font-semibold">KYC approval required</p>
            <p className="text-sm">Complete KYC verification to unlock plan purchases and Pro labels.</p>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">Wallet Balance</div>
          <div className="text-2xl font-bold text-gray-900">{formatMoney(walletBalance, 'USD')}</div>
        </div>
        <button
          onClick={() => navigate(`/${roleType === 'freelancer' ? 'freelancer' : 'client'}/dashboard?tab=wallet`)}
          className="inline-flex items-center px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800"
        >
          <CreditCard className="w-4 h-4 mr-2" />
          Manage Wallet
        </button>
      </div>

      {loading ? (
        <div className="bg-white border rounded-2xl p-6 text-center text-gray-500">Loading plans...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = currentPlan?.planId === plan.id && currentPlan?.active;
            return (
              <div key={plan.id} className="bg-white border rounded-2xl p-6 shadow-sm flex flex-col">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${plan.type === 'freelancer' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {plan.type}
                  </span>
                  {plan.isPopular && <span className="text-xs font-bold text-amber-600">Most Popular</span>}
                </div>
                <h3 className="mt-3 text-xl font-bold text-gray-900">{plan.name}</h3>
                <div className="mt-2 text-3xl font-extrabold text-gray-900">
                  {formatMoney(plan.price, plan.currency)}
                  <span className="text-sm font-medium text-gray-500">/{formatInterval(plan.interval)}</span>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-gray-600">
                  {(plan.features || []).map((feature) => (
                    <li key={feature.id} className="flex items-center gap-2">
                      <CheckCircle className={`w-4 h-4 ${feature.included ? 'text-green-500' : 'text-gray-300'}`} />
                      <span className={feature.included ? '' : 'line-through text-gray-400'}>
                        {feature.name} {feature.limit ? <span className="font-semibold">({feature.limit})</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handlePurchase(plan)}
                  disabled={isCurrent || purchasingId === plan.id || !kycApproved}
                  className={`mt-6 w-full px-4 py-2 rounded-xl text-sm font-bold transition ${
                    isCurrent
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  } ${(!kycApproved || purchasingId === plan.id) && !isCurrent ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {isCurrent ? 'Current Plan' : purchasingId === plan.id ? 'Processing...' : 'Purchase'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {currentPlan?.planId && (
        <div className="bg-white border rounded-2xl p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Current Membership</h3>
          <div className="text-sm text-gray-600">
            <p>
              <span className="font-semibold">Plan:</span> {currentPlan.planName || '—'}
            </p>
            <p>
              <span className="font-semibold">Status:</span> {currentPlan.active ? 'Active' : 'Inactive'}
            </p>
            {currentPlan.expiresAt && (
              <p>
                <span className="font-semibold">Renews/Expires:</span> {new Date(currentPlan.expiresAt).toLocaleDateString()}
              </p>
            )}
            <p>
              <span className="font-semibold">Pro Verified:</span> {currentPlan.isPro ? 'Yes' : 'No'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Membership;
