import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import {
  formatLanguageLabel,
  listOnboardingLanguages,
  searchLanguages,
  type SupportedLanguage
} from '../../utils/supportedLanguages';

type LanguageMultiSelectProps = {
  value: string[];
  onChange: (codes: string[]) => void;
  languages?: SupportedLanguage[];
  min?: number;
  max?: number;
  label?: string;
  helpText?: string;
  id?: string;
};

/**
 * Multi-select for languages the user understands.
 * Languages are not countries — no flags as primary UI.
 */
const LanguageMultiSelect: React.FC<LanguageMultiSelectProps> = ({
  value,
  onChange,
  languages,
  min = 1,
  max = 24,
  label = 'Languages I understand',
  helpText = 'Choose all languages you understand. This is not your nationality or location.',
  id = 'language-multiselect'
}) => {
  const [query, setQuery] = useState('');
  const catalog = languages?.length ? languages : listOnboardingLanguages();
  const selected = useMemo(() => new Set(value), [value]);
  const filtered = useMemo(() => searchLanguages(query, catalog), [query, catalog]);

  const toggle = (code: string) => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else {
      if (next.size >= max) return;
      next.add(code);
    }
    onChange(Array.from(next));
  };

  return (
    <div className="space-y-3" data-testid="language-multi-select">
      <div>
        <label htmlFor={`${id}-search`} className="block text-sm font-semibold text-slate-900">
          {label}
        </label>
        <p className="mt-1 text-xs text-slate-500">{helpText}</p>
      </div>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="list" aria-label="Selected languages">
          {value.map((code) => (
            <button
              key={code}
              type="button"
              role="listitem"
              onClick={() => toggle(code)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <span dir="auto" lang={code}>
                {formatLanguageLabel(code)}
              </span>
              <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="sr-only">Remove {formatLanguageLabel(code)}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          id={`${id}-search`}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, native name, or code"
          className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-base outline-none ring-blue-500 focus:ring-2 sm:text-sm"
          aria-controls={`${id}-options`}
          aria-describedby={`${id}-status`}
        />
      </div>

      <div
        id={`${id}-options`}
        role="group"
        aria-label="Available languages"
        className="max-h-[min(18rem,42dvh)] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1.5 sm:max-h-56 sm:p-2"
      >
        {filtered.map((lang) => {
          const active = selected.has(lang.code);
          return (
            <button
              key={lang.code}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(lang.code)}
              className={`mb-1 flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                active ? 'bg-blue-600 text-white' : 'hover:bg-slate-50 text-slate-800'
              }`}
            >
              <span dir="auto" className="min-w-0 font-medium" lang={lang.code}>
                {lang.nativeName !== lang.name ? lang.nativeName : lang.name}
              </span>
              <span className={`shrink-0 text-xs ${active ? 'text-blue-100' : 'text-slate-500'}`}>
                {lang.nativeName !== lang.name ? lang.name : lang.code.toUpperCase()}
                {lang.direction === 'rtl' ? ' · RTL' : ''}
              </span>
            </button>
          );
        })}
        {!filtered.length ? (
          <p className="px-3 py-4 text-center text-xs text-slate-500">No languages match your search.</p>
        ) : null}
      </div>

      <p id={`${id}-status`} className="text-xs text-slate-500" aria-live="polite">
        {value.length} selected
        {min > 0 ? ` · select at least ${min}` : ''}
        {max ? ` · up to ${max}` : ''}
      </p>
    </div>
  );
};

export default LanguageMultiSelect;
