import React, { Suspense, useMemo, useState, useEffect, useRef } from 'react';
import {
    Home, ShoppingBag, DollarSign, CreditCard, LayoutTemplate, BookOpen, Megaphone, Users, HardDrive, Shield, ShieldAlert, ShieldCheck, FileText, LifeBuoy, Settings, Menu, X, Bell, LogOut, User, MessageSquare, Brain, PieChart, Clock, MessageCircle, Navigation, BarChart2, Globe, ExternalLink, RotateCcw, Sparkles, Bot, Smartphone, Activity, Compass, CheckCircle2, Briefcase
} from 'lucide-react';
import { useNotification } from "../context/NotificationContext";
import { useUser } from "../context/UserContext";
import RealtimeProvider from './shared/RealtimeProvider';
import { useSearchParams } from 'react-router-dom';
import { SupportService } from '../services/support'; 
import { AdminService } from '../services/admin';

import { useT } from '../i18n/useT';
import {
    getNotificationActionUrl,
    getNotificationBucket,
    isLoginApprovalNotification,
    openLoginApprovalNotification
} from '../utils/notificationRouting';

const Overview = React.lazy(() => import('./admin/Overview'));
const ListingsManagementTab = React.lazy(() => import('./admin/GigsJobs'));
const FinancialsTab = React.lazy(() => import('./admin/FinancePayouts'));
const GatewaysTab = React.lazy(() => import('./admin/PaymentGateways'));
const CMSPages = React.lazy(() => import('./admin/CMSPages'));
const HomepageSettings = React.lazy(() => import('./admin/HomepageSettings'));
const BlogManagement = React.lazy(() => import('./admin/Blog'));
const MarketingTab = React.lazy(() => import('./admin/Marketing'));
const UsersManagementTab = React.lazy(() => import('./admin/Users'));
const UploadedFilesTab = React.lazy(() => import('./admin/UploadedFiles'));
const StaffManagementTab = React.lazy(() => import('./admin/StaffManagement'));
const AccessControlCenterTab = React.lazy(() => import('./admin/AccessControlCenter'));
const RoleManagementTab = React.lazy(() => import('./admin/RoleManagement'));
const PolicyCenterTab = React.lazy(() => import('./admin/PolicyCenter'));
const ApprovalPoliciesTab = React.lazy(() => import('./admin/ApprovalPolicies'));
const AuditLogsTab = React.lazy(() => import('./admin/AuditLogs'));
const SecurityAlertsTab = React.lazy(() => import('./admin/SecurityAlerts'));
const DeviceLoginSecurityTab = React.lazy(() => import('./admin/DeviceLoginSecurity'));
const ProcurementCenterTab = React.lazy(() => import('./admin/ProcurementCenter'));
const ComplianceCenterTab = React.lazy(() => import('./admin/ComplianceCenter'));
const TalentCloudCenterTab = React.lazy(() => import('./admin/TalentCloudCenter'));
const ScrolithaManagedCenterTab = React.lazy(() => import('./admin/ScrolithaManagedCenter'));
const FeatureControlCenterTab = React.lazy(() => import('./admin/FeatureControlCenter'));
const DiscoveryStudioTab = React.lazy(() => import('./admin/DiscoveryStudio'));
const NotificationJourneyCenterTab = React.lazy(() => import('./admin/NotificationJourneyCenter'));
const NotificationOperationsCenterTab = React.lazy(() => import('./admin/NotificationOperationsCenter'));
const ModerationTrustCenterTab = React.lazy(() => import('./admin/ModerationTrustCenter'));
const ConfigRollbackTab = React.lazy(() => import('./admin/ConfigRollback'));
const RealtimeOpsCenterTab = React.lazy(() => import('./admin/RealtimeOpsCenter'));
const ModeratorConsole = React.lazy(() => import('./admin/ModeratorConsole'));
const MessageRecords = React.lazy(() => import('./admin/MessageRecords'));
const MessagingGroupsAdmin = React.lazy(() => import('./admin/MessagingGroupsAdmin'));
const KYCTab = React.lazy(() => import('./admin/KYCVerification'));
const SupportDisputes = React.lazy(() => import('./admin/SupportDisputes'));
const SystemSettings = React.lazy(() => import('./admin/SystemSettings'));
const Profile = React.lazy(() => import('./admin/Profile'));
const Languages = React.lazy(() => import('./admin/Languages'));
const AdminMessages = React.lazy(() => import('./admin/Messages'));
const AIIntelligence = React.lazy(() => import('./admin/AIIntelligence'));
const MarketplaceAnalytics = React.lazy(() => import('./admin/MarketplaceAnalytics'));
const MarketplaceManagement = React.lazy(() => import('./admin/MarketplaceManagement'));
const ATMTrackerModule = React.lazy(() => import('./admin/ATMTrackerModule'));
const CommunityManagement = React.lazy(() => import('./admin/CommunityManagement'));
const NavigationManager = React.lazy(() => import('./admin/NavigationManager'));
const MarketIntelligence = React.lazy(() => import('./admin/MarketIntelligence'));
const InsightsGrowth = React.lazy(() => import('./admin/InsightsGrowth'));
const AdminReviews = React.lazy(() => import('./admin/Reviews'));
const CommerceEngagement = React.lazy(() => import('./admin/CommerceEngagement'));
const FormBuilder = React.lazy(() => import('./admin/FormBuilder'));
const GoogleSettings = React.lazy(() => import('./admin/GoogleSettings'));
const MonetizationManagement = React.lazy(() => import('./admin/MonetizationManagement'));
const RecommendationManagement = React.lazy(() => import('./admin/RecommendationManagement'));
const HiringRecommendationsManagement = React.lazy(() => import('./admin/HiringRecommendationsManagement'));
const ScrolithMatchManagement = React.lazy(() => import('./admin/ScrolithMatchManagement'));
const ScrolithaManagement = React.lazy(() => import('./admin/ScrolithaManagement'));
const ScrolithaAIFoundation = React.lazy(() => import('./admin/ScrolithaAIFoundation'));
const AppManagement = React.lazy(() => import('./admin/AppManagement'));
const MobileHomepage = React.lazy(() => import('./admin/MobileHomepage'));
const SystemBackup = React.lazy(() => import('./admin/SystemBackup'));
const AdminDeveloperPlatform = React.lazy(() => import('../pages/AdminDeveloperPlatform'));
const AdminLivePlatform = React.lazy(() => import('../pages/AdminLivePlatform'));
const ScrollAdminPanel = React.lazy(() => import('../features/scroll/ScrollAdminPanel'));

// Define valid tab types
type Tab = 'overview' | 'analytics' | 'market-intelligence' | 'insights-growth' | 'listings' | 'marketplace' | 'engagement' | 'finance' | 'gateways' | 'cms' | 'homepage' | 'mobile-homepage' | 'blog' | 'scroll' | 'live' | 'marketing' | 'users' | 'monetization' | 'files' | 'staff' | 'access-control' | 'role-management' | 'policy-center' | 'approval-policies' | 'audit-logs' | 'security-alerts' | 'device-login-security' | 'procurement' | 'compliance' | 'private-talent-cloud' | 'integrations' | 'scrolitha-controls' | 'managed-delivery' | 'feature-control' | 'discovery-studio' | 'journey-center' | 'notification-ops' | 'moderation-trust' | 'config-rollback' | 'realtime-ops' | 'moderator-console' | 'message-records' | 'messaging-groups' | 'kyc' | 'support' | 'system' | 'profile' | 'messages' | 'ai' | 'atm' | 'community' | 'groups' | 'recommendations' | 'hiring-recommendations' | 'scrolith-match' | 'navigation' | 'reviews' | 'languages' | 'forms' | 'google-settings' | 'scrolitha' | 'scrolitha-ai' | 'apps' | 'developer-platform' | 'system-backup';

// Define navigation item interface
interface NavItem {
    id: Tab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
    title: string;
    items: NavItem[];
}

const AdminTabLoader = () => (
    <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Loading module...
    </div>
);

const AdminDashboard: React.FC = () => {
    const t = useT();
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const [unreadSupportCount, setUnreadSupportCount] = useState(0); 
    const { showNotification, notifications, markAsRead } = useNotification();
    const { user, logout } = useUser();
    const [searchParams] = useSearchParams();
    const [showAdminNotifications, setShowAdminNotifications] = useState(false);
    const [adminNotificationTab, setAdminNotificationTab] = useState<'home' | 'community'>('home');
    const [isClearingCache, setIsClearingCache] = useState(false);
    const adminNotifRef = useRef<HTMLDivElement>(null);
    const unreadNotificationCount = notifications.filter(n => !n.isRead).length;

    const adminNotificationBuckets = useMemo(() => {
        const home: any[] = [];
        const community: any[] = [];
        (Array.isArray(notifications) ? notifications : []).forEach((n) => {
            (getNotificationBucket(n) === 'community' ? community : home).push(n);
        });
        return { home, community };
    }, [notifications]);

    const adminUnreadCounts = useMemo(() => {
        const countUnread = (rows: any[]) => rows.filter((n) => !Boolean(n?.isRead ?? n?.is_read)).length;
        return {
            home: countUnread(adminNotificationBuckets.home),
            community: countUnread(adminNotificationBuckets.community)
        };
    }, [adminNotificationBuckets]);

    const visibleAdminNotifications =
        adminNotificationTab === 'community' ? adminNotificationBuckets.community : adminNotificationBuckets.home;

    useEffect(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam && isValidTab(tabParam)) {
            setActiveTab(tabParam as Tab);
        }
    }, [searchParams]);

    // Cross-module navigation (Users → KYC, etc.) without full page reload.
    useEffect(() => {
        const onAdminNavigate = (event: Event) => {
            const detail = (event as CustomEvent)?.detail || {};
            const tab = String(detail?.tab || '').trim();
            if (tab && isValidTab(tab)) {
                setActiveTab(tab as Tab);
                setSidebarOpen(false);
                try {
                    const url = new URL(window.location.href);
                    url.searchParams.set('tab', tab);
                    if (detail?.userId) url.searchParams.set('userId', String(detail.userId));
                    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
                } catch {
                    // ignore history failures
                }
            }
        };
        window.addEventListener('scrolith:admin-navigate', onAdminNavigate as EventListener);
        return () => window.removeEventListener('scrolith:admin-navigate', onAdminNavigate as EventListener);
    }, []);

    // Helper function to validate tab
    const isValidTab = (tab: string): tab is Tab => {
        const validTabs: Tab[] = [
            'overview', 'analytics', 'listings', 'marketplace', 'engagement', 'finance', 'gateways', 'cms', 
            'homepage', 'mobile-homepage', 'blog', 'scroll', 'live', 'marketing', 'users', 'monetization', 'files', 'staff', 'access-control', 'role-management', 'policy-center', 'approval-policies', 'audit-logs', 'security-alerts', 'device-login-security', 'feature-control', 'discovery-studio', 'journey-center', 'moderation-trust', 'config-rollback', 'realtime-ops', 'moderator-console', 'message-records', 'messaging-groups', 'kyc',
            'procurement', 'compliance', 'private-talent-cloud', 'integrations', 'scrolitha-controls', 'managed-delivery',
            'support', 'system', 'profile', 'messages', 'ai', 'atm', 'insights-growth', 'community', 'groups', 'recommendations', 'hiring-recommendations', 'scrolith-match', 'navigation', 'reviews', 'languages', 'forms', 'google-settings', 'scrolitha', 'apps', 'developer-platform', 'system-backup'
        ];
        return validTabs.includes(tab as Tab);
    };

    // Poll for unread support tickets
    useEffect(() => {
        const checkUnreadTickets = async () => {
            try {
                const tickets = await SupportService.getAllTickets();
                const unread = tickets.filter(t => !t.is_read_by_admin).length;                                               
                setUnreadSupportCount(unread);
            } catch (e) {
                console.error("Failed to fetch ticket stats", e);
                setUnreadSupportCount(0);
            }
        };

        checkUnreadTickets();
        const interval = setInterval(checkUnreadTickets, 30000); // Check every 30 seconds
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (adminNotifRef.current && !adminNotifRef.current.contains(event.target as Node)) {
                setShowAdminNotifications(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = () => {
        logout();
        showNotification('success', 'Logged Out', 'You have been successfully logged out');
    };

    const handleNotificationClick = (notif: any) => {
        const id = String(notif?.id || '');
        if (id) markAsRead(id);
        setShowAdminNotifications(false);
        const metadata =
            notif?.metadata && typeof notif.metadata === 'object'
                ? (notif.metadata as Record<string, any>)
                : {};
        const campaignId = String(metadata?.campaignId || metadata?.campaign_id || '');
        const type = String(notif?.type || notif?.notificationType || '').toLowerCase();
        if (isLoginApprovalNotification(notif)) {
            openLoginApprovalNotification(notif);
            return;
        }
        if (type === 'app_campaign' && campaignId) {
            window.location.href = `/admin/dashboard?tab=apps&campaignId=${encodeURIComponent(campaignId)}`;
            return;
        }
        const actionUrl = getNotificationActionUrl(notif);
        if (actionUrl) window.location.href = actionUrl;
    };

    const clearBrowserCachePreservingSession = async () => {
        const localKeysToKeep = ['token', 'user'];
        const sessionKeysToKeep = ['token', 'user'];

        const preservedLocal = new Map<string, string>();
        const preservedSession = new Map<string, string>();

        for (const key of localKeysToKeep) {
            const value = localStorage.getItem(key);
            if (value !== null) preservedLocal.set(key, value);
        }

        for (const key of sessionKeysToKeep) {
            const value = sessionStorage.getItem(key);
            if (value !== null) preservedSession.set(key, value);
        }

        try {
            localStorage.clear();
            preservedLocal.forEach((value, key) => localStorage.setItem(key, value));
        } catch {
            // ignore storage clear issues in private mode / sandboxed browsers
        }

        try {
            sessionStorage.clear();
            preservedSession.forEach((value, key) => sessionStorage.setItem(key, value));
        } catch {
            // ignore storage clear issues in private mode / sandboxed browsers
        }

        if ('caches' in window) {
            try {
                const keys = await window.caches.keys();
                await Promise.all(keys.map((key) => window.caches.delete(key)));
            } catch {
                // ignore Cache Storage API failures
            }
        }
    };

    const handleBrowseWebsite = () => {
        window.location.href = '/';
    };

    const handleClearCache = async () => {
        if (isClearingCache) return;
        setIsClearingCache(true);
        try {
            const result = await AdminService.clearRuntimeCache();
            await clearBrowserCachePreservingSession();
            const cleared = Array.isArray(result?.cleared) ? result.cleared.join(', ') : 'runtime cache';
            showNotification('success', 'Cache Cleared', `Successfully cleared: ${cleared}`);
            window.location.reload();
        } catch (error: any) {
            const message =
                error?.response?.data?.error ||
                error?.response?.data?.message ||
                error?.message ||
                'Failed to clear cache';
            showNotification('error', 'Cache Clear Failed', message);
        } finally {
            setIsClearingCache(false);
        }
    };

    // Strict Navigation Structure
    const navStructure: NavGroup[] = [
        { 
            title: t('dashboard.admin.nav.main', 'Main'), 
            items: [
                { id: 'overview', label: t('dashboard.admin.nav.overview', 'Overview'), icon: Home },
                { id: 'analytics', label: t('dashboard.admin.nav.market_intelligence', 'Market Intelligence'), icon: PieChart },
                { id: 'messages', label: t('dashboard.admin.nav.messages', 'Messages'), icon: MessageSquare },
                { id: 'messaging-groups', label: 'Messaging Groups', icon: Users }
            ] 
        },
        { 
            title: t('dashboard.admin.nav.intelligence', 'Intelligence'), 
            items: [
                { id: 'ai', label: t('dashboard.admin.nav.ai_intelligence', 'AI Intelligence'), icon: Brain },
                { id: 'atm', label: t('dashboard.admin.nav.atm', 'ATM Time Tracker'), icon: Clock },
                { id: 'scrolitha', label: t('dashboard.admin.nav.scrolitha', 'Scrolitha'), icon: Bot },
                { id: 'scrolitha-ai', label: 'Scrolitha AI', icon: Bot },
                { id: 'insights-growth', label: 'Insights & Growth', icon: BarChart2 }
                , { id: 'market-intelligence', label: t('dashboard.admin.nav.market_intelligence', 'Market Intelligence'), icon: BarChart2 }
            ]
        },
        {
            title: 'Marketplace',
            items: [
                { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag }
            ]
        },
        { 
            title: t('dashboard.admin.nav.commerce', 'Commerce'), 
            items: [
                { id: 'listings', label: t('dashboard.admin.nav.gigs_jobs', 'Gigs & Jobs'), icon: ShoppingBag },
                { id: 'engagement', label: t('dashboard.admin.nav.favorites_carts', 'Favorites & Carts'), icon: ShoppingBag },
                { id: 'forms', label: t('dashboard.admin.nav.form_builder', 'Form Builder'), icon: LayoutTemplate }
            ] 
        },
        { 
            title: 'Finance', 
            items: [
                { id: 'finance', label: 'Finance & Payouts', icon: DollarSign },
                { id: 'gateways', label: 'Payment Gateways', icon: CreditCard },
                { id: 'procurement', label: 'Procurement', icon: FileText }
            ] 
        },
        {
            title: 'Enterprise',
            items: [
                { id: 'compliance', label: 'Compliance', icon: ShieldAlert },
                { id: 'private-talent-cloud', label: 'Private Talent Cloud', icon: Users },
                { id: 'integrations', label: 'Integrations', icon: Globe },
                { id: 'scrolitha-controls', label: 'Scrolitha Controls', icon: Bot },
                { id: 'managed-delivery', label: 'Managed Delivery', icon: Activity }
            ]
        },
        { 
            title: 'Content', 
            items: [
                { id: 'cms', label: 'CMS & Pages', icon: LayoutTemplate }, 
                { id: 'homepage', label: 'Homepage Settings', icon: LayoutTemplate },
                { id: 'mobile-homepage', label: 'Mobile Homepage', icon: Smartphone },
                { id: 'blog', label: 'Blog', icon: BookOpen },
                { id: 'scroll', label: 'Scroll Management', icon: Sparkles },
                { id: 'live', label: 'Live Streaming', icon: Sparkles }
            ] 
        },
        { 
            title: 'Community', 
            items: [
                { id: 'community', label: 'Community & Forum', icon: MessageCircle },
                { id: 'discovery-studio', label: 'Discovery Studio', icon: Compass },
                { id: 'recommendations', label: 'Recommendations', icon: Sparkles },
                { id: 'hiring-recommendations', label: 'Hiring Recommendations', icon: Briefcase },
                { id: 'scrolith-match', label: 'Scrolith Match', icon: Users },
                { id: 'reviews', label: 'Reviews', icon: FileText }
            ] 
        },
        { 
            title: 'Marketing', 
            items: [{ id: 'marketing', label: 'Marketing & Affiliates', icon: Megaphone }] 
        },
        { 
            title: 'Users', 
            items: [
                { id: 'users', label: 'Users & Subscribers', icon: Users }, 
                { id: 'monetization', label: 'Monetization', icon: DollarSign },
                { id: 'files', label: 'Uploaded Files', icon: HardDrive }
            ] 
        },
        { 
            title: 'Staff Management', 
            items: [
                { id: 'staff', label: 'Staff & Permissions', icon: Shield },
                { id: 'access-control', label: 'Access Control', icon: Shield },
                { id: 'role-management', label: 'Role Management', icon: Shield },
                { id: 'policy-center', label: 'Policy Center', icon: Shield },
                { id: 'approval-policies', label: 'Approval Policies', icon: CheckCircle2 },
                { id: 'audit-logs', label: 'Audit Logs', icon: Activity },
                { id: 'security-alerts', label: 'Security Alerts', icon: ShieldAlert },
                { id: 'device-login-security', label: 'Device Login Security', icon: ShieldCheck },
                { id: 'feature-control', label: 'Feature Control', icon: Shield },
                { id: 'moderation-trust', label: 'Moderation & Trust', icon: ShieldAlert },
                { id: 'config-rollback', label: 'Config & Rollback', icon: RotateCcw },
                { id: 'realtime-ops', label: 'Realtime Ops', icon: Activity },
                { id: 'journey-center', label: 'Journeys', icon: Bell },
                { id: 'notification-ops', label: 'Notification Ops', icon: Activity },
                { id: 'moderator-console', label: 'Moderator Console', icon: MessageSquare },
                { id: 'message-records', label: 'Message Records', icon: FileText },
                { id: 'messaging-groups', label: 'Messaging Groups Admin', icon: Users }
            ] 
        },
        { 
            title: 'KYC Verification', 
            items: [{ id: 'kyc', label: 'KYC Management', icon: FileText }] 
        },
        { 
            title: 'Support', 
            items: [{ id: 'support', label: 'Support & Disputes', icon: LifeBuoy }] 
        },
        { 
            title: 'System', 
            items: [
                { id: 'apps', label: 'App Management', icon: Smartphone },
                { id: 'developer-platform', label: 'Developer Platform', icon: ExternalLink },
                { id: 'system-backup', label: 'System Backup', icon: HardDrive },
                { id: 'navigation', label: 'Nav & Activity', icon: Navigation },
                { id: 'system', label: 'System Settings', icon: Settings }
            ] 
        },
        {
            title: 'Setup & Configurations',
            items: [
                { id: 'languages', label: 'Languages', icon: Globe },
                { id: 'google-settings', label: 'Google Settings', icon: Settings }
            ]
        },
        { 
            title: 'Profile', 
            items: [{ id: 'profile', label: 'Admin Profile', icon: User }] 
        }
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'overview': return <Overview />;
            case 'analytics': return <MarketplaceAnalytics />;
            case 'messages': return <AdminMessages />;
            case 'messaging-groups': return <MessagingGroupsAdmin />;
            case 'ai': return <AIIntelligence />;
            case 'atm': return <ATMTrackerModule />;
            case 'scrolitha': return <ScrolithaManagement />;
            case 'scrolitha-ai': return <ScrolithaAIFoundation />;
            case 'insights-growth': return <InsightsGrowth />;
            case 'market-intelligence': return <MarketIntelligence />;
            case 'listings': return <ListingsManagementTab />;
            case 'marketplace': return <MarketplaceManagement />;
            case 'engagement': return <CommerceEngagement />;
            case 'finance': return <FinancialsTab />;
            case 'gateways': return <GatewaysTab />;
            case 'cms': return <CMSPages />;
            case 'homepage': return <HomepageSettings />;
            case 'mobile-homepage': return <MobileHomepage />;
            case 'blog': return <BlogManagement />;
            case 'scroll': return <ScrollAdminPanel />;
            case 'live': return <AdminLivePlatform />;
            case 'community': return <CommunityManagement />;
            case 'groups': return <CommunityManagement initialTab="groups" />;
            case 'recommendations': return <RecommendationManagement />;
            case 'hiring-recommendations': return <HiringRecommendationsManagement />;
            case 'scrolith-match': return <ScrolithMatchManagement />;
            case 'reviews': return <AdminReviews />;
            case 'marketing': return <MarketingTab />;
            case 'users': return <UsersManagementTab />;
            case 'monetization': return <MonetizationManagement />;
            case 'files': return <UploadedFilesTab />;
            case 'staff': return <StaffManagementTab />;
            case 'access-control': return <AccessControlCenterTab />;
            case 'role-management': return <RoleManagementTab />;
            case 'policy-center': return <PolicyCenterTab />;
            case 'approval-policies': return <ApprovalPoliciesTab />;
            case 'audit-logs': return <AuditLogsTab />;
            case 'security-alerts': return <SecurityAlertsTab />;
            case 'device-login-security': return <DeviceLoginSecurityTab />;
            case 'procurement': return <ProcurementCenterTab />;
            case 'compliance': return <ComplianceCenterTab />;
            case 'private-talent-cloud': return <TalentCloudCenterTab initialSection="talent" />;
            case 'integrations': return <TalentCloudCenterTab initialSection="integrations" />;
            case 'scrolitha-controls': return <ScrolithaManagedCenterTab initialSection="scrolitha" />;
            case 'managed-delivery': return <ScrolithaManagedCenterTab initialSection="managed-delivery" />;
            case 'feature-control': return <FeatureControlCenterTab />;
            case 'discovery-studio': return <DiscoveryStudioTab />;
            case 'journey-center': return <NotificationJourneyCenterTab />;
            case 'notification-ops': return <NotificationOperationsCenterTab />;
            case 'moderation-trust': return <ModerationTrustCenterTab />;
            case 'config-rollback': return <ConfigRollbackTab />;
            case 'realtime-ops': return <RealtimeOpsCenterTab />;
            case 'moderator-console': return <ModeratorConsole />;
            case 'message-records': return <MessageRecords />;
            case 'kyc': return <KYCTab />;
            case 'support': return <SupportDisputes />;
            case 'navigation': return <NavigationManager />;
            case 'system': return <SystemSettings />;
            case 'apps': return <AppManagement />;
            case 'developer-platform': return <AdminDeveloperPlatform />;
            case 'system-backup': return <SystemBackup />;
            case 'languages': return <Languages />;
            case 'google-settings': return <GoogleSettings />;
            case 'profile': return <Profile />;
            case 'forms': return <FormBuilder />;
            default: return <Overview />;
        }
    };

    const formatTabTitle = (tab: Tab): string => {
        if (tab === 'atm') return 'ATM Time Tracker';
        if (tab === 'google-settings') return 'Google Settings';
        if (tab === 'developer-platform') return 'Developer Platform';
        if (tab === 'system-backup') return 'System Backup';
        if (tab === 'policy-center') return 'Policy Center';
        if (tab === 'approval-policies') return 'Approval Policies';
        if (tab === 'audit-logs') return 'Audit Logs';
        if (tab === 'security-alerts') return 'Security Alerts';
        if (tab === 'device-login-security') return 'Device Login Security';
        if (tab === 'access-control') return 'Access Control';
        if (tab === 'feature-control') return 'Feature Control';
        if (tab === 'discovery-studio') return 'Discovery Studio';
        if (tab === 'journey-center') return 'Notification & Journey Center';
        if (tab === 'notification-ops') return 'Notification Operations';
        if (tab === 'scrolitha-ai') return 'Scrolitha AI';
        if (tab === 'scrolith-match') return 'Scrolith Match';
        if (tab === 'moderation-trust') return 'Moderation & Trust';
        if (tab === 'config-rollback') return 'Config & Rollback';
        if (tab === 'realtime-ops') return 'Realtime Ops';
        return tab.replace(/([A-Z])/g, ' $1').trim().replace(/\b\w/g, l => l.toUpperCase());
    };

    return (
        <RealtimeProvider>
        <div className="min-h-screen bg-gray-100 flex font-sans text-gray-900">
            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static flex flex-col`}>
                <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        {/* Sidebar Logo */}
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white overflow-hidden">
                            {user?.avatar ? (
                                <img src={user.avatar} className="w-full h-full object-cover" alt="Admin" />
                            ) : (
                                <span className="font-bold">G</span>
                            )}
                        </div>
                        <span className="font-bold text-lg tracking-tight">Scrolith Admin</span>
                    </div>
                    <button 
                        onClick={() => setSidebarOpen(false)} 
                        className="md:hidden text-slate-400 hover:text-white transition"
                        aria-label="Close sidebar"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 custom-scrollbar">
                    {navStructure.map((group, idx) => (
                        <div key={idx}>
                            <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                {group.title}
                            </h3>
                            <div className="space-y-1">
                                {group.items.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => { 
                                                setActiveTab(item.id); 
                                                setSidebarOpen(false); 
                                            }}
                                            className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === item.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                                            data-testid={`admin-nav-${item.id}`}
                                        >
                                            <div className="flex items-center">
                                                <Icon className="w-5 h-5 mr-3" />
                                                {item.label}
                                            </div>
                                            {/* Notification Badge for Support */}
                                            {item.id === 'support' && unreadSupportCount > 0 && (
                                                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 shadow-sm animate-pulse">
                                                    {unreadSupportCount > 99 ? '99+' : unreadSupportCount}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-4 border-t border-slate-800">
                    <button 
                        onClick={handleLogout} 
                        className="flex items-center w-full px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-900/20 hover:text-red-300 rounded-lg transition-colors"
                    >
                        <LogOut className="w-5 h-5 mr-3" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden h-screen">
                <header className="bg-white shadow-sm border-b border-gray-200 z-10 flex-shrink-0">
                    <div className="px-6 py-4 flex justify-between items-center">
                        <button 
                            onClick={() => setSidebarOpen(true)} 
                            className="md:hidden text-gray-500 hover:text-gray-700 transition"
                            aria-label="Open sidebar"
                        >
                            <Menu size={24} />
                        </button>
                        <h1 className="text-2xl font-bold text-gray-900 hidden md:block">
                            {formatTabTitle(activeTab)}
                        </h1>
                        
                        <div className="flex items-center space-x-4">
                            <button
                                onClick={handleBrowseWebsite}
                                className="hidden md:inline-flex items-center px-3 py-1.5 bg-white border border-gray-300 rounded-full text-gray-700 text-sm font-medium hover:bg-gray-50 transition"
                                title="Open platform website"
                            >
                                <ExternalLink className="w-4 h-4 mr-1.5" />
                                Browse Website
                            </button>
                            <button
                                onClick={handleClearCache}
                                disabled={isClearingCache}
                                className={`hidden md:inline-flex items-center px-3 py-1.5 border rounded-full text-sm font-medium transition ${
                                    isClearingCache
                                        ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                                        : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                                }`}
                                title="Clear server and browser cache"
                            >
                                <RotateCcw className={`w-4 h-4 mr-1.5 ${isClearingCache ? 'animate-spin' : ''}`} />
                                {isClearingCache ? 'Clearing...' : 'Clear Cache'}
                            </button>
                            <div className="hidden md:flex items-center px-3 py-1.5 bg-green-50 border border-green-200 rounded-full text-green-700 text-sm font-medium">
                                <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                                System Operational
                            </div>
                            <div className="relative" ref={adminNotifRef}>
                                <button 
                                    className="relative p-2 text-gray-400 hover:text-gray-500 transition"
                                    aria-label="Notifications"
                                    onClick={() => setShowAdminNotifications(!showAdminNotifications)}
                                >
                                    <Bell size={20} />
                                    {unreadNotificationCount > 0 && (
                                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
                                    )}
                                </button>
                                {showAdminNotifications && (
                                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 animate-fade-in-up">
                                        <div className="px-4 py-3 border-b border-gray-50 bg-gray-50">
                                            <div className="flex justify-between items-center">
                                                <h3 className="font-bold text-sm text-gray-700">Notifications</h3>
                                                <span className="text-xs text-gray-500">
                                                    {(adminNotificationTab === 'community' ? adminUnreadCounts.community : adminUnreadCounts.home)} new{' '}
                                                    {adminNotificationTab === 'community' ? 'Community' : 'Home'}
                                                </span>
                                            </div>
                                            <div className="mt-2 flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setAdminNotificationTab('home');
                                                    }}
                                                    className={[
                                                        'rounded-full px-3 py-1 text-[11px] font-semibold',
                                                        adminNotificationTab === 'home'
                                                            ? 'bg-slate-900 text-white'
                                                            : 'bg-white text-slate-700 border border-slate-200'
                                                    ].join(' ')}
                                                >
                                                    Home{adminUnreadCounts.home ? ` (${adminUnreadCounts.home})` : ''}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setAdminNotificationTab('community');
                                                    }}
                                                    className={[
                                                        'rounded-full px-3 py-1 text-[11px] font-semibold',
                                                        adminNotificationTab === 'community'
                                                            ? 'bg-slate-900 text-white'
                                                            : 'bg-white text-slate-700 border border-slate-200'
                                                    ].join(' ')}
                                                >
                                                    Community{adminUnreadCounts.community ? ` (${adminUnreadCounts.community})` : ''}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="max-h-96 overflow-y-auto">
                                            {visibleAdminNotifications.length === 0 ? (
                                                <div className="p-6 text-center text-gray-400 text-sm">No new notifications</div>
                                            ) : (
                                                visibleAdminNotifications.map((notif) => (
                                                    <div
                                                        key={notif.id}
                                                        onClick={() => handleNotificationClick(notif)}
                                                        className={`p-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors relative ${
                                                            !notif.isRead ? "bg-blue-50/30" : ""
                                                        }`}
                                                    >
                                                        <div className="flex justify-between items-start mb-1">
                                                            <h4 className={`text-sm ${!notif.isRead ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
                                                                {notif.title}
                                                            </h4>
                                                            <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">
                                                                {new Date((notif as any).timestamp ?? Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 line-clamp-2">{(notif as any).message ?? ''}</p>
                                                        {!notif.isRead && <span className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></span>}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Header Avatar Display */}
                            <div 
                                className="w-8 h-8 rounded-full overflow-hidden border border-indigo-200 cursor-pointer hover:border-indigo-300 transition"
                                onClick={() => setActiveTab('profile')}
                                title="Go to profile"
                            >
                                {user?.avatar ? (
                                    <img 
                                        src={user.avatar} 
                                        className="w-full h-full object-cover" 
                                        alt="Admin" 
                                    />
                                ) : (
                                    <div className="w-full h-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                                        G
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 md:p-8 bg-gray-50">
                    {/* Phase 28B: system settings needs full usable width for currency table */}
                    <div
                        className={`mx-auto w-full min-w-0 ${
                            activeTab === 'system' ? 'max-w-[100rem]' : 'max-w-7xl'
                        }`}
                    >
                        <Suspense fallback={<AdminTabLoader />}>{renderContent()}</Suspense>
                    </div>
                </main>
            </div>
        </div>
        </RealtimeProvider>
    );
};

export default AdminDashboard;

