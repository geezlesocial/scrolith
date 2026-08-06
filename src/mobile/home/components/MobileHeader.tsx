import React, { useCallback, useRef } from 'react';
import {
  MessageCircleIcon as MessageCircle,
  MoreHorizontalIcon as MoreHorizontal,
  SearchIcon as Search
} from '../../../components/icons/ShellIcons';
import { resolveUserAvatarUrl } from '../../../utils/userAvatar';
import { MOBILE_HEADER_CONTAINER_CLASS } from '../mobileShellLayout';
import { pulseTapFeedback } from '../../runtime/nativeChrome';

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
  const resolvedUserAvatar = resolveUserAvatarUrl(user);

  const triggerAction = useCallback((key: string, action: () => void, target?: HTMLElement | null) => {
    const now = Date.now();
    const previous = recentActionRef.current;
    if (previous?.key === key && now - previous.at < 260) return;
    recentActionRef.current = { key, at: now };
    pulseTapFeedback(target);
    action();
  }, []);

  return (
    <header
      className="fixed left-0 right-0 top-0 z-50 border-b border-slate-200/90 bg-white/92 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/85"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className={`${MOBILE_HEADER_CONTAINER_CLASS} min-h-[56px]`}>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            triggerAction('profile', onOpenProfile, event.currentTarget);
          }}
          className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-sm touch-manipulation ring-offset-2 active:ring-2 active:ring-sky-200"
          aria-label="Open profile"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {resolvedUserAvatar ? (
            <img src={resolvedUserAvatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-600">
              {(user?.name?.[0] ?? user?.username?.[0] ?? 'U').toUpperCase()}
            </div>
          )}
          <span
            className={[
              'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white',
              socketConnected ? 'bg-emerald-500' : 'bg-slate-400'
            ].join(' ')}
            title={socketConnected ? 'Realtime connected' : 'Realtime disconnected'}
            aria-hidden
          />
        </button>

        <button
          type="button"
          className={[
            'flex min-h-[40px] min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-200/90 bg-slate-50/95 px-3.5 py-2 text-left shadow-inner touch-manipulation transition-colors',
            searchEnabled
              ? 'cursor-pointer active:bg-slate-100'
              : 'cursor-not-allowed opacity-60'
          ].join(' ')}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!searchEnabled) return;
            triggerAction('search', onOpenSearch, event.currentTarget);
          }}
          aria-label="Search"
          disabled={!searchEnabled}
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="min-w-0 truncate text-[13px] text-slate-500">
            Search people, jobs, gigs, posts
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          {showMessages ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                triggerAction('messages', onOpenMessages, event.currentTarget);
              }}
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm touch-manipulation active:bg-slate-50"
              aria-label={unread > 0 ? `Open messages, ${unread} unread` : 'Open messages'}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <MessageCircle className="h-5 w-5 text-slate-700" />
              {Number.isFinite(unread) && unread > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-600 px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white shadow-sm">
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
                triggerAction('menu', onOpenQuickMenu, event.currentTarget);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm touch-manipulation active:bg-slate-50"
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
