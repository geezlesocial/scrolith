
import React, { useState, useEffect, useCallback } from 'react';
import { 
    Users, MessageSquare, AlertTriangle, ShieldCheck, Settings, BarChart2, ToggleLeft, ToggleRight, 
    Lock, CheckCircle, XCircle, FileText, Gavel, Radio, Flag, Hash, Activity, DollarSign, Pin, Trash2, Plus, X, Coins, Megaphone, Share2, Search, Filter, Send, Upload, Edit2, Save, Unlock, Copy, AlertOctagon, Ban, Image as ImageIcon, Building2
} from 'lucide-react';
import { CommunityService } from '../../services/community';
import { GcoinService } from '../../services/gcoin';
import { AdService } from '../../services/ads';
import { FileService } from '../../services/files';
import type { CommunitySettings, ModerationLog, ForumThread, CommunityChannel, GcoinWallet, AdCampaign, UserRole, UploadedFile, GcoinSettings, GcoinConversionRequest, CommunityPostReport } from '../../types';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import CommunityAnalytics from './CommunityAnalytics';
import { useCurrency } from '../../context/CurrencyContext';
import FilePickerModal from '../shared/FilePickerModal';
import { DEFAULT_AD_TARGET_COUNTRIES } from '../../constants/defaultAudienceOptions';
import GroupsWorkspace from '../../community/components/GroupsWorkspace';

type AdminTab =
    | 'overview'
    | 'homepage'
    | 'threads'
    | 'channels'
    | 'moderation'
    | 'gcoin'
    | 'ads'
    | 'business'
    | 'groups'
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
    enableEvents: true,
    groups: {
        heroEyebrow: 'Scrolith Groups',
        heroTitle: 'Build private and public professional communities.',
        heroSubtitle:
            'Create Facebook-style groups with join governance, posting rules, FAQs, and rich media posts. Both freelancers and clients can run their own spaces without affecting existing community flows.',
        createButtonLabel: 'Create group',
        directoryTitle: 'Your group spaces',
        directoryEmptyState: 'No groups yet. Create the first one from here.',
        allowUserGroupCreation: true,
        showDiscoveryStats: true,
        defaultVisibility: 'public',
        defaultJoinMode: 'open',
        defaultPostPermission: 'members',
        allowMemberInvitesByDefault: true,
        showInviteInbox: true,
        showMemberDirectory: true,
        highlightPostComposer: true
    }
} as CommunitySettings;

const GuideTip: React.FC<{ text: string }> = ({ text }) => (
    <details className="group relative shrink-0">
        <summary className="list-none cursor-pointer rounded-full border border-gray-300 px-2 py-0.5 text-[10px] font-bold text-gray-600 hover:bg-gray-100">
            ?
        </summary>
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-2 text-[11px] font-normal text-gray-600 shadow-lg">
            {text}
        </div>
    </details>
);

const LabelWithGuide: React.FC<{ label: string; help: string; className?: string }> = ({ label, help, className = '' }) => (
    <div className={`mb-1 flex items-center justify-between gap-2 ${className}`}>
        <span className="text-xs font-bold text-gray-500">{label}</span>
        <GuideTip text={help} />
    </div>
);

const AD_PLACEMENT_LABELS: Record<string, string> = {
    homepage: 'Homepage',
    homepage_feed: 'Homepage Feed',
    community_feed: 'Community Feed',
    scroll_preroll: 'Scroll Pre-roll',
    scroll_feed: 'Scroll Feed Overlay',
    forum_listing: 'Forum Listing',
    thread_detail: 'Thread Detail',
    chat_sidebar: 'Chat Sidebar'
};

const normalizeAdPlacement = (value: any): string => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return 'community_feed';
    if (raw === 'feed') return 'community_feed';
    if (raw === 'chat') return 'chat_sidebar';
    if (raw === 'scroll' || raw === 'scroll_video' || raw === 'scroll_overlay') return 'scroll_preroll';
    if (raw === 'forum_top') return 'forum_listing';
    return raw;
};

const getAdminAdPlacements = (ad: AdCampaign): string[] => {
    const targeting = ad?.targeting && typeof ad.targeting === 'object' && !Array.isArray(ad.targeting)
        ? ad.targeting as Record<string, any>
        : {};
    const source =
        Array.isArray(ad.delivery?.placements) && ad.delivery.placements.length > 0
            ? ad.delivery.placements
            : Array.isArray(targeting.placements) && targeting.placements.length > 0
                ? targeting.placements
                : Array.isArray(ad.placements) && ad.placements.length > 0
                    ? ad.placements
                    : [ad.placement || 'community_feed'];

    return Array.from(new Set(source.map((placement: any) => normalizeAdPlacement(placement)).filter(Boolean)));
};

const AdminAdDeliveryStrip: React.FC<{ ad: AdCampaign }> = ({ ad }) => {
    const delivery = ad.delivery || null;
    const checks = Array.isArray(delivery?.placementChecks) && delivery.placementChecks.length > 0
        ? delivery.placementChecks.map((check) => ({
            placement: normalizeAdPlacement(check.placement),
            eligible: Boolean(check.eligible),
            blockers: Array.isArray(check.blockers) ? check.blockers : []
        }))
        : getAdminAdPlacements(ad).map((placement) => ({
            placement,
            eligible: null as boolean | null,
            blockers: [] as string[]
        }));
    const blockers = Array.isArray(delivery?.blockers) ? delivery.blockers : [];
    const isServing = Boolean(delivery?.isServing);

    return (
        <div className={`mt-3 rounded-lg border p-3 ${isServing ? 'border-emerald-200 bg-emerald-50' : delivery ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Delivery diagnostics</p>
                    <p className={`mt-1 text-xs font-semibold ${isServing ? 'text-emerald-800' : delivery ? 'text-amber-900' : 'text-gray-600'}`}>
                        {delivery?.summary || 'Diagnostics pending from backend.'}
                    </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${isServing ? 'bg-emerald-100 text-emerald-700' : delivery ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                    {isServing ? 'Serving' : delivery ? 'Blocked' : 'Unknown'}
                </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
                {checks.map((check) => (
                    <span
                        key={check.placement}
                        title={check.blockers[0] || undefined}
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            check.eligible === true
                                ? 'bg-white text-emerald-700'
                                : check.eligible === false
                                    ? 'bg-white text-amber-800'
                                    : 'bg-white text-gray-600'
                        }`}
                    >
                        {AD_PLACEMENT_LABELS[check.placement] || check.placement}
                    </span>
                ))}
            </div>
            {blockers.length > 0 ? (
                <p className="mt-2 text-[11px] leading-5 text-amber-900">{blockers[0]}</p>
            ) : null}
        </div>
    );
};

const normalizeTargetCountryCatalog = (entries: unknown[]): string[] => {
    const seen = new Set<string>();
    return entries
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .filter((entry) => {
            const normalized = entry.toLowerCase();
            if (seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
        });
};

const DEFAULT_SCROLL_ADS_CONFIG = {
    enabled: true,
    fallbackToCommunityFeed: true,
    videoSkipDelaySeconds: 10,
    staticSkipDelaySeconds: 3,
    firstAdAfterScrolls: 1,
    repeatEveryScrolls: 5,
    minSecondsBetweenAds: 90,
    maxAdsPerSession: 6,
    maxAdsPerViewerDay: 20,
    perAdCooldownMinutes: 30,
    placementPacing: {
        scroll_preroll: 2,
        scroll_feed: 1
    }
};

const CommunityManagement = ({ initialTab }: { initialTab?: AdminTab } = {}) => {
    const [activeTab, setActiveTab] = useState<AdminTab>('overview');
    const [settings, setSettings] = useState<CommunitySettings | null>(null);
    const [logs, setLogs] = useState<ModerationLog[]>([]);
    const { showNotification } = useNotification();
    const { user } = useUser();

    useEffect(() => {
        // Initialize active sub-tab from URL query params.
        try {
            const params = new URLSearchParams(window.location.search);
            const t = params.get('communityTab') || params.get('subtab') || params.get('tab');
            if (t && ['overview','homepage','threads','channels','moderation','gcoin','ads','business','groups','social','settings'].includes(t)) {
                setActiveTab(t as AdminTab);
            } else if (initialTab) {
                setActiveTab(initialTab);
            }
        } catch (e) {
            // ignore when running in non-browser or tests
        }

        loadData();
    }, [initialTab]);

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
                <TabButton id="groups" label="Group System" icon={Users} active={activeTab === 'groups'} onClick={setActiveTab} />
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
                {activeTab === 'groups' && settings && <GroupsAdminPanel settings={settings} setSettings={setSettings} />}
                {activeTab === 'moderation' && <ModerationQueue logs={logs} refresh={() => CommunityService.getModerationLogs().then(setLogs)} />}
                {activeTab === 'social' && <SocialGraphView />}
                {activeTab === 'settings' && settings && <SettingsPanel settings={settings} toggleSetting={toggleSetting} />}
            </div>
        </div>
    );
};

const GroupsAdminPanel = ({
    settings,
    setSettings
}: {
    settings: CommunitySettings;
    setSettings: React.Dispatch<React.SetStateAction<CommunitySettings | null>>;
}) => {
    const { showNotification } = useNotification();
    const [groupInventory, setGroupInventory] = useState<any[]>([]);
    const [inventoryLoading, setInventoryLoading] = useState(true);
    const [inventorySearch, setInventorySearch] = useState('');
    const [localConfig, setLocalConfig] = useState<any>(() => ({
        heroEyebrow: settings?.groups?.heroEyebrow || 'Scrolith Groups',
        heroTitle: settings?.groups?.heroTitle || 'Build private and public professional communities.',
        heroSubtitle:
            settings?.groups?.heroSubtitle ||
            'Create Facebook-style groups with join governance, posting rules, FAQs, and rich media posts. Both freelancers and clients can run their own spaces without affecting existing community flows.',
        createButtonLabel: settings?.groups?.createButtonLabel || 'Create group',
        directoryTitle: settings?.groups?.directoryTitle || 'Your group spaces',
        directoryEmptyState: settings?.groups?.directoryEmptyState || 'No groups yet. Create the first one from here.',
        allowUserGroupCreation: settings?.groups?.allowUserGroupCreation !== false,
        showDiscoveryStats: settings?.groups?.showDiscoveryStats !== false,
        defaultVisibility: settings?.groups?.defaultVisibility || 'public',
        defaultJoinMode: settings?.groups?.defaultJoinMode || 'open',
        defaultPostPermission: settings?.groups?.defaultPostPermission || 'members',
        allowMemberInvitesByDefault: settings?.groups?.allowMemberInvitesByDefault !== false,
        showInviteInbox: settings?.groups?.showInviteInbox !== false,
        showMemberDirectory: settings?.groups?.showMemberDirectory !== false,
        highlightPostComposer: settings?.groups?.highlightPostComposer !== false
    }));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setLocalConfig({
            heroEyebrow: settings?.groups?.heroEyebrow || 'Scrolith Groups',
            heroTitle: settings?.groups?.heroTitle || 'Build private and public professional communities.',
            heroSubtitle:
                settings?.groups?.heroSubtitle ||
                'Create Facebook-style groups with join governance, posting rules, FAQs, and rich media posts. Both freelancers and clients can run their own spaces without affecting existing community flows.',
            createButtonLabel: settings?.groups?.createButtonLabel || 'Create group',
            directoryTitle: settings?.groups?.directoryTitle || 'Your group spaces',
            directoryEmptyState: settings?.groups?.directoryEmptyState || 'No groups yet. Create the first one from here.',
            allowUserGroupCreation: settings?.groups?.allowUserGroupCreation !== false,
            showDiscoveryStats: settings?.groups?.showDiscoveryStats !== false,
            defaultVisibility: settings?.groups?.defaultVisibility || 'public',
            defaultJoinMode: settings?.groups?.defaultJoinMode || 'open',
            defaultPostPermission: settings?.groups?.defaultPostPermission || 'members',
            allowMemberInvitesByDefault: settings?.groups?.allowMemberInvitesByDefault !== false,
            showInviteInbox: settings?.groups?.showInviteInbox !== false,
            showMemberDirectory: settings?.groups?.showMemberDirectory !== false,
            highlightPostComposer: settings?.groups?.highlightPostComposer !== false
        });
    }, [settings]);

    const loadGroupInventory = useCallback(async () => {
        setInventoryLoading(true);
        try {
            const clubs = await CommunityService.getClubs({ limit: 200 });
            setGroupInventory(clubs);
        } catch (error: any) {
            setGroupInventory([]);
            showNotification('warning', 'Groups', error?.message || 'Unable to load live group inventory.');
        } finally {
            setInventoryLoading(false);
        }
    }, [showNotification]);

    useEffect(() => {
        void loadGroupInventory();
    }, [loadGroupInventory]);

    const normalizedInventorySearch = inventorySearch.trim().toLowerCase();
    const filteredInventory = groupInventory.filter((group) => {
        if (!normalizedInventorySearch) return true;
        const haystack = [
            group?.name,
            group?.slug,
            group?.summary,
            group?.ownerName,
            group?.category,
            group?.location
        ]
            .map((value) => String(value || '').toLowerCase())
            .join(' ');
        return haystack.includes(normalizedInventorySearch);
    });

    const inventoryStats = filteredInventory.reduce(
        (acc, group) => {
            acc.total += 1;
            if (String(group?.visibility || '').toLowerCase() === 'private') acc.privateCount += 1;
            if (String(group?.joinMode || '').toLowerCase() === 'request') acc.requestCount += 1;
            if (String(group?.joinMode || '').toLowerCase() === 'invite_only') acc.inviteOnlyCount += 1;
            acc.pendingRequests += Number(group?.pendingRequestCount || 0);
            acc.pendingInvites += Number(group?.pendingInviteCount || 0);
            return acc;
        },
        {
            total: 0,
            privateCount: 0,
            requestCount: 0,
            inviteOnlyCount: 0,
            pendingRequests: 0,
            pendingInvites: 0
        }
    );

    const save = async () => {
        const groups = {
            heroEyebrow: String(localConfig.heroEyebrow || '').trim() || 'Scrolith Groups',
            heroTitle: String(localConfig.heroTitle || '').trim() || 'Build private and public professional communities.',
            heroSubtitle:
                String(localConfig.heroSubtitle || '').trim() ||
                'Create Facebook-style groups with join governance, posting rules, FAQs, and rich media posts. Both freelancers and clients can run their own spaces without affecting existing community flows.',
            createButtonLabel: String(localConfig.createButtonLabel || '').trim() || 'Create group',
            directoryTitle: String(localConfig.directoryTitle || '').trim() || 'Your group spaces',
            directoryEmptyState:
                String(localConfig.directoryEmptyState || '').trim() || 'No groups yet. Create the first one from here.',
            allowUserGroupCreation: Boolean(localConfig.allowUserGroupCreation),
            showDiscoveryStats: Boolean(localConfig.showDiscoveryStats),
            defaultVisibility: String(localConfig.defaultVisibility || 'public').trim().toLowerCase() === 'private' ? 'private' : 'public',
            defaultJoinMode: ['open', 'request', 'invite_only'].includes(String(localConfig.defaultJoinMode || 'open').trim())
                ? String(localConfig.defaultJoinMode || 'open').trim()
                : 'open',
            defaultPostPermission: ['admins', 'members', 'everyone'].includes(String(localConfig.defaultPostPermission || 'members').trim())
                ? String(localConfig.defaultPostPermission || 'members').trim()
                : 'members',
            allowMemberInvitesByDefault: Boolean(localConfig.allowMemberInvitesByDefault),
            showInviteInbox: Boolean(localConfig.showInviteInbox),
            showMemberDirectory: Boolean(localConfig.showMemberDirectory),
            highlightPostComposer: Boolean(localConfig.highlightPostComposer)
        };

        setSaving(true);
        try {
            const nextPayload = { ...(settings as any), groups };
            const result = await CommunityService.updateAdminConfig(nextPayload);
            setSettings(result);
            try {
                window.dispatchEvent(new CustomEvent('community:admin_config_updated', { detail: result }));
            } catch (_error) {}
            showNotification('success', 'Groups', 'Group system settings updated.');
        } catch (error: any) {
            showNotification('error', 'Groups', error?.message || 'Unable to save group system settings.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-3xl">
                        <h3 className="text-lg font-bold text-slate-900">Group System Control Center</h3>
                        <p className="mt-1 text-sm text-slate-500">
                            Manage the clubs landing experience and the live group directory from the admin dashboard.
                        </p>
                    </div>
                    <button
                        onClick={save}
                        disabled={saving}
                        className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Save className="mr-2 h-4 w-4" />
                        {saving ? 'Saving...' : 'Save Group Settings'}
                    </button>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Hero Eyebrow</span>
                        <input
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            value={localConfig.heroEyebrow}
                            onChange={(event) => setLocalConfig((prev: any) => ({ ...prev, heroEyebrow: event.target.value }))}
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Create Button Label</span>
                        <input
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            value={localConfig.createButtonLabel}
                            onChange={(event) => setLocalConfig((prev: any) => ({ ...prev, createButtonLabel: event.target.value }))}
                        />
                    </label>
                    <label className="space-y-2 lg:col-span-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Hero Title</span>
                        <input
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            value={localConfig.heroTitle}
                            onChange={(event) => setLocalConfig((prev: any) => ({ ...prev, heroTitle: event.target.value }))}
                        />
                    </label>
                    <label className="space-y-2 lg:col-span-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Hero Subtitle</span>
                        <textarea
                            rows={3}
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            value={localConfig.heroSubtitle}
                            onChange={(event) => setLocalConfig((prev: any) => ({ ...prev, heroSubtitle: event.target.value }))}
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Directory Title</span>
                        <input
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            value={localConfig.directoryTitle}
                            onChange={(event) => setLocalConfig((prev: any) => ({ ...prev, directoryTitle: event.target.value }))}
                        />
                    </label>
                    <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Empty Directory Copy</span>
                        <input
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            value={localConfig.directoryEmptyState}
                            onChange={(event) => setLocalConfig((prev: any) => ({ ...prev, directoryEmptyState: event.target.value }))}
                        />
                    </label>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                    <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div>
                            <div className="text-sm font-semibold text-slate-900">Allow user-created groups</div>
                            <div className="text-xs text-slate-500">Admins still retain full access even when creator access is disabled.</div>
                        </div>
                        <input
                            type="checkbox"
                            checked={Boolean(localConfig.allowUserGroupCreation)}
                            onChange={(event) => setLocalConfig((prev: any) => ({ ...prev, allowUserGroupCreation: event.target.checked }))}
                        />
                    </label>
                    <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div>
                            <div className="text-sm font-semibold text-slate-900">Show discovery counters</div>
                            <div className="text-xs text-slate-500">Controls the visible/joined KPI cards in the clubs hero.</div>
                        </div>
                        <input
                            type="checkbox"
                            checked={Boolean(localConfig.showDiscoveryStats)}
                            onChange={(event) => setLocalConfig((prev: any) => ({ ...prev, showDiscoveryStats: event.target.checked }))}
                        />
                    </label>
                    <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div>
                            <div className="text-sm font-semibold text-slate-900">Default member invites</div>
                            <div className="text-xs text-slate-500">New groups start with member-to-member invites enabled unless the creator changes it.</div>
                        </div>
                        <input
                            type="checkbox"
                            checked={Boolean(localConfig.allowMemberInvitesByDefault)}
                            onChange={(event) => setLocalConfig((prev: any) => ({ ...prev, allowMemberInvitesByDefault: event.target.checked }))}
                        />
                    </label>
                    <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div>
                            <div className="text-sm font-semibold text-slate-900">Show invite inbox</div>
                            <div className="text-xs text-slate-500">Expose live received and sent invitation inbox panels inside group workspaces.</div>
                        </div>
                        <input
                            type="checkbox"
                            checked={Boolean(localConfig.showInviteInbox)}
                            onChange={(event) => setLocalConfig((prev: any) => ({ ...prev, showInviteInbox: event.target.checked }))}
                        />
                    </label>
                    <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div>
                            <div className="text-sm font-semibold text-slate-900">Show member directory</div>
                            <div className="text-xs text-slate-500">Keep the member list visible inside the workspace for discovery and moderation.</div>
                        </div>
                        <input
                            type="checkbox"
                            checked={Boolean(localConfig.showMemberDirectory)}
                            onChange={(event) => setLocalConfig((prev: any) => ({ ...prev, showMemberDirectory: event.target.checked }))}
                        />
                    </label>
                    <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2">
                        <div>
                            <div className="text-sm font-semibold text-slate-900">Highlight post composer</div>
                            <div className="text-xs text-slate-500">Apply the enhanced enterprise composer treatment to media posting cards inside groups.</div>
                        </div>
                        <input
                            type="checkbox"
                            checked={Boolean(localConfig.highlightPostComposer)}
                            onChange={(event) => setLocalConfig((prev: any) => ({ ...prev, highlightPostComposer: event.target.checked }))}
                        />
                    </label>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-3">
                    <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Default Visibility</span>
                        <select
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            value={localConfig.defaultVisibility}
                            onChange={(event) => setLocalConfig((prev: any) => ({ ...prev, defaultVisibility: event.target.value }))}
                        >
                            <option value="public">Public by default</option>
                            <option value="private">Private by default</option>
                        </select>
                    </label>
                    <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Default Join Mode</span>
                        <select
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            value={localConfig.defaultJoinMode}
                            onChange={(event) => setLocalConfig((prev: any) => ({ ...prev, defaultJoinMode: event.target.value }))}
                        >
                            <option value="open">Open join</option>
                            <option value="request">Request approval</option>
                            <option value="invite_only">Invite only</option>
                        </select>
                    </label>
                    <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Default Post Permission</span>
                        <select
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            value={localConfig.defaultPostPermission}
                            onChange={(event) => setLocalConfig((prev: any) => ({ ...prev, defaultPostPermission: event.target.value }))}
                        >
                            <option value="members">Members can post</option>
                            <option value="admins">Only admins and moderators</option>
                            <option value="everyone">Everyone who can view</option>
                        </select>
                    </label>
                </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Live group operations</h3>
                        <p className="mt-1 text-sm text-slate-500">
                            Review total groups, approval pressure, and route directly into moderation or invite workflows without leaving the admin dashboard.
                        </p>
                    </div>
                    <button
                        onClick={() => void loadGroupInventory()}
                        className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                        <Activity className="mr-2 h-4 w-4" />
                        Refresh inventory
                    </button>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {[
                        { label: 'Visible groups', value: inventoryStats.total, tone: 'text-slate-900' },
                        { label: 'Private groups', value: inventoryStats.privateCount, tone: 'text-indigo-700' },
                        { label: 'Approval groups', value: inventoryStats.requestCount, tone: 'text-amber-700' },
                        { label: 'Invite-only groups', value: inventoryStats.inviteOnlyCount, tone: 'text-violet-700' },
                        { label: 'Pending join requests', value: inventoryStats.pendingRequests, tone: 'text-rose-700' },
                        { label: 'Pending invites', value: inventoryStats.pendingInvites, tone: 'text-emerald-700' }
                    ].map((stat) => (
                        <div key={stat.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">{stat.label}</div>
                            <div className={`mt-2 text-3xl font-black ${stat.tone}`}>{stat.value}</div>
                        </div>
                    ))}
                </div>

                <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <label className="relative block w-full lg:max-w-md">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                value={inventorySearch}
                                onChange={(event) => setInventorySearch(event.target.value)}
                                placeholder="Search groups, owner, category, or location"
                                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            />
                        </label>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                            <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700">
                                Showing {filteredInventory.length} of {groupInventory.length}
                            </span>
                            {inventoryLoading ? (
                                <span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">Refreshing…</span>
                            ) : null}
                        </div>
                    </div>

                    <div className="mt-4 space-y-3">
                        {filteredInventory.length ? (
                            filteredInventory.map((group) => {
                                const hrefBase = `/admin/dashboard?tab=community&communityTab=groups&group=${encodeURIComponent(String(group?.slug || group?.id || ''))}`;
                                return (
                                    <div key={group.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h4 className="truncate text-base font-bold text-slate-900">{group.name || 'Untitled group'}</h4>
                                                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${String(group.visibility || '').toLowerCase() === 'private' ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                        {String(group.visibility || 'public')}
                                                    </span>
                                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                                        {String(group.joinMode || 'open').replace('_', ' ')}
                                                    </span>
                                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                                        {group.memberCount || 0} members
                                                    </span>
                                                </div>
                                                <p className="mt-2 line-clamp-2 text-sm text-slate-500">
                                                    {group.summary || group.description || 'No summary added yet.'}
                                                </p>
                                                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                                                    <span className="rounded-full bg-slate-100 px-2.5 py-1">Owner: {group.ownerName || 'Unknown'}</span>
                                                    {group.category ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{group.category}</span> : null}
                                                    {group.location ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{group.location}</span> : null}
                                                </div>
                                            </div>
                                            <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[270px]">
                                                <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-3">
                                                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Join requests</div>
                                                    <div className="mt-1 text-2xl font-black text-amber-900">{Number(group.pendingRequestCount || 0)}</div>
                                                </div>
                                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3">
                                                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Invites</div>
                                                    <div className="mt-1 text-2xl font-black text-emerald-900">{Number(group.pendingInviteCount || 0)}</div>
                                                </div>
                                                <a
                                                    href={`${hrefBase}&panel=moderation`}
                                                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                                                >
                                                    Review requests
                                                </a>
                                                <a
                                                    href={`${hrefBase}&panel=invites`}
                                                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                                                >
                                                    Open invite inbox
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
                                {inventoryLoading ? 'Loading live groups…' : 'No groups match the current filters.'}
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <GroupsWorkspace embedded />
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
    const [countryDraft, setCountryDraft] = useState('');
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
                const normalizedCountries = Array.from(
                    new Set(
                        (Array.isArray(cfg?.targetCountries) ? cfg.targetCountries : DEFAULT_AD_TARGET_COUNTRIES)
                            .map((entry: any) => String(entry || '').trim())
                            .filter(Boolean)
                    )
                );
                setAdsConfig({ ...(cfg || {}), targetCountries: normalizedCountries });
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
            const normalizedCountries = normalizeTargetCountryCatalog(
                Array.isArray(adsConfig?.targetCountries) ? adsConfig.targetCountries : []
            );
            const payload = { ...adsConfig, targetCountries: normalizedCountries };
            const updated = await AdService.updateConfig({ data: payload });
            setAdsConfig(updated);
            showNotification('success', 'Saved', 'Ads config updated.');
        } catch (e) {
            showNotification('error', 'Failed', 'Unable to save ads config.');
        }
    };

    const addTargetCountry = () => {
        const nextCountry = String(countryDraft || '').trim();
        if (!nextCountry) return;
        setAdsConfig((prev: any) => {
            const current = Array.isArray(prev?.targetCountries) ? prev.targetCountries : [];
            const exists = current.some((entry: any) => String(entry).toLowerCase() === nextCountry.toLowerCase());
            if (exists) return prev;
            return { ...prev, targetCountries: [...current, nextCountry] };
        });
        setCountryDraft('');
    };

    const addAllTargetCountries = () => {
        setAdsConfig((prev: any) => ({
            ...prev,
            targetCountries: normalizeTargetCountryCatalog([
                ...(Array.isArray(prev?.targetCountries) ? prev.targetCountries : []),
                ...DEFAULT_AD_TARGET_COUNTRIES
            ])
        }));
    };

    const clearAllTargetCountries = () => {
        setAdsConfig((prev: any) => ({
            ...prev,
            targetCountries: []
        }));
    };

    const removeTargetCountry = (country: string) => {
        setAdsConfig((prev: any) => ({
            ...prev,
            targetCountries: (Array.isArray(prev?.targetCountries) ? prev.targetCountries : [])
                .filter((entry: any) => String(entry) !== country)
        }));
    };

    const scrollAdsConfig = {
        ...DEFAULT_SCROLL_ADS_CONFIG,
        ...(adsConfig?.scrollAds || {}),
        placementPacing: {
            ...DEFAULT_SCROLL_ADS_CONFIG.placementPacing,
            ...(adsConfig?.scrollAds?.placementPacing || {})
        }
    };

    const updateScrollAdsConfig = (patch: Record<string, any>) => {
        setAdsConfig((prev: any) => ({
            ...prev,
            scrollAds: {
                ...DEFAULT_SCROLL_ADS_CONFIG,
                ...(prev?.scrollAds || {}),
                placementPacing: {
                    ...DEFAULT_SCROLL_ADS_CONFIG.placementPacing,
                    ...(prev?.scrollAds?.placementPacing || {})
                },
                ...patch
            }
        }));
    };

    const updateScrollAdPacing = (placement: 'scroll_preroll' | 'scroll_feed', value: number) => {
        setAdsConfig((prev: any) => ({
            ...prev,
            scrollAds: {
                ...DEFAULT_SCROLL_ADS_CONFIG,
                ...(prev?.scrollAds || {}),
                placementPacing: {
                    ...DEFAULT_SCROLL_ADS_CONFIG.placementPacing,
                    ...(prev?.scrollAds?.placementPacing || {}),
                    [placement]: Number(value || 0)
                }
            }
        }));
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

    const configuredTargetCountries = Array.isArray(adsConfig?.targetCountries) ? adsConfig.targetCountries : [];
    const missingDefaultTargetCountryCount = DEFAULT_AD_TARGET_COUNTRIES.filter(
        (country) => !configuredTargetCountries.some((entry: any) => String(entry || '').toLowerCase() === country.toLowerCase())
    ).length;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div>
                    <h3 className="font-bold text-gray-900">Sponsored Posts</h3>
                    <p className="text-xs text-gray-500">Manage community advertisements</p>
                </div>
                <button 
                    onClick={() => { setOriginalEditing(null); setIsEditing({ title: '', clientName: '', destinationUrl: '', destinationType: 'url', objective: 'traffic', ctaText: '', placement: 'community_feed', budget: 0, cpm: 0, currency: 'USD', status: 'draft', mediaFileIds: [] }); }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center hover:bg-blue-700"
                >
                    <Plus className="w-4 h-4 mr-2" /> Create Ad
                </button>
            </div>

            {adsAnalytics && (
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="font-bold text-gray-900 mb-2">Ads Analytics</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-5">
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
                        <div>
                            <div className="text-gray-500">CTR</div>
                            <div className="font-semibold">{adsAnalytics?.ctr ?? 0}%</div>
                        </div>
                    </div>
                    {adsAnalytics?.scroll && (
                        <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50/60 p-3">
                            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h5 className="text-sm font-bold text-slate-900">/scroll Ad Analytics</h5>
                                    <p className="text-xs text-slate-500">Pre-roll and feed-overlay delivery from Ads Manager campaigns.</p>
                                </div>
                                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-cyan-700">
                                    {adsAnalytics.scroll.activeCampaigns || 0} active campaigns
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-5">
                                <div className="rounded-lg bg-white p-3">
                                    <div className="text-gray-500">Scroll impressions</div>
                                    <div className="mt-1 text-lg font-bold">{adsAnalytics.scroll.impressions || 0}</div>
                                </div>
                                <div className="rounded-lg bg-white p-3">
                                    <div className="text-gray-500">Scroll clicks</div>
                                    <div className="mt-1 text-lg font-bold">{adsAnalytics.scroll.clicks || 0}</div>
                                </div>
                                <div className="rounded-lg bg-white p-3">
                                    <div className="text-gray-500">Scroll CTR</div>
                                    <div className="mt-1 text-lg font-bold">{adsAnalytics.scroll.ctr || 0}%</div>
                                </div>
                                <div className="rounded-lg bg-white p-3">
                                    <div className="text-gray-500">Scroll spend</div>
                                    <div className="mt-1 text-lg font-bold">{adsAnalytics.scroll.spend || 0}</div>
                                </div>
                                <div className="rounded-lg bg-white p-3">
                                    <div className="text-gray-500">Remaining budget</div>
                                    <div className="mt-1 text-lg font-bold">{adsAnalytics.scroll.remainingBudget || 0}</div>
                                </div>
                            </div>
                            {Array.isArray(adsAnalytics.scroll.placements) && adsAnalytics.scroll.placements.length > 0 && (
                                <div className="mt-3 grid gap-2 md:grid-cols-2">
                                    {adsAnalytics.scroll.placements.map((placement: any) => (
                                        <div key={placement.placement} className="rounded-lg border border-cyan-100 bg-white p-3 text-xs">
                                            <div className="mb-1 font-semibold text-slate-800">{placement.placement}</div>
                                            <div className="grid grid-cols-3 gap-2 text-gray-600">
                                                <span>{placement.impressions || 0} impressions</span>
                                                <span>{placement.clicks || 0} clicks</span>
                                                <span>{placement.ctr || 0}% CTR</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {adsConfig && (
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h4 className="font-bold text-gray-900">Ads Pricing & Rules</h4>
                            <GuideTip text="Configure ad billing rules, approval workflow, media limits, and targeting controls used by user ad-creation forms in real time." />
                        </div>
                        <button onClick={handleConfigSave} className="px-3 py-1 text-sm bg-green-600 text-white rounded">Save Config</button>
                    </div>
                    <div className="grid grid-cols-1 gap-4 text-sm lg:grid-cols-3">
                        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Approval Workflow</p>
                            <div>
                                <LabelWithGuide
                                    label="Approval Mode"
                                    help="Manual requires admin approval before serving ads. Auto approves ads immediately after payment."
                                />
                                <select
                                    className="w-full border rounded p-2"
                                    value={String(adsConfig?.approvalMode || (adsConfig?.autoApproveAds ? 'auto' : 'manual'))}
                                    onChange={(e) =>
                                        setAdsConfig((prev: any) => ({
                                            ...prev,
                                            approvalMode: e.target.value,
                                            autoApproveAds: e.target.value === 'auto'
                                        }))
                                    }
                                >
                                    <option value="manual">Manual review (admin approval required)</option>
                                    <option value="auto">Auto approve after payment</option>
                                </select>
                            </div>
                            <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                                <input
                                    type="checkbox"
                                    checked={adsConfig?.notifyAdminOnAdCreate !== false}
                                    onChange={(e) => setAdsConfig((prev: any) => ({ ...prev, notifyAdminOnAdCreate: e.target.checked }))}
                                />
                                Notify admins by email/in-app when a customer creates an ad
                            </label>
                        </div>

                        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Budget & Creative Limits</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <LabelWithGuide label="Min Budget" help="Minimum campaign budget users can submit." />
                                    <input
                                        type="number"
                                        className="w-full border rounded p-2"
                                        value={adsConfig?.minBudget ?? 0}
                                        onChange={(e) => setAdsConfig((prev: any) => ({ ...prev, minBudget: Number(e.target.value || 0) }))}
                                    />
                                </div>
                                <div>
                                    <LabelWithGuide label="Max Budget" help="Maximum campaign budget accepted per ad." />
                                    <input
                                        type="number"
                                        className="w-full border rounded p-2"
                                        value={adsConfig?.maxBudget ?? 0}
                                        onChange={(e) => setAdsConfig((prev: any) => ({ ...prev, maxBudget: Number(e.target.value || 0) }))}
                                    />
                                </div>
                                <div>
                                    <LabelWithGuide
                                        label="Max Placements Per Ad"
                                        help="Maximum number of placements users can choose for one campaign."
                                    />
                                    <input
                                        type="number"
                                        min={1}
                                        max={8}
                                        className="w-full border rounded p-2"
                                        value={adsConfig?.maxPlacementsPerAd ?? 8}
                                        onChange={(e) =>
                                            setAdsConfig((prev: any) => ({
                                                ...prev,
                                                maxPlacementsPerAd: Math.max(1, Math.min(8, Number(e.target.value || 1)))
                                            }))
                                        }
                                    />
                                </div>
                                <div>
                                    <LabelWithGuide label="Max Images" help="Maximum image files allowed in one ad campaign." />
                                    <input
                                        type="number"
                                        min={1}
                                        className="w-full border rounded p-2"
                                        value={adsConfig?.maxImageAssets ?? 6}
                                        onChange={(e) => setAdsConfig((prev: any) => ({ ...prev, maxImageAssets: Number(e.target.value || 1) }))}
                                    />
                                </div>
                                <div>
                                    <LabelWithGuide label="Max Videos" help="Maximum video files allowed in one ad campaign." />
                                    <input
                                        type="number"
                                        min={1}
                                        className="w-full border rounded p-2"
                                        value={adsConfig?.maxVideoAssets ?? 1}
                                        onChange={(e) => setAdsConfig((prev: any) => ({ ...prev, maxVideoAssets: Number(e.target.value || 1) }))}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Target Countries</p>
                            <LabelWithGuide
                                label="Country Catalog"
                                help="This list powers the target-country dropdown shown to users during ad creation. Add new countries, add the full default catalog, or clear the catalog entirely before saving."
                                className="mb-0"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={addAllTargetCountries}
                                    disabled={missingDefaultTargetCountryCount === 0}
                                    className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Add all countries
                                </button>
                                <button
                                    type="button"
                                    onClick={clearAllTargetCountries}
                                    disabled={configuredTargetCountries.length === 0}
                                    className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Remove all countries
                                </button>
                                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                                    {configuredTargetCountries.length} configured
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    list="ads-country-suggestions"
                                    value={countryDraft}
                                    onChange={(e) => setCountryDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            addTargetCountry();
                                        }
                                    }}
                                    placeholder="Add country"
                                    className="w-full border rounded p-2"
                                />
                                <button
                                    type="button"
                                    onClick={addTargetCountry}
                                    className="px-3 py-2 rounded bg-blue-600 text-white text-xs font-semibold"
                                >
                                    Add
                                </button>
                            </div>
                            <datalist id="ads-country-suggestions">
                                {DEFAULT_AD_TARGET_COUNTRIES.map((country) => (
                                    <option key={country} value={country} />
                                ))}
                            </datalist>
                            <div className="max-h-36 overflow-y-auto rounded border border-gray-100 p-2">
                                <div className="flex flex-wrap gap-2">
                                    {configuredTargetCountries.map((country: string) => (
                                        <span
                                            key={country}
                                            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] text-blue-700"
                                        >
                                            {country}
                                            <button
                                                type="button"
                                                onClick={() => removeTargetCountry(country)}
                                                className="rounded px-1 text-blue-700 hover:bg-blue-100"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                {configuredTargetCountries.length === 0 && (
                                    <p className="text-xs text-gray-500">No countries configured yet.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-3 space-y-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">/scroll Video Ad Delivery</p>
                                    <GuideTip text="Control how sponsored video and image ads appear inside /scroll without changing Scroll content, reactions, or video navigation." />
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                    Skip timers, frequency caps, and placement pacing are pushed to web and mobile clients in real time after saving.
                                </p>
                            </div>
                            <label className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-700">
                                <input
                                    type="checkbox"
                                    checked={scrollAdsConfig.enabled !== false}
                                    onChange={(e) => updateScrollAdsConfig({ enabled: e.target.checked })}
                                />
                                Enable /scroll ads
                            </label>
                        </div>

                        <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2 lg:grid-cols-4">
                            <label className="rounded-lg border border-cyan-100 bg-white p-3">
                                <LabelWithGuide label="Video Skip Delay" help="Seconds before users can skip a video ad. Use 10 seconds for modern pre-roll behavior." />
                                <input
                                    type="number"
                                    min={0}
                                    max={60}
                                    className="w-full rounded border p-2"
                                    value={scrollAdsConfig.videoSkipDelaySeconds}
                                    onChange={(e) => updateScrollAdsConfig({ videoSkipDelaySeconds: Number(e.target.value || 0) })}
                                />
                            </label>
                            <label className="rounded-lg border border-cyan-100 bg-white p-3">
                                <LabelWithGuide label="Static Skip Delay" help="Seconds before users can skip static/image ads." />
                                <input
                                    type="number"
                                    min={0}
                                    max={30}
                                    className="w-full rounded border p-2"
                                    value={scrollAdsConfig.staticSkipDelaySeconds}
                                    onChange={(e) => updateScrollAdsConfig({ staticSkipDelaySeconds: Number(e.target.value || 0) })}
                                />
                            </label>
                            <label className="rounded-lg border border-cyan-100 bg-white p-3">
                                <LabelWithGuide label="First Ad After" help="Show the first eligible ad after this many Scroll videos." />
                                <input
                                    type="number"
                                    min={1}
                                    max={50}
                                    className="w-full rounded border p-2"
                                    value={scrollAdsConfig.firstAdAfterScrolls}
                                    onChange={(e) => updateScrollAdsConfig({ firstAdAfterScrolls: Number(e.target.value || 1) })}
                                />
                            </label>
                            <label className="rounded-lg border border-cyan-100 bg-white p-3">
                                <LabelWithGuide label="Repeat Every" help="After the first ad, serve another eligible ad every N Scroll videos." />
                                <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    className="w-full rounded border p-2"
                                    value={scrollAdsConfig.repeatEveryScrolls}
                                    onChange={(e) => updateScrollAdsConfig({ repeatEveryScrolls: Number(e.target.value || 1) })}
                                />
                            </label>
                            <label className="rounded-lg border border-cyan-100 bg-white p-3">
                                <LabelWithGuide label="Minimum Gap" help="Minimum seconds between ad displays for a viewer session." />
                                <input
                                    type="number"
                                    min={0}
                                    max={3600}
                                    className="w-full rounded border p-2"
                                    value={scrollAdsConfig.minSecondsBetweenAds}
                                    onChange={(e) => updateScrollAdsConfig({ minSecondsBetweenAds: Number(e.target.value || 0) })}
                                />
                            </label>
                            <label className="rounded-lg border border-cyan-100 bg-white p-3">
                                <LabelWithGuide label="Session Cap" help="Maximum /scroll ads shown in one browser/app session. Set 0 for no session cap." />
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    className="w-full rounded border p-2"
                                    value={scrollAdsConfig.maxAdsPerSession}
                                    onChange={(e) => updateScrollAdsConfig({ maxAdsPerSession: Number(e.target.value || 0) })}
                                />
                            </label>
                            <label className="rounded-lg border border-cyan-100 bg-white p-3">
                                <LabelWithGuide label="Daily Viewer Cap" help="Maximum /scroll ads shown to one device/viewer per day. Set 0 for no daily cap." />
                                <input
                                    type="number"
                                    min={0}
                                    max={500}
                                    className="w-full rounded border p-2"
                                    value={scrollAdsConfig.maxAdsPerViewerDay}
                                    onChange={(e) => updateScrollAdsConfig({ maxAdsPerViewerDay: Number(e.target.value || 0) })}
                                />
                            </label>
                            <label className="rounded-lg border border-cyan-100 bg-white p-3">
                                <LabelWithGuide label="Same Ad Cooldown" help="Minutes before the same ad can be shown again to the same device/viewer." />
                                <input
                                    type="number"
                                    min={0}
                                    max={1440}
                                    className="w-full rounded border p-2"
                                    value={scrollAdsConfig.perAdCooldownMinutes}
                                    onChange={(e) => updateScrollAdsConfig({ perAdCooldownMinutes: Number(e.target.value || 0) })}
                                />
                            </label>
                        </div>

                        <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-3">
                            <label className="rounded-lg border border-cyan-100 bg-white p-3">
                                <LabelWithGuide label="Pre-roll Weight" help="Relative pacing weight for Scroll pre-roll campaigns. Higher means more pre-roll ads in the rotation." />
                                <input
                                    type="number"
                                    min={0}
                                    max={10}
                                    className="w-full rounded border p-2"
                                    value={scrollAdsConfig.placementPacing.scroll_preroll}
                                    onChange={(e) => updateScrollAdPacing('scroll_preroll', Number(e.target.value || 0))}
                                />
                            </label>
                            <label className="rounded-lg border border-cyan-100 bg-white p-3">
                                <LabelWithGuide label="Feed Overlay Weight" help="Relative pacing weight for Scroll feed-overlay campaigns." />
                                <input
                                    type="number"
                                    min={0}
                                    max={10}
                                    className="w-full rounded border p-2"
                                    value={scrollAdsConfig.placementPacing.scroll_feed}
                                    onChange={(e) => updateScrollAdPacing('scroll_feed', Number(e.target.value || 0))}
                                />
                            </label>
                            <label className="flex min-h-[86px] items-center gap-3 rounded-lg border border-cyan-100 bg-white p-3">
                                <input
                                    type="checkbox"
                                    checked={scrollAdsConfig.fallbackToCommunityFeed !== false}
                                    onChange={(e) => updateScrollAdsConfig({ fallbackToCommunityFeed: e.target.checked })}
                                />
                                <span>
                                    <span className="block font-semibold text-gray-700">Fallback to community ads</span>
                                    <span className="text-gray-500">Use existing community feed campaigns when no /scroll campaigns are active.</span>
                                </span>
                            </label>
                        </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                        <div className="flex items-center gap-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Placement Pricing (CPM / CPC)</p>
                            <GuideTip text="Set the billing rate per placement. CPM is cost per 1,000 impressions, CPC is cost per click." />
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {[
                                { key: 'homepage', label: 'Homepage' },
                                { key: 'homepage_feed', label: 'Homepage Feed' },
                                { key: 'community_feed', label: 'Community Feed' },
                                { key: 'scroll_preroll', label: 'Scroll Pre-roll' },
                                { key: 'scroll_feed', label: 'Scroll Feed Overlay' },
                                { key: 'forum_listing', label: 'Forum Listing' },
                                { key: 'thread_detail', label: 'Thread Detail' },
                                { key: 'chat_sidebar', label: 'Chat Side Bar' }
                            ].map((placement) => (
                                <div key={placement.key} className="rounded-md border border-gray-200 p-2">
                                    <p className="mb-2 text-xs font-semibold text-gray-700">{placement.label}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <label className="text-[11px] text-gray-500">
                                            CPM
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                className="mt-1 w-full rounded border p-2 text-xs"
                                                value={adsConfig?.cpmByPlacement?.[placement.key] ?? 0}
                                                onChange={(e) =>
                                                    setAdsConfig((prev: any) => ({
                                                        ...prev,
                                                        cpmByPlacement: {
                                                            ...(prev?.cpmByPlacement || {}),
                                                            [placement.key]: Number(e.target.value || 0)
                                                        }
                                                    }))
                                                }
                                            />
                                        </label>
                                        <label className="text-[11px] text-gray-500">
                                            CPC
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                className="mt-1 w-full rounded border p-2 text-xs"
                                                value={adsConfig?.cpcByPlacement?.[placement.key] ?? 0}
                                                onChange={(e) =>
                                                    setAdsConfig((prev: any) => ({
                                                        ...prev,
                                                        cpcByPlacement: {
                                                            ...(prev?.cpcByPlacement || {}),
                                                            [placement.key]: Number(e.target.value || 0)
                                                        }
                                                    }))
                                                }
                                            />
                                        </label>
                                    </div>
                                </div>
                            ))}
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
                            <div key={ad.id} className="flex items-center justify-between gap-3 border rounded p-3">
                                <div>
                                    <div className="font-medium">{ad.title}</div>
                                    {ad.delivery?.summary ? (
                                        <div className={`mt-1 text-xs font-semibold ${ad.delivery.isServing ? 'text-emerald-700' : 'text-amber-700'}`}>
                                            Delivery: {ad.delivery.summary}
                                        </div>
                                    ) : null}
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
                            <AdminAdDeliveryStrip ad={c} />
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
                                        <option value="homepage">Homepage</option>
                                        <option value="homepage_feed">Homepage Feed</option>
                                        <option value="community_feed">Community Feed</option>
                                        <option value="scroll_preroll">Scroll Pre-roll</option>
                                        <option value="scroll_feed">Scroll Feed Overlay</option>
                                        <option value="forum_listing">Forum listing</option>
                                        <option value="thread_detail">Thread detail</option>
                                        <option value="chat_sidebar">Chat sidebar</option>
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

const ModerationQueue = ({ logs, refresh }: { logs: ModerationLog[], refresh: () => void }) => {
    const { showNotification } = useNotification();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'pending' | 'under_review' | 'action_taken' | 'no_violation' | 'all'>('pending');
    const [search, setSearch] = useState('');
    const [reports, setReports] = useState<CommunityPostReport[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedReport, setSelectedReport] = useState<CommunityPostReport | null>(null);
    const [replyMessage, setReplyMessage] = useState('');
    const [decision, setDecision] = useState<'violation' | 'no_violation'>('violation');
    const [decisionReason, setDecisionReason] = useState('');
    const [complainantMessage, setComplainantMessage] = useState('');
    const [ownerMessage, setOwnerMessage] = useState('');
    const [severity, setSeverity] = useState('medium');
    const [flagPost, setFlagPost] = useState(true);
    const [removePost, setRemovePost] = useState(false);
    const [warnAccount, setWarnAccount] = useState(true);
    const [sanctionAccount, setSanctionAccount] = useState(false);
    const [banAccount, setBanAccount] = useState(false);
    const [restrictPostingHours, setRestrictPostingHours] = useState(0);
    const [restrictedFeaturesInput, setRestrictedFeaturesInput] = useState('');
    const [restrictFeaturesHours, setRestrictFeaturesHours] = useState(0);

    const loadReports = useCallback(async () => {
        setLoading(true);
        try {
            const response = await CommunityService.getPostReports({
                status: statusFilter,
                search: search || undefined,
                limit: 50
            });
            const items = Array.isArray(response?.items) ? (response.items as CommunityPostReport[]) : [];
            setReports(items);
            setPendingCount(Number(response?.pendingCount || 0));
            if (items.length === 0) {
                setSelectedId(null);
                setSelectedReport(null);
                return;
            }
            if (!selectedId || !items.some((entry) => entry.id === selectedId)) {
                setSelectedId(items[0].id);
            }
        } catch (error) {
            console.error('Failed to load post reports:', error);
            showNotification('error', 'Moderation', 'Failed to load post reports.');
        } finally {
            setLoading(false);
        }
    }, [search, selectedId, showNotification, statusFilter]);

    const loadReportDetail = useCallback(async (reportId: string) => {
        try {
            const data = await CommunityService.getPostReportById(reportId);
            const resolved = (data || null) as CommunityPostReport | null;
            setSelectedReport(resolved);
            if (resolved) {
                const normalizedStatus = String(resolved.status || '').toLowerCase();
                const nextDecision =
                    resolved.adminDecision === 'violation'
                        ? 'violation'
                        : resolved.adminDecision === 'no_violation'
                            ? 'no_violation'
                            : normalizedStatus === 'no_violation'
                                ? 'no_violation'
                                : 'violation';
                setDecision(nextDecision);
                setDecisionReason(resolved.actionSummary || '');
                setComplainantMessage(resolved.reporterReply || '');
                setSeverity(resolved.severity || 'medium');
                setWarnAccount(true);
                setSanctionAccount(false);
                setBanAccount(false);
                setRestrictPostingHours(0);
                setRestrictedFeaturesInput('');
                setRestrictFeaturesHours(0);
                setFlagPost(true);
                setRemovePost(false);
            }
        } catch (error) {
            console.error('Failed to load post report detail:', error);
            showNotification('error', 'Moderation', 'Failed to load report detail.');
        }
    }, [showNotification]);

    useEffect(() => {
        void loadReports();
    }, [loadReports]);

    useEffect(() => {
        if (!selectedId) {
            setSelectedReport(null);
            return;
        }
        void loadReportDetail(selectedId);
    }, [loadReportDetail, selectedId]);

    useEffect(() => {
        const onRealtimeUpdate = () => {
            void loadReports();
            if (selectedId) void loadReportDetail(selectedId);
        };
        window.addEventListener('community:post_report_submitted', onRealtimeUpdate as EventListener);
        window.addEventListener('community:post_report_updated', onRealtimeUpdate as EventListener);
        return () => {
            window.removeEventListener('community:post_report_submitted', onRealtimeUpdate as EventListener);
            window.removeEventListener('community:post_report_updated', onRealtimeUpdate as EventListener);
        };
    }, [loadReportDetail, loadReports, selectedId]);

    const handleReply = async () => {
        if (!selectedId || !replyMessage.trim()) return;
        setSaving(true);
        try {
            await CommunityService.replyToPostReport(selectedId, replyMessage.trim());
            showNotification('success', 'Moderation', 'Reply sent to complainant.');
            setReplyMessage('');
            await Promise.all([loadReports(), loadReportDetail(selectedId)]);
            refresh();
        } catch (error) {
            console.error('Failed to reply to post report:', error);
            showNotification('error', 'Moderation', 'Failed to send reply.');
        } finally {
            setSaving(false);
        }
    };

    const handleResolve = async () => {
        if (!selectedId) return;
        setSaving(true);
        try {
            const restrictedFeatures = restrictedFeaturesInput
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean);

            await CommunityService.resolvePostReport(selectedId, {
                decision,
                reason: decisionReason || undefined,
                complainantMessage: complainantMessage || undefined,
                ownerMessage: ownerMessage || undefined,
                severity,
                actions: decision === 'violation'
                    ? {
                        flagPost,
                        removePost,
                        warnAccount,
                        sanctionAccount,
                        banAccount,
                        restrictPostingHours: Math.max(0, Number(restrictPostingHours || 0)),
                        restrictedFeatures,
                        restrictFeaturesHours: Math.max(0, Number(restrictFeaturesHours || 0))
                    }
                    : {}
            });

            showNotification('success', 'Moderation', decision === 'violation' ? 'Action applied successfully.' : 'Report closed as no violation.');
            await Promise.all([loadReports(), loadReportDetail(selectedId)]);
            refresh();
        } catch (error) {
            console.error('Failed to resolve post report:', error);
            showNotification('error', 'Moderation', 'Failed to apply moderation decision.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex flex-wrap gap-3 items-center justify-between">
                    <div>
                        <h3 className="font-bold text-gray-800">Report Post Management</h3>
                        <p className="text-xs text-gray-500">Review reports, respond to complainants, and enforce moderation actions.</p>
                    </div>
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-bold">{pendingCount} Pending</span>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                        <option value="pending">Pending</option>
                        <option value="under_review">Under Review</option>
                        <option value="action_taken">Action Taken</option>
                        <option value="no_violation">No Violation</option>
                        <option value="all">All</option>
                    </select>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search reason/user/post..."
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2"
                    />
                    <button
                        onClick={() => void loadReports()}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                        Refresh Queue
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 text-sm font-semibold text-gray-700">Reported Posts</div>
                    <div className="max-h-[560px] overflow-auto divide-y">
                        {loading ? (
                            <div className="p-6 text-center text-gray-500 text-sm">Loading reports...</div>
                        ) : reports.length === 0 ? (
                            <div className="p-6 text-center text-gray-500 text-sm">No post reports found for the selected filter.</div>
                        ) : reports.map((report) => {
                            const active = selectedId === report.id;
                            const level = String(report.severity || 'medium').toLowerCase();
                            const levelClass =
                                level === 'critical' || level === 'high'
                                    ? 'bg-red-100 text-red-700'
                                    : level === 'low'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-yellow-100 text-yellow-700';
                            return (
                                <button
                                    key={report.id}
                                    onClick={() => setSelectedId(report.id)}
                                    className={`w-full text-left p-4 hover:bg-gray-50 ${active ? 'bg-blue-50/60' : ''}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="font-semibold text-gray-900 text-sm truncate">
                                            {report.reason || 'Post report'}
                                        </div>
                                        <span className={`text-[11px] px-2 py-0.5 rounded font-semibold uppercase ${levelClass}`}>
                                            {report.severity || 'medium'}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        Reporter: {report.reporter?.name || report.reporter?.username || report.reporter?.email || report.reporterId}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1 truncate">{report.snippet || report.post?.contentSnippet || '-'}</div>
                                    <div className="text-[11px] text-gray-400 mt-2">
                                        Status: {report.status} • {report.createdAt ? new Date(report.createdAt as any).toLocaleString() : 'N/A'}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
                    {!selectedReport ? (
                        <div className="p-10 text-center text-gray-500 text-sm">Select a report to review details and apply moderation actions.</div>
                    ) : (
                        <>
                            <div>
                                <h4 className="font-semibold text-gray-900">Report Detail</h4>
                                <p className="text-xs text-gray-500 mt-1">ID: {selectedReport.id}</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                <div className="rounded-lg border border-gray-200 p-3">
                                    <div className="text-xs uppercase tracking-wide text-gray-500">Complainant</div>
                                    <div className="font-medium text-gray-900">{selectedReport.reporter?.name || selectedReport.reporter?.username || selectedReport.reporter?.email || selectedReport.reporterId}</div>
                                </div>
                                <div className="rounded-lg border border-gray-200 p-3">
                                    <div className="text-xs uppercase tracking-wide text-gray-500">Post Owner</div>
                                    <div className="font-medium text-gray-900">{selectedReport.postOwner?.name || selectedReport.postOwner?.username || selectedReport.postOwner?.email || selectedReport.postOwnerId}</div>
                                </div>
                            </div>

                            <div className="rounded-lg border border-gray-200 p-3 text-sm">
                                <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Reported Reason</div>
                                <p className="text-gray-900">{selectedReport.reason || 'No explicit reason provided.'}</p>
                                {selectedReport.details ? <p className="text-gray-600 mt-2 whitespace-pre-wrap">{selectedReport.details}</p> : null}
                            </div>

                            <div className="rounded-lg border border-gray-200 p-3 text-sm">
                                <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Post Snippet</div>
                                <p className="text-gray-700">{selectedReport.post?.title || selectedReport.snippet || selectedReport.post?.contentSnippet || '-'}</p>
                            </div>

                            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                                <label className="text-xs uppercase tracking-wide text-gray-500">Reply to Complainant</label>
                                <textarea
                                    value={replyMessage}
                                    onChange={(e) => setReplyMessage(e.target.value)}
                                    rows={3}
                                    placeholder="Send update to the user who reported..."
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                />
                                <button
                                    onClick={() => void handleReply()}
                                    disabled={saving || !replyMessage.trim()}
                                    className="rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 px-3 py-2 text-xs font-semibold disabled:opacity-50"
                                >
                                    Send Reply
                                </button>
                            </div>

                            <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label className="text-xs uppercase tracking-wide text-gray-500">Decision</label>
                                        <select
                                            value={decision}
                                            onChange={(e) => setDecision(e.target.value as any)}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mt-1"
                                        >
                                            <option value="violation">Violation Confirmed</option>
                                            <option value="no_violation">No Violation</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs uppercase tracking-wide text-gray-500">Severity</label>
                                        <select
                                            value={severity}
                                            onChange={(e) => setSeverity(e.target.value)}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mt-1"
                                        >
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                            <option value="critical">Critical</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs uppercase tracking-wide text-gray-500">Restrict Posting (hours)</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={restrictPostingHours}
                                            onChange={(e) => setRestrictPostingHours(Number(e.target.value || 0))}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mt-1"
                                        />
                                    </div>
                                </div>

                                {decision === 'violation' ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                        <label className="flex items-center gap-2"><input type="checkbox" checked={flagPost} onChange={(e) => setFlagPost(e.target.checked)} /> Flag Post</label>
                                        <label className="flex items-center gap-2"><input type="checkbox" checked={removePost} onChange={(e) => setRemovePost(e.target.checked)} /> Remove Post</label>
                                        <label className="flex items-center gap-2"><input type="checkbox" checked={warnAccount} onChange={(e) => setWarnAccount(e.target.checked)} /> Warning</label>
                                        <label className="flex items-center gap-2"><input type="checkbox" checked={sanctionAccount} onChange={(e) => setSanctionAccount(e.target.checked)} /> Strike Account</label>
                                        <label className="flex items-center gap-2"><input type="checkbox" checked={banAccount} onChange={(e) => setBanAccount(e.target.checked)} /> Ban Account</label>
                                    </div>
                                ) : null}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs uppercase tracking-wide text-gray-500">Restricted Features (comma separated)</label>
                                        <input
                                            value={restrictedFeaturesInput}
                                            onChange={(e) => setRestrictedFeaturesInput(e.target.value)}
                                            placeholder="posting, commenting, messaging"
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mt-1"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs uppercase tracking-wide text-gray-500">Feature Restriction (hours)</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={restrictFeaturesHours}
                                            onChange={(e) => setRestrictFeaturesHours(Number(e.target.value || 0))}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mt-1"
                                        />
                                    </div>
                                </div>

                                <textarea
                                    value={decisionReason}
                                    onChange={(e) => setDecisionReason(e.target.value)}
                                    rows={2}
                                    placeholder="Decision reason (internal + user-facing context)"
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                />
                                <textarea
                                    value={complainantMessage}
                                    onChange={(e) => setComplainantMessage(e.target.value)}
                                    rows={2}
                                    placeholder="Message to complainant (optional override)"
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                />
                                <textarea
                                    value={ownerMessage}
                                    onChange={(e) => setOwnerMessage(e.target.value)}
                                    rows={2}
                                    placeholder="Message to post owner (sent only when violation action is taken)"
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                />

                                <button
                                    onClick={() => void handleResolve()}
                                    disabled={saving}
                                    className="w-full rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                                >
                                    {saving ? 'Applying...' : 'Apply Decision'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {reports.length === 0 && logs.length > 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                        <h4 className="font-semibold text-gray-800 text-sm">Legacy Moderation Feed</h4>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="px-4 py-2">User</th>
                                <th className="px-4 py-2">Reason</th>
                                <th className="px-4 py-2">Snippet</th>
                                <th className="px-4 py-2">Risk</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {logs.map((log) => (
                                <tr key={log.id}>
                                    <td className="px-4 py-2">{log.userName || (log as any).user_name}</td>
                                    <td className="px-4 py-2">{log.reason}</td>
                                    <td className="px-4 py-2 text-gray-500">{log.snippet}</td>
                                    <td className="px-4 py-2">{log.riskLevel || (log as any).risk_level}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}
        </div>
    );
};

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



