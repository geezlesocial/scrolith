import React from 'react';
import { Search, X } from 'lucide-react';
import { communityTouchTargets } from '../../design/communityTokens';

const CommunitySearchBar: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  loading?: boolean;
}> = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search communities…',
  loading = false
}) => (
  <form
    className="relative"
    role="search"
    aria-label="Search communities"
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit?.();
    }}
    data-testid="community-search-bar"
  >
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      enterKeyHint="search"
      autoComplete="off"
      className={`${communityTouchTargets.min} w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100`}
      aria-busy={loading || undefined}
    />
    {value ? (
      <button
        type="button"
        onClick={() => onChange('')}
        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Clear search"
      >
        <X className="h-4 w-4" />
      </button>
    ) : null}
  </form>
);

export default CommunitySearchBar;
