import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';

export interface DrawerItem {
  tab: string;
  label: string;
  icon: LucideIcon;
  badgeCount?: number;
}

export interface DrawerSection {
  id: string;
  title: string;
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
}

const renderBadge = (badgeCount?: number) => {
  if (!badgeCount || badgeCount < 1) return null;
  return (
    <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
      {badgeCount > 99 ? '99+' : badgeCount}
    </span>
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
  onBackToSite
}) => {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={userAvatar || 'https://ui-avatars.com/api/?name=User&background=1f2937&color=fff'}
            alt={userName}
            className="h-11 w-11 rounded-full border border-slate-200 object-cover"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{userName}</p>
            <p className="truncate text-xs capitalize text-slate-500">{roleLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 md:hidden"
          aria-label="Close dashboard menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={onRoleSwitch}
        className="mb-4 rounded-full bg-blue-100 px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-200"
      >
        {roleSwitchLabel}
      </button>

      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {sections.map((section) => (
          <section key={section.id}>
            <h4 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{section.title}</h4>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = activeTab === item.tab;
                return (
                  <li key={item.tab}>
                    <button
                      type="button"
                      onClick={() => onTabSelect(item.tab)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                        isActive
                          ? 'bg-indigo-50 font-semibold text-indigo-700'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="inline-flex min-w-0 items-center">
                        <item.icon className={`mr-2 h-4 w-4 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                        <span className="truncate">{item.label}</span>
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
          className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Back to site
        </button>
      </div>
    </div>
  );
};

export default MobileDrawerNav;
