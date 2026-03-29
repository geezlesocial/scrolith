import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BellIcon as Bell,
  BriefcaseIcon as Briefcase,
  HomeIcon as Home,
  MessageCircleIcon as MessageCircle,
  PlusSquareIcon as PlusSquare,
  UsersIcon as Users
} from '../../../components/icons/ShellIcons';

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
    (key: MobileTabKey) => {
      const now = Date.now();
      const previous = recentTouchActionRef.current;
      if (previous?.key === key && now - previous.at < 450) return;
      recentTouchActionRef.current = { key, at: now };
      setOptimisticActiveTab(key);
      onChange(key);
    },
    [onChange]
  );

  const items: Array<{
    key: MobileTabKey;
    label: string;
    icon: React.ReactNode;
    enabled: boolean;
    badge?: number;
    isPrimary?: boolean;
  }> = [
    { key: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, enabled: Boolean(tabs.home) },
    {
      key: 'network',
      label: 'My Network',
      icon: <Users className="h-5 w-5" />,
      enabled: Boolean(tabs.network)
    },
    {
      key: 'post',
      label: 'Post',
      icon: <PlusSquare className="h-6 w-6" />,
      enabled: Boolean(tabs.post),
      isPrimary: true
    },
    {
      key: 'notifications',
      label: 'Notifications',
      icon: <Bell className="h-5 w-5" />,
      enabled: Boolean(tabs.notifications),
      badge: badges.notificationsUnread
    },
    {
      key: 'jobs',
      label: 'Jobs',
      icon: <Briefcase className="h-5 w-5" />,
      enabled: Boolean(tabs.jobs)
    },
    {
      key: 'messages',
      label: 'Messages',
      icon: <MessageCircle className="h-5 w-5" />,
      enabled: Boolean(tabs.messages),
      badge: badges.messagesUnread
    }
  ];

  const visible = items.filter((i) => i.enabled);

  return (
    <nav
      className="pointer-events-auto fixed bottom-0 left-0 right-0 z-[140] border-t border-slate-200 bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        {visible.map((item) => {
          const isActive = optimisticActiveTab === item.key;
          const primary = item.isPrimary;
          return (
            <button
              key={item.key}
              onTouchStart={() => triggerTabChange(item.key)}
              onMouseDown={(event) => {
                if (event.button !== 0) return;
                triggerTabChange(item.key);
              }}
              onClick={() => triggerTabChange(item.key)}
              className={[
                'relative flex flex-col items-center justify-center rounded-xl px-3 py-2 text-[11px] font-semibold touch-manipulation',
                isActive ? 'text-slate-900' : 'text-slate-500',
                primary ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
              ].join(' ')}
              aria-label={item.label}
              type="button"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="relative">
                {item.icon}
                {typeof item.badge === 'number' && item.badge > 0 ? (
                  <span className="absolute -right-2 -top-2 min-w-[18px] rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </div>
              <span className={primary ? 'mt-1 text-white' : 'mt-1'}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
