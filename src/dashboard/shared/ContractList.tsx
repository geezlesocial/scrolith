
import React, { useEffect, useState } from 'react';
import { Contract, TimeEntry } from '../../types';
import { ContractService } from '../../services/contract';
import { useCurrency } from '../../context/CurrencyContext';
import { Clock, CheckCircle, Play, PauseCircle, DollarSign, FileText, Download, Ban } from 'lucide-react';
import ATMTracker from '../../components/ATMTracker';
import { useNotification } from '../../context/NotificationContext';

interface ContractListProps {
    role: 'client' | 'freelancer' | 'admin';
    userId: string;
}

const ContractList: React.FC<ContractListProps> = ({ role, userId }) => {
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
    const [logs, setLogs] = useState<TimeEntry[]>([]);
    const { formatPrice } = useCurrency();
    const { showNotification } = useNotification();

    useEffect(() => {
        loadContracts();
    }, [role, userId]);

    const loadContracts = async () => {
        const data = await ContractService.getContracts(userId, role);
        setContracts(data);
        
        // Ensure selectedContract data stays fresh if it's currently selected
        if (selectedContract) {
            const updated = data.find(c => c.id === selectedContract.id);
            if (updated) setSelectedContract(updated);
        }
    };

    const handleSelect = async (contract: Contract) => {
        setSelectedContract(contract);
        refreshLogs(contract.id);
    };

    const refreshLogs = async (contractId: string) => {
        const entries = await ContractService.getTimeEntries(contractId);
        setLogs(entries);
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
        if(confirm(`Are you sure you want to ${actionLabel} this contract?`)) {
            await ContractService.updateStatus(contractId, status);
            await loadContracts(); // Refresh list
            
            // Manually update selectedContract state to reflect change immediately
            if (selectedContract?.id === contractId) {
                setSelectedContract(prev => prev ? { ...prev, status } : null);
            }
            showNotification('success', 'Status Updated', `Contract is now ${status}.`);
        }
    };

    const handlePayCurrentDue = async () => {
        if (!selectedContract) return;
        
        const amount = selectedContract.earningsPending || 0;
        if (amount <= 0) {
            showNotification('info', 'Nothing to Pay', 'There are no pending earnings to pay right now.');
            return;
        }

        if(confirm(`Pay all pending earnings of ${formatPrice(amount)} for ${selectedContract.title}?`)) {
            const paidAmount = await ContractService.payContractDue(selectedContract.id);
            showNotification('success', 'Payment Sent', `Paid ${formatPrice(paidAmount)} to freelancer.`);
            await loadContracts(); // Refresh contract totals
            await refreshLogs(selectedContract.id); // Refresh log statuses to 'paid'
        }
    };

    const handleDownloadReport = () => {
        if (!selectedContract) return;
        // Generate simple CSV
        const headers = "Date,Description,Duration(min),Earnings,Status\n";
        const rows = logs.map(l => `${new Date(l.startTime).toLocaleDateString()},"${l.description}",${l.durationMinutes},${l.earnings},${l.status}`).join("\n");
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
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="bg-gray-50 p-2 rounded-lg">
                                <span className="text-xs text-gray-500 block">Rate</span>
                                <span className="font-bold text-gray-900">{formatPrice(contract.hourlyRate)}/hr</span>
                            </div>
                            <div className="bg-gray-50 p-2 rounded-lg">
                                <span className="text-xs text-gray-500 block">Total Paid</span>
                                <span className="font-bold text-gray-900">{formatPrice(contract.totalPaid)}</span>
                            </div>
                            <div className="bg-gray-50 p-2 rounded-lg">
                                <span className="text-xs text-gray-500 block">Total Hours</span>
                                <span className="font-bold text-gray-900">{contract.totalHoursLogged?.toFixed(1) || '0.0'}h</span>
                            </div>
                            <div className="bg-green-50 p-2 rounded-lg">
                                <span className="text-xs text-green-600 block">Pending</span>
                                <span className="font-bold text-green-700">{formatPrice(contract.earningsPending || 0)}</span>
                            </div>
                        </div>

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
                                View Logs
                             </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* RIGHT COLUMN: Details & Actions */}
            <div className="space-y-6">
                {selectedContract ? (
                    <>
                        {/* 1. Tracker Panel (Freelancer Only) */}
                        {role === 'freelancer' && selectedContract.status === 'active' && (
                            <ATMTracker contract={selectedContract} onUpdate={() => { loadContracts(); refreshLogs(selectedContract.id); }} />
                        )}
                        {role === 'freelancer' && selectedContract.status !== 'active' && (
                            <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-xl text-yellow-800 text-center">
                                <Ban className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                <h3 className="font-bold">Contract is {selectedContract.status}</h3>
                                <p className="text-sm mt-1">Time tracking is currently disabled.</p>
                            </div>
                        )}

                        {/* 2. Client Payment/Approval Panel */}
                        {role === 'client' && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                <h3 className="font-bold text-gray-900 mb-4">Contract Management</h3>
                                <div className="space-y-3">
                                    <button 
                                        onClick={handlePayCurrentDue}
                                        disabled={!selectedContract.earningsPending || selectedContract.earningsPending <= 0}
                                        className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg flex items-center justify-center transition"
                                    >
                                        <DollarSign className="w-4 h-4 mr-2" /> Pay Current Due ({formatPrice(selectedContract.earningsPending || 0)})
                                    </button>
                                    <button 
                                        onClick={handleDownloadReport}
                                        className="w-full bg-white border border-gray-300 text-gray-700 font-medium py-2 rounded-lg hover:bg-gray-50 flex items-center justify-center transition"
                                    >
                                        <Download className="w-4 h-4 mr-2" /> Download Report
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
                        
                        {/* 3. Time Logs List */}
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
    );
};

export default ContractList;
