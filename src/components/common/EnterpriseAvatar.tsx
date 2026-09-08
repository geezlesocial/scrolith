import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import AvailabilityAvatarBadge from './AvailabilityAvatarBadge';
import { resolvePublicAvailabilityFlags } from '../../utils/publicAvailability';

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
  /** Prefer eager for chat bars / headers so photos appear without multi-refresh. */
  loading?: 'lazy' | 'eager';
  /** Optional explicit public hiring signals for lightweight user projections. */
  availableForHire?: boolean;
  weAreHiring?: boolean;
  accountType?: string | null;
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
  loading = 'eager',
  availableForHire,
  weAreHiring,
  accountType
}) => {
  const displayName = SafeAvatarName(
    name || user,
    SafeText(user?.username || user?.handle || 'Member', 'Member')
  );
  const initials = SafeAvatarInitials(name || user || displayName, 'M');
  const seed = SafeText(user?.id || user?.username || displayName, displayName);
  const colors = SafeAvatarColor(seed);
  const explicitAvailability = resolvePublicAvailabilityFlags(user);
  const publicAvailability = {
    availableForHire: availableForHire ?? explicitAvailability.availableForHire,
    weAreHiring: weAreHiring ?? explicitAvailability.weAreHiring
  };
  const [liveAvailability, setLiveAvailability] = useState<typeof publicAvailability | null>(null);

  useEffect(() => {
    const userId = String(user?.id || user?.userId || '').trim();
    if (!userId || typeof window === 'undefined') return;
    const onAvailabilityUpdate = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.userId || detail.user_id || '').trim() !== userId) return;
      const next = resolvePublicAvailabilityFlags({
        ...detail,
        availability: detail.availability,
        hiring: detail.hiring
      });
      setLiveAvailability(next);
    };
    window.addEventListener('profile:availability_updated', onAvailabilityUpdate as EventListener);
    window.addEventListener('profile:hiring_updated', onAvailabilityUpdate as EventListener);
    return () => {
      window.removeEventListener('profile:availability_updated', onAvailabilityUpdate as EventListener);
      window.removeEventListener('profile:hiring_updated', onAvailabilityUpdate as EventListener);
    };
  }, [user?.id, user?.userId]);

  const effectiveAvailability = liveAvailability || publicAvailability;

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
  const [retryToken, setRetryToken] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failCountRef = useRef(0);

  useEffect(() => {
    setCandidateIndex(0);
    setLoaded(false);
    setFailedAll(false);
    failCountRef.current = 0;
    setRetryToken(0);
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [candidates.join('|')]);

  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    []
  );

  const activeSrc = !failedAll && candidates.length > 0 ? candidates[candidateIndex] || '' : '';
  const showImage = Boolean(activeSrc);

  const dim = SIZE_MAP[size] || SIZE_MAP.md;
  const radius =
    rounded === 'full' ? 'rounded-full' : rounded === '2xl' ? 'rounded-2xl' : 'rounded-xl';

  const onImageError = useCallback(() => {
    setLoaded(false);
    const next = candidateIndex + 1;
    if (next < candidates.length) {
      setCandidateIndex(next);
      return;
    }
    // Transient failure: retry primary candidate a few times before initials-only.
    failCountRef.current += 1;
    if (failCountRef.current <= 3 && candidates.length > 0) {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        setCandidateIndex(0);
        setFailedAll(false);
        setRetryToken((t) => t + 1);
      }, 600 * failCountRef.current);
      return;
    }
    setFailedAll(true);
  }, [candidateIndex, candidates.length]);

  const avatar = (
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
          key={`${activeSrc}:${retryToken}`}
          src={
            retryToken > 0
              ? `${activeSrc}${activeSrc.includes('?') ? '&' : '?'}_av=${retryToken}`
              : activeSrc
          }
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
            failCountRef.current = 0;
            setLoaded(true);
          }}
          onError={onImageError}
        />
      ) : null}
    </div>
  );

  return effectiveAvailability.availableForHire || effectiveAvailability.weAreHiring ? (
    <AvailabilityAvatarBadge
      availableForHire={effectiveAvailability.availableForHire}
      weAreHiring={effectiveAvailability.weAreHiring}
      accountType={accountType || user?.role}
      size={size}
      aria-label={alt || `${displayName} avatar`}
    >
      {avatar}
    </AvailabilityAvatarBadge>
  ) : avatar;
};

export default React.memo(EnterpriseAvatar);
