import React from 'react';
import {
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
  messagesLoading: boolean;
  messagesError?: string | null;
  previewConversations: any[];
  currentUserId?: string | null;
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
  onProjectBriefs: () => void;
  onGigCreation: () => void;
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
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/50 p-3">
      <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const SheetItem = ({
  icon,
  label,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
  >
    <div className="rounded-xl bg-slate-100 p-2 text-slate-700">{icon}</div>
    <span>{label}</span>
  </button>
);

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
  messagesLoading,
  messagesError,
  previewConversations,
  currentUserId,
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
  onProjectBriefs,
  onGigCreation
}: MobileHomeSheetsProps) {
  return (
    <>
      <Sheet open={profileOpen} title="Account" onClose={onCloseProfile}>
        <div className="space-y-1">
          {accountMenu.dashboard !== false ? (
            <SheetItem
              icon={<LayoutDashboard className="h-4 w-4" />}
              label="Dashboard"
              onClick={onDashboard}
            />
          ) : null}

          {accountMenu.viewAs !== false ? (
            <SheetItem
              icon={<Eye className="h-4 w-4" />}
              label="View as"
              onClick={onViewAs}
            />
          ) : null}

          {accountMenu.switchCurrency !== false ? (
            <SheetItem
              icon={<Coins className="h-4 w-4" />}
              label={`Switch currency (${currencyCode || 'USD'})`}
              onClick={onSwitchCurrency}
            />
          ) : null}

          {accountMenu.postProject !== false ? (
            <SheetItem
              icon={<Briefcase className="h-4 w-4" />}
              label="Post project"
              onClick={onPostProject}
            />
          ) : null}

          {accountMenu.yourBriefs !== false ? (
            <SheetItem
              icon={<FileText className="h-4 w-4" />}
              label="Your briefs"
              onClick={onYourBriefs}
            />
          ) : null}

          {accountMenu.referFriend !== false ? (
            <SheetItem
              icon={<Users className="h-4 w-4" />}
              label="Refer a Friend"
              onClick={onReferFriend}
            />
          ) : null}

          {accountMenu.billingPayments !== false ? (
            <SheetItem
              icon={<CreditCard className="h-4 w-4" />}
              label="Billing and Payments"
              onClick={onBilling}
            />
          ) : null}

          {accountMenu.settings !== false ? (
            <SheetItem
              icon={<Settings className="h-4 w-4" />}
              label="Settings"
              onClick={onSettings}
            />
          ) : null}

          {accountMenu.logout !== false ? (
            <SheetItem
              icon={<LogOut className="h-4 w-4" />}
              label="Logout"
              onClick={onLogout}
            />
          ) : null}
        </div>
      </Sheet>

      <Sheet open={messagesOpen} title="Messages" onClose={onCloseMessages}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {messagesUnread > 0 ? `${messagesUnread} unread` : 'Inbox'}
            </div>
            <button
              type="button"
              onClick={onRefreshMessages}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
            >
              Refresh
            </button>
          </div>

          {messagesError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {messagesError}
            </div>
          ) : null}

          <div className="max-h-[60vh] space-y-1 overflow-auto pr-1">
            {messagesLoading && previewConversations.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                Loading conversations...
              </div>
            ) : null}

            {!messagesLoading && previewConversations.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
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
                  className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left hover:bg-slate-50"
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
            className="w-full rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            View all messages
          </button>
        </div>
      </Sheet>

      <Sheet open={currencyOpen} title="Switch currency" onClose={onCloseCurrency}>
        <div className="space-y-3">
          <div className="text-xs text-slate-500">
            Current: <span className="font-semibold text-slate-900">{currencyCode || 'USD'}</span>
          </div>

          <div className="max-h-[60vh] space-y-1 overflow-auto pr-1">
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
                    'flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left',
                    selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
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
        <div className="space-y-1">
          {quickMenu.switchUser !== false && !normalizedRole.includes('admin') ? (
            <SheetItem
              icon={<Repeat2 className="h-4 w-4" />}
              label={isFreelancerMode ? 'Switch to Client mode' : 'Switch to Freelancer mode'}
              onClick={onSwitchUserMode}
            />
          ) : null}

          {quickMenu.createPost !== false ? (
            <SheetItem
              icon={<Plus className="h-4 w-4" />}
              label="Create post"
              onClick={onCreatePost}
            />
          ) : null}

          {quickMenu.browseJobs !== false ? (
            <SheetItem
              icon={<Briefcase className="h-4 w-4" />}
              label="Browse jobs"
              onClick={onBrowseJobs}
            />
          ) : null}

          {quickMenu.browseGigs !== false ? (
            <SheetItem
              icon={<Tag className="h-4 w-4" />}
              label="Browse gigs"
              onClick={onBrowseGigs}
            />
          ) : null}

          {quickMenu.projectBrief !== false ? (
            <SheetItem
              icon={<FileText className="h-4 w-4" />}
              label="Scrolith Project Briefs"
              onClick={onProjectBriefs}
            />
          ) : null}

          {quickMenu.gigCreation !== false && isFreelancerMode ? (
            <SheetItem
              icon={<Star className="h-4 w-4" />}
              label="Scrolith Gig Creation"
              onClick={onGigCreation}
            />
          ) : null}

          {quickMenu.settings !== false ? (
            <SheetItem
              icon={<Settings className="h-4 w-4" />}
              label="Settings"
              onClick={onSettings}
            />
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
