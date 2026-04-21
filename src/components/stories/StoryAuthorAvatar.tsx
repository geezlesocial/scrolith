import React from 'react';
import { resolveAssetUrl } from '../../utils/assetUrl';

type StoryAuthorAvatarProps = {
  src?: string | null;
  name: string;
  initial: string;
  className: string;
  imageClassName?: string;
  width?: number;
  height?: number;
  sizes?: string;
  loading?: 'lazy' | 'eager';
};

export default function StoryAuthorAvatar({
  src,
  name,
  initial,
  className,
  imageClassName = 'h-full w-full object-cover',
  width = 72,
  height = 72,
  sizes = '72px',
  loading = 'lazy'
}: StoryAuthorAvatarProps) {
  const imageSrc = String(src || '').trim();
  const resolvedImageSrc = imageSrc ? resolveAssetUrl(imageSrc) : '';
  const [failedSrc, setFailedSrc] = React.useState('');
  const fallbackInitial = String(initial || name || 'S').replace(/^@+/, '').trim().charAt(0).toUpperCase() || 'S';
  const shouldRenderImage = Boolean(resolvedImageSrc) && failedSrc !== resolvedImageSrc;

  React.useEffect(() => {
    if (!resolvedImageSrc) setFailedSrc('');
  }, [resolvedImageSrc]);

  return (
    <div className={className}>
      {shouldRenderImage ? (
        <img
          src={resolvedImageSrc}
          alt={name}
          width={width}
          height={height}
          className={imageClassName}
          loading={loading}
          decoding="async"
          onError={() => setFailedSrc(resolvedImageSrc)}
        />
      ) : (
        <span>{fallbackInitial}</span>
      )}
    </div>
  );
}
