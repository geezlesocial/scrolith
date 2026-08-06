import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon as ArrowLeft,
  HomeIcon as Home
} from '../../../components/icons/ShellIcons';
import {
  MOBILE_HEADER_BAR_CLASS,
  MOBILE_HEADER_HEIGHT_PX,
  MOBILE_PAGE_CONTAINER_CLASS
} from '../mobileShellLayout';
import { pulseTapFeedback } from '../../runtime/nativeChrome';

type MobileAppRouteFrameProps = {
  title: string;
  children: React.ReactNode;
  fullBleed?: boolean;
};

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

  const handleBack = (target?: HTMLElement | null) => {
    pulseTapFeedback(target);
    if (!cameFromMobileHome && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/m/home', { replace: true });
  };

  const onHome = (target?: HTMLElement | null) => {
    pulseTapFeedback(target);
    navigate('/m/home', { replace: false });
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900">
      <header
        className="fixed inset-x-0 top-0 z-[70] border-b border-slate-200/90 bg-white/92 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/85"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className={`${MOBILE_HEADER_BAR_CLASS} h-14`}>
          <button
            type="button"
            onClick={(event) => handleBack(event.currentTarget)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm touch-manipulation active:bg-slate-50"
            aria-label="Go back"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
              Scrolith
            </p>
          </div>
          <button
            type="button"
            onClick={(event) => onHome(event.currentTarget)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm touch-manipulation active:bg-slate-50"
            aria-label="Go home"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Home className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div
        className={fullBleed ? '' : MOBILE_PAGE_CONTAINER_CLASS}
        style={{
          paddingTop: `calc(${MOBILE_HEADER_HEIGHT_PX}px + env(safe-area-inset-top, 0px))`,
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))'
        }}
      >
        {children}
      </div>
    </div>
  );
}
