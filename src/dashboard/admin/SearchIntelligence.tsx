
import React, { useState, useEffect } from 'react';
import { SearchService } from '../../services/search';
import { TrendingSearch, SearchConfig } from '../../types';
import { useNotification } from '../../context/NotificationContext';
import { TrendingUp, Lock, Unlock, Pin, Trash2, Settings, Save, Search, RefreshCw, BarChart2 } from 'lucide-react';

const SearchIntelligence = () => {
    const [trending, setTrending] = useState<TrendingSearch[]>([]);
    const [config, setConfig] = useState<SearchConfig | null>(null);
    const [analytics, setAnalytics] = useState<any>(null);
    const { showNotification } = useNotification();
    const [activeTab, setActiveTab] = useState<'trends' | 'settings'>('trends');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [t, c, a] = await Promise.all([
            SearchService.getAllTrendingData(),
            SearchService.getConfig(),
            SearchService.getAnalytics()
        ]);
        setTrending(t);
        setConfig(c);
        setAnalytics(a);
    };

    const handlePin = async (item: TrendingSearch) => {
        await SearchService.updateTrendingItem(item.id, { isPinned: !item.isPinned });
        loadData();
        showNotification('success', item.isPinned ? 'Unpinned' : 'Pinned', `Keyword "${item.keyword}" updated.`);
    };

    const handleBlock = async (item: TrendingSearch) => {
        await SearchService.updateTrendingItem(item.id, { isBlocked: !item.isBlocked });
        loadData();
        showNotification('success', item.isBlocked ? 'Unblocked' : 'Blocked', `Keyword "${item.keyword}" visibility updated.`);
    };

    const handleDelete = async (id: string) => {
        if(confirm("Are you sure? This will remove the keyword history.")) {
            await SearchService.deleteTrendingItem(id);
            loadData();
            showNotification('info', 'Deleted', 'Keyword removed.');
        }
    };

    const handleSaveConfig = async () => {
        if (config) {
            await SearchService.saveConfig(config);
            showNotification('success', 'Settings Saved', 'Search configuration updated.');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Search Intelligence</h2>
                    <p className="text-sm text-gray-500">Manage trending searches, blocks, and AI settings.</p>
                </div>
                <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setActiveTab('trends')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'trends' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>Trends & Keywords</button>
                    <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'settings' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>Configuration</button>
                </div>
            </div>

            {/* Analytics Summary */}
            {analytics && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="text-xs text-gray-500 font-bold uppercase">Total Searches</div>
                        <div className="text-2xl font-bold text-gray-900 mt-1">{analytics.totalSearches}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="text-xs text-gray-500 font-bold uppercase">Conversion Rate</div>
                        <div className="text-2xl font-bold text-green-600 mt-1">{analytics.conversionRate}%</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="text-xs text-gray-500 font-bold uppercase">Zero Results</div>
                        <div className="text-2xl font-bold text-red-600 mt-1">{analytics.zeroResultSearches}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="text-xs text-gray-500 font-bold uppercase">Top Keyword</div>
                        <div className="text-lg font-bold text-blue-600 mt-1 truncate">{analytics.topKeywords[0]?.keyword || '-'}</div>
                    </div>
                </div>
            )}

            {activeTab === 'trends' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3">Keyword</th>
                                <th className="px-6 py-3">Volume</th>
                                <th className="px-6 py-3">Trend</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {trending.map(item => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{item.keyword}</td>
                                    <td className="px-6 py-4">{item.count}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                                            item.trend === 'up' ? 'bg-green-100 text-green-700' :
                                            item.trend === 'down' ? 'bg-red-100 text-red-700' :
                                            'bg-gray-100 text-gray-600'
                                        }`}>
                                            {item.trend === 'up' && <TrendingUp className="w-3 h-3 mr-1" />}
                                            {item.trend.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-2">
                                            {item.isPinned && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">Pinned</span>}
                                            {item.isBlocked && <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs">Blocked</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-1">
                                        <button onClick={() => handlePin(item)} className={`p-1.5 rounded hover:bg-gray-100 ${item.isPinned ? 'text-blue-600' : 'text-gray-400'}`} title="Pin to Homepage">
                                            <Pin className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleBlock(item)} className={`p-1.5 rounded hover:bg-gray-100 ${item.isBlocked ? 'text-red-600' : 'text-gray-400'}`} title="Block Keyword">
                                            {item.isBlocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                                        </button>
                                        <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded hover:bg-red-50 text-red-600" title="Delete">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'settings' && config && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl">
                    <h3 className="font-bold text-gray-900 mb-6 flex items-center"><Settings className="w-5 h-5 mr-2" /> Global Search Configuration</h3>
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-medium text-gray-900">AI Search Features</h4>
                                <p className="text-xs text-gray-500">Enable predictive autocomplete and semantic matching.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={config.aiEnabled} onChange={e => setConfig({...config, aiEnabled: e.target.checked})} />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-medium text-gray-900">Personalized Suggestions</h4>
                                <p className="text-xs text-gray-500">Tailor results based on user role and history.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={config.personalizedSuggestions} onChange={e => setConfig({...config, personalizedSuggestions: e.target.checked})} />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Max Trending Items on Homepage</label>
                            <input 
                                type="number" 
                                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2.5"
                                value={config.maxTrendingItems}
                                onChange={e => setConfig({...config, maxTrendingItems: parseInt(e.target.value)})}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Global Blocked Keywords (Comma separated)</label>
                            <textarea 
                                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2.5"
                                rows={3}
                                value={config.blockedKeywords.join(', ')}
                                onChange={e => setConfig({...config, blockedKeywords: e.target.value.split(',').map(s => s.trim())})}
                            />
                        </div>

                        <div className="pt-4 flex justify-end">
                            <button onClick={handleSaveConfig} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center">
                                <Save className="w-4 h-4 mr-2" /> Save Settings
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchIntelligence;
