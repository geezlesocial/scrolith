import React from 'react';
import {
  BellIcon as Bell,
  BriefcaseIcon as Briefcase,
  CoinsIcon as Coins,
  CreditCardIcon as CreditCard,
  EyeIcon as Eye,
  FileTextIcon as FileText,
  LayoutDashboardIcon as LayoutDashboard,
  LogOutIcon as LogOut,
  PlusIcon as Plus,
  Repeat2Icon as Repeat2,
  SettingsIcon as Settings,
  StarIcon as Star,
  TagIcon as Tag,
  UsersIcon as Users
} from '../../../components/icons/ShellIcons';
import { MOBILE_SHEET_CARD_CLASS } from '../mobileShellLayout';

type AccountMenuConfig = {
  dashboard?: boolean;
  viewAs?: boolean;
  switchCurrency?: boolean;
  postProject?: boolean;
  yourBriefs?: boolean;
  referFriend?: boolean;
  billingPayments?: boolean;
  settings?: boolean;
  logout?: boolean;
};

type QuickMenuConfig = {
  createPost?: boolean;
  switchUser?: boolean;
  browseJobs?: boolean;
  browseGigs?: boolean;
  community?: boolean;
  projectBrief?: boolean;
  gigCreation?: boolean;
  settings?: boolean;
};

type MobileHomeSheetsProps = {
  profileOpen: boolean;
  messagesOpen: boolean;
  currencyOpen: boolean;
  quickMenuOpen: boolean;
  onCloseProfile: () => void;
  onCloseMessages: () => void;
  onCloseCurrency: () => void;
  onCloseQuickMenu: () => void;
  accountMenu: AccountMenuConfig;
  quickMenu: QuickMenuConfig;
  currencyCode: string;
  availableCurrencies: any[];
  onSelectCurrency: (code: string) => void;
  messagesUnread: number;
  notificationsUnread: number;
  socketConnected: boolean;
  messagesLoading: boolean;
  messagesError?: string | null;
  previewConversations: any[];
  currentUserId?: string | null;
  userName?: string | null;
  userAvatar?: string | null;
  onRefreshMessages: () => void;
  onOpenConversation: (conversationId: string) => void;
  onOpenAllMessages: () => void;
  normalizedRole: string;
  isFreelancerMode: boolean;
  onDashboard: () => void;
  onViewAs: () => void;
  onSwitchCurrency: () => void;
  onPostProject: () => void;
  onYourBriefs: () => void;
  onReferFriend: () => void;
  onBilling: () => void;
  onSettings: () => void;
  onLogout: () => void;
  onSwitchUserMode: () => void;
  onCreatePost: () => void;
  onBrowseJobs: () => void;
  onBrowseGigs: () => void;
  onCommunity: () => void;
  onProjectBriefs: () => void;
  onGigCreation: () => void;
};

type MenuItemTone = 'indigo' | 'green' | 'amber' | 'slate';

type SheetMenuItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  badge?: string;
  tone?: MenuItemTone;
  onClick: () => void;
};

const relativeTime = (iso?: string | null) => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const seconds = Math.max(0, Math.floor(diff / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const toneClassMap: Record<MenuItemTone, string> = {
  indigo: 'bg-indigo-50 text-indigo-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  slate: 'bg-slate-100 text-slate-700'
};

const Sheet = ({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-950/55 p-3">
      <div className={MOBILE_SHEET_CARD_CLASS}>
        <div className="flex justify-center pt-3">
          <div className="h-1.5 w-14 rounded-full bg-slate-200" />
        </div>
        <div className="flex max-h-[88vh] flex-col">
          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-2">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
            >
              Close
            </button>
          </div>
          <div className="overflow-y-auto px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
};

const SummaryChip = ({
  label,
  value,
  tone = 'slate'
}: {
  label: string;
  value: string;
  tone?: MenuItemTone;
}) => (
  <div className={['rounded-2xl border border-transparent px-3 py-2', toneClassMap[tone]].join(' ')}>
    <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
    <p className="mt-1 text-sm font-semibold">{value}</p>
  </div>
);

const SectionTitle = ({
  title,
  description
}: {
  title: string;
  description?: string;
}) => (
  <div className="mb-2 px-1">
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
    {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
  </div>
);

const SheetItem = ({ icon, label, description, badge, tone = 'slate', onClick }: SheetMenuItem) => {
  const lastTapRef = React.useRef(0);

  const triggerAction = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 260) return;
    lastTapRef.current = now;
    onClick();
  };

  return (
    <button
      type="button"
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        triggerAction();
      }}
      onClick={triggerAction}
      className="flex w-full touch-manipulation items-start justify-between gap-3 rounded-3xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm transition hover:border-indigo-200 hover:bg-slate-50 active:scale-[0.995]"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <div className="flex min-w-0 gap-3">
        <div className={['rounded-2xl p-2.5', toneClassMap[tone]].join(' ')}>{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      {badge ? (
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          {badge}
        </span>
      ) : null}
    </button>
  );
};

const renderMenuSection = (
  title: string,
  description: string,
  items: SheetMenuItem[]
) => {
  if (items.length === 0) return null;
  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-3">
      <SectionTitle title={title} description={description} />
      <div className="grid gap-2 sm:grid-cols-2">{items.map((item) => <SheetItem key={item.id} {...item} />)}</div>
    </section>
  );
};

export default function MobileHomeSheets({
  profileOpen,
  messagesOpen,
  currencyOpen,
  quickMenuOpen,
  onCloseProfile,
  onCloseMessages,
  onCloseCurrency,
  onCloseQuickMenu,
  accountMenu,
  quickMenu,
  currencyCode,
  availableCurrencies,
  onSelectCurrency,
  messagesUnread,
  notificationsUnread,
  socketConnected,
  messagesLoading,
  messagesError,
  previewConversations,
  currentUserId,
  userName,
  userAvatar,
  onRefreshMessages,
  onOpenConversation,
  onOpenAllMessages,
  normalizedRole,
  isFreelancerMode,
  onDashboard,
  onViewAs,
  onSwitchCurrency,
  onPostProject,
  onYourBriefs,
  onReferFriend,
  onBilling,
  onSettings,
  onLogout,
  onSwitchUserMode,
  onCreatePost,
  onBrowseJobs,
  onBrowseGigs,
  onCommunity,
  onProjectBriefs,
  onGigCreation
}: MobileHomeSheetsProps) {
  const displayRole = normalizedRole.includes('admin')
    ? 'Admin'
    : isFreelancerMode
      ? 'Freelancer'
      : 'Employer';

  const workspaceItems: SheetMenuItem[] = [
    accountMenu.dashboard !== false
      ? {
          id: 'account-dashboard',
          icon: <LayoutDashboard className="h-4 w-4" />,
          label: 'Dashboard',
          description: 'Open your live command center and working modules.',
          tone: 'indigo',
          onClick: onDashboard
        }
      : null,
    accountMenu.viewAs !== false
      ? {
          id: 'account-view-as',
          icon: <Eye className="h-4 w-4" />,
          label: 'View profile',
          description: 'Preview your public identity and presentation.',
          tone: 'slate',
          onClick: onViewAs
        }
      : null,
    accountMenu.postProject !== false
      ? {
          id: 'account-post-project',
          icon: <Briefcase className="h-4 w-4" />,
          label: isFreelancerMode ? 'Create gig' : 'Post project',
          description: 'Launch a new commercial workflow from mobile.',
          tone: 'green',
          onClick: onPostProject
        }
      : null
  ].filter(Boolean) as SheetMenuItem[];

  const financeItems: SheetMenuItem[] = [
    accountMenu.switchCurrency !== false
      ? {
          id: 'account-currency',
          icon: <Coins className="h-4 w-4" />,
          label: 'Switch currency',
          description: 'Change pricing and billing display currency instantly.',
          badge: currencyCode || 'USD',
          tone: 'amber',
          onClick: onSwitchCurrency
        }
      : null,
    accountMenu.billingPayments !== false
      ? {
          id: 'account-billing',
          icon: <CreditCard className="h-4 w-4" />,
          label: 'Billing and payments',
          description: 'Review wallet, charges, and payment settings.',
          tone: 'indigo',
          onClick: onBilling
        }
      : null
  ].filter(Boolean) as SheetMenuItem[];

  const accountItems: SheetMenuItem[] = [
    accountMenu.yourBriefs !== false
      ? {
          id: 'account-briefs',
          icon: <FileText className="h-4 w-4" />,
          label: 'Your briefs',
          description: 'Open project briefs and saved requirement drafts.',
          tone: 'slate',
          onClick: onYourBriefs
        }
      : null,
    accountMenu.referFriend !== false
      ? {
          id: 'account-refer',
          icon: <Users className="h-4 w-4" />,
          label: 'Refer a friend',
          description: 'Share Scrolith and track referral growth.',
          tone: 'green',
          onClick: onReferFriend
        }
      : null,
    accountMenu.settings !== false
      ? {
          id: 'account-settings',
          icon: <Settings className="h-4 w-4" />,
          label: 'Settings',
          description: 'Manage preferences, privacy, and app behavior.',
          tone: 'slate',
          onClick: onSettings
        }
      : null,
    accountMenu.logout !== false
      ? {
          id: 'account-logout',
          icon: <LogOut className="h-4 w-4" />,
          label: 'Logout',
          description: 'Securely sign out of this device and account session.',
          tone: 'amber',
          onClick: onLogout
        }
      : null
  ].filter(Boolean) as SheetMenuItem[];

  const createItems: SheetMenuItem[] = [
    quickMenu.switchUser !== false && !normalizedRole.includes('admin')
      ? {
          id: 'quick-switch-mode',
          icon: <Repeat2 className="h-4 w-4" />,
          label: isFreelancerMode ? 'Switch to client mode' : 'Switch to freelancer mode',
          description: 'Change your working context without leaving mobile.',
          tone: 'indigo',
          onClick: onSwitchUserMode
        }
      : null,
    quickMenu.createPost !== false
      ? {
          id: 'quick-create-post',
          icon: <Plus className="h-4 w-4" />,
          label: 'Create post',
          description: 'Publish updates, media, and thought leadership quickly.',
          tone: 'green',
          onClick: onCreatePost
        }
      : null,
    quickMenu.projectBrief !== false
      ? {
          id: 'quick-project-briefs',
          icon: <FileText className="h-4 w-4" />,
          label: 'Scrolith Project Briefs',
          description: 'Open structured briefs and working drafts.',
          badge: 'AI',
          tone: 'amber',
          onClick: onProjectBriefs
        }
      : null,
    quickMenu.gigCreation !== false && isFreelancerMode
      ? {
          id: 'quick-gig-creation',
          icon: <Star className="h-4 w-4" />,
          label: 'Scrolith Gig Creation',
          description: 'Use guided workflow to publish a new offer.',
          badge: 'AI',
          tone: 'indigo',
          onClick: onGigCreation
        }
      : null
  ].filter(Boolean) as SheetMenuItem[];

  const discoverItems: SheetMenuItem[] = [
    quickMenu.browseJobs !== false
      ? {
          id: 'quick-browse-jobs',
          icon: <Briefcase className="h-4 w-4" />,
          label: 'Browse jobs',
          description: 'Discover current marketplace demand and openings.',
          tone: 'slate',
          onClick: onBrowseJobs
        }
      : null,
    quickMenu.browseGigs !== false
      ? {
          id: 'quick-browse-gigs',
          icon: <Tag className="h-4 w-4" />,
          label: 'Browse gigs',
          description: 'Explore services, competitors, and pricing patterns.',
          tone: 'slate',
          onClick: onBrowseGigs
        }
      : null,
    quickMenu.community !== false
      ? {
          id: 'quick-community',
          icon: <Users className="h-4 w-4" />,
          label: 'Community',
          description: 'Open the Scrolith community hub, posts, and live discussions.',
          tone: 'indigo',
          onClick: onCommunity
        }
      : null,
    quickMenu.settings !== false
      ? {
          id: 'quick-settings',
          icon: <Settings className="h-4 w-4" />,
          label: 'Settings',
          description: 'Jump directly into app and account preferences.',
          tone: 'slate',
          onClick: onSettings
        }
      : null
  ].filter(Boolean) as SheetMenuItem[];

  return (
    <>
      <Sheet open={profileOpen} title="Account" onClose={onCloseProfile}>
        <div className="space-y-4">
          <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 text-white shadow-sm">
            <div className="flex items-center gap-3">
              <img
                src={userAvatar || 'https://ui-avatars.com/api/?name=User&background=1f2937&color=fff'}
                alt={userName || 'User'}
                className="h-14 w-14 rounded-full border border-white/20 object-cover shadow-sm"
              />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{userName || 'Scrolith user'}</p>
                <p className="truncate text-xs uppercase tracking-[0.18em] text-slate-300">{displayRole} workspace</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <SummaryChip label="Connection" value={socketConnected ? 'Live' : 'Sync'} tone={socketConnected ? 'green' : 'amber'} />
              <SummaryChip label="Currency" value={currencyCode || 'USD'} tone="indigo" />
              <SummaryChip label="Messages" value={messagesUnread > 0 ? (messagesUnread > 99 ? '99+' : String(messagesUnread)) : 'Clear'} tone="slate" />
              <SummaryChip label="Alerts" value={notificationsUnread > 0 ? (notificationsUnread > 99 ? '99+' : String(notificationsUnread)) : 'Clear'} tone="slate" />
            </div>
          </section>

          {renderMenuSection('Workspace', 'Primary control surfaces for day-to-day execution.', workspaceItems)}
          {renderMenuSection('Finance', 'Payments, billing, and currency controls.', financeItems)}
          {renderMenuSection('Account', 'Preferences, briefs, referral, and session management.', accountItems)}
        </div>
      </Sheet>

      <Sheet open={messagesOpen} title="Messages" onClose={onCloseMessages}>
        <div className="space-y-4">
          <section className="rounded-[28px] border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Inbox</p>
                <p className="mt-1 text-base font-semibold">
                  {messagesUnread > 0 ? `${messagesUnread} unread conversations` : 'Conversation feed is clear'}
                </p>
              </div>
              <button
                type="button"
                onClick={onRefreshMessages}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Refresh
              </button>
            </div>
          </section>

          {messagesError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {messagesError}
            </div>
          ) : null}

          <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
            {messagesLoading && previewConversations.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                Loading conversations...
              </div>
            ) : null}

            {!messagesLoading && previewConversations.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                No conversations yet.
              </div>
            ) : null}

            {previewConversations.map((conversation: any) => {
              const convoId = String(conversation?.id || '').trim();
              const participants = Array.isArray(conversation?.participants) ? conversation.participants : [];
              const other =
                participants.find((p: any) => String(p?.id || '').trim() && String(p.id) !== String(currentUserId || '')) ||
                participants[0] ||
                null;
              const name = String(other?.name || 'Conversation').trim();
              const avatarUrl = other?.avatar || other?.avatar_url || null;
              const lastMessage = String(conversation?.lastMessage || conversation?.last_message || '').trim();
              const lastAt = conversation?.lastMessageAt || conversation?.last_message_at || null;
              const unread = Number(conversation?.unreadCount ?? conversation?.unread_count ?? 0) || 0;
              const starred = Boolean(conversation?.isStarred ?? conversation?.is_starred ?? false);

              return (
                <button
                  key={convoId || `${name}-${lastAt || 'time'}`}
                  type="button"
                  onClick={() => onOpenConversation(convoId)}
                  className="flex w-full items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm transition hover:border-indigo-200 hover:bg-slate-50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                      {avatarUrl ? <img src={avatarUrl} alt={name} className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
                        {starred ? <Star className="h-4 w-4 text-amber-500" /> : null}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {lastMessage || 'Tap to open conversation'}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="text-[10px] font-semibold text-slate-400">{relativeTime(lastAt) || ''}</div>
                    {unread > 0 ? (
                      <span className="min-w-[18px] rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOpenAllMessages}
            className="w-full rounded-3xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
          >
            View all messages
          </button>
        </div>
      </Sheet>

      <Sheet open={currencyOpen} title="Switch currency" onClose={onCloseCurrency}>
        <div className="space-y-4">
          <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Display currency</p>
            <p className="mt-2 text-base font-semibold text-slate-900">
              Current: <span className="text-indigo-700">{currencyCode || 'USD'}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">This updates pricing, wallet, and billing display across the app.</p>
          </section>

          <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
            {(Array.isArray(availableCurrencies) ? availableCurrencies : []).map((c: any) => {
              const code = String(c?.code || '').trim().toUpperCase();
              if (!code) return null;
              const name = String(c?.name || code).trim();
              const symbol = String(c?.symbol || '').trim();
              const selected = String(currencyCode || '').toUpperCase() === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => onSelectCurrency(code)}
                  className={[
                    'flex w-full items-center justify-between rounded-3xl border px-4 py-3 text-left shadow-sm transition',
                    selected
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-900 hover:border-indigo-200 hover:bg-slate-50'
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{code}</div>
                    <div className={selected ? 'mt-0.5 truncate text-xs text-slate-200' : 'mt-0.5 truncate text-xs text-slate-500'}>
                      {name}
                    </div>
                  </div>
                  <div className={selected ? 'text-lg font-semibold text-white' : 'text-lg font-semibold text-slate-700'}>
                    {symbol || ''}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Sheet>

      <Sheet open={quickMenuOpen} title="Quick menu" onClose={onCloseQuickMenu}>
        <div className="space-y-4">
          <section className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-indigo-600 to-blue-600 p-4 text-white shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-100">Action center</p>
                <p className="mt-1 text-base font-semibold">High-speed actions for mobile workflow.</p>
              </div>
              <div className="rounded-2xl bg-white/15 p-2.5">
                <Bell className="h-4 w-4" />
              </div>
            </div>
          </section>

          {renderMenuSection('Create', 'Launch content, briefs, and role changes.', createItems)}
          {renderMenuSection('Discover', 'Open marketplace exploration and navigation shortcuts.', discoverItems)}
        </div>
      </Sheet>
    </>
  );
}
