
import React, { useState, useEffect } from 'react';
import { BarChart2, TrendingUp, Users, AlertTriangle, DollarSign, Activity, Download, Radar, UserCheck } from 'lucide-react';
import { useCurrency } from '../../context/CurrencyContext';
import { MarketService } from '../../services/ai/market.service';
import { LTVMetric, DemandForecast } from '../../types';

const MarketplaceAnalytics = () => {
    const { formatPrice } = useCurrency();
    const [activeTab, setActiveTab] = useState<'health' | 'ltv' | 'demand'>('health');
    const [ltvData, setLtvData] = useState<LTVMetric[]>([]);
    const [forecasts, setForecasts] = useState<DemandForecast[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (activeTab === 'ltv') loadLTV();
        if (activeTab === 'demand') loadDemand();
    }, [activeTab]);

    const loadLTV = async () => {
        setLoading(true);
        const data = await MarketService.getLTVPredictions();
        setLtvData(data);
        setLoading(false);
    };

    const loadDemand = async () => {
        setLoading(true);
        const data = await MarketService.getDemandForecast();
        setForecasts(data);
        setLoading(false);
    };

    // ... Existing metrics ...
    const metrics = {
        gmv: 450200,
        takeRate: 12.5,
        activeUsers: 12500,
        disputeRate: 1.2,
        aiAutomationRate: 85,
        growth: { gmv: 15, users: 8, automation: 5 }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Marketplace Intelligence</h2>
                    <p className="text-sm text-gray-500">Real-time platform health and AI predictive analytics.</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setActiveTab('health')} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'health' ? 'bg-white shadow text-indigo-600' : 'text-gray-600'}`}>Platform Health</button>
                    <button onClick={() => setActiveTab('ltv')} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'ltv' ? 'bg-white shadow text-indigo-600' : 'text-gray-600'}`}>LTV Prediction</button>
                    <button onClick={() => setActiveTab('demand')} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'demand' ? 'bg-white shadow text-indigo-600' : 'text-gray-600'}`}>Demand Forecast</button>
                </div>
            </div>

            {activeTab === 'health' && (
                <div className="space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <KPICard title="Gross Merchandise Value" value={formatPrice(metrics.gmv)} change={`+${metrics.growth.gmv}%`} icon={DollarSign} color="green" />
                        <KPICard title="Take Rate (Revenue)" value={`${metrics.takeRate}%`} sub={`Net: ${formatPrice(metrics.gmv * (metrics.takeRate/100))}`} icon={Activity} color="blue" />
                        <KPICard title="AI Automation Rate" value={`${metrics.aiAutomationRate}%`} change={`+${metrics.growth.automation}%`} icon={TrendingUp} color="purple" tooltip="Percentage of actions handled without human intervention" />
                        <KPICard title="Dispute Rate" value={`${metrics.disputeRate}%`} sub="Industry Avg: 3.5%" icon={AlertTriangle} color="orange" inverse={true} />
                    </div>
                    {/* ... Existing Health Visuals ... */}
                </div>
            )}

            {activeTab === 'ltv' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                        <h3 className="font-bold text-gray-900 flex items-center"><UserCheck className="w-5 h-5 mr-2 text-indigo-600"/> High Value User Predictions</h3>
                        <span className="bg-indigo-50 text-indigo-700 text-xs px-2 py-1 rounded-full font-bold">AI Confidence: High</span>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4">Role</th>
                                <th className="px-6 py-4">Predicted LTV</th>
                                <th className="px-6 py-4">Velocity</th>
                                <th className="px-6 py-4">Churn Risk</th>
                                <th className="px-6 py-4">AI Recommendation</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {ltvData.map((user, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-bold text-gray-900">{user.userName}</td>
                                    <td className="px-6 py-4 capitalize">{user.role}</td>
                                    <td className="px-6 py-4 font-bold text-green-600">{formatPrice(user.predictedLTV)}</td>
                                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold ${user.revenueVelocity === 'High' ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>{user.revenueVelocity}</span></td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center">
                                            <div className="w-16 h-2 bg-gray-200 rounded-full mr-2 overflow-hidden">
                                                <div className={`h-full ${user.churnRisk > 50 ? 'bg-red-500' : 'bg-green-500'}`} style={{width: `${user.churnRisk}%`}}></div>
                                            </div>
                                            {user.churnRisk}%
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-indigo-600">{user.nextAction}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'demand' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {forecasts.map((fc, i) => (
                        <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
                            <div className="flex justify-between mb-4">
                                <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold">{fc.category}</span>
                                <span className="text-gray-400 text-xs">{fc.timeframe} Forecast</span>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">{fc.skill}</h3>
                            <div className="flex items-end mb-4">
                                <span className="text-3xl font-extrabold text-green-600">+{fc.growthRate}%</span>
                                <span className="text-gray-500 text-sm mb-1 ml-2">Growth Rate</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="bg-gray-50 p-3 rounded-lg">
                                    <span className="block text-gray-500 text-xs uppercase font-bold">Suggested Rate</span>
                                    <span className="font-medium text-gray-900">{fc.recommendedPriceRange}</span>
                                </div>
                                <div className="bg-gray-50 p-3 rounded-lg">
                                    <span className="block text-gray-500 text-xs uppercase font-bold">Confidence</span>
                                    <span className="font-medium text-gray-900">{(fc.confidence * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    <div className="bg-gradient-to-br from-purple-900 to-indigo-900 p-6 rounded-xl shadow-lg text-white flex flex-col justify-center items-center text-center">
                        <Radar className="w-12 h-12 mb-4 text-yellow-400" />
                        <h3 className="text-xl font-bold mb-2">Market Opportunity Radar</h3>
                        <p className="text-indigo-200 text-sm mb-6">AI scans 50k+ signals to predict the next big skill shortage.</p>
                        <button className="bg-white text-indigo-900 px-6 py-2 rounded-lg font-bold hover:bg-indigo-50 transition">
                            View Full Report
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const KPICard = ({ title, value, change, sub, icon: Icon, color, inverse, tooltip }: any) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 relative group">
        <div className="flex justify-between items-start mb-4">
            <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</p>
                <h3 className="text-2xl font-extrabold text-gray-900 mt-1">{value}</h3>
            </div>
            <div className={`p-3 rounded-lg bg-${color}-100 text-${color}-600`}>
                <Icon size={24} />
            </div>
        </div>
        <div className="flex items-center text-sm">
            {change && (
                <span className={`font-bold mr-2 ${inverse ? 'text-red-600' : 'text-green-600'}`}>
                    {change}
                </span>
            )}
            {sub && <span className="text-gray-500">{sub}</span>}
        </div>
        {tooltip && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {tooltip}
            </div>
        )}
    </div>
);

export default MarketplaceAnalytics;
