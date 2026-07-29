import React from 'react';
import { Hash, Sparkles, SmilePlus } from 'lucide-react';

type CaptionEnhancementToolbarProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  variant?: 'light' | 'dark';
};

const emojiChips = [
  { label: 'Rocket', value: '\u{1F680}' },
  { label: 'Sparkles', value: '\u2728' },
  { label: 'Fire', value: '\u{1F525}' },
  { label: 'Heart', value: '\u2764\uFE0F' },
  { label: 'Thumbs up', value: '\u{1F44D}' },
  { label: 'Briefcase', value: '\u{1F4BC}' }
];

const sentenceCase = (value: string) => {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const cleanCaption = (value: string) =>
  value
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const appendText = (current: string, addition: string) => {
  const base = String(current || '').trimEnd();
  if (!base) return addition.trim();
  if (/[\s\n]$/.test(current)) return `${current}${addition}`;
  return `${base} ${addition}`;
};

const CaptionEnhancementToolbar: React.FC<CaptionEnhancementToolbarProps> = ({
  value,
  onChange,
  disabled = false,
  variant = 'light'
}) => {
  const isDark = variant === 'dark';
  const buttonClass = isDark
    ? 'inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[11px] font-semibold text-white/85 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50'
    : 'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
  const emojiClass = isDark
    ? 'inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/8 text-base hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50'
    : 'inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="space-y-2" data-testid="caption-enhancement-toolbar">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || !value.trim()}
          onClick={() => onChange(sentenceCase(cleanCaption(value)))}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Professional
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || !value.trim()}
          onClick={() => onChange(appendText(cleanCaption(value), '\n\nKey highlight: '))}
        >
          <Hash className="h-3.5 w-3.5" aria-hidden />
          Highlight
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || !value.trim()}
          onClick={() => onChange(appendText(cleanCaption(value), '\n\nShare your thoughts below.'))}
        >
          CTA
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || !value.trim()}
          onClick={() => onChange(cleanCaption(value))}
        >
          Clean up
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={isDark ? 'inline-flex items-center gap-1 text-[11px] font-semibold text-white/55' : 'inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500'}>
          <SmilePlus className="h-3.5 w-3.5" aria-hidden />
          Emoji
        </span>
        {emojiChips.map((emoji) => (
          <button
            key={emoji.label}
            type="button"
            className={emojiClass}
            disabled={disabled}
            onClick={() => onChange(appendText(value, emoji.value))}
            aria-label={`Add ${emoji.label} emoji`}
          >
            {emoji.value}
          </button>
        ))}
      </div>
    </div>
  );
};

export default CaptionEnhancementToolbar;
