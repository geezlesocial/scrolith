
import React, { useState, useEffect } from 'react';
import { 
    Users, MessageSquare, AlertTriangle, ShieldCheck, Settings, BarChart2, ToggleLeft, ToggleRight, 
    Lock, CheckCircle, XCircle, FileText, Gavel, Radio, Flag, Hash, Activity, DollarSign, Pin, Trash2, Plus, X, Coins, Megaphone, Share2, Search, Filter, Send, Upload, Edit2, Save, Unlock, Copy, AlertOctagon, Ban, Image as ImageIcon
} from 'lucide-react';
import { CommunityService } from '../../services/community';
import { GcoinService } from '../../services/gcoin';
import { AdService } from '../../services/ads';
import { FileService } from '../../services/files';
import { CommunitySettings, ModerationLog, ForumThread, CommunityChannel, GcoinWallet, AdCampaign, UserRole, UploadedFile, GcoinSettings, GcoinConversionRequest } from '../../types';
import { useNotification } from '../../context/NotificationContext';
import CommunityAnalytics from './CommunityAnalytics';
import { useCurrency } from '../../context/CurrencyContext';
import FilePicker from '../../components/FilePicker';

type AdminTab = 'overview' | 'threads' | 'channels' | 'moderation' | 'gcoin' | 'ads' | 'social' | 'settings';

const CommunityManagement = () => {
    const [activeTab, setActiveTab] = useState<AdminTab>('overview');
    const [settings, setSettings] = useState<CommunitySettings | null>(null);
    const [logs, setLogs] = useState<ModerationLog[]>([]);
    const { showNotification } = useNotification();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [s, l] = await Promise.all([
            CommunityService.getSettings(),
            CommunityService.getModerationLogs()
        ]);
        setSettings(s);
        setLogs(l);
    };

    const toggleSetting = async (section: keyof CommunitySettings, key: string) => {
        if (!settings) return;
        // Deep copy to avoid mutation issues
        const updated = JSON.parse(JSON.stringify(settings));
        // Toggle the specific key in the specific section
        if (updated[section]) {
            updated[section][key] = !updated[section][key];
        }
        
        setSettings(updated);
        await CommunityService.updateSettings(updated);
        showNotification('success', 'Updated', 'Setting changed successfully.');
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Community & Forum Admin</h2>
                    <p className="text-sm text-gray-500">Superuser controls for all community assets.</p>
                </div>
                <div className="flex gap-2">
                    <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded flex items-center"><ShieldCheck className="w-3 h-3 mr-1"/> ADMIN MODE</span>
                </div>
            </div>

            {/* Navigation Bar */}
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto max-w-full">
                <TabButton id="overview" label="Overview" icon={Activity} active={activeTab === 'overview'} onClick={setActiveTab} />
                <TabButton id="gcoin" label="Gcoin Rewards" icon={Coins} active={activeTab === 'gcoin'} onClick={setActiveTab} />
                <TabButton id="ads" label="Ads Manager" icon={Megaphone} active={activeTab === 'ads'} onClick={setActiveTab} />
                <TabButton id="threads" label="Threads" icon={FileText} active={activeTab === 'threads'} onClick={setActiveTab} />
                <TabButton id="channels" label="Channels" icon={Hash} active={activeTab === 'channels'} onClick={setActiveTab} />
                <TabButton id="moderation" label="Moderation" icon={Gavel} active={activeTab === 'moderation'} onClick={setActiveTab} />
                <TabButton id="social" label="Social Graph" icon={Share2} active={activeTab === 'social'} onClick={setActiveTab} />
                <TabButton id="settings" label="Settings" icon={Settings} active={activeTab === 'settings'} onClick={setActiveTab} />
            </div>

            <div className="animate-fade-in">
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        <CommunityAnalytics /> 
                        {/* Quick Stats for new modules */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="text-xs font-bold text-gray-500 uppercase">Total Gcoins Awarded</h3>
                                <p className="text-2xl font-bold text-yellow-600 mt-2">15,420</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="text-xs font-bold text-gray-500 uppercase">Active Ads</h3>
                                <p className="text-2xl font-bold text-blue-600 mt-2">4 Campaigns</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="text-xs font-bold text-gray-500 uppercase">New Follows (Today)</h3>
                                <p className="text-2xl font-bold text-green-600 mt-2">124</p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'gcoin' && <GcoinManager />}
                {activeTab === 'ads' && <AdManager />}
                {activeTab === 'threads' && <ThreadManager />}
                {activeTab === 'channels' && <ChannelManager />}
                {activeTab === 'moderation' && <ModerationQueue logs={logs} refresh={() => CommunityService.getModerationLogs().then(setLogs)} />}
                {activeTab === 'social' && <SocialGraphView />}
                {activeTab === 'settings' && settings && <SettingsPanel settings={settings} toggleSetting={toggleSetting} />}
            </div>
        </div>
    );
};

// --- GCOIN MANAGER ---

const GcoinManager = () => {
    const [subTab, setSubTab] = useState<'overview' | 'wallets' | 'conversions' | 'fraud' | 'settings'>('overview');
    const [wallets, setWallets] = useState<GcoinWallet[]>([]);
    const [conversions, setConversions] = useState<GcoinConversionRequest[]>([]);
    const [config, setConfig] = useState<GcoinSettings>({ conversionRate: 0, minWithdrawal: 0, conversionEnabled: false, userTransfersEnabled: false });
    
    // Transfer Modal
    const [isSendModalOpen, setIsSendModalOpen] = useState(false);
    const [sendAmount, setSendAmount] = useState(0);
    const [sendRecipient, setSendRecipient] = useState('');
    const [sendReason, setSendReason] = useState('');
    const { showNotification } = useNotification();
    const { formatPrice } = useCurrency();

    useEffect(() => {
        refreshData();
        GcoinService.getSettings().then(setConfig);
    }, []);

    const refreshData = () => {
        GcoinService.getAllWallets().then(setWallets);
        GcoinService.getConversionRequests().then(setConversions);
    };

    const handleSendCoins = async () => {
        if (!sendRecipient || sendAmount <= 0) {
            showNotification('alert', 'Error', 'Invalid recipient or amount');
            return;
        }

        const result = await GcoinService.creditUser(sendRecipient, sendAmount, sendReason || 'Admin Manual Grant');
        
        if (result.success) {
            showNotification('success', 'Coins Sent', result.message);
            setIsSendModalOpen(false);
            setSendAmount(0);
            setSendRecipient('');
            setSendReason('');
            refreshData();
        } else {
            showNotification('alert', 'Transfer Failed', result.message);
        }
    };

    const handleFreezeWallet = async (id: string, isFrozen: boolean) => {
        if (confirm(`Are you sure you want to ${isFrozen ? 'UNFREEZE' : 'FREEZE'} this wallet?`)) {
            if(isFrozen) await GcoinService.unfreezeWallet(id);
            else await GcoinService.freezeWallet(id);
            refreshData();
            showNotification('info', 'Status Updated', `Wallet status changed.`);
        }
    };

    const handleSaveSettings = async () => {
        await GcoinService.saveSettings(config);
        showNotification('success', 'Saved', 'Gcoin configuration updated.');
    };

    const processConversion = async (req: GcoinConversionRequest, action: 'approve' | 'reject') => {
        try {
            await GcoinService.processConversion(req.id, action, 'admin-1');
            showNotification('success', 'Processed', `Conversion ${action}d.`);
            refreshData();
        } catch (e) {
            showNotification('alert', 'Error', 'Failed to process request.');
        }
    };

    // Calculate Overview Stats
    const totalIssued = wallets.reduce((sum, w) => sum + w.lifetimeEarned, 0);
    const totalCirculation = wallets.reduce((sum, w) => sum + w.balance, 0);
    const activeWallets = wallets.filter(w => w.status === 'active').length;
    const frozenWallets = wallets.filter(w => w.status === 'frozen').length;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200">
                <div className="flex space-x-2 overflow-x-auto">
                    <button onClick={() => setSubTab('overview')} className={`px-4 py-2 rounded-lg text-sm font-medium ${subTab === 'overview' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}>Overview</button>
                    <button onClick={() => setSubTab('wallets')} className={`px-4 py-2 rounded-lg text-sm font-medium ${subTab === 'wallets' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}>Wallet Registry</button>
                    <button onClick={() => setSubTab('conversions')} className={`px-4 py-2 rounded-lg text-sm font-medium ${subTab === 'conversions' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}>Conversions</button>
                    <button onClick={() => setSubTab('fraud')} className={`px-4 py-2 rounded-lg text-sm font-medium ${subTab === 'fraud' ? 'bg-red-50 text-red-700' : 'text-gray-600 hover:bg-gray-50'}`}>Fraud Center</button>
                    <button onClick={() => setSubTab('settings')} className={`px-4 py-2 rounded-lg text-sm font-medium ${subTab === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}>Config</button>
                </div>
                <button onClick={() => setIsSendModalOpen(true)} className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center hover:bg-green-700">
                    <Send className="w-4 h-4 mr-2" /> Send Gcoin
                </button>
            </div>

            {subTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200">
                        <p className="text-xs text-gray-500 uppercase font-bold">Total Issued</p>
                        <h3 className="text-3xl font-extrabold text-yellow-600 mt-2">{totalIssued.toLocaleString()} GC</h3>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-gray-200">
                        <p className="text-xs text-gray-500 uppercase font-bold">In Circulation</p>
                        <h3 className="text-3xl font-extrabold text-gray-800 mt-2">{totalCirculation.toLocaleString()} GC</h3>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-gray-200">
                        <p className="text-xs text-gray-500 uppercase font-bold">Active Wallets</p>
                        <h3 className="text-3xl font-extrabold text-green-600 mt-2">{activeWallets}</h3>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-gray-200">
                        <p className="text-xs text-gray-500 uppercase font-bold">Frozen Wallets</p>
                        <h3 className="text-3xl font-extrabold text-red-600 mt-2">{frozenWallets}</h3>
                    </div>
                </div>
            )}

            {subTab === 'wallets' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                        <h3 className="font-bold text-gray-800">Wallet Registry</h3>
                        <input type="text" placeholder="Search ID, User..." className="text-sm border rounded px-3 py-1 w-64" />
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500"><tr><th>User</th><th>Recipient ID</th><th>Balance</th><th>Status</th><th>Fraud Score</th><th>Actions</th></tr></thead>
                        <tbody className="divide-y">
                            {wallets.map(w => (
                                <tr key={w.userId} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium">{w.userId}</td>
                                    <td className="px-6 py-4 font-mono text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded w-fit">{w.recipientId}</td>
                                    <td className="px-6 py-4 font-bold text-yellow-600">{w.balance} GC</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded text-xs uppercase ${w.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {w.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">{w.fraudScore > 0 ? <span className="text-red-500 font-bold">{w.fraudScore}</span> : '0'}</td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        <button onClick={() => handleFreezeWallet(w.userId, w.status === 'frozen')} className="text-red-600 hover:underline">
                                            {w.status === 'frozen' ? 'Unfreeze' : 'Freeze'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            
            {/* ... other Gcoin tabs (conversions, fraud, settings) ... */}
            {/* Only implemented basic structure as requested, copying content from previous step to keep it working */}
             {subTab === 'conversions' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500"><tr><th>Date</th><th>User</th><th>Amount (GC)</th><th>Fiat Value</th><th>Status</th><th className="text-right">Action</th></tr></thead>
                        <tbody className="divide-y">
                            {conversions.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-500">No pending conversions.</td></tr>}
                            {conversions.map(req => (
                                <tr key={req.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-gray-500">{new Date(req.requestedAt).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">{req.userName}</td>
                                    <td className="px-6 py-4 font-bold">{req.amountGcoin} GC</td>
                                    <td className="px-6 py-4 text-green-600">{formatPrice(req.amountFiat)}</td>
                                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold uppercase ${req.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100'}`}>{req.status}</span></td>
                                    <td className="px-6 py-4 text-right">
                                        {req.status === 'pending' && (
                                            <div className="flex gap-2 justify-end">
                                                <button onClick={() => processConversion(req, 'approve')} className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700">Approve</button>
                                                <button onClick={() => processConversion(req, 'reject')} className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700">Reject</button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
             {subTab === 'settings' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-2xl">
                    <h3 className="font-bold text-gray-900 mb-6">Global Gcoin Configuration</h3>
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Conversion Rate ($ per Gcoin)</label>
                                <input type="number" step="0.01" className="w-full border rounded p-2" value={config.conversionRate} onChange={e => setConfig({...config, conversionRate: parseFloat(e.target.value)})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Min Withdrawal (GC)</label>
                                <input type="number" className="w-full border rounded p-2" value={config.minWithdrawal} onChange={e => setConfig({...config, minWithdrawal: parseInt(e.target.value)})} />
                            </div>
                        </div>
                        
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                                <span className="font-bold text-gray-800">Enable Conversions</span>
                                <p className="text-xs text-gray-500">Allow users to convert Gcoins to Wallet Balance</p>
                            </div>
                            <input type="checkbox" checked={config.conversionEnabled} onChange={e => setConfig({...config, conversionEnabled: e.target.checked})} className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="flex justify-end pt-4">
                            <button onClick={handleSaveSettings} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700">Save Config</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Send Modal */}
            {isSendModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg">Admin Grant (Gcoin)</h3>
                            <button onClick={() => setIsSendModalOpen(false)}><X className="w-5 h-5"/></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Recipient (User ID, Email, or Recipient ID)</label>
                                <input className="w-full border rounded p-2" value={sendRecipient} onChange={e => setSendRecipient(e.target.value)} placeholder="GZ-XXXXX or email" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Amount</label>
                                <input type="number" className="w-full border rounded p-2" value={sendAmount} onChange={e => setSendAmount(parseInt(e.target.value))} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Reason (Audit Log)</label>
                                <input className="w-full border rounded p-2" value={sendReason} onChange={e => setSendReason(e.target.value)} placeholder="Contest Winner" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setIsSendModalOpen(false)} className="px-4 py-2 text-gray-600 border rounded">Cancel</button>
                            <button onClick={handleSendCoins} className="px-4 py-2 bg-green-600 text-white rounded font-bold">Process Grant</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- ADS MANAGER ---

const AdManager = () => {
    const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
    const [isEditing, setIsEditing] = useState<Partial<AdCampaign> | null>(null);
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const { showNotification } = useNotification();

    useEffect(() => {
        AdService.getAllCampaigns().then(setCampaigns);
    }, []);

    const handleSave = async () => {
        if (!isEditing || !isEditing.title) return;
        const toSave = {
            ...isEditing,
            id: isEditing.id || `ad-${Date.now()}`,
            status: isEditing.status || 'draft',
            impressions: isEditing.impressions || 0,
            clicks: isEditing.clicks || 0,
            ctr: isEditing.ctr || 0,
            creativeUrl: isEditing.creativeUrl || 'https://via.placeholder.com/400x200'
        } as AdCampaign;
        
        await AdService.saveCampaign(toSave);
        setCampaigns(prev => {
            const idx = prev.findIndex(c => c.id === toSave.id);
            if(idx >= 0) {
                const newC = [...prev];
                newC[idx] = toSave;
                return newC;
            }
            return [...prev, toSave];
        });
        setIsEditing(null);
        showNotification('success', 'Ad Saved', 'Campaign updated successfully.');
    };

    const handleDelete = async (id: string) => {
        if(confirm('Delete this ad?')) {
            await AdService.deleteCampaign(id);
            setCampaigns(prev => prev.filter(c => c.id !== id));
            showNotification('success', 'Deleted', 'Ad campaign removed.');
        }
    };

    const handleFileSelect = (file: UploadedFile) => {
        if (isEditing) {
            setIsEditing({ ...isEditing, creativeUrl: file.url });
            setIsFilePickerOpen(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div>
                    <h3 className="font-bold text-gray-900">Sponsored Posts</h3>
                    <p className="text-xs text-gray-500">Manage community advertisements</p>
                </div>
                <button 
                    onClick={() => setIsEditing({ title: '', clientName: '', targetUrl: '', targetRoles: [], placement: 'feed' })}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center hover:bg-blue-700"
                >
                    <Plus className="w-4 h-4 mr-2" /> Create Ad
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {campaigns.map(c => (
                    <div key={c.id} className="bg-white p-4 rounded-xl border border-gray-200 flex gap-4 group">
                        <div className="w-24 h-24 flex-shrink-0 bg-gray-100 rounded overflow-hidden">
                            <img src={c.creativeUrl} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                                <h4 className="font-bold text-gray-900 truncate">{c.title}</h4>
                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{c.status}</span>
                            </div>
                            <p className="text-xs text-gray-500 mb-2">{c.clientName} • {c.placement}</p>
                            <div className="grid grid-cols-3 gap-2 text-xs bg-gray-50 p-2 rounded">
                                <div><strong>{c.impressions.toLocaleString()}</strong> imps</div>
                                <div><strong>{c.clicks}</strong> clicks</div>
                                <div><strong>{c.ctr}%</strong> CTR</div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setIsEditing(c)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit2 className="w-4 h-4"/></button>
                            <button onClick={() => handleDelete(c.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Ad Editor Modal */}
            {isEditing && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-lg">{isEditing.id ? 'Edit Ad' : 'New Ad Campaign'}</h3>
                            <button onClick={() => setIsEditing(null)}><X className="w-5 h-5 text-gray-400"/></button>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Creative</label>
                                <div onClick={() => setIsFilePickerOpen(true)} className="h-32 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-50">
                                    {isEditing.creativeUrl ? <img src={isEditing.creativeUrl} className="h-full object-contain"/> : <div className="text-center text-gray-400"><Upload className="w-8 h-8 mx-auto mb-1"/>Upload Media</div>}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Title</label>
                                    <input className="w-full border rounded p-2 text-sm" value={isEditing.title} onChange={e => setIsEditing({...isEditing, title: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Client Name</label>
                                    <input className="w-full border rounded p-2 text-sm" value={isEditing.clientName} onChange={e => setIsEditing({...isEditing, clientName: e.target.value})} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Target URL</label>
                                <input className="w-full border rounded p-2 text-sm" value={isEditing.targetUrl} onChange={e => setIsEditing({...isEditing, targetUrl: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Placement</label>
                                    <select className="w-full border rounded p-2 text-sm" value={isEditing.placement} onChange={e => setIsEditing({...isEditing, placement: e.target.value as any})}>
                                        <option value="feed">Feed</option>
                                        <option value="sidebar">Sidebar</option>
                                        <option value="forum_top">Forum Top</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
                                    <select className="w-full border rounded p-2 text-sm" value={isEditing.status} onChange={e => setIsEditing({...isEditing, status: e.target.value as any})}>
                                        <option value="active">Active</option>
                                        <option value="paused">Paused</option>
                                        <option value="draft">Draft</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Target Audience</label>
                                <div className="flex gap-2">
                                    {[UserRole.FREELANCER, UserRole.EMPLOYER].map(role => (
                                        <button 
                                            key={role}
                                            onClick={() => {
                                                const roles = isEditing.targetRoles || [];
                                                const newRoles = roles.includes(role) ? roles.filter(r => r !== role) : [...roles, role];
                                                setIsEditing({...isEditing, targetRoles: newRoles});
                                            }}
                                            className={`px-3 py-1 text-xs border rounded capitalize ${isEditing.targetRoles?.includes(role) ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white'}`}
                                        >
                                            {role}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setIsEditing(null)} className="px-4 py-2 border rounded text-gray-600">Cancel</button>
                            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">Save Ad</button>
                        </div>
                    </div>
                </div>
            )}
            
            <FilePicker isOpen={isFilePickerOpen} onClose={() => setIsFilePickerOpen(false)} onSelect={handleFileSelect} acceptedTypes="image/*" />
        </div>
    );
};

// --- THREAD MANAGER ---

const ThreadManager = () => {
    const [threads, setThreads] = useState<ForumThread[]>([]);
    const { showNotification } = useNotification();
    
    useEffect(() => {
        CommunityService.getThreads().then(setThreads);
    }, []);

    const handleAction = async (id: string, action: 'pin'|'lock'|'delete') => {
        if(action === 'delete' && !confirm('Delete thread?')) return;
        
        if (action === 'delete') await CommunityService.deleteThread(id);
        if (action === 'pin') await CommunityService.toggleThreadPin(id);
        if (action === 'lock') await CommunityService.toggleThreadLock(id);
        
        showNotification('success', 'Updated', `Thread ${action} successful.`);
        CommunityService.getThreads().then(setThreads);
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50 font-bold text-gray-700">Recent Discussions</div>
            <div className="divide-y divide-gray-100">
                {threads.map(t => (
                    <div key={t.id} className="p-4 hover:bg-gray-50 flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                {t.isPinned && <Pin className="w-3 h-3 text-orange-500 fill-current" />}
                                {t.status === 'locked' && <Lock className="w-3 h-3 text-red-500" />}
                                <h4 className="font-bold text-gray-900 text-sm line-clamp-1">{t.title}</h4>
                            </div>
                            <div className="text-xs text-gray-500">
                                by {t.userName} • {t.categoryName} • {new Date(t.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => handleAction(t.id, 'pin')} className={`p-1.5 rounded hover:bg-gray-200 ${t.isPinned ? 'text-orange-600' : 'text-gray-400'}`}><Pin className="w-4 h-4"/></button>
                            <button onClick={() => handleAction(t.id, 'lock')} className={`p-1.5 rounded hover:bg-gray-200 ${t.status === 'locked' ? 'text-red-600' : 'text-gray-400'}`}><Lock className="w-4 h-4"/></button>
                            <button onClick={() => handleAction(t.id, 'delete')} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- CHANNEL MANAGER ---

const ChannelManager = () => {
    const [channels, setChannels] = useState<CommunityChannel[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [newChannel, setNewChannel] = useState<Partial<CommunityChannel>>({ name: '', type: 'public', isPaid: false, price: 0 });
    const { showNotification } = useNotification();

    useEffect(() => {
        CommunityService.getChannels().then(setChannels);
    }, []);

    const handleCreate = async () => {
        if(!newChannel.name) return;
        await CommunityService.createChannel(newChannel);
        setChannels(await CommunityService.getChannels());
        setIsCreating(false);
        setNewChannel({ name: '', type: 'public', isPaid: false, price: 0 });
        showNotification('success', 'Created', 'Channel added.');
    };

    const handleDelete = async (id: string) => {
        if(confirm('Delete channel?')) {
            await CommunityService.deleteChannel(id);
            setChannels(await CommunityService.getChannels());
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200">
                <h3 className="font-bold text-gray-900">Channels</h3>
                <button onClick={() => setIsCreating(true)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-bold flex items-center hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-1" /> New Channel
                </button>
            </div>

            {isCreating && (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 animate-fade-in">
                    <h4 className="font-bold text-sm mb-3">Create Channel</h4>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <input className="border rounded p-2 text-sm" placeholder="Channel Name" value={newChannel.name} onChange={e => setNewChannel({...newChannel, name: e.target.value})} />
                        <select className="border rounded p-2 text-sm" value={newChannel.type} onChange={e => setNewChannel({...newChannel, type: e.target.value as any})}>
                            <option value="public">Public</option>
                            <option value="private">Private</option>
                            <option value="club">Club (Paid)</option>
                            <option value="event">Event</option>
                        </select>
                    </div>
                    {newChannel.type === 'club' && (
                        <div className="flex items-center gap-2 mb-4">
                            <input type="checkbox" checked={newChannel.isPaid} onChange={e => setNewChannel({...newChannel, isPaid: e.target.checked})} />
                            <span className="text-sm">Paid?</span>
                            {newChannel.isPaid && <input type="number" className="border rounded p-1 text-sm w-24" placeholder="Price" value={newChannel.price} onChange={e => setNewChannel({...newChannel, price: parseFloat(e.target.value)})} />}
                        </div>
                    )}
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setIsCreating(false)} className="px-3 py-1.5 text-sm border rounded bg-white">Cancel</button>
                        <button onClick={handleCreate} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded font-bold">Create</button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {channels.map(c => (
                    <div key={c.id} className="bg-white p-4 rounded-xl border border-gray-200 flex justify-between items-center group">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900"># {c.name}</span>
                                {c.isPaid && <Lock className="w-3 h-3 text-orange-500" />}
                            </div>
                            <span className="text-xs text-gray-500 capitalize">{c.type} Channel • {c.onlineCount} Online</span>
                        </div>
                        <button onClick={() => handleDelete(c.id)} className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- MODERATION QUEUE ---

const ModerationQueue = ({ logs, refresh }: { logs: ModerationLog[], refresh: () => void }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
             <h3 className="font-bold text-gray-800">Flagged Content Queue</h3>
             <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-bold">{logs.length} Pending</span>
        </div>
        <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500"><tr><th>User</th><th>Reason</th><th>Snippet</th><th>Risk</th><th>Action</th></tr></thead>
            <tbody className="divide-y">
                {logs.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-500">Queue is empty. Good job!</td></tr>
                ) : logs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium">{log.userName}</td>
                        <td className="px-6 py-4">{log.reason}</td>
                        <td className="px-6 py-4 text-gray-500 truncate max-w-xs">"{log.snippet}"</td>
                        <td className="px-6 py-4"><span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${log.riskLevel === 'High' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{log.riskLevel}</span></td>
                        <td className="px-6 py-4">
                            <div className="flex gap-2">
                                <button className="text-green-600 text-xs border border-green-200 px-2 py-1 rounded hover:bg-green-50">Approve</button>
                                <button className="text-red-600 text-xs border border-red-200 px-2 py-1 rounded hover:bg-red-50">Ban</button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// --- SOCIAL GRAPH ---

const SocialGraphView = () => (
    <div className="space-y-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm text-center">
            <Share2 className="w-12 h-12 mx-auto text-indigo-200 mb-4" />
            <h3 className="text-lg font-bold text-gray-900">Social Graph Visualizer</h3>
            <p className="text-gray-500 mb-6">Map connections, detect influencer hubs, and spot bot rings.</p>
            <button className="bg-indigo-50 text-indigo-700 px-6 py-2 rounded-lg font-bold hover:bg-indigo-100">Load Graph Visualization</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200">
                <h4 className="font-bold text-gray-900 mb-4">Top Influencers</h4>
                <ul className="space-y-3">
                    {[1,2,3].map(i => (
                        <li key={i} className="flex justify-between items-center text-sm">
                            <div className="flex items-center">
                                <div className="w-8 h-8 bg-gray-200 rounded-full mr-3"></div>
                                <span>User {i}</span>
                            </div>
                            <span className="font-mono text-gray-500">{1200 - (i*150)} followers</span>
                        </li>
                    ))}
                </ul>
            </div>
            <div className="bg-red-50 p-6 rounded-xl border border-red-200">
                <h4 className="font-bold text-red-900 mb-4">Suspicious Clusters</h4>
                <p className="text-sm text-red-800 mb-2">3 Potential Bot Rings Detected</p>
                <button className="text-xs bg-white border border-red-200 text-red-700 px-3 py-1.5 rounded hover:bg-red-50">Review & Block</button>
            </div>
        </div>
    </div>
);

// --- SETTINGS PANEL ---

const SettingsPanel = ({ settings, toggleSetting }: { settings: CommunitySettings, toggleSetting: (s: any, k: string) => void }) => (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm max-w-4xl mx-auto">
        <h3 className="font-bold text-lg text-gray-900 mb-6 flex items-center">
            <Settings className="w-5 h-5 mr-2" /> Global Community Settings
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Access Control</h4>
                <div className="space-y-3">
                    <Toggle label="Require Login to View" checked={settings.permissions?.requireApproval} onChange={() => toggleSetting('permissions', 'requireApproval')} />
                    <Toggle label="Allow Guest Comments" checked={false} onChange={() => {}} /> 
                </div>
            </div>
            
            <div>
                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Content Policy</h4>
                <div className="space-y-3">
                    <Toggle label="Allow Media Uploads" checked={settings.permissions?.allowMedia} onChange={() => toggleSetting('permissions', 'allowMedia')} />
                    <Toggle label="Enable Reposts" checked={true} onChange={() => {}} />
                    <Toggle label="Allow External Links" checked={settings.permissions?.allowEmbeds} onChange={() => toggleSetting('permissions', 'allowEmbeds')} />
                </div>
            </div>

            <div>
                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">AI Safety</h4>
                <div className="space-y-3">
                    <Toggle label="Auto-Moderate Content" checked={settings.ai?.moderationEnabled} onChange={() => toggleSetting('ai', 'moderationEnabled')} />
                    <Toggle label="Sentiment Analysis" checked={settings.ai?.sentimentAnalysis} onChange={() => toggleSetting('ai', 'sentimentAnalysis')} />
                </div>
            </div>

            <div>
                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Modules</h4>
                <div className="space-y-3">
                    <Toggle label="Enable Clubs" checked={settings.modules?.clubs} onChange={() => toggleSetting('modules', 'clubs')} />
                    <Toggle label="Enable Events" checked={settings.modules?.events} onChange={() => toggleSetting('modules', 'events')} />
                </div>
            </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100 bg-yellow-50 p-4 rounded-lg flex items-start">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" />
            <div>
                <h5 className="text-sm font-bold text-yellow-800">Sensitive Data Warning</h5>
                <p className="text-xs text-yellow-700 mt-1">
                    Changing "Access Control" settings may expose user content to public search engines immediately.
                </p>
            </div>
        </div>
    </div>
);

const Toggle = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: () => void }) => (
    <div className="flex items-center justify-between">
        <span className="text-sm text-gray-700">{label}</span>
        <button 
            onClick={onChange}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
        >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
    </div>
);


const TabButton = ({ id, label, icon: Icon, active, onClick }: any) => (
    <button 
        onClick={() => onClick(id)}
        className={`px-4 py-2 text-sm font-medium rounded-md flex items-center transition-all whitespace-nowrap ${active ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-200'}`}
    >
        <Icon className="w-4 h-4 mr-2" /> {label}
    </button>
);

export default CommunityManagement;
