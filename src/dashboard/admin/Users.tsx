import React, { useState, useEffect } from 'react';
import {
  User,
  Mail,
  BarChart3,
  Edit,
  Trash2,
  X,
  Camera,
  Lock,
  Unlock,
  DollarSign,
  ShieldAlert,
  CheckCircle,
  Clock,
  Users as UsersIcon,
  HardDrive,
  Shield,
  FileText,
  LifeBuoy,
  Settings,
  Bell,
  LogOut,
  Navigation,
  LayoutDashboard,
  PieChart,
  Activity,
  TrendingUp,
  Filter,
  Download,
  Upload,
  Plus,
  Edit3,
  Eye,
  Target,
  Zap,
  Calendar,
  Award,
  Package,
  BarChart,
  TrendingDown,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  Info,
  HelpCircle,
  Sparkles,
  Star,
  Bookmark,
  Copy,
  Share2,
  Heart,
  MessageCircle,
  ExternalLink,
  CreditCard,
  ShoppingBag,
  Home,
  Search,
  Grid3X3,
  BarChart2,
  Layout,
  RefreshCw
} from 'lucide-react';

import type { User as UserType, UserRole, GcoinWallet } from '../../types';
import { AdminService } from '../../services/admin';
import { WalletService } from '../../services/wallet';
import { GcoinService } from '../../services/gcoin';
import { useNotification } from '../../context/NotificationContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useUser } from '../../context/UserContext';
import VerifiedBadge from '../../components/common/VerifiedBadge';
import { resolveVerificationLevel } from '../../utils/verification';

interface Wallet {
  userId: string;
  availableBalance: number;
  escrowBalance: number;
  currency?: string;
  lastUpdated?: string;
  isActive?: boolean;
}

interface Subscriber {
  id: string;
  email: string;
  source: 'popup' | 'footer' | 'other' | string;
  status: 'verified' | 'pending' | 'unsubscribed' | 'active' | string;
  subscribedAt: string;
  verifiedAt?: string;
  unsubscribedAt?: string;
  name?: string;
}

interface SubscriberAnalytics {
  total: number;
  verified: number;
  pending: number;
  unsubscribed: number;
  sources: {
    popup: number;
    footer: number;
    other?: number;
  };
  growth: {
    today: number;
    week: number;
    month: number;
  };
  conversion: {
    popup: number;
    footer: number;
  };
  trendData?: Array<{
    date: string;
    subscribers: number;
    verified: number;
  }>;
}

interface UsersManagementTabProps {
  onUserUpdated?: () => void;
  onUserDeleted?: () => void;
  onSubscriberAdded?: () => void;
}

type EditableUser = Partial<UserType> & { password?: string; status?: string };
type DemoAutomationOverview = {
  config?: {
    enabled?: boolean;
    aiEnabled?: boolean;
    cadenceMinutes?: number;
    maxPostsPerRun?: number;
    maxLikesPerRun?: number;
    lastRunAt?: string | null;
    lastRunSummary?: {
      postsCreated?: number;
      likesCreated?: number;
      skippedAccounts?: number;
      notes?: string[];
      finishedAt?: string;
    } | null;
  };
  stats?: {
    managedAccounts?: number;
    activeAccounts?: number;
    automationEnabledAccounts?: number;
  };
  accounts?: Array<{
    id: string;
    name?: string;
    email?: string;
    profession?: string | null;
    country?: string | null;
    automationEnabled?: boolean;
    isActive?: boolean;
  }>;
};

const UsersManagementTab: React.FC<UsersManagementTabProps> = ({
  onUserUpdated,
  onUserDeleted,
  onSubscriberAdded
}) => {
  const { showNotification } = useNotification();
  const { formatPrice } = useCurrency();
  const { user } = useUser();
  const adminId = user?.id ?? '';

  const [subTab, setSubTab] = useState<'users' | 'subscribers' | 'analytics'>('users');
  const [users, setUsers] = useState<UserType[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [gcoinWallets, setGcoinWallets] = useState<GcoinWallet[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [analytics, setAnalytics] = useState<SubscriberAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [subSourceFilter, setSubSourceFilter] = useState<string>('all');
  const [subStatusFilter, setSubStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<EditableUser | null>(null);
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdjustingBalance, setIsAdjustingBalance] = useState(false);
  const [isAdjustingGcoin, setIsAdjustingGcoin] = useState(false);
  const [balanceAdjustment, setBalanceAdjustment] = useState({ amount: '', reason: '' });
  const [gcoinAdjustment, setGcoinAdjustment] = useState({ amount: '', reason: '' });

  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<string>('');
  const [demoOverview, setDemoOverview] = useState<DemoAutomationOverview | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (subTab === 'analytics') {
      loadAnalytics();
    }
  }, [subTab]);

  const loadData = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [uData, wData, sData, gData, demoData] = await Promise.all([
        AdminService.getUsers(),
        WalletService.getAllWallets(),
        AdminService.getSubscribers(),
        GcoinService.getAllWallets(),
        AdminService.getSystemDemoAccountsOverview().catch(() => null)
      ]);
      setUsers(uData || []);
      setWallets(wData || []);
      setSubscribers(sData || []);
      setGcoinWallets(gData || []);
      setDemoOverview(demoData);
      showNotification('success', 'Data Loaded', 'User data refreshed successfully.');
    } catch (error) {
      console.error('Failed to load users/subscribers data:', error);
      setError('Failed to load user or subscriber data. Please try again.');
      showNotification('error', 'Load Error', 'Failed to load user or subscriber data.');
      setUsers([]);
      setWallets([]);
      setSubscribers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const data = await AdminService.getSubscriberAnalytics();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
      showNotification('error', 'Load Error', 'Failed to load subscriber analytics.');
      setAnalytics(null);
    }
  };

  const getUserWallet = (userId: string) => wallets.find(w => w.userId === userId);
  const getGcoinWallet = (userId: string) => gcoinWallets.find(w => w.userId === userId || w.user_id === userId);
  const formatGcoin = (value?: number) => {
    if (value === undefined || value === null || Number.isNaN(Number(value))) return '—';
    return Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  };

  const handleEditUser = (user: UserType) => {
    setEditingUser({ ...user, password: '' });
    setBalanceAdjustment({ amount: '', reason: '' });
    setGcoinAdjustment({ amount: '', reason: '' });
    setIsEditModalOpen(true);
  };

  const handleStatusUpdate = async (userId: string, status: string) => {
    try {
      await AdminService.updateUserStatus(userId, status, adminId);
      showNotification('success', 'Status Updated', `User status set to ${status}.`);
      loadData();
    } catch (error) {
      console.error('Failed to update status:', error);
      showNotification('error', 'Status Error', 'Failed to update user status.');
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editingUser.id) return;

    setIsSaving(true);
    try {
      const { password, ...userPayload } = editingUser;
      await AdminService.updateUserDetail(editingUser.id, userPayload, adminId);
      if (password && password.trim()) {
        await AdminService.updateUserPassword(editingUser.id, password.trim(), adminId);
      }
      showNotification('success', 'User Updated', 'User details saved successfully.');
      setIsEditModalOpen(false);
      loadData();
      if (onUserUpdated) onUserUpdated();
    } catch (error) {
      console.error('Failed to update user:', error);
      showNotification('error', 'Update Error', 'Failed to update user details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdjustBalance = async () => {
    if (!editingUser?.id) return;
    const amount = Number(balanceAdjustment.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      showNotification('warning', 'Invalid Amount', 'Enter a non-zero balance adjustment.');
      return;
    }
    setIsAdjustingBalance(true);
    try {
      await WalletService.adminAdjustBalance(editingUser.id, amount, balanceAdjustment.reason || 'Admin adjustment');
      showNotification('success', 'Balance Updated', 'Wallet balance adjusted successfully.');
      setBalanceAdjustment({ amount: '', reason: '' });
      loadData();
    } catch (error) {
      console.error('Failed to adjust balance:', error);
      showNotification('error', 'Adjustment Error', 'Failed to adjust wallet balance.');
    } finally {
      setIsAdjustingBalance(false);
    }
  };

  const handleAdjustGcoin = async () => {
    if (!editingUser?.id) return;
    const amount = Number(gcoinAdjustment.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      showNotification('warning', 'Invalid Amount', 'Enter a non-zero Gcoin adjustment.');
      return;
    }
    setIsAdjustingGcoin(true);
    try {
      await GcoinService.adminAdjustBalance(editingUser.id, amount, gcoinAdjustment.reason || 'Admin adjustment');
      showNotification('success', 'Gcoin Updated', 'Gcoin balance adjusted successfully.');
      setGcoinAdjustment({ amount: '', reason: '' });
      loadData();
    } catch (error) {
      console.error('Failed to adjust Gcoin:', error);
      showNotification('error', 'Adjustment Error', 'Failed to adjust Gcoin balance.');
    } finally {
      setIsAdjustingGcoin(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      try {
        await AdminService.deleteUser(userId, adminId);
        showNotification('success', 'User Deleted', 'User account removed.');
        loadData();
        if (onUserDeleted) onUserDeleted();
      } catch (error) {
        console.error('Failed to delete user:', error);
        showNotification('error', 'Deletion Error', 'Failed to delete user account.');
      }
    }
  };

  const handleSeedDemoAccounts = async () => {
    const countInput = window.prompt('How many system demo accounts should be seeded?', '50');
    const count = Number(countInput || '50');
    if (!Number.isFinite(count) || count <= 0) return;
    setDemoBusy(true);
    try {
      const result = await AdminService.seedSystemDemoAccounts(count);
      showNotification(
        'success',
        'Demo Accounts Seeded',
        `Created ${Number(result?.createdCount || 0)} account(s), existing ${Number(result?.existingCount || 0)}.`
      );
      await loadData();
    } catch (error) {
      console.error('Failed to seed demo accounts:', error);
      showNotification('error', 'Seed Failed', 'Unable to seed demo accounts right now.');
    } finally {
      setDemoBusy(false);
    }
  };

  const handleRunDemoCycle = async () => {
    setDemoBusy(true);
    try {
      const result = await AdminService.runSystemDemoAccountsCycle();
      const summary = result?.summary || {};
      showNotification(
        'success',
        'Automation Run Complete',
        `Posts: ${Number(summary.postsCreated || 0)}, Likes: ${Number(summary.likesCreated || 0)}`
      );
      await loadData();
    } catch (error: any) {
      const message = String(error?.response?.data?.error || error?.message || 'Failed to run automation cycle');
      showNotification('error', 'Automation Run Failed', message);
    } finally {
      setDemoBusy(false);
    }
  };

  const handleUpdateDemoConfig = async (patch: Partial<NonNullable<DemoAutomationOverview['config']>>) => {
    setDemoBusy(true);
    try {
      await AdminService.updateSystemDemoAccountsConfig(patch);
      await loadData();
    } catch (error) {
      console.error('Failed to update demo config:', error);
      showNotification('error', 'Update Failed', 'Unable to update demo automation settings.');
    } finally {
      setDemoBusy(false);
    }
  };

  const handleToggleDemoAccount = async (accountId: string, enabled: boolean) => {
    setDemoBusy(true);
    try {
      await AdminService.toggleSystemDemoAccountAutomation(accountId, enabled);
      await loadData();
    } catch (error) {
      console.error('Failed to toggle demo account automation:', error);
      showNotification('error', 'Update Failed', 'Unable to toggle demo account automation state.');
    } finally {
      setDemoBusy(false);
    }
  };

  const handleDeleteSubscriber = async (subscriber: Subscriber) => {
    if (!window.confirm(`Remove subscriber ${subscriber.email}?`)) return;

    try {
      await AdminService.deleteSubscriber(subscriber.id);
      setSubscribers(prev => prev.filter(s => s.id !== subscriber.id));
      showNotification('success', 'Removed', `${subscriber.email} removed from subscribers.`);
    } catch (error) {
      console.error('Failed to delete subscriber:', error);
      showNotification('error', 'Deletion Error', 'Failed to remove subscriber.');
    }
  };

  const handleFileSelect = (file: any) => {
    setEditingUser(prev => prev ? { ...prev, avatar: file.url, profilePhotoFileId: file.id } : null);
    setIsFilePickerOpen(false);
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedUsers.length === 0) return;

    const action = bulkAction;
    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${selectedUsers.length} selected user(s)?`
    );

    if (!confirmed) return;

    try {
      // Implement bulk actions based on selection
      if (action === 'delete') {
        for (const userId of selectedUsers) {
          await AdminService.deleteUser(userId, adminId);
        }
        showNotification('success', 'Bulk Action', `${selectedUsers.length} users deleted successfully.`);
      } else if (action === 'activate') {
        for (const userId of selectedUsers) {
          await AdminService.updateUserStatus(userId, 'active', adminId);
        }
        showNotification('success', 'Bulk Action', `${selectedUsers.length} users activated successfully.`);
      } else if (action === 'deactivate') {
        for (const userId of selectedUsers) {
          await AdminService.updateUserStatus(userId, 'inactive', adminId);
        }
        showNotification('success', 'Bulk Action', `${selectedUsers.length} users deactivated successfully.`);
      }

      setSelectedUsers([]);
      setBulkAction('');
      loadData();
    } catch (error) {
      console.error('Failed to perform bulk action:', error);
      showNotification('error', 'Bulk Action Failed', 'Failed to perform bulk action.');
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const selectAllUsers = () => {
    if (selectedUsers.length === users.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(users.map(user => user.id));
    }
  };

  const filteredSubscribers = subscribers.filter(s => {
    const matchesSource = subSourceFilter === 'all' || s.source === subSourceFilter;
    const matchesStatus = subStatusFilter === 'all' || s.status === subStatusFilter;
    const matchesSearch = !searchTerm ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.name && s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSource && matchesStatus && matchesSearch;
  });

  const filteredUsers = users.filter(u =>
    !searchTerm ||
    u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const editingWallet = editingUser?.id ? getUserWallet(editingUser.id) : undefined;
  const editingGcoinWallet = editingUser?.id ? getGcoinWallet(editingUser.id) : undefined;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading user data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="text-red-500 text-lg mb-2">Error Loading Data</div>
        <div className="text-gray-600 mb-4">{error}</div>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setSubTab('users')}
            className={`px-4 py-2 text-sm font-medium rounded-md flex items-center ${
              subTab === 'users' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
            }`}
          >
            <UsersIcon className="w-4 h-4 mr-2" /> All Users ({users.length})
          </button>
          <button
            onClick={() => setSubTab('subscribers')}
            className={`px-4 py-2 text-sm font-medium rounded-md flex items-center ${
              subTab === 'subscribers' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
            }`}
          >
            <Mail className="w-4 h-4 mr-2" /> Subscribers ({subscribers.length})
          </button>
          <button
            onClick={() => setSubTab('analytics')}
            className={`px-4 py-2 text-sm font-medium rounded-md flex items-center ${
              subTab === 'analytics' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
            }`}
          >
            <BarChart3 className="w-4 h-4 mr-2" /> Analytics
          </button>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={loadData}
            disabled={refreshing}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {subTab === 'users' && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">System Demo Accounts (Admin Controlled)</h3>
                <p className="text-sm text-gray-600">
                  Labeled demo profiles for internal or controlled enterprise simulations. Use with platform policy controls.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSeedDemoAccounts}
                  disabled={demoBusy}
                  className="px-3 py-2 rounded-lg bg-gray-100 text-gray-800 text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
                >
                  Seed Accounts
                </button>
                <button
                  type="button"
                  onClick={handleRunDemoCycle}
                  disabled={demoBusy || !demoOverview?.config?.enabled}
                  className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  Run Cycle Now
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-gray-500">Managed Accounts</div>
                <div className="font-semibold text-gray-900">{Number(demoOverview?.stats?.managedAccounts || 0)}</div>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-gray-500">Automation Enabled</div>
                <div className="font-semibold text-gray-900">{Number(demoOverview?.stats?.automationEnabledAccounts || 0)}</div>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-gray-500">Last Run</div>
                <div className="font-semibold text-gray-900">
                  {demoOverview?.config?.lastRunAt ? new Date(demoOverview.config.lastRunAt).toLocaleString() : 'Never'}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(demoOverview?.config?.enabled)}
                  onChange={(event) => handleUpdateDemoConfig({ enabled: event.target.checked })}
                  disabled={demoBusy}
                />
                Enable Automation
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(demoOverview?.config?.aiEnabled)}
                  onChange={(event) => handleUpdateDemoConfig({ aiEnabled: event.target.checked })}
                  disabled={demoBusy}
                />
                Use Scrolitha for Post Drafting
              </label>
              <label className="inline-flex items-center gap-2">
                Cadence (minutes)
                <input
                  type="number"
                  min={1}
                  max={120}
                  defaultValue={Number(demoOverview?.config?.cadenceMinutes || 15)}
                  onBlur={(event) =>
                    handleUpdateDemoConfig({ cadenceMinutes: Number(event.target.value || 15) })
                  }
                  className="w-20 px-2 py-1 border border-gray-300 rounded"
                  disabled={demoBusy}
                />
              </label>
            </div>

            {Array.isArray(demoOverview?.accounts) && demoOverview!.accounts!.length > 0 && (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Demo Account</th>
                      <th className="px-3 py-2 text-left">Profession</th>
                      <th className="px-3 py-2 text-left">Country</th>
                      <th className="px-3 py-2 text-left">Automation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demoOverview!.accounts!.slice(0, 20).map((entry) => (
                      <tr key={entry.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900">{entry.name || 'Unnamed'}</div>
                          <div className="text-xs text-gray-500">{entry.email}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{entry.profession || '-'}</td>
                        <td className="px-3 py-2 text-gray-700">{entry.country || '-'}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            disabled={demoBusy || !entry.isActive}
                            onClick={() => handleToggleDemoAccount(entry.id, !Boolean(entry.automationEnabled))}
                            className={`px-2.5 py-1 rounded text-xs font-medium ${
                              entry.automationEnabled
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {entry.automationEnabled ? 'Enabled' : 'Disabled'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selectedUsers.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-blue-600 mr-3" />
                <span className="font-medium text-blue-800">
                  {selectedUsers.length} user(s) selected
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <select
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-blue-500 focus:border-blue-500"
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value)}
                >
                  <option value="">Bulk Actions</option>
                  <option value="activate">Activate</option>
                  <option value="deactivate">Deactivate</option>
                  <option value="delete">Delete</option>
                </select>
                <button
                  onClick={handleBulkAction}
                  disabled={!bulkAction}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
                <button
                  onClick={() => setSelectedUsers([])}
                  className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-6 py-3 w-12">
                    <input
                      type="checkbox"
                      checked={selectedUsers.length === users.length && users.length > 0}
                      onChange={selectAllUsers}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3">User</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Wallet Balance</th>
                  <th className="px-6 py-3">Gcoin Balance</th>
                  <th className="px-6 py-3">Joined</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredUsers.map(u => {
                  const wallet = getUserWallet(u.id);
                  const gcoinWallet = getGcoinWallet(u.id);
                  const isSelected = selectedUsers.includes(u.id);
                  const statusValue = String(u.status ?? (u.isActive === false ? 'inactive' : 'active')).toLowerCase();
                  const ru = u as unknown as Record<string, any>;
                  const userFlags = ru.flags ?? (u as any).flags ?? {};
                  const isBanned = statusValue === 'banned' || userFlags.isBanned;
                  const isRestricted = statusValue === 'restricted' || userFlags.isRestricted;
                  const isSuspended = statusValue === 'suspended' || userFlags.isSuspended;
                  const isInactive = statusValue === 'inactive';
                  const displayStatus = isBanned
                    ? 'banned'
                    : isRestricted
                      ? 'restricted'
                      : isSuspended
                        ? 'suspended'
                        : isInactive
                          ? 'inactive'
                          : 'active';
                  const userLabel = u.name || u.username || u.email || 'this user';
                  return (
                    <tr key={u.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleUserSelection(u.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 flex items-center">
                        <img
                          src={u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || 'User')}&background=0D8ABC&color=fff`}
                          className="w-8 h-8 rounded-full mr-3 border border-gray-200 object-cover"
                          alt={`${u.name}'s avatar`}
                        />
                        <div>
                          <div className="font-medium text-gray-900">{u.name || u.username}</div>
                          <div className="text-xs text-gray-500">{u.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-900">
                            {formatGcoin(gcoinWallet?.balance)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {gcoinWallet?.recipientId || gcoinWallet?.recipient_id || 'No wallet'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 capitalize">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                          u.role === 'employer' ? 'bg-blue-100 text-blue-700' :
                          u.role === 'freelancer' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {u.role || 'Guest'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                          displayStatus === 'active' ? 'bg-green-100 text-green-700' :
                          displayStatus === 'inactive' ? 'bg-gray-100 text-gray-600' :
                          displayStatus === 'restricted' ? 'bg-amber-100 text-amber-700' :
                          displayStatus === 'suspended' ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {displayStatus === 'active' ? <CheckCircle className="w-3 h-3 mr-1" /> :
                           displayStatus === 'inactive' ? <Clock className="w-3 h-3 mr-1" /> :
                           displayStatus === 'restricted' ? <Lock className="w-3 h-3 mr-1" /> :
                           displayStatus === 'suspended' ? <AlertTriangle className="w-3 h-3 mr-1" /> :
                           <ShieldX className="w-3 h-3 mr-1" />}
                          {displayStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-900">
                            {wallet ? formatPrice(wallet.availableBalance, wallet.currency) : '-'}
                          </span>
                          {wallet && wallet.escrowBalance > 0 && (
                            <span className="text-xs text-gray-500 flex items-center">
                              <Lock className="w-3 h-3 mr-1" /> {formatPrice(wallet.escrowBalance, wallet.currency)} Escrow
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-sm">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          className="text-gray-600 hover:bg-gray-100 p-1.5 rounded"
                          title="View Wallet"
                          onClick={() => {
                            const available = wallet ? formatPrice(wallet.availableBalance, wallet.currency) : '—';
                            const escrow = wallet ? formatPrice(wallet.escrowBalance, wallet.currency) : '—';
                            showNotification('info', 'Wallet', `${userLabel}: ${available} available, ${escrow} escrow`);
                          }}
                        >
                          <DollarSign className="w-4 h-4" />
                        </button>
                        <button
                          className="text-amber-600 hover:bg-amber-50 p-1.5 rounded"
                          title={isRestricted ? 'Unrestrict User' : 'Restrict User'}
                          onClick={() => {
                            if (!isRestricted && !window.confirm(`Restrict ${userLabel}?`)) return;
                            handleStatusUpdate(u.id, isRestricted ? 'active' : 'restricted');
                          }}
                        >
                          {isRestricted ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        </button>
                        <button
                          className="text-red-600 hover:bg-red-50 p-1.5 rounded"
                          title={isBanned ? 'Unban User' : 'Ban User'}
                          onClick={() => {
                            if (!isBanned && !window.confirm(`Ban ${userLabel}?`)) return;
                            handleStatusUpdate(u.id, isBanned ? 'active' : 'banned');
                          }}
                        >
                          {isBanned ? <ShieldCheck className="w-4 h-4" /> : <ShieldX className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleEditUser(u)}
                          className="text-blue-600 hover:bg-blue-50 p-1.5 rounded"
                          title="Edit User"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="text-red-600 hover:bg-red-50 p-1.5 rounded"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <UsersIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-lg font-medium">No users found</p>
                {searchTerm && (
                  <p className="text-sm mt-1">Try adjusting your search term</p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {subTab === 'subscribers' && (
        <div className="space-y-4 animate-fade-in">
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
                  <option value="other">Other</option>
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
                  <option value="active">Active</option>
                  <option value="unsubscribed">Unsubscribed</option>
                </select>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Showing <strong>{filteredSubscribers.length}</strong> of {subscribers.length} subscribers
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Source</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Subscribed Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredSubscribers.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{s.email}</td>
                    <td className="px-6 py-4">{s.name || 'Unknown'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                        s.source === 'popup' ? 'bg-blue-100 text-blue-700' :
                        s.source === 'footer' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-700'
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
                        {s.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                        {s.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{new Date(s.subscribedAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        className="text-blue-600 hover:text-blue-800 p-1"
                        title="Send Email"
                        onClick={() => showNotification('info', 'Email', `Send email to ${s.email}`)}
                      >
                        <Mail className="w-4 h-4" />
                      </button>
                      <button
                        className="text-gray-400 hover:text-red-600 p-1"
                        title="Remove Subscriber"
                        onClick={() => handleDeleteSubscriber(s)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredSubscribers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-500">
                      <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-lg font-medium">No subscribers match your filters</p>
                      <p className="text-sm mt-1">Try adjusting your filters or search term</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'analytics' && analytics && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-xs font-bold text-gray-500 uppercase mb-1">Total Subscribers</div>
              <div className="text-3xl font-bold text-gray-900">{analytics.total || 0}</div>
              <div className="text-xs text-green-600 font-medium mt-1">
                <TrendingUp className="w-3 h-3 inline mr-1" /> +{analytics.growth?.month || 0} this month
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-xs font-bold text-gray-500 uppercase mb-1">Verified Users</div>
              <div className="text-3xl font-bold text-green-600">{analytics.verified || 0}</div>
              <div className="text-xs text-gray-400 mt-1">
                {((analytics.verified / (analytics.total || 1)) * 100).toFixed(1)}% verification rate
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-xs font-bold text-gray-500 uppercase mb-1">Pending Verification</div>
              <div className="text-3xl font-bold text-yellow-600">{analytics.pending || 0}</div>
              <div className="text-xs text-gray-400 mt-1">Awaiting double opt-in</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-xs font-bold text-gray-500 uppercase mb-1">Unsubscribed</div>
              <div className="text-3xl font-bold text-red-600">{analytics.unsubscribed || 0}</div>
              <div className="text-xs text-gray-400 mt-1">
                {((analytics.unsubscribed / (analytics.total || 1)) * 100).toFixed(1)}% churn rate
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-6 flex items-center">
                <Layout className="w-5 h-5 mr-2 text-blue-600" /> Source Distribution
              </h3>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="flex items-center text-gray-700 font-medium">
                      <Layout className="w-4 h-4 mr-2 text-blue-500" /> Popup Form
                    </span>
                    <span className="font-bold">
                      {analytics.sources?.popup || 0} ({((analytics.sources?.popup / (analytics.total || 1)) * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${(analytics.sources?.popup / (analytics.total || 1)) * 100}%` }}
                    ></div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 flex justify-between">
                    <span>
                      Conversion Rate: <span className="font-bold text-green-600">{analytics.conversion?.popup || 0}%</span>
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="flex items-center text-gray-700 font-medium">
                      <Layout className="w-4 h-4 mr-2 text-green-500" /> Footer Form
                    </span>
                    <span className="font-bold">
                      {analytics.sources?.footer || 0} ({((analytics.sources?.footer / (analytics.total || 1)) * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-green-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${(analytics.sources?.footer / (analytics.total || 1)) * 100}%` }}
                    ></div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 flex justify-between">
                    <span>
                      Conversion Rate: <span className="font-bold text-green-600">{analytics.conversion?.footer || 0}%</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

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

      {subTab === 'analytics' && !analytics && (
        <div className="text-center py-12 text-gray-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300 animate-pulse" />
          <p className="text-lg font-medium">Loading analytics...</p>
          <p className="text-sm mt-1">Please wait while we fetch the latest data</p>
        </div>
      )}

      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Edit User</h3>
              <button onClick={() => setIsEditModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveUser}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={editingUser.name || ''}
                    onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                    placeholder="Enter full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={editingUser.email || ''}
                    onChange={e => setEditingUser({ ...editingUser, email: e.target.value })}
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Role</label>
                  <select
                    className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={editingUser.role || ''}
                    onChange={e => setEditingUser({ ...editingUser, role: e.target.value as UserRole })}
                  >
                    <option value="freelancer">Freelancer</option>
                    <option value="employer">Employer</option>
                    <option value="admin">Admin</option>
                    <option value="guest">Guest</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={editingUser.status || 'active'}
                    onChange={e => setEditingUser({ ...editingUser, status: e.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="restricted">Restricted</option>
                    <option value="suspended">Suspended</option>
                    <option value="banned">Banned</option>
                  </select>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">Verification Status</label>
                    <select
                      className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={String(editingUser.kycStatus || editingUser.kyc_status || (editingUser.isVerified ? 'verified' : 'pending')).toLowerCase()}
                      onChange={e => {
                        const nextStatus = e.target.value;
                        const nextVerified = nextStatus === 'verified';
                        setEditingUser({
                          ...editingUser,
                          kycStatus: nextStatus as any,
                          kyc_status: nextStatus as any,
                          isVerified: nextVerified,
                          is_verified: nextVerified
                        } as EditableUser);
                      }}
                    >
                      <option value="pending">Pending</option>
                      <option value="under_review">Under review</option>
                      <option value="verified">Verified</option>
                      <option value="rejected">Rejected</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Standard verification is controlled here. Business and Pro badge variants are still derived from account role and active plans.
                    </p>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/80 bg-white px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-gray-900">Public badge preview</div>
                      <div className="text-xs text-gray-500">How this account will appear on public cards and profiles.</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {resolveVerificationLevel({
                        isVerified: editingUser.isVerified,
                        kycStatus: editingUser.kycStatus || editingUser.kyc_status,
                        role: editingUser.role,
                        type: editingUser.role === 'employer' ? 'business' : 'user',
                        isProFreelancer: Boolean((editingUser as any).freelancerPlanActive && editingUser.role === 'freelancer'),
                        isProEmployer: Boolean((editingUser as any).employerPlanActive && editingUser.role === 'employer')
                      }) ? (
                        <VerifiedBadge
                          size={18}
                          level={resolveVerificationLevel({
                            isVerified: editingUser.isVerified,
                            kycStatus: editingUser.kycStatus || editingUser.kyc_status,
                            role: editingUser.role,
                            type: editingUser.role === 'employer' ? 'business' : 'user',
                            isProFreelancer: Boolean((editingUser as any).freelancerPlanActive && editingUser.role === 'freelancer'),
                            isProEmployer: Boolean((editingUser as any).employerPlanActive && editingUser.role === 'employer')
                          })}
                          subjectRole={editingUser.role}
                          subjectType={editingUser.role === 'employer' ? 'business' : 'user'}
                        />
                      ) : (
                        <span className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500">
                          No badge
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Set New Password</label>
                  <input
                    type="password"
                    className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={editingUser.password || ''}
                    onChange={e => setEditingUser({ ...editingUser, password: e.target.value })}
                    placeholder="Leave blank to keep current password"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave blank if you don't want to change the password.</p>
                </div>
              </div>
              <div className="mt-6 border-t pt-4 space-y-4">
                <h4 className="text-sm font-semibold text-gray-800">Wallet & Gcoin Management</h4>
                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="text-xs uppercase text-gray-500">Wallet Balance</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {editingWallet ? formatPrice(editingWallet.availableBalance, editingWallet.currency) : '—'}
                    </div>
                    {editingWallet && editingWallet.escrowBalance > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        Escrow: {formatPrice(editingWallet.escrowBalance, editingWallet.currency)}
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="text-xs uppercase text-gray-500">Gcoin Balance</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatGcoin(editingGcoinWallet?.balance)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Recipient ID: {editingGcoinWallet?.recipientId || editingGcoinWallet?.recipient_id || 'Not created'}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Adjust Wallet Balance</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={balanceAdjustment.amount}
                      onChange={e => setBalanceAdjustment({ ...balanceAdjustment, amount: e.target.value })}
                      placeholder="Use negative amount to debit (e.g., -50)"
                    />
                    <input
                      type="text"
                      className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={balanceAdjustment.reason}
                      onChange={e => setBalanceAdjustment({ ...balanceAdjustment, reason: e.target.value })}
                      placeholder="Reason (optional)"
                    />
                    <button
                      type="button"
                      onClick={handleAdjustBalance}
                      disabled={isAdjustingBalance}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {isAdjustingBalance ? 'Adjusting...' : 'Apply Wallet Adjustment'}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Adjust Gcoin Balance</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={gcoinAdjustment.amount}
                      onChange={e => setGcoinAdjustment({ ...gcoinAdjustment, amount: e.target.value })}
                      placeholder="Use negative amount to debit (e.g., -25)"
                    />
                    <input
                      type="text"
                      className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={gcoinAdjustment.reason}
                      onChange={e => setGcoinAdjustment({ ...gcoinAdjustment, reason: e.target.value })}
                      placeholder="Reason (optional)"
                    />
                    <button
                      type="button"
                      onClick={handleAdjustGcoin}
                      disabled={isAdjustingGcoin}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {isAdjustingGcoin ? 'Adjusting...' : 'Apply Gcoin Adjustment'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersManagementTab;
