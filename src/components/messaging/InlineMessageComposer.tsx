import React, { useCallback, useEffect, useRef } from 'react';
import { Send, Loader2 } from 'lucide-react';

type InlineMessageComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
  conversationId: string;
};

const InlineMessageComposer: React.FC<InlineMessageComposerProps> = ({
  value,
  onChange,
  onSend,
  onTyping,
  disabled = false,
  sending = false,
  placeholder = 'Write a message…',
  conversationId
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendingLockRef = useRef(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(120, Math.max(40, el.scrollHeight))}px`;
  }, [value, conversationId]);

  const handleSend = useCallback(async () => {
    if (disabled || sending || sendingLockRef.current) return;
    if (!value.trim()) return;
    sendingLockRef.current = true;
    try {
      await onSend();
    } finally {
      sendingLockRef.current = false;
    }
  }, [disabled, sending, value, onSend]);

  return (
    <div className="border-t border-slate-200 bg-white p-2.5">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            onTyping?.(event.target.value.trim().length > 0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
          rows={1}
          disabled={disabled || sending}
          placeholder={placeholder}
          className={[
            'max-h-[120px] min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800',
            'placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
            'disabled:opacity-60'
          ].join(' ')}
          aria-label="Message composer"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={disabled || sending || !value.trim()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          aria-label="Send message"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-1 px-1 text-[10px] text-slate-400">Enter to send · Shift+Enter for new line</p>
    </div>
  );
};

export default InlineMessageComposer;
