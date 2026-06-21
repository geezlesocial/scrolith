
import React, { useState, useEffect } from 'react';
import { AdminService } from '../../services/admin';
import { ContractService } from '../../services/contract';
import { Contract, TimeEntry } from '../../types';
import { Clock, Search, Eye, Flag, ShieldAlert, CheckCircle, StopCircle } from 'lucide-react';
import { useCurrency } from '../../context/CurrencyContext';
import { useNotification } from '../../context/NotificationContext';

const ATMTrackerModule = () => {
    const [activeTab, setActiveTab] = useState<'contracts' | 'logs' | 'active_sessions'>('active_sessions');
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [logs, setLogs] = useState<TimeEntry[]>([]);
    const { formatPrice } = useCurrency();
    const { showNotification } = useNotification();

    useEffect(() => {
        loadData();
        // Poll for active sessions update every 10s
        const interval = setInterval(loadData, 10000);
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        const allContracts = await ContractService.getContracts('', 'admin');
        setContracts(allContracts);
        
        let allLogs: TimeEntry[] = [];
        for(const c of allContracts) {
            const entries = await ContractService.getTimeEntries(c.id);
            allLogs = [...allLogs, ...entries];
        }
        setLogs(allLogs.sort((a,b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()));
    };

    const handleForceStop = async (contractId: string) => {
        if(confirm("Force stop this session? The freelancer will be notified.")) {
            try {
                await ContractService.stopTracking(contractId, "Admin Force Stop");
                showNotification('success', 'Stopped', 'Session terminated by admin.');
                loadData();
            } catch (e) {
                showNotification('alert', 'Error', 'Failed to stop session.');
            }
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 flex items-center">
                    <Clock className="w-6 h-6 mr-2 text-indigo-600" /> ATM Tracker Oversight
                </h2>
                <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setActiveTab('active_sessions')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'active_sessions' ? 'bg-white shadow text-indigo-600' : 'text-gray-600'}`}>Live Sessions</button>
                    <button onClick={() => setActiveTab('contracts')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'contracts' ? 'bg-white shadow text-indigo-600' : 'text-gray-600'}`}>Contracts</button>
                    <button onClick={() => setActiveTab('logs')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'logs' ? 'bg-white shadow text-indigo-600' : 'text-gray-600'}`}>All Logs</button>
                </div>
            </div>

            {activeTab === 'active_sessions' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500"><tr><th>Contract</th><th>Freelancer</th><th>Started At</th><th>Current Session</th><th>Actions</th></tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {contracts.filter(c => c.activeSessionId).length === 0 && (
                                <tr><td colSpan={5} className="p-8 text-center text-gray-500">No active sessions right now.</td></tr>
                            )}
                            {contracts.filter(c => c.activeSessionId).map(c => {
                                // Mock session data retrieval since it's local storage based in this demo
                                // In prod, this would come from API state
                                return (
                                    <tr key={c.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 font-bold text-gray-900">{c.title}</td>
                                        <td className="px-6 py-4">{c.freelancerName}</td>
                                        <td className="px-6 py-4 text-gray-500">Just now</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                <span className="w-2 h-2 mr-1 bg-green-500 rounded-full animate-pulse"></span> Tracking
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button 
                                                onClick={() => handleForceStop(c.id)}
                                                className="text-red-600 hover:bg-red-50 px-3 py-1.5 rounded border border-red-200 flex items-center text-xs font-bold"
                                            >
                                                <StopCircle className="w-3 h-3 mr-1" /> Force Stop
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'contracts' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500"><tr><th>Title</th><th>Client</th><th>Freelancer</th><th>Rate</th><th>Logged</th><th>Status</th></tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {contracts.map(c => (
                                <tr key={c.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium">{c.title}</td>
                                    <td className="px-6 py-4">{c.clientName}</td>
                                    <td className="px-6 py-4">{c.freelancerName}</td>
                                    <td className="px-6 py-4">{formatPrice(c.hourlyRate)}/hr</td>
                                    <td className="px-6 py-4 font-bold">{c.totalHoursLogged.toFixed(1)} hrs</td>
                                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs uppercase ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>{c.status}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            
            {activeTab === 'logs' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500"><tr><th>Date</th><th>Contract</th><th>User</th><th>Duration</th><th>Score</th><th>Status</th></tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {logs.map(log => {
                                const contract = contracts.find(c => c.id === log.contractId);
                                return (
                                    <tr key={log.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-gray-500">{new Date(log.startTime).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 font-medium">{contract?.title || log.contractId}</td>
                                        <td className="px-6 py-4">{contract?.freelancerName || log.freelancerId}</td>
                                        <td className="px-6 py-4 font-bold">{(log.durationMinutes / 60).toFixed(2)} hrs</td>
                                        <td className="px-6 py-4">
                                            {log.activityScore ? <span className={`font-bold ${log.activityScore < 50 ? 'text-red-500' : 'text-green-600'}`}>{log.activityScore}%</span> : '-'}
                                        </td>
                                        <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs uppercase ${log.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{log.status}</span></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ATMTrackerModule;
