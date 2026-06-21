
import React, { useState, useEffect } from 'react';
import { AdminService } from '../../services/admin';
import { WalletService } from '../../services/wallet';
import { User, Subscriber, Wallet, UploadedFile, UserRole, UserStatus } from '../../types';
import { Edit2, Trash2, Wallet as WalletIcon, Ban, CheckCircle, Save, X, Camera, Lock, Mail, User as UserIcon, BarChart2, Filter, Download, ExternalLink, TrendingUp, PieChart, Layout } from 'lucide-react';
import { useCurrency } from '../../context/CurrencyContext';
import { useNotification } from '../../context/NotificationContext';
import FilePicker from '../../components/FilePicker';

const UsersManagementTab = () => {
    const [subTab, setSubTab] = useState<'users' | 'subscribers' | 'analytics'>('users');
    const [users, setUsers] = useState<User[]>([]);
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    const { formatPrice } = useCurrency();
    const { showNotification } = useNotification();

    // Subscriber Filters
    const [subSourceFilter, setSubSourceFilter] = useState<string>('all');
    const [subStatusFilter, setSubStatusFilter] = useState<string>('all');

    // Analytics Data
    const [analytics, setAnalytics] = useState<any>(null);

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<Partial<User> & { password?: string } | null>(null);
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (subTab === 'analytics') {
            loadAnalytics();
        }
    }, [subTab]);

    const loadData = async () => {
        const [uData, wData, sData] = await Promise.all([
            AdminService.getUsers(),
            WalletService.getAllWallets(),
            AdminService.getSubscribers()
        ]);
        setUsers(uData);
        setWallets(wData);
        setSubscribers(sData);
    };

    const loadAnalytics = async () => {
        const data = await AdminService.getSubscriberAnalytics();
        setAnalytics(data);
    };

    const getUserWallet = (userId: string) => wallets.find(w => w.userId === userId);

    const handleEditUser = (user: User) => {
        setEditingUser({ ...user, password: '' }); // Clear password for edit
        setIsEditModalOpen(true);
    };

    const handleSaveUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser || !editingUser.id) return;

        setIsSaving(true);
        try {
            await AdminService.updateUserDetail(editingUser.id, editingUser, 'admin-1');
            
            // If status changed separately handle it for consistency
            if (editingUser.status && editingUser.status !== users.find(u => u.id === editingUser.id)?.status) {
                await AdminService.updateUserStatus(editingUser.id, editingUser.status, 'admin-1');
            }

            showNotification('success', 'User Updated', 'User details saved successfully.');
            setIsEditModalOpen(false);
            loadData();
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to update user.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            await AdminService.deleteUser(userId, 'admin-1');
            showNotification('success', 'User Deleted', 'User account removed.');
            loadData();
        }
    };

    const handleFileSelect = (file: UploadedFile) => {
        setEditingUser(prev => prev ? { ...prev, avatar: file.url, profilePhotoFileId: file.id } : null);
    };

    const filteredSubscribers = subscribers.filter(s => {
        const matchesSource = subSourceFilter === 'all' || s.source === subSourceFilter;
        const matchesStatus = subStatusFilter === 'all' || s.status === subStatusFilter;
        return matchesSource && matchesStatus;
    });

    return (
        <div className="space-y-6">
            <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg w-fit">
                <button onClick={() => setSubTab('users')} className={`px-4 py-2 text-sm font-medium rounded-md flex items-center ${subTab === 'users' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>
                    <UserIcon className="w-4 h-4 mr-2" /> All Users
                </button>
                <button onClick={() => setSubTab('subscribers')} className={`px-4 py-2 text-sm font-medium rounded-md flex items-center ${subTab === 'subscribers' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>
                    <Mail className="w-4 h-4 mr-2" /> Subscribers
                </button>
                <button onClick={() => setSubTab('analytics')} className={`px-4 py-2 text-sm font-medium rounded-md flex items-center ${subTab === 'analytics' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>
                    <BarChart2 className="w-4 h-4 mr-2" /> Analytics
                </button>
            </div>

            {subTab === 'users' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500"><tr><th>User</th><th>Role</th><th>Status</th><th>Wallet Balance</th><th>Actions</th></tr></thead>
                        <tbody className="divide-y">
                            {users.map(u => {
                                const wallet = getUserWallet(u.id);
                                return (
                                    <tr key={u.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 flex items-center">
                                            <img src={u.avatar} className="w-8 h-8 rounded-full mr-3 border border-gray-200 object-cover" alt="" /> 
                                            <div>
                                                <div className="font-medium text-gray-900">{u.name}</div>
                                                <div className="text-xs text-gray-500">{u.email}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 capitalize">
                                            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs font-medium" title={u.role === 'admin' ? 'Full Access' : u.role === 'freelancer' ? 'Seller Account' : 'Buyer Account'}>{u.role}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {u.status === 'active' ? <CheckCircle className="w-3 h-3 mr-1" /> : <Ban className="w-3 h-3 mr-1" />}
                                                {u.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-900">{wallet ? formatPrice(wallet.availableBalance) : '-'}</span>
                                                {wallet && wallet.escrowBalance > 0 && (
                                                    <span className="text-xs text-gray-500 flex items-center">
                                                        <Lock className="w-3 h-3 mr-1" /> {formatPrice(wallet.escrowBalance)} Escrow
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            <button className="text-gray-600 hover:bg-gray-100 p-1.5 rounded" title="View Wallet"><WalletIcon className="w-4 h-4"/></button>
                                            <button onClick={() => handleEditUser(u)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded" title="Edit User"><Edit2 className="w-4 h-4"/></button>
                                            <button onClick={() => handleDeleteUser(u.id)} className="text-red-600 hover:bg-red-50 p-1.5 rounded" title="Delete User"><Trash2 className="w-4 h-4"/></button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {subTab === 'subscribers' && (
                <div className="space-y-4 animate-fade-in">
                    {/* Filters Toolbar */}
                    <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-wrap gap-4 items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center">
                                <Filter className="w-4 h-4 text-gray-500 mr-2" />
                                <span className="text-sm font-medium text-gray-700 mr-2">Source:</span>
                                <select 
                                    className="text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    value={subSourceFilter}
                                    onChange={(e) => setSubSourceFilter(e.target.value)}
                                >
                                    <option value="all">All Sources</option>
                                    <option value="popup">Popup</option>
                                    <option value="footer">Footer</option>
                                </select>
                            </div>
                            <div className="flex items-center">
                                <span className="text-sm font-medium text-gray-700 mr-2">Status:</span>
                                <select 
                                    className="text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    value={subStatusFilter}
                                    onChange={(e) => setSubStatusFilter(e.target.value)}
                                >
                                    <option value="all">All Statuses</option>
                                    <option value="verified">Verified</option>
                                    <option value="pending">Pending</option>
                                    <option value="active">Active (Legacy)</option>
                                    <option value="unsubscribed">Unsubscribed</option>
                                </select>
                            </div>
                        </div>
                        <div className="text-sm text-gray-500">
                            Showing <strong>{filteredSubscribers.length}</strong> subscribers
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500">
                                <tr>
                                    <th className="px-6 py-4">Email</th>
                                    <th className="px-6 py-4">Source</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Subscribed Date</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredSubscribers.map(s => (
                                    <tr key={s.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium">{s.email}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                                                s.source === 'popup' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                            }`}>
                                                {s.source}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-medium flex w-fit items-center ${
                                                s.status === 'verified' || s.status === 'active' ? 'text-green-700 bg-green-50' : 
                                                s.status === 'unsubscribed' ? 'text-red-700 bg-red-50' :
                                                'text-yellow-700 bg-yellow-50'
                                            }`}>
                                                {s.status === 'verified' && <CheckCircle className="w-3 h-3 mr-1" />}
                                                {s.status === 'unsubscribed' && <X className="w-3 h-3 mr-1" />}
                                                {s.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-500">{new Date(s.subscribedAt).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="text-gray-400 hover:text-red-600 transition-colors p-1" title="Remove Subscriber"><Trash2 className="w-4 h-4" /></button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredSubscribers.length === 0 && (
                                    <tr><td colSpan={5} className="text-center py-8 text-gray-500">No subscribers match your filters.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {subTab === 'analytics' && analytics && (
                <div className="space-y-6 animate-fade-in">
                    {/* Top Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Total Subscribers</div>
                            <div className="text-3xl font-bold text-gray-900">{analytics.total}</div>
                            <div className="text-xs text-green-600 font-medium mt-1">+{analytics.growth.month} this month</div>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Verified Users</div>
                            <div className="text-3xl font-bold text-green-600">{analytics.verified}</div>
                            <div className="text-xs text-gray-400 mt-1">{((analytics.verified / analytics.total) * 100).toFixed(1)}% verification rate</div>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Pending Verification</div>
                            <div className="text-3xl font-bold text-yellow-600">{analytics.pending}</div>
                            <div className="text-xs text-gray-400 mt-1">Awaiting double opt-in</div>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Unsubscribed</div>
                            <div className="text-3xl font-bold text-red-600">{analytics.unsubscribed}</div>
                            <div className="text-xs text-gray-400 mt-1">Lifetime churn</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Source Distribution */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-gray-900 mb-6 flex items-center">
                                <Layout className="w-5 h-5 mr-2 text-blue-600" /> Source Distribution
                            </h3>
                            <div className="space-y-6">
                                <div>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="flex items-center text-gray-700 font-medium"><Layout className="w-4 h-4 mr-2 text-blue-500"/> Popup Form</span>
                                        <span className="font-bold">{analytics.sources.popup} ({((analytics.sources.popup / analytics.total) * 100).toFixed(1)}%)</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                                        <div className="bg-blue-500 h-3 rounded-full" style={{ width: `${(analytics.sources.popup / analytics.total) * 100}%` }}></div>
                                    </div>
                                    <div className="mt-2 text-xs text-gray-500 flex justify-between">
                                        <span>Conv. Rate to Paid: <span className="font-bold text-green-600">{analytics.conversion.popup}%</span></span>
                                    </div>
                                </div>
                                
                                <div>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="flex items-center text-gray-700 font-medium"><Layout className="w-4 h-4 mr-2 text-green-500"/> Footer Form</span>
                                        <span className="font-bold">{analytics.sources.footer} ({((analytics.sources.footer / analytics.total) * 100).toFixed(1)}%)</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                                        <div className="bg-green-500 h-3 rounded-full" style={{ width: `${(analytics.sources.footer / analytics.total) * 100}%` }}></div>
                                    </div>
                                    <div className="mt-2 text-xs text-gray-500 flex justify-between">
                                        <span>Conv. Rate to Paid: <span className="font-bold text-green-600">{analytics.conversion.footer}%</span></span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* AI Insights */}
                        <div className="bg-gradient-to-br from-indigo-900 to-purple-900 text-white p-6 rounded-xl border border-indigo-700 shadow-lg">
                            <h3 className="font-bold mb-4 flex items-center">
                                <TrendingUp className="w-5 h-5 mr-2 text-yellow-400" /> AI Subscriber Insights
                            </h3>
                            <div className="space-y-4 text-sm text-indigo-100">
                                <div className="bg-white/10 p-3 rounded-lg border border-white/10">
                                    <strong className="text-white block mb-1">Popup Performance</strong>
                                    Popup subscribers convert 2.3x better than footer subscribers. Consider increasing popup triggering on high-intent blog posts.
                                </div>
                                <div className="bg-white/10 p-3 rounded-lg border border-white/10">
                                    <strong className="text-white block mb-1">Verification Drop-off</strong>
                                    28% of subscribers fail to verify their email within 24 hours. Recommendation: Send a reminder email 4 hours after signup.
                                </div>
                                <div className="bg-white/10 p-3 rounded-lg border border-white/10">
                                    <strong className="text-white block mb-1">Growth Prediction</strong>
                                    Based on current trends, you are on track to reach 2,000 subscribers by next month.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {isEditModalOpen && editingUser && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-900 flex items-center">
                                <Edit2 className="w-4 h-4 mr-2" /> Edit User Details
                            </h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSaveUser} className="p-6 space-y-6">
                            
                            <div className="flex justify-center">
                                <div className="relative group cursor-pointer" onClick={() => setIsFilePickerOpen(true)}>
                                    <div className="w-24 h-24 rounded-full bg-gray-200 border-4 border-white shadow-md overflow-hidden">
                                        <img src={editingUser.avatar || "https://via.placeholder.com/150"} className="w-full h-full object-cover" alt="Avatar" />
                                    </div>
                                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Camera className="w-8 h-8 text-white" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                    <div className="relative">
                                        <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                        <input 
                                            type="text" 
                                            className="w-full pl-9 border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                            value={editingUser.name || ''}
                                            onChange={e => setEditingUser({...editingUser, name: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                        <input 
                                            type="email"
                                            className="w-full pl-9 border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                            value={editingUser.email || ''}
                                            onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                        <select 
                                            className="w-full border border-gray-300 rounded-lg p-2.5"
                                            value={editingUser.role}
                                            onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})}
                                        >
                                            <option value="freelancer">Freelancer</option>
                                            <option value="employer">Employer</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                        <select 
                                            className="w-full border border-gray-300 rounded-lg p-2.5"
                                            value={editingUser.status}
                                            onChange={e => setEditingUser({...editingUser, status: e.target.value as UserStatus})}
                                        >
                                            <option value="active">Active</option>
                                            <option value="suspended">Suspended</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <div className="border-t border-gray-100 pt-4 mt-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Reset Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                        <input 
                                            type="password"
                                            className="w-full pl-9 border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Leave blank to keep current"
                                            value={editingUser.password || ''}
                                            onChange={e => setEditingUser({...editingUser, password: e.target.value})}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
                                <button 
                                    type="submit" 
                                    disabled={isSaving}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center shadow-sm disabled:opacity-70"
                                >
                                    {isSaving ? 'Saving...' : <>Save Changes <Save className="w-4 h-4 ml-2" /></>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <FilePicker 
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelect={handleFileSelect}
                acceptedTypes="image/*"
                title="Select Profile Photo"
            />
        </div>
    );
};

export default UsersManagementTab;
