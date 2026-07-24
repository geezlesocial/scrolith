import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  Home,
  MessageSquare,
  Users,
  BookOpen,
  Calendar,
  Bell,
  ChevronDown,
  Hash,
  HelpCircle,
  Trophy,
  Clapperboard
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { trackCommunitySignal } from '../utils/communityLearningEngine';
import { communityTouchTargets } from './design/communityTokens';

const CommunityLayout = () => {
  const location = useLocation();
  const activePath = location.pathname;
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const { user } = useUser();

  useEffect(() => {
    trackCommunitySignal('community_opened', {
      entityType: 'COMMUNITY',
      meta: { path: location.pathname }
    });
  }, [location.pathname]);

  // Close overflow menus on route change so no residual overlay covers CTAs.
  useEffect(() => {
    setIsMoreOpen(false);
  }, [location.pathname]);

  const isActiveRoute = (path: string) => {
    if (path === '/community') return activePath === '/community' || activePath.startsWith('/community/posts/');
    return activePath === path || activePath.startsWith(`${path}/`);
  };

  const navItems = [
    { label: 'Home', path: '/community', icon: Home },
    { label: 'Scroll', path: '/scroll', icon: Clapperboard },
    { label: 'Forum', path: '/community/forum', icon: MessageSquare },
    { label: 'Chat', path: '/community/chat', icon: Hash },
    { label: 'Groups', path: '/community/clubs', icon: Users },
    { label: 'Events', path: '/community/events', icon: Calendar },
    { label: 'Leaderboard', path: '/community/leaderboard', icon: Trophy }
  ];

  const moreItems = [
    { label: 'Contributors', path: '/community/leaderboard', icon: Users },
    { label: 'Knowledge Hub', path: '/community/resources', icon: BookOpen },
    { label: 'Help', path: '/support', icon: HelpCircle }
  ];

  return (
    <div
      className="min-h-screen min-w-0 overflow-x-clip bg-slate-50 pb-[env(safe-area-inset-bottom,0px)]"
      data-testid="community-layout"
    >
      {/*
        Stick below enterprise header using the shared token (68/72px), not a short 3.5rem offset
        that lets this bar sit under the main header and paint over page CTAs.
      */}
      <div
        className="sticky z-20 border-b border-slate-200 bg-white shadow-sm"
        style={{ top: 'var(--scrolith-header-height, 4.25rem)' }}
        data-testid="community-subnav"
      >
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className="flex min-h-14 items-center gap-2 py-2 sm:min-h-16 sm:gap-3 sm:py-0">
            <Link
              to="/community"
              className={`inline-flex shrink-0 items-center gap-2 rounded-full bg-indigo-50 px-3 ${communityTouchTargets.min} text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 md:bg-transparent md:px-0 md:text-xl md:font-bold md:tracking-tight md:text-indigo-600`}
            >
              <Users className="h-4 w-4 md:hidden" aria-hidden="true" />
              <span className="md:hidden">Community</span>
              <span className="hidden md:inline">Scrolith Community</span>
            </Link>

            {/* Scroll track isolated so edge fades never cover More / page actions */}
            <div className="relative min-w-0 flex-1">
              <nav
                className="flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:gap-2"
                aria-label="Community sections"
              >
                {navItems.map((item) => {
                  const active = isActiveRoute(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      aria-current={active ? 'page' : undefined}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap sm:gap-2 sm:text-sm ${communityTouchTargets.chip} ${
                        active
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                          : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${active ? 'text-indigo-600' : 'text-slate-400'}`}
                        aria-hidden="true"
                      />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
                {/* Trailing spacer so last chips aren't tight against the fade edge */}
                <span className="inline-block w-6 shrink-0 sm:w-8" aria-hidden />
              </nav>
              {/* Decorative scroll edges only — never capture clicks */}
              <div
                className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-white to-transparent sm:w-6"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent sm:w-10"
                aria-hidden
              />
            </div>

            <div className="relative z-30 flex shrink-0 items-center gap-1.5 sm:gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsMoreOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 sm:text-sm ${communityTouchTargets.chip}`}
                  aria-expanded={isMoreOpen}
                  aria-haspopup="menu"
                >
                  More
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>

                {isMoreOpen ? (
                  <>
                    <div
                      className="fixed inset-0 z-[25] bg-transparent"
                      onClick={() => setIsMoreOpen(false)}
                      aria-hidden
                    />
                    <div
                      className="absolute right-0 z-[35] mt-2 w-52 rounded-2xl bg-white py-2 shadow-lg ring-1 ring-black/5"
                      role="menu"
                    >
                      {moreItems.map((item) => (
                        <Link
                          key={item.label}
                          to={item.path}
                          role="menuitem"
                          onClick={() => setIsMoreOpen(false)}
                          className="flex min-h-11 items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          <item.icon className="mr-3 h-4 w-4 text-slate-400" aria-hidden />
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>

              {user?.gcoinBalance !== undefined ? (
                <div className="hidden items-center rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-bold text-yellow-700 xl:flex">
                  <span className="mr-1" aria-hidden>
                    🪙
                  </span>
                  {user.gcoinBalance} Gcoins
                </div>
              ) : null}

              <Link
                to="/notifications"
                className={`relative inline-flex items-center justify-center rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-indigo-600 ${communityTouchTargets.min}`}
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Content sits fully below sticky subnav; no shared stacking with subnav chrome */}
      <div className="relative z-0 mx-auto max-w-7xl min-w-0 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <Outlet />
      </div>
    </div>
  );
};

export default CommunityLayout;
