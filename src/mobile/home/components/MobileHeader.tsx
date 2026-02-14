import React from 'react';
import { MoreHorizontal, Search } from 'lucide-react';

export type MobileHomeLayoutSettings = {
  search?: {
    enabled?: boolean;
  };
};

export default function MobileHeader({
  user,
  loading,
  socketConnected,
  settings,
  onOpenSearch,
  onOpenQuickMenu,
  onOpenProfile
}: {
  user: any;
  loading?: boolean;
  socketConnected?: boolean;
  settings?: MobileHomeLayoutSettings | null;
  onOpenSearch: () => void;
  onOpenQuickMenu: () => void;
  onOpenProfile: () => void;
}) {
  const searchEnabled = settings?.search?.enabled ?? true;

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onOpenProfile}
          className="relative h-9 w-9 overflow-hidden rounded-full border border-slate-200 bg-slate-100"
          aria-label="Open profile"
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
            'flex flex-1 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-left',
            searchEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
          ].join(' ')}
          onClick={() => {
            if (!searchEnabled) return;
            onOpenSearch();
          }}
          aria-label="Search"
          disabled={!searchEnabled}
        >
          <Search className="h-4 w-4 text-slate-500" />
          <span className="text-sm text-slate-500">
            {loading ? 'Loading settings...' : 'Search posts, jobs, gigs, people, pages'}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenQuickMenu}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white"
          aria-label="Open menu"
        >
          <MoreHorizontal className="h-5 w-5 text-slate-700" />
        </button>
      </div>
    </header>
  );
}

