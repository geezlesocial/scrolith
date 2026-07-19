import React, { useState } from 'react';
import OptimizedImage from '../media/OptimizedImage';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { resolvePostAttachmentMediaUrl } from '../../utils/postAttachmentMedia';
import { SafeMedia, SafeText } from '../../utils/safeRender';
import { FEED_MEDIA_FALLBACK_DATA_URI } from '../../utils/feedMediaPrefetch';

type EnterpriseImageProps = {
  src?: string | null | unknown;
  candidates?: unknown[];
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
  /** Visual placeholder kind when no image. */
  placeholder?: 'marketplace' | 'job' | 'generic' | 'avatar';
  aspectRatio?: string;
  rounded?: string;
  loading?: 'lazy' | 'eager';
};

const PLACEHOLDER_LABEL: Record<string, string> = {
  marketplace: 'Marketplace',
  job: 'Opportunity',
  generic: 'Media',
  avatar: 'Profile'
};

/**
 * Phase 21.1.1 — Universal image with skeleton, error recovery, never empty white box.
 */
const EnterpriseImage: React.FC<EnterpriseImageProps> = ({
  src,
  candidates = [],
  alt = '',
  width = 320,
  height = 200,
  className = '',
  placeholder = 'generic',
  aspectRatio,
  rounded = 'rounded-xl',
  loading = 'lazy'
}) => {
  const queue = React.useMemo(() => {
    const list: string[] = [];
    const push = (v: unknown) => {
      const raw = SafeMedia(v);
      if (!raw) return;
      const resolved =
        resolvePostAttachmentMediaUrl(typeof v === 'object' && v ? v : raw) ||
        resolveAssetUrl(raw) ||
        raw;
      if (resolved && !list.includes(resolved)) list.push(resolved);
    };
    push(src);
    (candidates || []).forEach(push);
    return list;
  }, [src, candidates]);

  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const current = !exhausted && queue[index] ? queue[index] : '';

  const onError = () => {
    if (index + 1 < queue.length) {
      setIndex((i) => i + 1);
      setLoaded(false);
      return;
    }
    setExhausted(true);
    setLoaded(false);
  };

  const label = PLACEHOLDER_LABEL[placeholder] || 'Media';

  return (
    <div
      className={`relative overflow-hidden bg-slate-100 ${rounded} ${className}`}
      style={aspectRatio ? { aspectRatio } : undefined}
      data-testid="enterprise-image"
      data-phase="21.1.1"
      data-state={current && loaded ? 'ready' : current ? 'loading' : 'placeholder'}
    >
      {/* Skeleton / brand placeholder underneath */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-50 text-slate-400"
        aria-hidden={Boolean(current && loaded)}
      >
        <svg
          viewBox="0 0 48 48"
          className="h-8 w-8 opacity-70"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="6" y="10" width="36" height="28" rx="4" />
          <circle cx="18" cy="20" r="3" />
          <path d="M6 32l10-8 8 6 8-10 10 12" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>

      {current ? (
        <OptimizedImage
          src={current}
          fallbackSrc={FEED_MEDIA_FALLBACK_DATA_URI}
          alt={SafeText(alt, label)}
          width={width}
          height={height}
          className={`relative z-[1] h-full w-full object-cover transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading={loading}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={onError}
        />
      ) : null}
    </div>
  );
};

export default React.memo(EnterpriseImage);
