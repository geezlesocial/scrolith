import React, { useEffect, useMemo, useState } from 'react';

type StoryMessageMediaThumbProps = {
  candidates: string[];
  reactionType?: string;
  outgoing?: boolean;
  className?: string;
};

/**
 * Story reaction / story message media thumbnail with multi-candidate fallback.
 * Historical messages often store bare file ids; callers must resolve URLs first.
 */
const StoryMessageMediaThumb: React.FC<StoryMessageMediaThumbProps> = ({
  candidates,
  reactionType,
  outgoing = false,
  className = ''
}) => {
  const urls = useMemo(
    () =>
      (Array.isArray(candidates) ? candidates : [])
        .map((v) => String(v || '').trim())
        .filter(Boolean),
    [candidates]
  );
  const [index, setIndex] = useState(0);
  const [failedAll, setFailedAll] = useState(urls.length === 0);

  useEffect(() => {
    setIndex(0);
    setFailedAll(urls.length === 0);
  }, [urls.join('|')]);

  const active = !failedAll && urls.length > 0 ? urls[Math.min(index, urls.length - 1)] : '';

  if (!active || failedAll) {
    return (
      <span
        className={`flex h-12 w-9 shrink-0 items-center justify-center rounded-lg text-base ${
          outgoing ? 'bg-white/15' : 'bg-gray-200'
        } ${className}`}
        aria-hidden="true"
      >
        {reactionType || 'S'}
      </span>
    );
  }

  return (
    <img
      key={active}
      src={active}
      alt=""
      className={`h-12 w-9 shrink-0 rounded-lg object-cover bg-black/10 ${className}`}
      loading="lazy"
      decoding="async"
      onError={() => {
        const next = index + 1;
        if (next < urls.length) {
          setIndex(next);
          return;
        }
        setFailedAll(true);
      }}
    />
  );
};

export default React.memo(StoryMessageMediaThumb);
