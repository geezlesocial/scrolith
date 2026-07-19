import React from 'react';
import EnterpriseAvatar from '../common/EnterpriseAvatar';

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

/**
 * Phase 21.1.2 — story author avatars route through EnterpriseAvatar
 * (photo → initials, no blank/white flash). Outer className keeps ring/layout from callers.
 */
export default function StoryAuthorAvatar({
  src,
  name,
  initial,
  className,
  width = 72,
  height = 72
}: StoryAuthorAvatarProps) {
  const sizePx = Math.max(width || 0, height || 0) || 72;
  const size =
    sizePx <= 28 ? 'xs' : sizePx <= 36 ? 'sm' : sizePx <= 44 ? 'md' : sizePx <= 56 ? 'lg' : 'xl';

  return (
    <div className={className}>
      <EnterpriseAvatar
        src={src}
        name={name || initial || 'Story'}
        size={size as any}
        className="!h-full !w-full !text-[inherit]"
        alt={name || 'Story author'}
      />
    </div>
  );
}
