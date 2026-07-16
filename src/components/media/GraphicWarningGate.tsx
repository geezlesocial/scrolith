import React from 'react';
import { AlertTriangle } from 'lucide-react';

type GraphicWarningGateProps = {
  active: boolean;
  revealed: boolean;
  onReveal: () => void;
  label?: string;
  blurMedia?: boolean;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
};

const GraphicWarningGate: React.FC<GraphicWarningGateProps> = ({
  active,
  revealed,
  onReveal,
  label = 'Graphic warning',
  blurMedia = true,
  className = '',
  contentClassName = '',
  children
}) => {
  const blocked = active && !revealed;

  return (
    <div className={`relative ${className}`}>
      <div className={`${blocked && blurMedia ? 'pointer-events-none blur-sm' : ''} ${contentClassName}`.trim()}>
        {children}
      </div>
      {blocked ? (
        <button
          type="button"
          onClick={onReveal}
          className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-2xl bg-slate-950/72 p-4 text-center backdrop-blur-[2px] [border-radius:inherit]"
          aria-label={`Reveal ${label.toLowerCase()} media`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.14),rgba(15,23,42,0.72)_68%,rgba(2,6,23,0.88))]" />
          <div className="relative max-w-sm rounded-[24px] border border-white/12 bg-slate-950/82 px-5 py-4 text-white shadow-[0_24px_50px_-28px_rgba(15,23,42,0.85)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/35 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              Sensitive media
            </div>
            <div className="mt-3 text-base font-semibold tracking-tight text-white">{label}</div>
            <div className="mt-1 text-sm text-slate-200">Tap to view</div>
          </div>
        </button>
      ) : null}
    </div>
  );
};

export default GraphicWarningGate;
