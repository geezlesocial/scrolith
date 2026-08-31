import React from 'react';
import { Play } from 'lucide-react';
import EnterpriseImage from '../common/EnterpriseImage';
import type { JobCardMedia as JobCardMediaValue } from '../../utils/jobCardMedia';

type JobCardMediaProps = {
  media: JobCardMediaValue;
  alt: string;
  onError?: () => void;
  className?: string;
};

/** Stable job-owned media frame. Videos remain previews and do not autoplay in listings. */
const JobCardMedia: React.FC<JobCardMediaProps> = ({ media, alt, onError, className = '' }) => {
  if (!media) return null;

  return (
    <div className={`relative aspect-video w-full overflow-hidden bg-slate-950 ${className}`}>
      {media.type === 'video' ? (
        <video
          src={media.url}
          poster={media.thumbnailUrl || undefined}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          aria-label={alt}
          onError={onError}
        />
      ) : (
        <EnterpriseImage
          src={media.url}
          alt={alt}
          width={640}
          height={360}
          aspectRatio="16 / 9"
          rounded="rounded-none"
          className="h-full w-full"
          loading="lazy"
        />
      )}
      {media.type === 'video' ? (
        <span className="pointer-events-none absolute bottom-3 left-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white shadow-sm" aria-hidden>
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        </span>
      ) : null}
    </div>
  );
};

export default React.memo(JobCardMedia);
