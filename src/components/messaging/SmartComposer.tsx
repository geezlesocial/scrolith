/**
 * Phase 20.8 — Smart Composer
 * Compact enterprise composer: [+] [input] [mic] [suggest] [send]
 * Files / Media / Camera live behind the plus attachment launcher.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Plus,
  Send,
  Sparkles,
  Loader2,
  Paperclip,
  Image as ImageIcon,
  Camera,
  X
} from 'lucide-react';
import { computeComposerTextareaHeight } from '../../messages/messagesWorkspaceLayout';

export type SmartComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event?: React.FormEvent) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  canSend?: boolean;
  sending?: boolean;
  isMobile?: boolean;
  keyboardOpen?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
  /** Hidden file inputs + VoiceRecorder node rendered by parent (preserves existing upload/voice pipelines). */
  fileInputs?: React.ReactNode;
  voiceControl?: React.ReactNode;
  onPickFiles: () => void;
  onPickMedia: () => void;
  onPickCamera: () => void;
  onSuggestReply?: () => void | Promise<void>;
  suggestLoading?: boolean;
  showSuggestReply?: boolean;
  helperText?: string;
  isScrolitha?: boolean;
  /** Dock / compact surfaces */
  compact?: boolean;
  testId?: string;
};

type LauncherOption = {
  id: 'files' | 'media' | 'camera';
  label: string;
  description: string;
  icon: React.ReactNode;
  onSelect: () => void;
};

const SmartComposer: React.FC<SmartComposerProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Write a message…',
  disabled = false,
  canSend = false,
  sending = false,
  isMobile = false,
  keyboardOpen = false,
  textareaRef: externalTextareaRef,
  onKeyDown,
  onFocus,
  fileInputs,
  voiceControl,
  onPickFiles,
  onPickMedia,
  onPickCamera,
  onSuggestReply,
  suggestLoading = false,
  showSuggestReply = true,
  helperText,
  isScrolitha = false,
  compact = false,
  testId = 'smart-composer'
}) => {
  const localTextareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalTextareaRef || localTextareaRef;
  const plusRef = useRef<HTMLButtonElement>(null);
  const launcherRef = useRef<HTMLDivElement>(null);
  const launcherId = useId();
  const [launcherOpen, setLauncherOpen] = useState(false);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = computeComposerTextareaHeight({
      scrollHeight: el.scrollHeight,
      isMobile,
      keyboardOpen
    });
    el.style.height = `${next.height}px`;
    el.style.overflowY = next.overflowY;
  }, [textareaRef, isMobile, keyboardOpen]);

  useEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  useEffect(() => {
    if (!launcherOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLauncherOpen(false);
        window.requestAnimationFrame(() => plusRef.current?.focus());
      }
    };
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (launcherRef.current?.contains(target) || plusRef.current?.contains(target)) return;
      setLauncherOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [launcherOpen]);

  const options: LauncherOption[] = [
    {
      id: 'files',
      label: 'Files',
      description: 'PDFs, documents, resumes, and more',
      icon: <Paperclip className="h-4 w-4 text-slate-700" aria-hidden />,
      onSelect: onPickFiles
    },
    {
      id: 'media',
      label: 'Media',
      description: 'Photos, videos, and screenshots',
      icon: <ImageIcon className="h-4 w-4 text-indigo-600" aria-hidden />,
      onSelect: onPickMedia
    },
    {
      id: 'camera',
      label: 'Camera',
      description: 'Capture a new photo or video',
      icon: <Camera className="h-4 w-4 text-violet-600" aria-hidden />,
      onSelect: onPickCamera
    }
  ];

  const selectOption = (option: LauncherOption) => {
    setLauncherOpen(false);
    option.onSelect();
    window.requestAnimationFrame(() => plusRef.current?.focus());
  };

  const handleFormSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || sending || !canSend) return;
    await onSubmit(event);
  };

  const controlSize = compact ? 'h-9 w-9' : 'h-10 w-10';
  const sendMin = compact ? 'min-w-[2.5rem] px-3' : 'min-w-[5.5rem] px-4';

  return (
    <form
      onSubmit={(e) => void handleFormSubmit(e)}
      className={[
        'rounded-2xl border border-slate-200/90 bg-white shadow-sm',
        compact ? 'p-1.5' : 'p-2 md:p-2.5',
        isScrolitha ? 'ring-1 ring-indigo-100' : ''
      ].join(' ')}
      data-testid={testId}
      data-smart-composer="true"
      data-scrolitha-composer={isScrolitha ? 'true' : 'false'}
    >
      {fileInputs}

      <div className="flex items-end gap-1.5 md:gap-2">
        {/* Plus / attachment launcher */}
        <div className="relative shrink-0 self-end">
          <button
            ref={plusRef}
            type="button"
            disabled={disabled || sending}
            aria-haspopup="menu"
            aria-expanded={launcherOpen}
            aria-controls={launcherId}
            title="Add attachment"
            onClick={() => setLauncherOpen((open) => !open)}
            className={[
              'inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition',
              'hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500',
              'disabled:cursor-not-allowed disabled:opacity-50',
              controlSize
            ].join(' ')}
          >
            {launcherOpen ? (
              <X className="h-5 w-5" aria-hidden />
            ) : (
              <Plus className="h-5 w-5" aria-hidden />
            )}
            <span className="sr-only">{launcherOpen ? 'Close attachment menu' : 'Open attachment menu'}</span>
          </button>

          {launcherOpen ? (
            <div
              ref={launcherRef}
              id={launcherId}
              role="menu"
              aria-label="Attachment options"
              className={[
                'absolute z-40 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl',
                // Prefer opening upward so launcher does not cover the conversation above on short viewports
                'bottom-[calc(100%+0.4rem)] left-0'
              ].join(' ')}
              data-testid="smart-composer-attachment-launcher"
            >
              <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Attach</p>
              </div>
              <ul className="p-1.5">
                {options.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => selectOption(option)}
                      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 focus-visible:bg-blue-50 focus-visible:outline-none"
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm">
                        {option.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                          {option.description}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Text input */}
        <div
          className={[
            'min-w-0 flex-1 rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 via-white to-white transition',
            'focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100/80',
            compact ? 'px-2 py-1' : 'px-2.5 py-1.5 md:px-3'
          ].join(' ')}
        >
          <textarea
            ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
            className={[
              'w-full resize-none border-0 bg-transparent text-[15px] leading-6 text-slate-800 outline-none placeholder:text-slate-400',
              compact ? 'py-1.5' : 'py-1.5 md:py-2'
            ].join(' ')}
            placeholder={placeholder}
            value={value}
            disabled={disabled || sending}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onClick={onFocus}
            rows={1}
            data-testid="messages-composer-textarea"
            aria-label={isScrolitha ? 'Message Scrolitha' : 'Message input'}
          />
        </div>

        {/* Voice (parent supplies VoiceRecorder) */}
        {voiceControl ? <div className="shrink-0 self-end">{voiceControl}</div> : null}

        {/* Suggest Reply — secondary, never auto-send */}
        {showSuggestReply && onSuggestReply ? (
          <button
            type="button"
            disabled={disabled || sending || suggestLoading}
            onClick={() => void onSuggestReply()}
            title="Suggest Reply"
            className={[
              'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 transition',
              'hover:bg-purple-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-purple-500',
              'disabled:cursor-not-allowed disabled:opacity-50',
              compact ? 'h-9 px-2' : 'h-10 px-2.5 md:px-3'
            ].join(' ')}
            aria-label="Suggest reply"
            data-testid="smart-composer-suggest-reply"
          >
            {suggestLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden />
            )}
            {!compact && !isMobile ? (
              <span className="text-xs font-semibold">
                {suggestLoading ? 'Thinking…' : 'Suggest'}
              </span>
            ) : null}
          </button>
        ) : null}

        {/* Send */}
        <button
          type="submit"
          disabled={disabled || sending || !canSend}
          className={[
            'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-600 font-semibold text-white shadow-sm transition',
            'hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500',
            'disabled:cursor-not-allowed disabled:opacity-50',
            compact ? `h-9 ${sendMin}` : `h-10 ${sendMin} md:h-11`
          ].join(' ')}
          data-testid="smart-composer-send"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          {!compact ? <span className="text-sm">Send</span> : <span className="sr-only">Send</span>}
        </button>
      </div>

      {helperText ? (
        <p className="mt-1.5 truncate px-1 text-[11px] text-slate-500" data-testid="smart-composer-helper">
          {helperText}
        </p>
      ) : null}
    </form>
  );
};

export default SmartComposer;
