import React from 'react';
import { useContent } from '../context/ContentContext';

type ProBadgeRole = 'freelancer' | 'employer';

interface ProBadgeProps {
  role: ProBadgeRole;
  isPro?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const ProBadge: React.FC<ProBadgeProps> = ({ role, isPro, size = 'sm', className = '' }) => {
  const { settings } = useContent();

  if (!isPro) return null;

  const freelancerLogo =
    (settings as any)?.pro_freelancer_label_url ??
    (settings as any)?.proFreelancerLabelUrl ??
    (settings as any)?.pro_freelancer_label ??
    (settings as any)?.proFreelancerLabel;
  const employerLogo =
    (settings as any)?.pro_employer_label_url ??
    (settings as any)?.proEmployerLabelUrl ??
    (settings as any)?.pro_employer_label ??
    (settings as any)?.proEmployerLabel;

  const logoUrl = role === 'freelancer' ? freelancerLogo : employerLogo;
  const height = size === 'md' ? 'h-5' : 'h-4';

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="Pro verified"
        className={`${height} w-auto object-contain ${className}`}
        loading="lazy"
      />
    );
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 ${className}`}
    >
      Pro Verified
    </span>
  );
};

export default ProBadge;
