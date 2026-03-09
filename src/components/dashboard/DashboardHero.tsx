import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowRight,
  Search,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff
} from 'lucide-react';

type Tone = 'indigo' | 'blue' | 'green' | 'amber' | 'slate';

export interface DashboardHeroMetric {
  id: string;
  label: string;
  value: string | number;
  helper?: string;
  tone?: Tone;
}

export interface DashboardHeroSignal {
  id: string;
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone?: Tone;
}

export interface DashboardHeroAction {
  id: string;
  label: string;
  description?: string;
  href: string;
  icon: LucideIcon;
  variant?: 'primary' | 'secondary';
}

interface DashboardHeroProps {
  title: string;
  subtitle: string;
  roleLabel: string;
  verificationStatus?: 'verified' | 'pending' | 'unverified';
  profileCompleteness?: number;
  lastLoginLabel?: string;
  lastSyncedLabel?: string;
  socketConnected?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  metrics: DashboardHeroMetric[];
  signals?: DashboardHeroSignal[];
  actions?: DashboardHeroAction[];
}

const toneMap: Record<Tone, { chip: string; panel: string; icon: string }> = {
  indigo: {
    chip: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    panel: 'border-indigo-100 bg-indigo-50/70',
    icon: 'bg-indigo-600/10 text-indigo-700'
  },
  blue: {
    chip: 'border-blue-200 bg-blue-50 text-blue-700',
    panel: 'border-blue-100 bg-blue-50/70',
    icon: 'bg-blue-600/10 text-blue-700'
  },
  green: {
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    panel: 'border-emerald-100 bg-emerald-50/70',
    icon: 'bg-emerald-600/10 text-emerald-700'
  },
  amber: {
    chip: 'border-amber-200 bg-amber-50 text-amber-700',
    panel: 'border-amber-100 bg-amber-50/70',
    icon: 'bg-amber-600/10 text-amber-700'
  },
  slate: {
    chip: 'border-slate-200 bg-slate-100 text-slate-700',
    panel: 'border-slate-200 bg-slate-50',
    icon: 'bg-slate-900/5 text-slate-700'
  }
};

const clampCompletion = (value?: number) => {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Number(value)));
};

export const DashboardHero: React.FC<DashboardHeroProps> = ({
  title,
  subtitle,
  roleLabel,
  verificationStatus = 'pending',
  profileCompleteness,
  lastLoginLabel,
  lastSyncedLabel,
  socketConnected = false,
  searchPlaceholder = 'Search dashboard data...',
  searchValue = '',
  onSearchChange,
  metrics,
  signals = [],
  actions = []
}) => {
  const completion = clampCompletion(profileCompleteness);

  return (
    <section className="sticky top-0 z-10 overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.12),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.10),_transparent_30%)]" />
      <div className="relative space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700">
                {roleLabel} workspace
              </span>
              <span
                className={[
                  'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
                  socketConnected ? toneMap.green.chip : toneMap.amber.chip
                ].join(' ')}
              >
                {socketConnected ? <Wifi className="mr-1 h-3.5 w-3.5" /> : <WifiOff className="mr-1 h-3.5 w-3.5" />}
                {socketConnected ? 'Live sync' : 'Sync standby'}
              </span>
              {verificationStatus === 'verified' ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                  Verified
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                  <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                  Verification {verificationStatus}
                </span>
              )}
            </div>

            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-[15px]">{subtitle}</p>
          </div>

          <div className="grid min-w-[220px] gap-3 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm sm:grid-cols-2 md:min-w-[300px] md:grid-cols-1">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Profile readiness</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="text-2xl font-semibold text-slate-950">{typeof completion === 'number' ? `${completion}%` : '—'}</p>
                {lastLoginLabel ? <p className="text-[11px] text-slate-500">Last login {lastLoginLabel}</p> : null}
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 transition-all"
                  style={{ width: `${typeof completion === 'number' ? completion : 0}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Operations pulse</p>
                <Activity className="h-4 w-4 text-indigo-600" />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {lastSyncedLabel || (socketConnected ? 'Real-time events are flowing.' : 'Dashboard is polling for updates.')}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Keep this workspace open to monitor workload, revenue, and communication without losing context.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <Search className="h-4 w-4 text-slate-300" />
              <input
                type="text"
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => {
                const tone = toneMap[metric.tone || 'slate'];
                return (
                  <div key={metric.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{metric.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
                    <p className="mt-2 min-h-[20px] text-xs leading-5 text-slate-300">{metric.helper || 'Tracked continuously'}</p>
                    <span className={['mt-3 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', tone.chip].join(' ')}>
                      Enterprise view
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3">
            {signals.length > 0 ? (
              <div className="grid gap-3">
                {signals.slice(0, 3).map((signal) => {
                  const tone = toneMap[signal.tone || 'slate'];
                  return (
                    <div key={signal.id} className={['rounded-3xl border p-4 shadow-sm', tone.panel].join(' ')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className={['rounded-2xl p-2.5', tone.icon].join(' ')}>
                          <signal.icon className="h-4 w-4" />
                        </div>
                        <p className="text-right text-sm font-semibold text-slate-950">{signal.value}</p>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-950">{signal.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{signal.description}</p>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {actions.length > 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Priority actions</p>
                  <p className="mt-1 text-sm text-slate-600">Launch core workflows without leaving the command center.</p>
                </div>
                <div className="grid gap-2">
                  {actions.slice(0, 3).map((action) => (
                    <Link
                      key={action.id}
                      to={action.href}
                      className={[
                        'group flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 transition',
                        action.variant === 'primary'
                          ? 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'border-slate-200 bg-white text-slate-900 hover:border-indigo-200 hover:bg-slate-50'
                      ].join(' ')}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={[
                            'rounded-2xl p-2',
                            action.variant === 'primary' ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-700'
                          ].join(' ')}
                        >
                          <action.icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{action.label}</p>
                          {action.description ? (
                            <p className={['mt-0.5 truncate text-xs', action.variant === 'primary' ? 'text-indigo-100' : 'text-slate-500'].join(' ')}>
                              {action.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <ArrowRight className={['h-4 w-4 shrink-0', action.variant === 'primary' ? 'text-white' : 'text-slate-400'].join(' ')} />
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export default DashboardHero;
