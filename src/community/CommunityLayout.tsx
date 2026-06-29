import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  Home,
  MessageSquare,
  Users,
  BookOpen,
  Calendar,
  Search,
  Bell,
  ChevronDown,
  Hash,
  HelpCircle,
  Trophy,
  Clapperboard
} from 'lucide-react';
import { useUser } from '../context/UserContext';

const CommunityLayout = () => {
  const location = useLocation();
  const activePath = location.pathname;
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const { user } = useUser();

  const isActiveRoute = (path: string) => activePath === path || activePath.startsWith(`${path}/`);

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
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-14 z-30 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur sm:top-16">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:py-0">
            <div className="flex items-center justify-between gap-3">
              <Link
                to="/community"
                className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 md:bg-transparent md:px-0 md:py-0 md:text-xl md:font-bold md:tracking-tight md:text-indigo-600"
              >
                <Users className="h-4 w-4 md:hidden" />
                <span className="md:hidden">Community</span>
                <span className="hidden md:inline">Scrolith Community</span>
              </Link>

              <button className="relative rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-indigo-600 lg:hidden">
                <Bell className="h-5 w-5" />
                <span className="absolute right-2 top-2 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
              </button>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <nav className="relative flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 no-scrollbar sm:pb-0">
                {navItems.map((item) => {
                  const active = isActiveRoute(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap sm:text-sm ${
                        active
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                          : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <item.icon className={`h-4 w-4 ${active ? 'text-indigo-600' : 'text-gray-400'}`} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="relative shrink-0">
                <button
                  onClick={() => setIsMoreOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 sm:text-sm"
                >
                  More
                  <ChevronDown className="h-4 w-4" />
                </button>

                {isMoreOpen ? (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsMoreOpen(false)} />
                    <div className="absolute right-0 z-40 mt-2 w-52 rounded-2xl bg-white py-2 shadow-lg ring-1 ring-black/5">
                      {moreItems.map((item) => (
                        <Link
                          key={item.label}
                          to={item.path}
                          onClick={() => setIsMoreOpen(false)}
                          className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <item.icon className="mr-3 h-4 w-4 text-gray-400" />
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="hidden items-center space-x-4 lg:flex">
              {user?.gcoinBalance !== undefined ? (
                <div className="hidden items-center rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-bold text-yellow-700 xl:flex">
                  <span className="mr-1">🪙</span>
                  {user.gcoinBalance} Gcoins
                </div>
              ) : null}

              <div className="relative hidden xl:block">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search topics..."
                  className="w-48 rounded-full border border-gray-300 bg-gray-50 py-2 pl-9 pr-4 text-sm transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button className="relative rounded-full p-1 text-gray-500 transition hover:bg-gray-100 hover:text-indigo-600">
                <Bell className="h-5 w-5" />
                <span className="absolute right-1 top-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-8 lg:px-8">
        <Outlet />
      </div>
    </div>
  );
};

export default CommunityLayout;
