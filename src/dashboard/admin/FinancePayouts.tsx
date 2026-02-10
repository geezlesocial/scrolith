import React, { useState, useEffect } from 'react';
import { Wallet, WalletTransaction, PlatformFinancials, FraudAlert, GlobalCommissionSettings, WithdrawalRequest } from '../../types';
import type { PayoutMethodField, PayoutMethodOption } from '../../services/withdrawals';
import { WalletService } from '../../services/wallet';
import { AdminService } from '../../services/admin';
import { useCurrency } from '../../context/CurrencyContext';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import { 
    DollarSign, Lock, Clock, ArrowUpRight, ShieldAlert, 
    RefreshCw, Search, Filter, Ban, CheckCircle, Eye, AlertTriangle, RotateCcw, Unlock, Settings, Percent, Plus, Trash2
} from 'lucide-react';

// --- Interfaces for Type Safety ---
interface StatCardProps {
    title: string;
    value: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
}

interface FraudAlertPanelProps {
    alerts: FraudAlert[];
}

interface CommissionSettingsPanelProps {
    settings: GlobalCommissionSettings;
    onChange: (settings: GlobalCommissionSettings) => void;
    onSave: () => Promise<void>;
    saving?: boolean;
}

interface PayoutMethodsPanelProps {
    methods: PayoutMethodOption[];
    onChange: (methods: PayoutMethodOption[]) => void;
    onSave: () => Promise<void>;
    onReload: () => Promise<void>;
    saving?: boolean;
    loading?: boolean;
}

// --- Sub-Components (Defined OUTSIDE and BEFORE main component) ---

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, color }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex justify-between items-start">
        <div>
            <p className="text-sm font-bold text-gray-500 uppercase">{title}</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-2">{value}</h3>
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
            <Icon className="w-6 h-6 text-white" />
        </div>
    </div>
);

const FraudAlertPanel: React.FC<FraudAlertPanelProps> = ({ alerts }) => (
    <div className="bg-red-50 border border-red-200 p-6 rounded-xl animate-fade-in">
        <h4 className="font-bold text-red-800 flex items-center mb-4">
            <ShieldAlert className="w-5 h-5 mr-2" /> AI Fraud Alerts ({alerts.length})
        </h4>
        {alerts.length === 0 ? (
            <p className="text-sm text-red-600 italic">No high-risk activity detected.</p>
        ) : (
            <div className="space-y-3">
                {alerts.map((a) => (
                    <div key={a.id} className="bg-white p-4 rounded-lg shadow-sm border border-red-100 flex justify-between items-start">
                        <div>
                            <div className="flex items-center mb-1">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded mr-2 uppercase ${a.riskLevel === 'Critical' ? 'bg-red-600 text-white' : 'bg-orange-100 text-orange-800'}`}>
                                    {a.riskLevel}
                                </span>
                                <span className="font-medium text-gray-900">{a.userName}</span>
                            </div>
                            <p className="text-sm text-gray-600">{a.reason}</p>
                            <p className="text-xs text-gray-400 mt-1">Score: {a.score}/100 - Action: {a.action}</p>
                        </div>
                        <button className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded hover:bg-red-200 transition">
                            Review
                        </button>
                    </div>
                ))}
            </div>
        )}
    </div>
);

const CommissionSettingsPanel: React.FC<CommissionSettingsPanelProps> = ({ settings, onChange, onSave, saving }) => (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-fade-in max-w-3xl mx-auto">
            <h3 className="font-bold text-lg text-gray-900 mb-6 flex items-center">
                <Percent className="w-5 h-5 mr-2 text-indigo-600" /> Platform Commission Fees
            </h3>
            
            <div className="space-y-6">
                {/* Freelancer Fees */}
                <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                    <h4 className="font-bold text-gray-800 mb-4">Freelancer Commission</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Fee Structure</label>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => onChange({...settings, freelancerFeeType: 'percentage'})}
                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border ${settings.freelancerFeeType === 'percentage' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-300 text-gray-700'}`}
                                >
                                    Percentage (%)
                                </button>
                                <button 
                                    onClick={() => onChange({...settings, freelancerFeeType: 'fixed'})}
                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border ${settings.freelancerFeeType === 'fixed' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-300 text-gray-700'}`}
                                >
                                    Fixed Amount ($)
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Value</label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-gray-500 font-bold">{settings.freelancerFeeType === 'percentage' ? '%' : '$'}</span>
                                <input 
                                    type="number" 
                                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    value={settings.freelancerFeeValue}
                                    onChange={e => onChange({...settings, freelancerFeeValue: Number(e.target.value)})}
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Deducted from freelancer earnings upon withdrawal/clearance.</p>
                        </div>
                    </div>
                </div>

                {/* Employer Fees */}
                <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                    <h4 className="font-bold text-gray-800 mb-4">Employer Processing Fee</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Fee Structure</label>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => onChange({...settings, employerFeeType: 'percentage'})}
                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border ${settings.employerFeeType === 'percentage' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-300 text-gray-700'}`}
                                >
                                    Percentage (%)
                                </button>
                                <button 
                                    onClick={() => onChange({...settings, employerFeeType: 'fixed'})}
                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border ${settings.employerFeeType === 'fixed' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-300 text-gray-700'}`}
                                >
                                    Fixed Amount ($)
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Value</label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-gray-500 font-bold">{settings.employerFeeType === 'percentage' ? '%' : '$'}</span>
                                <input 
                                    type="number" 
                                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    value={settings.employerFeeValue}
                                    onChange={e => onChange({...settings, employerFeeValue: Number(e.target.value)})}
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Added to order total during checkout.</p>
                        </div>
                    </div>
                </div>

                {/* Minimums */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Transaction Fee ($)</label>
                    <input 
                        type="number" 
                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
                        value={settings.minimumFee}
                        onChange={e => onChange({...settings, minimumFee: Number(e.target.value)})}
                    />
                    <p className="text-xs text-gray-500 mt-1">Ensures platform covers basic gateway costs on small orders.</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Max Wallet Adjustment ($)</label>
                    <input 
                        type="number" 
                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
                        value={settings.maxAdjustment ?? 100000}
                        onChange={e => onChange({...settings, maxAdjustment: Number(e.target.value)})}
                    />
                    <p className="text-xs text-gray-500 mt-1">Caps per-action balance adjustment for admin operations.</p>
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-200">
                    <button onClick={onSave} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-indigo-700 transition shadow-sm disabled:opacity-60" disabled={saving}>
                        {saving ? 'Saving...' : 'Save Commission Settings'}
                    </button>
                </div>
            </div>
        </div>
    );

// --- Main Component ---

const FinancialsTab: React.FC = () => {
    const { user } = useUser();
    const { formatPrice } = useCurrency();
    const { showNotification } = useNotification();
    const [activeView, setActiveView] = useState<'overview' | 'ledger' | 'wallets' | 'payouts' | 'payout_accounts' | 'fraud' | 'settings'>('overview');
    
    // Data
    const [financials, setFinancials] = useState<PlatformFinancials | null>(null);
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
    const [payoutAccounts, setPayoutAccounts] = useState<any[]>([]);
    const [payoutAccountsLoading, setPayoutAccountsLoading] = useState(false);
    const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null);
    const [selectedPayoutAccount, setSelectedPayoutAccount] = useState<any | null>(null);
    const [alerts, setAlerts] = useState<FraudAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
    const [commissionSettings, setCommissionSettings] = useState<GlobalCommissionSettings>({
        freelancerFeeType: 'percentage',
        freelancerFeeValue: 0,
        employerFeeType: 'percentage',
        employerFeeValue: 0,
        minimumFee: 0,
        maxAdjustment: 100000
    });
    const [payoutMethodsConfig, setPayoutMethodsConfig] = useState<PayoutMethodOption[]>([]);
    const [payoutMethodsLoading, setPayoutMethodsLoading] = useState(false);
    const [savingPayoutMethods, setSavingPayoutMethods] = useState(false);
    const [savingCommission, setSavingCommission] = useState(false);
    const maxAdjustment = Number(commissionSettings.maxAdjustment ?? commissionSettings.max_adjustment ?? 100000);
    const [adjustTarget, setAdjustTarget] = useState<Wallet | null>(null);
    const [historyTarget, setHistoryTarget] = useState<Wallet | null>(null);
    const [adjustAmount, setAdjustAmount] = useState('');
    const [adjustReason, setAdjustReason] = useState('');
    const [adjusting, setAdjusting] = useState(false);
    const [historyStartDate, setHistoryStartDate] = useState('');
    const [historyEndDate, setHistoryEndDate] = useState('');

    // Filters & Search
    const [searchTerm, setSearchTerm] = useState('');
    const [userFilter, setUserFilter] = useState('');

    useEffect(() => {
        loadAllData();
    }, []);

    const loadAllData = async () => {
        setLoading(true);
        try {
            const [finData, txData, wData, aData, cData, wdData, pmData] = await Promise.all([
                WalletService.getPlatformFinancials(),
                WalletService.getAllTransactions(),
                WalletService.getAllWallets(),
                AdminService.getFraudAlerts(),
                WalletService.getCommissionSettings(),
                WalletService.getWithdrawalRequests(),
                WalletService.getPayoutMethodsAdmin()
            ]);
            setFinancials(finData);
            setTransactions(txData);
            setWallets(wData);
            setAlerts(aData);
            setCommissionSettings(cData || commissionSettings);
            setWithdrawals(wdData || []);
            const list = Array.isArray(pmData?.methods) ? pmData.methods : Array.isArray(pmData) ? pmData : [];
            setPayoutMethodsConfig(list);
        } catch (error) {
            console.error('Failed to load financial data:', error);
            showNotification('error', 'Load Error', 'Failed to load financial data');
        } finally {
            setLoading(false);
        }
    };

    const refreshWithdrawals = async () => {
        setWithdrawalsLoading(true);
        try {
            const data = await WalletService.getWithdrawalRequests();
            setWithdrawals(data || []);
        } catch (error) {
            showNotification('error', 'Load Error', 'Failed to load withdrawal requests');
        } finally {
            setWithdrawalsLoading(false);
        }
    };

    const refreshPayoutAccounts = async () => {
        setPayoutAccountsLoading(true);
        try {
            const data = await WalletService.getPayoutAccountsAdmin();
            setPayoutAccounts(data || []);
        } catch (error) {
            showNotification('error', 'Load Error', 'Failed to load payout accounts');
        } finally {
            setPayoutAccountsLoading(false);
        }
    };

    const refreshPayoutMethods = async () => {
        setPayoutMethodsLoading(true);
        try {
            const data = await WalletService.getPayoutMethodsAdmin();
            const list = Array.isArray(data?.methods) ? data.methods : Array.isArray(data) ? data : [];
            setPayoutMethodsConfig(list);
        } catch (error) {
            showNotification('error', 'Load Error', 'Failed to load payout methods');
        } finally {
            setPayoutMethodsLoading(false);
        }
    };

    const handleSavePayoutMethods = async () => {
        setSavingPayoutMethods(true);
        try {
            await WalletService.savePayoutMethodsAdmin(payoutMethodsConfig || []);
            showNotification('success', 'Saved', 'Payout methods updated.');
            refreshPayoutMethods();
        } catch (error: any) {
            showNotification('error', 'Save Failed', error?.message || 'Failed to save payout methods');
        } finally {
            setSavingPayoutMethods(false);
        }
    };

    const handleViewPayoutAccount = async (account: any) => {
        try {
            const detail = await WalletService.getPayoutAccountAdmin(account.user_id);
            setSelectedPayoutAccount({
                ...account,
                ...detail,
                history: detail?.history || []
            });
        } catch (error) {
            showNotification('error', 'Load Error', 'Failed to load payout account details');
        }
    };

    const handleApproveWithdrawal = async (req: WithdrawalRequest) => {
        if (!confirm('Approve this withdrawal?')) return;
        try {
            await WalletService.approveWithdrawal(req.id);
            showNotification('success', 'Approved', 'Withdrawal approved.');
            refreshWithdrawals();
            loadAllData();
        } catch (error: any) {
            showNotification('error', 'Approval Failed', error?.message || 'Unable to approve withdrawal');
        }
    };

    const handleRejectWithdrawal = async (req: WithdrawalRequest) => {
        if (!confirm('Reject this withdrawal? Funds will be returned.')) return;
        try {
            await WalletService.rejectWithdrawal(req.id);
            showNotification('success', 'Rejected', 'Withdrawal rejected.');
            refreshWithdrawals();
            loadAllData();
        } catch (error: any) {
            showNotification('error', 'Rejection Failed', error?.message || 'Unable to reject withdrawal');
        }
    };

    const handleMarkPaid = async (req: WithdrawalRequest) => {
        if (!confirm('Mark this withdrawal as paid?')) return;
        try {
            await WalletService.markWithdrawalPaid(req.id);
            showNotification('success', 'Completed', 'Withdrawal marked as paid.');
            refreshWithdrawals();
            loadAllData();
        } catch (error: any) {
            showNotification('error', 'Update Failed', error?.message || 'Unable to mark withdrawal as paid');
        }
    };

    const renderWithdrawalDetails = (details: any) => {
        if (!details || typeof details !== 'object') return '-';
        const methodDetails = [
            details.bankName ? `Bank: ${details.bankName}` : null,
            details.accountNumber ? `Acct: ****${String(details.accountNumber).slice(-4)}` : null,
            details.paypalEmail ? `PayPal: ${details.paypalEmail}` : null,
            details.stripeAccountId ? `Stripe: ${details.stripeAccountId}` : null,
            details.country ? `Country: ${details.country}` : null,
            details.currency ? `Currency: ${details.currency}` : null
        ].filter(Boolean);
        return methodDetails.join(' - ');
    };

    // --- Admin Actions ---

    const handleFreeze = async (wallet: Wallet) => {
        if (confirm(`Are you sure you want to ${wallet.frozen ? 'UNFREEZE' : 'FREEZE'} this wallet?`)) {
            try {
                if (wallet.frozen) {
                    await WalletService.adminUnfreezeWallet(wallet.user_id as string);
                } else {
                    await WalletService.adminFreezeWallet(wallet.user_id as string, 'Admin Manual Action');
                }
                
                showNotification('success', 'Status Updated', `Wallet ${wallet.frozen ? 'unfrozen' : 'frozen'}`);
                loadAllData();
            } catch (error) {
                showNotification('error', 'Action Failed', 'Failed to update wallet status');
            }
        }
    };

    const handleReverse = async (tx: WalletTransaction) => {
        if (tx.status === 'reversed') return;
        if (confirm(`Reverse transaction ${tx.id}? Funds will be deducted/returned.`)) {
            try {
                await WalletService.adminReverseTransaction(tx.id, user?.id || '');
                showNotification('success', 'Reversed', 'Transaction reversed successfully.');
                loadAllData();
            } catch (error) {
                showNotification('error', 'Reversal Failed', 'Failed to reverse transaction');
            }
        }
    };

    // Filtered transactions based on search
    const normalizedUserFilter = userFilter.trim().toLowerCase();
    const filteredTransactions = transactions.filter(t => {
        const matchesSearch =
            (t.referenceId || t.reference_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.description || '').toLowerCase().includes(searchTerm.toLowerCase());
        const txUserId = (t.userId || t.user_id || '').toLowerCase();
        const matchesUser = normalizedUserFilter ? txUserId.includes(normalizedUserFilter) : true;
        return matchesSearch && matchesUser;
    });

    const handleOpenAdjust = (wallet: Wallet) => {
        setAdjustTarget(wallet);
        setAdjustAmount('');
        setAdjustReason('');
    };

    const handleAdjustSubmit = async () => {
        if (!adjustTarget) return;
        const amount = Number(adjustAmount);
        if (!Number.isFinite(amount) || amount === 0) {
            showNotification('error', 'Invalid Amount', 'Please enter a non-zero number.');
            return;
        }
        if (Math.abs(amount) > maxAdjustment) {
            showNotification('error', 'Amount Too Large', `Adjustment must be within +/- ${formatPrice(maxAdjustment)}.`);
            return;
        }
        try {
            setAdjusting(true);
            await WalletService.adminAdjustBalance(
                (adjustTarget as unknown as Record<string, any>).userId || (adjustTarget as unknown as Record<string, any>).user_id,
                amount,
                adjustReason || 'Admin adjustment'
            );
            showNotification('success', 'Adjusted', 'Wallet balance updated.');
            setAdjustTarget(null);
            loadAllData();
        } catch (error) {
            showNotification('error', 'Adjustment Failed', 'Unable to adjust wallet balance.');
        } finally {
            setAdjusting(false);
        }
    };

    const getUserAdjustments = (userId: string) => {
        const normalizedUser = (userId || '').toLowerCase();
        const adjustments = transactions.filter(tx => {
            const txUser = ((tx.userId || tx.user_id) || '').toLowerCase();
            const type = (tx.type || '').toString().toLowerCase();
            return txUser === normalizedUser && type === 'adjustment';
        });
        return adjustments;
    };

    const getLastAdjustment = (userId: string) => {
        const adjustments = getUserAdjustments(userId);
        if (adjustments.length === 0) return null;
        return adjustments.reduce((latest, current) => {
            const latestTime = new Date(latest.createdAt || latest.created_at || 0).getTime();
            const currentTime = new Date(current.createdAt || current.created_at || 0).getTime();
            return currentTime > latestTime ? current : latest;
        });
    };

    const exportAdjustmentsCsv = (entries: any[], userId: string) => {
        const header = ['id', 'user_id', 'amount', 'status', 'description', 'admin_note', 'created_at'];
        const rows = entries.map((tx) => [
            tx.id,
            tx.userId || tx.user_id || userId,
            tx.amount,
            tx.status,
            tx.description || '',
            tx.admin_note || '',
            tx.createdAt || tx.created_at || ''
        ]);
        const csv = [header, ...rows]
            .map((row) =>
                row
                    .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
                    .join(',')
            )
            .join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `wallet-adjustments-${userId}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            {/* Header / Nav */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 flex items-center">
                    <DollarSign className="w-6 h-6 mr-2 text-indigo-600" /> Financial Command Center
                </h2>
                <div className="flex space-x-2 overflow-x-auto">
                    <button 
                        onClick={() => setActiveView('overview')} 
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${activeView === 'overview' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        Overview
                    </button>
                    <button 
                        onClick={() => setActiveView('fraud')} 
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${activeView === 'fraud' ? 'bg-red-50 text-red-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        Fraud Monitor
                    </button>
                    <button 
                        onClick={() => setActiveView('ledger')} 
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${activeView === 'ledger' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        Global Ledger
                    </button>
                    <button 
                        onClick={() => setActiveView('wallets')} 
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${activeView === 'wallets' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        User Wallets
                    </button>
                            <button
                                onClick={() => setActiveView('payouts')} 
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${activeView === 'payouts' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                Payouts
                            </button>
                            <button
                                onClick={() => {
                                    setActiveView('payout_accounts');
                                    refreshPayoutAccounts();
                                }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${activeView === 'payout_accounts' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                Payout Accounts
                            </button>
                    <button 
                        onClick={() => setActiveView('settings')} 
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${activeView === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        <Settings className="w-4 h-4 mr-1 inline"/> Settings
                    </button>
                    <button 
                        onClick={loadAllData} 
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-full ml-2"
                        title="Refresh Data"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center p-10">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    <p className="mt-2 text-gray-600">Loading Financial Data...</p>
                </div>
            ) : (
                <>
                    {/* Overview Panel */}
                    {activeView === 'overview' && financials && (
                        <div className="animate-fade-in space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <StatCard 
                                    title="Platform Revenue" 
                                    value={formatPrice(financials.platformRevenue)} 
                                    icon={DollarSign} 
                                    color="bg-green-600" 
                                />
                                <StatCard 
                                    title="Escrow Balance" 
                                    value={formatPrice(financials.totalEscrow)} 
                                    icon={Lock} 
                                    color="bg-purple-600" 
                                />
                                <StatCard 
                                    title="Pending Clearance" 
                                    value={formatPrice(financials.totalPendingClearance)} 
                                    icon={Clock} 
                                    color="bg-orange-500" 
                                />
                                <StatCard 
                                    title="User Funds (Cleared)" 
                                    value={formatPrice(financials.totalClearedUserFunds)} 
                                    icon={ArrowUpRight} 
                                    color="bg-blue-500" 
                                />
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <FraudAlertPanel alerts={alerts.filter(a => !a.reviewed)} />
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <h3 className="font-bold text-gray-900 mb-4">Risk & Safety Metrics</h3>
                                    <div className="p-4 bg-gray-50 border border-gray-100 rounded-lg">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-gray-600 font-medium text-sm">Refund Pool</span>
                                            <ShieldAlert className="w-4 h-4 text-gray-400" />
                                        </div>
                                        <div className="text-xl font-bold text-gray-900">{formatPrice(financials.refundPool)}</div>
                                        <p className="text-xs text-gray-500 mt-1">Available for immediate disputes</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeView === 'fraud' && (
                        <div className="animate-fade-in">
                            <FraudAlertPanel alerts={alerts} />
                        </div>
                    )}

                    {activeView === 'settings' && (
                        <div className="space-y-6">
                            <CommissionSettingsPanel
                                settings={commissionSettings}
                                saving={savingCommission}
                                onChange={setCommissionSettings}
                                onSave={async () => {
                                    try {
                                        setSavingCommission(true);
                                        await WalletService.saveCommissionSettings(commissionSettings);
                                        const updated = await WalletService.getCommissionSettings();
                                        setCommissionSettings(updated || commissionSettings);
                                        showNotification('success', 'Settings Saved', 'Commission rates updated successfully.');
                                    } catch (error) {
                                        showNotification('error', 'Save Failed', 'Unable to save commission settings.');
                                    } finally {
                                        setSavingCommission(false);
                                    }
                                }}
                            />
                            <PayoutMethodsPanel
                                methods={payoutMethodsConfig}
                                onChange={setPayoutMethodsConfig}
                                onSave={handleSavePayoutMethods}
                                onReload={refreshPayoutMethods}
                                saving={savingPayoutMethods}
                                loading={payoutMethodsLoading}
                            />
                        </div>
                    )}

                    {/* Global Ledger */}
                    {activeView === 'ledger' && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
                            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-800">Transaction History</h3>
                                <div className="flex items-center space-x-2">
                                    <Search className="h-4 w-4 text-gray-400" />
                                    <input 
                                        type="text" 
                                        placeholder="User ID..." 
                                        className="pl-2 pr-4 py-1 border rounded-lg text-sm w-48 focus:outline-none focus:border-indigo-500"
                                        value={userFilter}
                                        onChange={e => setUserFilter(e.target.value)}
                                    />
                                    <input 
                                        type="text" 
                                        placeholder="Search Ref ID or Description..." 
                                        className="pl-2 pr-4 py-1 border rounded-lg text-sm w-48 focus:outline-none focus:border-indigo-500"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 uppercase font-medium text-xs">
                                        <tr>
                                            <th className="px-6 py-3">Date</th>
                                            <th className="px-6 py-3">Type</th>
                                            <th className="px-6 py-3">User</th>
                                            <th className="px-6 py-3">Reference</th>
                                            <th className="px-6 py-3 text-right">Amount</th>
                                            <th className="px-6 py-3">Status</th>
                                            <th className="px-6 py-3">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredTransactions.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                                    No transactions found matching your search
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredTransactions.map((tx) => (
                                                <tr key={tx.id} className={`hover:bg-gray-50 ${tx.status === 'reversed' ? 'opacity-50 line-through bg-gray-50' : ''}`}>
                                                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                                                        {new Date(tx.createdAt || tx.created_at).toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4 capitalize font-medium">{tx.type}</td>
                                                    <td className="px-6 py-4 font-mono text-xs text-gray-500">
                                                        {tx.userId || tx.user_id || '-'}
                                                    </td>
                                                    <td className="px-6 py-4 font-mono text-xs text-gray-500">
                                                        {tx.referenceId || tx.reference_id || '-'}
                                                    </td>
                                                    <td className={`px-6 py-4 text-right font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-gray-900'}`}>
                                                        {formatPrice(tx.amount)}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                                            tx.status === 'cleared' ? 'bg-green-100 text-green-700' : 
                                                            tx.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 
                                                            'bg-red-100 text-red-700'
                                                        }`}>
                                                            {tx.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {tx.status !== 'reversed' && (
                                                            <button 
                                                                onClick={() => handleReverse(tx)}
                                                                className="text-red-600 hover:bg-red-50 p-1.5 rounded flex items-center text-xs border border-red-200"
                                                                title="Reverse Transaction"
                                                            >
                                                                <RotateCcw className="w-3 h-3 mr-1" /> Reverse
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* User Wallets Management */}
                    {activeView === 'wallets' && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="grid grid-cols-1 gap-4">
                                {wallets.length === 0 ? (
                                    <div className="text-center py-10 text-gray-500">
                                        No wallets found
                                    </div>
                                ) : (
                                            wallets.map(wallet => (
                                        <div key={wallet.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row items-center justify-between">
                                            <div className="flex items-center space-x-4 mb-4 md:mb-0">
                                                <div className={`p-3 rounded-full ${wallet.frozen ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                                    {wallet.frozen ? <Ban className="w-6 h-6" /> : <CheckCircle className="w-6 h-6" />}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-gray-900">User ID: {wallet.userId || wallet.user_id}</h4>
                                                    <p className="text-xs text-gray-500 font-mono">Wallet ID: {wallet.id}</p>
                                                    {(() => {
                                                        const last = getLastAdjustment(wallet.userId || wallet.user_id);
                                                        if (!last) return null;
                                                        return (
                                                            <p className="text-xs text-gray-500 mt-1">
                                    Last adjustment: {formatPrice(last.amount)} - {new Date(last.createdAt || last.created_at).toLocaleString()}
                                                            </p>
                                                        );
                                                    })()}
                                                    {wallet.frozen && (
                                                        <span className="text-xs text-red-600 font-bold uppercase">FROZEN</span>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <div className="flex space-x-8 text-center">
                                                <div>
                                                    <div className="text-xs text-gray-500 uppercase font-bold">Available</div>
                                                    <div className="text-lg font-bold text-green-600">
                                                        {formatPrice(wallet.availableBalance ?? wallet.available_balance ?? 0)}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-gray-500 uppercase font-bold">Pending</div>
                                                    <div className="text-lg font-bold text-yellow-600">
                                                        {formatPrice(wallet.pendingClearance ?? wallet.pending_clearance ?? 0)}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-gray-500 uppercase font-bold">Escrow</div>
                                                    <div className="text-lg font-bold text-purple-600">
                                                        {formatPrice(wallet.escrowBalance ?? wallet.escrow_balance ?? 0)}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex space-x-2 mt-4 md:mt-0">
                                                <button 
                                                    onClick={() => handleOpenAdjust(wallet)}
                                                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium transition"
                                                >
                                                    Adjust Balance
                                                </button>
                                                <button
                                                    onClick={() => setHistoryTarget(wallet)}
                                                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium transition"
                                                >
                                                    View Adjustments
                                                </button>
                                                <button 
                                                    onClick={() => handleFreeze(wallet)}
                                                    className={`px-3 py-2 rounded-lg text-sm font-bold text-white transition flex items-center ${wallet.frozen ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                                                >
                                                    {wallet.frozen ? (
                                                        <>
                                                            <Unlock className="w-3 h-3 mr-1"/> Unfreeze
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Ban className="w-3 h-3 mr-1"/> Freeze
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            {wallets.length > 0 && (
                                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                                    <p className="text-xs text-gray-500">
                                        Adjustments are capped at +/- {formatPrice(maxAdjustment)} per action.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeView === 'payouts' && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200">
                                <div>
                                    <h3 className="font-bold text-gray-900">Withdrawal Requests</h3>
                                    <p className="text-xs text-gray-500">Approve and process user withdrawals.</p>
                                </div>
                                <button
                                    onClick={refreshWithdrawals}
                                    className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50 flex items-center"
                                >
                                    <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                                </button>
                            </div>

                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-500">
                                        <tr>
                                            <th className="px-6 py-3 text-left">User</th>
                                            <th className="px-6 py-3 text-left">Method</th>
                                            <th className="px-6 py-3 text-left">Details</th>
                                            <th className="px-6 py-3 text-right">Amount</th>
                                            <th className="px-6 py-3 text-left">Status</th>
                                            <th className="px-6 py-3 text-left">Requested</th>
                                            <th className="px-6 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {withdrawalsLoading ? (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-6 text-center text-xs text-gray-500">
                                                    Loading withdrawal requests...
                                                </td>
                                            </tr>
                                        ) : withdrawals.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-6 text-center text-xs text-gray-500">
                                                    No withdrawal requests yet.
                                                </td>
                                            </tr>
                                        ) : (
                                            withdrawals.map((req) => (
                                                <tr key={req.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">{req.user_name || req.user_id}</div>
                                                        <div className="text-xs text-gray-500">{req.user_id}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-xs font-semibold uppercase text-gray-700">
                                                        {req.method}
                                                    </td>
                                                    <td className="px-6 py-4 text-xs text-gray-500">
                                                        {renderWithdrawalDetails(req.details)}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-bold text-gray-900">
                                                        {formatPrice(req.amount)}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                                            req.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                            req.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                                                            req.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                                            req.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
                                                            'bg-red-100 text-red-700'
                                                        }`}>
                                                            {req.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-xs text-gray-500">
                                                        {new Date(req.requested_at || req.created_at || Date.now()).toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4 text-right space-x-2">
                                                        {req.status === 'pending' && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleApproveWithdrawal(req)}
                                                                    className="px-3 py-1.5 text-xs font-bold rounded border border-green-200 text-green-700 hover:bg-green-50"
                                                                >
                                                                    Approve
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRejectWithdrawal(req)}
                                                                    className="px-3 py-1.5 text-xs font-bold rounded border border-red-200 text-red-600 hover:bg-red-50"
                                                                >
                                                                    Reject
                                                                </button>
                                                            </>
                                                        )}
                                                        {req.status === 'processing' && (
                                                            <button
                                                                onClick={() => handleMarkPaid(req)}
                                                                className="px-3 py-1.5 text-xs font-bold rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
                                                            >
                                                                Mark Paid
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => setSelectedWithdrawal(req)}
                                                            className="px-3 py-1.5 text-xs font-bold rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
                                                        >
                                                            View Details
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeView === 'payout_accounts' && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200">
                                <div>
                                    <h3 className="font-bold text-gray-900">User Payout Accounts</h3>
                                    <p className="text-xs text-gray-500">View saved payout details and change history.</p>
                                </div>
                                <button
                                    onClick={refreshPayoutAccounts}
                                    className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50 flex items-center"
                                >
                                    <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                                </button>
                            </div>

                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-500">
                                        <tr>
                                            <th className="px-6 py-3 text-left">User</th>
                                            <th className="px-6 py-3 text-left">Country/Currency</th>
                                            <th className="px-6 py-3 text-left">Methods</th>
                                            <th className="px-6 py-3 text-left">Updated</th>
                                            <th className="px-6 py-3 text-right">History</th>
                                            <th className="px-6 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {payoutAccountsLoading ? (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-6 text-center text-xs text-gray-500">
                                                    Loading payout accounts...
                                                </td>
                                            </tr>
                                        ) : payoutAccounts.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-6 text-center text-xs text-gray-500">
                                                    No payout accounts saved yet.
                                                </td>
                                            </tr>
                                        ) : (
                                            payoutAccounts.map((acc) => (
                                                <tr key={acc.user_id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">{acc.user_name || acc.user_id}</div>
                                                        <div className="text-xs text-gray-500">{acc.user_email || acc.user_id}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-xs text-gray-600">
                                                        {(acc.country || acc.user_country || '-') + ' / ' + (acc.currency || '-')}
                                                    </td>
                                                    <td className="px-6 py-4 text-xs text-gray-600">
                                                        {(acc.methods || []).length ? acc.methods.join(', ') : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 text-xs text-gray-500">
                                                        {new Date(acc.updated_at || Date.now()).toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4 text-right text-xs font-bold text-gray-700">
                                                        {acc.history_count ?? 0}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button
                                                            onClick={() => handleViewPayoutAccount(acc)}
                                                            className="px-3 py-1.5 text-xs font-bold rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
                                                        >
                                                            View
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {adjustTarget && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-lg p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Adjust Wallet Balance</h3>
                        <p className="text-xs text-gray-500 mb-4 font-mono">
                            User ID: {(adjustTarget as any).userId || (adjustTarget as any).user_id}
                        </p>
                        {(() => {
                            const last = getLastAdjustment((adjustTarget as any).userId || (adjustTarget as any).user_id);
                            if (!last) return null;
                            return (
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-xs text-gray-600">
                                    Last adjustment: {formatPrice(last.amount)} on {new Date(last.createdAt || last.created_at).toLocaleString()}
                                    {last.admin_note ? ` - ${last.admin_note}` : ''}
                                </div>
                            );
                        })()}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                                <input
                                    type="number"
                                    placeholder="Use negative for debit"
                                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
                                    value={adjustAmount}
                                    onChange={e => setAdjustAmount(e.target.value)}
                                />
                                <p className="text-xs text-gray-500 mt-1">Max per action: +/- {formatPrice(maxAdjustment)}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Reason</label>
                                <input
                                    type="text"
                                    placeholder="Reason for adjustment"
                                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
                                    value={adjustReason}
                                    onChange={e => setAdjustReason(e.target.value)}
                                />
                            </div>
                            <div className="flex justify-end space-x-2 pt-2">
                                <button
                                    onClick={() => setAdjustTarget(null)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAdjustSubmit}
                                    className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60"
                                    disabled={adjusting}
                                >
                                    {adjusting ? 'Saving...' : 'Apply Adjustment'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {historyTarget && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-end z-50">
                    <div className="bg-white h-full w-full max-w-md shadow-lg border-l border-gray-200 p-6 overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Adjustment History</h3>
                            <button
                                onClick={() => setHistoryTarget(null)}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                Close
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mb-4 font-mono">
                            User ID: {(historyTarget as any).userId || (historyTarget as any).user_id}
                        </p>
                        {(() => {
                            const targetUserId = (historyTarget as any).userId || (historyTarget as any).user_id;
                            const startTime = historyStartDate ? new Date(historyStartDate).getTime() : null;
                            const endTime = historyEndDate ? new Date(`${historyEndDate}T23:59:59`).getTime() : null;
                            const list = getUserAdjustments(targetUserId)
                                .filter((tx) => {
                                    const createdTime = new Date(tx.createdAt || tx.created_at || 0).getTime();
                                    if (startTime && createdTime < startTime) return false;
                                    if (endTime && createdTime > endTime) return false;
                                    return true;
                                })
                                .sort((a, b) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime());
                            if (list.length === 0) {
                                return <p className="text-sm text-gray-500">No adjustments found.</p>;
                            }
                            return (
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-end gap-2">
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Start</label>
                                            <input
                                                type="date"
                                                className="border border-gray-300 rounded-md px-2 py-1 text-xs"
                                                value={historyStartDate}
                                                onChange={(e) => setHistoryStartDate(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">End</label>
                                            <input
                                                type="date"
                                                className="border border-gray-300 rounded-md px-2 py-1 text-xs"
                                                value={historyEndDate}
                                                onChange={(e) => setHistoryEndDate(e.target.value)}
                                            />
                                        </div>
                                        <button
                                            onClick={() => exportAdjustmentsCsv(list, targetUserId)}
                                            className="ml-auto px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium hover:bg-gray-50"
                                        >
                                            Export CSV
                                        </button>
                                    </div>
                                    {list.slice(0, 20).map(tx => (
                                        <div key={tx.id} className="border border-gray-200 rounded-lg p-3">
                                            <div className="flex items-center justify-between">
                                                <span className={`text-sm font-bold ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {formatPrice(tx.amount)}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    {new Date(tx.createdAt || tx.created_at).toLocaleString()}
                                                </span>
                                            </div>
                                            {tx.admin_note && (
                                                <p className="text-xs text-gray-500 mt-2">{tx.admin_note}</p>
                                            )}
                                            {tx.description && (
                                                <p className="text-xs text-gray-400 mt-1">{tx.description}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {selectedWithdrawal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Withdrawal Details</h3>
                            <button onClick={() => setSelectedWithdrawal(null)} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                                <div className="text-xs text-gray-500">User</div>
                                <div className="font-medium text-gray-900">{selectedWithdrawal.user_name || selectedWithdrawal.user_id}</div>
                                <div className="text-xs text-gray-500">{selectedWithdrawal.user_id}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Status</div>
                                <div className="font-medium text-gray-900">{selectedWithdrawal.status}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Method</div>
                                <div className="font-medium text-gray-900">{selectedWithdrawal.method}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Amount</div>
                                <div className="font-medium text-gray-900">{formatPrice(selectedWithdrawal.amount)}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Requested At</div>
                                <div className="font-medium text-gray-900">{new Date(selectedWithdrawal.requested_at || selectedWithdrawal.created_at || Date.now()).toLocaleString()}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Details</div>
                                <div className="font-medium text-gray-900">{renderWithdrawalDetails(selectedWithdrawal.details)}</div>
                            </div>
                        </div>
                        <div className="mt-4 border-t pt-4">
                            <div className="text-xs text-gray-500 mb-2">Raw Details</div>
                            <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-auto max-h-56">{JSON.stringify(selectedWithdrawal.details || {}, null, 2)}</pre>
                        </div>
                    </div>
                </div>
            )}

            {selectedPayoutAccount && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-3xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Payout Account Details</h3>
                            <button onClick={() => setSelectedPayoutAccount(null)} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                                <div className="text-xs text-gray-500">User</div>
                                <div className="font-medium text-gray-900">{selectedPayoutAccount.user_name || selectedPayoutAccount.user_id}</div>
                                <div className="text-xs text-gray-500">{selectedPayoutAccount.user_email || selectedPayoutAccount.user_id}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Country/Currency</div>
                                <div className="font-medium text-gray-900">{(selectedPayoutAccount.country || selectedPayoutAccount.user_country || '-') + ' / ' + (selectedPayoutAccount.currency || '-')}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Methods</div>
                                <div className="font-medium text-gray-900">{(selectedPayoutAccount.methods || []).join(', ') || '-'}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Updated</div>
                                <div className="font-medium text-gray-900">{new Date(selectedPayoutAccount.updated_at || Date.now()).toLocaleString()}</div>
                            </div>
                        </div>
                        <div className="mt-4 border-t pt-4">
                            <div className="text-xs text-gray-500 mb-2">Details</div>
                            <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-auto max-h-56">{JSON.stringify(selectedPayoutAccount.details || {}, null, 2)}</pre>
                        </div>
                        {(selectedPayoutAccount.history_count ?? 0) > 0 && (
                            <div className="mt-4 border-t pt-4">
                                <div className="text-xs text-gray-500 mb-2">Change History (latest first)</div>
                                <div className="space-y-2 max-h-52 overflow-auto">
                                    {(selectedPayoutAccount.history || []).slice(0).reverse().map((item: any, idx: number) => (
                                        <div key={idx} className="border border-gray-200 rounded p-2 text-xs">
                                            <div className="text-gray-500">Updated: {new Date(item.updatedAt || Date.now()).toLocaleString()} by {item.updatedBy || 'user'}</div>
                                            <pre className="mt-1 bg-gray-50 rounded p-2 overflow-auto">{JSON.stringify(item.data || {}, null, 2)}</pre>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const payoutFieldTypes = [
    { value: 'text', label: 'Text' },
    { value: 'textarea', label: 'Textarea' },
    { value: 'email', label: 'Email' },
    { value: 'number', label: 'Number' },
    { value: 'select', label: 'Select' },
    { value: 'note', label: 'Note (display only)' }
];

const PayoutMethodsPanel: React.FC<PayoutMethodsPanelProps> = ({ methods, onChange, onSave, onReload, saving, loading }) => {
    const safeMethods = Array.isArray(methods)
        ? methods.filter((m) => m && typeof m === 'object')
        : [];
    const updateMethod = (index: number, patch: Partial<PayoutMethodOption>) => {
        const next = safeMethods.map((method, idx) => (idx === index ? { ...method, ...patch } : method));
        onChange(next);
    };

    const addMethod = () => {
        const newId = `custom_${Date.now()}`;
        onChange([
            ...safeMethods,
            {
                id: newId,
                name: 'New Method',
                enabled: true,
                note: '',
                fields: []
            }
        ]);
    };

    const removeMethod = (index: number) => {
        const next = safeMethods.filter((_, idx) => idx !== index);
        onChange(next);
    };

    const addField = (methodIndex: number) => {
        const method = safeMethods[methodIndex];
        const fields = Array.isArray(method.fields) ? method.fields : [];
        const nextField: PayoutMethodField = {
            key: `field_${Date.now()}`,
            label: 'New Field',
            type: 'text',
            required: false
        };
        updateMethod(methodIndex, { fields: [...fields, nextField] });
    };

    const updateField = (methodIndex: number, fieldIndex: number, patch: Partial<PayoutMethodField>) => {
        const method = safeMethods[methodIndex];
        const fields = Array.isArray(method.fields) ? method.fields : [];
        const nextFields = fields.map((field, idx) => (idx === fieldIndex ? { ...field, ...patch } : field));
        updateMethod(methodIndex, { fields: nextFields });
    };

    const removeField = (methodIndex: number, fieldIndex: number) => {
        const method = safeMethods[methodIndex];
        const fields = Array.isArray(method.fields) ? method.fields : [];
        const nextFields = fields.filter((_, idx) => idx !== fieldIndex);
        updateMethod(methodIndex, { fields: nextFields });
    };

    const duplicateIds = safeMethods.reduce((acc: Record<string, number>, method) => {
        const key = String(method.id || '').trim().toLowerCase();
        if (!key) return acc;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
                <div>
                    <h3 className="font-bold text-lg text-gray-900 flex items-center">
                        <Settings className="w-5 h-5 mr-2 text-indigo-600" /> Payout Methods
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                        Manage payout methods, add custom fields, and set maintenance notes for users.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onReload}
                        className="px-3 py-2 rounded-lg text-xs font-bold border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                        {loading ? 'Loading...' : 'Reload'}
                    </button>
                    <button
                        onClick={addMethod}
                        className="px-3 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                        <Plus className="w-4 h-4 inline-block mr-1" />
                        Add Method
                    </button>
                </div>
            </div>

            <div className="space-y-6">
                {safeMethods.length === 0 && (
                    <div className="text-sm text-gray-500">No payout methods configured yet.</div>
                )}

                {safeMethods.map((method, index) => (
                    <div key={`${method.id}-${index}`} className="border border-gray-200 rounded-xl p-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Method Name</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border rounded-lg"
                                        value={method.name || ''}
                                        onChange={(e) => updateMethod(index, { name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Method ID</label>
                                    <input
                                        type="text"
                                        className={`w-full px-3 py-2 border rounded-lg ${
                                            duplicateIds[(method.id || '').trim().toLowerCase()] > 1 ? 'border-red-300' : ''
                                        }`}
                                        value={method.id || ''}
                                        onChange={(e) => updateMethod(index, { id: e.target.value })}
                                        placeholder="bank_transfer"
                                    />
                                    {duplicateIds[(method.id || '').trim().toLowerCase()] > 1 && (
                                        <p className="text-xs text-red-500 mt-1">Method ID must be unique.</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-6 md:mt-0">
                                    <input
                                        type="checkbox"
                                        checked={method.enabled}
                                        onChange={(e) => updateMethod(index, { enabled: e.target.checked })}
                                        className="h-4 w-4"
                                    />
                                    <span className="text-sm text-gray-700">Enabled</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => removeMethod(index)}
                                    className="px-3 py-2 text-xs font-bold border border-gray-200 rounded-lg text-red-600 hover:bg-red-50"
                                >
                                    <Trash2 className="w-4 h-4 inline-block mr-1" />
                                    Remove
                                </button>
                            </div>
                        </div>

                        <div className="mt-4">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Maintenance Note</label>
                            <textarea
                                rows={2}
                                className="w-full px-3 py-2 border rounded-lg"
                                value={method.note || ''}
                                onChange={(e) => updateMethod(index, { note: e.target.value })}
                                placeholder="Explain maintenance or availability notes shown to users."
                            />
                        </div>

                        <div className="mt-4">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-bold text-gray-800">Custom Fields</div>
                                <button
                                    onClick={() => addField(index)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 hover:bg-gray-50"
                                >
                                    <Plus className="w-3 h-3 inline-block mr-1" />
                                    Add Field
                                </button>
                            </div>
                            <div className="space-y-3">
                                {(method.fields || []).length === 0 && (
                                    <div className="text-xs text-gray-500">No fields yet. Add fields to collect payout details.</div>
                                )}
                                {(method.fields || []).map((field, fieldIndex) => (
                                    <div key={`${method.id}-field-${fieldIndex}`} className="border border-gray-200 rounded-lg p-3">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                                                <input
                                                    type="text"
                                                    className="w-full px-3 py-2 border rounded-lg"
                                                    value={field.label || ''}
                                                    onChange={(e) => updateField(index, fieldIndex, { label: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Key</label>
                                                <input
                                                    type="text"
                                                    className="w-full px-3 py-2 border rounded-lg"
                                                    value={field.key || ''}
                                                    onChange={(e) => updateField(index, fieldIndex, { key: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                                                <select
                                                    className="w-full px-3 py-2 border rounded-lg"
                                                    value={field.type || 'text'}
                                                    onChange={(e) => updateField(index, fieldIndex, { type: e.target.value as any })}
                                                >
                                                    {payoutFieldTypes.map((t) => (
                                                        <option key={t.value} value={t.value}>
                                                            {t.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(field.required)}
                                                    onChange={(e) => updateField(index, fieldIndex, { required: e.target.checked })}
                                                    className="h-4 w-4"
                                                />
                                                <span className="text-xs text-gray-600">Required</span>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Placeholder</label>
                                                <input
                                                    type="text"
                                                    className="w-full px-3 py-2 border rounded-lg"
                                                    value={field.placeholder || ''}
                                                    onChange={(e) => updateField(index, fieldIndex, { placeholder: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                                                <input
                                                    type="text"
                                                    className="w-full px-3 py-2 border rounded-lg"
                                                    value={field.description || ''}
                                                    onChange={(e) => updateField(index, fieldIndex, { description: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        {field.type === 'select' && (
                                            <div className="mt-3">
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Options (comma separated)</label>
                                                <input
                                                    type="text"
                                                    className="w-full px-3 py-2 border rounded-lg"
                                                    value={(field.options || []).join(', ')}
                                                    onChange={(e) =>
                                                        updateField(index, fieldIndex, {
                                                            options: e.target.value
                                                                .split(',')
                                                                .map((opt) => opt.trim())
                                                                .filter(Boolean)
                                                        })
                                                    }
                                                />
                                            </div>
                                        )}
                                        <div className="mt-3 flex justify-end">
                                            <button
                                                onClick={() => removeField(index, fieldIndex)}
                                                className="px-3 py-1.5 text-xs font-bold text-red-600 border border-gray-200 rounded-lg hover:bg-red-50"
                                            >
                                                Remove Field
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex justify-end pt-6 border-t border-gray-200 mt-6">
                <button
                    onClick={onSave}
                    className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-indigo-700 transition shadow-sm disabled:opacity-60"
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save Payout Methods'}
                </button>
            </div>
        </div>
    );
};

export default FinancialsTab;
