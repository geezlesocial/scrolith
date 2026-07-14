import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Minus, X, Loader2 } from 'lucide-react';
import type { Conversation, Message } from '../../types';
import { useMessages } from '../../context/MessageContext';
import { useUser } from '../../context/UserContext';
import { resolveUserAvatarUrl } from '../../utils/userAvatar';
import {
  formatRelativeMessageTime,
  getConversationAvatarParticipant,
  getConversationDisplayName,
  getMessagePreviewText
} from '../../services/messagingSurfaces';
import InlineMessageComposer from './InlineMessageComposer';
import { getRecoverableActionMessage } from '../../mobile/runtime/requestRecovery';

type MessagingChatWindowProps = {
  conversationId: string;
  minimized?: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onRestore: () => void;
  style?: React.CSSProperties;
};

const MessagingChatWindow: React.FC<MessagingChatWindowProps> = ({
  conversationId,
  minimized = false,
  onClose,
  onMinimize,
  onRestore,
  style
}) => {
  const { user } = useUser();
  const {
    conversations,
    getThreadState,
    ensureThreadLoaded,
    sendInlineMessage,
    getDraft,
    setDraft,
    typingByConversation,
    emitTyping,
    registerVisibleConversation,
    unregisterVisibleConversation,
    sendingConversationIds
  } = useMessages();

  const conversation = useMemo(
    () => conversations.find((entry) => entry.id === conversationId) || null,
    [conversations, conversationId]
  );
  const thread = getThreadState(conversationId);
  const draft = getDraft(conversationId);
  const typingName = typingByConversation[conversationId] || null;
  const sending = Boolean(sendingConversationIds[conversationId]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousCountRef = useRef(0);

  const title = getConversationDisplayName(conversation, user?.id);
  const other = getConversationAvatarParticipant(conversation, user?.id);
  const avatarUrl = resolveUserAvatarUrl(other) || String(other?.avatar || '').trim();
  const isOnline = Boolean(other?.isOnline ?? other?.is_online);

  useEffect(() => {
    void ensureThreadLoaded(conversationId);
  }, [conversationId, ensureThreadLoaded]);

  useEffect(() => {
    if (minimized) {
      unregisterVisibleConversation(conversationId);
      return;
    }
    registerVisibleConversation(conversationId);
    return () => unregisterVisibleConversation(conversationId);
  }, [
    conversationId,
    minimized,
    registerVisibleConversation,
    unregisterVisibleConversation
  ]);

  const messages: Message[] = useMemo(() => {
    if (thread.messages.length > 0) return thread.messages;
    if (conversation && Array.isArray(conversation.messages)) return conversation.messages;
    return [];
  }, [thread.messages, conversation]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || minimized) return;
    if (messages.length > previousCountRef.current) {
      if (stickToBottom) {
        el.scrollTop = el.scrollHeight;
        setHasNewBelow(false);
      } else {
        setHasNewBelow(true);
      }
    }
    previousCountRef.current = messages.length;
  }, [messages.length, stickToBottom, minimized]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distance < 48;
    setStickToBottom(nearBottom);
    if (nearBottom) setHasNewBelow(false);
  };

  if (minimized) {
    return (
      <div
        className="pointer-events-auto w-[280px] overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-xl"
        style={style}
      >
        <button
          type="button"
          onClick={onRestore}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/40"
          aria-label={`Restore conversation with ${title}`}
        >
          <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-slate-100">
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : null}
            {isOnline ? (
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-white bg-emerald-500" />
            ) : null}
          </div>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{title}</span>
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }
            }}
            className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            aria-label="Close conversation"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-auto flex h-[480px] w-[360px] max-h-[min(560px,70vh)] flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-2xl"
      style={style}
      role="dialog"
      aria-label={`Conversation with ${title}`}
    >
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">
              {title.charAt(0).toUpperCase() || '?'}
            </div>
          )}
          {isOnline ? (
            <span
              className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500"
              title="Online"
              aria-label="Online"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
          <div className="truncate text-[11px] text-slate-500">
            {typingName
              ? `${typingName} is typing…`
              : isOnline
                ? 'Online'
                : 'Messaging'}
          </div>
        </div>
        <Link
          to={`/messages/${encodeURIComponent(conversationId)}`}
          className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          aria-label="Open full conversation"
          title="Open full conversation"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={onMinimize}
          className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          aria-label="Minimize conversation"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          aria-label="Close conversation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full space-y-2 overflow-y-auto bg-white px-3 py-3"
        >
          {thread.loading && messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading messages…
            </div>
          ) : null}
          {thread.error && messages.length === 0 ? (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              {thread.error}
              <button
                type="button"
                className="ml-2 font-semibold underline"
                onClick={() => void ensureThreadLoaded(conversationId, { force: true })}
              >
                Retry
              </button>
            </div>
          ) : null}
          {messages.map((message) => {
            const mine =
              String(message.senderId || message.sender_id || '') === String(user?.id || '');
            const failed = Boolean((message.metadata as any)?.sendFailed);
            return (
              <div
                key={message.id}
                className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={[
                    'max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                    mine
                      ? failed
                        ? 'bg-red-50 text-red-800 ring-1 ring-red-200'
                        : 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-800'
                  ].join(' ')}
                >
                  <div className="whitespace-pre-wrap break-words">
                    {getMessagePreviewText(message) || message.text}
                  </div>
                  <div
                    className={[
                      'mt-1 text-[10px]',
                      mine ? (failed ? 'text-red-500' : 'text-blue-100') : 'text-slate-400'
                    ].join(' ')}
                  >
                    {formatRelativeMessageTime(message.timestamp)}
                    {failed ? ' · Failed' : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {hasNewBelow ? (
          <button
            type="button"
            onClick={() => {
              const el = scrollRef.current;
              if (el) el.scrollTop = el.scrollHeight;
              setStickToBottom(true);
              setHasNewBelow(false);
            }}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-lg"
          >
            New messages
          </button>
        ) : null}
      </div>

      {sendError ? (
        <div className="border-t border-red-100 bg-red-50 px-3 py-1.5 text-[11px] text-red-700">
          {sendError}
        </div>
      ) : null}

      <InlineMessageComposer
        conversationId={conversationId}
        value={draft}
        onChange={(value) => setDraft(conversationId, value)}
        sending={sending}
        onTyping={(isTyping) => emitTyping(conversationId, isTyping)}
        onSend={async () => {
          setSendError(null);
          try {
            await sendInlineMessage(conversationId, draft);
          } catch (error) {
            setSendError(getRecoverableActionMessage('Message send', error));
          }
        }}
      />
    </div>
  );
};

export default MessagingChatWindow;
