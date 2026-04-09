import React, { useCallback, useRef } from 'react';
import {
  MessageCircleIcon as MessageCircle,
  MoreHorizontalIcon as MoreHorizontal,
  SearchIcon as Search
} from '../../../components/icons/ShellIcons';
import { MOBILE_HEADER_CONTAINER_CLASS } from '../mobileShellLayout';

export type MobileHomeLayoutSettings = {
  search?: {
    enabled?: boolean;
  };
};

export default function MobileHeader({
  user,
  loading: _loading,
  socketConnected,
  settings,
  messagesUnread,
  showMessages = true,
  showQuickMenu = true,
  onOpenSearch,
  onOpenMessages,
  onOpenQuickMenu,
  onOpenProfile
}: {
  user: any;
  loading?: boolean;
  socketConnected?: boolean;
  settings?: MobileHomeLayoutSettings | null;
  messagesUnread?: number;
  showMessages?: boolean;
  showQuickMenu?: boolean;
  onOpenSearch: () => void;
  onOpenMessages: () => void;
  onOpenQuickMenu: () => void;
  onOpenProfile: () => void;
}) {
  const searchEnabled = settings?.search?.enabled ?? true;
  const unread = Number(messagesUnread || 0);
  const recentActionRef = useRef<{ key: string; at: number } | null>(null);

  const triggerAction = useCallback((key: string, action: () => void) => {
    const now = Date.now();
    const previous = recentActionRef.current;
    if (previous?.key === key && now - previous.at < 260) return;
    recentActionRef.current = { key, at: now };
    action();
  }, []);

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className={MOBILE_HEADER_CONTAINER_CLASS}>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            triggerAction('profile', onOpenProfile);
          }}
          className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 touch-manipulation"
          aria-label="Open profile"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {user?.avatar ? (
            <img src={user.avatar} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-600">
              {(user?.name?.[0] ?? user?.username?.[0] ?? 'U').toUpperCase()}
            </div>
          )}
          <span
            className={[
              'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white',
              socketConnected ? 'bg-green-500' : 'bg-slate-400'
            ].join(' ')}
            title={socketConnected ? 'Realtime connected' : 'Realtime disconnected'}
          />
        </button>

        <button
          type="button"
          className={[
            'flex min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-left touch-manipulation',
            searchEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
          ].join(' ')}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!searchEnabled) return;
            triggerAction('search', onOpenSearch);
          }}
          aria-label="Search"
          disabled={!searchEnabled}
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Search className="h-4 w-4 text-slate-500" />
          <span className="min-w-0 truncate text-sm text-slate-500">
            Search posts, jobs, gigs, people, pages
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {showMessages ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                triggerAction('messages', onOpenMessages);
              }}
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white touch-manipulation"
              aria-label="Open messages"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <MessageCircle className="h-5 w-5 text-slate-700" />
              {Number.isFinite(unread) && unread > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : null}
            </button>
          ) : null}

          {showQuickMenu ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                triggerAction('menu', onOpenQuickMenu);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white touch-manipulation"
              aria-label="Open menu"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <MoreHorizontal className="h-5 w-5 text-slate-700" />
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
