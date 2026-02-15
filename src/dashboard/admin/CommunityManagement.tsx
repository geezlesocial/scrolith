
import React, { useState, useEffect, useCallback } from 'react';
import { 
    Users, MessageSquare, AlertTriangle, ShieldCheck, Settings, BarChart2, ToggleLeft, ToggleRight, 
    Lock, CheckCircle, XCircle, FileText, Gavel, Radio, Flag, Hash, Activity, DollarSign, Pin, Trash2, Plus, X, Coins, Megaphone, Share2, Search, Filter, Send, Upload, Edit2, Save, Unlock, Copy, AlertOctagon, Ban, Image as ImageIcon, Building2
} from 'lucide-react';
import { CommunityService } from '../../services/community';
import { GcoinService } from '../../services/gcoin';
import { AdService } from '../../services/ads';
import { FileService } from '../../services/files';
import { CommunitySettings, ModerationLog, ForumThread, CommunityChannel, GcoinWallet, AdCampaign, UserRole, UploadedFile, GcoinSettings, GcoinConversionRequest } from '../../types';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import CommunityAnalytics from './CommunityAnalytics';
import { useCurrency } from '../../context/CurrencyContext';
import FilePickerModal from '../shared/FilePickerModal';

type AdminTab =
    | 'overview'
    | 'homepage'
    | 'threads'
    | 'channels'
    | 'moderation'
    | 'gcoin'
    | 'ads'
    | 'business'
    | 'social'
    | 'settings';

const defaultSettings: CommunitySettings = {
    requireLoginToView: false,
    allowGuestComments: true,
    allowMediaUploads: true,
    enableReposts: true,
    allowExternalLinks: true,
    autoModerateContent: false,
    sentimentAnalysis: true,
    enableClubs: true,
    enableEvents: true
} as CommunitySettings;

const CommunityManagement = () => {
    const [activeTab, setActiveTab] = useState<AdminTab>('overview');
    const [settings, setSettings] = useState<CommunitySettings | null>(null);
    const [logs, setLogs] = useState<ModerationLog[]>([]);
    const { showNotification } = useNotification();
    const { user } = useUser();

    useEffect(() => {
        // Initialize active tab from URL query param (supports ?tab=settings)
        try {
            const params = new URLSearchParams(window.location.search);
            const t = params.get('tab');
            if (t && ['overview','homepage','threads','channels','moderation','gcoin','ads','business','social','settings'].includes(t)) {
                setActiveTab(t as AdminTab);
            }
        } catch (e) {
            // ignore when running in non-browser or tests
        }

        loadData();
    }, []);

    const s = (settings ?? {}) as Partial<Record<string, unknown>>;

    const loadData = async () => {
        try {
            const [configResult, logsResult] = await Promise.allSettled([
                CommunityService.getAdminConfig(),
                CommunityService.getModerationLogs()
            ]);
            if (configResult.status === 'fulfilled') {
                setSettings(configResult.value);
            } else {
                setSettings(defaultSettings);
                showNotification('warning', 'Community', 'Admin config failed to load. Using defaults.');
            }
            if (logsResult.status === 'fulfilled') {
                setLogs(logsResult.value);
            } else {
                setLogs([]);
                showNotification('warning', 'Community', 'Moderation logs unavailable.');
            }
        } catch (error) {
            console.error('Failed to load community admin data:', error);
            setLogs([]);
            showNotification('error', 'Community', 'Failed to load community data.');
        }
    };

    // FIXED: Toggle individual setting - properly updates state
    const toggleSetting = async (key: keyof CommunitySettings, value: boolean) => {
        if (!settings) return;
        try {
            // Optimistic update
            const updatedSettings = {
                ...settings,
                [key]: value,
                updatedAt: new Date().toISOString()
            } as any;
            setSettings(updatedSettings);

            // Persist via admin endpoint
            const result = await CommunityService.updateAdminConfig(updatedSettings);
            if (result) {
                setSettings(result);
                showNotification('success', 'Updated', 'Setting changed successfully.');
            } else {
                showNotification('warning', 'Partial Success', 'Setting updated locally but may not have saved to server.');
            }
        } catch (error) {
            console.error('Failed to update setting:', error);
            showNotification('error', 'Error', 'Failed to update setting.');
            loadData();
        }
    };

    // Listen for admin config updates from socket and update UI live
    useEffect(() => {
        const onAdminConfig = (e: any) => {
            try {
                const detail = e?.detail ?? e;
                setSettings(detail || defaultSettings);
                showNotification('info', 'Community', 'Admin config updated.');
            } catch (err) {
                console.error('Failed to apply admin config from event', err);
            }
        };
        window.addEventListener('community:admin_config_updated', onAdminConfig as EventListener);
        return () => window.removeEventListener('community:admin_config_updated', onAdminConfig as EventListener);
    }, []);

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
                <TabButton id="homepage" label="Home Page" icon={ImageIcon} active={activeTab === 'homepage'} onClick={setActiveTab} />
                <TabButton id="gcoin" label="Gcoin Rewards" icon={Coins} active={activeTab === 'gcoin'} onClick={setActiveTab} />
                <TabButton id="ads" label="Ads Manager" icon={Megaphone} active={activeTab === 'ads'} onClick={setActiveTab} />
                <TabButton id="business" label="Business Pages" icon={Building2} active={activeTab === 'business'} onClick={setActiveTab} />
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
                    </div>
                )}

                {activeTab === 'homepage' && <CommunityHomepageManager />}
                {activeTab === 'gcoin' && <GcoinManager />}
                {activeTab === 'ads' && <AdManager />}
                {activeTab === 'business' && <BusinessPagesManager />}
                {activeTab === 'threads' && <ThreadManager />}
                {activeTab === 'channels' && <ChannelManager />}
                {activeTab === 'moderation' && <ModerationQueue logs={logs} refresh={() => CommunityService.getModerationLogs().then(setLogs)} />}
                {activeTab === 'social' && <SocialGraphView />}
                {activeTab === 'settings' && settings && <SettingsPanel settings={settings} toggleSetting={toggleSetting} />}
            </div>
        </div>
    );
};

type BusinessPageRecord = {
    id: string;
    name: string;
    tagline?: string;
    industry?: string;
    orgSize?: string;
    orgType?: string;
    category?: string;
    slug?: string;
    website?: string;
    email?: string;
    phone?: string;
    location?: string;
    description?: string;
    logoUrl?: string;
    coverUrl?: string;
    followersCount?: number;
    postsCount?: number;
    ownerId?: string;
    ownerName?: string;
    updatedAt?: string;
    status?: string;
    statusReason?: string;
    statusUpdatedAt?: string | null;
};

const BusinessPagesManager = () => {
    const { showNotification } = useNotification();
    const [pages, setPages] = useState<BusinessPageRecord[]>([]);
    const [editing, setEditing] = useState<BusinessPageRecord | null>(null);
    const [loading, setLoading] = useState(false);

    const loadPages = useCallback(async () => {
        setLoading(true);
        try {
            const data = await CommunityService.getAdminBusinessPages();
            const normalized = Array.isArray(data) ? data.map((page: any) => ({
                id: page.id,
                name: page.name,
                tagline: page.tagline,
                industry: page.industry,
                orgSize: page.orgSize,
                orgType: page.orgType,
                category: page.category,
                slug: page.slug,
                website: page.website,
                email: page.email,
                phone: page.phone,
                location: page.location,
                description: page.description,
                logoUrl: page.logo?.url || page.logoUrl || page.logo_file_url || page.logoFileUrl,
                coverUrl: page.cover?.url || page.coverUrl || page.cover_file_url || page.coverFileUrl,
                followersCount: page.followersCount ?? 0,
                postsCount: page.postsCount ?? 0,
                ownerId: page.ownerId,
                ownerName: page.ownerName,
                updatedAt: page.updatedAt,
                status: page.status,
                statusReason: page.statusReason || '',
                statusUpdatedAt: page.statusUpdatedAt || null
            })) : [];
            setPages(normalized);
        } catch (error) {
            console.error('Failed to load business pages', error);
            showNotification('error', 'Business Pages', 'Failed to load business pages.');
            setPages([]);
        } finally {
            setLoading(false);
        }
    }, [showNotification]);

    useEffect(() => {
        loadPages();
        const handler = () => loadPages();
        window.addEventListener('community:business_page_updated', handler);
        window.addEventListener('community:business_page_created', handler);
        return () => {
            window.removeEventListener('community:business_page_updated', handler);
            window.removeEventListener('community:business_page_created', handler);
        };
    }, [loadPages]);

    const handleEdit = (page: BusinessPageRecord) => {
        setEditing({ ...page });
    };

    const handleDelete = async (id: string) => {
        try {
            await CommunityService.deleteAdminBusinessPage(id);
            showNotification('success', 'Business Pages', 'Page removed.');
            loadPages();
        } catch (error) {
            console.error('Failed to delete business page', error);
            showNotification('error', 'Business Pages', 'Delete failed.');
        }
    };

    const handleSave = async () => {
        if (!editing) return;
        if (!editing.name?.trim()) {
            showNotification('alert', 'Business Pages', 'Name is required.');
            return;
        }
        try {
            await CommunityService.updateAdminBusinessPage(editing.id, editing);
            showNotification('success', 'Business Pages', 'Changes saved.');
            setEditing(null);
            loadPages();
        } catch (error) {
            console.error('Failed to update business page', error);
            showNotification('error', 'Business Pages', 'Save failed.');
        }
    };

    const handleModeration = async (
        page: BusinessPageRecord,
        action: 'activate' | 'restrict' | 'ban' | 'deactivate'
    ) => {
        const reason = action === 'activate'
            ? ''
            : window.prompt(`Optional reason for ${action}:`, page.statusReason || '') || '';
        try {
            await CommunityService.moderateAdminBusinessPage(page.id, { action, reason });
            const labelMap: Record<string, string> = {
                activate: 'activated',
                restrict: 'restricted',
                ban: 'banned',
                deactivate: 'deactivated'
            };
            showNotification('success', 'Business Pages', `Page ${labelMap[action] || action} successfully.`);
            loadPages();
        } catch (error) {
            console.error('Failed to moderate business page', error);
            showNotification('error', 'Business Pages', 'Unable to apply moderation action.');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-gray-900">Business Pages Directory</h3>
                    <p className="text-sm text-gray-500">Manage, edit, or remove company pages.</p>
                </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                            <th className="px-4 py-3 text-left">Business</th>
                            <th className="px-4 py-3 text-left">Industry</th>
                            <th className="px-4 py-3 text-left">Followers</th>
                            <th className="px-4 py-3 text-left">Status</th>
                            <th className="px-4 py-3 text-left">Owner</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                                    Loading business pages...
                                </td>
                            </tr>
                        ) : pages.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                                    No business pages found.
                                </td>
                            </tr>
                        ) : (
                            pages.map((page) => (
                                <tr key={page.id} className="border-t border-gray-100">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-gray-100 overflow-hidden">
                                                {page.logoUrl ? (
                                                    <img src={page.logoUrl} alt={page.name} className="h-full w-full object-cover" />
                                                ) : (
                                                    <Building2 className="mx-auto mt-2 h-5 w-5 text-gray-400" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-900">{page.name}</p>
                                                <p className="text-xs text-gray-500">@{page.slug || 'business'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">{page.industry || '--'}</td>
                                    <td className="px-4 py-3 text-gray-600">{page.followersCount ?? 0}</td>
                                    <td className="px-4 py-3 text-gray-600">
                                        <span
                                            className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
                                                page.status === 'active'
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : page.status === 'restricted'
                                                    ? 'bg-amber-100 text-amber-700'
                                                    : page.status === 'banned'
                                                    ? 'bg-rose-100 text-rose-700'
                                                    : 'bg-slate-100 text-slate-700'
                                            }`}
                                        >
                                            {page.status || 'active'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">{page.ownerName || '--'}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button onClick={() => handleEdit(page)} className="mr-3 text-blue-600 hover:underline">
                                            Edit
                                        </button>
                                        <button onClick={() => handleModeration(page, 'activate')} className="mr-3 text-emerald-600 hover:underline">
                                            Activate
                                        </button>
                                        <button onClick={() => handleModeration(page, 'restrict')} className="mr-3 text-amber-600 hover:underline">
                                            Restrict
                                        </button>
                                        <button onClick={() => handleModeration(page, 'ban')} className="mr-3 text-rose-600 hover:underline">
                                            Ban
                                        </button>
                                        <button onClick={() => handleDelete(page.id)} className="text-red-600 hover:underline">
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            {editing && (
                <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-base font-bold text-gray-900">Edit business page</h4>
                        <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <input
                            value={editing.name}
                            onChange={(e) => setEditing((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Business name"
                        />
                        <input
                            value={editing.slug || ''}
                            onChange={(e) => setEditing((prev) => (prev ? { ...prev, slug: e.target.value } : prev))}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Scrolith address"
                        />
                        <input
                            value={editing.industry || ''}
                            onChange={(e) => setEditing((prev) => (prev ? { ...prev, industry: e.target.value } : prev))}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Industry"
                        />
                        <input
                            value={editing.category || ''}
                            onChange={(e) => setEditing((prev) => (prev ? { ...prev, category: e.target.value } : prev))}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Category"
                        />
                        <input
                            value={editing.orgType || ''}
                            onChange={(e) => setEditing((prev) => (prev ? { ...prev, orgType: e.target.value } : prev))}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Organization type"
                        />
                        <input
                            value={editing.orgSize || ''}
                            onChange={(e) => setEditing((prev) => (prev ? { ...prev, orgSize: e.target.value } : prev))}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Organization size"
                        />
                        <select
                            value={editing.status || 'active'}
                            onChange={(e) => setEditing((prev) => (prev ? { ...prev, status: e.target.value } : prev))}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        >
                            <option value="active">Status: Active</option>
                            <option value="paused">Status: Paused</option>
                            <option value="banned">Status: Banned</option>
                            <option value="disabled">Status: Disabled</option>
                        </select>
                        <input
                            value={editing.website || ''}
                            onChange={(e) => setEditing((prev) => (prev ? { ...prev, website: e.target.value } : prev))}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Website"
                        />
                        <input
                            value={editing.email || ''}
                            onChange={(e) => setEditing((prev) => (prev ? { ...prev, email: e.target.value } : prev))}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Public email"
                        />
                        <input
                            value={editing.phone || ''}
                            onChange={(e) => setEditing((prev) => (prev ? { ...prev, phone: e.target.value } : prev))}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Public phone"
                        />
                        <input
                            value={editing.location || ''}
                            onChange={(e) => setEditing((prev) => (prev ? { ...prev, location: e.target.value } : prev))}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Location"
                        />
                        <input
                            value={editing.statusReason || ''}
                            onChange={(e) => setEditing((prev) => (prev ? { ...prev, statusReason: e.target.value } : prev))}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Moderation reason"
                        />
                    </div>
                    <textarea
                        value={editing.description || ''}
                        onChange={(e) => setEditing((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        rows={3}
                        placeholder="Description"
                    />
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setEditing(null)} className="rounded-lg border px-4 py-2 text-xs font-semibold text-gray-600">
                            Cancel
                        </button>
                        <button onClick={handleSave} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white">
                            Save changes
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- GCOIN MANAGER ---

const GcoinManager = () => {
    const [subTab, setSubTab] = useState<'overview' | 'wallets' | 'conversions' | 'ledger' | 'fraud' | 'settings'>('overview');
    const [wallets, setWallets] = useState<GcoinWallet[]>([]);
    const [conversions, setConversions] = useState<GcoinConversionRequest[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [config, setConfig] = useState<GcoinSettings>({ conversionRate: 0, minWithdrawal: 0, conversionEnabled: false, autoApproveConversions: false, userTransfersEnabled: false });
    const [fraudReports, setFraudReports] = useState<any[] | null>(null);
    const [fraudQuery, setFraudQuery] = useState('');
    const [summary, setSummary] = useState<any>(null);
    
    // Transfer Modal
    const [isSendModalOpen, setIsSendModalOpen] = useState(false);
    const [sendAmount, setSendAmount] = useState(0);
    const [sendRecipient, setSendRecipient] = useState('');
    const [sendReason, setSendReason] = useState('');
    const { showNotification } = useNotification();
    const { formatPrice, availableCurrencies } = useCurrency();
    const { user } = useUser();

    useEffect(() => {
        refreshData();
        GcoinService.getSettings().then(setConfig);
    }, []);

    useEffect(() => {
        // preload fraud reports when manager mounts
        if (subTab === 'fraud') {
            GcoinService.getFraudReports().then((r) => {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                setFraudReports(r.suspiciousWallets || []);
            }).catch(() => {});
        }
    }, [subTab]);

    useEffect(() => {
        const refresh = () => { refreshData(); };
        window.addEventListener('community:gcoin_transaction_created', refresh as EventListener);
        window.addEventListener('community:gcoin_balance_updated', refresh as EventListener);
        window.addEventListener('community:gcoin_conversion_processed', refresh as EventListener);
        window.addEventListener('community:gcoin_settings_updated', refresh as EventListener);
        return () => {
            window.removeEventListener('community:gcoin_transaction_created', refresh as EventListener);
            window.removeEventListener('community:gcoin_balance_updated', refresh as EventListener);
            window.removeEventListener('community:gcoin_conversion_processed', refresh as EventListener);
            window.removeEventListener('community:gcoin_settings_updated', refresh as EventListener);
        };
    }, []);

    const refreshData = () => {
        GcoinService.getAllWallets().then(setWallets);
        GcoinService.getConversionRequests().then(setConversions);
        GcoinService.getAllTransactions().then(setTransactions);
        GcoinService.getAdminSummary().then(setSummary).catch(() => {});
        GcoinService.getSettings().then(setConfig).catch(() => {});
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
        try {
            await GcoinService.saveSettings(config);
            const updated = await GcoinService.getSettings();
            setConfig(updated);
            showNotification('success', 'Saved', 'Gcoin configuration updated.');
        } catch (error) {
            console.error('Failed to save Gcoin settings:', error);
            showNotification('error', 'Save Failed', 'Unable to save Gcoin configuration.');
        }
    };

    const processConversion = async (req: GcoinConversionRequest, action: 'approve' | 'reject') => {
        try {
            const note = window.prompt(`Add an optional admin note for this ${action} (optional):`, '');
            await GcoinService.processConversion(req.id, action, user?.id || '', note || undefined);
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
                    <button onClick={() => setSubTab('ledger')} className={`px-4 py-2 rounded-lg text-sm font-medium ${subTab === 'ledger' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}>Ledger</button>
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
            {summary && subTab === 'overview' && (
                <div className="mt-4">
                    <div className="bg-white p-4 rounded-xl border border-gray-200">
                        <h4 className="font-bold">Gcoin System Summary</h4>
                        <div className="grid grid-cols-2 gap-4 mt-3 text-sm text-gray-700">
                            <div>Total Supply: <span className="font-medium">{summary.totalSupply} GC</span></div>
                            <div>Lifetime Earned: <span className="font-medium">{summary.totalLifetimeEarned} GC</span></div>
                            <div>Platform Fees: <span className="font-medium">{summary.platformFees} GC</span></div>
                            <div>Pending Conversions: <span className="font-medium">{summary.pendingConversions} GC</span></div>
                        </div>
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
            {subTab === 'fraud' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden p-4">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold">Fraud Center</h3>
                        <div className="flex gap-2">
                            <input placeholder="Search user id or recipient id" className="border rounded p-2 text-sm" onChange={e => setFraudQuery(e.target.value)} />
                        </div>
                    </div>
                    <div className="text-sm text-gray-600 mb-3">Suspicious wallets flagged by velocity or rules. Use freeze/unfreeze to restrict payouts.</div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500"><tr><th>User</th><th>Recipient</th><th>Balance</th><th>Fraud Score</th><th>Recent Events (10m)</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody className="divide-y">
                            {(fraudReports || []).filter((r:any) => {
                                if (!fraudQuery) return true;
                                const q = fraudQuery.toString().toLowerCase();
                                return (r.userId || '').toString().toLowerCase().includes(q) || (r.recipientId || '').toString().toLowerCase().includes(q);
                            }).map((r:any) => (
                                <tr key={r.userId} className="hover:bg-gray-50">
                                    <td className="px-6 py-3">{r.userId}</td>
                                    <td className="px-6 py-3 font-mono text-xs text-gray-600">{r.recipientId}</td>
                                    <td className="px-6 py-3 font-bold text-yellow-600">{r.balance}</td>
                                    <td className="px-6 py-3 text-red-600 font-bold">{r.fraudScore}</td>
                                    <td className="px-6 py-3">{r.recentEvents}</td>
                                    <td className="px-6 py-3">{r.status}</td>
                                    <td className="px-6 py-3 text-right">
                                        <button onClick={() => handleFreezeWallet(r.userId, r.status === 'frozen')} className="text-sm text-red-600">{r.status === 'frozen' ? 'Unfreeze' : 'Freeze'}</button>
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
            {subTab === 'ledger' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="font-bold text-gray-800">Gcoin Ledger</h3>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Amount</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Reference</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {transactions.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-500">
                                        No transactions found.
                                    </td>
                                </tr>
                            ) : (
                                transactions.map((tx) => (
                                    <tr key={tx.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-gray-500">
                                            {tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="px-6 py-4">{tx.userId || '-'}</td>
                                        <td className="px-6 py-4">{tx.type || '-'}</td>
                                        <td className="px-6 py-4 font-bold">{tx.amount}</td>
                                        <td className="px-6 py-4">{tx.status || '-'}</td>
                                        <td className="px-6 py-4 text-xs text-gray-500">{tx.referenceId || '-'}</td>
                                    </tr>
                                ))
                            )}
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
                                <input type="number" step="0.01" className="w-full border rounded p-2" value={config.conversionRate} onChange={e => setConfig({...config, conversionRate: Number(e.target.value || 0)})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Min Withdrawal (GC)</label>
                                <input type="number" className="w-full border rounded p-2" value={config.minWithdrawal} onChange={e => setConfig({...config, minWithdrawal: Number(e.target.value || 0)})} />
                            </div>
                        </div>
                        <div className="grid grid-cols-4 gap-4 mt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Views Unit</label>
                                <input type="number" className="w-full border rounded p-2" value={config.viewsUnit ?? 200} onChange={e => setConfig({...config, viewsUnit: Number(e.target.value || 0)})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Likes Unit</label>
                                <input type="number" className="w-full border rounded p-2" value={config.likesUnit ?? 30} onChange={e => setConfig({...config, likesUnit: Number(e.target.value || 0)})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Reposts Unit</label>
                                <input type="number" className="w-full border rounded p-2" value={config.repostsUnit ?? 40} onChange={e => setConfig({...config, repostsUnit: Number(e.target.value || 0)})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Shares Unit</label>
                                <input type="number" className="w-full border rounded p-2" value={config.sharesUnit ?? 50} onChange={e => setConfig({...config, sharesUnit: Number(e.target.value || 0)})} />
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4 mt-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Coins / Views Unit</label>
                                <input type="number" step="0.0001" className="w-full border rounded p-2" value={config.coinPerViewsUnit ?? 1} onChange={e => setConfig({...config, coinPerViewsUnit: Number(e.target.value || 0)})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Coins / Likes Unit</label>
                                <input type="number" step="0.0001" className="w-full border rounded p-2" value={config.coinPerLikesUnit ?? 1} onChange={e => setConfig({...config, coinPerLikesUnit: Number(e.target.value || 0)})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Coins / Reposts Unit</label>
                                <input type="number" step="0.0001" className="w-full border rounded p-2" value={config.coinPerRepostsUnit ?? 1} onChange={e => setConfig({...config, coinPerRepostsUnit: Number(e.target.value || 0)})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Coins / Shares Unit</label>
                                <input type="number" step="0.0001" className="w-full border rounded p-2" value={config.coinPerSharesUnit ?? 1} onChange={e => setConfig({...config, coinPerSharesUnit: Number(e.target.value || 0)})} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Fee (%)</label>
                                <input type="number" step="0.001" className="w-full border rounded p-2" value={(config.adminFeePercent ?? 0.1) * 100} onChange={e => setConfig({...config, adminFeePercent: Number(e.target.value || 0) / 100})} />
                                <p className="text-xs text-gray-400">Enter percent (e.g. 10 for 10%)</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Fee</label>
                                <div className="flex gap-2">
                                    <select className="border rounded p-2 w-36" value={config.transferFeeType ?? 'percentage'} onChange={e => setConfig({...config, transferFeeType: e.target.value as any})}>
                                        <option value="percentage">Percentage</option>
                                        <option value="flat">Flat</option>
                                    </select>
                                    <input type="number" step="0.0001" className="w-full border rounded p-2" value={config.transferFeeValue ?? 0} onChange={e => setConfig({...config, transferFeeValue: Number(e.target.value || 0)})} />
                                </div>
                                <p className="text-xs text-gray-400">If percentage, enter e.g. 1 for 1%</p>
                            </div>
                        </div>
                        
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                                <span className="font-bold text-gray-800">Enable Conversions</span>
                                <p className="text-xs text-gray-500">Allow users to convert Gcoins to Wallet Balance</p>
                            </div>
                            <input type="checkbox" checked={config.conversionEnabled} onChange={e => setConfig({...config, conversionEnabled: e.target.checked})} className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                                <span className="font-bold text-gray-800">Auto-Approve Conversions</span>
                                <p className="text-xs text-gray-500">Automatically credit wallet funds when users convert Gcoin.</p>
                            </div>
                            <input type="checkbox" checked={config.autoApproveConversions ?? false} onChange={e => setConfig({...config, autoApproveConversions: e.target.checked})} className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                                <span className="font-bold text-gray-800">Enable User Transfers</span>
                                <p className="text-xs text-gray-500">Allow users to send Gcoin to others</p>
                            </div>
                            <input type="checkbox" checked={config.userTransfersEnabled} onChange={e => setConfig({...config, userTransfersEnabled: e.target.checked})} className="w-5 h-5 text-indigo-600" />
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
                                <input type="number" className="w-full border rounded p-2" value={sendAmount} onChange={e => setSendAmount(Number(e.target.value || 0))} />
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

const CommunityHomepageManager = () => {
    const [config, setConfig] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [fileTarget, setFileTarget] = useState<{ scope: 'hero' | 'slide' | 'section'; id?: string; field: 'backgroundImage' | 'imageUrl' | 'videoUrl' } | null>(null);
    const { showNotification } = useNotification();
    const deviceKeys = ['mobile', 'tablet', 'desktop'] as const;

    const isVisibleOn = (visibility: any, device: (typeof deviceKeys)[number]) =>
        (visibility?.[device] ?? true) !== false;

    const renderDeviceVisibility = (
        visibility: any,
        onToggle: (device: (typeof deviceKeys)[number], enabled: boolean) => void
    ) => (
        <div className="flex flex-wrap gap-2">
            {deviceKeys.map((device) => (
                <label
                    key={device}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700"
                >
                    <input
                        type="checkbox"
                        checked={isVisibleOn(visibility, device)}
                        onChange={(e) => onToggle(device, e.target.checked)}
                    />
                    <span className="capitalize">{device}</span>
                </label>
            ))}
        </div>
    );

    const setHeroVisibility = (device: (typeof deviceKeys)[number], enabled: boolean) => {
        setConfig((prev: any) => ({
            ...prev,
            hero: {
                ...(prev?.hero || {}),
                visibility: { ...(prev?.hero?.visibility || {}), [device]: enabled }
            }
        }));
    };

    const setBannerVisibility = (device: (typeof deviceKeys)[number], enabled: boolean) => {
        setConfig((prev: any) => ({
            ...prev,
            banner: {
                ...(prev?.banner || {}),
                visibility: { ...(prev?.banner?.visibility || {}), [device]: enabled }
            }
        }));
    };

    const setModulePatch = (key: string, patch: any) => {
        setConfig((prev: any) => ({
            ...prev,
            modules: {
                ...(prev?.modules || {}),
                [key]: {
                    ...((prev?.modules || {})[key] || {}),
                    ...patch
                }
            }
        }));
    };

    const setModuleVisibility = (key: string, device: (typeof deviceKeys)[number], enabled: boolean) => {
        setConfig((prev: any) => {
            const prevModules = prev?.modules || {};
            const prevModule = prevModules[key] || {};
            return {
                ...prev,
                modules: {
                    ...prevModules,
                    [key]: {
                        ...prevModule,
                        visibility: { ...(prevModule.visibility || {}), [device]: enabled }
                    }
                }
            };
        });
    };

    useEffect(() => {
        CommunityService.getCommunityHomepage().then(setConfig).catch((e) => {
            console.error('Failed to load community homepage config', e);
            setConfig(null);
        });
    }, []);

    useEffect(() => {
        const onUpdate = async () => {
            try {
                const updated = await CommunityService.getCommunityHomepage();
                setConfig(updated);
            } catch (e) {
                console.error('Failed to refresh community homepage config', e);
            }
        };
        window.addEventListener('community:homepage_updated', onUpdate as EventListener);
        return () => window.removeEventListener('community:homepage_updated', onUpdate as EventListener);
    }, []);

    const save = async () => {
        setIsSaving(true);
        try {
            const updated = await CommunityService.saveCommunityHomepage(config);
            setConfig(updated);
            showNotification('success', 'Saved', 'Community homepage updated.');
        } catch (e: any) {
            showNotification('error', 'Failed', e?.message || 'Unable to save homepage.');
        } finally {
            setIsSaving(false);
        }
    };

    const addSlide = () => {
        const next = {
            id: `slide-${Date.now()}`,
            title: 'New Slide',
            subtitle: '',
            imageUrl: '',
            videoUrl: '',
            ctaLabel: '',
            ctaUrl: '',
            visibility: { mobile: true, tablet: true, desktop: true }
        };
        setConfig((prev: any) => ({ ...prev, sliders: [...(prev?.sliders || []), next] }));
    };

    const removeSlide = (id: string) => {
        setConfig((prev: any) => ({ ...prev, sliders: (prev?.sliders || []).filter((s: any) => s.id !== id) }));
    };

    const updateSlide = (id: string, patch: any) => {
        setConfig((prev: any) => ({
            ...prev,
            sliders: (prev?.sliders || []).map((s: any) => (s.id === id ? { ...s, ...patch } : s))
        }));
    };

    const addSection = (type: 'text' | 'image' | 'video') => {
        const next = {
            id: `section-${Date.now()}`,
            type,
            title: type === 'text' ? 'Section Title' : '',
            body: '',
            imageUrl: '',
            videoUrl: '',
            visibility: { mobile: true, tablet: true, desktop: true }
        };
        setConfig((prev: any) => ({ ...prev, sections: [...(prev?.sections || []), next] }));
    };

    const removeSection = (id: string) => {
        setConfig((prev: any) => ({ ...prev, sections: (prev?.sections || []).filter((s: any) => s.id !== id) }));
    };

    const updateSection = (id: string, patch: any) => {
        setConfig((prev: any) => ({
            ...prev,
            sections: (prev?.sections || []).map((s: any) => (s.id === id ? { ...s, ...patch } : s))
        }));
    };

    const handleFileSelect = (file: UploadedFile) => {
        if (!fileTarget) return;
        const url = file.url || file.path || '';
        if (!url) return;
        if (fileTarget.scope === 'hero') {
            setConfig((prev: any) => ({ ...prev, hero: { ...(prev?.hero || {}), [fileTarget.field]: url } }));
        } else if (fileTarget.scope === 'slide' && fileTarget.id) {
            updateSlide(fileTarget.id, { [fileTarget.field]: url });
        } else if (fileTarget.scope === 'section' && fileTarget.id) {
            updateSection(fileTarget.id, { [fileTarget.field]: url });
        }
        setIsFilePickerOpen(false);
        setFileTarget(null);
    };

    if (!config) {
        return <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">Loading homepage config...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-gray-900">Community Home Page</h3>
                        <p className="text-xs text-gray-500">Edit hero, banner, sliders, and content blocks in real time.</p>
                    </div>
                    <button onClick={save} disabled={isSaving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded">
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Hero Title</label>
                        <input className="w-full border rounded p-2" value={config.hero?.title || ''} onChange={(e) => setConfig({ ...config, hero: { ...(config.hero || {}), title: e.target.value } })} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Hero Subtitle</label>
                        <input className="w-full border rounded p-2" value={config.hero?.subtitle || ''} onChange={(e) => setConfig({ ...config, hero: { ...(config.hero || {}), subtitle: e.target.value } })} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Hero Background Color</label>
                        <input type="text" className="w-full border rounded p-2" value={config.hero?.backgroundColor || ''} onChange={(e) => setConfig({ ...config, hero: { ...(config.hero || {}), backgroundColor: e.target.value } })} placeholder="#4f46e5" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Hero Background Image</label>
                        <div className="flex gap-2">
                            <input className="w-full border rounded p-2" value={config.hero?.backgroundImage || ''} onChange={(e) => setConfig({ ...config, hero: { ...(config.hero || {}), backgroundImage: e.target.value } })} />
                            <button
                                onClick={() => { setFileTarget({ scope: 'hero', field: 'backgroundImage' }); setIsFilePickerOpen(true); }}
                                className="px-3 py-2 text-xs border rounded"
                            >
                                Select
                            </button>
                        </div>
                    </div>
                    <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-500 mb-1">Hero Visibility</label>
                        {renderDeviceVisibility(config.hero?.visibility, setHeroVisibility)}
                    </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div>
                        <div className="font-semibold text-sm">Security Banner</div>
                        <div className="text-xs text-gray-500">Shown at top of community home.</div>
                    </div>
                    <input type="checkbox" checked={config.banner?.enabled !== false} onChange={(e) => setConfig({ ...config, banner: { ...(config.banner || {}), enabled: e.target.checked } })} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Banner Text</label>
                    <input className="w-full border rounded p-2" value={config.banner?.text || ''} onChange={(e) => setConfig({ ...config, banner: { ...(config.banner || {}), text: e.target.value } })} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Banner Visibility</label>
                    {renderDeviceVisibility(config.banner?.visibility, setBannerVisibility)}
                </div>

                <div className="border-t pt-4 space-y-3">
                    <div>
                        <h4 className="font-bold text-gray-900">Community Mobile/Layout Modules</h4>
                        <p className="text-xs text-gray-500">
                            Toggle which blocks appear on mobile/tablet/desktop. Changes publish in real time.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                            { key: 'sliders', label: 'Featured Slider', hasTitle: true },
                            { key: 'stories', label: 'Stories', hasTitle: true },
                            { key: 'customSections', label: 'Custom Sections', hasTitle: true },
                            { key: 'searchBar', label: 'Search Bar', hasTitle: false },
                            { key: 'feed', label: 'Community Feed', hasTitle: true },
                            { key: 'discussions', label: 'Latest Discussions', hasTitle: true },
                            { key: 'trendingTopics', label: 'Trending Topics', hasTitle: true },
                            { key: 'upcomingEvents', label: 'Upcoming Events', hasTitle: true },
                            { key: 'topContributors', label: 'Top Contributors', hasTitle: true },
                            { key: 'quickActions', label: 'Quick Actions', hasTitle: true },
                            { key: 'sponsored', label: 'Sponsored', hasTitle: true },
                            { key: 'stats', label: 'Community Stats', hasTitle: true }
                        ].map((mod) => {
                            const current = (config?.modules || {})[mod.key] || {};
                            return (
                                <div key={mod.key} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-semibold text-sm text-gray-900">{mod.label}</div>
                                            <div className="text-xs text-gray-500">Enable/disable per device.</div>
                                        </div>
                                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={current.enabled !== false}
                                                onChange={(e) => setModulePatch(mod.key, { enabled: e.target.checked })}
                                            />
                                            Enabled
                                        </label>
                                    </div>

                                    {mod.hasTitle ? (
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 mb-1">Title</label>
                                            <input
                                                className="w-full border rounded p-2 text-sm"
                                                value={current.title || ''}
                                                onChange={(e) => setModulePatch(mod.key, { title: e.target.value })}
                                                placeholder={mod.label}
                                            />
                                        </div>
                                    ) : null}

                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Visibility</label>
                                        {renderDeviceVisibility(current.visibility, (device, enabled) =>
                                            setModuleVisibility(mod.key, device, enabled)
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                <div className="flex items-center justify-between">
                    <h4 className="font-bold text-gray-900">Slider Items</h4>
                    <button onClick={addSlide} className="px-3 py-1 text-xs bg-blue-600 text-white rounded">Add Slide</button>
                </div>
                {(config.sliders || []).length === 0 && <div className="text-xs text-gray-500">No slides added yet.</div>}
                <div className="space-y-3">
                    {(config.sliders || []).map((slide: any) => (
                        <div key={slide.id} className="border rounded p-3 space-y-2">
                            <div className="flex justify-between items-center">
                                <div className="font-semibold text-sm">Slide</div>
                                <button onClick={() => removeSlide(slide.id)} className="text-xs text-red-600">Remove</button>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Visibility</label>
                                {renderDeviceVisibility(slide.visibility, (device, enabled) =>
                                    updateSlide(slide.id, { visibility: { ...(slide.visibility || {}), [device]: enabled } })
                                )}
                            </div>
                            <input className="w-full border rounded p-2 text-sm" placeholder="Title" value={slide.title || ''} onChange={(e) => updateSlide(slide.id, { title: e.target.value })} />
                            <input className="w-full border rounded p-2 text-sm" placeholder="Subtitle" value={slide.subtitle || ''} onChange={(e) => updateSlide(slide.id, { subtitle: e.target.value })} />
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Image URL</label>
                                    <div className="flex gap-2">
                                        <input className="w-full border rounded p-2 text-sm" value={slide.imageUrl || ''} onChange={(e) => updateSlide(slide.id, { imageUrl: e.target.value })} />
                                        <button
                                            onClick={() => { setFileTarget({ scope: 'slide', id: slide.id, field: 'imageUrl' }); setIsFilePickerOpen(true); }}
                                            className="px-2 text-xs border rounded"
                                        >
                                            Select
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Video URL</label>
                                    <div className="flex gap-2">
                                        <input className="w-full border rounded p-2 text-sm" value={slide.videoUrl || ''} onChange={(e) => updateSlide(slide.id, { videoUrl: e.target.value })} />
                                        <button
                                            onClick={() => { setFileTarget({ scope: 'slide', id: slide.id, field: 'videoUrl' }); setIsFilePickerOpen(true); }}
                                            className="px-2 text-xs border rounded"
                                        >
                                            Select
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <input className="w-full border rounded p-2 text-sm" placeholder="CTA Label" value={slide.ctaLabel || ''} onChange={(e) => updateSlide(slide.id, { ctaLabel: e.target.value })} />
                                <input className="w-full border rounded p-2 text-sm" placeholder="CTA URL" value={slide.ctaUrl || ''} onChange={(e) => updateSlide(slide.id, { ctaUrl: e.target.value })} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                <div className="flex items-center justify-between">
                    <h4 className="font-bold text-gray-900">Content Sections</h4>
                    <div className="flex gap-2">
                        <button onClick={() => addSection('text')} className="px-3 py-1 text-xs border rounded">Add Text</button>
                        <button onClick={() => addSection('image')} className="px-3 py-1 text-xs border rounded">Add Image</button>
                        <button onClick={() => addSection('video')} className="px-3 py-1 text-xs border rounded">Add Video</button>
                    </div>
                </div>
                {(config.sections || []).length === 0 && <div className="text-xs text-gray-500">No content sections added.</div>}
                <div className="space-y-3">
                    {(config.sections || []).map((section: any) => (
                        <div key={section.id} className="border rounded p-3 space-y-2">
                            <div className="flex justify-between items-center">
                                <div className="text-xs font-semibold uppercase text-gray-500">{section.type}</div>
                                <button onClick={() => removeSection(section.id)} className="text-xs text-red-600">Remove</button>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Visibility</label>
                                {renderDeviceVisibility(section.visibility, (device, enabled) =>
                                    updateSection(section.id, { visibility: { ...(section.visibility || {}), [device]: enabled } })
                                )}
                            </div>
                            <input className="w-full border rounded p-2 text-sm" placeholder="Title" value={section.title || ''} onChange={(e) => updateSection(section.id, { title: e.target.value })} />
                            <textarea className="w-full border rounded p-2 text-sm" placeholder="Body" value={section.body || ''} onChange={(e) => updateSection(section.id, { body: e.target.value })} />
                            {section.type === 'image' && (
                                <div className="flex gap-2">
                                    <input className="w-full border rounded p-2 text-sm" placeholder="Image URL" value={section.imageUrl || ''} onChange={(e) => updateSection(section.id, { imageUrl: e.target.value })} />
                                    <button
                                        onClick={() => { setFileTarget({ scope: 'section', id: section.id, field: 'imageUrl' }); setIsFilePickerOpen(true); }}
                                        className="px-2 text-xs border rounded"
                                    >
                                        Select
                                    </button>
                                </div>
                            )}
                            {section.type === 'video' && (
                                <div className="flex gap-2">
                                    <input className="w-full border rounded p-2 text-sm" placeholder="Video URL" value={section.videoUrl || ''} onChange={(e) => updateSection(section.id, { videoUrl: e.target.value })} />
                                    <button
                                        onClick={() => { setFileTarget({ scope: 'section', id: section.id, field: 'videoUrl' }); setIsFilePickerOpen(true); }}
                                        className="px-2 text-xs border rounded"
                                    >
                                        Select
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <FilePickerModal
                isOpen={isFilePickerOpen}
                onClose={() => { setIsFilePickerOpen(false); setFileTarget(null); }}
                onSelect={handleFileSelect}
                allowUpload
                filterType="all"
                role="admin"
            />
        </div>
    );
};

const AdManager = () => {
    const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
    const [reviewQueue, setReviewQueue] = useState<AdCampaign[]>([]);
    const [adsConfig, setAdsConfig] = useState<any>(null);
    const [adsAnalytics, setAdsAnalytics] = useState<any>(null);
    const [isEditing, setIsEditing] = useState<Partial<AdCampaign> | null>(null);
    const [originalEditing, setOriginalEditing] = useState<Partial<AdCampaign> | null>(null);
    const [errors, setErrors] = useState<Record<string,string>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const { showNotification } = useNotification();

    useEffect(() => {
        const refresh = async () => {
            try {
                const [allCampaigns, queue, cfg, analytics] = await Promise.all([
                    AdService.getAllCampaigns(),
                    AdService.getReviewQueue(),
                    AdService.getConfig(),
                    AdService.getAnalytics()
                ]);
                setCampaigns(allCampaigns);
                setReviewQueue(queue);
                setAdsConfig(cfg);
                setAdsAnalytics(analytics);
            } catch (e) {
                console.error('Failed to load ads data', e);
            }
        };
        refresh();
    }, []);

    // Local UI: search + simple pagination for campaigns
    const [campaignSearch, setCampaignSearch] = React.useState('');
    const [campaignPage, setCampaignPage] = React.useState(1);
    const campaignPageSize = 6;
    const filteredCampaigns = campaigns.filter(c => {
        if (!campaignSearch) return true;
        const s = campaignSearch.toString().toLowerCase();
        return String(c.title || '').toLowerCase().includes(s) || String(c.clientName || '').toLowerCase().includes(s) || String(c.id || '').toLowerCase().includes(s);
    });
    const campaignPages = Math.max(1, Math.ceil(filteredCampaigns.length / campaignPageSize));
    const visibleCampaigns = filteredCampaigns.slice((campaignPage - 1) * campaignPageSize, campaignPage * campaignPageSize);

    useEffect(() => {
        const refreshCampaigns = async () => {
            try { const all = await AdService.getAllCampaigns(); setCampaigns(all); } catch(e){ console.error('Failed to refresh campaigns on socket event', e); }
            try { const queue = await AdService.getReviewQueue(); setReviewQueue(queue); } catch (e) {}
            try { const analytics = await AdService.getAnalytics(); setAdsAnalytics(analytics); } catch (e) {}
        };
        window.addEventListener('community:ad_created', refreshCampaigns as EventListener);
        window.addEventListener('community:ad_status_updated', refreshCampaigns as EventListener);
        window.addEventListener('community:ad_payment_initiated', refreshCampaigns as EventListener);
        return () => {
            window.removeEventListener('community:ad_created', refreshCampaigns as EventListener);
            window.removeEventListener('community:ad_status_updated', refreshCampaigns as EventListener);
            window.removeEventListener('community:ad_payment_initiated', refreshCampaigns as EventListener);
        };
    }, []);

    const handleSave = async () => {
        if (!isEditing || !isEditing.title) return;
        const toSavePartial = {
            ...isEditing,
            status: isEditing.status || 'draft',
            impressions: isEditing.impressions || 0,
            clicks: isEditing.clicks || 0,
            ctr: isEditing.ctr || 0
        } as Partial<AdCampaign>;
        // Client-side validation with inline errors
        const nextErrors: Record<string,string> = {};
        if (!toSavePartial.title || !toSavePartial.title.toString().trim()) nextErrors.title = 'Title is required';
        if (toSavePartial.budget !== undefined && Number(toSavePartial.budget) < 0) nextErrors.budget = 'Budget must be 0 or greater';
        if (toSavePartial.cpm !== undefined && Number(toSavePartial.cpm) < 0) nextErrors.cpm = 'CPM must be 0 or greater';
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;
        // If this is an existing campaign (has id), update; otherwise create draft
        setIsSaving(true);
        try {
            if (isEditing?.id) {
                const updated = await AdService.updateAd(isEditing.id, toSavePartial);
                if (updated) {
                    setCampaigns(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
                    // per-field success toasts
                    const prev = originalEditing || {};
                    const changed: string[] = [];
                    ['title','budget','cpm','placement','destinationUrl','ctaText','clientName'].forEach(k => {
                        if ((prev as any)[k] !== (updated as any)[k]) changed.push(k);
                    });
                    if (changed.length === 0) showNotification('success', 'Saved', 'No visible changes');
                    for (const f of changed) showNotification('success', `Saved ${f}`, `${f} updated`);
                }
            } else {
                const created: any = await AdService.saveCampaign(toSavePartial as any);
                if (created && created.id) {
                    setCampaigns(prev => [created, ...prev]);
                    showNotification('success', 'Ad Created', 'Draft created successfully');
                }
            }
        } catch (e) {
            showNotification('alert', 'Error', 'Failed to save ad');
            setIsSaving(false);
            return;
        } finally {
            setIsSaving(false);
        }
        setCampaigns(prev => {
            return prev;
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
            setIsEditing({ ...isEditing, mediaFileIds: [file.id], media: [file] });
            setIsFilePickerOpen(false);
        }
    };

    const handleConfigSave = async () => {
        try {
            const updated = await AdService.updateConfig({ data: adsConfig });
            setAdsConfig(updated);
            showNotification('success', 'Saved', 'Ads config updated.');
        } catch (e) {
            showNotification('error', 'Failed', 'Unable to save ads config.');
        }
    };

    const approve = async (id: string) => {
        await AdService.approveAd(id);
        setReviewQueue(prev => prev.filter(a => a.id !== id));
        showNotification('success', 'Approved', 'Ad is now active.');
    };

    const reject = async (id: string) => {
        await AdService.rejectAd(id, false);
        setReviewQueue(prev => prev.filter(a => a.id !== id));
        showNotification('success', 'Rejected', 'Ad rejected.');
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div>
                    <h3 className="font-bold text-gray-900">Sponsored Posts</h3>
                    <p className="text-xs text-gray-500">Manage community advertisements</p>
                </div>
                <button 
                    onClick={() => { setOriginalEditing(null); setIsEditing({ title: '', clientName: '', destinationUrl: '', destinationType: 'url', objective: 'traffic', ctaText: '', placement: 'feed', budget: 0, cpm: 0, currency: 'USD', status: 'draft', mediaFileIds: [] }); }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center hover:bg-blue-700"
                >
                    <Plus className="w-4 h-4 mr-2" /> Create Ad
                </button>
            </div>

            {adsAnalytics && (
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="font-bold text-gray-900 mb-2">Ads Analytics</h4>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                            <div className="text-gray-500">Impressions</div>
                            <div className="font-semibold">{adsAnalytics?._sum?.impressions ?? adsAnalytics?.impressions ?? 0}</div>
                        </div>
                        <div>
                            <div className="text-gray-500">Clicks</div>
                            <div className="font-semibold">{adsAnalytics?._sum?.clicks ?? adsAnalytics?.clicks ?? 0}</div>
                        </div>
                        <div>
                            <div className="text-gray-500">Spend</div>
                            <div className="font-semibold">{adsAnalytics?._sum?.spend ?? adsAnalytics?.spend ?? 0}</div>
                        </div>
                        <div>
                            <div className="text-gray-500">Admin Revenue</div>
                            <div className="font-semibold">{adsAnalytics?.adminRevenue ?? 0}</div>
                        </div>
                    </div>
                </div>
            )}

            {adsConfig && (
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-bold text-gray-900">Ads Pricing & Rules</h4>
                        <button onClick={handleConfigSave} className="px-3 py-1 text-sm bg-green-600 text-white rounded">Save Config</button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">CPM Feed</label>
                            <input
                                type="number"
                                className="w-full border rounded p-2"
                                value={adsConfig?.cpmByPlacement?.feed ?? 0}
                                onChange={(e) => setAdsConfig((prev: any) => ({ ...prev, cpmByPlacement: { ...(prev?.cpmByPlacement || {}), feed: Number(e.target.value || 0) } }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">CPM Forum Listing</label>
                            <input
                                type="number"
                                className="w-full border rounded p-2"
                                value={adsConfig?.cpmByPlacement?.forum_listing ?? 0}
                                onChange={(e) => setAdsConfig((prev: any) => ({ ...prev, cpmByPlacement: { ...(prev?.cpmByPlacement || {}), forum_listing: Number(e.target.value || 0) } }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">CPM Thread Detail</label>
                            <input
                                type="number"
                                className="w-full border rounded p-2"
                                value={adsConfig?.cpmByPlacement?.thread_detail ?? 0}
                                onChange={(e) => setAdsConfig((prev: any) => ({ ...prev, cpmByPlacement: { ...(prev?.cpmByPlacement || {}), thread_detail: Number(e.target.value || 0) } }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">CPM Chat</label>
                            <input
                                type="number"
                                className="w-full border rounded p-2"
                                value={adsConfig?.cpmByPlacement?.chat ?? 0}
                                onChange={(e) => setAdsConfig((prev: any) => ({ ...prev, cpmByPlacement: { ...(prev?.cpmByPlacement || {}), chat: Number(e.target.value || 0) } }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Min Budget</label>
                            <input
                                type="number"
                                className="w-full border rounded p-2"
                                value={adsConfig?.minBudget ?? 0}
                                onChange={(e) => setAdsConfig((prev: any) => ({ ...prev, minBudget: Number(e.target.value || 0) }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Max Budget</label>
                            <input
                                type="number"
                                className="w-full border rounded p-2"
                                value={adsConfig?.maxBudget ?? 0}
                                onChange={(e) => setAdsConfig((prev: any) => ({ ...prev, maxBudget: Number(e.target.value || 0) }))}
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <h4 className="font-bold text-gray-900 mb-3">Review Queue</h4>
                {reviewQueue.length === 0 ? (
                    <div className="text-sm text-gray-500">No ads pending review.</div>
                ) : (
                    <div className="space-y-3">
                        {reviewQueue.map((ad) => (
                            <div key={ad.id} className="flex items-center justify-between border rounded p-3">
                                <div>
                                    <div className="font-medium">{ad.title}</div>
                                    <div className="text-xs text-gray-500">Placement: {ad.placement} • Budget: {ad.budget}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => approve(ad.id)} className="px-3 py-1 text-xs bg-green-600 text-white rounded">Approve</button>
                                    <button onClick={() => reject(ad.id)} className="px-3 py-1 text-xs bg-red-600 text-white rounded">Reject</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-1 md:col-span-2 mb-2 flex items-center justify-between">
                    <input value={campaignSearch} onChange={e => { setCampaignSearch(e.target.value); setCampaignPage(1); }} placeholder="Search campaigns by title, client or id" className="text-sm border rounded px-3 py-1 w-64" />
                    <div className="text-sm text-gray-500">Showing {filteredCampaigns.length} campaigns</div>
                </div>
                {visibleCampaigns.map(c => (
                    <div key={c.id} className="bg-white p-4 rounded-xl border border-gray-200 flex gap-4 group">
                        <div className="w-24 h-24 flex-shrink-0 bg-gray-100 rounded overflow-hidden">
                            {c.media?.[0]?.url ? (
                                <img src={c.media[0].url} className="w-full h-full object-cover" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">No media</div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                                <h4 className="font-bold text-gray-900 truncate">{c.title}</h4>
                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{c.status}</span>
                            </div>
                            <p className="text-xs text-gray-500 mb-2">{c.clientName} - {c.placement}</p>
                            <div className="grid grid-cols-3 gap-2 text-xs bg-gray-50 p-2 rounded">
                                <div><strong>{Number(c.impressions ?? 0).toLocaleString()}</strong> imps</div>
                                <div><strong>{c.clicks ?? 0}</strong> clicks</div>
                                <div><strong>{c.ctr ?? 0}%</strong> CTR</div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setOriginalEditing(c); setIsEditing(c); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit2 className="w-4 h-4"/></button>
                            <button onClick={() => handleDelete(c.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-600">Page {campaignPage} / {campaignPages}</div>
                <div className="flex gap-2">
                    <button onClick={() => setCampaignPage(p => Math.max(1, p-1))} className="px-3 py-1 rounded bg-gray-100">Prev</button>
                    <button onClick={() => setCampaignPage(p => Math.min(campaignPages, p+1))} className="px-3 py-1 rounded bg-gray-100">Next</button>
                </div>
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
                                    {isEditing.media?.[0]?.url ? (
                                        <img src={isEditing.media[0].url} className="h-full object-contain" />
                                    ) : (
                                        <div className="text-center text-gray-400"><Upload className="w-8 h-8 mx-auto mb-1"/>Upload Media</div>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Title</label>
                                    <input className="w-full border rounded p-2 text-sm" value={isEditing.title} onChange={e => setIsEditing({...isEditing, title: e.target.value})} />
                                    {errors.title && <div className="text-xs text-red-600 mt-1">{errors.title}</div>}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Client Name</label>
                                    <input className="w-full border rounded p-2 text-sm" value={isEditing.clientName} onChange={e => setIsEditing({...isEditing, clientName: e.target.value})} />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Budget</label>
                                    <input type="number" min="0" step="0.01" className="w-full border rounded p-2 text-sm" value={isEditing.budget ?? 0} onChange={e => setIsEditing({...isEditing, budget: Number(e.target.value)})} />
                                    {errors.budget && <div className="text-xs text-red-600 mt-1">{errors.budget}</div>}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">CPM</label>
                                    <input type="number" min="0" step="0.01" className="w-full border rounded p-2 text-sm" value={isEditing.cpm ?? 0} onChange={e => setIsEditing({...isEditing, cpm: Number(e.target.value)})} />
                                    {errors.cpm && <div className="text-xs text-red-600 mt-1">{errors.cpm}</div>}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Currency</label>
                                    <select className="w-full border rounded p-2 text-sm" value={isEditing.currency ?? 'USD'} onChange={e => setIsEditing({...isEditing, currency: e.target.value})}>
                                        {availableCurrencies.filter((c) => c.isActive ?? true).map((currency) => (
                                            <option key={currency.code} value={currency.code}>{currency.code}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Objective</label>
                                    <select
                                        className="w-full border rounded p-2 text-sm"
                                        value={isEditing.objective || 'traffic'}
                                        onChange={e => setIsEditing({ ...isEditing, objective: e.target.value as any })}
                                    >
                                        <option value="traffic">Traffic</option>
                                        <option value="messages">Messages</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Destination</label>
                                    <select
                                        className="w-full border rounded p-2 text-sm"
                                        value={isEditing.destinationType || 'url'}
                                        onChange={e => setIsEditing({ ...isEditing, destinationType: e.target.value as any })}
                                    >
                                        <option value="url">URL</option>
                                        <option value="messages">Messages</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Destination URL</label>
                                <input
                                    className="w-full border rounded p-2 text-sm"
                                    value={isEditing.destinationUrl || ''}
                                    onChange={e => setIsEditing({ ...isEditing, destinationUrl: e.target.value })}
                                    disabled={(isEditing.destinationType || 'url') === 'messages'}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">CTA Text</label>
                                <input
                                    className="w-full border rounded p-2 text-sm"
                                    value={isEditing.ctaText || ''}
                                    onChange={e => setIsEditing({ ...isEditing, ctaText: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Placement</label>
                                    <select className="w-full border rounded p-2 text-sm" value={isEditing.placement} onChange={e => setIsEditing({...isEditing, placement: e.target.value as string})}>
                                        <option value="feed">Feed</option>
                                        <option value="forum_listing">Forum listing</option>
                                        <option value="thread_detail">Thread detail</option>
                                        <option value="chat">Chat sidebar</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Status</label>
                                    <select className="w-full border rounded p-2 text-sm" value={isEditing.status} onChange={e => setIsEditing({...isEditing, status: e.target.value as string})} disabled={!(user && (user.role || '').toString().toUpperCase() === 'ADMIN') }>
                                        <option value="active">Active</option>
                                        <option value="paused">Paused</option>
                                        <option value="draft">Draft</option>
                                    </select>
                                    {!(user && (user.role || '').toString().toUpperCase() === 'ADMIN') && <div className="text-xs text-gray-400 mt-1">Status editing restricted to admins.</div>}
                                </div>
                            </div>
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
                                Ads submit for review after payment. Use the status controls to approve or pause.
                            </div>
                        </div>

                            <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setIsEditing(null)} className="px-4 py-2 border rounded text-gray-600">Cancel</button>
                            <button onClick={handleSave} disabled={isSaving} className={`px-4 py-2 ${isSaving ? 'bg-gray-400' : 'bg-blue-600'} text-white rounded font-bold`}>
                                {isSaving ? 'Saving...' : 'Save Ad'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <FilePickerModal
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelect={handleFileSelect}
                acceptedTypes={['image', 'video']}
                filterType="all"
                role="admin"
            />
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
                                by {t.userName} - {t.categoryName} - {new Date(t.createdAt).toLocaleDateString()}
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
                        <select className="border rounded p-2 text-sm" value={newChannel.type} onChange={e => setNewChannel({...newChannel, type: e.target.value as string})}>
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
                            <span className="text-xs text-gray-500 capitalize">{c.type} Channel - {c.onlineCount} Online</span>
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

const SettingsPanel = ({ settings, toggleSetting }: { 
    settings: CommunitySettings, 
    toggleSetting: (key: keyof CommunitySettings, value: boolean) => void 
}) => {
    // Handle toggle for individual settings
    const handleToggle = (key: keyof CommunitySettings) => {
        if (!settings) return;
        
        const currentValue = settings[key];
        console.log(`Toggling ${key}: current value =`, currentValue, 'type:', typeof currentValue);
        
        if (typeof currentValue === 'boolean') {
            const newValue = !currentValue;
            console.log(`Setting ${key} to ${newValue}`);
            toggleSetting(key, newValue);
        } else {
            console.error(`${key} is not a boolean, it's:`, currentValue);
            // If the key doesn't exist or isn't boolean, set it to true
            toggleSetting(key, true);
        }
    };

    if (!settings) {
        return <div className="text-center p-8">Loading settings...</div>;
    }

    console.log('Settings in panel:', settings);

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm max-w-4xl mx-auto">
            <div className="flex items-start justify-between mb-4">
                <h3 className="font-bold text-lg text-gray-900 mb-0 flex items-center">
                    <Settings className="w-5 h-5 mr-2" /> Global Community Settings
                </h3>
                <ConfigEditorToggle settings={settings} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Access Control</h4>
                    <div className="space-y-3">
                        <Toggle 
                            label="Require Login to View" 
                            checked={settings.requireLoginToView ?? false} 
                            onChange={() => handleToggle('requireLoginToView')} 
                        />
                        <Toggle 
                            label="Allow Guest Comments" 
                            checked={settings.allowGuestComments ?? true} 
                            onChange={() => handleToggle('allowGuestComments')} 
                        />
                    </div>
                </div>
                
                <div>
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Content Policy</h4>
                    <div className="space-y-3">
                        <Toggle 
                            label="Allow Media Uploads" 
                            checked={settings.allowMediaUploads ?? true} 
                            onChange={() => handleToggle('allowMediaUploads')} 
                        />
                        <Toggle 
                            label="Enable Reposts" 
                            checked={settings.enableReposts ?? true} 
                            onChange={() => handleToggle('enableReposts')} 
                        />
                        <Toggle 
                            label="Allow External Links" 
                            checked={settings.allowExternalLinks ?? true} 
                            onChange={() => handleToggle('allowExternalLinks')} 
                        />
                    </div>
                </div>

                <div>
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">AI Safety</h4>
                    <div className="space-y-3">
                        <Toggle 
                            label="Auto-Moderate Content" 
                            checked={settings.autoModerateContent ?? false} 
                            onChange={() => handleToggle('autoModerateContent')} 
                        />
                        <Toggle 
                            label="Sentiment Analysis" 
                            checked={settings.sentimentAnalysis ?? true} 
                            onChange={() => handleToggle('sentimentAnalysis')} 
                        />
                    </div>
                </div>

                <div>
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Modules</h4>
                    <div className="space-y-3">
                        <Toggle 
                            label="Enable Business Pages" 
                            checked={(settings as any).businessPagesEnabled ?? true} 
                            onChange={() => handleToggle('businessPagesEnabled' as keyof CommunitySettings)} 
                        />
                        <Toggle 
                            label="Allow Business Page Creation" 
                            checked={(settings as any).businessPageUserCreationEnabled ?? true} 
                            onChange={() => handleToggle('businessPageUserCreationEnabled' as keyof CommunitySettings)} 
                        />
                        <Toggle 
                            label="Allow Business Page Posting" 
                            checked={(settings as any).businessPagePostingEnabled ?? true} 
                            onChange={() => handleToggle('businessPagePostingEnabled' as keyof CommunitySettings)} 
                        />
                        <Toggle 
                            label="Allow Business Page Follow" 
                            checked={(settings as any).businessPageFollowEnabled ?? true} 
                            onChange={() => handleToggle('businessPageFollowEnabled' as keyof CommunitySettings)} 
                        />
                        <Toggle 
                            label="Enable Clubs" 
                            checked={settings.enableClubs ?? true} 
                            onChange={() => handleToggle('enableClubs')} 
                        />
                        <Toggle 
                            label="Enable Events" 
                            checked={settings.enableEvents ?? true} 
                            onChange={() => handleToggle('enableEvents')} 
                        />
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
            
            {/* DEBUG SECTION - Remove in production */}
            <div className="mt-8 pt-6 border-t border-gray-100 bg-gray-50 p-4 rounded-lg text-xs">
                <h5 className="font-bold text-gray-800 mb-2">Debug Info:</h5>
                    <pre className="text-gray-600 overflow-auto max-h-40">
                    {(() => {
                        const sLocal = (settings ?? {}) as Record<string, unknown>;
                        return JSON.stringify({
                            require_login_to_view: sLocal['require_login_to_view'] ?? sLocal['requireLoginToView'],
                            allow_guest_comments: sLocal['allow_guest_comments'] ?? sLocal['allowGuestComments'],
                            allow_media_uploads: sLocal['allow_media_uploads'] ?? sLocal['allowMediaUploads'],
                            enable_reposts: sLocal['enable_reposts'] ?? sLocal['enableReposts'],
                            allow_external_links: sLocal['allow_external_links'] ?? sLocal['allowExternalLinks'],
                            auto_moderate_content: sLocal['auto_moderate_content'] ?? sLocal['autoModerateContent'],
                            sentiment_analysis: sLocal['sentiment_analysis'] ?? sLocal['sentimentAnalysis'],
                            business_pages_enabled: sLocal['business_pages_enabled'] ?? sLocal['businessPagesEnabled'],
                            business_page_user_creation_enabled: sLocal['business_page_user_creation_enabled'] ?? sLocal['businessPageUserCreationEnabled'],
                            business_page_posting_enabled: sLocal['business_page_posting_enabled'] ?? sLocal['businessPagePostingEnabled'],
                            business_page_follow_enabled: sLocal['business_page_follow_enabled'] ?? sLocal['businessPageFollowEnabled'],
                            enable_clubs: sLocal['enable_clubs'] ?? sLocal['enableClubs'],
                            enable_events: sLocal['enable_events'] ?? sLocal['enableEvents'],
                        }, null, 2);
                    })()}
                </pre>
            </div>
        </div>
    );
};

// Compact form-based config editor for known admin settings
const ConfigEditorToggle = ({ settings }: { settings: CommunitySettings }) => {
    const { showNotification } = useNotification();
    const [isOpen, setIsOpen] = useState(false);
    const [local, setLocal] = useState<Partial<CommunitySettings>>({});

    useEffect(() => {
        setLocal({ ...settings });
    }, [settings]);

    const open = () => setIsOpen(true);
    const cancel = () => {
        setLocal({ ...settings });
        setIsOpen(false);
    };

    const save = async () => {
        // Validate numeric fields
        const maxImages = Number(local.maxImagesPerPost ?? settings.maxImagesPerPost ?? 4);
        const maxVideo = Number(local.maxVideoSizeMb ?? settings.maxVideoSizeMb ?? 50);
        const expiry = Number(local.storyExpiryHours ?? settings.storyExpiryHours ?? 24);
        if (!Number.isInteger(maxImages) || maxImages <= 0) { showNotification('error', 'Validation', 'Max images per post must be a positive integer'); return; }
        if (isNaN(maxVideo) || maxVideo <= 0) { showNotification('error', 'Validation', 'Max video size must be a positive number'); return; }
        if (!Number.isInteger(expiry) || expiry <= 0) { showNotification('error', 'Validation', 'Story expiry hours must be a positive integer'); return; }

        const merged = { ...(settings as any), ...(local as any), maxImagesPerPost: maxImages, maxVideoSizeMb: maxVideo, storyExpiryHours: expiry };

        // Optimistic update: dispatch new config immediately, keep previous for undo
        const previous = { ...(settings as any) };
        try {
            window.dispatchEvent(new CustomEvent('community:admin_config_updated', { detail: merged }));
        } catch (e) {}

        try {
            const result = await CommunityService.updateAdminConfig(merged);
            showNotification('success', 'Saved', 'Admin config saved.');
            setIsOpen(false);
            // allow undo for a short time
            setUndoAvailable(true);
            (undoPrevRef as any).current = previous;
            if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
            undoTimerRef.current = setTimeout(() => { setUndoAvailable(false); undoPrevRef.current = null; }, 8000) as any;
        } catch (err: any) {
            console.error('Failed to save admin config', err);
            showNotification('error', 'Save failed', String(err?.message || err));
            // revert optimistic update
            try { window.dispatchEvent(new CustomEvent('community:admin_config_updated', { detail: previous })); } catch (e) {}
        }
    };

    const toggleField = (key: keyof CommunitySettings) => {
        setLocal((prev) => ({ ...(prev || {}), [key]: !(prev as any)?.[key] }));
    };

    // Undo helpers
    const undoPrevRef = React.useRef<any | null>(null);
    const undoTimerRef = React.useRef<any | null>(null);
    const [undoAvailable, setUndoAvailable] = useState(false);
    const handleUndo = async () => {
        const prev = undoPrevRef.current;
        if (!prev) return;
        try {
            await CommunityService.updateAdminConfig(prev);
            try { window.dispatchEvent(new CustomEvent('community:admin_config_updated', { detail: prev })); } catch (e) {}
            showNotification('success', 'Reverted', 'Admin config reverted.');
        } catch (e) {
            showNotification('error', 'Undo failed', 'Failed to revert admin config.');
        } finally {
            setUndoAvailable(false);
            undoPrevRef.current = null;
            if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        }
    };

    return (
        <div className="w-72">
            {!isOpen ? (
                <div className="flex gap-2">
                    <button onClick={open} className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700">Edit Config</button>
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                    <div className="grid grid-cols-1 gap-2 text-sm">
                        <label className="flex items-center justify-between">
                            <span>Require Login to View</span>
                            <input type="checkbox" checked={Boolean(local.requireLoginToView)} onChange={() => toggleField('requireLoginToView')} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Allow Guest Comments</span>
                            <input type="checkbox" checked={Boolean(local.allowGuestComments)} onChange={() => toggleField('allowGuestComments')} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Allow Media Uploads <span title="Allow users to attach images and videos to posts" className="ml-1 text-xs text-gray-400">?</span></span>
                            <input data-testid="cfg-allow-media" type="checkbox" checked={Boolean(local.allowMediaUploads)} onChange={() => toggleField('allowMediaUploads')} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Enable Reposts</span>
                            <input type="checkbox" checked={Boolean(local.enableReposts)} onChange={() => toggleField('enableReposts')} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Allow External Links</span>
                            <input type="checkbox" checked={Boolean(local.allowExternalLinks)} onChange={() => toggleField('allowExternalLinks')} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Auto-Moderate Content <span title="Automatically flag and hide content matching moderation rules" className="ml-1 text-xs text-gray-400">?</span></span>
                            <input data-testid="cfg-auto-moderate" type="checkbox" checked={Boolean(local.autoModerateContent)} onChange={() => toggleField('autoModerateContent')} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Sentiment Analysis</span>
                            <input type="checkbox" checked={Boolean(local.sentimentAnalysis)} onChange={() => toggleField('sentimentAnalysis')} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Enable Business Pages</span>
                            <input type="checkbox" checked={Boolean((local as any).businessPagesEnabled)} onChange={() => toggleField('businessPagesEnabled' as keyof CommunitySettings)} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Allow Business Page Creation</span>
                            <input type="checkbox" checked={Boolean((local as any).businessPageUserCreationEnabled)} onChange={() => toggleField('businessPageUserCreationEnabled' as keyof CommunitySettings)} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Allow Business Page Posting</span>
                            <input type="checkbox" checked={Boolean((local as any).businessPagePostingEnabled)} onChange={() => toggleField('businessPagePostingEnabled' as keyof CommunitySettings)} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Allow Business Page Follow</span>
                            <input type="checkbox" checked={Boolean((local as any).businessPageFollowEnabled)} onChange={() => toggleField('businessPageFollowEnabled' as keyof CommunitySettings)} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Enable Clubs</span>
                            <input data-testid="cfg-enable-clubs" type="checkbox" checked={Boolean(local.enableClubs)} onChange={() => toggleField('enableClubs')} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Enable Events</span>
                            <input data-testid="cfg-enable-events" type="checkbox" checked={Boolean(local.enableEvents)} onChange={() => toggleField('enableEvents')} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span className="mr-2">Community Title <span title="Displayed at the top of community pages" className="ml-1 text-xs text-gray-400">?</span></span>
                            <input data-testid="cfg-title" className="ml-2 w-36 rounded border px-2 py-1 text-sm" value={(local as any).communityTitle || ''} onChange={(e) => setLocal(prev => ({ ...(prev||{}), communityTitle: e.target.value }))} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Max Images per Post <span title="Limit how many images a user can attach to a single post" className="ml-1 text-xs text-gray-400">?</span></span>
                            <input data-testid="cfg-max-images" type="number" min={1} className="ml-2 w-20 rounded border px-2 py-1 text-sm" value={Number(local.maxImagesPerPost ?? settings.maxImagesPerPost ?? 4)} onChange={(e) => setLocal(prev => ({ ...(prev||{}), maxImagesPerPost: Number(e.target.value) }))} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Max Video Size (MB) <span title="Maximum allowed video upload size in megabytes" className="ml-1 text-xs text-gray-400">?</span></span>
                            <input data-testid="cfg-max-video" type="number" min={1} className="ml-2 w-20 rounded border px-2 py-1 text-sm" value={Number(local.maxVideoSizeMb ?? settings.maxVideoSizeMb ?? 50)} onChange={(e) => setLocal(prev => ({ ...(prev||{}), maxVideoSizeMb: Number(e.target.value) }))} />
                        </label>
                        <label className="flex items-center justify-between">
                            <span>Story Expiry Hours <span title="How long (hours) stories remain visible before expiring" className="ml-1 text-xs text-gray-400">?</span></span>
                            <input data-testid="cfg-expiry" type="number" min={1} className="ml-2 w-20 rounded border px-2 py-1 text-sm" value={Number(local.storyExpiryHours ?? settings.storyExpiryHours ?? 24)} onChange={(e) => setLocal(prev => ({ ...(prev||{}), storyExpiryHours: Number(e.target.value) }))} />
                        </label>
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                        <button onClick={cancel} className="rounded-lg border px-3 py-1 text-xs">Cancel</button>
                        <button onClick={save} className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700">Save</button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Toggle component with better visual feedback
const Toggle = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: () => void }) => {
    const [isLoading, setIsLoading] = useState(false);
    
    const handleClick = async () => {
        setIsLoading(true);
        try {
            await onChange();
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">{label}</span>
            <button 
                onClick={handleClick}
                disabled={isLoading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${checked ? 'translate-x-6' : 'translate-x-1'} ${isLoading ? 'opacity-70' : ''}`} />
            </button>
            {isLoading && (
                <span className="ml-2 text-xs text-gray-500">saving...</span>
            )}
        </div>
    );
};

const TabButton = ({ id, label, icon: Icon, active, onClick }: any) => (
    <button 
        onClick={() => onClick(id)}
        className={`px-4 py-2 text-sm font-medium rounded-md flex items-center transition-all whitespace-nowrap ${active ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-200'}`}
    >
        <Icon className="w-4 h-4 mr-2" /> {label}
    </button>
);

export default CommunityManagement;



