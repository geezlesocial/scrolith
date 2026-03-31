import React from 'react';
import { resolveAssetUrl, resolveResponsiveAssetUrl } from '../../utils/assetUrl';

type OptimizedImageProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'srcSet' | 'width' | 'height' | 'loading' | 'decoding'
> & {
  src: string;
  fallbackSrc?: string | null;
  width: number;
  height: number;
  fit?: 'inside' | 'cover' | 'contain';
  quality?: number;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'auto' | 'sync';
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
  const retinaSrc = resolveResponsiveAssetUrl(src, {
    width: normalizedWidth * 2,
    height: normalizedHeight * 2,
    fit,
    quality
  });

  return {
    baseSrc,
    srcSet:
      retinaSrc && retinaSrc !== baseSrc
        ? `${baseSrc} 1x, ${retinaSrc} 2x`
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

  const [currentSrc, setCurrentSrc] = React.useState(resolvedSources.baseSrc);
  const [currentSrcSet, setCurrentSrcSet] = React.useState(
    disableSrcSet ? undefined : resolvedSources.srcSet
  );

  React.useEffect(() => {
    setCurrentSrc(resolvedSources.baseSrc);
    setCurrentSrcSet(disableSrcSet ? undefined : resolvedSources.srcSet);
  }, [disableSrcSet, resolvedSources.baseSrc, resolvedSources.srcSet]);

  return (
    <img
      {...rest}
      src={currentSrc}
      srcSet={currentSrcSet}
      alt={alt}
      width={normalizedWidth}
      height={normalizedHeight}
      loading={loading}
      decoding={decoding}
      onError={(event) => {
        if (fallbackSources && currentSrc !== fallbackSources.baseSrc) {
          setCurrentSrc(fallbackSources.baseSrc);
          setCurrentSrcSet(disableSrcSet ? undefined : fallbackSources.srcSet);
        }
        onError?.(event);
      }}
    />
  );
}
