import React, { useState, useEffect, useRef } from 'react';
import { 
    Home, ShoppingBag, DollarSign, CreditCard, LayoutTemplate, BookOpen, Megaphone, Users, HardDrive, Shield, FileText, LifeBuoy, Settings, Menu, X, Bell, LogOut, User, MessageSquare, Brain, PieChart, Clock, MessageCircle, Navigation, BarChart2, Globe
} from 'lucide-react';
import { useNotification } from "../context/NotificationContext";
import { useUser } from "../context/UserContext";
import RealtimeProvider from './shared/RealtimeProvider';
import { useSearchParams } from 'react-router-dom';
import { SupportService } from '../services/support'; 

// Import New Modules
import Overview from './admin/Overview';
import ListingsManagementTab from './admin/GigsJobs'; 
import FinancialsTab from './admin/FinancePayouts';
import GatewaysTab from './admin/PaymentGateways';
import CMSPages from './admin/CMSPages';
import HomepageSettings from './admin/HomepageSettings';
import BlogManagement from './admin/Blog';
import MarketingTab from './admin/Marketing';
import UsersManagementTab from './admin/Users';
import UploadedFilesTab from './admin/UploadedFiles';
import StaffManagementTab from './admin/StaffManagement';
import RoleManagementTab from './admin/RoleManagement';
import ModeratorConsole from './admin/ModeratorConsole';
import MessageRecords from './admin/MessageRecords';
import KYCTab from './admin/KYCVerification';
import SupportDisputes from './admin/SupportDisputes';
import SystemSettings from './admin/SystemSettings';
import Profile from './admin/Profile';
import Languages from './admin/Languages';
import AdminMessages from './admin/Messages';
import AIIntelligence from './admin/AIIntelligence';
import MarketplaceAnalytics from './admin/MarketplaceAnalytics';
import ATMTrackerModule from './admin/ATMTrackerModule';
import CommunityManagement from './admin/CommunityManagement'; 
import NavigationManager from './admin/NavigationManager'; 
import MarketIntelligence from './admin/MarketIntelligence';
import AdminReviews from './admin/Reviews';
import CommerceEngagement from './admin/CommerceEngagement';
import FormBuilder from './admin/FormBuilder';
import GoogleSettings from './admin/GoogleSettings';
import MonetizationManagement from './admin/MonetizationManagement';

// Define valid tab types
type Tab = 'overview' | 'analytics' | 'market-intelligence' | 'listings' | 'engagement' | 'finance' | 'gateways' | 'cms' | 'homepage' | 'blog' | 'marketing' | 'users' | 'monetization' | 'files' | 'staff' | 'role-management' | 'moderator-console' | 'message-records' | 'kyc' | 'support' | 'system' | 'profile' | 'messages' | 'ai' | 'atm' | 'community' | 'navigation' | 'reviews' | 'languages' | 'forms' | 'google-settings';

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

const AdminDashboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const [unreadSupportCount, setUnreadSupportCount] = useState(0); 
    const { showNotification, notifications, markAsRead } = useNotification();
    const { user, logout } = useUser();
    const [searchParams] = useSearchParams();
    const [showAdminNotifications, setShowAdminNotifications] = useState(false);
    const adminNotifRef = useRef<HTMLDivElement>(null);
    const unreadNotificationCount = notifications.filter(n => !n.isRead).length;

    useEffect(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam && isValidTab(tabParam)) {
            setActiveTab(tabParam as Tab);
        }
    }, [searchParams]);

    // Helper function to validate tab
    const isValidTab = (tab: string): tab is Tab => {
        const validTabs: Tab[] = [
            'overview', 'analytics', 'listings', 'engagement', 'finance', 'gateways', 'cms', 
            'homepage', 'blog', 'marketing', 'users', 'monetization', 'files', 'staff', 'role-management', 'moderator-console', 'message-records', 'kyc', 
            'support', 'system', 'profile', 'messages', 'ai', 'atm', 'community', 'navigation', 'reviews', 'languages', 'forms', 'google-settings'
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

    const handleNotificationClick = (id: string, actionUrl?: string) => {
        markAsRead(id);
        setShowAdminNotifications(false);
        if (actionUrl) window.location.href = actionUrl;
    };

    // Strict Navigation Structure
    const navStructure: NavGroup[] = [
        { 
            title: 'Main', 
            items: [
                { id: 'overview', label: 'Overview', icon: Home },
                { id: 'analytics', label: 'Market Intelligence', icon: PieChart },
                { id: 'messages', label: 'Messages', icon: MessageSquare }
            ] 
        },
        { 
            title: 'Intelligence', 
            items: [
                { id: 'ai', label: 'AI Intelligence', icon: Brain },
                { id: 'atm', label: 'ATM Time Tracker', icon: Clock }
                , { id: 'market-intelligence', label: 'Market Intelligence', icon: BarChart2 }
            ]
        },
        { 
            title: 'Commerce', 
            items: [
                { id: 'listings', label: 'Gigs & Jobs', icon: ShoppingBag },
                { id: 'engagement', label: 'Favorites & Carts', icon: ShoppingBag },
                { id: 'forms', label: 'Form Builder', icon: LayoutTemplate }
            ] 
        },
        { 
            title: 'Finance', 
            items: [
                { id: 'finance', label: 'Finance & Payouts', icon: DollarSign }, 
                { id: 'gateways', label: 'Payment Gateways', icon: CreditCard }
            ] 
        },
        { 
            title: 'Content', 
            items: [
                { id: 'cms', label: 'CMS & Pages', icon: LayoutTemplate }, 
                { id: 'homepage', label: 'Homepage Settings', icon: LayoutTemplate },
                { id: 'blog', label: 'Blog', icon: BookOpen }
            ] 
        },
        { 
            title: 'Community', 
            items: [
                { id: 'community', label: 'Community & Forum', icon: MessageCircle },
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
                { id: 'role-management', label: 'Role Management', icon: Shield },
                { id: 'moderator-console', label: 'Moderator Console', icon: MessageSquare },
                { id: 'message-records', label: 'Message Records', icon: FileText }
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
            case 'ai': return <AIIntelligence />;
            case 'atm': return <ATMTrackerModule />;
            case 'market-intelligence': return <MarketIntelligence />;
            case 'listings': return <ListingsManagementTab />;
            case 'engagement': return <CommerceEngagement />;
            case 'finance': return <FinancialsTab />;
            case 'gateways': return <GatewaysTab />;
            case 'cms': return <CMSPages />;
            case 'homepage': return <HomepageSettings />;
            case 'blog': return <BlogManagement />;
            case 'community': return <CommunityManagement />;
            case 'reviews': return <AdminReviews />;
            case 'marketing': return <MarketingTab />;
            case 'users': return <UsersManagementTab />;
            case 'monetization': return <MonetizationManagement />;
            case 'files': return <UploadedFilesTab />;
            case 'staff': return <StaffManagementTab />;
            case 'role-management': return <RoleManagementTab />;
            case 'moderator-console': return <ModeratorConsole />;
            case 'message-records': return <MessageRecords />;
            case 'kyc': return <KYCTab />;
            case 'support': return <SupportDisputes />;
            case 'navigation': return <NavigationManager />;
            case 'system': return <SystemSettings />;
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
            <div className="flex-1 flex flex-col overflow-hidden h-screen">
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
                                        <div className="px-4 py-3 border-b border-gray-50 bg-gray-50 flex justify-between items-center">
                                            <h3 className="font-bold text-sm text-gray-700">Notifications</h3>
                                            <span className="text-xs text-gray-500">{unreadNotificationCount} new</span>
                                        </div>
                                        <div className="max-h-96 overflow-y-auto">
                                            {notifications.length === 0 ? (
                                                <div className="p-6 text-center text-gray-400 text-sm">No new notifications</div>
                                            ) : (
                                                notifications.map((notif) => (
                                                    <div
                                                        key={notif.id}
                                                        onClick={() => handleNotificationClick(notif.id, (notif.actionUrl || (notif as any).action_url) ?? undefined)}
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

                <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-gray-50">
                    <div className="max-w-7xl mx-auto">
                        {renderContent()}
                    </div>
                </main>
            </div>
        </div>
        </RealtimeProvider>
    );
};

export default AdminDashboard;

