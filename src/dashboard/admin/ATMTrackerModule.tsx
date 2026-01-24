
import React, { useState, useEffect, useMemo } from 'react';
import { ContractService, ActiveTrackingSession } from '../../services/contract';
import { Contract, TimeEntry } from '../../types';
import { Clock, StopCircle } from 'lucide-react';
import { useCurrency } from '../../context/CurrencyContext';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';

const ATMTrackerModule = () => {
    const [activeTab, setActiveTab] = useState<'contracts' | 'logs' | 'active_sessions'>('active_sessions');
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [logs, setLogs] = useState<TimeEntry[]>([]);
    const [activeSessions, setActiveSessions] = useState<ActiveTrackingSession[]>([]);
    const [loadingContracts, setLoadingContracts] = useState(false);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [loadingSessions, setLoadingSessions] = useState(false);
    const [sessionsError, setSessionsError] = useState<string | null>(null);
    const [logsError, setLogsError] = useState<string | null>(null);
    const [contractsError, setContractsError] = useState<string | null>(null);
    const { formatPrice } = useCurrency();
    const { showNotification } = useNotification();
    const { user } = useUser();

    const contractMap = useMemo(() => {
        return new Map(contracts.map(contract => [contract.id, contract]));
    }, [contracts]);

    useEffect(() => {
        if (!user) return;
        loadContracts();
        loadActiveSessions();
        // Poll active sessions every 10s
        const interval = setInterval(loadActiveSessions, 10000);
        return () => clearInterval(interval);
    }, [user]);

    useEffect(() => {
        if (!user) return;
        if (activeTab === 'logs') {
            loadLogs();
        }
        if (activeTab === 'contracts') {
            loadContracts();
        }
    }, [activeTab, user]);

    const loadContracts = async () => {
        try {
            setLoadingContracts(true);
            setContractsError(null);
            const allContracts = await ContractService.getContracts(user?.id || '', 'admin');
            setContracts(allContracts);
        } catch (error) {
            setContractsError('Failed to load contracts.');
            showNotification('alert', 'Error', 'Failed to load contracts.');
        } finally {
            setLoadingContracts(false);
        }
    };

    const normalizeLog = (log: TimeEntry) => {
        const raw = log as unknown as Record<string, any>;
        return {
            ...log,
            contractId: raw.contractId ?? raw.contract_id ?? '',
            freelancerId: raw.freelancerId ?? raw.freelancer_id ?? '',
            startTime: raw.startTime ?? raw.start_time ?? '',
            durationMinutes: raw.durationMinutes ?? raw.duration_minutes ?? 0,
            activityScore: raw.activityScore ?? raw.activity_score
        } as TimeEntry;
    };

    const loadLogs = async () => {
        try {
            setLoadingLogs(true);
            setLogsError(null);
            const response = await ContractService.getAllTimeEntries();
            const normalized = response.items.map(normalizeLog);
            normalized.sort((a, b) => {
                const aTime = Date.parse((a as unknown as Record<string, any>).startTime ?? '');
                const bTime = Date.parse((b as unknown as Record<string, any>).startTime ?? '');
                return bTime - aTime;
            });
            setLogs(normalized);
        } catch (error) {
            setLogsError('Failed to load time logs.');
            showNotification('alert', 'Error', 'Failed to load time logs.');
        } finally {
            setLoadingLogs(false);
        }
    };

    const loadActiveSessions = async () => {
        try {
            setLoadingSessions(true);
            setSessionsError(null);
            const sessions = await ContractService.getActiveTrackingSessions();
            setActiveSessions(sessions);
        } catch (error) {
            setSessionsError('Failed to load active sessions.');
        } finally {
            setLoadingSessions(false);
        }
    };

    const handleForceStop = async (sessionId: string) => {
        if(confirm("Force stop this session? The freelancer will be notified.")) {
            try {
                await ContractService.forceStopTrackingSession(sessionId, "Admin Force Stop");
                showNotification('success', 'Stopped', 'Session terminated by admin.');
                loadActiveSessions();
                if (activeTab === 'logs') {
                    loadLogs();
                }
                loadContracts();
            } catch (e) {
                showNotification('alert', 'Error', 'Failed to stop session.');
            }
        }
    };

    const formatDuration = (seconds: number) => {
        const safe = Math.max(0, Math.floor(seconds));
        const hours = Math.floor(safe / 3600);
        const minutes = Math.floor((safe % 3600) / 60);
        const secs = safe % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes
            .toString()
            .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getContractField = (contract: Contract | undefined, field: 'title' | 'freelancer' | 'rate') => {
        if (!contract) return '';
        const raw = contract as unknown as Record<string, any>;
        if (field === 'title') return raw.title ?? contract.title ?? 'Untitled';
        if (field === 'freelancer') return raw.freelancerName ?? raw.freelancer_name ?? (contract as any).freelancerName ?? 'Freelancer';
        return raw.hourlyRate ?? raw.hourly_rate ?? 0;
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
                            {loadingSessions && (
                                <tr><td colSpan={5} className="p-8 text-center text-gray-500">Loading sessions...</td></tr>
                            )}
                            {!loadingSessions && sessionsError && (
                                <tr><td colSpan={5} className="p-8 text-center text-red-600">{sessionsError}</td></tr>
                            )}
                            {!loadingSessions && !sessionsError && activeSessions.length === 0 && (
                                <tr><td colSpan={5} className="p-8 text-center text-gray-500">No active sessions right now.</td></tr>
                            )}
                            {!loadingSessions && !sessionsError && activeSessions.map(session => {
                                const contract = contractMap.get(session.contractId);
                                const startedAt = session.startedAt ? new Date(session.startedAt).toLocaleString() : '--';
                                const elapsedSeconds =
                                    typeof session.elapsedSeconds === 'number'
                                        ? session.elapsedSeconds
                                        : Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000);
                                return (
                                    <tr key={session.sessionId} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 font-bold text-gray-900">
                                            {session.contractTitle || getContractField(contract, 'title') || session.contractId}
                                        </td>
                                        <td className="px-6 py-4">
                                            {session.freelancerName || getContractField(contract, 'freelancer') || session.freelancerId}
                                        </td>
                                        <td className="px-6 py-4 text-gray-500">{startedAt}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                    <span className="w-2 h-2 mr-1 bg-green-500 rounded-full animate-pulse"></span> Tracking
                                                </span>
                                                <span className="text-xs font-mono text-gray-600">{formatDuration(elapsedSeconds)}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button 
                                                onClick={() => handleForceStop(session.sessionId)}
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
                            {loadingContracts && (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-500">Loading contracts...</td></tr>
                            )}
                            {!loadingContracts && contractsError && (
                                <tr><td colSpan={6} className="p-8 text-center text-red-600">{contractsError}</td></tr>
                            )}
                            {contracts.map(c => (
                                <tr key={c.id} className="hover:bg-gray-50">
                                    {(() => {
                                        const r = c as unknown as Record<string, any>;
                                        const title = r.title ?? c.title ?? 'Untitled';
                                        const clientName = r.clientName ?? c.client_name ?? 'Client';
                                        const freelancerName = r.freelancerName ?? c.freelancer_name ?? 'Freelancer';
                                        const hourly = Number(r.hourlyRate ?? c.hourly_rate ?? 0);
                                        const totalHours = Number(r.totalHoursLogged ?? c.total_hours_logged ?? 0).toFixed(1);
                                        const status = (r.status ?? c.status) ?? 'inactive';
                                        return (<>
                                            <td className="px-6 py-4 font-medium">{title}</td>
                                            <td className="px-6 py-4">{clientName}</td>
                                            <td className="px-6 py-4">{freelancerName}</td>
                                            <td className="px-6 py-4">{formatPrice(hourly)}/hr</td>
                                            <td className="px-6 py-4 font-bold">{totalHours} hrs</td>
                                            <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs uppercase ${status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>{status}</span></td>
                                        </>);
                                    })()}
                                </tr>
                            ))}
                            {!loadingContracts && !contractsError && contracts.length === 0 && (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-500">No contracts found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
            
            {activeTab === 'logs' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500"><tr><th>Date</th><th>Contract</th><th>User</th><th>Duration</th><th>Score</th><th>Status</th></tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {loadingLogs && (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-500">Loading logs...</td></tr>
                            )}
                            {!loadingLogs && logsError && (
                                <tr><td colSpan={6} className="p-8 text-center text-red-600">{logsError}</td></tr>
                            )}
                            {logs.map(log => {
                                const l = log as unknown as Record<string, any>;
                                const contractId = l.contractId ?? l.contract_id;
                                const freelancerId = l.freelancerId ?? l.freelancer_id;
                                const startTime = l.startTime ?? l.start_time;
                                const durationMinutes = l.durationMinutes ?? l.duration_minutes ?? 0;
                                const activityScore = l.activityScore ?? l.activity_score;
                                const contract = contracts.find(c => c.id === contractId);
                                return (
                                    <tr key={log.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-gray-500">{startTime ? new Date(startTime).toLocaleDateString() : '--'}</td>
                                        {(() => {
                                            const cr = contract as unknown as Record<string, any> | undefined;
                                            const ctTitle = cr?.title ?? contract?.title ?? contractId;
                                            const crFreelancer = cr?.freelancerName ?? cr?.freelancer_name ?? (contract as any)?.freelancer_name ?? freelancerId;
                                            return (<>
                                                <td className="px-6 py-4 font-medium">{ctTitle}</td>
                                                <td className="px-6 py-4">{crFreelancer}</td>
                                            </>);
                                        })()}
                                        <td className="px-6 py-4 font-bold">{(durationMinutes / 60).toFixed(2)} hrs</td>
                                        <td className="px-6 py-4">
                                            {activityScore ? <span className={`font-bold ${activityScore < 50 ? 'text-red-500' : 'text-green-600'}`}>{activityScore}%</span> : '-'}
                                        </td>
                                        <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs uppercase ${log.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{log.status}</span></td>
                                    </tr>
                                );
                            })}
                            {!loadingLogs && !logsError && logs.length === 0 && (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-500">No logs found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ATMTrackerModule;
