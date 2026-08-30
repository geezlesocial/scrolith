
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Contract, ContractMilestone, PaymentGateway, TimeEntry } from '../../types';
import { ContractService } from '../../services/contract';
import { useCurrency } from '../../context/CurrencyContext';
import { Clock, CheckCircle, Play, PauseCircle, DollarSign, Download, Ban } from 'lucide-react';
import ATMTracker from '../../components/ATMTracker';
import { useNotification } from '../../context/NotificationContext';
import ConfirmModal from './ConfirmModal';
import { PaymentService } from '../../services/payment';
import { WalletService, walletApi } from '../../services/wallet';
import { getUserFacingPaymentMethodName } from '../../utils/paymentGatewayDisplay';
import { getContractPaymentSummary } from '../../utils/workflowNavigation';

interface ContractListProps {
    role: 'client' | 'freelancer' | 'admin';
    userId: string;
}

const CONTRACT_DUE_TOPUP_STORAGE_KEY = 'scrolith.contract_due_topup_pending';

interface PendingContractDueTopup {
    contractId: string;
    intentId: string;
    providerId: string;
    providerName: string;
    createdAt: number;
}

const ContractList: React.FC<ContractListProps> = ({ role, userId }) => {
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
    const [logs, setLogs] = useState<TimeEntry[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const { formatPrice } = useCurrency();
    const { showNotification } = useNotification();
    const [confirmState, setConfirmState] = useState<{
        title: string;
        message: string;
        variant?: 'danger' | 'warning' | 'info';
        onConfirm: () => Promise<void> | void;
    } | null>(null);
    const [showPayDueModal, setShowPayDueModal] = useState(false);
    const [duePaymentMethods, setDuePaymentMethods] = useState<PaymentGateway[]>([]);
    const [dueSelectedMethodId, setDueSelectedMethodId] = useState<string>('');
    const [dueWalletInfo, setDueWalletInfo] = useState<any>(null);
    const [dueMethodsLoading, setDueMethodsLoading] = useState(false);
    const [dueSubmitLoading, setDueSubmitLoading] = useState(false);
    const [duePaymentError, setDuePaymentError] = useState<string | null>(null);

    useEffect(() => {
        loadContracts();
    }, [role, userId, searchParams.toString()]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            if (document.visibilityState === 'hidden') return;
            void loadContracts(true);
            if (selectedContract?.id) {
                void refreshLogs(selectedContract.id);
            }
        }, 15000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [selectedContract?.id, role, userId, searchParams.toString()]);

    useEffect(() => {
        if (role !== 'client') return;
        const intentId = searchParams.get('topup_intent');
        if (!intentId) return;

        const pending = readPendingContractTopup();
        if (!pending || pending.intentId !== intentId) return;

        let cancelled = false;
        let attempts = 0;

        const poll = async () => {
            try {
                const status = await WalletService.getTopupStatus(intentId);
                if (cancelled) return;
                const state = (status?.status || '').toString().toLowerCase();

                if (state === 'succeeded') {
                    const paidAmount = await ContractService.payContractDue(pending.contractId, {
                        paymentMethodId: 'wallet',
                        fundingProvider: pending.providerId
                    });
                    if (cancelled) return;

                    showNotification(
                        'success',
                        'Payment Sent',
                        `Paid ${formatPrice(paidAmount)} using ${pending.providerName}.`
                    );

                    clearPendingContractTopup();
                    clearTopupQueryParams();
                    await loadContracts(true);
                    if (selectedContract?.id === pending.contractId) {
                        await refreshLogs(pending.contractId);
                    }
                    return;
                }

                if (state === 'failed' || state === 'cancelled' || state === 'expired') {
                    showNotification(
                        'error',
                        'Payment Incomplete',
                        'Top-up did not complete. Contract due has not been paid.'
                    );
                    clearPendingContractTopup();
                    clearTopupQueryParams();
                    return;
                }
            } catch {
                // Continue polling up to max attempts.
            }

            attempts += 1;
            if (!cancelled && attempts < 20) {
                window.setTimeout(poll, 3000);
            }
        };

        void poll();

        return () => {
            cancelled = true;
        };
    }, [formatPrice, role, searchParams, selectedContract?.id, setSearchParams, showNotification]);

    const getContractFromQuery = () =>
        searchParams.get('contract') || searchParams.get('contract_id') || searchParams.get('contractId');

    const readPendingContractTopup = (): PendingContractDueTopup | null => {
        try {
            const raw = window.localStorage.getItem(CONTRACT_DUE_TOPUP_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as PendingContractDueTopup;
            if (!parsed?.contractId || !parsed?.intentId || !parsed?.providerId) return null;
            return parsed;
        } catch {
            return null;
        }
    };

    const writePendingContractTopup = (value: PendingContractDueTopup) => {
        try {
            window.localStorage.setItem(CONTRACT_DUE_TOPUP_STORAGE_KEY, JSON.stringify(value));
        } catch {
            // ignore storage failures
        }
    };

    const clearPendingContractTopup = () => {
        try {
            window.localStorage.removeItem(CONTRACT_DUE_TOPUP_STORAGE_KEY);
        } catch {
            // ignore storage failures
        }
    };

    const clearTopupQueryParams = () => {
        setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.delete('topup_intent');
            next.delete('topup_status');
            return next;
        }, { replace: true });
    };

    const getMilestones = (contract?: Contract | null): ContractMilestone[] =>
        Array.isArray(contract?.milestones) ? contract.milestones : [];

    const getFixedContractStats = (contract?: Contract | null) => {
        const milestones = getMilestones(contract);
        const paymentSummary = getContractPaymentSummary(contract || { type: 'fixed', milestones: [] });
        const completedCount = milestones.filter((entry) => entry.status === 'paid').length;
        const nextMilestone = milestones.find((entry) => entry.status !== 'paid') || null;
        return {
            milestones,
            paidTotal: paymentSummary.paidAmount,
            approvedTotal: paymentSummary.approvedAmount,
            submittedTotal: paymentSummary.submittedAmount,
            completedCount,
            nextMilestone
        };
    };

    const loadContracts = async (silent = false) => {
        try {
            const data = await ContractService.getContracts(userId, role);
            setContracts(data);

            const preselectId = getContractFromQuery();
            if (preselectId) {
                const found = data.find(c => c.id === preselectId);
                if (found) {
                    setSelectedContract(found);
                    if (selectedContract?.id !== found.id) {
                        await refreshLogs(found.id);
                    }
                    return;
                }
            }

            if (selectedContract) {
                const updated = data.find(c => c.id === selectedContract.id);
                if (updated) {
                    setSelectedContract(updated);
                } else {
                    setSelectedContract(null);
                    setLogs([]);
                }
            }
        } catch (error: any) {
            if (!silent) {
                showNotification('error', 'Contract error', error?.message || 'Failed to load contracts.');
            }
        }
    };

    const handleSelect = async (contract: Contract) => {
        setSelectedContract(contract);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('tab', 'contracts');
        nextParams.set('contract', contract.id);
        nextParams.set('contract_id', contract.id);
        setSearchParams(nextParams, { replace: true });
        refreshLogs(contract.id);
    };

    const refreshLogs = async (contractId: string) => {
        const entries = await ContractService.getTimeEntries(contractId);
        setLogs(entries);
    };

    const handleMilestoneStatusChange = async (
        contractId: string,
        milestoneId: string,
        status: ContractMilestone['status']
    ) => {
        const updatedMilestones = await ContractService.updateMilestoneStatus(contractId, milestoneId, status);
        setContracts((current) =>
            current.map((contract) =>
                contract.id === contractId ? { ...contract, milestones: updatedMilestones } : contract
            )
        );
        setSelectedContract((current) =>
            current && current.id === contractId ? { ...current, milestones: updatedMilestones } : current
        );
        showNotification('success', 'Milestone Updated', `Milestone marked as ${status}.`);
    };
    
    // --- ACTIONS ---

    const handleApproveLog = async (logId: string) => {
        await ContractService.approveTimeEntry(logId);
        showNotification('success', 'Approved', 'Time log approved for payment.');
        if (selectedContract) {
            refreshLogs(selectedContract.id);
            loadContracts(); // Refresh to update earningsPending
        }
    };
    
    const handleStatusChange = async (contractId: string, status: Contract['status']) => {
        const actionLabel = status === 'active' ? 'Resume' : status === 'terminated' ? 'Terminate' : 'Pause';
        setConfirmState({
            title: `${actionLabel} Contract`,
            message: `Are you sure you want to ${actionLabel.toLowerCase()} this contract?`,
            variant: status === 'terminated' ? 'danger' : 'warning',
            onConfirm: async () => {
                await ContractService.updateStatus(contractId, status);
                await loadContracts();
                if (selectedContract?.id === contractId) {
                    setSelectedContract(prev => prev ? { ...prev, status } : null);
                }
                showNotification('success', 'Status Updated', `Contract is now ${status}.`);
            }
        });
    };

    const loadDuePaymentMethods = async (requiredAmount: number) => {
        setDueMethodsLoading(true);
        setDuePaymentError(null);
        try {
            const [gateways, wallet] = await Promise.all([
                PaymentService.getActivePaymentMethods().catch(() => []),
                walletApi.getWalletInfo().catch(() => null)
            ]);

            setDueWalletInfo(wallet || null);

            const walletCurrency = (wallet?.currency || 'USD').toUpperCase();
            const walletBalance = Number(wallet?.availableBalance ?? wallet?.available_balance ?? 0);

            const walletMethod: PaymentGateway | null = wallet
                ? ({
                      id: 'wallet',
                      name: 'Wallet Balance',
                      is_enabled: true,
                      isEnabled: true,
                      mode: 'test',
                      logo: '',
                      supported_currencies: [walletCurrency],
                      balance: walletBalance
                  } as unknown as PaymentGateway)
                : null;

            const externalMethods = (Array.isArray(gateways) ? gateways : [])
                .map((gateway: any) => ({
                    ...gateway,
                    name: getUserFacingPaymentMethodName(gateway)
                }))
                .filter((gateway: any) => gateway?.id && gateway.id !== 'wallet');

            const allMethods = walletMethod ? [walletMethod, ...externalMethods] : externalMethods;

            setDuePaymentMethods(allMethods as PaymentGateway[]);
            if (!allMethods.length) {
                setDueSelectedMethodId('');
                setDuePaymentError('No payment methods are available right now.');
                return;
            }

            const preferredMethod =
                (walletMethod && walletBalance >= requiredAmount ? walletMethod : null) || allMethods[0];
            setDueSelectedMethodId(preferredMethod?.id || '');
        } catch (error: any) {
            setDuePaymentMethods([]);
            setDueSelectedMethodId('');
            setDuePaymentError(error?.message || 'Failed to load payment methods.');
        } finally {
            setDueMethodsLoading(false);
        }
    };

    const handlePayCurrentDue = async () => {
        if (!selectedContract) return;

        const amount = selectedContract.earningsPending || 0;
        if (amount <= 0) {
            showNotification('info', 'Nothing to Pay', 'There are no pending earnings to pay right now.');
            return;
        }

        setDuePaymentError(null);
        clearPendingContractTopup();
        setShowPayDueModal(true);
        await loadDuePaymentMethods(amount);
    };

    const handleSubmitPayCurrentDue = async () => {
        if (!selectedContract) return;
        const amount = Number(selectedContract.earningsPending || 0);
        if (amount <= 0) {
            setDuePaymentError('There are no pending earnings to pay right now.');
            return;
        }
        if (!dueSelectedMethodId) {
            setDuePaymentError('Please select a payment method.');
            return;
        }

        const selectedMethod = duePaymentMethods.find((method: any) => method.id === dueSelectedMethodId);
        const selectedMethodName = getUserFacingPaymentMethodName(
            selectedMethod || ({ id: dueSelectedMethodId } as any)
        );

        if (dueSelectedMethodId === 'wallet') {
            const walletBalance = Number(dueWalletInfo?.availableBalance ?? dueWalletInfo?.available_balance ?? 0);
            if (walletBalance < amount) {
                setDuePaymentError('Insufficient wallet balance.');
                return;
            }
        }

        setDueSubmitLoading(true);
        setDuePaymentError(null);
        try {
            if (dueSelectedMethodId === 'wallet') {
                const paidAmount = await ContractService.payContractDue(selectedContract.id, {
                    paymentMethodId: 'wallet'
                });
                showNotification('success', 'Payment Sent', `Paid ${formatPrice(paidAmount)} to freelancer.`);
                setShowPayDueModal(false);
                await loadContracts();
                await refreshLogs(selectedContract.id);
                return;
            }

            const topup = await WalletService.initiateTopup({
                amount,
                currency: (dueWalletInfo?.currency || 'USD').toUpperCase(),
                provider: dueSelectedMethodId
            });
            const intentId = topup?.intent_id || topup?.intentId;
            const redirectUrl = topup?.redirect_url || topup?.redirectUrl;
            if (!intentId || !redirectUrl) {
                throw new Error('Unable to start checkout for this payment method.');
            }

            writePendingContractTopup({
                contractId: selectedContract.id,
                intentId: String(intentId),
                providerId: dueSelectedMethodId,
                providerName: selectedMethodName,
                createdAt: Date.now()
            });
            window.location.href = redirectUrl;
        } catch (error: any) {
            setDuePaymentError(error?.message || 'Unable to process payment.');
        } finally {
            setDueSubmitLoading(false);
        }
    };

    const handleDownloadReport = () => {
        if (!selectedContract) return;
        const isFixedContract = selectedContract.type === 'fixed';
        const headers = isFixedContract
            ? "Order,Milestone,Due Date,Amount,Status\n"
            : "Date,Description,Duration(min),Earnings,Status\n";
        const rows = isFixedContract
            ? getMilestones(selectedContract)
                  .map((milestone) =>
                      `${milestone.order + 1},"${milestone.title}",${new Date(milestone.dueDate).toLocaleDateString()},${milestone.amount},${milestone.status}`
                  )
                  .join("\n")
            : logs.map(l => `${new Date(l.startTime).toLocaleDateString()},"${l.description}",${l.durationMinutes},${l.earnings},${l.status}`).join("\n");
        const csvContent = "data:text/csv;charset=utf-8," + headers + rows;
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `report_${selectedContract.id}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showNotification('success', 'Downloaded', 'Report downloaded successfully.');
    };

    return (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
            
            {/* LEFT COLUMN: Contracts List */}
            <div className="lg:col-span-2 space-y-4">
                {contracts.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200">
                        <p>No active contracts found.</p>
                    </div>
                ) : contracts.map(contract => (
                    <div 
                        key={contract.id} 
                        className={`bg-white p-6 rounded-xl border transition-all cursor-pointer hover:shadow-md ${selectedContract?.id === contract.id ? 'border-blue-500 ring-1 ring-blue-500 shadow-md' : 'border-gray-200'}`}
                        onClick={() => handleSelect(contract)}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-bold text-lg text-gray-900">{contract.title}</h3>
                                <p className="text-sm text-gray-500">
                                    {role === 'client' ? `Freelancer: ${contract.freelancerName}` : `Client: ${contract.clientName}`}
                                </p>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                                contract.status === 'active' ? 'bg-green-100 text-green-700' : 
                                contract.status === 'paused' ? 'bg-yellow-100 text-yellow-700' : 
                                contract.status === 'terminated' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                                {contract.status}
                            </span>
                        </div>
                        
                        {contract.type === 'fixed' ? (
                            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 md:grid-cols-4">
                                <div className="rounded-lg bg-gray-50 p-2">
                                    <span className="block text-xs text-gray-500">Contract Value</span>
                                    <span className="font-bold text-gray-900">{formatPrice(contract.contractValue || 0)}</span>
                                </div>
                                <div className="rounded-lg bg-gray-50 p-2">
                                    <span className="block text-xs text-gray-500">Milestones</span>
                                    <span className="font-bold text-gray-900">
                                        {getFixedContractStats(contract).completedCount}/{getFixedContractStats(contract).milestones.length || 0}
                                    </span>
                                </div>
                                <div className="rounded-lg bg-gray-50 p-2">
                                    <span className="block text-xs text-gray-500">Delivery</span>
                                    <span className="font-bold text-gray-900">{contract.deliveryDays || 0} days</span>
                                </div>
                                <div className="rounded-lg bg-emerald-50 p-2">
                                    <span className="block text-xs text-emerald-600">Paid Milestones</span>
                                    <span className="font-bold text-emerald-700">{formatPrice(getFixedContractStats(contract).paidTotal)}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 md:grid-cols-4">
                                <div className="rounded-lg bg-gray-50 p-2">
                                    <span className="block text-xs text-gray-500">Rate</span>
                                    <span className="font-bold text-gray-900">{formatPrice(contract.hourlyRate)}/hr</span>
                                </div>
                                <div className="rounded-lg bg-gray-50 p-2">
                                    <span className="block text-xs text-gray-500">Total Paid</span>
                                    <span className="font-bold text-gray-900">{formatPrice(contract.totalPaid)}</span>
                                </div>
                                <div className="rounded-lg bg-gray-50 p-2">
                                    <span className="block text-xs text-gray-500">Total Hours</span>
                                    <span className="font-bold text-gray-900">{contract.totalHoursLogged?.toFixed(1) || '0.0'}h</span>
                                </div>
                                <div className="rounded-lg bg-green-50 p-2">
                                    <span className="block text-xs text-green-600">Pending</span>
                                    <span className="font-bold text-green-700">{formatPrice(contract.earningsPending || 0)}</span>
                                </div>
                            </div>
                        )}

                        {/* Quick Actions Footer */}
                        <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2 justify-end">
                             {role === 'client' && (
                                 <>
                                    {contract.status === 'active' ? (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleStatusChange(contract.id, 'paused'); }} 
                                            className="text-xs px-3 py-1.5 border border-yellow-300 text-yellow-700 rounded hover:bg-yellow-50 transition"
                                        >
                                            Pause
                                        </button>
                                    ) : contract.status === 'paused' ? (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleStatusChange(contract.id, 'active'); }} 
                                            className="text-xs px-3 py-1.5 border border-blue-300 text-blue-700 rounded hover:bg-blue-50 transition"
                                        >
                                            Resume
                                        </button>
                                    ) : null}
                                    
                                    {contract.status !== 'terminated' && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleStatusChange(contract.id, 'terminated'); }} 
                                            className="text-xs px-3 py-1.5 border border-red-300 text-red-700 rounded hover:bg-red-50 transition"
                                        >
                                            Terminate
                                        </button>
                                    )}
                                 </>
                             )}
                             <button 
                                onClick={(e) => { e.stopPropagation(); handleSelect(contract); }} 
                                className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
                             >
                                {contract.type === 'fixed' ? 'View Details' : 'View Logs'}
                             </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* RIGHT COLUMN: Details & Actions */}
            <div className="space-y-6">
                {selectedContract ? (
                    <>
                        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                            <div>
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-lg font-bold text-gray-900">{selectedContract.title}</h3>
                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                        {selectedContract.type}
                                    </span>
                                </div>
                                {selectedContract.description ? (
                                    <p className="mt-2 text-sm leading-6 text-gray-600">{selectedContract.description}</p>
                                ) : (
                                    <p className="mt-2 text-sm leading-6 text-gray-500">
                                        No contract summary has been added yet.
                                    </p>
                                )}
                            </div>
                            {selectedContract.type === 'fixed' ? (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <div className="text-xs uppercase tracking-wide text-slate-500">Contract Value</div>
                                        <div className="mt-1 text-base font-bold text-slate-900">{formatPrice(selectedContract.contractValue || 0)}</div>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <div className="text-xs uppercase tracking-wide text-slate-500">Delivery Window</div>
                                        <div className="mt-1 text-base font-bold text-slate-900">{selectedContract.deliveryDays || 0} days</div>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <div className="text-xs uppercase tracking-wide text-slate-500">Milestones</div>
                                        <div className="mt-1 text-base font-bold text-slate-900">
                                            {getFixedContractStats(selectedContract).completedCount}/{getFixedContractStats(selectedContract).milestones.length || 0}
                                        </div>
                                    </div>
                                    {selectedContract.paymentSchedule?.depositPercent ? (
                                        <div className="rounded-xl bg-slate-50 p-3 sm:col-span-3">
                                            <div className="text-xs uppercase tracking-wide text-slate-500">Deposit Guidance</div>
                                            <div className="mt-1 text-sm font-semibold text-slate-900">
                                                {selectedContract.paymentSchedule.depositPercent}% deposit policy enabled for this fixed contract.
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <div className="text-xs uppercase tracking-wide text-slate-500">Hourly Rate</div>
                                        <div className="mt-1 text-base font-bold text-slate-900">{formatPrice(selectedContract.hourlyRate || 0)}/hr</div>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <div className="text-xs uppercase tracking-wide text-slate-500">Payment Cycle</div>
                                        <div className="mt-1 text-base font-bold text-slate-900">{selectedContract.paymentCycle || selectedContract.payment_cycle}</div>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <div className="text-xs uppercase tracking-wide text-slate-500">Hours Logged</div>
                                        <div className="mt-1 text-base font-bold text-slate-900">{selectedContract.totalHoursLogged?.toFixed(1) || '0.0'}h</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 1. Tracker Panel (Freelancer Only) */}
                        {role === 'freelancer' && selectedContract.type === 'hourly' && selectedContract.status === 'active' && (
                            <ATMTracker contract={selectedContract} onUpdate={() => { loadContracts(); refreshLogs(selectedContract.id); }} />
                        )}
                        {role === 'freelancer' && selectedContract.type === 'hourly' && selectedContract.status !== 'active' && (
                            <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-xl text-yellow-800 text-center">
                                <Ban className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                <h3 className="font-bold">Contract is {selectedContract.status}</h3>
                                <p className="text-sm mt-1">Time tracking is currently disabled.</p>
                            </div>
                        )}

                        {/* 2. Client Payment/Approval Panel */}
                        {role === 'client' && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                <h3 className="font-bold text-gray-900 mb-4">
                                    {selectedContract.type === 'fixed' ? 'Milestone Management' : 'Contract Management'}
                                </h3>
                                <div className="space-y-3">
                                    {selectedContract.type === 'hourly' ? (
                                        <button 
                                            onClick={handlePayCurrentDue}
                                            disabled={!selectedContract.earningsPending || selectedContract.earningsPending <= 0}
                                            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg flex items-center justify-center transition"
                                        >
                                            <DollarSign className="w-4 h-4 mr-2" /> Pay Current Due ({formatPrice(selectedContract.earningsPending || 0)})
                                        </button>
                                    ) : (
                                        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                            <div>Paid milestones: {formatPrice(getFixedContractStats(selectedContract).paidTotal)}</div>
                                            {getFixedContractStats(selectedContract).approvedTotal > 0 ? (
                                                <div className="mt-1 text-xs text-emerald-700">
                                                    {formatPrice(getFixedContractStats(selectedContract).approvedTotal)} approved for payment. Mark the approved milestone as paid below.
                                                </div>
                                            ) : getFixedContractStats(selectedContract).submittedTotal > 0 ? (
                                                <div className="mt-1 text-xs text-emerald-700">
                                                    Awaiting approval for {formatPrice(getFixedContractStats(selectedContract).submittedTotal)} in submitted milestones.
                                                </div>
                                            ) : (
                                                <div className="mt-1 text-xs text-emerald-700">No milestone payment is ready yet.</div>
                                            )}
                                        </div>
                                    )}
                                    <button 
                                        onClick={handleDownloadReport}
                                        className="w-full bg-white border border-gray-300 text-gray-700 font-medium py-2 rounded-lg hover:bg-gray-50 flex items-center justify-center transition"
                                    >
                                        <Download className="w-4 h-4 mr-2" /> Download {selectedContract.type === 'fixed' ? 'Milestone Plan' : 'Report'}
                                    </button>
                                    
                                    {selectedContract.status === 'active' ? (
                                        <button onClick={() => handleStatusChange(selectedContract.id, 'paused')} className="w-full bg-yellow-50 border border-yellow-200 text-yellow-700 font-medium py-2 rounded-lg hover:bg-yellow-100 flex items-center justify-center transition">
                                            <PauseCircle className="w-4 h-4 mr-2" /> Pause Contract
                                        </button>
                                    ) : selectedContract.status === 'paused' ? (
                                        <button onClick={() => handleStatusChange(selectedContract.id, 'active')} className="w-full bg-blue-50 border border-blue-200 text-blue-700 font-medium py-2 rounded-lg hover:bg-blue-100 flex items-center justify-center transition">
                                            <Play className="w-4 h-4 mr-2" /> Resume Contract
                                        </button>
                                    ) : (
                                        <div className="text-center text-sm text-red-500 font-medium py-2 border border-red-100 bg-red-50 rounded-lg">
                                            Contract Terminated
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        {selectedContract.type === 'fixed' ? (
                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col max-h-[520px]">
                                <div className="p-4 bg-gray-50 border-b border-gray-200 font-bold text-gray-700 text-sm flex justify-between items-center">
                                    <span>Milestone Timeline</span>
                                    <span className="text-xs font-normal text-gray-500">{getFixedContractStats(selectedContract).milestones.length} checkpoints</span>
                                </div>
                                <div className="overflow-y-auto flex-1 p-3 space-y-3">
                                    {getFixedContractStats(selectedContract).milestones.length === 0 && (
                                        <div className="p-8 text-center text-xs text-gray-500">No milestones have been added yet.</div>
                                    )}
                                    {getFixedContractStats(selectedContract).milestones.map((milestone) => (
                                        <div key={milestone.id} className="rounded-xl border border-gray-200 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-semibold text-gray-900">{milestone.title}</div>
                                                    <div className="mt-1 text-xs text-gray-500">
                                                        Due {new Date(milestone.dueDate).toLocaleDateString()} • {formatPrice(milestone.amount)}
                                                    </div>
                                                </div>
                                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                                                    milestone.status === 'paid'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : milestone.status === 'approved'
                                                            ? 'bg-blue-100 text-blue-700'
                                                            : milestone.status === 'submitted'
                                                                ? 'bg-amber-100 text-amber-700'
                                                                : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                    {milestone.status}
                                                </span>
                                            </div>
                                            {milestone.description ? (
                                                <p className="mt-3 text-sm text-gray-600">{milestone.description}</p>
                                            ) : null}
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                {role === 'freelancer' && milestone.status === 'pending' && (
                                                    <button
                                                        onClick={() => void handleMilestoneStatusChange(selectedContract.id, milestone.id, 'submitted')}
                                                        className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                                                    >
                                                        Mark Submitted
                                                    </button>
                                                )}
                                                {role !== 'freelancer' && milestone.status === 'submitted' && (
                                                    <button
                                                        onClick={() => void handleMilestoneStatusChange(selectedContract.id, milestone.id, 'approved')}
                                                        className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                                                    >
                                                        Approve Milestone
                                                    </button>
                                                )}
                                                {role !== 'freelancer' && milestone.status === 'approved' && (
                                                    <button
                                                        onClick={() => void handleMilestoneStatusChange(selectedContract.id, milestone.id, 'paid')}
                                                        className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                                                    >
                                                        Mark Paid
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col max-h-[500px]">
                                <div className="p-4 bg-gray-50 border-b border-gray-200 font-bold text-gray-700 text-sm flex justify-between items-center">
                                    <span>Recent Time Logs</span>
                                    <span className="text-xs font-normal text-gray-500">{logs.length} entries</span>
                                </div>
                                <div className="overflow-y-auto flex-1 p-2 space-y-2">
                                    {logs.length === 0 && <div className="p-8 text-center text-xs text-gray-500">No time logged yet.</div>}
                                    {logs.map(log => (
                                        <div key={log.id} className="p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                                            <div className="flex justify-between mb-1">
                                                <span className="text-xs font-bold text-gray-900">{new Date(log.startTime).toLocaleDateString()}</span>
                                                <span className="text-xs font-mono font-bold text-gray-700">{(log.durationMinutes / 60).toFixed(2)}h</span>
                                            </div>
                                            <div className="flex justify-between items-end">
                                                <div className="flex-1 mr-2">
                                                    <p className="text-xs text-gray-600 line-clamp-1">{log.description}</p>
                                                    <div className="flex gap-2 mt-1">
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase inline-block ${
                                                            log.status === 'approved' ? 'bg-green-100 text-green-700' : 
                                                            log.status === 'paid' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                                                        }`}>
                                                            {log.status}
                                                        </span>
                                                        <span className="text-[10px] text-gray-500">{formatPrice(log.earnings || 0)}</span>
                                                    </div>
                                                </div>
                                                {role === 'client' && log.status === 'pending' && (
                                                    <button 
                                                        onClick={() => handleApproveLog(log.id)}
                                                        className="bg-green-100 text-green-700 p-1.5 rounded hover:bg-green-200 transition" 
                                                        title="Approve Log"
                                                    >
                                                        <CheckCircle className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="bg-gray-50 rounded-xl border border-gray-200 p-8 text-center h-full flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                            <Clock className="w-8 h-8" />
                        </div>
                        <h3 className="text-gray-900 font-medium">No Contract Selected</h3>
                        <p className="text-gray-500 text-sm mt-2">Select a contract from the list to view details, track time, or manage payments.</p>
                    </div>
                )}
            </div>
        </div>
        {showPayDueModal && selectedContract && (
            <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4">
                <div className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 shadow-xl">
                    <div className="px-6 py-5 border-b border-gray-100">
                        <h3 className="text-lg font-bold text-gray-900">Pay Current Due</h3>
                        <p className="text-sm text-gray-600 mt-1">
                            Select a payment method to pay {formatPrice(selectedContract.earningsPending || 0)} for{' '}
                            {selectedContract.title}.
                        </p>
                    </div>
                    <div className="px-6 py-5 space-y-3 max-h-[50vh] overflow-y-auto">
                        {dueMethodsLoading && (
                            <div className="text-sm text-gray-500">Loading payment methods...</div>
                        )}
                        {!dueMethodsLoading && duePaymentMethods.length === 0 && (
                            <div className="text-sm text-gray-500">No payment methods available.</div>
                        )}
                        {!dueMethodsLoading &&
                            duePaymentMethods.map((method: any) => {
                                const methodName = getUserFacingPaymentMethodName(method);
                                const isWallet = method.id === 'wallet';
                                const walletBalance = Number(
                                    dueWalletInfo?.availableBalance ?? dueWalletInfo?.available_balance ?? 0
                                );
                                const insufficient =
                                    isWallet && walletBalance < Number(selectedContract.earningsPending || 0);

                                return (
                                    <button
                                        key={method.id}
                                        type="button"
                                        onClick={() => setDueSelectedMethodId(method.id)}
                                        className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                                            dueSelectedMethodId === method.id
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-semibold text-gray-900 truncate">{methodName}</div>
                                                {isWallet ? (
                                                    <div className={`text-xs mt-1 ${insufficient ? 'text-red-600' : 'text-gray-500'}`}>
                                                        Balance {formatPrice(walletBalance)}
                                                        {insufficient ? ' - Insufficient balance' : ''}
                                                    </div>
                                                ) : (
                                                    <div className="text-xs mt-1 text-gray-500">
                                                        Secure checkout via {methodName}
                                                    </div>
                                                )}
                                            </div>
                                            <span
                                                className={`h-4 w-4 rounded-full border ${
                                                    dueSelectedMethodId === method.id
                                                        ? 'border-blue-600 bg-blue-600'
                                                        : 'border-gray-300 bg-white'
                                                }`}
                                            />
                                        </div>
                                    </button>
                                );
                            })}
                        {duePaymentError && (
                            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                {duePaymentError}
                            </div>
                        )}
                    </div>
                    <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                setShowPayDueModal(false);
                                setDuePaymentError(null);
                            }}
                            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmitPayCurrentDue}
                            disabled={dueSubmitLoading || dueMethodsLoading || !dueSelectedMethodId}
                            className="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {dueSubmitLoading ? 'Processing...' : 'Pay Current Due'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        <ConfirmModal
            isOpen={Boolean(confirmState)}
            title={confirmState?.title || ''}
            message={confirmState?.message || ''}
            variant={confirmState?.variant || 'warning'}
            confirmLabel="Confirm"
            cancelLabel="Cancel"
            onCancel={() => setConfirmState(null)}
            onConfirm={async () => {
                if (!confirmState) return;
                await confirmState.onConfirm();
                setConfirmState(null);
            }}
        />
        </>
    );
};

export default ContractList;
