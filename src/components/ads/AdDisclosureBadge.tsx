import React from 'react';

type AdDisclosureBadgeProps = {
  label?: string;
  tone?: 'light' | 'dark' | 'amber';
  className?: string;
};

const TONE_CLASS: Record<NonNullable<AdDisclosureBadgeProps['tone']>, string> = {
  light: 'border-white/35 bg-black/50 text-white shadow-[0_8px_24px_-12px_rgba(15,23,42,0.7)]',
  dark: 'border-slate-200 bg-white/92 text-slate-700 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)]',
  amber: 'border-amber-200 bg-amber-50/92 text-amber-700 shadow-[0_8px_24px_-12px_rgba(120,53,15,0.18)]'
};

const AdDisclosureBadge: React.FC<AdDisclosureBadgeProps> = ({
  label = 'Ad',
  tone = 'dark',
  className = ''
}) => (
  <span
    className={`pointer-events-none inline-flex select-none items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur-sm ${TONE_CLASS[tone]} ${className}`.trim()}
    aria-label={label}
  >
    {label}
  </span>
);

export default AdDisclosureBadge;
