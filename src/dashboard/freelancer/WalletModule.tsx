
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
    DollarSign, Clock, ArrowUpRight, ArrowDownLeft, ShieldCheck, 
    AlertTriangle, CreditCard, Download, ExternalLink, RefreshCw, Lock, Coins, Copy, Loader2
} from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import { WalletService } from '../../services/wallet';
import { withdrawalsApi, CreateWithdrawalData, PayoutAccountDetails, PayoutMethodOption } from '../../services/withdrawals';
import { GcoinService } from '../../services/gcoin';
import { stripePayoutsApi, StripePayoutStatusResponse } from '../../services/stripePayouts';
import SendGcoinModal from '../../components/SendGcoinModal';
import { getDefaultCurrencyForCountry, normalizeCountry } from '../../utils/countryCurrency';
import { Wallet, WalletTransaction, GlobalCommissionSettings, GcoinWallet, GcoinSettings, PaymentGateway } from '../../types';

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

const WalletModule = () => {
    const { user } = useUser();
    const [searchParams, setSearchParams] = useSearchParams();
    const { formatPrice, currency, availableCurrencies } = useCurrency();
    const { showNotification } = useNotification();
    const { socket } = useSocket();
    
    // Data State
    const [wallet, setWallet] = useState<Wallet | null>(null);
    const [gcoinWallet, setGcoinWallet] = useState<GcoinWallet | null>(null);
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [commissionSettings, setCommissionSettings] = useState<GlobalCommissionSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [gcoinSettings, setGcoinSettings] = useState<GcoinSettings | null>(null);

    // Modal State
    const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
    const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
    const [isAddFundsModalOpen, setIsAddFundsModalOpen] = useState(false);
    const [isSendGcoinModalOpen, setIsSendGcoinModalOpen] = useState(false);
    
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [convertAmount, setConvertAmount] = useState('');
    const [addFundsAmount, setAddFundsAmount] = useState('');
    const [topupProviders, setTopupProviders] = useState<string[]>([]);
    const [topupProvider, setTopupProvider] = useState('auto');
    const [fundingGateways, setFundingGateways] = useState<PaymentGateway[]>([]);
    const [loadingGateways, setLoadingGateways] = useState(false);
    const [topupStatusMessage, setTopupStatusMessage] = useState<string | null>(null);
    const [conversionRate, setConversionRate] = useState(0);

    const [withdrawMethod, setWithdrawMethod] = useState('bank_transfer');
    const [isProcessing, setIsProcessing] = useState(false);
    const [payoutAccount, setPayoutAccount] = useState<PayoutAccountDetails>({
        country: user?.country || '',
        currency: getDefaultCurrencyForCountry(user?.country) || 'USD'
    });
    const [saveAccount, setSaveAccount] = useState(true);
    const [payoutMethods, setPayoutMethods] = useState<PayoutMethodOption[]>([]);
    const [selectedPayoutMethod, setSelectedPayoutMethod] = useState('bank_transfer');
    const [stripePayoutStatus, setStripePayoutStatus] = useState<StripePayoutStatusResponse | null>(null);
    const [stripeLoading, setStripeLoading] = useState(false);
    const [stripeActionLoading, setStripeActionLoading] = useState(false);

    useEffect(() => {
        loadData();
    }, [user]);

    useEffect(() => {
        const onSettings = async () => {
            if (!user) return;
            try {
                const gSettings = await GcoinService.getSettings();
                setConversionRate(gSettings.conversionRate);
                setGcoinSettings(gSettings);
            } catch (e) {
                console.error('Failed to refresh gcoin settings', e);
            }
        };
        window.addEventListener('community:gcoin_settings_updated', onSettings as EventListener);
        return () => window.removeEventListener('community:gcoin_settings_updated', onSettings as EventListener);
    }, [user]);

    useEffect(() => {
        if (!isAddFundsModalOpen || !user || !wallet) return;
        const loadProviders = async () => {
            try {
                setLoadingGateways(true);
                const gateways = await WalletService.getFundingGateways();
                const compatible = gateways.filter((gw: any) => {
                    const currencies = Array.isArray(gw.supported_currencies || gw.supportedCurrencies) ? (gw.supported_currencies || gw.supportedCurrencies) : [];
                    if (!wallet.currency) return true;
                    if (currencies.length === 0) return true;
                    return currencies.map((c: string) => c.toUpperCase()).includes(wallet.currency.toUpperCase());
                });
                setFundingGateways(gateways);

                const result = await WalletService.getTopupProviders({
                    currency: wallet.currency,
                    country: user.country || undefined
                });
                const providers = Array.isArray(result.providers) ? result.providers : [];
                setTopupProviders(providers);
                if (result.recommended && compatible.some((gw: any) => gw.id === result.recommended)) {
                    setTopupProvider(result.recommended);
                } else if (compatible.length > 0) {
                    setTopupProvider(compatible[0].id);
                }
            } catch (error) {
                setTopupProviders([]);
                setFundingGateways([]);
            }
            finally {
                setLoadingGateways(false);
            }
        };
        loadProviders();
    }, [isAddFundsModalOpen, user, wallet]);

    useEffect(() => {
        if (!user) return;
        const mapped = getDefaultCurrencyForCountry(user.country);
        const activeMapped = mapped && availableCurrencies.some((c) => c.code === mapped) ? mapped : undefined;
        const payoutCode =
            activeMapped ||
            availableCurrencies.find((c) => c.isDefault)?.code ||
            currency?.code ||
            'USD';
        setPayoutAccount((prev) => ({
            ...prev,
            currency: payoutCode
        }));
    }, [user?.country, availableCurrencies, currency?.code]);

    useEffect(() => {
        const intentId = searchParams.get('topup_intent');
        if (!intentId) return;

        let cancelled = false;
        let attempts = 0;

        const poll = async () => {
            try {
                const status = await WalletService.getTopupStatus(intentId);
                if (cancelled) return;
                const state = (status.status || '').toString().toLowerCase();
                if (state === 'succeeded') {
                    setTopupStatusMessage('Wallet funded successfully.');
                    showNotification('success', 'Wallet Funded', 'Your wallet has been credited.');
                    setSearchParams((params) => {
                        params.delete('topup_intent');
                        params.delete('topup_status');
                        return params;
                    });
                    loadData();
                    return;
                }
                if (state === 'failed' || state === 'cancelled' || state === 'expired') {
                    setTopupStatusMessage('Wallet funding did not complete.');
                    showNotification('alert', 'Funding Failed', 'Payment was not completed.');
                    setSearchParams((params) => {
                        params.delete('topup_intent');
                        params.delete('topup_status');
                        return params;
                    });
                    return;
                }
            } catch (error) {
                if (!cancelled) {
                    setTopupStatusMessage('Checking payment status...');
                }
            }

            attempts += 1;
            if (attempts < 10 && !cancelled) {
                setTimeout(poll, 3000);
            }
        };

        poll();

        return () => {
            cancelled = true;
        };
    }, [searchParams, setSearchParams, showNotification]);

    const loadStripePayoutStatus = async (silent = false) => {
        if (!silent) setStripeLoading(true);
        try {
            const status = await stripePayoutsApi.getStatus();
            setStripePayoutStatus(status);
            if (status?.account?.stripeAccountId) {
                setPayoutAccount((prev) => ({
                    ...prev,
                    stripeAccountId: prev.stripeAccountId || status.account?.stripeAccountId || ''
                }));
            }
            return status;
        } catch {
            setStripePayoutStatus(null);
            return null;
        } finally {
            if (!silent) setStripeLoading(false);
        }
    };

    const loadData = async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const [w, gw, txs, comms, gSettings, account, methods, _stripeStatus] = await Promise.allSettled([
                WalletService.getWallet(),
                GcoinService.getWallet(user.id),
                WalletService.getUserTransactions(user.id),
                WalletService.getCommissionSettings(),
                GcoinService.getSettings(),
                withdrawalsApi.getPayoutAccount(),
                withdrawalsApi.getPayoutMethods(),
                loadStripePayoutStatus(true)
            ]);

            const walletValue = w.status === 'fulfilled' ? w.value : null;
            const accountValue = account.status === 'fulfilled' ? account.value : null;

            if (w.status === 'fulfilled') setWallet(walletValue);
            if (gw.status === 'fulfilled') setGcoinWallet(gw.value);
            if (txs.status === 'fulfilled') setTransactions(txs.value);
            if (comms.status === 'fulfilled') setCommissionSettings(comms.value);
            if (gSettings.status === 'fulfilled') {
                setConversionRate(gSettings.value.conversionRate);
                setGcoinSettings(gSettings.value);
            }
            const userCountry = user?.country || '';
            const mappedCurrency = getDefaultCurrencyForCountry(userCountry);
            const activeMapped = mappedCurrency && availableCurrencies.some((c) => c.code === mappedCurrency) ? mappedCurrency : undefined;
            const enforcedCurrency =
                activeMapped ||
                availableCurrencies.find((c) => c.isDefault)?.code ||
                currency?.code ||
                (walletValue as any)?.display_currency ||
                walletValue?.currency ||
                'USD';
            if (account.status === 'fulfilled') {
                setPayoutAccount({
                    ...(accountValue || {}),
                    country: accountValue?.country || userCountry || '',
                    currency: enforcedCurrency
                });
            } else {
                setPayoutAccount((prev) => ({
                    ...prev,
                    country: prev.country || userCountry || '',
                    currency: enforcedCurrency
                }));
            }

            if (methods.status === 'fulfilled') {
                const list = Array.isArray(methods.value) ? methods.value : [];
                setPayoutMethods(list);
                const firstEnabled = list.find((m) => m.enabled);
                if (firstEnabled) {
                    setSelectedPayoutMethod(firstEnabled.id);
                    setWithdrawMethod(firstEnabled.id);
                }
            } else {
                setPayoutMethods(FALLBACK_PAYOUT_METHODS);
            }

            if (w.status === 'rejected') {
                throw w.reason;
            }
        } catch (error) {
            console.error("Failed to load wallet data", error);
            setError('Failed to load wallet data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!socket) return;
        const refreshStripe = () => {
            void loadStripePayoutStatus(true);
        };
        socket.on('stripe:account_updated', refreshStripe);
        socket.on('stripe:payout_updated', refreshStripe);
        socket.on('payouts:updated', refreshStripe);
        return () => {
            socket.off('stripe:account_updated', refreshStripe);
            socket.off('stripe:payout_updated', refreshStripe);
            socket.off('payouts:updated', refreshStripe);
        };
    }, [socket, user?.id]);

    const handleWithdraw = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!wallet || !user) return;
        const amount = parseFloat(withdrawAmount);
        if (isNaN(amount) || amount <= 0) {
            showNotification('alert', 'Invalid Amount', 'Please enter a valid amount.');
            return;
        }
        if (amount > walletDisplayAvailable) {
            showNotification('alert', 'Insufficient Balance', 'Withdrawal amount exceeds available balance.');
            return;
        }
        if (!payoutAccount.country || !payoutAccount.currency) {
            showNotification('alert', 'Missing Details', 'Country and currency are required.');
            return;
        }
        if (user?.country && normalizeCountry(payoutAccount.country) !== normalizeCountry(user.country)) {
            showNotification('alert', 'Country Mismatch', 'Payout country must match your account residence.');
            return;
        }
        if (!isMethodEnabled(withdrawMethod)) {
            const note = getMethodConfig(withdrawMethod)?.note;
            showNotification('alert', 'Unavailable', note || 'This payout method is currently unavailable.');
            return;
        }
        const payoutDetails: PayoutAccountDetails = {
            ...payoutAccount,
            currency: defaultCurrencyCode
        };
        if (withdrawMethod === 'stripe' && !payoutDetails.stripeAccountId && stripeAccount?.stripeAccountId) {
            payoutDetails.stripeAccountId = stripeAccount.stripeAccountId;
        }
        const missingFields = getMissingRequiredFields(withdrawMethod, payoutDetails);
        if (missingFields.length > 0) {
            showNotification('alert', 'Missing Details', `Please complete: ${missingFields.join(', ')}`);
            return;
        }

        setIsProcessing(true);
        try {
            const payload: CreateWithdrawalData = {
                amount,
                paymentMethodId: withdrawMethod,
                details: payoutDetails
            };
            if (saveAccount) {
                await withdrawalsApi.savePayoutAccount({
                    ...payoutDetails,
                    preferredMethod: withdrawMethod
                });
            }
            await withdrawalsApi.createWithdrawal(payload);
            showNotification('success', 'Request Submitted', 'Your withdrawal request is pending admin approval.');
            setIsWithdrawModalOpen(false);
            setWithdrawAmount('');
            setWithdrawMethod('bank_transfer');
            loadData();
        } catch (error: any) {
            showNotification('alert', 'Request Failed', error?.message || 'Withdrawal request failed.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSavePayoutDetails = async () => {
        if (!payoutAccount.country || !payoutAccount.currency) {
            showNotification('alert', 'Missing Details', 'Country and currency are required.');
            return;
        }
        if (user?.country && normalizeCountry(payoutAccount.country) !== normalizeCountry(user.country)) {
            showNotification('alert', 'Country Mismatch', 'Payout country must match your account residence.');
            return;
        }
        const payoutDetails: PayoutAccountDetails = {
            ...payoutAccount,
            currency: defaultCurrencyCode
        };
        if (selectedPayoutMethod === 'stripe' && !payoutDetails.stripeAccountId && stripeAccount?.stripeAccountId) {
            payoutDetails.stripeAccountId = stripeAccount.stripeAccountId;
        }
        const missingFields = getMissingRequiredFields(selectedPayoutMethod, payoutDetails);
        if (missingFields.length > 0) {
            showNotification('alert', 'Missing Details', `Please complete: ${missingFields.join(', ')}`);
            return;
        }
        try {
            await withdrawalsApi.savePayoutAccount({
                ...payoutDetails,
                preferredMethod: selectedPayoutMethod
            });
            showNotification('success', 'Saved', 'Payout details updated.');
        } catch (error: any) {
            showNotification('alert', 'Save Failed', error?.message || 'Unable to save payout details.');
        }
    };

    const stripeConfig = stripePayoutStatus?.stripe;
    const stripeAccount = stripePayoutStatus?.account;
    const stripeConfigured = Boolean(stripeConfig?.configured);
    const stripeConnectEnabled = Boolean(stripeConfig?.connectEnabled);
    const stripeAccountActive = Boolean(
        stripeAccount &&
            stripeAccount.chargesEnabled &&
            stripeAccount.payoutsEnabled &&
            !stripeAccount.isDisabledByAdmin &&
            stripeAccount.status !== 'disabled'
    );
    const stripePendingOnboarding = Boolean(
        stripeAccount &&
            (stripeAccount.status === 'pending_onboarding' ||
                stripeAccount.status === 'restricted' ||
                !stripeAccount.payoutsEnabled)
    );

    const runStripeAction = async (action: () => Promise<void>) => {
        setStripeActionLoading(true);
        try {
            await action();
        } catch (error: any) {
            showNotification(
                'alert',
                'Stripe Connect',
                error?.response?.data?.error || error?.message || 'Action failed'
            );
        } finally {
            setStripeActionLoading(false);
        }
    };

    const handleCreateStripeConnect = () =>
        runStripeAction(async () => {
            await stripePayoutsApi.createAccount({
                accountType: stripeConfig?.connectType || 'express',
                country: user?.country || undefined
            });
            const onboarding = await stripePayoutsApi.createOnboardingLink();
            if (onboarding?.url) window.open(onboarding.url, '_blank', 'noopener,noreferrer');
            showNotification('success', 'Stripe Connect', 'Stripe account created. Complete onboarding.');
            await loadStripePayoutStatus(true);
        });

    const handleContinueStripeOnboarding = () =>
        runStripeAction(async () => {
            const onboarding = await stripePayoutsApi.createOnboardingLink();
            if (onboarding?.url) window.open(onboarding.url, '_blank', 'noopener,noreferrer');
            await loadStripePayoutStatus(true);
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

    const handleAddFunds = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!wallet || !user) return;
        const amount = parseFloat(addFundsAmount);
        if (isNaN(amount) || amount <= 0) return;

        setIsProcessing(true);
        try {
            const result = await WalletService.initiateTopup({
                amount,
                currency: wallet.currency,
                country: user.country || undefined,
                provider: topupProvider || 'auto'
            });
            const redirectUrl = result.redirect_url || result.redirectUrl;
            if (redirectUrl) {
                window.location.href = redirectUrl;
                return;
            }
            if (result.client_secret || result.clientSecret) {
                showNotification('alert', 'Payment Action Required', 'This payment requires client-side confirmation.');
                return;
            }
            showNotification('info', 'Top-up Initiated', 'Please complete the payment to fund your wallet.');
            setIsAddFundsModalOpen(false);
            setAddFundsAmount('');
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to add funds.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConvert = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        const amount = parseFloat(convertAmount);
        if (isNaN(amount) || amount <= 0) return;

        setIsProcessing(true);
        try {
            const result = await GcoinService.requestConversion(user.id, amount);
            if (result.success) {
                showNotification('success', 'Conversion Requested', result.message);
                setIsConvertModalOpen(false);
                setConvertAmount('');
                loadData();
            } else {
                showNotification('alert', 'Error', result.message);
            }
        } catch (error: any) {
            showNotification('alert', 'Error', error?.response?.data?.error || 'Failed to request conversion.');
        } finally {
            setIsProcessing(false);
        }
    };

    const copyRecipientId = () => {
        if (gcoinWallet?.recipientId) {
            navigator.clipboard.writeText(gcoinWallet.recipientId);
            showNotification('success', 'Copied', 'Recipient ID copied to clipboard');
        }
    };

    // Note: withdrawal uses default country currency, not user-selected currency.
    const mappedCurrency = getDefaultCurrencyForCountry(user?.country);
    const activeMapped = mappedCurrency && availableCurrencies.some((c) => c.code === mappedCurrency) ? mappedCurrency : undefined;
    const defaultCurrencyCode =
        activeMapped ||
        availableCurrencies.find((c) => c.isDefault)?.code ||
        currency?.code ||
        'USD';
    const payoutCurrency = availableCurrencies.find((c) => c.code === defaultCurrencyCode);
    const payoutRate = Number(payoutCurrency?.rate) || Number(currency?.rate) || 1;
    const rawAvailable = wallet ? Number(wallet.available_balance ?? 0) : 0;
    const rawPending = wallet ? Number(wallet.pending_clearance ?? 0) : 0;
    const rawEscrow = wallet ? Number(wallet.escrow_balance ?? 0) : 0;
    const walletCurrency = wallet ? String(wallet.currency || '').toUpperCase() : '';
    const needsConversion = walletCurrency ? walletCurrency !== defaultCurrencyCode : false;
    const backendDisplayCurrency = wallet ? String((wallet as any).display_currency || '').toUpperCase() : '';
    const useBackendDisplay = backendDisplayCurrency && backendDisplayCurrency === defaultCurrencyCode;
    const convertedAvailable = needsConversion ? rawAvailable * payoutRate : rawAvailable;
    const convertedPending = needsConversion ? rawPending * payoutRate : rawPending;
    const convertedEscrow = needsConversion ? rawEscrow * payoutRate : rawEscrow;
    const walletDisplayAvailable = wallet
        ? Number(useBackendDisplay ? (wallet as any).display_available_balance : convertedAvailable)
        : 0;
    const walletDisplayPending = wallet
        ? Number(useBackendDisplay ? (wallet as any).display_pending_clearance : convertedPending)
        : 0;
    const walletDisplayEscrow = wallet
        ? Number(useBackendDisplay ? (wallet as any).display_escrow_balance : convertedEscrow)
        : 0;

    const formatPayout = (amount: number) =>
        new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: defaultCurrencyCode
        }).format(Number.isFinite(amount) ? amount : 0);

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
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
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

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Wallet & Earnings</h2>
                    <p className="text-sm text-gray-500">Manage your funds and payouts.</p>
                </div>
                <button onClick={loadData} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                    <RefreshCw className="w-5 h-5" />
                </button>
            </div>

            {loading ? (
                <div className="p-12 text-center text-gray-500">Loading Wallet...</div>
            ) : error ? (
                <div className="p-6 bg-red-50 border border-red-100 text-red-700 rounded-xl">{error}</div>
            ) : !wallet ? (
                <div className="p-12 text-center text-gray-500">Wallet not found.</div>
            ) : (
                <>
                    {topupStatusMessage && (
                        <div className="p-4 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl">
                            {topupStatusMessage}
                        </div>
                    )}
                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Fiat Wallet */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <DollarSign className="w-16 h-16 text-green-600" />
                            </div>
                            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Available Balance</p>
                            <h3 className="text-3xl font-extrabold text-gray-900 mt-2">{formatPrice(rawAvailable)}</h3>
                            <div className="mt-4">
                                <button 
                                    onClick={() => setIsWithdrawModalOpen(true)}
                                    disabled={wallet.frozen || walletDisplayAvailable <= 0}
                                    className="w-full py-2 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center"
                                >
                                    {wallet.frozen ? <Lock className="w-4 h-4 mr-2" /> : <ArrowUpRight className="w-4 h-4 mr-2" />}
                                    Withdraw
                                </button>
                                <button
                                    onClick={() => setIsAddFundsModalOpen(true)}
                                    disabled={wallet.frozen}
                                    className="w-full mt-3 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center"
                                >
                                    {wallet.frozen ? <Lock className="w-4 h-4 mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
                                    Add Funds
                                </button>
                            </div>
                        </div>

                        {/* Gcoin Wallet */}
                        <div className="bg-gradient-to-br from-yellow-50 to-orange-50 p-6 rounded-xl border border-yellow-200 shadow-sm relative overflow-hidden">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-bold text-yellow-700 uppercase tracking-wide flex items-center">
                                        <Coins className="w-4 h-4 mr-1" /> Gcoin Balance
                                    </p>
                                    <h3 className="text-3xl font-extrabold text-yellow-900 mt-2">{gcoinWallet?.balance || 0} GC</h3>
                                    <p className="text-xs text-yellow-700 mt-1">{formatPrice((gcoinWallet?.balance || 0) * conversionRate)}</p>
                                </div>
                            </div>

                            <div className="mt-4 pt-3 border-t border-yellow-100">
                                <p className="text-xs text-yellow-700 font-medium mb-1">Your Recipient ID:</p>
                                <button onClick={copyRecipientId} className="w-full bg-white/70 hover:bg-white text-xs px-3 py-2 rounded border border-yellow-300 text-yellow-900 font-mono flex items-center justify-between transition cursor-pointer group">
                                    {gcoinWallet?.recipientId || 'Generating...'} <Copy className="w-3 h-3 text-yellow-600 group-hover:scale-110 transition" />
                                </button>
                            </div>

                            <div className="mt-3">
                                <button 
                                    onClick={() => setIsConvertModalOpen(true)}
                                    className="w-full py-2 bg-yellow-500 text-white rounded-lg font-bold text-sm hover:bg-yellow-600 transition flex items-center justify-center shadow-sm disabled:opacity-50"
                                    disabled={!gcoinSettings?.conversionEnabled || conversionRate <= 0}
                                    title={gcoinSettings?.conversionEnabled ? 'Convert Gcoin to funds' : 'Conversions are disabled'}
                                >
                                    Convert to Funds
                                </button>
                                {conversionRate <= 0 && (
                                    <p className="text-xs text-yellow-700 mt-2">Conversion rate is not configured.</p>
                                )}
                                <button
                                    onClick={() => setIsSendGcoinModalOpen(true)}
                                    className="w-full mt-2 py-2 border border-yellow-400 text-yellow-700 rounded-lg font-bold text-sm hover:bg-yellow-50 transition disabled:opacity-50"
                                    disabled={!gcoinSettings?.userTransfersEnabled}
                                    title={gcoinSettings?.userTransfersEnabled ? 'Send Gcoin to another user' : 'Transfers are disabled'}
                                >
                                    Send Gcoin
                                </button>
                                {!gcoinSettings?.userTransfersEnabled && (
                                    <p className="text-xs text-yellow-700 mt-2">Transfers are disabled by admin.</p>
                                )}
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Pending Clearance</p>
                                    <h3 className="text-2xl font-bold text-gray-900 mt-2">{formatPrice(rawPending)}</h3>
                                </div>
                                <div className="p-2 bg-gray-50 rounded-lg">
                                    <Clock className="w-6 h-6 text-gray-500" />
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-4">Funds from recent jobs will clear in ~5 days.</p>
                        </div>
                    </div>

                    {/* Payout Details */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="font-bold text-gray-900">Payout Methods</h3>
                                <p className="text-xs text-gray-500">Save your payout details for faster withdrawals.</p>
                            </div>
                            <button onClick={loadData} className="text-xs px-3 py-2 border rounded-lg">Refresh</button>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-4">
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
                            <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                {getMethodConfig(selectedPayoutMethod)?.note}
                            </div>
                        )}
                        {selectedPayoutMethod === 'stripe' && (
                            <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h4 className="text-sm font-bold text-indigo-900">Scrolith Salary Dashboard (Stripe)</h4>
                                        <p className="text-xs text-indigo-700">
                                            Connect once and use Stripe Express onboarding/login automatically.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => void loadStripePayoutStatus()}
                                        className="text-xs px-3 py-2 border border-indigo-200 bg-white rounded-lg disabled:opacity-50"
                                        disabled={stripeLoading || stripeActionLoading}
                                    >
                                        {stripeLoading ? 'Refreshing...' : 'Refresh Status'}
                                    </button>
                                </div>
                                {!stripeConfigured && (
                                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                        Stripe is not configured by admin yet.
                                    </div>
                                )}
                                {stripeConfigured && !stripeConnectEnabled && (
                                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                        Stripe Connect payouts are disabled by admin.
                                    </div>
                                )}
                                {stripeAccount?.isDisabledByAdmin && (
                                    <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                                        {stripeAccount.disabledReason || 'Your Stripe payout access is disabled by admin.'}
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                                    <div className="rounded-lg border border-indigo-100 bg-white px-3 py-2">
                                        <div className="text-[11px] uppercase text-gray-500">Connect Type</div>
                                        <div className="font-semibold text-gray-800 uppercase">
                                            {stripeAccount?.accountType || stripeConfig?.connectType || '-'}
                                        </div>
                                    </div>
                                    <div className="rounded-lg border border-indigo-100 bg-white px-3 py-2">
                                        <div className="text-[11px] uppercase text-gray-500">Status</div>
                                        <div className={`font-semibold ${stripeAccountActive ? 'text-emerald-600' : 'text-gray-800'}`}>
                                            {stripeAccount?.status || 'Not Connected'}
                                        </div>
                                    </div>
                                    <div className="rounded-lg border border-indigo-100 bg-white px-3 py-2">
                                        <div className="text-[11px] uppercase text-gray-500">Stripe Account</div>
                                        <div className="font-semibold text-gray-800 truncate">
                                            {stripeAccount?.stripeAccountId || payoutAccount.stripeAccountId || '-'}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={handleCreateStripeConnect}
                                        disabled={
                                            !stripeConfigured ||
                                            !stripeConnectEnabled ||
                                            stripeActionLoading ||
                                            Boolean(stripeAccount?.stripeAccountId)
                                        }
                                        className="px-3 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white disabled:opacity-50"
                                    >
                                        {stripeActionLoading ? (
                                            <span className="inline-flex items-center gap-1">
                                                <Loader2 className="w-3 h-3 animate-spin" /> Processing
                                            </span>
                                        ) : (
                                            'Connect Stripe'
                                        )}
                                    </button>
                                    <button
                                        onClick={handleContinueStripeOnboarding}
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
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <div className="flex justify-end mt-4">
                            <button
                                onClick={handleSavePayoutDetails}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold"
                            >
                                Save Payout Details
                            </button>
                        </div>
                    </div>

                    {/* Transactions */}
                    <div data-cy="wallet-transactions" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-6 border-b border-gray-200">
                            <h3 className="font-bold text-gray-900">Transaction History</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500">
                                    <tr>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4">Description</th>
                                        <th className="px-6 py-4 text-right">Amount</th>
                                        <th className="px-6 py-4 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {transactions.map((tx) => (
                                        <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                                                {new Date(tx.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-gray-900">{tx.description}</div>
                                                {tx.referenceId && <div className="text-xs text-gray-500 font-mono">Ref: {tx.referenceId}</div>}
                                            </td>
                                            <td className={`px-6 py-4 text-right font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-gray-900'}`}>
                                                {tx.amount > 0 ? '+' : ''}{formatPrice(tx.amount)}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold uppercase ${
                                                    tx.status === 'cleared' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                    {tx.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Convert Modal */}
                    {isConvertModalOpen && gcoinWallet && (
                        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
                                <h3 className="font-bold text-lg mb-4 text-gray-900">Convert Gcoin to Funds</h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    Rate: 1 GC = {formatPrice(conversionRate)} <br/>
                                    Balance: {gcoinWallet.balance} GC
                                </p>
                                <form onSubmit={handleConvert} className="space-y-4">
                                    <input 
                                        type="number" 
                                        className="w-full border rounded-lg p-2.5 focus:ring-yellow-500 focus:border-yellow-500"
                                        placeholder="Amount to convert"
                                        value={convertAmount}
                                        onChange={e => setConvertAmount(e.target.value)}
                                        max={gcoinWallet.balance}
                                    />
                                    {convertAmount && (
                                        <p className="text-center font-bold text-green-600">
                                            You will receive: {formatPrice(parseInt(convertAmount) * conversionRate)}
                                        </p>
                                    )}
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setIsConvertModalOpen(false)} className="flex-1 py-2 border rounded-lg">Cancel</button>
                                        <button type="submit" disabled={isProcessing} className="flex-1 py-2 bg-yellow-500 text-white rounded-lg font-bold">
                                            {isProcessing ? '...' : 'Convert'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    <SendGcoinModal
                        isOpen={isSendGcoinModalOpen}
                        onClose={() => setIsSendGcoinModalOpen(false)}
                    />
                    
                    {/* Withdraw Modal */}
                    {isWithdrawModalOpen && (
                        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
                                <h3 className="font-bold text-lg mb-4 text-gray-900">Request Withdrawal</h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    Available: {formatPayout(walletDisplayAvailable)}
                                </p>
                                <form onSubmit={handleWithdraw} className="space-y-4">
                                    <input 
                                        type="number" 
                                        className="w-full border rounded-lg p-2.5 focus:ring-green-500 focus:border-green-500"
                                        placeholder="Amount"
                                        value={withdrawAmount}
                                        onChange={e => setWithdrawAmount(e.target.value)}
                                        max={walletDisplayAvailable}
                                        min={commissionSettings?.minimumFee || 1}
                                    />
                                    <select 
                                        className="w-full border rounded-lg p-2.5"
                                        value={withdrawMethod}
                                        onChange={e => setWithdrawMethod(e.target.value)}
                                    >
                                        {resolvedMethods.map((method) => (
                                            <option key={method.id} value={method.id} disabled={!method.enabled}>
                                                {method.name}{method.enabled ? '' : ' (Unavailable)'}
                                            </option>
                                        ))}
                                    </select>
                                    {getMethodConfig(withdrawMethod)?.note && (
                                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                            {getMethodConfig(withdrawMethod)?.note}
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <input
                                            type="text"
                                            className={`w-full border rounded-lg p-2.5 ${countryLocked ? 'bg-gray-100 text-gray-600' : ''}`}
                                            placeholder="Country (e.g. US)"
                                            value={payoutAccount.country || ''}
                                            onChange={(e) => setPayoutAccount({ ...payoutAccount, country: e.target.value })}
                                            required
                                            readOnly={countryLocked}
                                        />
                                        <input
                                            type="text"
                                            className={`w-full border rounded-lg p-2.5 ${currencyLocked ? 'bg-gray-100 text-gray-600' : ''}`}
                                            placeholder="Currency (e.g. USD)"
                                            value={payoutAccount.currency || ''}
                                            onChange={(e) => setPayoutAccount({ ...payoutAccount, currency: e.target.value.toUpperCase() })}
                                            required
                                            readOnly={currencyLocked}
                                        />
                                    </div>
                                    {countryLocked && (
                                        <p className="text-xs text-gray-500">Payout country must match your account residence.</p>
                                    )}
                                    {renderMethodFields(withdrawMethod, 'text-xs font-medium text-gray-600', 'w-full border rounded-lg p-2.5')}
                                    <label className="flex items-center gap-2 text-xs text-gray-600">
                                        <input
                                            type="checkbox"
                                            checked={saveAccount}
                                            onChange={(e) => setSaveAccount(e.target.checked)}
                                            className="h-4 w-4"
                                        />
                                        Save payout account for future withdrawals
                                    </label>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setIsWithdrawModalOpen(false)} className="flex-1 py-2 border rounded-lg">Cancel</button>
                                        <button type="submit" disabled={isProcessing} className="flex-1 py-2 bg-green-600 text-white rounded-lg font-bold">
                                            {isProcessing ? 'Processing...' : 'Withdraw'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* Add Funds Modal */}
                    {isAddFundsModalOpen && (
                        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 max-h-[85vh] flex flex-col">
                                <h3 className="font-bold text-lg mb-4 text-gray-900">Add Funds</h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    Add money to your wallet using any active payment gateway.
                                </p>
                                <form onSubmit={handleAddFunds} className="space-y-4 flex-1 flex flex-col">
                                    <input
                                        type="number"
                                        className="w-full border rounded-lg p-2.5 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Amount"
                                        value={addFundsAmount}
                                        onChange={(e) => setAddFundsAmount(e.target.value)}
                                        min={1}
                                    />
                                    <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-2">
                                        {loadingGateways && (
                                            <div className="text-sm text-gray-500">Loading payment methods...</div>
                                        )}
                                        {!loadingGateways && fundingGateways.length === 0 && (
                                            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                                No active payment gateways for {wallet.currency}.
                                            </div>
                                        )}
                                        {fundingGateways.map((gateway) => {
                                            const currencies = Array.isArray(gateway.supported_currencies || gateway.supportedCurrencies)
                                                ? (gateway.supported_currencies || gateway.supportedCurrencies)
                                                : [];
                                            const isSupported = !wallet.currency || currencies.length === 0
                                                ? true
                                                : currencies.map((c: string) => c.toUpperCase()).includes(wallet.currency.toUpperCase());
                                            return (
                                                <label
                                                    key={gateway.id}
                                                    className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-2 text-sm ${
                                                        topupProvider === gateway.id ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200'
                                                    } ${isSupported ? 'cursor-pointer' : 'opacity-60'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        {gateway.logo ? (
                                                            <img src={gateway.logo} alt={gateway.name} className="w-8 h-8 object-contain rounded bg-white" />
                                                        ) : null}
                                                        <div>
                                                            <div className="font-semibold text-gray-900">{gateway.name}</div>
                                                            <div className="text-xs text-gray-500">
                                                                {gateway.mode === 'live' ? 'Live' : 'Test'} mode
                                                                {!isSupported ? ` - Not available for ${wallet.currency}` : ''}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <input
                                                        type="radio"
                                                        name="topupGateway"
                                                        checked={topupProvider === gateway.id}
                                                        onChange={() => isSupported && setTopupProvider(gateway.id)}
                                                        disabled={!isSupported}
                                                    />
                                                </label>
                                            );
                                        })}
                                        {topupProvider === 'auto' && topupProviders.length > 0 && (
                                            <div className="text-xs text-gray-500">Recommended: {topupProviders[0]?.toUpperCase()}</div>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setIsAddFundsModalOpen(false)} className="flex-1 py-2 border rounded-lg">
                                            Cancel
                                        </button>
                                        <button type="submit" disabled={isProcessing} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg font-bold">
                                            {isProcessing ? 'Processing...' : 'Add Funds'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default WalletModule;
