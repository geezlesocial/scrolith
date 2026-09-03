import React from 'react';
import type { EnterpriseAvatarSize } from './EnterpriseAvatar';
import {
  resolvePublicAvailabilityBadge,
  type PublicAvailabilityAccountType
} from '../../utils/publicAvailability';

const BADGE_ASSETS = {
  'available-for-hire': {
    src: '/assets/availability/available-for-hire-ring.png',
    label: 'Available for Hire'
  },
  'we-are-hiring': {
    src: '/assets/availability/we-are-hiring-ring.png',
    label: 'We Are Hiring'
  }
} as const;

// Keep the ring slightly larger than the photo while avoiding oversized
// intrinsic-image sizing on small screens and recommendation cards.
const BADGE_SCALE: Record<EnterpriseAvatarSize, number> = {
  xs: 1.25,
  sm: 1.28,
  md: 1.32,
  lg: 1.34,
  xl: 1.36
};

type AvailabilityAvatarBadgeProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'children' | 'className'> & {
  children: React.ReactNode;
  availableForHire?: boolean;
  weAreHiring?: boolean;
  accountType?: PublicAvailabilityAccountType;
  size?: EnterpriseAvatarSize;
  className?: string;
};

/** Adds transparent status artwork without changing avatar layout or click behavior. */
const AvailabilityAvatarBadge: React.FC<AvailabilityAvatarBadgeProps> = ({
  children,
  availableForHire = false,
  weAreHiring = false,
  accountType,
  size = 'md',
  className = '',
  ...rest
}) => {
  const badge = resolvePublicAvailabilityBadge({ availableForHire, weAreHiring, accountType });
  const asset = badge ? BADGE_ASSETS[badge] : null;
  const badgeScale = BADGE_SCALE[size] || BADGE_SCALE.md;

  return (
    <span {...rest} className={`relative inline-flex shrink-0 items-center justify-center overflow-visible ${className}`.trim()}>
      {children}
      {asset ? (
        <>
          <img
            src={asset.src}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 aspect-square max-w-none -translate-x-1/2 -translate-y-1/2 object-contain select-none"
            style={{ width: `${badgeScale * 100}%`, height: `${badgeScale * 100}%` }}
            draggable={false}
          />
          <span className="sr-only">{asset.label}</span>
        </>
      ) : null}
    </span>
  );
};

export default React.memo(AvailabilityAvatarBadge);
