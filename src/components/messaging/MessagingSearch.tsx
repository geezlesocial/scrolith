import React, { useId } from 'react';
import { Search, X } from 'lucide-react';

type MessagingSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  id?: string;
  className?: string;
};

const MessagingSearch: React.FC<MessagingSearchProps> = ({
  value,
  onChange,
  placeholder = 'Search messages',
  loading = false,
  id,
  className = ''
}) => {
  const autoId = useId();
  const inputId = id || autoId;

  return (
    <div className={`relative ${className}`.trim()}>
      <label htmlFor={inputId} className="sr-only">
        {placeholder}
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
      <input
        id={inputId}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={[
          'w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-sm text-slate-800',
          'placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:outline-none',
          'focus-visible:ring-2 focus-visible:ring-blue-500/30'
        ].join(' ')}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {loading ? (
        <span className="sr-only" aria-live="polite">
          Searching messages
        </span>
      ) : null}
    </div>
  );
};

export default MessagingSearch;
