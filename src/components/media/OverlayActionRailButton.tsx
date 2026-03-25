import React from 'react';

type OverlayActionRailButtonProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  className?: string;
};

const OverlayActionRailButton: React.FC<OverlayActionRailButtonProps> = ({
  icon: Icon,
  label,
  onClick,
  disabled,
  active = false,
  danger = false,
  className = ''
}) => {
  const toneClass = danger
    ? 'bg-rose-600/80 text-white hover:bg-rose-600'
    : active
      ? 'bg-blue-600/85 text-white ring-1 ring-blue-200/60'
      : 'bg-black/45 text-white hover:bg-black/65';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-[46px] min-w-[64px] flex-col items-center justify-center rounded-2xl px-2 py-1.5 text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${toneClass} ${className}`.trim()}
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
      <span className="mt-1 text-[10px] font-semibold">{label}</span>
    </button>
  );
};

export default OverlayActionRailButton;
