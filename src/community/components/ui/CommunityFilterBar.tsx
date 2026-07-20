import React from 'react';
import { communityTouchTargets } from '../../design/communityTokens';

export type CommunityFilterOption = {
  id: string;
  label: string;
};

const CommunityFilterBar: React.FC<{
  options: CommunityFilterOption[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}> = ({ options, value, onChange, ariaLabel = 'Community filters' }) => (
  <div
    className="flex gap-2 overflow-x-auto pb-1 no-scrollbar"
    role="tablist"
    aria-label={ariaLabel}
    data-testid="community-filter-bar"
  >
    {options.map((option) => {
      const active = option.id === value;
      return (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(option.id)}
          className={`${communityTouchTargets.chip} shrink-0 rounded-full border text-xs font-semibold transition sm:text-sm ${
            active
              ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export default CommunityFilterBar;
