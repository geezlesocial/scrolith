
import React, { useState, useEffect } from 'react';
import { RealtimeProvider } from './shared/RealtimeProvider';
import { 
    Briefcase, FileText, Users, DollarSign, MessageSquare, 
    Settings, LogOut, PlusCircle, CheckCircle, CreditCard, Lock,
    Bell, Shield, Mail, Camera, User, Clock, ArrowRight, Sparkles, Star, ChevronRight, Loader2, Search, Building2,
    Coins, LifeBuoy
} from 'lucide-react';
import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useCurrency } from '../context/CurrencyContext';
import { useUser } from '../context/UserContext';
import { WalletService } from '../services/wallet';
import { GovernanceService } from '../services/ai/governance.service';
import { Escrow, EnterpriseHiringInsight } from '../types';
import Recommendations from '../components/Recommendations';
// File picker migration: legacy picker removed
import ContractList from './shared/ContractList';
import WalletModule from './freelancer/WalletModule'; // Reuse wallet module (could be shared)
import SettingsModule from './shared/SettingsModule'; // New Import
import EmployerUploadedFiles from './employer/UploadedFiles';
import EmployerOverview from './employer/Overview';
import MyJobs from './employer/MyJobs';
import EmployerFavorites from './employer/Favorites';
import EmployerReviews from './employer/Reviews';
import ProposalsOffers from './employer/ProposalsOffers';
import GcoinPanel from './shared/GcoinPanel';
import SupportCenter from './shared/SupportCenter';
import MessagesPanel from './shared/MessagesPanel';
import KYCVerification from './shared/KYCVerification';
import ProjectBriefs from './employer/ProjectBriefs';
import MyAds from '../pages/MyAds';
import { useT } from '../i18n/useT';

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
    const t = useT();
    const { user, switchRole, logout } = useUser();
    const [activeTab, setActiveTab] = useState<'overview' | 'jobs' | 'proposals' | 'contracts' | 'escrow' | 'candidates' | 'enterprise' | 'wallet' | 'gcoin' | 'favorites' | 'reviews' | 'project-briefs' | 'messages' | 'support' | 'kyc' | 'settings' | 'uploaded-files'>('overview');
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const params = useParams();

    useEffect(() => {
        const tabQuery = searchParams.get('tab');
        const tabParam = params.tab;
        const allowed = ['overview', 'jobs', 'proposals', 'contracts', 'escrow', 'candidates', 'enterprise', 'wallet', 'gcoin', 'favorites', 'reviews', 'project-briefs', 'messages', 'support', 'kyc', 'settings', 'uploaded-files'];
        const tab = tabParam || tabQuery;
        if (tab === 'settings') setActiveTab('settings');
        else if (tab === 'proposals-offers') setActiveTab('proposals');
        else if (tab && allowed.includes(tab)) setActiveTab(tab as unknown as typeof activeTab);
    }, [searchParams, params.tab]);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    if (!user) return null;

    const navItems = [
        { id: 'overview', label: t('dashboard.client.nav.home', 'Home'), icon: Briefcase },
        { id: 'jobs', label: t('dashboard.client.nav.jobs', 'My Jobs'), icon: FileText },
        { id: 'proposals', label: t('dashboard.client.nav.proposals', 'Proposals & Offers'), icon: Users },
        { id: 'contracts', label: t('dashboard.client.nav.contracts', 'Contracts'), icon: Clock },
        { id: 'escrow', label: t('dashboard.client.nav.escrow', 'Escrow Payments'), icon: Lock },
        { id: 'candidates', label: t('dashboard.client.nav.candidates', 'Candidates'), icon: Users },
        { id: 'enterprise', label: t('dashboard.client.nav.enterprise_ai', 'Enterprise AI'), icon: Building2 },
        { id: 'wallet', label: t('dashboard.client.nav.wallet', 'Wallet'), icon: CreditCard },
        { id: 'gcoin', label: t('dashboard.client.nav.gcoin', 'Gcoin'), icon: Coins },
        { id: 'favorites', label: t('dashboard.client.nav.favorites', 'Favorites'), icon: Star },
        { id: 'reviews', label: t('dashboard.client.nav.reviews', 'Reviews'), icon: CheckCircle },
        { id: 'project-briefs', label: t('dashboard.client.nav.project_briefs', 'Project Briefs'), icon: Sparkles },
        { id: 'messages', label: t('dashboard.client.nav.messages', 'Messages'), icon: MessageSquare },
        { id: 'support', label: t('dashboard.client.nav.support', 'Support'), icon: LifeBuoy },
        { id: 'kyc', label: t('dashboard.client.nav.kyc', 'KYC'), icon: Shield },
        { id: 'uploaded-files', label: t('dashboard.client.nav.uploaded_files', 'Uploaded Files'), icon: Camera },
        { id: 'my-ads', label: t('dashboard.client.nav.my_ads', 'My Ads'), icon: Briefcase },
        { id: 'settings', label: t('dashboard.client.nav.settings', 'Settings'), icon: Settings },
    ];

    return (
        <RealtimeProvider>
            <div className="min-h-screen bg-gray-50 flex font-sans text-gray-900">
            <aside className="w-64 bg-white border-r border-gray-200 fixed inset-y-0 z-20 flex flex-col">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center space-x-3 mb-6">
                        <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-green-200">C</div>
                        <span className="font-bold text-lg text-gray-800 tracking-tight">{t('dashboard.client.portal_title', 'Client Portal')}</span>
                    </div>
                    
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <img src={user.avatar} alt="" className="w-10 h-10 rounded-full border-2 border-white shadow-sm object-cover" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{user.name}</p>
                            <p className="text-xs text-gray-500 truncate">{t('dashboard.client.account_type', 'Employer Account')}</p>
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
                            onClick={(id: string) => {
                                setActiveTab(id as unknown as typeof activeTab);
                                navigate(`/client/dashboard/${id}`);
                            }} 
                        />
                    ))}
                </nav>

                <div className="p-4 border-t border-gray-200 space-y-2">
                    <Link to="/create-job" className="w-full flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 transition shadow-sm mb-2">
                        <PlusCircle className="w-4 h-4 mr-2" /> {t('dashboard.client.post_new_job', 'Post New Job')}
                    </Link>
                    <button onClick={switchRole} className="w-full flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                        <Users className="w-4 h-4 mr-3" /> {t('dashboard.client.switch_to_freelancer', 'Switch to Freelancer')}
                    </button>
                    <button onClick={handleLogout} className="w-full flex items-center px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <LogOut className="w-4 h-4 mr-3" /> {t('common.sign_out', 'Sign Out')}
                    </button>
                </div>
            </aside>

            <main className="flex-1 ml-64 p-8">
                <div className="max-w-7xl mx-auto animate-fade-in">
                    {activeTab === 'overview' && <EmployerOverview />}
                    {activeTab === 'jobs' && <MyJobs />}
                    {activeTab === 'proposals' && <ProposalsOffers />}
                    {activeTab === 'contracts' && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.client.contracts_title', 'Contracts')}</h2>
                            <p className="text-gray-500">{t('dashboard.client.contracts_subtitle', 'Review time logs and manage your hourly staff.')}</p>
                            <ContractList role="client" userId={user.id} />
                        </div>
                    )}
                    {activeTab === 'escrow' && <EscrowManagement user={user} />}
                    {activeTab === 'candidates' && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.client.ai_candidates_title', 'AI Candidate Matching')}</h2>
                            <p className="text-gray-500">{t('dashboard.client.ai_candidates_subtitle', 'Based on your recent job posts and preferences.')}</p>
                            <Recommendations userId={user.id} />
                        </div>
                    )}
                    {activeTab === 'enterprise' && <EnterpriseHiring user={user} />}
                    {activeTab === 'wallet' && <WalletModule />}
                    {activeTab === 'gcoin' && <GcoinPanel />}
                    {activeTab === 'favorites' && <EmployerFavorites />}
                    {activeTab === 'reviews' && <EmployerReviews />}
                    {activeTab === 'project-briefs' && <ProjectBriefs />}
                    {activeTab === 'uploaded-files' && <EmployerUploadedFiles />}
                    {activeTab === 'my-ads' && <MyAds />}
                    {activeTab === 'messages' && <MessagesPanel />}
                    {activeTab === 'support' && <SupportCenter />}
                    {activeTab === 'kyc' && <KYCVerification role="employer" />}
                    {activeTab === 'settings' && <SettingsModule />}
                </div>
            </main>
            </div>
        </RealtimeProvider>
    );
};

const EnterpriseHiring = ({ user }: { user: any }) => {
    const [insight, setInsight] = useState<EnterpriseHiringInsight | null>(null);
    const [loading, setLoading] = useState(true);
    const [jobDescription, setJobDescription] = useState('');

    const loadInsights = async () => {
        setLoading(true);
        try {
            const data = await GovernanceService.getEnterpriseInsights(user.id, { jobDescription });
            setInsight(data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadInsights();
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-gray-900">Role Summary</h3>
                    <button
                        onClick={loadInsights}
                        className="px-4 py-2 text-xs font-bold uppercase rounded-lg bg-gray-900 text-white"
                    >
                        Run analysis
                    </button>
                </div>
                <textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Describe the role, seniority, and outcomes you need. The AI will tailor insights to your brief."
                    className="w-full rounded-lg border border-gray-200 p-3 text-sm"
                    rows={3}
                />
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
