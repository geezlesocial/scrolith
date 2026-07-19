import React, { useState } from 'react';
import OptimizedImage from '../media/OptimizedImage';
import { resolveUserAvatarUrl } from '../../utils/userAvatar';
import {
  SafeAvatarColor,
  SafeAvatarInitials,
  SafeAvatarName,
  SafeText
} from '../../utils/safeRender';

export type EnterpriseAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<EnterpriseAvatarSize, { px: number; className: string; text: string }> = {
  xs: { px: 24, className: 'h-6 w-6 text-[10px]', text: 'text-[10px]' },
  sm: { px: 32, className: 'h-8 w-8 text-xs', text: 'text-xs' },
  md: { px: 40, className: 'h-10 w-10 text-sm', text: 'text-sm' },
  lg: { px: 48, className: 'h-12 w-12 text-base', text: 'text-base' },
  xl: { px: 64, className: 'h-16 w-16 text-lg', text: 'text-lg' }
};

type EnterpriseAvatarProps = {
  user?: any;
  src?: string | null;
  name?: string | null;
  size?: EnterpriseAvatarSize;
  className?: string;
  rounded?: 'full' | 'xl' | '2xl';
  alt?: string;
};

/**
 * Phase 21.1.1 — Universal avatar: photo → initials → never blank white.
 */
const EnterpriseAvatar: React.FC<EnterpriseAvatarProps> = ({
  user,
  src,
  name,
  size = 'md',
  className = '',
  rounded = 'full',
  alt
}) => {
  const displayName = SafeAvatarName(
    name || user,
    SafeText(user?.username || user?.handle || 'Member', 'Member')
  );
  const initials = SafeAvatarInitials(name || user || displayName, 'M');
  const seed = SafeText(user?.id || user?.username || displayName, displayName);
  const colors = SafeAvatarColor(seed);
  const resolvedSrc =
    SafeText(src) ||
    resolveUserAvatarUrl(user) ||
    resolveUserAvatarUrl(src) ||
    '';

  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dim = SIZE_MAP[size] || SIZE_MAP.md;
  const radius =
    rounded === 'full' ? 'rounded-full' : rounded === '2xl' ? 'rounded-2xl' : 'rounded-xl';

  const showImage = Boolean(resolvedSrc) && !failed;

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold ${dim.className} ${radius} ${className}`}
      style={{ backgroundColor: colors.bg, color: colors.fg }}
      role="img"
      aria-label={alt || `${displayName} avatar`}
      data-testid="enterprise-avatar"
      data-phase="21.1.1"
      data-has-image={showImage ? 'true' : 'false'}
    >
      {/* Initials always present underneath to avoid white flash */}
      <span className={`select-none ${dim.text} leading-none`} aria-hidden={showImage}>
        {initials}
      </span>
      {showImage ? (
        <OptimizedImage
          src={resolvedSrc}
          alt={alt || displayName}
          width={dim.px}
          height={dim.px}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setFailed(true);
            setLoaded(false);
          }}
        />
      ) : null}
    </div>
  );
};

export default React.memo(EnterpriseAvatar);
