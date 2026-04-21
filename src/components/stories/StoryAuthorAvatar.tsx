import React from 'react';
import OptimizedImage from '../media/OptimizedImage';

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
  const [failedSrc, setFailedSrc] = React.useState('');
  const fallbackInitial = String(initial || name || 'S').replace(/^@+/, '').trim().charAt(0).toUpperCase() || 'S';
  const shouldRenderImage = Boolean(imageSrc) && failedSrc !== imageSrc;

  React.useEffect(() => {
    if (!imageSrc) setFailedSrc('');
  }, [imageSrc]);

  return (
    <div className={className}>
      {shouldRenderImage ? (
        <OptimizedImage
          src={imageSrc}
          alt={name}
          width={width}
          height={height}
          sizes={sizes}
          className={imageClassName}
          loading={loading}
          onError={() => setFailedSrc(imageSrc)}
        />
      ) : (
        <span>{fallbackInitial}</span>
      )}
    </div>
  );
}
