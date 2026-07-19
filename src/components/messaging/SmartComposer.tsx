/**
 * Phase 20.8 / 20.8.1 — Smart Composer
 * Desktop: [+] [input] [mic] [suggest] [send]
 * Mobile:  [+] [wide input………] [mic|send]  — suggest/disclosure progressive
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
  compact?: boolean;
  testId?: string;
};

type LauncherOption = {
  id: 'files' | 'media' | 'camera' | 'suggest';
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

  const hasDraft = Boolean(String(value || '').trim()) || canSend;
  // Phase 20.8.1 — mobile primary row only has + | input | trailing (mic XOR send)
  const mobilePrimary = isMobile && !compact;
  const showDesktopSuggest = Boolean(showSuggestReply && onSuggestReply && !mobilePrimary);
  const showMobileSuggestChip = Boolean(
    showSuggestReply && onSuggestReply && mobilePrimary && !keyboardOpen && !String(value || '').trim()
  );
  const showHelper = Boolean(helperText) && !(mobilePrimary && keyboardOpen);
  // Mobile empty: mic only. Mobile with content: send only. Desktop: both.
  const showVoiceSlot = Boolean(voiceControl) && (mobilePrimary ? !hasDraft && !sending : true);
  const showSendButton = mobilePrimary ? hasDraft || sending || !voiceControl : true;

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = computeComposerTextareaHeight({
      scrollHeight: el.scrollHeight,
      isMobile: isMobile || compact,
      keyboardOpen: isMobile && keyboardOpen
    });
    el.style.height = `${next.height}px`;
    el.style.overflowY = next.overflowY;
  }, [textareaRef, isMobile, compact, keyboardOpen]);

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

  // Close launcher when keyboard opens on mobile (avoid behind-keyboard menus)
  useEffect(() => {
    if (keyboardOpen && isMobile && launcherOpen) setLauncherOpen(false);
  }, [keyboardOpen, isMobile, launcherOpen]);

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

  if (mobilePrimary && showSuggestReply && onSuggestReply) {
    options.push({
      id: 'suggest',
      label: 'Suggest Reply',
      description: 'Draft a reply — you choose whether to send',
      icon: <Sparkles className="h-4 w-4 text-purple-600" aria-hidden />,
      onSelect: () => {
        void onSuggestReply();
      }
    });
  }

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

  const controlSize = mobilePrimary || compact ? 'h-11 w-11 min-h-[44px] min-w-[44px]' : 'h-10 w-10';
  const sendSize = mobilePrimary || compact ? 'h-11 w-11 min-h-[44px] min-w-[44px]' : 'h-10 min-w-[5.5rem] px-4 md:h-11';

  const launcherPanel = launcherOpen ? (
    isMobile ? (
      // Mobile bottom sheet
      <div className="fixed inset-0 z-[100]" data-testid="smart-composer-attachment-launcher">
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          aria-label="Close attachment menu"
          onClick={() => {
            setLauncherOpen(false);
            window.requestAnimationFrame(() => plusRef.current?.focus());
          }}
        />
        <div
          ref={launcherRef}
          role="menu"
          aria-label="Attachment options"
          className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-auto rounded-t-3xl border border-slate-200 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200" aria-hidden />
          <div className="px-4 pb-1 pt-3">
            <p className="text-sm font-bold text-slate-900">Attach</p>
          </div>
          <ul className="p-2">
            {options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => selectOption(option)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-left transition active:bg-slate-100 hover:bg-slate-50"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50">
                    {option.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-slate-900">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{option.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    ) : (
      <div
        ref={launcherRef}
        id={launcherId}
        role="menu"
        aria-label="Attachment options"
        className="absolute bottom-[calc(100%+0.4rem)] left-0 z-40 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        data-testid="smart-composer-attachment-launcher"
      >
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Attach</p>
        </div>
        <ul className="p-1.5">
          {options
            .filter((o) => o.id !== 'suggest')
            .map((option) => (
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
    )
  ) : null;

  return (
    <div className="w-full min-w-0">
      {showMobileSuggestChip ? (
        <div className="mb-1.5 flex justify-end px-0.5">
          <button
            type="button"
            disabled={disabled || sending || suggestLoading}
            onClick={() => void onSuggestReply?.()}
            className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700 disabled:opacity-50"
            data-testid="smart-composer-suggest-chip"
          >
            {suggestLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-3 w-3" aria-hidden />
            )}
            {suggestLoading ? 'Thinking…' : 'Suggest Reply'}
          </button>
        </div>
      ) : null}

      <form
        onSubmit={(e) => void handleFormSubmit(e)}
        className={[
          'w-full min-w-0 border border-slate-200/90 bg-white shadow-sm',
          mobilePrimary
            ? keyboardOpen
              ? 'rounded-xl p-1.5'
              : 'rounded-2xl p-1.5'
            : compact
              ? 'rounded-2xl p-1.5'
              : 'rounded-2xl p-2 md:p-2.5',
          isScrolitha ? 'ring-1 ring-indigo-100' : ''
        ].join(' ')}
        data-testid={testId}
        data-smart-composer="true"
        data-mobile-primary={mobilePrimary ? 'true' : 'false'}
        data-scrolitha-composer={isScrolitha ? 'true' : 'false'}
      >
        {fileInputs}

        <div className="flex w-full min-w-0 items-end gap-1.5">
          {/* Plus */}
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
              {launcherOpen ? <X className="h-5 w-5" aria-hidden /> : <Plus className="h-5 w-5" aria-hidden />}
              <span className="sr-only">{launcherOpen ? 'Close attachment menu' : 'Open attachment menu'}</span>
            </button>
            {!isMobile ? launcherPanel : null}
          </div>

          {/* Textarea — must take remaining width */}
          <div
            className={[
              'min-w-0 flex-1 basis-0 rounded-xl border border-slate-200 bg-white transition',
              'focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100/80',
              mobilePrimary || compact ? 'px-2.5 py-1' : 'px-2.5 py-1.5 md:px-3'
            ].join(' ')}
          >
            <textarea
              ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
              className={[
                'block w-full min-w-0 max-w-full resize-none border-0 bg-transparent text-[16px] leading-6 text-slate-800 outline-none placeholder:text-slate-400 md:text-[15px]',
                'overflow-x-hidden whitespace-pre-wrap break-words',
                mobilePrimary || compact ? 'py-2' : 'py-1.5 md:py-2'
              ].join(' ')}
              placeholder={placeholder}
              value={value}
              disabled={disabled || sending}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={onKeyDown}
              onFocus={onFocus}
              onClick={onFocus}
              rows={1}
              enterKeyHint="send"
              data-testid="messages-composer-textarea"
              aria-label={isScrolitha ? 'Message Scrolitha' : 'Message input'}
            />
          </div>

          {/* Trailing: mic when empty (mobile), send when draft */}
          {showVoiceSlot ? (
            <div className="shrink-0 self-end" data-testid="smart-composer-voice-slot">
              {voiceControl}
            </div>
          ) : null}

          {showDesktopSuggest ? (
            <button
              type="button"
              disabled={disabled || sending || suggestLoading}
              onClick={() => void onSuggestReply?.()}
              title="Suggest Reply"
              className={[
                'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 transition',
                'hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50',
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
              {!compact ? (
                <span className="text-xs font-semibold">
                  {suggestLoading ? 'Thinking…' : 'Suggest'}
                </span>
              ) : null}
            </button>
          ) : null}

          {showSendButton ? (
            <button
              type="submit"
              disabled={disabled || sending || !canSend}
              className={[
                'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-600 font-semibold text-white shadow-sm transition',
                'hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50',
                sendSize
              ].join(' ')}
              data-testid="smart-composer-send"
              aria-label="Send message"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              {!mobilePrimary && !compact ? <span className="text-sm">Send</span> : null}
            </button>
          ) : null}
        </div>

        {showHelper ? (
          <p
            className="mt-1 truncate px-1 text-[10px] text-slate-500 md:text-[11px]"
            data-testid="smart-composer-helper"
          >
            {helperText}
          </p>
        ) : null}
      </form>

      {isMobile ? launcherPanel : null}
    </div>
  );
};

export default SmartComposer;
