import React, { useMemo, useState } from 'react';
import type { VerificationLevel } from '../../utils/verification';
import { normalizeVerificationLevel } from '../../utils/verification';
import './verified-badge.css';

type VerifiedBadgeProps = {
  size?: number;
  level?: VerificationLevel | string | null;
  className?: string;
  showTooltip?: boolean;
  animated?: boolean;
};

const PALETTE: Record<
  VerificationLevel,
  { from: string; mid: string; to: string; ring: string; glow: string; label: string; description: string }
> = {
  standard: {
    from: '#4FC3F7',
    mid: '#29B6F6',
    to: '#0288D1',
    ring: 'rgba(2, 119, 189, 0.68)',
    glow: 'rgba(129, 212, 250, 0.32)',
    label: 'Verified Account',
    description: 'This account has been verified by Scrolith.'
  },
  pro: {
    from: '#FFE082',
    mid: '#FFD54F',
    to: '#F9A825',
    ring: 'rgba(194, 132, 0, 0.7)',
    glow: 'rgba(255, 214, 102, 0.3)',
    label: 'Pro Verified',
    description: 'This account is verified and recognized as Pro on Scrolith.'
  },
  business: {
    from: '#7C4DFF',
    mid: '#673AB7',
    to: '#4527A0',
    ring: 'rgba(69, 39, 160, 0.72)',
    glow: 'rgba(149, 117, 205, 0.3)',
    label: 'Business Verified',
    description: 'This business account has been verified by Scrolith.'
  },
  government: {
    from: '#1E3A8A',
    mid: '#1D4ED8',
    to: '#0B2F7A',
    ring: 'rgba(30, 58, 138, 0.74)',
    glow: 'rgba(96, 165, 250, 0.28)',
    label: 'Government Verified',
    description: 'This institutional account has been verified by Scrolith.'
  }
};

const isTouchDevice = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: none), (pointer: coarse)').matches;
};

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  size = 16,
  level = 'standard',
  className = '',
  showTooltip = true,
  animated = true
}) => {
  const normalizedLevel = normalizeVerificationLevel(level) || 'standard';
  const palette = PALETTE[normalizedLevel];
  const [sheetOpen, setSheetOpen] = useState(false);

  const badgeStyle = useMemo(
    () =>
      ({
        width: `${size}px`,
        height: `${size}px`,
        '--badge-size': `${size}px`,
        '--badge-ring': palette.ring,
        '--badge-glow': palette.glow,
        background: `linear-gradient(145deg, ${palette.from} 0%, ${palette.mid} 56%, ${palette.to} 100%)`
      }) as React.CSSProperties,
    [palette.from, palette.glow, palette.mid, palette.ring, palette.to, size]
  );

  const handleBadgeClick: React.MouseEventHandler<HTMLSpanElement> = (event) => {
    if (!showTooltip || !isTouchDevice()) return;
    event.preventDefault();
    event.stopPropagation();
    setSheetOpen(true);
  };

  return (
    <span className={`verified-badge-wrap ${className}`.trim()}>
      <span
        className="verified-badge"
        data-animate={animated ? 'true' : 'false'}
        style={badgeStyle}
        title={palette.label}
        aria-label={palette.label}
        onClick={handleBadgeClick}
      >
        <span className="verified-badge__watermark" aria-hidden="true">
          S
        </span>
        <svg
          className="verified-badge__check"
          width={Math.max(10, size * 0.62)}
          height={Math.max(10, size * 0.62)}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M6.75 12.75L10.05 16.05L17.25 8.85"
            stroke="white"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      {showTooltip ? (
        <span className="verified-badge__tooltip">
          <strong>{palette.label}</strong>
          <br />
          {palette.description}
        </span>
      ) : null}

      {sheetOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/35 p-4 text-left"
          onClick={() => setSheetOpen(false)}
        >
          <span className="w-full max-w-sm rounded-2xl bg-white px-4 py-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <span className="block text-sm font-semibold text-slate-900">{palette.label}</span>
            <span className="mt-1 block text-xs text-slate-600">{palette.description}</span>
            <span className="mt-3 inline-flex rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white">Close</span>
          </span>
        </button>
      ) : null}
    </span>
  );
};

export default VerifiedBadge;
