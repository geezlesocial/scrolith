import React from 'react';

type OverlayActionRailButtonProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  showLabel?: boolean;
  className?: string;
};

const OverlayActionRailButton: React.FC<OverlayActionRailButtonProps> = ({
  icon: Icon,
  label,
  onClick,
  disabled,
  active = false,
  danger = false,
  showLabel = false,
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
      className={`inline-flex items-center justify-center text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
        showLabel
          ? 'min-h-[46px] min-w-[64px] flex-col rounded-2xl px-2 py-1.5'
          : 'h-11 w-11 rounded-2xl sm:h-12 sm:w-12'
      } ${toneClass} ${className}`.trim()}
      aria-label={label}
      title={label}
    >
      <Icon className={showLabel ? 'h-4 w-4' : 'h-5 w-5'} />
      {showLabel ? <span className="mt-1 text-[10px] font-semibold">{label}</span> : <span className="sr-only">{label}</span>}
    </button>
  );
};

export default OverlayActionRailButton;
