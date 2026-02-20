import React, { useState, useEffect } from 'react';
import { walletApi, WalletInfo, TransactionsResponse, WalletService } from '../../services/wallet';
import { withdrawalsApi, WithdrawalRequest, CreateWithdrawalData, PayoutAccountDetails, PayoutMethodOption } from '../../services/withdrawals';
import { getDefaultCurrencyForCountry, normalizeCountry } from '../../utils/countryCurrency';
import { useNotification } from '../../context/NotificationContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useUser } from '../../context/UserContext';
import { useSocket } from '../../context/SocketContext';
import {
  stripePayoutsApi,
  StripeAutoPayoutSettingsResponse,
  StripePayoutStatusResponse
} from '../../services/stripePayouts';
import { Table } from './Table';
import { StatusBadge } from './StatusBadge';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';
import { ConfirmModal } from './ConfirmModal';
import {
  DollarSign,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  Plus,
  TrendingUp,
  Wallet as WalletIcon,
  Loader2
} from 'lucide-react';

interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  status: string;
  createdAt: string;
  reference?: string;
}

interface WalletProps {
  role?: 'freelancer' | 'employer';
}

const FALLBACK_PAYOUT_METHODS: PayoutMethodOption[] = [
  {
    id: 'bank_transfer',
    name: 'Bank Transfer',
    enabled: true,
    fields: [
      { key: 'bankName', label: 'Bank Name', type: 'text', required: true },
      { key: 'accountName', label: 'Account Name', type: 'text', required: true },
      { key: 'accountNumber', label: 'Account Number', type: 'text', required: true },
      { key: 'routingNumber', label: 'Routing Number', type: 'text', required: false },
      { key: 'iban', label: 'IBAN', type: 'text', required: false },
      { key: 'swiftBic', label: 'SWIFT/BIC', type: 'text', required: false }
    ]
  },
  {
    id: 'paypal',
    name: 'PayPal',
    enabled: true,
    fields: [{ key: 'paypalEmail', label: 'PayPal Email', type: 'email', required: true }]
  },
  {
    id: 'stripe',
    name: 'Stripe',
    enabled: true,
    fields: [{ key: 'stripeAccountId', label: 'Stripe Account ID', type: 'text', required: true }]
  }
];

export const Wallet: React.FC<WalletProps> = ({ role = 'freelancer' }) => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const { availableCurrencies, currency } = useCurrency();
  const { socket } = useSocket();

  // Data states
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [commissionSettings, setCommissionSettings] = useState<any | null>(null);
  const [stripePayoutStatus, setStripePayoutStatus] = useState<StripePayoutStatusResponse | null>(null);
  const [autoPayoutSettings, setAutoPayoutSettings] = useState<StripeAutoPayoutSettingsResponse | null>(null);
  const [payoutMethods, setPayoutMethods] = useState<PayoutMethodOption[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeActionLoading, setStripeActionLoading] = useState(false);
  const [autoPayoutLoading, setAutoPayoutLoading] = useState(false);
  const [autoPayoutSaving, setAutoPayoutSaving] = useState(false);
  const [autoPayoutForm, setAutoPayoutForm] = useState({
    enabled: false,
    frequency: 'weekly' as 'daily' | 'weekly' | 'monthly',
    minimumAmount: 100,
    reserveAmount: 0,
    dayOfWeek: 1,
    dayOfMonth: 1,
    timezone: (user as any)?.timezone || 'UTC',
    method: 'stripe' as const
  });
  const [selectedPayoutMethod, setSelectedPayoutMethod] = useState('bank_transfer');
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('bank_transfer');
  const [withdrawNotes, setWithdrawNotes] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccountDetails>({
    country: user?.country || '',
    currency: getDefaultCurrencyForCountry(user?.country) || 'USD'
  });
  const [saveAccount, setSaveAccount] = useState(true);

  // Active tab
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'withdrawals'>('overview');

  const loadWalletInfo = async () => {
    if (!user) return;
    try {
      const data = await walletApi.getWalletInfo();
      setWalletInfo(data);
      if (data?.currency) {
        setPayoutAccount((prev) => ({
          ...prev,
          currency: defaultCurrencyCode || prev.currency || data.currency
        }));
      }
    } catch (error: any) {
      console.error('Failed to load wallet info:', error);
      setError(error.message || 'Failed to load wallet info');
      showNotification('error', 'Load Error', error.message || 'Failed to load wallet info');
    }
  };

  const loadTransactions = async () => {
    setTransactionsLoading(true);
    try {
      const data = await walletApi.getTransactions({ limit: 20 });
      // Transform the response to match our Transaction interface
      const transformedTransactions: Transaction[] = (data.transactions || []).map(tx => ({
        id: tx.id,
        type: tx.type === 'credit' ? 'credit' : 'debit',
        amount: tx.amount,
        description: tx.description || tx.reference || 'Transaction',
        status: tx.status,
        createdAt: tx.createdAt,
        reference: tx.reference
      }));
      setTransactions(transformedTransactions);
    } catch (error: any) {
      console.error('Failed to load transactions:', error);
      showNotification('error', 'Load Error', error.message || 'Failed to load transactions');
    } finally {
      setTransactionsLoading(false);
    }
  };

  const loadWithdrawals = async () => {
    setWithdrawalsLoading(true);
    try {
      const data = await withdrawalsApi.getWithdrawals({ limit: 20 });
      setWithdrawals(data.withdrawals || []);
    } catch (error: any) {
      console.error('Failed to load withdrawals:', error);
      showNotification('error', 'Load Error', error.message || 'Failed to load withdrawals');
    } finally {
      setWithdrawalsLoading(false);
    }
  };

  const loadPayoutMethods = async () => {
    setMethodsLoading(true);
    try {
      const methods = await withdrawalsApi.getPayoutMethods();
      setPayoutMethods(methods);
      const firstEnabled = methods.find((m) => m.enabled);
      if (firstEnabled) {
        if (!methods.some((m) => m.id === selectedPayoutMethod && m.enabled)) {
          setSelectedPayoutMethod(firstEnabled.id);
        }
        if (!methods.some((m) => m.id === withdrawMethod && m.enabled)) {
          setWithdrawMethod(firstEnabled.id);
        }
      }
    } catch (error: any) {
      setPayoutMethods(FALLBACK_PAYOUT_METHODS);
    } finally {
      setMethodsLoading(false);
    }
  };

  const loadCommissionSettings = async () => {
    try {
      const data = await WalletService.getCommissionSettings();
      setCommissionSettings(data || null);
    } catch {
      setCommissionSettings(null);
    }
  };

  const loadStripePayoutStatus = async () => {
    setStripeLoading(true);
    try {
      const status = await stripePayoutsApi.getStatus();
      setStripePayoutStatus(status);
      if (status?.account?.stripeAccountId) {
        setPayoutAccount((prev) => ({
          ...prev,
          stripeAccountId: prev.stripeAccountId || status.account?.stripeAccountId || ''
        }));
      }
    } catch {
      setStripePayoutStatus(null);
    } finally {
      setStripeLoading(false);
    }
  };

  const loadAutoPayoutSettings = async () => {
    setAutoPayoutLoading(true);
    try {
      const data = await stripePayoutsApi.getAutoSettings();
      setAutoPayoutSettings(data);
      if (data?.settings) {
        setAutoPayoutForm({
          enabled: Boolean(data.settings.enabled),
          frequency: data.settings.frequency || 'weekly',
          minimumAmount: Number(data.settings.minimumAmount || 0),
          reserveAmount: Number(data.settings.reserveAmount || 0),
          dayOfWeek: Number(data.settings.dayOfWeek ?? 1),
          dayOfMonth: Number(data.settings.dayOfMonth ?? 1),
          timezone: data.settings.timezone || (user as any)?.timezone || 'UTC',
          method: 'stripe'
        });
      }
    } catch {
      setAutoPayoutSettings(null);
    } finally {
      setAutoPayoutLoading(false);
    }
  };

  const loadPayoutAccount = async () => {
    try {
      const data = await withdrawalsApi.getPayoutAccount();
      const userCountry = user?.country || '';
      const mappedCurrency = getDefaultCurrencyForCountry(userCountry);
      if (data && typeof data === 'object') {
        setPayoutAccount({
          ...data,
          country: data.country || userCountry || '',
          currency: defaultCurrencyCode || mappedCurrency || walletInfo?.currency || data.currency || 'USD'
        });
      } else {
        setPayoutAccount((prev) => ({
          ...prev,
          country: prev.country || userCountry || '',
          currency: defaultCurrencyCode || prev.currency || walletInfo?.currency || mappedCurrency || 'USD'
        }));
      }
    } catch (error: any) {
      // ignore when no account yet
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        loadWalletInfo(),
        loadTransactions(),
        loadWithdrawals(),
        loadPayoutAccount(),
        loadPayoutMethods(),
        loadCommissionSettings(),
        loadStripePayoutStatus(),
        loadAutoPayoutSettings()
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  useEffect(() => {
    if (!socket) return;
    const refreshStripe = () => {
      void loadStripePayoutStatus();
      void loadAutoPayoutSettings();
      void loadWalletInfo();
      void loadWithdrawals();
    };
    const refreshAutoPayout = () => {
      void loadAutoPayoutSettings();
    };
    socket.on('stripe:account_updated', refreshStripe);
    socket.on('stripe:payout_updated', refreshStripe);
    socket.on('payouts:updated', refreshStripe);
    socket.on('wallet:updated', refreshStripe);
    socket.on('payouts:auto_settings_updated', refreshAutoPayout);
    return () => {
      socket.off('stripe:account_updated', refreshStripe);
      socket.off('stripe:payout_updated', refreshStripe);
      socket.off('payouts:updated', refreshStripe);
      socket.off('wallet:updated', refreshStripe);
      socket.off('payouts:auto_settings_updated', refreshAutoPayout);
    };
  }, [socket]);

  const resolvedMethods = payoutMethods.length ? payoutMethods : FALLBACK_PAYOUT_METHODS;
  const getMethodConfig = (methodId: string) =>
    resolvedMethods.find((method) => method.id === methodId) ||
    FALLBACK_PAYOUT_METHODS.find((method) => method.id === methodId);
  const getMethodFields = (methodId: string) => {
    const method = getMethodConfig(methodId);
    if (method?.fields && method.fields.length > 0) return method.fields;
    const fallback = FALLBACK_PAYOUT_METHODS.find((m) => m.id === methodId);
    return fallback?.fields || [];
  };
  const getMissingRequiredFields = (methodId: string, account: PayoutAccountDetails) => {
    const fields = getMethodFields(methodId);
    return fields
      .filter((field) => field.required && field.type !== 'note')
      .filter((field) => {
        if (methodId === 'stripe' && field.key === 'stripeAccountId') {
          const connectedStripeAccountId = account?.stripeAccountId || stripeAccount?.stripeAccountId;
          return !connectedStripeAccountId;
        }
        const value = (account as any)[field.key];
        return value === undefined || value === null || String(value).trim() === '';
      })
      .map((field) => (methodId === 'stripe' && field.key === 'stripeAccountId' ? 'Connected Stripe Account' : field.label || field.key));
  };
  const isMethodEnabled = (methodId: string) => {
    const method = getMethodConfig(methodId);
    return method ? method.enabled : false;
  };

  const renderMethodFields = (methodId: string, labelClass: string, inputClass: string) => {
    const fields = getMethodFields(methodId).filter((field) => {
      if (methodId === 'stripe' && field.key === 'stripeAccountId') {
        return false;
      }
      return true;
    });
    if (!fields.length) return null;
    return (
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((field, idx) => {
          const value = (payoutAccount as any)[field.key] ?? '';
          const required = Boolean(field.required);
          if (field.type === 'note') {
            return (
              <div key={`${methodId}-note-${idx}`} className="md:col-span-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-sm font-bold text-gray-800">{field.label || 'Note'}</div>
                {field.description && <div className="text-xs text-gray-600 mt-1">{field.description}</div>}
              </div>
            );
          }
          if (field.type === 'textarea') {
            return (
              <div key={`${methodId}-${field.key}-${idx}`} className="md:col-span-2">
                <label className={`block ${labelClass} mb-1`}>{field.label || field.key}</label>
                <textarea
                  className={inputClass}
                  rows={3}
                  value={value}
                  onChange={(e) => setPayoutAccount({ ...payoutAccount, [field.key]: e.target.value })}
                  placeholder={field.placeholder || ''}
                  required={required}
                />
              </div>
            );
          }
          if (field.type === 'select') {
            return (
              <div key={`${methodId}-${field.key}-${idx}`}>
                <label className={`block ${labelClass} mb-1`}>{field.label || field.key}</label>
                <select
                  className={inputClass}
                  value={value}
                  onChange={(e) => setPayoutAccount({ ...payoutAccount, [field.key]: e.target.value })}
                  required={required}
                >
                  <option value="">{field.placeholder || 'Select option'}</option>
                  {(field.options || []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            );
          }
          const inputType = field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text';
          return (
            <div key={`${methodId}-${field.key}-${idx}`}>
              <label className={`block ${labelClass} mb-1`}>{field.label || field.key}</label>
              <input
                type={inputType}
                className={inputClass}
                value={value}
                onChange={(e) => setPayoutAccount({ ...payoutAccount, [field.key]: e.target.value })}
                placeholder={field.placeholder || ''}
                required={required}
              />
            </div>
          );
        })}
      </div>
    );
  };

  const countryLocked = Boolean(user?.country);
  const currencyLocked = true;

  const mappedCurrency = getDefaultCurrencyForCountry(user?.country);
  const activeMapped = mappedCurrency && availableCurrencies.some((c) => c.code === mappedCurrency) ? mappedCurrency : undefined;
  const defaultCurrencyCode =
    activeMapped ||
    availableCurrencies.find((c) => c.isDefault)?.code ||
    currency?.code ||
    'USD';

  useEffect(() => {
    if (!defaultCurrencyCode) return;
    setPayoutAccount((prev) => ({
      ...prev,
      currency: defaultCurrencyCode
    }));
  }, [defaultCurrencyCode]);
  const payoutRate = Number(availableCurrencies.find((c) => c.code === defaultCurrencyCode)?.rate) || Number(currency?.rate) || 1;
  const walletBaseAvailable = Number(walletInfo?.availableBalance ?? 0);
  const walletBaseCurrency = (walletInfo?.currency || '').toString().toUpperCase();
  const payoutAvailable = walletBaseCurrency && walletBaseCurrency === defaultCurrencyCode
    ? walletBaseAvailable
    : walletBaseAvailable * payoutRate;
  const formatPayout = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: defaultCurrencyCode }).format(Number.isFinite(amount) ? amount : 0);
  const freelancerFeeType =
    String(commissionSettings?.freelancerFeeType ?? commissionSettings?.freelancer_fee_type ?? 'percentage').toLowerCase() === 'fixed'
      ? 'fixed'
      : 'percentage';
  const freelancerFeeValue = Number(commissionSettings?.freelancerFeeValue ?? commissionSettings?.freelancer_fee_value ?? 0);
  const freelancerFeeLabel =
    freelancerFeeType === 'percentage'
      ? `${Number.isFinite(freelancerFeeValue) ? freelancerFeeValue : 0}%`
      : formatPayout(Number.isFinite(freelancerFeeValue) ? freelancerFeeValue : 0);

  const handleWithdrawalRequest = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      showNotification('error', 'Invalid Amount', 'Please enter a valid withdrawal amount');
      return;
    }

    if (walletInfo && amount > payoutAvailable) {
      showNotification('error', 'Insufficient Balance', 'Withdrawal amount exceeds available balance');
      return;
    }

    if (!payoutAccount.country || !payoutAccount.currency) {
      showNotification('error', 'Missing Details', 'Country and currency are required');
      return;
    }
    if (user?.country && normalizeCountry(payoutAccount.country) !== normalizeCountry(user.country)) {
      showNotification('error', 'Country Mismatch', 'Payout country must match your account residence.');
      return;
    }
    if (!isMethodEnabled(withdrawMethod)) {
      const note = getMethodConfig(withdrawMethod)?.note;
      showNotification('error', 'Unavailable', note || 'This payout method is currently unavailable');
      return;
    }
    const missingFields = getMissingRequiredFields(withdrawMethod, payoutAccount);
    if (missingFields.length > 0) {
      showNotification('error', 'Missing Details', `Please complete: ${missingFields.join(', ')}`);
      return;
    }

    setModalLoading(true);
    try {
      const withdrawalData: CreateWithdrawalData = {
        amount,
        paymentMethodId: withdrawMethod,
        notes: withdrawNotes,
        details: { ...payoutAccount, currency: defaultCurrencyCode }
      };

      if (saveAccount) {
        await withdrawalsApi.savePayoutAccount({ ...payoutAccount, currency: defaultCurrencyCode, preferredMethod: withdrawMethod });
      }
      await withdrawalsApi.createWithdrawal(withdrawalData);
      showNotification('success', 'Withdrawal Requested', 'Your withdrawal request has been submitted');

      // Reset form and close modal
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      setWithdrawMethod('bank_transfer');
      setWithdrawNotes('');

      // Refresh data
      loadWalletInfo();
      loadWithdrawals();
    } catch (error: any) {
      showNotification('error', 'Withdrawal Failed', error.message || 'Failed to request withdrawal');
    } finally {
      setModalLoading(false);
    }
  };

  const handleSavePayoutDetails = async () => {
    if (!payoutAccount.country || !payoutAccount.currency) {
      showNotification('error', 'Missing Details', 'Country and currency are required');
      return;
    }
    if (user?.country && normalizeCountry(payoutAccount.country) !== normalizeCountry(user.country)) {
      showNotification('error', 'Country Mismatch', 'Payout country must match your account residence.');
      return;
    }
    const missingFields = getMissingRequiredFields(selectedPayoutMethod, payoutAccount);
    if (missingFields.length > 0) {
      showNotification('error', 'Missing Details', `Please complete: ${missingFields.join(', ')}`);
      return;
    }
    try {
      await withdrawalsApi.savePayoutAccount({ ...payoutAccount, currency: defaultCurrencyCode, preferredMethod: selectedPayoutMethod });
      showNotification('success', 'Saved', 'Payout details updated.');
      loadPayoutAccount();
    } catch (error: any) {
      showNotification('error', 'Save Failed', error?.message || 'Unable to save payout details');
    }
  };

  const stripeConfig = stripePayoutStatus?.stripe;
  const stripeAccount = stripePayoutStatus?.account;
  const stripeConfigured = Boolean(stripeConfig?.configured);
  const stripeConnectEnabled = Boolean(stripeConfig?.connectEnabled);
  const stripeAccountActive = Boolean(stripeAccount?.chargesEnabled && stripeAccount?.payoutsEnabled && !stripeAccount?.isDisabledByAdmin);
  const stripePendingOnboarding = Boolean(
    stripeAccount &&
      (stripeAccount.status === 'pending_onboarding' || stripeAccount.status === 'restricted' || !stripeAccount?.payoutsEnabled)
  );
  const autoPayoutBlockedReason = autoPayoutSettings?.blockingReason || null;
  const autoPayoutCanEnable = Boolean(autoPayoutSettings?.canEnable);
  const autoPayoutNextRun = autoPayoutSettings?.settings?.nextRunAt;

  const runStripeAction = async (action: () => Promise<void>) => {
    setStripeActionLoading(true);
    try {
      await action();
    } catch (error: any) {
      showNotification('error', 'Stripe Connect', error?.response?.data?.error || error?.message || 'Action failed');
    } finally {
      setStripeActionLoading(false);
    }
  };

  const handleCreateStripeConnect = () =>
    runStripeAction(async () => {
      await stripePayoutsApi.createAccount({ accountType: stripeConfig?.connectType || 'express', country: user?.country || undefined });
      const onboarding = await stripePayoutsApi.createOnboardingLink();
      if (onboarding?.url) window.open(onboarding.url, '_blank', 'noopener,noreferrer');
      showNotification('success', 'Stripe Connect', 'Stripe payout account created. Complete onboarding.');
      await loadStripePayoutStatus();
      await loadPayoutAccount();
    });

  const handleContinueOnboarding = () =>
    runStripeAction(async () => {
      const onboarding = await stripePayoutsApi.createOnboardingLink();
      if (onboarding?.url) window.open(onboarding.url, '_blank', 'noopener,noreferrer');
      await loadStripePayoutStatus();
    });

  const handleOpenStripeDashboard = () =>
    runStripeAction(async () => {
      if ((stripeAccount?.accountType || stripeConfig?.connectType) === 'standard') {
        window.open('https://connect.stripe.com', '_blank', 'noopener,noreferrer');
        return;
      }
      const login = await stripePayoutsApi.createLoginLink();
      if (login?.url) window.open(login.url, '_blank', 'noopener,noreferrer');
    });

  const handleDisconnectStripe = () =>
    runStripeAction(async () => {
      await stripePayoutsApi.disconnect();
      showNotification('success', 'Stripe Connect', 'Stripe payout account disconnected.');
      await loadStripePayoutStatus();
      await loadAutoPayoutSettings();
    });

  const handleSaveAutoPayoutSettings = async () => {
    setAutoPayoutSaving(true);
    try {
      const next = {
        ...autoPayoutForm,
        minimumAmount: Number(autoPayoutForm.minimumAmount || 0),
        reserveAmount: Number(autoPayoutForm.reserveAmount || 0),
        dayOfWeek: Number(autoPayoutForm.dayOfWeek ?? 1),
        dayOfMonth: Number(autoPayoutForm.dayOfMonth ?? 1)
      };
      await stripePayoutsApi.saveAutoSettings(next as any);
      showNotification('success', 'Auto Payout', 'Auto payout settings updated.');
      await loadAutoPayoutSettings();
    } catch (error: any) {
      showNotification(
        'error',
        'Auto Payout',
        error?.response?.data?.error || error?.message || 'Failed to update auto payout settings'
      );
    } finally {
      setAutoPayoutSaving(false);
    }
  };

  const transactionColumns = [
    {
      key: 'createdAt',
      header: 'Date',
      render: (value: string) => (
        <span className="text-sm text-gray-600">
          {new Date(value).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (value: string) => (
        <span className="font-medium text-gray-900">{value}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (value: string) => (
        <div className="flex items-center space-x-1">
          {value === 'credit' ? (
            <ArrowDownLeft className="w-4 h-4 text-green-500" />
          ) : (
            <ArrowUpRight className="w-4 h-4 text-red-500" />
          )}
          <span className={`text-sm font-medium ${
            value === 'credit' ? 'text-green-600' : 'text-red-600'
          }`}>
            {value === 'credit' ? 'Credit' : 'Debit'}
          </span>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (value: number, row: Transaction) => (
        <span className={`font-semibold ${
          row.type === 'credit' ? 'text-green-600' : 'text-red-600'
        }`}>
          {row.type === 'credit' ? '+' : '-'}${value.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => <StatusBadge status={value} type="transaction" />,
    },
  ];

  const withdrawalColumns = [
    {
      key: 'createdAt',
      header: 'Requested',
      render: (value: string) => (
        <span className="text-sm text-gray-600">
          {new Date(value).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (value: number) => (
        <span className="font-semibold text-gray-900">${value.toFixed(2)}</span>
      ),
    },
    {
      key: 'fee',
      header: 'Fee',
      render: (value: number) => (
        <span className="text-sm text-gray-600">${value.toFixed(2)}</span>
      ),
    },
    {
      key: 'netAmount',
      header: 'Net Amount',
      render: (value: number) => (
        <span className="font-medium text-green-600">${value.toFixed(2)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => <StatusBadge status={value} type="withdrawal" />,
    },
    {
      key: 'estimatedCompletion',
      header: 'Est. Completion',
      render: (value?: string) => (
        <span className="text-sm text-gray-600">
          {value ? new Date(value).toLocaleDateString() : 'N/A'}
        </span>
      ),
    },
  ];

  const tabs = [
    { id: 'overview', label: 'Overview', icon: WalletIcon },
    { id: 'transactions', label: 'Transactions', icon: TrendingUp },
    { id: 'withdrawals', label: 'Withdrawals', icon: Download },
  ];

  if (error && !walletInfo) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700">{error}</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wallet</h1>
          <p className="mt-1 text-gray-600">Manage your funds and transactions</p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <button
            onClick={() => setShowWithdrawModal(true)}
            disabled={!walletInfo || walletInfo.availableBalance <= 0}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4 mr-2" />
            Withdraw Funds
          </button>
          <button
            onClick={loadData}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Balance Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {loading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="bg-gray-50 rounded-xl p-6">
                      <Skeleton type="card" />
                    </div>
                  ))
                ) : walletInfo ? (
                  <>
                    <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-green-100 text-sm font-medium">Available Balance</p>
                          <p className="text-2xl font-bold mt-1">${walletInfo.availableBalance.toFixed(2)}</p>
                        </div>
                        <DollarSign className="w-8 h-8 text-green-200" />
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-blue-100 text-sm font-medium">Total Earnings</p>
                          <p className="text-2xl font-bold mt-1">${walletInfo.totalEarnings.toFixed(2)}</p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-blue-200" />
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-6 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-orange-100 text-sm font-medium">Pending Amount</p>
                          <p className="text-2xl font-bold mt-1">${walletInfo.pendingAmount.toFixed(2)}</p>
                        </div>
                        <Clock className="w-8 h-8 text-orange-200" />
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Recent Transactions Preview */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h3>
                {transactionsLoading ? (
                  <Skeleton type="list" />
                ) : transactions.length === 0 ? (
                  <EmptyState
                    title="No transactions yet"
                    description="Your transaction history will appear here"
                    icon={<TrendingUp className="w-8 h-8 text-gray-400" />}
                  />
                ) : (
                  <div className="space-y-3">
                    {transactions.slice(0, 5).map((transaction) => (
                      <div key={transaction.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          {transaction.type === 'credit' ? (
                            <ArrowDownLeft className="w-5 h-5 text-green-500" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5 text-red-500" />
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{transaction.description}</p>
                            <p className="text-sm text-gray-500">
                              {new Date(transaction.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold ${
                            transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {transaction.type === 'credit' ? '+' : '-'}${transaction.amount.toFixed(2)}
                          </p>
                          <StatusBadge status={transaction.status} type="transaction" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transactions Tab */}
          {activeTab === 'transactions' && (
            <div>
              {transactionsLoading ? (
                <Skeleton type="table" />
              ) : transactions.length === 0 ? (
                <EmptyState
                  title="No transactions found"
                  description="You haven't made any transactions yet"
                  icon={<TrendingUp className="w-12 h-12 text-gray-400" />}
                />
              ) : (
                <Table
                  columns={transactionColumns}
                  data={transactions}
                  className="min-w-full divide-y divide-gray-200"
                />
              )}
            </div>
          )}

          {/* Withdrawals Tab */}
          {activeTab === 'withdrawals' && (
            <div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">Scrolith Salary Dashboard (Stripe)</h3>
                    <p className="text-xs text-gray-500">
                      Manage Stripe Connect onboarding and payouts without leaving your wallet flow.
                    </p>
                  </div>
                  <button
                    onClick={loadStripePayoutStatus}
                    className="px-3 py-2 rounded-lg text-sm border border-gray-300 hover:bg-gray-50"
                    disabled={stripeLoading || stripeActionLoading}
                  >
                    {stripeLoading ? 'Refreshing...' : 'Refresh Status'}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-gray-200 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Stripe</p>
                    <p className={`text-sm font-semibold ${stripeConfigured ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {stripeConfigured ? 'Configured' : 'Not Configured'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Connect Payouts</p>
                    <p className={`text-sm font-semibold ${stripeConnectEnabled ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {stripeConnectEnabled ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Account Type</p>
                    <p className="text-sm font-semibold text-gray-800 uppercase">
                      {stripeAccount?.accountType || stripeConfig?.connectType || '-'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Account Status</p>
                    <p className={`text-sm font-semibold ${stripeAccountActive ? 'text-emerald-600' : 'text-gray-700'}`}>
                      {stripeAccount?.status || 'Not Connected'}
                    </p>
                  </div>
                </div>

                {!stripeConfigured && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Stripe is not configured in Admin &gt; Payment Gateways &gt; Stripe.
                  </div>
                )}
                {stripeConfigured && !stripeConnectEnabled && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Stripe Connect payouts are currently disabled by admin.
                  </div>
                )}
                {stripeAccount?.isDisabledByAdmin && (
                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {stripeAccount.disabledReason || 'Your Stripe payout access is disabled by admin.'}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={handleCreateStripeConnect}
                    disabled={!stripeConfigured || !stripeConnectEnabled || stripeActionLoading || Boolean(stripeAccount?.stripeAccountId)}
                    className="px-3 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white disabled:opacity-50"
                  >
                    {stripeActionLoading ? 'Processing...' : 'Connect Stripe'}
                  </button>
                  <button
                    onClick={handleContinueOnboarding}
                    disabled={!stripeAccount || !stripePendingOnboarding || stripeActionLoading}
                    className="px-3 py-2 rounded-lg text-xs font-bold border border-indigo-200 text-indigo-700 disabled:opacity-50"
                  >
                    Continue Onboarding
                  </button>
                  <button
                    onClick={handleOpenStripeDashboard}
                    disabled={!stripeAccount || stripeActionLoading || Boolean(stripeAccount?.isDisabledByAdmin)}
                    className="px-3 py-2 rounded-lg text-xs font-bold border border-gray-300 text-gray-700 disabled:opacity-50"
                  >
                    Open Salary Dashboard
                  </button>
                  <button
                    onClick={() => {
                      setWithdrawMethod('stripe');
                      setShowWithdrawModal(true);
                    }}
                    disabled={!stripeAccountActive || stripeActionLoading || !isMethodEnabled('stripe')}
                    className="px-3 py-2 rounded-lg text-xs font-bold border border-emerald-300 text-emerald-700 disabled:opacity-50"
                  >
                    Withdraw to Stripe
                  </button>
                  <button
                    onClick={handleDisconnectStripe}
                    disabled={!stripeAccount || stripeActionLoading}
                    className="px-3 py-2 rounded-lg text-xs font-bold border border-rose-300 text-rose-700 disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">Auto Payout Settings</h3>
                    <p className="text-xs text-gray-500">
                      Automatically create Stripe withdrawal runs when your wallet meets your threshold.
                    </p>
                  </div>
                  <button
                    onClick={loadAutoPayoutSettings}
                    className="px-3 py-2 rounded-lg text-sm border border-gray-300 hover:bg-gray-50"
                    disabled={autoPayoutLoading || autoPayoutSaving}
                  >
                    {autoPayoutLoading ? 'Refreshing...' : 'Refresh Settings'}
                  </button>
                </div>

                {autoPayoutBlockedReason && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {autoPayoutBlockedReason}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={Boolean(autoPayoutForm.enabled)}
                      onChange={(e) =>
                        setAutoPayoutForm((prev) => ({
                          ...prev,
                          enabled: e.target.checked
                        }))
                      }
                      className="h-4 w-4"
                      disabled={!autoPayoutCanEnable && !autoPayoutForm.enabled}
                    />
                    <span className="text-sm font-medium text-gray-800">Enable Auto Payout</span>
                  </label>

                  <div className="rounded-lg border border-gray-200 px-3 py-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Next Scheduled Run</p>
                    <p className="text-sm font-semibold text-gray-800 mt-1">
                      {autoPayoutForm.enabled && autoPayoutNextRun
                        ? new Date(autoPayoutNextRun).toLocaleString()
                        : 'Not scheduled'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
                    <select
                      value={autoPayoutForm.frequency}
                      onChange={(e) =>
                        setAutoPayoutForm((prev) => ({
                          ...prev,
                          frequency: e.target.value as 'daily' | 'weekly' | 'monthly'
                        }))
                      }
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Minimum Amount ({defaultCurrencyCode})</label>
                    <input
                      type="number"
                      min={1}
                      step="0.01"
                      value={autoPayoutForm.minimumAmount}
                      onChange={(e) =>
                        setAutoPayoutForm((prev) => ({
                          ...prev,
                          minimumAmount: Number(e.target.value || 0)
                        }))
                      }
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Reserve in Wallet ({defaultCurrencyCode})</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={autoPayoutForm.reserveAmount}
                      onChange={(e) =>
                        setAutoPayoutForm((prev) => ({
                          ...prev,
                          reserveAmount: Number(e.target.value || 0)
                        }))
                      }
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                {autoPayoutForm.frequency === 'weekly' && (
                  <div className="mt-4">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Payout Day</label>
                    <select
                      value={autoPayoutForm.dayOfWeek}
                      onChange={(e) =>
                        setAutoPayoutForm((prev) => ({
                          ...prev,
                          dayOfWeek: Number(e.target.value)
                        }))
                      }
                      className="w-full md:w-1/3 px-3 py-2 border rounded-lg"
                    >
                      <option value={0}>Sunday</option>
                      <option value={1}>Monday</option>
                      <option value={2}>Tuesday</option>
                      <option value={3}>Wednesday</option>
                      <option value={4}>Thursday</option>
                      <option value={5}>Friday</option>
                      <option value={6}>Saturday</option>
                    </select>
                  </div>
                )}

                {autoPayoutForm.frequency === 'monthly' && (
                  <div className="mt-4">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Payout Date</label>
                    <select
                      value={autoPayoutForm.dayOfMonth}
                      onChange={(e) =>
                        setAutoPayoutForm((prev) => ({
                          ...prev,
                          dayOfMonth: Number(e.target.value)
                        }))
                      }
                      className="w-full md:w-1/3 px-3 py-2 border rounded-lg"
                    >
                      {Array.from({ length: 28 }).map((_, index) => (
                        <option key={index + 1} value={index + 1}>
                          Day {index + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleSaveAutoPayoutSettings}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
                    disabled={autoPayoutSaving || autoPayoutLoading || (autoPayoutForm.enabled && !autoPayoutCanEnable)}
                  >
                    {autoPayoutSaving ? 'Saving...' : 'Save Auto Payout Settings'}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">Payout/Withdrawal Methods</h3>
                    <p className="text-xs text-gray-500">Select a method and save your payout details.</p>
                  </div>
                  <button
                    onClick={loadPayoutMethods}
                    className="px-3 py-2 rounded-lg text-sm border border-gray-300 hover:bg-gray-50"
                  >
                    {methodsLoading ? 'Loading...' : 'Refresh Methods'}
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {resolvedMethods.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => method.enabled && setSelectedPayoutMethod(method.id)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold border ${
                        selectedPayoutMethod === method.id ? 'border-indigo-500 text-indigo-700 bg-indigo-50' : 'border-gray-200 text-gray-700'
                      } ${method.enabled ? '' : 'opacity-50 cursor-not-allowed'}`}
                      disabled={!method.enabled}
                    >
                      {method.name} {method.enabled ? '' : '(Unavailable)'}
                    </button>
                  ))}
                </div>

                {getMethodConfig(selectedPayoutMethod)?.note && (
                  <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {getMethodConfig(selectedPayoutMethod)?.note}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
                    <input
                      type="text"
                      className={`w-full px-3 py-2 border rounded-lg ${countryLocked ? 'bg-gray-100 text-gray-600' : ''}`}
                      value={payoutAccount.country || ''}
                      onChange={(e) => setPayoutAccount({ ...payoutAccount, country: e.target.value })}
                      readOnly={countryLocked}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                    <input
                      type="text"
                      className={`w-full px-3 py-2 border rounded-lg ${currencyLocked ? 'bg-gray-100 text-gray-600' : ''}`}
                      value={payoutAccount.currency || ''}
                      onChange={(e) => setPayoutAccount({ ...payoutAccount, currency: e.target.value.toUpperCase() })}
                      readOnly={currencyLocked}
                    />
                  </div>
                </div>

                {renderMethodFields(selectedPayoutMethod, 'text-xs font-medium text-gray-600', 'w-full px-3 py-2 border rounded-lg')}

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleSavePayoutDetails}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold"
                  >
                    Save Payout Details
                  </button>
                </div>
              </div>

              {withdrawalsLoading ? (
                <Skeleton type="table" />
              ) : withdrawals.length === 0 ? (
                <EmptyState
                  title="No withdrawal requests"
                  description="Your withdrawal history will appear here"
                  icon={<Download className="w-12 h-12 text-gray-400" />}
                />
              ) : (
                <Table
                  columns={withdrawalColumns}
                  data={withdrawals}
                  className="min-w-full divide-y divide-gray-200"
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Withdrawal Modal */}
      <ConfirmModal
        isOpen={showWithdrawModal}
        title="Request Withdrawal"
        message="Withdraw funds from your wallet"
        onConfirm={handleWithdrawalRequest}
        onCancel={() => {
          setShowWithdrawModal(false);
          setWithdrawAmount('');
          setWithdrawMethod('bank_transfer');
          setWithdrawNotes('');
        }}
        confirmLabel="Request Withdrawal"
        cancelLabel="Cancel"
        variant="info"
        loading={modalLoading}
      >
        <div className="mt-4 space-y-4">
          {/* Current Balance */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Available Balance:</span>
              <span className="font-semibold text-gray-900">
                {formatPayout(payoutAvailable)}
              </span>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Withdrawal Amount
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Enter amount"
              min="0"
              step="0.01"
              max={payoutAvailable}
              required
            />
          </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Method
            </label>
            <select
              value={withdrawMethod}
              onChange={(e) => setWithdrawMethod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            >
              {resolvedMethods.map((method) => (
                <option key={method.id} value={method.id} disabled={!method.enabled}>
                  {method.name}{method.enabled ? '' : ' (Unavailable)'}
                </option>
              ))}
            </select>
          </div>
          {getMethodConfig(withdrawMethod)?.note && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {getMethodConfig(withdrawMethod)?.note}
            </div>
          )}

          {/* Country & Currency */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Country
              </label>
              <input
                type="text"
                value={payoutAccount.country || ''}
                onChange={(e) => setPayoutAccount({ ...payoutAccount, country: e.target.value })}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 ${countryLocked ? 'bg-gray-100 text-gray-600' : ''}`}
                placeholder="e.g. US"
                required
                readOnly={countryLocked}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Currency
              </label>
              <input
                type="text"
                value={payoutAccount.currency || ''}
                onChange={(e) => setPayoutAccount({ ...payoutAccount, currency: e.target.value.toUpperCase() })}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 ${currencyLocked ? 'bg-gray-100 text-gray-600' : ''}`}
                placeholder="e.g. USD"
                required
                readOnly={currencyLocked}
              />
            </div>
          </div>
          {countryLocked && (
            <p className="text-xs text-gray-500">Payout country must match your account residence.</p>
          )}

          {renderMethodFields(withdrawMethod, 'text-sm font-medium text-gray-700', 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500')}

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={saveAccount}
              onChange={(e) => setSaveAccount(e.target.checked)}
              className="h-4 w-4"
            />
            Save payout account for future withdrawals
          </label>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={withdrawNotes}
              onChange={(e) => setWithdrawNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Any additional notes..."
            />
          </div>

          {/* Fee Information */}
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p className="font-medium">Freelancer Commission (on clearance): {freelancerFeeLabel}</p>
                <p>Processing time: 3-5 business days</p>
              </div>
            </div>
          </div>
        </div>
      </ConfirmModal>
    </div>
  );
};

export default Wallet;
