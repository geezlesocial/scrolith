import React, { useMemo, useState } from 'react';
import type { VerificationLevel } from '../../utils/verification';
import {
  normalizeVerificationLevel,
  resolveVerificationSubjectRole,
  resolveVisibleVerificationLevel,
  shouldShowVerificationTooltip
} from '../../utils/verification';
import { useContent } from '../../context/ContentContext';
import './verified-badge.css';

type VerifiedBadgeProps = {
  size?: number;
  level?: VerificationLevel | string | null;
  className?: string;
  showTooltip?: boolean;
  animated?: boolean;
  subjectRole?: string | null;
  subjectType?: string | null;
  entity?: any;
};

const PALETTE: Record<
  VerificationLevel,
  { from: string; mid: string; to: string; ring: string; glow: string; shadow: string; label: string; description: string }
> = {
  standard: {
    from: '#73D0FF',
    mid: '#2D9CFF',
    to: '#1453D1',
    ring: 'rgba(18, 85, 206, 0.72)',
    glow: 'rgba(89, 175, 255, 0.34)',
    shadow: 'rgba(20, 83, 209, 0.34)',
    label: 'Verified Account',
    description: 'This account has been verified by Scrolith.'
  },
  pro: {
    from: '#8FDBFF',
    mid: '#3FA5FF',
    to: '#0D63ED',
    ring: 'rgba(15, 99, 237, 0.74)',
    glow: 'rgba(98, 181, 255, 0.36)',
    shadow: 'rgba(13, 99, 237, 0.34)',
    label: 'Pro Verified',
    description: 'This account is verified and recognized as Pro on Scrolith.'
  },
  business: {
    from: '#6AC4FF',
    mid: '#217BFF',
    to: '#113EC8',
    ring: 'rgba(17, 62, 200, 0.74)',
    glow: 'rgba(68, 145, 255, 0.34)',
    shadow: 'rgba(17, 62, 200, 0.34)',
    label: 'Business Verified',
    description: 'This business account has been verified by Scrolith.'
  },
  government: {
    from: '#A4DEFF',
    mid: '#347FFF',
    to: '#0F2F9A',
    ring: 'rgba(15, 47, 154, 0.76)',
    glow: 'rgba(70, 127, 255, 0.32)',
    shadow: 'rgba(15, 47, 154, 0.35)',
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
  animated = true,
  subjectRole,
  subjectType,
  entity
}) => {
  const { settings } = useContent();
  const normalizedLevel =
    resolveVisibleVerificationLevel(
      entity || {
        level,
        verificationLevel: level,
        role: subjectRole,
        type: subjectType
      },
      {
        settings,
        role: subjectRole,
        type: subjectType
      }
    ) ?? normalizeVerificationLevel(level);

  if (!normalizedLevel) return null;

  const palette = PALETTE[normalizedLevel];
  const [sheetOpen, setSheetOpen] = useState(false);
  const canShowTooltip = showTooltip && shouldShowVerificationTooltip(settings);
  const ariaRole = resolveVerificationSubjectRole(entity || {}, subjectRole, subjectType);

  const badgeStyle = useMemo(
    () =>
      ({
        width: `${size}px`,
        height: `${size}px`,
        '--badge-size': `${size}px`,
        '--badge-ring': palette.ring,
        '--badge-glow': palette.glow,
        '--badge-shadow': palette.shadow,
        background: `radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.52) 0%, rgba(255, 255, 255, 0.18) 24%, transparent 46%), linear-gradient(145deg, ${palette.from} 0%, ${palette.mid} 56%, ${palette.to} 100%)`
      }) as React.CSSProperties,
    [palette.from, palette.glow, palette.mid, palette.ring, palette.shadow, palette.to, size]
  );

  const handleBadgeClick: React.MouseEventHandler<HTMLSpanElement> = (event) => {
    if (!canShowTooltip || !isTouchDevice()) return;
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
        aria-label={`${palette.label} for ${ariaRole}`}
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

      {canShowTooltip ? (
        <span className="verified-badge__tooltip">
          <strong>{palette.label}</strong>
          <br />
          {palette.description}
        </span>
      ) : null}

      {sheetOpen && canShowTooltip ? (
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
