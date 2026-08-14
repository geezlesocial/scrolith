import React from 'react';

import RichCaptionText from '../../community/components/RichCaptionText';

type VideoCaptionOverlayProps = {
  text?: string | null;
  className?: string;
  compact?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
};

const VideoCaptionOverlay: React.FC<VideoCaptionOverlayProps> = ({
  text,
  className = '',
  compact = false,
  expandable = false,
  expanded = false,
  onToggleExpanded
}) => {
  const caption = String(text || '').replace(/\s+/g, ' ').trim();
  if (!caption) return null;
  const canExpand = expandable && caption.length > 120 && typeof onToggleExpanded === 'function';

  return (
    <div
      className={[
        'pointer-events-auto max-w-full rounded-2xl border border-white/12 bg-black/52 text-white shadow-[0_18px_48px_-28px_rgba(0,0,0,0.85)] backdrop-blur-md',
        compact ? 'px-3 py-2 text-[12px] leading-snug sm:text-[13px]' : 'px-3.5 py-2.5 text-[13px] leading-snug sm:px-4 sm:text-sm',
        className
      ]
        .filter(Boolean)
        .join(' ')}
      data-inline-video-control="true"
      title={caption}
    >
      <RichCaptionText
        text={caption}
        className={expanded ? '' : 'line-clamp-2'}
        preserveWhitespace={false}
      />
      {canExpand ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleExpanded();
          }}
          className="ml-1 mt-1 inline-flex min-h-11 items-center rounded-full px-1 text-[11px] font-semibold text-cyan-100 underline decoration-cyan-200/60 underline-offset-2 hover:text-white"
          aria-expanded={expanded}
        >
          {expanded ? 'Less' : 'More'}
        </button>
      ) : null}
    </div>
  );
};

export default VideoCaptionOverlay;
