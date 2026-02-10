
import React, { useState, useEffect } from 'react';
import { 
    LayoutDashboard, Briefcase, FileText, DollarSign, MessageSquare, 
    Settings, LogOut, User, Folder, Award, TrendingUp, Clock, ArrowRight,
    Star, CheckCircle, Lock, BookOpen
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { AdvisorService } from '../services/ai/advisor.service';
import { SkillRecommendation } from '../types';
import { useCurrency } from '../context/CurrencyContext';
import ContractList from './shared/ContractList';
import { MOCK_ORDERS } from '../constants';
import WalletModule from './freelancer/WalletModule';
import EditProfile from '../profile/EditProfile';
import SettingsModule from './shared/SettingsModule';
import MyGigs from './freelancer/MyGigs'; // Integrated

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

const FreelancerDashboard = () => {
    const { user, switchRole, logout } = useUser();
    const [activeTab, setActiveTab] = useState<'overview' | 'growth' | 'contracts' | 'gigs' | 'orders' | 'wallet' | 'profile' | 'settings'>('overview');
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && ['overview', 'growth', 'contracts', 'gigs', 'orders', 'wallet', 'profile', 'settings'].includes(tab)) {
            setActiveTab(tab as any);
        }
    }, [searchParams]);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    if (!user) return null;

    const navItems = [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        { id: 'growth', label: 'Growth & Upskilling', icon: TrendingUp },
        { id: 'contracts', label: 'Hourly Contracts', icon: Clock },
        { id: 'gigs', label: 'My Gigs', icon: Briefcase },
        { id: 'orders', label: 'Active Orders', icon: FileText },
        { id: 'wallet', label: 'Wallet & Earnings', icon: DollarSign },
        { id: 'profile', label: 'My Profile', icon: User },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex font-sans text-gray-900">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-200 fixed inset-y-0 z-20 flex flex-col">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center space-x-3 mb-6">
                        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-200">G</div>
                        <span className="font-bold text-lg text-gray-800 tracking-tight">Scrolith</span>
                    </div>
                    
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <img src={user.avatar} alt="" className="w-10 h-10 rounded-full border-2 border-white shadow-sm object-cover" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{user.name}</p>
                            <p className="text-xs text-gray-500 truncate">Freelancer</p>
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
                    <button onClick={switchRole} className="w-full flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                        <User className="w-4 h-4 mr-3" /> Switch to Buying
                    </button>
                    <button onClick={handleLogout} className="w-full flex items-center px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <LogOut className="w-4 h-4 mr-3" /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-64 p-8">
                <div className="max-w-7xl mx-auto animate-fade-in">
                    {activeTab === 'overview' && <FreelancerOverview user={user} />}
                    {activeTab === 'growth' && <GrowthInsights user={user} />}
                    {activeTab === 'contracts' && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-gray-900">Hourly Work</h2>
                            <ContractList role="freelancer" userId={user.id} />
                        </div>
                    )}
                    {activeTab === 'gigs' && <MyGigs />}
                    {activeTab === 'orders' && <ActiveOrders />}
                    
                    {/* Integrated Modules */}
                    {activeTab === 'wallet' && <WalletModule />}
                    {activeTab === 'profile' && <EditProfile isEmbedded={true} />}
                    {activeTab === 'settings' && <SettingsModule />}
                </div>
            </main>
        </div>
    );
};

const FreelancerOverview = ({ user }: { user: any }) => (
    <div className="space-y-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="text-sm text-gray-500 font-medium mb-1">Active Orders</div>
                <div className="text-3xl font-bold text-gray-900">4</div>
             </div>
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="text-sm text-gray-500 font-medium mb-1">Earnings (Month)</div>
                <div className="text-3xl font-bold text-green-600">$1,240</div>
             </div>
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="text-sm text-gray-500 font-medium mb-1">Response Time</div>
                <div className="text-3xl font-bold text-blue-600">1h 15m</div>
             </div>
        </div>
        <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Active Contracts</h2>
            <ContractList role="freelancer" userId={user.id} />
        </div>
    </div>
);

const GrowthInsights = ({ user }: { user: any }) => {
    const [recommendations, setRecommendations] = useState<SkillRecommendation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        AdvisorService.getSkillRecommendations(user.id).then(data => {
            setRecommendations(data);
            setLoading(false);
        });
    }, [user.id]);

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-indigo-900 to-purple-900 rounded-2xl p-8 text-white">
                <h2 className="text-2xl font-bold mb-2 flex items-center">
                    <TrendingUp className="w-6 h-6 mr-3 text-yellow-400" /> AI Growth Advisor
                </h2>
                <p className="text-indigo-200 max-w-2xl">
                    Based on market demand and your current profile, here are the top skills you should learn to increase your earnings.
                </p>
            </div>

            {loading ? (
                <div className="p-12 text-center text-gray-500">Analyzing market trends...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recommendations.map((rec, i) => (
                        <div key={i} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition">
                            <div className="flex justify-between items-start mb-4">
                                <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${rec.difficulty === 'Hard' ? 'bg-red-100 text-red-700' : rec.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                                    {rec.difficulty} To Learn
                                </span>
                                <span className="text-green-600 font-bold text-sm">+{rec.incomeUplift}% Income</span>
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">{rec.skill}</h3>
                            <p className="text-sm text-gray-600 mb-4 h-10">{rec.reason}</p>
                            
                            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                                <div className="text-xs text-gray-500">
                                    Demand: <span className="text-green-600 font-bold">+{rec.demandGrowth}%</span>
                                </div>
                                <button className="text-indigo-600 text-sm font-bold hover:underline flex items-center">
                                    Find Resources <ArrowRight className="w-3 h-3 ml-1" />
                                </button>
                            </div>
                        </div>
                    ))}
                    
                    {/* Add Certification Upsell */}
                    <div className="bg-gray-50 p-6 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                            <Award className="w-6 h-6 text-indigo-500" />
                        </div>
                        <h3 className="font-bold text-gray-900 mb-2">Get Certified</h3>
                        <p className="text-sm text-gray-500 mb-4">Take an AI-proctored skill test to earn a badge.</p>
                        <button className="bg-white border border-gray-300 px-4 py-2 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-100">
                            Browse Tests
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const ActiveOrders = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500"><tr><th className="px-6 py-4">Gig</th><th className="px-6 py-4">Client</th><th className="px-6 py-4">Due Date</th><th className="px-6 py-4">Amount</th><th className="px-6 py-4">Status</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
                {MOCK_ORDERS.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium">{order.gigTitle}</td>
                        <td className="px-6 py-4">{order.clientName}</td>
                        <td className="px-6 py-4">{order.dueDate}</td>
                        <td className="px-6 py-4 font-bold">${order.amount}</td>
                        <td className="px-6 py-4"><span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold">{order.status}</span></td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

export default FreelancerDashboard;
