import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BellIcon as Bell,
  BriefcaseIcon as Briefcase,
  HomeIcon as Home,
  MessageCircleIcon as MessageCircle,
  PlusSquareIcon as PlusSquare,
  UsersIcon as Users
} from '../../../components/icons/ShellIcons';
import { MOBILE_BOTTOM_NAV_CONTAINER_CLASS } from '../mobileShellLayout';
import { pulseTapFeedback } from '../../runtime/nativeChrome';

export type MobileTabKey = 'home' | 'network' | 'post' | 'notifications' | 'jobs' | 'messages';

export type MobileHomeLayoutSettings = {
  bottomTabs?: Partial<Record<MobileTabKey, boolean>>;
  badges?: {
    notificationsUnread?: number;
    messagesUnread?: number;
  };
};

export default function MobileBottomNav({
  activeTab,
  onChange,
  settings
}: {
  activeTab: MobileTabKey;
  onChange: (tab: MobileTabKey) => void;
  settings?: MobileHomeLayoutSettings | null;
}) {
  const tabs = settings?.bottomTabs ?? {
    home: true,
    network: true,
    post: true,
    notifications: true,
    jobs: true,
    messages: false
  };

  const badges = settings?.badges ?? {};
  const recentTouchActionRef = useRef<{ key: MobileTabKey; at: number } | null>(null);
  const [optimisticActiveTab, setOptimisticActiveTab] = useState<MobileTabKey>(activeTab);

  useEffect(() => {
    setOptimisticActiveTab(activeTab);
  }, [activeTab]);

  const triggerTabChange = useCallback(
    (key: MobileTabKey, target?: HTMLElement | null) => {
      const now = Date.now();
      const previous = recentTouchActionRef.current;
      if (previous?.key === key && now - previous.at < 260) return;
      recentTouchActionRef.current = { key, at: now };
      pulseTapFeedback(target);
      setOptimisticActiveTab(key);
      onChange(key);
    },
    [onChange]
  );

  const items: Array<{
    key: MobileTabKey;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
    enabled: boolean;
    badge?: number;
    isPrimary?: boolean;
  }> = [
    {
      key: 'home',
      label: 'Home',
      shortLabel: 'Home',
      icon: <Home className="h-5 w-5" strokeWidth={2.1} />,
      enabled: Boolean(tabs.home)
    },
    {
      key: 'network',
      label: 'My Network',
      shortLabel: 'Network',
      icon: <Users className="h-5 w-5" strokeWidth={2.1} />,
      enabled: Boolean(tabs.network)
    },
    {
      key: 'post',
      label: 'Create post',
      shortLabel: 'Post',
      icon: <PlusSquare className="h-6 w-6" strokeWidth={2.2} />,
      enabled: Boolean(tabs.post),
      isPrimary: true
    },
    {
      key: 'notifications',
      label: 'Notifications',
      shortLabel: 'Alerts',
      icon: <Bell className="h-5 w-5" strokeWidth={2.1} />,
      enabled: Boolean(tabs.notifications),
      badge: badges.notificationsUnread
    },
    {
      key: 'jobs',
      label: 'Jobs',
      shortLabel: 'Jobs',
      icon: <Briefcase className="h-5 w-5" strokeWidth={2.1} />,
      enabled: Boolean(tabs.jobs)
    },
    {
      key: 'messages',
      label: 'Messages',
      shortLabel: 'Chat',
      icon: <MessageCircle className="h-5 w-5" strokeWidth={2.1} />,
      enabled: Boolean(tabs.messages),
      badge: badges.messagesUnread
    }
  ];

  const visible = items.filter((i) => i.enabled);

  return (
    <nav
      className="pointer-events-auto fixed bottom-0 left-0 right-0 z-[140] border-t border-slate-200/90 bg-white/92 shadow-[0_-8px_28px_-18px_rgba(15,23,42,0.28)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/85"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Primary"
    >
      <div className={MOBILE_BOTTOM_NAV_CONTAINER_CLASS}>
        {visible.map((item) => {
          const isActive = optimisticActiveTab === item.key;
          const primary = item.isPrimary;
          return (
            <button
              key={item.key}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                triggerTabChange(item.key, event.currentTarget);
              }}
              className={[
                'relative flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center rounded-2xl px-1 py-1 text-[10px] font-semibold tracking-tight touch-manipulation transition-colors duration-150',
                primary
                  ? 'mx-0.5'
                  : isActive
                    ? 'text-slate-900'
                    : 'text-slate-500 active:bg-slate-100/80'
              ].join(' ')}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              type="button"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {primary ? (
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-[0_8px_20px_-10px_rgba(15,23,42,0.65)] ring-1 ring-slate-900/10">
                  {item.icon}
                </span>
              ) : (
                <div className="relative flex h-7 w-7 items-center justify-center">
                  <span
                    className={[
                      'absolute inset-0 rounded-full transition-opacity duration-150',
                      isActive ? 'bg-sky-50 opacity-100' : 'opacity-0'
                    ].join(' ')}
                    aria-hidden
                  />
                  <span className="relative z-[1]">{item.icon}</span>
                  {typeof item.badge === 'number' && item.badge > 0 ? (
                    <span className="absolute -right-2.5 -top-1.5 z-[2] min-w-[17px] rounded-full bg-red-600 px-1 py-0.5 text-center text-[9px] font-bold leading-none text-white shadow-sm">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                </div>
              )}
              <span
                className={[
                  'mt-0.5 max-w-full truncate px-0.5',
                  primary ? 'text-slate-900' : isActive ? 'text-slate-900' : 'text-slate-500'
                ].join(' ')}
              >
                {item.shortLabel}
              </span>
              {!primary && isActive ? (
                <span
                  className="absolute bottom-0.5 h-1 w-1 rounded-full bg-sky-600"
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
