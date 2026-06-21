
import React, { useState, useEffect } from 'react';
import { 
    Brain, ShieldAlert, MessageSquare, DollarSign, Activity, 
    Settings, Save, Clock, AlertTriangle, TrendingUp, UserCheck, Zap, Award, Scale, FileText, Lock, Sliders,
    BarChart, PieChart, Info, UserX, AlertOctagon, CheckCircle, ArrowUpRight, Gavel, Briefcase, ArrowRight, X, Play
} from 'lucide-react';
import { AdminService } from '../../services/admin';
import { GovernanceService } from '../../services/ai/governance.service';
import { AIAnalytics, FraudLog, ChurnRisk, GrowthForecast, OptimizationProposal, AnomalyAlert, ContractClauseSuggestion } from '../../types';
import { useNotification } from '../../context/NotificationContext';
import { useCurrency } from '../../context/CurrencyContext';

const AIIntelligence = () => {
    const [activeTab, setActiveTab] = useState<'overview' | 'fraud' | 'churn' | 'forecast' | 'optimize' | 'governance' | 'anomaly'>('overview');
    
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center">
                        <Brain className="w-6 h-6 mr-2 text-indigo-600" /> AI Intelligence Suite
                    </h2>
                    <p className="text-sm text-gray-500">Monitor usage, enforce safety, and fine-tune decision engines.</p>
                </div>
            </div>

            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto">
                <TabButton id="overview" label="Overview" icon={Activity} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="fraud" label="Fraud Guard" icon={ShieldAlert} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="governance" label="Governance AI" icon={Gavel} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="churn" label="Churn Prediction" icon={UserX} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="forecast" label="Growth Forecast" icon={TrendingUp} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="optimize" label="Auto-Optimize" icon={Zap} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="anomaly" label="Anomaly Detection" icon={AlertOctagon} activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>

            <div className="animate-fade-in">
                {activeTab === 'overview' && <AIOverview />}
                {activeTab === 'fraud' && <FraudGuard />}
                {activeTab === 'governance' && <GovernancePanel />}
                {activeTab === 'churn' && <ChurnPrediction />}
                {activeTab === 'forecast' && <GrowthForecaster />}
                {activeTab === 'optimize' && <AutoOptimizer />}
                {activeTab === 'anomaly' && <AnomalyMonitor />}
            </div>
        </div>
    );
};

const TabButton = ({ id, label, icon: Icon, activeTab, setActiveTab }: any) => (
    <button 
        onClick={() => setActiveTab(id)}
        className={`px-4 py-2 text-sm font-medium rounded-md flex items-center transition-all whitespace-nowrap ${activeTab === id ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-200'}`}
    >
        <Icon className="w-4 h-4 mr-2" /> {label}
    </button>
);

const AIOverview = () => {
    const [stats, setStats] = useState<AIAnalytics | null>(null);
    const { formatPrice } = useCurrency();

    useEffect(() => {
        AdminService.getAIAnalytics().then(setStats);
    }, []);

    if (!stats) return <div className="p-8 text-center">Loading AI stats...</div>;

    return (
        <div className="space-y-6">
            {/* High Level Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <p className="text-xs text-gray-500 font-bold uppercase">Requests (Last 24h)</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalConversations.toLocaleString()}</p>
                    <p className="text-xs text-green-600 mt-1 font-medium">+12% vs yesterday</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <p className="text-xs text-gray-500 font-bold uppercase">Estimated Cost</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{formatPrice(stats.costEstimate)}</p>
                    <p className="text-xs text-gray-400 mt-1">Based on token usage</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <p className="text-xs text-gray-500 font-bold uppercase">Avg Latency</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{stats.avgResponseTime}ms</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <p className="text-xs text-gray-500 font-bold uppercase">Safety Triggers</p>
                    <p className="text-2xl font-bold text-red-600 mt-1">{stats.safetyStats?.spamTriggers || 0}</p>
                    <p className="text-xs text-gray-400 mt-1">Blocked actions</p>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Usage Breakdown */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                        <BarChart className="w-5 h-5 mr-2 text-blue-600" /> Module Usage
                    </h3>
                    <div className="space-y-4">
                        {stats.topRoles.map((role, idx) => (
                            <div key={idx}>
                                <div className="flex justify-between items-center mb-1 text-sm">
                                    <span className="text-gray-700 capitalize">{role.role}</span>
                                    <span className="font-bold text-gray-900">{role.count} reqs</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2">
                                    <div 
                                        className="bg-blue-600 h-2 rounded-full" 
                                        style={{ width: `${(role.count / stats.totalConversations) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Conversion Impact */}
                <div className="bg-gradient-to-br from-indigo-900 to-purple-900 text-white p-6 rounded-xl shadow-lg border border-indigo-700">
                    <h3 className="font-bold mb-4 flex items-center">
                        <TrendingUp className="w-5 h-5 mr-2 text-yellow-400" /> ROI & Impact
                    </h3>
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <p className="text-indigo-300 text-xs uppercase font-bold mb-1">AI-Assisted Gigs</p>
                            <p className="text-3xl font-bold">{stats.conversionImpact?.aiGigsCreated || 142}</p>
                            <p className="text-xs text-indigo-200 mt-1">Created this week</p>
                        </div>
                         <div>
                            <p className="text-indigo-300 text-xs uppercase font-bold mb-1">Hire Rate Uplift</p>
                            <p className="text-3xl font-bold text-green-400">+{stats.conversionImpact?.aiHireRate || 15}%</p>
                            <p className="text-xs text-indigo-200 mt-1">Vs. manual briefs</p>
                        </div>
                         <div className="col-span-2 pt-4 border-t border-indigo-700">
                            <p className="text-indigo-300 text-xs uppercase font-bold mb-1">Est. Revenue Impact</p>
                            <p className="text-2xl font-bold text-white">{formatPrice(stats.conversionImpact?.revenueUplift || 4500)}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const GovernancePanel = () => {
    const [clauses, setClauses] = useState<ContractClauseSuggestion[]>([]);

    useEffect(() => {
        GovernanceService.suggestContractClauses('general').then(setClauses);
    }, []);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                        <Scale className="w-5 h-5 mr-2 text-blue-600" /> AI Dispute Predictor Control
                    </h3>
                    <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 mb-4">
                        AI predicts outcomes for active disputes based on evidence and contract history.
                    </div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Prediction Accuracy</span>
                        <span className="font-bold text-green-600">88.5%</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Auto-Flag High Risk</span>
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-bold">ENABLED</span>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                        <FileText className="w-5 h-5 mr-2 text-purple-600" /> Smart Contract Library
                    </h3>
                    <div className="space-y-3">
                        {clauses.map((clause, i) => (
                            <div key={i} className="border border-gray-100 p-3 rounded-lg hover:bg-gray-50">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-bold text-sm text-gray-800">{clause.title}</span>
                                    <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-500">{clause.category}</span>
                                </div>
                                <p className="text-xs text-gray-600 line-clamp-2">{clause.text}</p>
                            </div>
                        ))}
                    </div>
                    <button className="w-full mt-4 text-center text-sm text-blue-600 font-bold hover:underline">Manage Clause Library</button>
                </div>
            </div>
        </div>
    );
};

const FraudGuard = () => {
    const [logs, setLogs] = useState<FraudLog[]>([]);

    useEffect(() => {
        AdminService.getFraudLogs().then(setLogs);
    }, []);

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Subscriber Fraud Logs</h3>
                        <p className="text-sm text-gray-500">AI-detected fake signups and bots.</p>
                    </div>
                    <div className="flex gap-2">
                        <span className="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full font-bold">Active Protection</span>
                    </div>
                </div>
                
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 uppercase font-bold text-xs">
                        <tr>
                            <th className="px-4 py-3">Email</th>
                            <th className="px-4 py-3">IP Address</th>
                            <th className="px-4 py-3">Risk Score</th>
                            <th className="px-4 py-3">Flags</th>
                            <th className="px-4 py-3">Action</th>
                            <th className="px-4 py-3">Time</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {logs.map(log => (
                            <tr key={log.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium">{log.email}</td>
                                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{log.ip}</td>
                                <td className="px-4 py-3">
                                    <span className={`font-bold ${log.riskScore > 70 ? 'text-red-600' : log.riskScore > 40 ? 'text-yellow-600' : 'text-green-600'}`}>
                                        {log.riskScore}/100
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex gap-1 flex-wrap">
                                        {log.reasons.map((r, i) => (
                                            <span key={i} className="text-[10px] bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{r}</span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`text-xs px-2 py-1 rounded font-bold uppercase ${
                                        log.actionTaken === 'Blocked' ? 'bg-red-100 text-red-700' :
                                        log.actionTaken === 'Flagged' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-green-100 text-green-700'
                                    }`}>
                                        {log.actionTaken}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(log.timestamp).toLocaleTimeString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ChurnPrediction = () => {
    const [risks, setRisks] = useState<ChurnRisk[]>([]);
    const { formatPrice } = useCurrency();
    const { showNotification } = useNotification();

    useEffect(() => {
        AdminService.getChurnRisks().then(setRisks);
    }, []);

    const handleEngage = (userId: string) => {
        showNotification('success', 'Retention Action Started', `Automated retention campaign sent to user ${userId}`);
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">At-Risk Accounts</h3>
                        <p className="text-sm text-gray-500">Users identified by AI as having high churn probability.</p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 uppercase font-bold text-xs">
                            <tr>
                                <th className="px-6 py-3">User</th>
                                <th className="px-6 py-3">Role</th>
                                <th className="px-6 py-3">Churn Score</th>
                                <th className="px-6 py-3">Key Factors</th>
                                <th className="px-6 py-3">Proj. Loss</th>
                                <th className="px-6 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {risks.map((risk, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium">{risk.userName}</td>
                                    <td className="px-6 py-4 capitalize">{risk.role}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center">
                                            <div className="w-16 h-2 bg-gray-200 rounded-full mr-2 overflow-hidden">
                                                <div 
                                                    className={`h-full ${risk.score > 70 ? 'bg-red-500' : 'bg-orange-400'}`} 
                                                    style={{ width: `${risk.score}%` }}
                                                ></div>
                                            </div>
                                            <span className="font-bold">{risk.score}%</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-1 flex-wrap">
                                            {risk.factors.map((f, idx) => (
                                                <span key={idx} className="text-[10px] bg-red-50 text-red-700 px-2 py-0.5 rounded border border-red-100">{f}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-red-600 font-medium">{formatPrice(risk.projectedLoss)}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => handleEngage(risk.userId)}
                                            className="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-md font-bold transition"
                                        >
                                            Engage
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const GrowthForecaster = () => {
    const [data, setData] = useState<GrowthForecast[]>([]);
    const { formatPrice } = useCurrency();

    useEffect(() => {
        AdminService.getGrowthForecast().then(setData);
    }, []);

    const maxRevenue = Math.max(...data.map(d => d.revenue));
    const maxSubs = Math.max(...data.map(d => d.subscribers));

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-8">
            <div className="flex justify-between items-center">
                <h3 className="font-bold text-gray-900 text-lg">Platform Growth Forecast</h3>
                <div className="flex gap-4 text-xs font-bold">
                    <span className="flex items-center"><span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>Revenue</span>
                    <span className="flex items-center"><span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>Subscribers</span>
                    <span className="flex items-center"><span className="w-3 h-3 bg-gray-300 rounded-full mr-2"></span>Predicted</span>
                </div>
            </div>

            <div className="h-64 flex items-end space-x-4 px-4 pb-2 border-b border-gray-100 relative">
                 {/* Y Axis lines could be added here for polish */}
                 {data.map((point, i) => (
                     <div key={i} className="flex-1 flex flex-col justify-end group relative">
                         {/* Revenue Bar */}
                         <div 
                            className={`w-full ${point.source === 'predicted' ? 'bg-blue-300' : 'bg-blue-600'} rounded-t opacity-80 transition-all hover:opacity-100 mb-1`}
                            style={{ height: `${(point.revenue / maxRevenue) * 80}%` }}
                         ></div>
                         {/* Subscribers Line (Simulated by a secondary bar for simplicity in this no-chart-lib env) */}
                         <div 
                             className={`w-1/2 mx-auto ${point.source === 'predicted' ? 'bg-green-300' : 'bg-green-500'} rounded-t transition-all`}
                             style={{ height: `${(point.subscribers / maxSubs) * 40}%` }}
                         ></div>
                         
                         <div className="text-[10px] text-gray-400 text-center mt-2 truncate">
                             {new Date(point.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                         </div>

                         {/* Tooltip */}
                         <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900 text-white text-xs p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition pointer-events-none z-10 w-32 text-center">
                             <div className="font-bold">{new Date(point.date).toLocaleDateString()}</div>
                             <div>Rev: {formatPrice(point.revenue)}</div>
                             <div>Subs: {point.subscribers}</div>
                             <div className="uppercase text-[9px] text-gray-400 mt-1">{point.source}</div>
                         </div>
                     </div>
                 ))}
            </div>

            <div className="grid grid-cols-2 gap-6 pt-4">
                 <div className="bg-blue-50 p-4 rounded-lg">
                     <p className="text-xs text-blue-600 uppercase font-bold">Predicted Revenue (Next 30d)</p>
                     <p className="text-2xl font-bold text-blue-900">{formatPrice(data[data.length - 1]?.revenue || 0)}</p>
                 </div>
                 <div className="bg-green-50 p-4 rounded-lg">
                     <p className="text-xs text-green-600 uppercase font-bold">Predicted Subscribers</p>
                     <p className="text-2xl font-bold text-green-900">{data[data.length - 1]?.subscribers.toLocaleString()}</p>
                 </div>
            </div>
        </div>
    );
};

const AutoOptimizer = () => {
    const [proposals, setProposals] = useState<OptimizationProposal[]>([]);
    const { showNotification } = useNotification();

    useEffect(() => {
        AdminService.getOptimizationProposals().then(setProposals);
    }, []);

    const handleApply = (id: string) => {
        setProposals(prev => prev.map(p => p.id === id ? { ...p, status: 'applied' } : p));
        showNotification('success', 'Applied', 'Optimization deployed to production.');
    };

    const handleDismiss = (id: string) => {
        setProposals(prev => prev.map(p => p.id === id ? { ...p, status: 'rejected' } : p));
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">AI Optimization Proposals</h3>
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-bold flex items-center">
                    <Zap className="w-3 h-3 mr-1" /> Auto-Tune Active
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {proposals.map(prop => (
                    <div key={prop.id} className={`p-6 rounded-xl border-2 transition-all ${prop.status === 'pending' ? 'bg-white border-purple-100 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-70'}`}>
                        <div className="flex justify-between items-start mb-3">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 bg-gray-100 px-2 py-1 rounded">{prop.module}</span>
                            <span className={`text-xs font-bold px-2 py-1 rounded capitalize ${
                                prop.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                prop.status === 'applied' ? 'bg-green-100 text-green-700' :
                                'bg-red-100 text-red-700'
                            }`}>
                                {prop.status}
                            </span>
                        </div>
                        <h4 className="font-bold text-gray-900 mb-2">Problem: {prop.issue}</h4>
                        <p className="text-sm text-gray-600 mb-4">{prop.recommendation}</p>
                        
                        <div className="flex items-center text-sm font-bold text-green-600 mb-6 bg-green-50 p-2 rounded-lg w-fit">
                            <TrendingUp className="w-4 h-4 mr-2" /> Projected Impact: {prop.impact}
                        </div>

                        {prop.status === 'pending' && (
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => handleApply(prop.id)}
                                    className="flex-1 bg-purple-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-purple-700 transition flex items-center justify-center"
                                >
                                    <Play className="w-3 h-3 mr-2" /> Apply Fix
                                </button>
                                <button 
                                    onClick={() => handleDismiss(prop.id)}
                                    className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-50"
                                >
                                    Dismiss
                                </button>
                            </div>
                        )}
                        {prop.status === 'applied' && (
                            <div className="text-xs text-center text-green-700 font-bold flex items-center justify-center">
                                <CheckCircle className="w-3 h-3 mr-1" /> Optimized on {new Date().toLocaleDateString()}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

const AnomalyMonitor = () => {
    const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
    const { showNotification } = useNotification();

    useEffect(() => {
        AdminService.getAnomalyAlerts().then(setAlerts);
    }, []);

    const resolveAlert = (id: string) => {
        setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'resolved' } : a));
        showNotification('success', 'Resolved', 'Alert marked as resolved.');
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
             <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                 <h3 className="font-bold text-gray-900 flex items-center">
                     <AlertOctagon className="w-5 h-5 mr-2 text-red-500" /> System Anomalies
                 </h3>
                 <span className="text-xs text-gray-500">Live Monitor</span>
             </div>
             <table className="w-full text-sm text-left">
                 <thead className="bg-gray-50 text-gray-500 uppercase font-bold text-xs">
                     <tr>
                         <th className="px-6 py-3">Severity</th>
                         <th className="px-6 py-3">Area</th>
                         <th className="px-6 py-3">Message</th>
                         <th className="px-6 py-3">Deviation</th>
                         <th className="px-6 py-3">Time</th>
                         <th className="px-6 py-3 text-right">Action</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                     {alerts.map(alert => (
                         <tr key={alert.id} className={`hover:bg-gray-50 ${alert.status === 'resolved' ? 'opacity-50' : ''}`}>
                             <td className="px-6 py-4">
                                 <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                     alert.severity === 'critical' ? 'bg-red-100 text-red-700' :
                                     alert.severity === 'warning' ? 'bg-orange-100 text-orange-800' :
                                     'bg-blue-100 text-blue-700'
                                 }`}>
                                     {alert.severity}
                                 </span>
                             </td>
                             <td className="px-6 py-4 capitalize font-medium">{alert.area}</td>
                             <td className="px-6 py-4 text-gray-600">{alert.message}</td>
                             <td className="px-6 py-4">
                                 <div className="flex flex-col text-xs">
                                     <span className="text-red-600 font-bold">{alert.value}</span>
                                     <span className="text-gray-400">vs {alert.baseline}</span>
                                 </div>
                             </td>
                             <td className="px-6 py-4 text-xs text-gray-400">{new Date(alert.timestamp).toLocaleTimeString()}</td>
                             <td className="px-6 py-4 text-right">
                                 {alert.status === 'active' && (
                                     <button 
                                        onClick={() => resolveAlert(alert.id)}
                                        className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 text-gray-700"
                                     >
                                         Resolve
                                     </button>
                                 )}
                                 {alert.status === 'resolved' && <span className="text-xs text-green-600 font-bold flex items-center justify-end"><CheckCircle className="w-3 h-3 mr-1"/> Done</span>}
                             </td>
                         </tr>
                     ))}
                 </tbody>
             </table>
        </div>
    );
};

export default AIIntelligence;
