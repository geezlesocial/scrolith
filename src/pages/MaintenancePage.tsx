/**
 * Public maintenance fault page — content driven by System Settings maintenancePage.
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import api from '../services/api';

type MaintenancePageConfig = {
  title?: string;
  message?: string;
  eta?: string | null;
  contactEmail?: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

const MaintenancePage: React.FC = () => {
  const [page, setPage] = useState<MaintenancePageConfig | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get('/public/system-status');
        const data = res?.data?.data || res?.data || {};
        if (!mounted) return;
        setActive(Boolean(data.maintenanceMode));
        setPage(data.maintenancePage || null);
      } catch {
        if (mounted) setActive(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Platform is online</h1>
          <p className="mt-2 text-sm text-slate-600">Maintenance mode is not active. You can return to Scrolith.</p>
          <a
            href="/"
            className="mt-6 inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Go to homepage
          </a>
        </div>
      </div>
    );
  }

  const title = page?.title || 'We’ll be back soon';
  const message =
    page?.message ||
    'Scrolith is undergoing scheduled maintenance. Admins retain access to the control plane.';
  const ctaLabel = page?.ctaLabel || 'Contact support';
  const ctaUrl = page?.ctaUrl || `mailto:${page?.contactEmail || 'support@scrolith.com'}`;

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-6 text-white"
      data-testid="maintenance-page"
    >
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-300">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="text-center text-2xl font-black tracking-tight">{title}</h1>
        <p className="mt-4 text-center text-sm leading-7 text-slate-300">{message}</p>
        {page?.eta ? (
          <p className="mt-3 text-center text-xs font-semibold uppercase tracking-wide text-amber-200/90">
            Expected return: {page.eta}
          </p>
        ) : null}
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
          <a
            href={ctaUrl}
            className="inline-flex items-center justify-center rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400"
          >
            {ctaLabel}
          </a>
        </div>
        <p className="mt-6 text-center text-[11px] text-slate-500">
          Admins: sign in at /auth/login — maintenance does not block admin control plane access.
        </p>
      </div>
    </div>
  );
};

export default MaintenancePage;
