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

const BADGE_SIZE: Record<EnterpriseAvatarSize, string> = {
  xs: '-inset-[22%]',
  sm: '-inset-[20%]',
  md: '-inset-[18%]',
  lg: '-inset-[16%]',
  xl: '-inset-[14%]'
};

type AvailabilityAvatarBadgeProps = {
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
  className = ''
}) => {
  const badge = resolvePublicAvailabilityBadge({ availableForHire, weAreHiring, accountType });
  const asset = badge ? BADGE_ASSETS[badge] : null;

  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-visible ${className}`.trim()}>
      {children}
      {asset ? (
        <>
          <img
            src={asset.src}
            alt=""
            aria-hidden="true"
            className={`pointer-events-none absolute z-10 h-auto w-auto max-w-none object-contain select-none ${BADGE_SIZE[size]}`}
            draggable={false}
          />
          <span className="sr-only">{asset.label}</span>
        </>
      ) : null}
    </span>
  );
};

export default React.memo(AvailabilityAvatarBadge);
