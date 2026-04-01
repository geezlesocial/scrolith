import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon as ArrowLeft,
  HomeIcon as Home
} from '../../../components/icons/ShellIcons';

type MobileAppRouteFrameProps = {
  title: string;
  children: React.ReactNode;
  fullBleed?: boolean;
};

const MOBILE_HEADER_HEIGHT = 56;

export default function MobileAppRouteFrame({
  title,
  children,
  fullBleed = true
}: MobileAppRouteFrameProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const cameFromMobileHome = Boolean((location.state as Record<string, unknown> | null)?.fromMobileHome);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname, location.search]);

  const handleBack = () => {
    if (!cameFromMobileHome && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/m/home', { replace: true });
  };

  const onHome = () => {
    navigate('/m/home', { replace: false });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="fixed inset-x-0 top-0 z-[70] border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-3">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"
            aria-label="Go back"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
            <p className="truncate text-[11px] uppercase tracking-[0.18em] text-slate-400">Scrolith mobile</p>
          </div>
          <button
            type="button"
            onClick={onHome}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"
            aria-label="Go home"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Home className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div
        className={fullBleed ? '' : 'mx-auto max-w-md px-3'}
        style={{
          paddingTop: `calc(${MOBILE_HEADER_HEIGHT}px + env(safe-area-inset-top, 0px))`,
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))'
        }}
      >
        {children}
      </div>
    </div>
  );
}
