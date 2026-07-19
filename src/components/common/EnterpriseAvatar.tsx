import React, { useEffect, useMemo, useState } from 'react';
import OptimizedImage from '../media/OptimizedImage';
import {
  profilePhotoDebugLabel,
  resolveProfilePhotoCandidates
} from '../../utils/profilePhoto';
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
 * Phase 21.1.2R — photo-first avatar.
 * Initials are an underlay while loading and a fallback only after all candidates fail.
 * Never permanently hide a valid photo because of one temporary failure.
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

  const candidates = useMemo(
    () => resolveProfilePhotoCandidates({ user, src, name: displayName }),
    // Recompute when identity-ish fields change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      src,
      user,
      user?.id,
      user?.avatar,
      user?.avatarUrl,
      user?.avatar_url,
      user?.profilePhotoFileId,
      user?.avatarFileId,
      displayName
    ]
  );

  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failedAll, setFailedAll] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setLoaded(false);
    setFailedAll(false);
  }, [candidates.join('|')]);

  const activeSrc = !failedAll && candidates.length > 0 ? candidates[candidateIndex] || '' : '';
  const showImage = Boolean(activeSrc);

  const dim = SIZE_MAP[size] || SIZE_MAP.md;
  const radius =
    rounded === 'full' ? 'rounded-full' : rounded === '2xl' ? 'rounded-2xl' : 'rounded-xl';

  const onImageError = () => {
    setLoaded(false);
    const next = candidateIndex + 1;
    if (next < candidates.length) {
      setCandidateIndex(next);
      return;
    }
    // Temporary network blip: do not permanently mark failedAll for single-candidate
    // unless there is truly no next URL. Callers can remount with new src later.
    setFailedAll(true);
  };

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold ${dim.className} ${radius} ${className}`}
      style={{
        // Once photo is loaded, solid photo covers fully — keep neutral underlay color only for initials mode
        backgroundColor: loaded && showImage ? 'transparent' : colors.bg,
        color: colors.fg
      }}
      role="img"
      aria-label={alt || `${displayName} avatar`}
      data-testid="enterprise-avatar"
      data-phase="21.1.2R"
      data-has-image={showImage ? 'true' : 'false'}
      data-avatar-state={profilePhotoDebugLabel(candidates, loaded, failedAll || !candidates.length)}
    >
      {/* Initials underlay: hidden once a valid photo has decoded */}
      <span
        className={`select-none ${dim.text} leading-none transition-opacity duration-150 ${
          loaded && showImage ? 'opacity-0' : 'opacity-100'
        }`}
        aria-hidden={loaded && showImage}
      >
        {initials}
      </span>
      {showImage ? (
        <OptimizedImage
          key={activeSrc}
          src={activeSrc}
          alt={alt || displayName}
          width={dim.px}
          height={dim.px}
          disableSrcSet
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={onImageError}
        />
      ) : null}
    </div>
  );
};

export default React.memo(EnterpriseAvatar);
