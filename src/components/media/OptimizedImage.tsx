import React from 'react';
import { resolveAssetUrl, resolveResponsiveAssetUrl } from '../../utils/assetUrl';

type OptimizedImageProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'srcSet' | 'sizes' | 'width' | 'height' | 'loading' | 'decoding' | 'fetchPriority'
> & {
  src: string;
  fallbackSrc?: string | null;
  width: number;
  height: number;
  fit?: 'inside' | 'cover' | 'contain';
  quality?: number;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'auto' | 'sync';
  sizes?: string;
  fetchPriority?: 'high' | 'low' | 'auto';
  disableSrcSet?: boolean;
};

const normalizeDimension = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.round(value));
};

const buildResponsiveSources = (
  src: string,
  width: number,
  height: number,
  fit: 'inside' | 'cover' | 'contain',
  quality?: number
) => {
  const normalizedWidth = normalizeDimension(width);
  const normalizedHeight = normalizeDimension(height);
  const baseSrc = resolveResponsiveAssetUrl(src, {
    width: normalizedWidth,
    height: normalizedHeight,
    fit,
    quality
  });
  const candidateWidths = Array.from(
    new Set(
      [normalizedWidth * 0.75, normalizedWidth, normalizedWidth * 1.5, normalizedWidth * 2]
        .map((value) => normalizeDimension(value))
        .filter((value) => value >= 96)
    )
  ).sort((a, b) => a - b);
  const variants = candidateWidths
    .map((candidateWidth) => {
      const ratio = normalizedWidth > 0 ? normalizedHeight / normalizedWidth : 1;
      const candidateHeight = normalizeDimension(candidateWidth * ratio);
      return {
        width: candidateWidth,
        url: resolveResponsiveAssetUrl(src, {
          width: candidateWidth,
          height: candidateHeight,
          fit,
          quality
        })
      };
    })
    .filter((entry) => Boolean(entry.url));
  const uniqueVariants = variants.filter(
    (entry, index, list) => list.findIndex((candidate) => candidate.url === entry.url) === index
  );

  return {
    baseSrc,
    srcSet:
      uniqueVariants.length > 1
        ? uniqueVariants.map((entry) => `${entry.url} ${entry.width}w`).join(', ')
        : undefined
  };
};

export default function OptimizedImage({
  src,
  fallbackSrc,
  alt,
  width,
  height,
  fit = 'cover',
  quality = 72,
  loading = 'lazy',
  decoding = 'async',
  sizes,
  fetchPriority = 'auto',
  disableSrcSet = false,
  onError,
  ...rest
}: OptimizedImageProps) {
  const normalizedWidth = normalizeDimension(width);
  const normalizedHeight = normalizeDimension(height);
  const fallback = React.useMemo(() => {
    const value = String(fallbackSrc || '').trim();
    return value ? resolveAssetUrl(value) : '';
  }, [fallbackSrc]);
  const resolvedSources = React.useMemo(
    () => buildResponsiveSources(src, normalizedWidth, normalizedHeight, fit, quality),
    [fit, normalizedHeight, normalizedWidth, quality, src]
  );
  const fallbackSources = React.useMemo(
    () =>
      fallback
        ? buildResponsiveSources(fallback, normalizedWidth, normalizedHeight, fit, quality)
        : null,
    [fallback, fit, normalizedHeight, normalizedWidth, quality]
  );

  const originalSrc = React.useMemo(() => resolveAssetUrl(src), [src]);
  const [currentSrc, setCurrentSrc] = React.useState(resolvedSources.baseSrc);
  const [currentSrcSet, setCurrentSrcSet] = React.useState(
    disableSrcSet ? undefined : resolvedSources.srcSet
  );
  const [triedOriginal, setTriedOriginal] = React.useState(false);
  const [triedFallback, setTriedFallback] = React.useState(false);

  React.useEffect(() => {
    setCurrentSrc(resolvedSources.baseSrc);
    setCurrentSrcSet(disableSrcSet ? undefined : resolvedSources.srcSet);
    setTriedOriginal(false);
    setTriedFallback(false);
  }, [disableSrcSet, resolvedSources.baseSrc, resolvedSources.srcSet, fallback]);

  const computedSizes = currentSrcSet ? sizes || `${normalizedWidth}px` : undefined;

  // Never render empty src — leaves broken icon in some browsers.
  if (!currentSrc && !fallback) {
    return null;
  }

  return (
    <img
      {...rest}
      src={currentSrc || fallback || undefined}
      srcSet={currentSrcSet}
      sizes={computedSizes}
      alt={alt}
      width={normalizedWidth}
      height={normalizedHeight}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      onError={(event) => {
        // 1) Prefer original untransformed content URL when responsive variants fail
        // (missing transform, cache-key miss, or backend 404 on ?w=&h=).
        if (
          !triedOriginal &&
          originalSrc &&
          currentSrc !== originalSrc
        ) {
          setTriedOriginal(true);
          setCurrentSrc(originalSrc);
          setCurrentSrcSet(undefined);
          return;
        }
        // 2) Switch once to fallbackSrc (e.g. legacy /uploads after content 404).
        // Never retry the same URL — prevents infinite error loops.
        if (
          !triedFallback &&
          fallbackSources &&
          fallbackSources.baseSrc &&
          currentSrc !== fallbackSources.baseSrc
        ) {
          setTriedFallback(true);
          setCurrentSrc(fallbackSources.baseSrc);
          setCurrentSrcSet(disableSrcSet ? undefined : fallbackSources.srcSet);
          return;
        }
        onError?.(event);
      }}
    />
  );
}
