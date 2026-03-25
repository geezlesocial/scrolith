import React from 'react';
import { Search, ShieldCheck, ShieldAlert, Info, X } from 'lucide-react';

interface DashboardShellProps {
  title: string;
  subtitle: string;
  roleLabel: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  infoMessage?: string;
  bannerStorageKey?: string;
  verificationStatus?: 'verified' | 'pending' | 'unverified';
  profileCompleteness?: number;
  lastLoginLabel?: string;
  heroContent?: React.ReactNode;
  kpiContent: React.ReactNode;
  quickActionsContent: React.ReactNode;
  supplementaryContent?: React.ReactNode;
  activityContent: React.ReactNode;
  rightRailContent: React.ReactNode;
}

const safeNumber = (value?: number) => {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Number(value)));
};

export const DashboardShell: React.FC<DashboardShellProps> = ({
  title,
  subtitle,
  roleLabel,
  searchPlaceholder = 'Search dashboard data...',
  searchValue = '',
  onSearchChange,
  infoMessage,
  bannerStorageKey = 'dashboard-overview-banner-dismissed',
  verificationStatus = 'pending',
  profileCompleteness,
  lastLoginLabel,
  heroContent,
  kpiContent,
  quickActionsContent,
  supplementaryContent,
  activityContent,
  rightRailContent
}) => {
  const [bannerDismissed, setBannerDismissed] = React.useState(false);
  const completion = safeNumber(profileCompleteness);

  React.useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(bannerStorageKey) === '1';
      setBannerDismissed(dismissed);
    } catch {
      setBannerDismissed(false);
    }
  }, [bannerStorageKey]);

  const dismissBanner = () => {
    setBannerDismissed(true);
    try {
      window.localStorage.setItem(bannerStorageKey, '1');
    } catch {
      // ignore storage failures
    }
  };

  return (
    <div className="space-y-4">
      {heroContent || (
        <section className="sticky top-0 z-10 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                Viewing as {roleLabel}
              </p>
              <h1 className="mt-2 text-xl font-semibold text-slate-900">{title}</h1>
              <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {verificationStatus === 'verified' ? (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                  Verified
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                  Verification {verificationStatus}
                </span>
              )}

              {typeof completion === 'number' && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  Profile {completion}%
                </span>
              )}
              {lastLoginLabel && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                  Last login: {lastLoginLabel}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchValue}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        </section>
      )}

      {!bannerDismissed && infoMessage && (
        <section className="flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <p className="inline-flex items-start">
            <Info className="mr-2 mt-0.5 h-4 w-4 shrink-0" />
            <span>{infoMessage}</span>
          </p>
          <button
            type="button"
            onClick={dismissBanner}
            className="rounded-md p-1 text-blue-700 transition hover:bg-blue-100"
            aria-label="Dismiss information banner"
          >
            <X className="h-4 w-4" />
          </button>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="space-y-4 lg:col-span-8">
          {kpiContent}
          {quickActionsContent}
          {supplementaryContent}
          {activityContent}
        </section>
        <section className="space-y-4 lg:col-span-4">{rightRailContent}</section>
      </div>
    </div>
  );
};

export default DashboardShell;
