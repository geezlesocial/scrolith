import React from 'react';
import EnterpriseAvatar from '../common/EnterpriseAvatar';
import type { LucideIcon } from 'lucide-react';
import { CircleDot, X } from 'lucide-react';

export interface DrawerItem {
  tab: string;
  label: string;
  icon: LucideIcon;
  badgeCount?: number;
  description?: string;
}

export interface DrawerSection {
  id: string;
  title: string;
  description?: string;
  items: DrawerItem[];
}

interface MobileDrawerNavProps {
  userName: string;
  userAvatar?: string | null;
  roleLabel: string;
  sections: DrawerSection[];
  activeTab: string;
  onTabSelect: (tab: string) => void;
  onRoleSwitch: () => void;
  roleSwitchLabel: string;
  onClose: () => void;
  onBackToSite: () => void;
  socketConnected?: boolean;
  unreadMessages?: number;
  unreadSupport?: number;
}

const renderBadge = (badgeCount?: number) => {
  if (!badgeCount || badgeCount < 1) return null;
  return (
    <span className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
      {badgeCount > 99 ? '99+' : badgeCount}
    </span>
  );
};

const renderStatusChip = (label: string, value: string, tone: 'indigo' | 'green' | 'slate') => {
  const toneClass =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'indigo'
        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
        : 'border-slate-200 bg-slate-100 text-slate-700';
  return (
    <div className={['rounded-2xl border px-3 py-2.5', toneClass].join(' ')}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
};

export const MobileDrawerNav: React.FC<MobileDrawerNavProps> = ({
  userName,
  userAvatar,
  roleLabel,
  sections,
  activeTab,
  onTabSelect,
  onRoleSwitch,
  roleSwitchLabel,
  onClose,
  onBackToSite,
  socketConnected = false,
  unreadMessages = 0,
  unreadSupport = 0
}) => {
  return (
    <div className="flex h-full flex-col">
      <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-3.5 text-white shadow-sm xl:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <EnterpriseAvatar
              src={userAvatar}
              name={userName}
              size="lg"
              className="border border-white/20 shadow-sm xl:!h-12 xl:!w-12"
              alt={userName}
            />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold xl:text-base">{userName}</p>
              <p className="truncate text-xs uppercase tracking-[0.18em] text-slate-300">{roleLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/15 bg-white/5 p-2 text-slate-100 transition hover:bg-white/10 md:hidden"
            aria-label="Close dashboard menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 md:grid-cols-1">
          <div
            className={[
              'rounded-2xl border px-3 py-2.5',
              socketConnected ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100' : 'border-amber-400/25 bg-amber-400/10 text-amber-100'
            ].join(' ')}
          >
            <div className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide">
              <CircleDot className="mr-1 h-3 w-3" />
              Connection
            </div>
            <p className="mt-1 text-sm font-semibold">{socketConnected ? 'Live updates' : 'Polling mode'}</p>
          </div>
          {renderStatusChip('Messages', unreadMessages > 0 ? (unreadMessages > 99 ? '99+' : String(unreadMessages)) : 'Clear', 'indigo')}
          {renderStatusChip('Support', unreadSupport > 0 ? (unreadSupport > 99 ? '99+' : String(unreadSupport)) : 'Clear', unreadSupport > 0 ? 'green' : 'slate')}
        </div>

        <button
          type="button"
          onClick={onRoleSwitch}
          className="mt-4 w-full rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
        >
          {roleSwitchLabel}
        </button>
      </div>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        {sections.map((section) => (
          <section key={section.id} className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2.5 px-1">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{section.title}</h4>
              {section.description ? <p className="mt-1 text-xs text-slate-500">{section.description}</p> : null}
            </div>

            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = activeTab === item.tab;
                return (
                  <li key={item.tab}>
                    <button
                      type="button"
                      onClick={() => onTabSelect(item.tab)}
                      className={[
                        'flex w-full items-start justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition',
                        isActive
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm'
                          : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50'
                      ].join(' ')}
                    >
                      <span className="flex min-w-0 gap-3">
                        <span
                          className={[
                            'mt-0.5 rounded-2xl p-2',
                            isActive ? 'bg-white text-indigo-700' : 'bg-slate-100 text-slate-500'
                          ].join(' ')}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{item.label}</span>
                          {item.description ? <span className="mt-0.5 block text-xs text-slate-500">{item.description}</span> : null}
                        </span>
                      </span>
                      {renderBadge(item.badgeCount)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <button
          type="button"
          onClick={onBackToSite}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Back to site
        </button>
      </div>
    </div>
  );
};

export default MobileDrawerNav;
