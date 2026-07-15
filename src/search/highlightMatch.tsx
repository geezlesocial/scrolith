import React from 'react';
import { escapeRegExp } from './enterpriseSearch.ux';

/** Highlight query tokens in text (safe, no HTML injection). */
export function HighlightMatch({
  text,
  query,
  className = ''
}: {
  text: string;
  query?: string;
  className?: string;
}) {
  const source = String(text || '');
  const q = String(query || '').trim();
  if (!q || !source) {
    return <span className={className}>{source}</span>;
  }

  const tokens = q
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 8);
  if (!tokens.length) {
    return <span className={className}>{source}</span>;
  }

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'ig');
  const parts = source.split(pattern);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        const isMatch = tokens.some((t) => t.toLowerCase() === part.toLowerCase());
        if (isMatch) {
          return (
            <mark
              key={`${part}-${index}`}
              className="rounded-sm bg-amber-100 px-0.5 font-semibold text-slate-900 dark:bg-amber-400/30"
            >
              {part}
            </mark>
          );
        }
        return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
      })}
    </span>
  );
}
