import React from 'react';
import { BriefcaseBusiness, CircleCheck } from 'lucide-react';
import { resolvePublicAvailabilityBadge } from '../../utils/publicAvailability';

type PublicAvailabilityStatusProps = {
  availableForHire?: boolean;
  weAreHiring?: boolean;
  accountType?: string | null;
  compact?: boolean;
};

/**
 * A text companion to the availability ring used on EnterpriseAvatar.
 * It deliberately resolves one public state so a profile with both settings
 * enabled never renders overlapping or conflicting statuses in a feed header.
 */
const PublicAvailabilityStatus: React.FC<PublicAvailabilityStatusProps> = ({
  availableForHire,
  weAreHiring,
  accountType,
  compact = false
}) => {
  const badge = resolvePublicAvailabilityBadge({ availableForHire, weAreHiring, accountType });
  if (!badge) return null;

  const isHiring = badge === 'we-are-hiring';
  const Icon = isHiring ? BriefcaseBusiness : CircleCheck;
  const label = isHiring ? 'We are hiring' : 'Available for hire';

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${
        isHiring
          ? 'border-blue-200 bg-blue-50 text-blue-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
      } ${compact ? '' : 'sm:text-[11px]'}`}
      title={label}
      data-testid="public-availability-status"
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
};

export default React.memo(PublicAvailabilityStatus);
