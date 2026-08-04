import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const failedAvatarSources = new Map<string, number>();
const MAX_FAILED_AVATAR_SOURCES = 256;
const FAILED_AVATAR_TTL_MS = 5 * 60 * 1000;

const pruneFailedAvatarSources = (now = Date.now()) => {
  for (const [src, expiresAt] of failedAvatarSources) {
    if (expiresAt <= now) failedAvatarSources.delete(src);
  }
  while (failedAvatarSources.size > MAX_FAILED_AVATAR_SOURCES) {
    const first = failedAvatarSources.keys().next().value;
    if (!first) break;
    failedAvatarSources.delete(first);
  }
};

const isFailedAvatarSource = (src: string, now = Date.now()) => {
  const normalized = String(src || '').trim();
  if (!normalized) return false;
  const expiresAt = failedAvatarSources.get(normalized);
  if (!expiresAt) return false;
  if (expiresAt <= now) {
    failedAvatarSources.delete(normalized);
    return false;
  }
  return true;
};

const rememberFailedAvatarSource = (src: string, now = Date.now()) => {
  const normalized = String(src || '').trim();
  if (!normalized) return;
  failedAvatarSources.set(normalized, now + FAILED_AVATAR_TTL_MS);
  pruneFailedAvatarSources(now);
};

const clearFailedAvatarSource = (src: string) => {
  const normalized = String(src || '').trim();
  if (normalized) failedAvatarSources.delete(normalized);
};

export const __enterpriseAvatarFailureRegistryForTests = {
  remember: rememberFailedAvatarSource,
  isFailed: isFailedAvatarSource,
  clear: clearFailedAvatarSource,
  reset: () => failedAvatarSources.clear(),
  size: () => failedAvatarSources.size,
  ttlMs: FAILED_AVATAR_TTL_MS
};

type EnterpriseAvatarProps = {
  user?: any;
  src?: string | null;
  name?: string | null;
  size?: EnterpriseAvatarSize;
  className?: string;
  rounded?: 'full' | 'xl' | '2xl';
  alt?: string;
  /** Prefer eager for chat bars / headers so photos appear without multi-refresh. */
  loading?: 'lazy' | 'eager';
};

/**
 * Photo-first avatar.
 * Initials are underlay while loading and fallback ONLY when no photo exists
 * or every candidate permanently fails (not on first transient network error).
 */
const EnterpriseAvatar: React.FC<EnterpriseAvatarProps> = ({
  user,
  src,
  name,
  size = 'md',
  className = '',
  rounded = 'full',
  alt,
  loading = 'eager'
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      src,
      user,
      user?.id,
      user?.avatar,
      user?.avatarUrl,
      user?.avatar_url,
      user?.profilePhotoFileId,
      user?.profile_photo_file_id,
      user?.avatarFileId,
      user?.logoUrl,
      user?.logo,
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

  const viableCandidates = useMemo(
    () => candidates.filter((candidate) => !isFailedAvatarSource(candidate)),
    [candidates]
  );
  const activeSrc = !failedAll && viableCandidates.length > 0 ? viableCandidates[candidateIndex] || '' : '';
  const showImage = Boolean(activeSrc);

  const dim = SIZE_MAP[size] || SIZE_MAP.md;
  const radius =
    rounded === 'full' ? 'rounded-full' : rounded === '2xl' ? 'rounded-2xl' : 'rounded-xl';

  const onImageError = useCallback(() => {
    setLoaded(false);
    rememberFailedAvatarSource(activeSrc);
    const next = candidateIndex + 1;
    if (next < viableCandidates.length) {
      setCandidateIndex(next);
      return;
    }
    setFailedAll(true);
  }, [activeSrc, candidateIndex, viableCandidates.length]);

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold ${dim.className} ${radius} ${className}`}
      style={{
        backgroundColor: loaded && showImage ? 'transparent' : colors.bg,
        color: colors.fg
      }}
      role="img"
      aria-label={alt || `${displayName} avatar`}
      data-testid="enterprise-avatar"
      data-has-image={showImage ? 'true' : 'false'}
      data-avatar-state={profilePhotoDebugLabel(candidates, loaded, failedAll || !candidates.length)}
    >
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
          loading={loading}
          decoding="async"
          fetchPriority={loading === 'eager' ? 'high' : 'auto'}
          onLoad={() => {
            clearFailedAvatarSource(activeSrc);
            setLoaded(true);
          }}
          onError={onImageError}
        />
      ) : null}
    </div>
  );
};

export default React.memo(EnterpriseAvatar);
