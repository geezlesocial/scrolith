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
  RefreshCw,
  Video
} from 'lucide-react';

import type { User as UserType, UserRole, GcoinWallet } from '../../types';
import { AdminService } from '../../services/admin';
import { WalletService } from '../../services/wallet';
import { GcoinService } from '../../services/gcoin';
import { useNotification } from '../../context/NotificationContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useUser } from '../../context/UserContext';
import VerifiedBadge from '../../components/common/VerifiedBadge';
import FilePickerModal from '../shared/FilePickerModal';
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
    username?: string | null;
    avatar?: string | null;
    profilePhotoFileId?: string | null;
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
  const [partialWarning, setPartialWarning] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [subSourceFilter, setSubSourceFilter] = useState<string>('all');
  const [subStatusFilter, setSubStatusFilter] = useState<string>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'inactive' | 'suspended' | 'banned' | 'restricted'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<EditableUser | null>(null);
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdjustingBalance, setIsAdjustingBalance] = useState(false);
  const [isAdjustingGcoin, setIsAdjustingGcoin] = useState(false);
  const [isModerating, setIsModerating] = useState(false);
  const [balanceAdjustment, setBalanceAdjustment] = useState({ amount: '', reason: '' });
  const [gcoinAdjustment, setGcoinAdjustment] = useState({ amount: '', reason: '' });
  const [moderationAction, setModerationAction] = useState({
    action: 'warning' as 'warning' | 'strike' | 'restriction' | 'ban',
    reason: '',
    userMessage: '',
    restrictedFeatures: 'post, comment, react',
    restrictionHours: '24'
  });
  const [userModeration, setUserModeration] = useState<any | null>(null);

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

  useEffect(() => {
    if (!isEditModalOpen || !editingUser?.id) {
      setUserModeration(null);
      return;
    }

    let active = true;
    AdminService.getUserModerationStatus(editingUser.id)
      .then((data) => {
        if (active) setUserModeration(data || null);
      })
      .catch((error) => {
        console.error('Failed to load user moderation summary:', error);
        if (active) setUserModeration(null);
      });

    return () => {
      active = false;
    };
  }, [editingUser?.id, isEditModalOpen]);

  const resolveUserStatus = (u: Partial<UserType> & { status?: string; flags?: any }) => {
    const statusValue = String(u.status ?? (u.isActive === false ? 'inactive' : 'active')).toLowerCase();
    const flags = (u as any).flags || {};
    if (statusValue === 'banned' || flags.isBanned) return 'banned';
    if (statusValue === 'restricted' || flags.isRestricted) return 'restricted';
    if (statusValue === 'suspended' || flags.isSuspended) return 'suspended';
    if (statusValue === 'inactive' || u.isActive === false) return 'inactive';
    return 'active';
  };

  const loadData = async () => {
    setRefreshing(true);
    setError(null);
    setPartialWarning(null);
    // Load users first (primary). Secondary sources must not blank the entire page.
    try {
      const uData = await AdminService.getUsers();
      setUsers(Array.isArray(uData) ? uData : []);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError('Failed to load users. Your session may be inactive or unauthorized.');
      showNotification('error', 'Load Error', 'Failed to load users.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const secondaryErrors: string[] = [];
    const [wResult, sResult, gResult, demoResult] = await Promise.allSettled([
      WalletService.getAllWallets(),
      AdminService.getSubscribers(),
      GcoinService.getAllWallets(),
      AdminService.getSystemDemoAccountsOverview()
    ]);

    if (wResult.status === 'fulfilled') setWallets(wResult.value || []);
    else {
      secondaryErrors.push('wallets');
      setWallets([]);
    }
    if (sResult.status === 'fulfilled') setSubscribers(sResult.value || []);
    else {
      secondaryErrors.push('subscribers');
      setSubscribers([]);
    }
    if (gResult.status === 'fulfilled') setGcoinWallets(gResult.value || []);
    else {
      secondaryErrors.push('gcoin');
      setGcoinWallets([]);
    }
    if (demoResult.status === 'fulfilled') setDemoOverview(demoResult.value);
    else setDemoOverview(null);

    if (secondaryErrors.length) {
      setPartialWarning(`Loaded users, but failed: ${secondaryErrors.join(', ')}. Deactivated accounts remain listed.`);
    } else {
      showNotification('success', 'Data Loaded', 'User data refreshed successfully.');
    }
    setLoading(false);
    setRefreshing(false);
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

  const handleEditUser = (user: Partial<UserType> & { id: string }) => {
    setEditingUser({
      ...user,
      username: user.username ?? '',
      avatar: user.avatar ?? '',
      profilePhotoFileId: user.profilePhotoFileId ?? undefined,
      password: ''
    });
    setBalanceAdjustment({ amount: '', reason: '' });
    setGcoinAdjustment({ amount: '', reason: '' });
    setModerationAction({
      action: 'warning',
      reason: '',
      userMessage: '',
      restrictedFeatures: 'post, comment, react',
      restrictionHours: '24'
    });
    setUserModeration(null);
    setIsEditModalOpen(true);
  };

  const handleEditDemoAccount = (entry: NonNullable<DemoAutomationOverview['accounts']>[number]) => {
    handleEditUser({
      id: entry.id,
      name: entry.name || '',
      email: entry.email || '',
      username: entry.username || '',
      avatar: entry.avatar || '',
      profilePhotoFileId: entry.profilePhotoFileId || undefined,
      role: 'user',
      status: entry.isActive ? 'active' : 'inactive',
      isActive: Boolean(entry.isActive)
    } as Partial<UserType> & { id: string });
  };

  const handleStatusUpdate = async (userId: string, status: string) => {
    try {
      // Optimistic keep-in-list update so deactivated rows never "disappear"
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                status,
                isActive: status === 'active' || status === 'restricted'
              }
            : u
        )
      );
      await AdminService.updateUserStatus(userId, status, adminId);
      showNotification('success', 'Status Updated', `User status set to ${status}.`);
      loadData();
    } catch (error) {
      console.error('Failed to update status:', error);
      showNotification('error', 'Status Error', 'Failed to update user status.');
      loadData();
    }
  };

  const handleVideoCallCapabilityUpdate = async (
    user: Partial<UserType> & { id: string },
    videoCallsEnabled: boolean
  ) => {
    const userLabel = user.name || user.username || user.email || 'this user';
    const actionLabel = videoCallsEnabled ? 'enable' : 'disable';
    if (!window.confirm(`Confirm ${actionLabel} video calling for ${userLabel}?`)) return;
    const reason = window.prompt(
      videoCallsEnabled
        ? 'Optional admin reason for enabling video calling:'
        : 'Admin reason for disabling video calling:',
      videoCallsEnabled ? 'Restored by admin' : ''
    );
    if (reason === null) return;

    try {
      const updated = await AdminService.updateUserCallCapabilities(
        user.id,
        { videoCallsEnabled, reason: reason.trim() || undefined },
        adminId
      );
      setUsers((prev) => prev.map((entry) => (entry.id === user.id ? updated : entry)));
      setEditingUser((prev) => (prev?.id === user.id ? { ...prev, ...updated } : prev));
      showNotification(
        'success',
        'Video Calls Updated',
        `Video calling ${videoCallsEnabled ? 'enabled' : 'disabled'} for ${userLabel}.`
      );
    } catch (error: any) {
      console.error('Failed to update video call capability:', error);
      showNotification(
        'error',
        'Video Calls Error',
        extractAdminError(error, 'Failed to update video calling control.')
      );
      loadData();
    }
  };

  const extractAdminError = (error: any, fallback: string) =>
    String(
      error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        fallback
    );

  const isScrolithaAccount = (userLike?: Partial<UserType> | EditableUser | null) => {
    if (!userLike) return false;
    const username = String(userLike.username || '')
      .trim()
      .toLowerCase()
      .replace(/^@/, '');
    const email = String(userLike.email || '').trim().toLowerCase();
    return (
      username === 'scrolitha' ||
      email === 'scrolitha@system.scrolith.internal' ||
      email.endsWith('@system.scrolith.internal') ||
      Boolean((userLike as any).isScrolitha || (userLike as any).is_scrolitha)
    );
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editingUser.id) return;

    setIsSaving(true);
    try {
      const scrolitha = isScrolithaAccount(editingUser);
      // Backend PUT whitelist only. Human KYC isVerified is blocked (403).
      // Scrolitha platform identity allows isVerified (public badge control).
      const payload: Record<string, any> = {};
      if (typeof editingUser.name === 'string') payload.name = editingUser.name.trim();
      if (typeof editingUser.email === 'string') payload.email = editingUser.email.trim();
      if (scrolitha) {
        payload.username = 'scrolitha';
      } else if (typeof editingUser.username === 'string') {
        const nextUsername = editingUser.username.trim();
        if (nextUsername) payload.username = nextUsername;
      }
      if (typeof editingUser.avatar === 'string' && editingUser.avatar.trim()) {
        payload.avatar = editingUser.avatar.trim();
      }
      if (editingUser.profilePhotoFileId) {
        payload.profilePhotoFileId = editingUser.profilePhotoFileId;
      }
      if (editingUser.role && !scrolitha) payload.role = editingUser.role;

      if (scrolitha) {
        const verification = String(
          editingUser.kycStatus ||
            editingUser.kyc_status ||
            (editingUser.isVerified ? 'verified' : 'pending')
        )
          .trim()
          .toLowerCase();
        payload.isVerified = verification === 'verified';
      }

      const nextStatus = String(editingUser.status || '').trim().toLowerCase();
      if (nextStatus) {
        payload.status = nextStatus;
        payload.isActive = nextStatus === 'active' || nextStatus === 'restricted';
      }

      await AdminService.updateUserDetail(editingUser.id, payload as Partial<UserType>, adminId);

      const password = String(editingUser.password || '').trim();
      if (password && !scrolitha) {
        await AdminService.updateUserPassword(editingUser.id, password, adminId);
      }

      if (nextStatus && !scrolitha) {
        try {
          await AdminService.updateUserStatus(editingUser.id, nextStatus, adminId);
        } catch {
          // Non-fatal if PUT already applied isActive.
        }
      }

      showNotification(
        'success',
        scrolitha ? 'Scrolitha Updated' : 'User Updated',
        scrolitha
          ? 'Scrolitha email, profile photo, and verification badge were saved.'
          : 'Profile, role, and status changes were saved.'
      );
      setIsEditModalOpen(false);
      await loadData();
      if (onUserUpdated) onUserUpdated();
    } catch (error: any) {
      console.error('Failed to update user:', error);
      showNotification(
        'error',
        'Update Error',
        extractAdminError(error, 'Failed to update user details.')
      );
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

  const handleApplyModeration = async () => {
    if (!editingUser?.id) return;
    const restrictedFeatures = moderationAction.restrictedFeatures
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    const restrictionHours = Number(moderationAction.restrictionHours || 0);
    if (moderationAction.action === 'restriction' && restrictedFeatures.length === 0) {
      showNotification('warning', 'Missing Features', 'Select at least one restricted feature or keep the default set.');
      return;
    }
    setIsModerating(true);
    try {
      const result = await AdminService.applyUserModerationAction(
        editingUser.id,
        {
          action: moderationAction.action,
          reason: moderationAction.reason || undefined,
          userMessage: moderationAction.userMessage || undefined,
          severity: moderationAction.action === 'ban' ? 'high' : moderationAction.action === 'restriction' ? 'medium' : 'low',
          restrictedFeatures: restrictedFeatures.length ? restrictedFeatures : ['post', 'comment', 'react'],
          restrictionHours: Number.isFinite(restrictionHours) ? Math.max(0, restrictionHours) : 0,
          source: 'admin_users_dashboard',
          sourceLabel: 'Users dashboard'
        },
        adminId
      );
      const actionLabel = String(result?.action || moderationAction.action);
      showNotification('success', 'Moderation Applied', `Account ${actionLabel} saved successfully.`);
      setUserModeration(result || null);
      await loadData();
    } catch (error: any) {
      console.error('Failed to apply moderation action:', error);
      showNotification('error', 'Moderation Error', error?.response?.data?.error || 'Failed to apply moderation action.');
    } finally {
      setIsModerating(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (
      window.confirm(
        'Soft-delete this user? They will be deactivated and remain visible under Inactive so you can reactivate them.'
      )
    ) {
      try {
        await AdminService.updateUserStatus(userId, 'inactive', adminId);
        showNotification('success', 'User Deactivated', 'Account marked inactive (recoverable).');
        loadData();
        if (onUserDeleted) onUserDeleted();
      } catch (error) {
        console.error('Failed to soft-delete user:', error);
        showNotification('error', 'Deletion Error', 'Failed to deactivate user account.');
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
    // Optimistic UI so admin sees Apply immediately without waiting for refresh.
    setDemoOverview((prev) =>
      prev
        ? {
            ...prev,
            config: {
              ...(prev.config || {}),
              ...patch
            }
          }
        : prev
    );
    try {
      await AdminService.updateSystemDemoAccountsConfig(patch);
      showNotification('success', 'Demo Automation', 'Automation settings saved.');
      await loadData();
    } catch (error: any) {
      console.error('Failed to update demo config:', error);
      showNotification(
        'error',
        'Update Failed',
        extractAdminError(error, 'Unable to update demo automation settings.')
      );
      await loadData();
    } finally {
      setDemoBusy(false);
    }
  };

  const handleToggleDemoAccount = async (accountId: string, enabled: boolean) => {
    setDemoBusy(true);
    setDemoOverview((prev) => {
      if (!prev?.accounts) return prev;
      const accounts = prev.accounts.map((entry) =>
        entry.id === accountId ? { ...entry, automationEnabled: enabled } : entry
      );
      const automationEnabledAccounts = accounts.filter((entry) => entry.automationEnabled).length;
      return {
        ...prev,
        accounts,
        stats: {
          ...(prev.stats || {}),
          automationEnabledAccounts
        }
      };
    });
    try {
      await AdminService.toggleSystemDemoAccountAutomation(accountId, enabled);
      showNotification(
        'success',
        'Demo Account',
        `Automation ${enabled ? 'enabled' : 'disabled'} for this account.`
      );
    } catch (error: any) {
      console.error('Failed to toggle demo account automation:', error);
      showNotification(
        'error',
        'Update Failed',
        extractAdminError(error, 'Unable to toggle demo account automation state.')
      );
      await loadData();
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
    const fileId = String(file?.id || file?.fileId || '').trim();
    const rawUrl = String(file?.url || file?.contentUrl || file?.downloadUrl || '').trim();
    const contentUrl = fileId
      ? `/api/files/content/${encodeURIComponent(fileId)}`
      : rawUrl;
    setEditingUser((prev) =>
      prev
        ? {
            ...prev,
            avatar: contentUrl || rawUrl || prev.avatar,
            profilePhotoFileId: fileId || prev.profilePhotoFileId
          }
        : null
    );
    setIsFilePickerOpen(false);
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedUsers.length === 0) return;

    const action = bulkAction;
    const selectedRows = users.filter((u) => selectedUsers.includes(u.id));
    const adminSelected = selectedRows.filter((u) => String(u.role || '').toLowerCase() === 'admin');
    const includesSelf = Boolean(adminId && selectedUsers.includes(adminId));

    if (action === 'deactivate' && (adminSelected.length > 0 || includesSelf)) {
      const ok = window.confirm(
        `Warning: selection includes ${adminSelected.length} admin account(s)${
          includesSelf ? ' and your own account' : ''
        }. Deactivating admins can lock the dashboard. Continue?`
      );
      if (!ok) return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${selectedUsers.length} selected user(s)?` +
        (action === 'deactivate'
          ? '\n\nDeactivated accounts stay visible under Status filter “Inactive” so you can reactivate them.'
          : '')
    );
    if (!confirmed) return;

    try {
      if (action === 'delete') {
        for (const userId of selectedUsers) {
          // Soft-deactivate instead of hard-delete so the row remains recoverable
          await AdminService.updateUserStatus(userId, 'inactive', adminId);
        }
        showNotification(
          'success',
          'Bulk Action',
          `${selectedUsers.length} user(s) deactivated (soft). They remain listed as Inactive.`
        );
      } else if (action === 'activate') {
        for (const userId of selectedUsers) {
          await AdminService.updateUserStatus(userId, 'active', adminId);
        }
        showNotification('success', 'Bulk Action', `${selectedUsers.length} users activated successfully.`);
      } else if (action === 'deactivate') {
        for (const userId of selectedUsers) {
          await AdminService.updateUserStatus(userId, 'inactive', adminId);
        }
        showNotification(
          'success',
          'Bulk Action',
          `${selectedUsers.length} users deactivated. Filter Status → Inactive to review and reactivate.`
        );
      }

      setSelectedUsers([]);
      setBulkAction('');
      if (action === 'deactivate' || action === 'delete') setUserStatusFilter('all');
      loadData();
    } catch (error) {
      console.error('Failed to perform bulk action:', error);
      showNotification('error', 'Bulk Action Failed', 'Failed to perform bulk action.');
      loadData();
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

  const statusCounts = users.reduce(
    (acc, u) => {
      const s = resolveUserStatus(u);
      acc[s] = (acc[s] || 0) + 1;
      acc.all += 1;
      return acc;
    },
    { all: 0, active: 0, inactive: 0, suspended: 0, banned: 0, restricted: 0 } as Record<string, number>
  );

  const filteredUsers = users.filter((u) => {
    const status = resolveUserStatus(u);
    const matchesStatus = userStatusFilter === 'all' || status === userStatusFilter;
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !q ||
      u.name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const getUserForSubscriber = (subscriber: Subscriber) => {
    const email = subscriber.email?.trim().toLowerCase();
    if (!email) return undefined;
    return users.find((u) => u.email?.trim().toLowerCase() === email);
  };

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

  if (error && users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="text-red-500 text-lg mb-2">Error Loading Data</div>
        <div className="text-gray-600 mb-4 max-w-md text-center">{error}</div>
        <p className="text-xs text-gray-500 mb-4 max-w-md text-center">
          If accounts were bulk-deactivated, platform login is blocked until users are reactivated. Contact engineering
          or re-login after recovery.
        </p>
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
      {partialWarning ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {partialWarning}
        </div>
      ) : null}
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
          {subTab === 'users' ? (
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              value={userStatusFilter}
              onChange={(e) => setUserStatusFilter(e.target.value as typeof userStatusFilter)}
              data-testid="admin-users-status-filter"
              aria-label="Filter users by status"
            >
              <option value="all">All statuses ({statusCounts.all})</option>
              <option value="active">Active ({statusCounts.active || 0})</option>
              <option value="inactive">Inactive ({statusCounts.inactive || 0})</option>
              <option value="suspended">Suspended ({statusCounts.suspended || 0})</option>
              <option value="banned">Banned ({statusCounts.banned || 0})</option>
              <option value="restricted">Restricted ({statusCounts.restricted || 0})</option>
            </select>
          ) : null}
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
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Deactivated accounts stay in this list with status <strong>Inactive</strong>. Use the status filter or the
            unlock button to reactivate. Bulk &quot;Delete&quot; soft-deactivates (does not hard-erase) so recovery remains
            possible.
          </div>
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

            <div className="flex flex-wrap items-end gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(demoOverview?.config?.enabled)}
                  onChange={(event) =>
                    setDemoOverview((prev) =>
                      prev
                        ? { ...prev, config: { ...(prev.config || {}), enabled: event.target.checked } }
                        : prev
                    )
                  }
                  disabled={demoBusy || !demoOverview}
                />
                Enable Automation
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(demoOverview?.config?.aiEnabled)}
                  onChange={(event) =>
                    setDemoOverview((prev) =>
                      prev
                        ? { ...prev, config: { ...(prev.config || {}), aiEnabled: event.target.checked } }
                        : prev
                    )
                  }
                  disabled={demoBusy || !demoOverview}
                />
                Use Scrolitha for Post Drafting
              </label>
              <label className="inline-flex items-center gap-2">
                Cadence (minutes)
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={Number(demoOverview?.config?.cadenceMinutes || 15)}
                  onChange={(event) => {
                    const cadenceMinutes = Math.max(1, Math.min(120, Number(event.target.value || 15)));
                    setDemoOverview((prev) =>
                      prev
                        ? { ...prev, config: { ...(prev.config || {}), cadenceMinutes } }
                        : prev
                    );
                  }}
                  className="w-20 px-2 py-1 border border-gray-300 rounded"
                  disabled={demoBusy || !demoOverview}
                />
              </label>
              <button
                type="button"
                disabled={demoBusy || !demoOverview}
                onClick={() =>
                  handleUpdateDemoConfig({
                    enabled: Boolean(demoOverview?.config?.enabled),
                    aiEnabled: Boolean(demoOverview?.config?.aiEnabled),
                    cadenceMinutes: Number(demoOverview?.config?.cadenceMinutes || 15)
                  })
                }
                className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {demoBusy ? 'Saving…' : 'Apply Automation Settings'}
              </button>
            </div>

            {Array.isArray(demoOverview?.accounts) && demoOverview!.accounts!.length > 0 && (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="text-xs font-semibold text-gray-600">
                    Showing all {demoOverview!.accounts!.length} managed demo account(s)
                  </div>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter demo accounts…"
                    className="w-full max-w-xs rounded border border-gray-300 px-2 py-1 text-xs"
                  />
                </div>
                <div className="max-h-[28rem] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Demo Account</th>
                        <th className="px-3 py-2 text-left">Username</th>
                        <th className="px-3 py-2 text-left">Profession</th>
                        <th className="px-3 py-2 text-left">Country</th>
                        <th className="px-3 py-2 text-left">Automation</th>
                        <th className="px-3 py-2 text-left">Profile</th>
                      </tr>
                    </thead>
                    <tbody>
                      {demoOverview!.accounts!
                        .filter((entry) => {
                          const q = searchTerm.trim().toLowerCase();
                          if (!q) return true;
                          return [entry.name, entry.email, entry.username, entry.profession, entry.country]
                            .map((v) => String(v || '').toLowerCase())
                            .some((v) => v.includes(q));
                        })
                        .map((entry) => (
                        <tr key={entry.id} className="border-t border-gray-100">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-3">
                              <img
                                src={entry.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(entry.name || 'Demo')}&background=0D8ABC&color=fff`}
                                alt={entry.name || 'Demo account'}
                                className="h-10 w-10 rounded-full border border-gray-200 object-cover"
                              />
                              <div>
                                <div className="font-medium text-gray-900">{entry.name || 'Unnamed'}</div>
                                <div className="text-xs text-gray-500">{entry.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-gray-700">{entry.username || '-'}</td>
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
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => handleEditDemoAccount(entry)}
                              className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                  <option value="deactivate">Deactivate (keep visible)</option>
                  <option value="delete">Soft-delete (deactivate)</option>
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

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto animate-fade-in">
            <table className="min-w-[1120px] w-full text-sm text-left">
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
                  <th className="px-6 py-3">Video Calls</th>
                  <th className="px-6 py-3">Wallet Balance</th>
                  <th className="px-6 py-3">Gcoin Balance</th>
                  <th className="px-6 py-3">Joined</th>
                  <th className="sticky right-0 z-20 bg-gray-50 px-6 py-3 text-right shadow-[-8px_0_16px_-16px_rgba(15,23,42,0.65)]">Actions</th>
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
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-3">
                          <img
                            src={u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || 'User')}&background=0D8ABC&color=fff`}
                            className="w-8 h-8 rounded-full border border-gray-200 object-cover"
                            alt={`${u.name}'s avatar`}
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900">{u.name || u.username}</div>
                            <div className="break-all text-xs text-gray-500">{u.email}</div>
                            <button
                              type="button"
                              onClick={() => handleEditUser(u)}
                              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                              title="Manage this user account"
                              data-testid={`admin-user-inline-manage-${u.id}`}
                              aria-label={`Manage ${userLabel}`}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Manage
                            </button>
                          </div>
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
                        {(() => {
                          const videoEnabled = u.callCapabilities?.videoCallsEnabled !== false;
                          return (
                            <button
                              type="button"
                              onClick={() => handleVideoCallCapabilityUpdate(u, !videoEnabled)}
                              className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition ${
                                videoEnabled
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-red-50 text-red-700 hover:bg-red-100'
                              }`}
                              title={videoEnabled ? 'Deactivate video calls for this user' : 'Activate video calls for this user'}
                              data-testid={`admin-user-video-calls-${u.id}`}
                            >
                              <Video className="h-3.5 w-3.5" />
                              {videoEnabled ? 'Enabled' : 'Disabled'}
                            </button>
                          );
                        })()}
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
                      <td className="px-6 py-4 text-gray-500 text-sm">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="sticky right-0 z-10 space-x-1 whitespace-nowrap bg-white/95 px-6 py-4 text-right shadow-[-8px_0_16px_-16px_rgba(15,23,42,0.65)] backdrop-blur">
                        <button
                          className={
                            isInactive || isSuspended
                              ? 'text-emerald-700 hover:bg-emerald-50 p-1.5 rounded'
                              : 'text-gray-500 hover:bg-gray-100 p-1.5 rounded'
                          }
                          title={isInactive || isSuspended ? 'Activate account' : 'Deactivate account'}
                          data-testid={`admin-user-toggle-active-${u.id}`}
                          onClick={() => {
                            if (isInactive || isSuspended) {
                              handleStatusUpdate(u.id, 'active');
                              return;
                            }
                            if (u.id === adminId) {
                              if (
                                !window.confirm(
                                  'Deactivate your own admin account? You may lose dashboard access until reactivated.'
                                )
                              ) {
                                return;
                              }
                            } else if (!window.confirm(`Deactivate ${userLabel}? They will stay listed as Inactive.`)) {
                              return;
                            }
                            handleStatusUpdate(u.id, 'inactive');
                          }}
                        >
                          {isInactive || isSuspended ? <Unlock className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                        </button>
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
                          type="button"
                          onClick={() => handleEditUser(u)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          title="Edit user profile, role, status, photo, and more"
                          data-testid={`admin-user-edit-${u.id}`}
                          aria-label={`Edit ${userLabel}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Soft-delete ${userLabel}? Account will be deactivated and remain listed as Inactive.`
                              )
                            ) {
                              return;
                            }
                            handleStatusUpdate(u.id, 'inactive');
                          }}
                          className="text-red-600 hover:bg-red-50 p-1.5 rounded"
                          title="Soft-delete (deactivate)"
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

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Source</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Subscribed Date</th>
                  <th className="sticky right-0 z-20 bg-gray-50 px-6 py-4 text-right shadow-[-8px_0_16px_-16px_rgba(15,23,42,0.65)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredSubscribers.map(s => {
                  const linkedUser = getUserForSubscriber(s);
                  return (
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
                    <td className="sticky right-0 z-10 space-x-2 whitespace-nowrap bg-white/95 px-6 py-4 text-right shadow-[-8px_0_16px_-16px_rgba(15,23,42,0.65)] backdrop-blur">
                      {linkedUser ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          title="Manage linked user account"
                          onClick={() => handleEditUser(linkedUser)}
                          data-testid={`admin-subscriber-manage-user-${s.id}`}
                          aria-label={`Manage linked user for ${s.email}`}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Manage user
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-500">
                          <User className="h-3.5 w-3.5" />
                          No account
                        </span>
                      )}
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
                );
                })}
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
                {isScrolithaAccount(editingUser) ? (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs text-indigo-900">
                    <strong className="font-semibold">Official Scrolitha AI identity.</strong>{' '}
                    You can update display name, email, profile photo, and the public verified badge.
                    Username stays reserved as <code className="font-mono">scrolitha</code> for mentions and messaging.
                  </div>
                ) : null}
                <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <button
                    type="button"
                    onClick={() => setIsFilePickerOpen(true)}
                    className="group relative h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-gray-200 shadow-sm"
                    aria-label="Change profile photo"
                  >
                    <img
                      src={editingUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(editingUser.name || editingUser.username || 'User')}&background=0D8ABC&color=fff`}
                      alt={editingUser.name || editingUser.username || 'User'}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                      <Camera className="h-5 w-5 text-white" />
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900">Profile photo</div>
                    <div className="text-xs text-gray-500">
                      {isScrolithaAccount(editingUser)
                        ? 'Upload Scrolitha’s official photo used across messages, feed, and AI surfaces.'
                        : 'Update the account avatar and profile photo file reference.'}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFilePickerOpen(true)}
                      className="mt-2 inline-flex items-center rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-white"
                    >
                      <Camera className="mr-1.5 h-3.5 w-3.5" />
                      Change Photo
                    </button>
                  </div>
                </div>
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
                  <label className="block text-sm font-medium mb-1">Username</label>
                  <input
                    type="text"
                    className={`w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      isScrolithaAccount(editingUser) ? 'bg-gray-50 text-gray-600' : ''
                    }`}
                    value={editingUser.username || ''}
                    onChange={e => setEditingUser({ ...editingUser, username: e.target.value })}
                    placeholder="demo.username"
                    readOnly={isScrolithaAccount(editingUser)}
                    title={
                      isScrolithaAccount(editingUser)
                        ? 'Reserved system username — cannot be changed'
                        : undefined
                    }
                  />
                  {isScrolithaAccount(editingUser) ? (
                    <p className="text-xs text-gray-500 mt-1">Reserved for @scrolitha / AI assistant routing.</p>
                  ) : null}
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
                {!isScrolithaAccount(editingUser) ? (
                  <>
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
                    <option value="user">User</option>
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
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 md:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                        <Video className="h-4 w-4 text-slate-600" />
                        Video calling
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        Controls whether this account can start, accept, or publish camera/screen video.
                      </div>
                    </div>
                    {(() => {
                      const videoEnabled = editingUser.callCapabilities?.videoCallsEnabled !== false;
                      return (
                        <button
                          type="button"
                          onClick={() => handleVideoCallCapabilityUpdate(editingUser as EditableUser & { id: string }, !videoEnabled)}
                          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                            videoEnabled
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                        >
                          {videoEnabled ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                          {videoEnabled ? 'Video Enabled' : 'Video Disabled'}
                        </button>
                      );
                    })()}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-600 md:grid-cols-2">
                    <div>
                      Last changed:{' '}
                      {editingUser.callCapabilities?.videoCallsUpdatedAt
                        ? new Date(editingUser.callCapabilities.videoCallsUpdatedAt).toLocaleString()
                        : 'Never'}
                    </div>
                    <div>
                      Reason: {editingUser.callCapabilities?.videoCallsAdminReason || 'No reason recorded'}
                    </div>
                  </div>
                </div>
                  </>
                ) : null}
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                      {isScrolithaAccount(editingUser) ? 'Platform verified badge' : 'Verification Status'}
                    </label>
                    <select
                      className={`w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        isScrolithaAccount(editingUser) ? '' : 'bg-gray-50'
                      }`}
                      value={String(
                        editingUser.kycStatus ||
                          editingUser.kyc_status ||
                          (editingUser.isVerified ? 'verified' : 'pending')
                      ).toLowerCase()}
                      disabled={!isScrolithaAccount(editingUser)}
                      onChange={(e) => {
                        if (!isScrolithaAccount(editingUser)) return;
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
                      title={
                        isScrolithaAccount(editingUser)
                          ? 'Controls the public verified badge for Scrolitha'
                          : 'KYC decisions use the dedicated KYC workflow'
                      }
                    >
                      <option value="pending">Pending</option>
                      <option value="under_review">Under review</option>
                      <option value="verified">Verified</option>
                      <option value="rejected">Rejected</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {isScrolithaAccount(editingUser)
                        ? 'Sets Scrolitha’s public verified badge across the platform. Apply Changes to save.'
                        : (
                          <>
                            Profile, role, status, password, photo, video calling, moderation, and wallet are fully editable here.
                            Final identity KYC approve/reject decisions run through the secure KYC workflow in{' '}
                            <button
                              type="button"
                              className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                              onClick={() => {
                                try {
                                  window.dispatchEvent(
                                    new CustomEvent('scrolith:admin-navigate', { detail: { tab: 'kyc', userId: editingUser.id } })
                                  );
                                } catch {
                                  // ignore
                                }
                                showNotification(
                                  'info',
                                  'Open KYC Management',
                                  'Use Admin → KYC Management to approve or reject this user in real time.'
                                );
                              }}
                            >
                              Admin → KYC Management
                            </button>
                            .
                          </>
                        )}
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

                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Account moderation</div>
                      <div className="text-xs text-gray-600">Apply warning, strike, temporary restrictions, or ban.</div>
                    </div>
                    <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 border border-amber-200">
                      Real-time notice
                    </div>
                  </div>

                  {userModeration?.activeViolationCount ? (
                    <div className="rounded-lg border border-amber-200 bg-white p-3 text-xs text-gray-700">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900">Current active violations</span>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">
                          {Number(userModeration.activeViolationCount || 0)}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {(userModeration.activeViolations || []).slice(0, 2).map((violation: any) => (
                          <div key={violation.id} className="rounded-md bg-gray-50 px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-gray-900 capitalize">{violation.action || violation.type}</span>
                              <span className="text-[11px] text-gray-500">{violation.expiresAt ? `until ${new Date(violation.expiresAt).toLocaleString()}` : 'active'}</span>
                            </div>
                            <div className="text-[11px] text-gray-600">{violation.reason || 'No reason provided'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-white/80 bg-white p-3 text-xs text-gray-500">
                      No active warning, strike, or restriction is currently applied.
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Action</label>
                      <select
                        className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        value={moderationAction.action}
                        onChange={(e) => setModerationAction(prev => ({ ...prev, action: e.target.value as any }))}
                      >
                        <option value="warning">Warning</option>
                        <option value="strike">Strike</option>
                        <option value="restriction">Restrict features</option>
                        <option value="ban">Ban</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Restriction hours</label>
                      <input
                        type="number"
                        min={0}
                        className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        value={moderationAction.restrictionHours}
                        onChange={(e) => setModerationAction(prev => ({ ...prev, restrictionHours: e.target.value }))}
                        placeholder="24"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Restricted features</label>
                    <input
                      type="text"
                      className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      value={moderationAction.restrictedFeatures}
                      onChange={(e) => setModerationAction(prev => ({ ...prev, restrictedFeatures: e.target.value }))}
                      placeholder="post, comment, react"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">Use post, comment, and react to block posting, commenting, or reactions.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Reason</label>
                    <textarea
                      rows={2}
                      className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      value={moderationAction.reason}
                      onChange={(e) => setModerationAction(prev => ({ ...prev, reason: e.target.value }))}
                      placeholder="Explain why this moderation action is being applied."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">User message</label>
                    <textarea
                      rows={2}
                      className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      value={moderationAction.userMessage}
                      onChange={(e) => setModerationAction(prev => ({ ...prev, userMessage: e.target.value }))}
                      placeholder="Message shown in app and email"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleApplyModeration}
                      disabled={isModerating}
                      className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
                    >
                      {isModerating ? 'Applying...' : 'Apply Moderation'}
                    </button>
                  </div>
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
              <div className="flex justify-end gap-3 mt-6 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold shadow-sm"
                  data-testid="admin-user-save-changes"
                >
                  {isSaving ? 'Applying…' : 'Apply Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <FilePickerModal
        isOpen={isFilePickerOpen}
        onClose={() => setIsFilePickerOpen(false)}
        onSelect={handleFileSelect}
        acceptedTypes="image/*"
        filterType="image"
        title="Update Demo Account Photo"
        role="admin"
      />
    </div>
  );
};

export default UsersManagementTab;
