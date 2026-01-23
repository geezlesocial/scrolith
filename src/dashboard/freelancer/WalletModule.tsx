
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
    DollarSign, Clock, ArrowUpRight, ArrowDownLeft, ShieldCheck, 
    AlertTriangle, CreditCard, Download, ExternalLink, RefreshCw, Lock, Coins, Copy
} from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useNotification } from '../../context/NotificationContext';
import { WalletService } from '../../services/wallet';
import { GcoinService } from '../../services/gcoin';
import { Wallet, WalletTransaction, GlobalCommissionSettings, GcoinWallet, GcoinSettings } from '../../types';

const WalletModule = () => {
    const { user } = useUser();
    const [searchParams, setSearchParams] = useSearchParams();
    const { formatPrice } = useCurrency();
    const { showNotification } = useNotification();
    
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
    
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [convertAmount, setConvertAmount] = useState('');
    const [addFundsAmount, setAddFundsAmount] = useState('');
    const [topupProviders, setTopupProviders] = useState<string[]>([]);
    const [topupProvider, setTopupProvider] = useState('auto');
    const [topupStatusMessage, setTopupStatusMessage] = useState<string | null>(null);
    const [conversionRate, setConversionRate] = useState(0);

    const [withdrawMethod, setWithdrawMethod] = useState('paypal');
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        loadData();
    }, [user]);

    useEffect(() => {
        if (!isAddFundsModalOpen || !user || !wallet) return;
        const loadProviders = async () => {
            try {
                const result = await WalletService.getTopupProviders({
                    currency: wallet.currency,
                    country: user.country || undefined
                });
                const providers = Array.isArray(result.providers) ? result.providers : [];
                setTopupProviders(providers);
                if (result.recommended) {
                    setTopupProvider(result.recommended);
                }
            } catch (error) {
                setTopupProviders([]);
            }
        };
        loadProviders();
    }, [isAddFundsModalOpen, user, wallet]);

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

    const loadData = async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const [w, gw, txs, comms, gSettings] = await Promise.allSettled([
                WalletService.getWallet(),
                GcoinService.getWallet(user.id),
                WalletService.getUserTransactions(user.id),
                WalletService.getCommissionSettings(),
                GcoinService.getSettings()
            ]);

            if (w.status === 'fulfilled') setWallet(w.value);
            if (gw.status === 'fulfilled') setGcoinWallet(gw.value);
            if (txs.status === 'fulfilled') setTransactions(txs.value);
            if (comms.status === 'fulfilled') setCommissionSettings(comms.value);
            if (gSettings.status === 'fulfilled') {
                setConversionRate(gSettings.value.conversionRate);
                setGcoinSettings(gSettings.value);
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

    const handleWithdraw = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!wallet || !user) return;
        const amount = parseFloat(withdrawAmount);
        if (isNaN(amount) || amount <= 0) return;

        setIsProcessing(true);
        try {
            const result = await WalletService.requestWithdrawal(user.id, amount, withdrawMethod);
            if (result.success) {
                showNotification('success', 'Request Submitted', result.message);
                setIsWithdrawModalOpen(false);
                setWithdrawAmount('');
                loadData();
            } else {
                showNotification('alert', 'Request Failed', result.message);
            }
        } finally {
            setIsProcessing(false);
        }
    };

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
        const amount = parseInt(convertAmount);
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
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to request conversion.');
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

    const role = (user?.role || '').toLowerCase();
    const isClient = role.includes('client') || role.includes('employer');

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
                            <h3 className="text-3xl font-extrabold text-gray-900 mt-2">{formatPrice(wallet.available_balance)}</h3>
                            <div className="mt-4">
                                <button 
                                    onClick={() => setIsWithdrawModalOpen(true)}
                                    disabled={wallet.frozen || wallet.available_balance <= 0}
                                    className="w-full py-2 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center"
                                >
                                    {wallet.frozen ? <Lock className="w-4 h-4 mr-2" /> : <ArrowUpRight className="w-4 h-4 mr-2" />}
                                    Withdraw
                                </button>
                                {isClient && (
                                    <button
                                        onClick={() => setIsAddFundsModalOpen(true)}
                                        disabled={wallet.frozen}
                                        className="w-full mt-3 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center"
                                    >
                                        {wallet.frozen ? <Lock className="w-4 h-4 mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
                                        Add Funds
                                    </button>
                                )}
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
                                    disabled={!gcoinSettings?.conversionEnabled}
                                    title={gcoinSettings?.conversionEnabled ? 'Convert Gcoin to funds' : 'Conversions are disabled'}
                                >
                                    Convert to Funds
                                </button>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Pending Clearance</p>
                                    <h3 className="text-2xl font-bold text-gray-900 mt-2">{formatPrice(wallet.pending_clearance)}</h3>
                                </div>
                                <div className="p-2 bg-gray-50 rounded-lg">
                                    <Clock className="w-6 h-6 text-gray-500" />
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-4">Funds from recent jobs will clear in ~5 days.</p>
                        </div>
                    </div>

                    {/* Transactions */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                    
                    {/* Withdraw Modal */}
                    {isWithdrawModalOpen && (
                        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
                                <h3 className="font-bold text-lg mb-4 text-gray-900">Request Withdrawal</h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    Available: {formatPrice(wallet.available_balance)}
                                </p>
                                <form onSubmit={handleWithdraw} className="space-y-4">
                                    <input 
                                        type="number" 
                                        className="w-full border rounded-lg p-2.5 focus:ring-green-500 focus:border-green-500"
                                        placeholder="Amount"
                                        value={withdrawAmount}
                                        onChange={e => setWithdrawAmount(e.target.value)}
                                        max={wallet.available_balance}
                                        min={commissionSettings?.minimumFee || 1}
                                    />
                                    <select 
                                        className="w-full border rounded-lg p-2.5"
                                        value={withdrawMethod}
                                        onChange={e => setWithdrawMethod(e.target.value)}
                                    >
                                        <option value="paypal">PayPal</option>
                                        <option value="stripe">Stripe</option>
                                        <option value="bank">Bank Transfer</option>
                                    </select>
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
                            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
                                <h3 className="font-bold text-lg mb-4 text-gray-900">Add Funds</h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    Add money to your wallet to pay freelancers or platform fees.
                                </p>
                                <form onSubmit={handleAddFunds} className="space-y-4">
                                    <input
                                        type="number"
                                        className="w-full border rounded-lg p-2.5 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Amount"
                                        value={addFundsAmount}
                                        onChange={(e) => setAddFundsAmount(e.target.value)}
                                        min={1}
                                    />
                                    <select
                                        className="w-full border rounded-lg p-2.5"
                                        value={topupProvider}
                                        onChange={(e) => setTopupProvider(e.target.value)}
                                    >
                                        <option value="auto">Recommended</option>
                                        {topupProviders.map((provider) => (
                                            <option key={provider} value={provider}>
                                                {provider.toUpperCase()}
                                            </option>
                                        ))}
                                    </select>
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
