import React from 'react';
import { Link } from 'react-router-dom';
import { Bell, CircleDot, MessageCircle, Sparkles, TrendingUp } from 'lucide-react';
import EmptyState from '../ui/EmptyState';

export interface RightRailAction {
  id: string;
  label: string;
  description?: string;
  href: string;
}

export interface RightRailMetric {
  id: string;
  label: string;
  value: string | number;
  description?: string;
  tone?: 'indigo' | 'blue' | 'green' | 'amber' | 'slate';
}

interface RightRailProps {
  unreadMessages: number;
  unreadNotifications: number;
  socketConnected: boolean;
  highlights?: RightRailMetric[];
  nextActions: RightRailAction[];
  recommendations: RightRailAction[];
}

const formatCount = (value: number) => (value > 99 ? '99+' : String(Math.max(0, value)));

const toneMap: Record<NonNullable<RightRailMetric['tone']>, string> = {
  indigo: 'border-indigo-100 bg-indigo-50 text-indigo-700',
  blue: 'border-blue-100 bg-blue-50 text-blue-700',
  green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-100 bg-amber-50 text-amber-700',
  slate: 'border-slate-200 bg-slate-50 text-slate-700'
};

export const RightRail: React.FC<RightRailProps> = ({
  unreadMessages,
  unreadNotifications,
  socketConnected,
  highlights = [],
  nextActions,
  recommendations
}) => {
  return (
    <aside className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Realtime Status</h3>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
              socketConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            <CircleDot className="mr-1 h-3 w-3" />
            {socketConnected ? 'Live' : 'Polling'}
          </span>
        </div>

        <div className="space-y-2 text-sm">
          <Link to="/messages" className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
            <span className="inline-flex items-center text-slate-700">
              <MessageCircle className="mr-2 h-4 w-4 text-indigo-600" />
              Unread Messages
            </span>
            <span className="font-semibold text-indigo-700">{formatCount(unreadMessages)}</span>
          </Link>

          <Link to="/notifications" className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
            <span className="inline-flex items-center text-slate-700">
              <Bell className="mr-2 h-4 w-4 text-indigo-600" />
              Notifications
            </span>
            <span className="font-semibold text-indigo-700">{formatCount(unreadNotifications)}</span>
          </Link>
        </div>

        {highlights.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {highlights.slice(0, 4).map((item) => (
              <div key={item.id} className={['rounded-xl border px-3 py-2', toneMap[item.tone || 'slate']].join(' ')}>
                <p className="text-[10px] font-semibold uppercase tracking-wide">{item.label}</p>
                <p className="mt-1 text-lg font-semibold">{item.value}</p>
                {item.description ? <p className="mt-1 text-[11px] leading-4 opacity-80">{item.description}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 inline-flex items-center text-sm font-semibold text-slate-900">
          <TrendingUp className="mr-2 h-4 w-4 text-indigo-600" />
          Next Actions
        </h3>
        {nextActions.length === 0 ? (
          <EmptyState
            title="No immediate actions"
            description="You are all caught up. We will show important tasks here."
            className="border-none p-2"
          />
        ) : (
          <ul className="space-y-2">
            {nextActions.map((action) => (
              <li key={action.id}>
                <Link to={action.href} className="block rounded-lg border border-slate-200 p-3 hover:border-indigo-200 hover:bg-slate-50">
                  <p className="text-sm font-medium text-slate-900">{action.label}</p>
                  {action.description && <p className="mt-1 text-xs text-slate-600">{action.description}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 inline-flex items-center text-sm font-semibold text-slate-900">
          <Sparkles className="mr-2 h-4 w-4 text-indigo-600" />
          Recommendations
        </h3>
        {recommendations.length === 0 ? (
          <EmptyState
            title="No recommendations yet"
            description="Recommendations will appear after we analyze your recent activity."
            className="border-none p-2"
          />
        ) : (
          <ul className="space-y-2">
            {recommendations.map((item) => (
              <li key={item.id}>
                <Link to={item.href} className="block rounded-lg border border-slate-200 p-3 hover:border-indigo-200 hover:bg-slate-50">
                  <p className="text-sm font-medium text-slate-900">{item.label}</p>
                  {item.description && <p className="mt-1 text-xs text-slate-600">{item.description}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
};

export default RightRail;
