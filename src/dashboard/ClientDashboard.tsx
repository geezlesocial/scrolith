
import React, { useState, useEffect } from 'react';
import { 
    Briefcase, FileText, Users, DollarSign, MessageSquare, 
    Settings, LogOut, PlusCircle, CheckCircle, CreditCard, Lock,
    Bell, Shield, Mail, Camera, User, Clock, ArrowRight, Sparkles, Star, ChevronRight, Loader2, Search, Building2
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrency } from '../context/CurrencyContext';
import { useUser } from '../context/UserContext';
import { WalletService } from '../services/wallet';
import { AIService } from '../services/ai/ai.service';
import { GovernanceService } from '../services/ai/governance.service';
import { Wallet, Escrow, EscrowStatus, UserSettings, UploadedFile, ListingCategory, Gig, EnterpriseHiringInsight } from '../types';
import { MOCK_JOBS, MOCK_ORDERS, CATEGORIES, MOCK_GIGS } from '../constants';
import Recommendations from '../components/Recommendations';
import { UserService } from '../services/user';
import { useNotification } from '../context/NotificationContext';
import FilePicker from '../components/FilePicker';
import ContractList from './shared/ContractList';
import GigCard from '../components/GigCard';
import WalletModule from './freelancer/WalletModule'; // Reuse wallet module (could be shared)
import SettingsModule from './shared/SettingsModule'; // New Import

const SidebarItem = ({ id, label, icon: Icon, active, onClick }: any) => (
    <button
        onClick={() => onClick(id)}
        className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
            active 
            ? 'bg-indigo-50 text-indigo-700 shadow-sm' 
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
    >
        <Icon className={`w-5 h-5 mr-3 ${active ? 'text-indigo-600' : 'text-gray-400'}`} />
        {label}
    </button>
);

const ClientDashboard = () => {
    const { user, switchRole, logout } = useUser();
    const [activeTab, setActiveTab] = useState<'overview' | 'jobs' | 'contracts' | 'escrow' | 'candidates' | 'enterprise' | 'wallet' | 'messages' | 'settings'>('overview');
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'settings') {
            setActiveTab('settings');
        } else if (tab && ['overview', 'jobs', 'contracts', 'escrow', 'candidates', 'enterprise', 'wallet', 'messages'].includes(tab)) {
            setActiveTab(tab as any);
        }
    }, [searchParams]);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    if (!user) return null;

    const navItems = [
        { id: 'overview', label: 'Home', icon: Briefcase },
        { id: 'jobs', label: 'My Jobs', icon: FileText },
        { id: 'contracts', label: 'Hourly Contracts', icon: Clock },
        { id: 'escrow', label: 'Escrow Payments', icon: Lock },
        { id: 'candidates', label: 'Candidates', icon: Users },
        { id: 'enterprise', label: 'Enterprise AI', icon: Building2 }, // New Tab
        { id: 'wallet', label: 'Wallet', icon: CreditCard },
        { id: 'messages', label: 'Messages', icon: MessageSquare },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex font-sans text-gray-900">
            <aside className="w-64 bg-white border-r border-gray-200 fixed inset-y-0 z-20 flex flex-col">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center space-x-3 mb-6">
                        <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-green-200">C</div>
                        <span className="font-bold text-lg text-gray-800 tracking-tight">Client Portal</span>
                    </div>
                    
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <img src={user.avatar} alt="" className="w-10 h-10 rounded-full border-2 border-white shadow-sm object-cover" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{user.name}</p>
                            <p className="text-xs text-gray-500 truncate">Employer Account</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {navItems.map(item => (
                        <SidebarItem 
                            key={item.id} 
                            id={item.id} 
                            label={item.label} 
                            icon={item.icon} 
                            active={activeTab === item.id} 
                            onClick={setActiveTab} 
                        />
                    ))}
                </nav>

                <div className="p-4 border-t border-gray-200 space-y-2">
                    <Link to="/create-job" className="w-full flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 transition shadow-sm mb-2">
                        <PlusCircle className="w-4 h-4 mr-2" /> Post New Job
                    </Link>
                    <button onClick={switchRole} className="w-full flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                        <Users className="w-4 h-4 mr-3" /> Switch to Freelancer
                    </button>
                    <button onClick={handleLogout} className="w-full flex items-center px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <LogOut className="w-4 h-4 mr-3" /> Sign Out
                    </button>
                </div>
            </aside>

            <main className="flex-1 ml-64 p-8">
                <div className="max-w-7xl mx-auto animate-fade-in">
                    {activeTab === 'overview' && <ClientHome user={user} />}
                    {activeTab === 'jobs' && <ClientJobs />}
                    {activeTab === 'contracts' && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-gray-900">Hourly Contracts & Time Logs</h2>
                            <p className="text-gray-500">Review time logs and manage your hourly staff.</p>
                            <ContractList role="client" userId={user.id} />
                        </div>
                    )}
                    {activeTab === 'escrow' && <EscrowManagement user={user} />}
                    {activeTab === 'candidates' && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-gray-900">AI Candidate Matching</h2>
                            <p className="text-gray-500">Based on your recent job posts and preferences.</p>
                            <Recommendations userId={user.id} />
                        </div>
                    )}
                    {activeTab === 'enterprise' && <EnterpriseHiring user={user} />}
                    {activeTab === 'wallet' && <WalletModule />}
                    {activeTab === 'messages' && (
                        <div className="flex flex-col items-center justify-center h-96 text-gray-500">
                            <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
                            <p>Redirecting to Messenger...</p>
                            <Link to="/messages" className="text-indigo-600 hover:underline mt-2">Open Messenger</Link>
                        </div>
                    )}
                    {activeTab === 'settings' && <SettingsModule />}
                </div>
            </main>
        </div>
    );
};

// ... Existing Components (WelcomeSection, ClientHome, etc.) ...
const WelcomeSection = ({ user }: { user: any }) => (
    <div className="flex justify-between items-end">
        <div>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
                Welcome back, {user.name.split(' ')[0]} 👋
            </h1>
            <p className="text-gray-600 mt-2 text-lg">
                Your projects are moving forward. You have <span className="font-bold text-indigo-600">2 active jobs</span> and <span className="font-bold text-indigo-600">3 new proposals</span> waiting.
            </p>
        </div>
        <div className="hidden md:block">
            <Link to="/create-job" className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 transition shadow-lg flex items-center">
                <PlusCircle className="w-5 h-5 mr-2" /> Post a Job
            </Link>
        </div>
    </div>
);

const ClientHome = ({ user }: { user: any }) => {
    return (
        <div className="space-y-12">
            <WelcomeSection user={user} />
            <div className="bg-white p-6 rounded-xl border border-gray-200">
                <h3 className="font-bold text-gray-900 mb-4">Quick Stats</h3>
                <div className="grid grid-cols-3 gap-6">
                     <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 uppercase font-bold">Active Jobs</div>
                        <div className="text-2xl font-bold text-gray-900">2</div>
                     </div>
                     <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 uppercase font-bold">Spent this Month</div>
                        <div className="text-2xl font-bold text-green-600">$4,250</div>
                     </div>
                     <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 uppercase font-bold">Candidates Hired</div>
                        <div className="text-2xl font-bold text-blue-600">5</div>
                     </div>
                </div>
            </div>
            <Recommendations userId={user.id} />
        </div>
    );
};

const EnterpriseHiring = ({ user }: { user: any }) => {
    const [insight, setInsight] = useState<EnterpriseHiringInsight | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        GovernanceService.getEnterpriseInsights(user.id).then(data => {
            setInsight(data);
            setLoading(false);
        });
    }, [user.id]);

    if (loading) return <div className="p-12 text-center text-gray-500">Generating Enterprise Insights...</div>;

    return (
        <div className="space-y-8">
             <div className="bg-gradient-to-r from-gray-900 to-slate-800 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="relative z-10">
                    <h2 className="text-2xl font-bold mb-2 flex items-center">
                        <Building2 className="w-6 h-6 mr-3 text-blue-400" /> Enterprise Hiring Assistant
                    </h2>
                    <p className="text-slate-300 max-w-2xl">
                        AI-driven insights to optimize your team structure, budget, and hiring velocity.
                    </p>
                </div>
                <div className="absolute top-0 right-0 p-32 bg-blue-500 rounded-full mix-blend-overlay filter blur-3xl opacity-10"></div>
            </div>

            {insight && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Stats */}
                    <div className="lg:col-span-2 space-y-8">
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-gray-900 mb-6">AI Shortlisted Candidates</h3>
                            <div className="space-y-4">
                                {insight.shortlistedCandidates.map((c, i) => (
                                    <div key={i} className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition">
                                        <div className="flex items-center">
                                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold mr-4">
                                                {c.fitScore}%
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-900">{c.name}</div>
                                                <div className="text-xs text-gray-500">Cost Efficiency: {c.costEfficiency}</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-xs px-2 py-1 rounded font-bold ${c.riskScore < 5 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                Risk: {c.riskScore}%
                                            </div>
                                            <button className="text-xs text-blue-600 font-bold mt-2 hover:underline">View Profile</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-xl">
                            <h3 className="font-bold text-indigo-900 mb-2 flex items-center">
                                <Sparkles className="w-4 h-4 mr-2" /> Budget Optimization
                            </h3>
                            <p className="text-indigo-800 text-sm">{insight.budgetOptimization}</p>
                        </div>
                    </div>

                    {/* Sidebar Stats */}
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-gray-900 mb-4">Team Composition Gaps</h3>
                            <div className="flex flex-wrap gap-2">
                                {insight.teamGaps.map((gap, i) => (
                                    <span key={i} className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs font-bold border border-red-100">
                                        {gap}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-gray-900 mb-4">Market Position</h3>
                            <div className="flex items-center justify-center py-4">
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-green-600 mb-1">Top 10%</div>
                                    <div className="text-xs text-gray-500 uppercase font-bold">Competitive Salary</div>
                                </div>
                            </div>
                            <p className="text-xs text-center text-gray-400">Based on recent offers vs market avg.</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const ClientJobs = () => (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">My Job Posts</h2>
            <Link to="/create-job" className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700">New Job</Link>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500"><tr><th className="px-6 py-4">Title</th><th className="px-6 py-4">Proposals</th><th className="px-6 py-4">Budget</th><th className="px-6 py-4">Status</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                    {MOCK_JOBS.map(job => (
                        <tr key={job.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium">{job.title}</td>
                            <td className="px-6 py-4">{job.proposals} Applicants</td>
                            <td className="px-6 py-4">{job.budget}</td>
                            <td className="px-6 py-4"><span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-bold">{job.status}</span></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

const EscrowManagement = ({ user }: any) => {
    const { formatPrice } = useCurrency();
    const [escrows, setEscrows] = useState<Escrow[]>([]);

    useEffect(() => {
        WalletService.getUserEscrows(user.id, 'client').then(setEscrows);
    }, [user.id]);

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Fixed-Price Escrow</h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500">
                        <tr><th>Order ID</th><th>Freelancer</th><th>Amount</th><th>Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {escrows.length === 0 ? (
                            <tr><td colSpan={4} className="p-8 text-center text-gray-500">No active escrow funds.</td></tr>
                        ) : escrows.map(escrow => (
                            <tr key={escrow.id}>
                                <td className="px-6 py-4 font-mono text-gray-600">{escrow.orderId}</td>
                                <td className="px-6 py-4 font-medium">{escrow.freelancerName}</td>
                                <td className="px-6 py-4 font-bold text-gray-900">{formatPrice(escrow.amount)}</td>
                                <td className="px-6 py-4"><span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">{escrow.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ClientDashboard;
