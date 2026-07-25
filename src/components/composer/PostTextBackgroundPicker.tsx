import React from 'react';
import {
  POST_TEXT_BG_NONE_ID,
  postTextBackgroundThemes,
  type PostTextBackgroundTheme
} from '../../utils/postTextBackgrounds';

type Props = {
  value: string;
  onChange: (themeId: string) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Facebook-style background swatches for text posts.
 * Selecting a theme applies auto-compatible text color via theme definition.
 */
export const PostTextBackgroundPicker: React.FC<Props> = ({
  value,
  onChange,
  disabled = false,
  className = ''
}) => {
  const activeId = String(value || POST_TEXT_BG_NONE_ID);

  return (
    <div className={`min-w-0 space-y-2 ${className}`} data-testid="post-text-bg-picker">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Background
        </p>
        <p className="text-[11px] text-slate-400">Text-only post</p>
      </div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        <div className="flex w-max min-w-full flex-nowrap gap-2 sm:flex-wrap">
          {postTextBackgroundThemes.map((theme: PostTextBackgroundTheme) => {
            const isActive = activeId === theme.id;
            const isNone = theme.id === POST_TEXT_BG_NONE_ID;
            return (
              <button
                key={theme.id}
                type="button"
                disabled={disabled}
                title={theme.label}
                aria-label={`Background ${theme.label}`}
                aria-pressed={isActive}
                onClick={() => onChange(theme.id)}
                className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border-2 shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9 ${
                  isActive ? 'border-slate-900 ring-2 ring-slate-300' : 'border-white/80 hover:scale-105'
                }`}
                style={
                  isNone
                    ? {
                        background:
                          'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)'
                      }
                    : { background: theme.background }
                }
              >
                {isNone ? (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-600">
                    Aa
                  </span>
                ) : (
                  <span
                    className="absolute inset-0 flex items-center justify-center text-[10px] font-bold"
                    style={{ color: theme.textColor }}
                  >
                    Aa
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PostTextBackgroundPicker;
