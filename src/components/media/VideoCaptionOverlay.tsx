import React from 'react';

import RichCaptionText from '../../community/components/RichCaptionText';

type VideoCaptionOverlayProps = {
  text?: string | null;
  className?: string;
  compact?: boolean;
};

const VideoCaptionOverlay: React.FC<VideoCaptionOverlayProps> = ({
  text,
  className = '',
  compact = false
}) => {
  const caption = String(text || '').replace(/\s+/g, ' ').trim();
  if (!caption) return null;

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
      <RichCaptionText text={caption} className="line-clamp-2" preserveWhitespace={false} />
    </div>
  );
};

export default VideoCaptionOverlay;
