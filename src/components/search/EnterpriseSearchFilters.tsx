import React from 'react';
import type { SearchUxFilters, SearchUxTab } from '../../search/enterpriseSearch.ux';
import { filtersRelevantToTab } from '../../search/enterpriseSearch.ux';

export function EnterpriseSearchFilters({
  tab,
  filters,
  onChange,
  sticky = true
}: {
  tab: SearchUxTab;
  filters: SearchUxFilters;
  onChange: (next: SearchUxFilters) => void;
  sticky?: boolean;
}) {
  const relevant = filtersRelevantToTab(tab);

  const set = <K extends keyof SearchUxFilters>(key: K, value: SearchUxFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <aside
      className={[
        'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm',
        sticky ? 'lg:sticky lg:top-24' : ''
      ].join(' ')}
      aria-label="Search filters"
    >
      <h2 className="text-sm font-bold text-slate-900">Filters</h2>
      <p className="mt-1 text-xs text-slate-500">Shown for the current result type.</p>

      <div className="mt-4 space-y-4">
        {relevant.includes('sort') ? (
          <label className="block text-xs font-semibold text-slate-600">
            Sort
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              value={filters.sort || 'relevance'}
              onChange={(e) => set('sort', e.target.value as SearchUxFilters['sort'])}
            >
              <option value="relevance">Relevance</option>
              <option value="recent">Most recent</option>
              <option value="popular">Popular</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </label>
        ) : null}

        {relevant.includes('datePreset') ? (
          <label className="block text-xs font-semibold text-slate-600">
            Date
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              value={filters.datePreset || 'any'}
              onChange={(e) => set('datePreset', e.target.value as SearchUxFilters['datePreset'])}
            >
              <option value="any">Any time</option>
              <option value="24h">Past 24 hours</option>
              <option value="7d">Past week</option>
              <option value="30d">Past month</option>
            </select>
          </label>
        ) : null}

        {relevant.includes('location') ? (
          <label className="block text-xs font-semibold text-slate-600">
            Location
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              placeholder="City, country..."
              value={filters.location || ''}
              onChange={(e) => set('location', e.target.value)}
            />
          </label>
        ) : null}

        {relevant.includes('category') ? (
          <label className="block text-xs font-semibold text-slate-600">
            Category
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              placeholder="Category"
              value={filters.category || ''}
              onChange={(e) => set('category', e.target.value)}
            />
          </label>
        ) : null}

        {relevant.includes('priceMin') || relevant.includes('priceMax') ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold text-slate-600">
              Min price
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                value={filters.priceMin ?? ''}
                onChange={(e) => set('priceMin', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Max price
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                value={filters.priceMax ?? ''}
                onChange={(e) => set('priceMax', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </label>
          </div>
        ) : null}

        {relevant.includes('salaryMin') || relevant.includes('salaryMax') ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold text-slate-600">
              Min salary
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                value={filters.salaryMin ?? ''}
                onChange={(e) => set('salaryMin', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Max salary
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                value={filters.salaryMax ?? ''}
                onChange={(e) => set('salaryMax', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </label>
          </div>
        ) : null}

        {relevant.includes('verified') ? (
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              checked={Boolean(filters.verified)}
              onChange={(e) => set('verified', e.target.checked || undefined)}
            />
            Verified only
          </label>
        ) : null}

        {relevant.includes('relationship') ? (
          <label className="block text-xs font-semibold text-slate-600">
            Relationship
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              value={filters.relationship || 'anyone'}
              onChange={(e) => set('relationship', e.target.value as SearchUxFilters['relationship'])}
            >
              <option value="anyone">Anyone</option>
              <option value="following">Following</option>
              <option value="connections">Connections</option>
              <option value="in_community">In community</option>
            </select>
          </label>
        ) : null}

        {relevant.includes('language') ? (
          <label className="block text-xs font-semibold text-slate-600">
            Language
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              placeholder="en, es..."
              value={filters.language || ''}
              onChange={(e) => set('language', e.target.value)}
            />
          </label>
        ) : null}

        {relevant.includes('availability') ? (
          <label className="block text-xs font-semibold text-slate-600">
            Availability
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              value={filters.availability || ''}
              onChange={(e) => set('availability', e.target.value || undefined)}
            >
              <option value="">Any</option>
              <option value="available">Available</option>
              <option value="open_to_work">Open to work</option>
            </select>
          </label>
        ) : null}

        <button
          type="button"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          onClick={() => onChange({ sort: 'relevance' })}
        >
          Reset filters
        </button>
      </div>
    </aside>
  );
}
