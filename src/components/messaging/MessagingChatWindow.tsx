import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ExternalLink,
  Minus,
  X,
  Loader2,
  CornerUpLeft,
  Copy,
  Pencil,
  Trash2,
  RefreshCw,
  MoreVertical,
  Pin,
  Palette
} from 'lucide-react';
import { MessagingService } from '../../services/messaging';
import {
  appearanceToBackgroundStyle,
  buildChatPalette,
  paletteToCssVars,
  type AppearanceInput
} from '../../services/messaging/chatTextColorEngine';
import ChatAppearancePanel from './ChatAppearancePanel';
import type { Message } from '../../types';
import { useMessages } from '../../context/MessageContext';
import { useUser } from '../../context/UserContext';
import { resolveUserAvatarUrl } from '../../utils/userAvatar';
import EnterpriseAvatar from '../common/EnterpriseAvatar';
import {
  formatRelativeMessageTime,
  getConversationAvatarParticipant,
  getConversationDisplayName,
  getMessagePreviewText
} from '../../services/messagingSurfaces';
import {
  canDeleteForMe,
  canEditOrUnsendMessage,
  getMyReaction,
  getReactionChipEntries,
  getReactionCounts,
  insertSuggestionIntoDraft,
  isFailedOutgoingMessage,
  QUICK_REACTIONS
} from '../../services/messagingComposer';
import InlineMessageComposer from './InlineMessageComposer';
import { MessageAttachmentsList } from './MessageAttachmentRenderer';
import SafeMessageText from './SafeMessageText';
import { extractMessageAttachments } from '../../services/messagingMedia';
import { getRecoverableActionMessage } from '../../mobile/runtime/requestRecovery';
import { AIService } from '../../services/ai/ai.service';

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
  const navigate = useNavigate();
  const { user } = useUser();
  const {
    conversations,
    getThreadState,
    ensureThreadLoaded,
    sendInlineMessage,
    sendInlineVoiceNote,
    retryFailedMessage,
    getDraft,
    setDraft,
    getReplyTo,
    setReplyTo,
    getPendingAttachments,
    addPendingAttachments,
    removePendingAttachment,
    typingByConversation,
    emitTyping,
    registerVisibleConversation,
    unregisterVisibleConversation,
    sendingConversationIds,
    toggleReaction,
    editMessage,
    deleteMessage,
    copyMessage,
    voiceRuntimeConfig
  } = useMessages();

  const conversation = useMemo(
    () => conversations.find((entry) => entry.id === conversationId) || null,
    [conversations, conversationId]
  );
  const thread = getThreadState(conversationId);
  const draft = getDraft(conversationId);
  const replyTo = getReplyTo(conversationId);
  const pendingAttachments = getPendingAttachments(conversationId);
  const typingRaw = typingByConversation[conversationId] || null;
  const isRecordingPeer = Boolean(typingRaw && String(typingRaw).startsWith('recording:'));
  const typingName = isRecordingPeer
    ? String(typingRaw).replace(/^recording:/, '')
    : typingRaw;
  const sending = Boolean(sendingConversationIds[conversationId]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pins, setPins] = useState<any[]>([]);
  const [appearance, setAppearance] = useState<AppearanceInput>({ kind: 'none' });
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [stickToBottom, setStickToBottom] = useState(true);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousCountRef = useRef(0);

  const title = getConversationDisplayName(conversation, user?.id);
  const other = getConversationAvatarParticipant(conversation, user?.id);
  const isGroupConversation = Boolean(
    conversation?.type === 'group' ||
      String((conversation as any)?.type || '').toUpperCase() === 'GROUP' ||
      Boolean((conversation as any)?.title && (conversation?.participants?.length || 0) > 2)
  );
  const groupAvatarFileId = String(
    (conversation as any)?.avatarFileId || (conversation as any)?.avatar_file_id || ''
  ).trim();
  const otherAny = other as any;
  const avatarUrl = isGroupConversation
    ? groupAvatarFileId
      ? resolveUserAvatarUrl(groupAvatarFileId)
      : ''
    : resolveUserAvatarUrl(otherAny) ||
      resolveUserAvatarUrl({
        avatar: otherAny?.avatar,
        avatarUrl: otherAny?.avatarUrl,
        profilePhotoFileId: otherAny?.profilePhotoFileId || otherAny?.profile_photo_file_id
      }) ||
      String(otherAny?.avatar || otherAny?.avatarUrl || '').trim();
  const isOnline = !isGroupConversation && Boolean(otherAny?.isOnline ?? otherAny?.is_online);

  useEffect(() => {
    void ensureThreadLoaded(conversationId);
  }, [conversationId, ensureThreadLoaded]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [pinList, app] = await Promise.all([
          MessagingService.listGroupPins(conversationId).catch(() => []),
          MessagingService.getChatAppearance(conversationId).catch(() => ({ kind: 'none' }))
        ]);
        if (!cancelled) {
          setPins(Array.isArray(pinList) ? pinList : []);
          setAppearance(app || { kind: 'none' });
        }
      } catch {
        if (!cancelled) {
          setPins([]);
          setAppearance({ kind: 'none' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (minimized) {
      unregisterVisibleConversation(conversationId);
      return;
    }
    registerVisibleConversation(conversationId);
    return () => unregisterVisibleConversation(conversationId);
  }, [conversationId, minimized, registerVisibleConversation, unregisterVisibleConversation]);

  const scrollToPinned = (messageId: string) => {
    const el = messageRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightMessageId(messageId);
      window.setTimeout(() => setHighlightMessageId(null), 1600);
    }
  };

  const handlePinToggle = async (messageId: string, isPinned: boolean) => {
    setActionBusyId(messageId);
    try {
      if (isPinned) {
        const data = await MessagingService.unpinGroupMessage(conversationId, messageId);
        setPins(Array.isArray(data?.pins) ? data.pins : await MessagingService.listGroupPins(conversationId));
      } else {
        const data = await MessagingService.pinGroupMessage(conversationId, messageId);
        setPins(Array.isArray(data?.pins) ? data.pins : await MessagingService.listGroupPins(conversationId));
      }
    } catch (error) {
      setSendError(getRecoverableActionMessage('Pin message', error));
    } finally {
      setActionBusyId(null);
    }
  };

  const chatSurfaceStyle = useMemo(() => {
    const vars = paletteToCssVars(buildChatPalette(appearance));
    const kind = String(appearance?.kind || 'none').toLowerCase();
    if (kind === 'none') {
      return { ...vars } as React.CSSProperties;
    }
    const bg = appearanceToBackgroundStyle(appearance);
    return { ...bg, ...vars } as React.CSSProperties;
  }, [appearance]);

  useEffect(() => {
    setExpandedMessageId(null);
    setReactionMessageId(null);
    setEditingMessageId(null);
    setEditDraft('');
    setSendError(null);
  }, [conversationId]);

  // Escape closes topmost in-window surface first (edit/reactions/actions) before dock handlers.
  useEffect(() => {
    if (minimized) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (editingMessageId) {
        event.preventDefault();
        event.stopPropagation();
        setEditingMessageId(null);
        setEditDraft('');
        return;
      }
      if (reactionMessageId) {
        event.preventDefault();
        event.stopPropagation();
        setReactionMessageId(null);
        return;
      }
      if (expandedMessageId) {
        event.preventDefault();
        event.stopPropagation();
        setExpandedMessageId(null);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [minimized, editingMessageId, reactionMessageId, expandedMessageId]);

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
          <div className="relative h-7 w-7 shrink-0">
            <EnterpriseAvatar
              user={other}
              src={avatarUrl}
              name={title}
              size="xs"
              loading="eager"
              className="!h-7 !w-7"
            />
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
      className="pointer-events-auto flex h-[520px] w-[380px] max-h-[min(620px,75vh)] flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-2xl"
      style={style}
      role="dialog"
      aria-label={`Conversation with ${title}`}
    >
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        {/* Avatar → profile; title stays in-thread (does not navigate away). */}
        {(() => {
          const otherAny = other as any;
          const isScrolitha = Boolean(
            (conversation as any)?.isScrolitha ||
              (conversation as any)?.is_scrolitha ||
              otherAny?.isScrolitha ||
              otherAny?.is_scrolitha
          );
          const username = String(otherAny?.username || '').trim();
          const profileUrl =
            !isGroupConversation && !isScrolitha
              ? username
                ? `/u/${username.replace(/^@+/, '')}`
                : otherAny?.profileUrl || otherAny?.profile_url
                  ? String(otherAny.profileUrl || otherAny.profile_url)
                  : otherAny?.id
                    ? `/profile/${otherAny.id}`
                    : null
              : null;
          const avatarNode = (
            <EnterpriseAvatar
              user={isGroupConversation ? undefined : other}
              src={avatarUrl || undefined}
              name={title}
              size="sm"
              loading="eager"
              className={`border border-slate-200 ${
                isGroupConversation && !groupAvatarFileId ? 'bg-indigo-50 text-indigo-700' : ''
              }`}
            />
          );
          return profileUrl ? (
            <button
              type="button"
              onClick={() => navigate(profileUrl)}
              className="relative h-8 w-8 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              aria-label={`View ${title} profile`}
              title="View profile"
            >
              {avatarNode}
              {isOnline ? (
                <span
                  className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500"
                  title="Online"
                  aria-label="Online"
                />
              ) : null}
            </button>
          ) : (
            <div className="relative h-8 w-8 shrink-0">
              {avatarNode}
              {isOnline ? (
                <span
                  className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500"
                  title="Online"
                  aria-label="Online"
                />
              ) : null}
            </div>
          );
        })()}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
          <div className="truncate text-[11px] text-slate-500">
            {typingName
              ? isRecordingPeer
                ? `${typingName} is recording…`
                : `${typingName} is typing…`
              : isOnline
                ? 'Online'
                : 'Messaging'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAppearanceOpen(true)}
          className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          aria-label="Chat appearance"
          title="Chat appearance"
          data-testid="chat-appearance-open"
        >
          <Palette className="h-4 w-4" />
        </button>
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
          className="h-full space-y-2 overflow-y-auto px-3 py-3"
          style={chatSurfaceStyle}
          data-testid="chat-thread-surface"
        >
          {pins.length > 0 ? (
            <button
              type="button"
              data-testid="dock-pins-banner"
              className="sticky top-0 z-10 mb-2 w-full rounded-xl border px-3 py-2 text-left text-xs shadow-sm"
              style={{
                background: 'var(--chat-pin-bg)',
                color: 'var(--chat-pin-text)',
                borderColor: 'rgba(0,0,0,0.08)'
              }}
              onClick={() => {
                const mid = String(pins[0]?.messageId || pins[0]?.message?.id || '');
                if (mid) scrollToPinned(mid);
              }}
            >
              <div className="font-semibold">
                📌 {pins.length} pinned message{pins.length === 1 ? '' : 's'}
              </div>
              <div className="mt-0.5 truncate opacity-90">
                {String(pins[0]?.message?.text || pins[0]?.messageId || '').slice(0, 120)}
              </div>
            </button>
          ) : null}
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
            const failed = isFailedOutgoingMessage(message);
            const deleted = Boolean(message.isDeleted ?? message.is_deleted);
            const canMutate = canEditOrUnsendMessage(message, user?.id, user?.role);
            const expanded = expandedMessageId === message.id;
            const showReactions = reactionMessageId === message.id && !deleted;
            const editing = editingMessageId === message.id;
            const myReaction = getMyReaction(message, user?.id);
            const reactionCounts = getReactionCounts(message);
            const reactionChips = deleted ? [] : getReactionChipEntries(message);
            const mediaAttachments = deleted ? [] : extractMessageAttachments(message);

            const isPinnedMsg = pins.some(
              (p) => String(p.messageId || p.message?.id || '') === String(message.id)
            );
            return (
              <div
                key={message.id}
                ref={(node) => {
                  messageRefs.current[message.id] = node;
                }}
                className={`flex ${mine ? 'justify-end' : 'justify-start'} ${
                  highlightMessageId === message.id ? 'animate-pulse ring-2 ring-amber-400 ring-offset-2' : ''
                }`}
                data-message-id={message.id}
              >
                <div className="max-w-[86%]">
                  <div
                    className={[
                      'relative rounded-2xl px-3 py-2 text-sm shadow-sm',
                      mine
                        ? failed
                          ? 'bg-red-50 text-red-800 ring-1 ring-red-200'
                          : ''
                        : ''
                    ].join(' ')}
                    style={
                      mine && !failed
                        ? {
                            background: 'var(--chat-bubble-out)',
                            color: 'var(--chat-bubble-out-text)'
                          }
                        : !mine
                          ? {
                              background: 'var(--chat-bubble-in)',
                              color: 'var(--chat-bubble-in-text)'
                            }
                          : undefined
                    }
                    onClick={() => {
                      if (editing) return;
                      setExpandedMessageId((prev) => (prev === message.id ? null : message.id));
                      if (!deleted) {
                        setReactionMessageId((prev) => (prev === message.id ? null : message.id));
                      }
                    }}
                  >
                    {editing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editDraft}
                          onChange={(event) => setEditDraft(event.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                          rows={3}
                          aria-label="Edit message"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditingMessageId(null);
                              setEditDraft('');
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="rounded-md bg-blue-700 px-2 py-1 text-[11px] text-white disabled:opacity-50"
                            disabled={actionBusyId === message.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActionBusyId(message.id);
                              void editMessage(conversationId, message.id, editDraft)
                                .then(() => {
                                  setEditingMessageId(null);
                                  setEditDraft('');
                                })
                                .catch((error) => {
                                  setSendError(getRecoverableActionMessage('Edit message', error));
                                })
                                .finally(() => setActionBusyId(null));
                            }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {(!deleted && String(message.text || '').trim()) || deleted ? (
                          <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                            {deleted ? (
                              '[Message deleted]'
                            ) : (
                              <SafeMessageText
                                text={getMessagePreviewText(message) || message.text}
                                outgoing={mine && !failed}
                                navigate={navigate}
                                mentionClassName={
                                  mine && !failed
                                    ? 'font-semibold text-blue-100 underline decoration-blue-200/80'
                                    : 'font-semibold text-indigo-600'
                                }
                              />
                            )}
                          </div>
                        ) : null}
                        {!deleted && mediaAttachments.length > 0 ? (
                          <MessageAttachmentsList
                            attachments={mediaAttachments}
                            outgoing={mine && !failed}
                          />
                        ) : null}
                      </>
                    )}
                    <div
                      className={[
                        'mt-1 flex items-center justify-end gap-1 text-[10px]',
                        mine ? (failed ? 'text-red-500' : 'text-blue-100') : 'text-slate-400'
                      ].join(' ')}
                    >
                      <span>{formatRelativeMessageTime(message.timestamp)}</span>
                      {!deleted && (message.editedAt || message.edited_at) ? (
                        <span>(edited)</span>
                      ) : null}
                      {failed ? <span>· Failed</span> : null}
                    </div>

                    {showReactions ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            disabled={actionBusyId === message.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActionBusyId(message.id);
                              void toggleReaction(conversationId, message.id, emoji)
                                .catch((error) => {
                                  setSendError(getRecoverableActionMessage('Reaction', error));
                                })
                                .finally(() => setActionBusyId(null));
                            }}
                            className={[
                              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                              myReaction === emoji
                                ? 'border-blue-200 bg-blue-50 text-blue-700'
                                : 'border-slate-200 bg-white text-slate-700'
                            ].join(' ')}
                            aria-label={`React with ${emoji}`}
                            aria-pressed={myReaction === emoji}
                          >
                            <span>{emoji}</span>
                            {reactionCounts[emoji] ? (
                              <span className="font-semibold">{reactionCounts[emoji]}</span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* Always-visible reaction labels for sender + receiver */}
                  {reactionChips.length > 0 ? (
                    <div
                      className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : 'justify-start'}`}
                      aria-label="Message reactions"
                    >
                      {reactionChips.map(({ emoji, count }) => (
                        <button
                          key={`${message.id}-chip-${emoji}`}
                          type="button"
                          disabled={actionBusyId === message.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            setActionBusyId(message.id);
                            void toggleReaction(conversationId, message.id, emoji)
                              .catch((error) => {
                                setSendError(getRecoverableActionMessage('Reaction', error));
                              })
                              .finally(() => setActionBusyId(null));
                          }}
                          className={[
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] shadow-sm',
                            myReaction === emoji
                              ? 'border-blue-300 bg-blue-50 font-semibold text-blue-700'
                              : 'border-slate-200 bg-white text-slate-700'
                          ].join(' ')}
                          aria-label={`${emoji} ${count}${myReaction === emoji ? ', your reaction' : ''}`}
                          title={myReaction === emoji ? 'Remove your reaction' : 'React'}
                        >
                          <span>{emoji}</span>
                          {count > 1 ? <span className="font-semibold">{count}</span> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className={`mt-1 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedMessageId((prev) => (prev === message.id ? null : message.id))
                      }
                      className="inline-flex h-7 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-600 shadow-sm"
                      aria-label="Message actions"
                      aria-expanded={expanded}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                      Actions
                    </button>
                  </div>

                  {expanded ? (
                    <div
                      className={`mt-1 flex max-w-full flex-wrap gap-1 ${
                        mine ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {!deleted ? (
                        <button
                          type="button"
                          className="inline-flex h-7 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 text-[10px] text-slate-600"
                          onClick={() => setReplyTo(conversationId, message)}
                          aria-label="Reply to message"
                        >
                          <CornerUpLeft className="h-3 w-3" />
                          Reply
                        </button>
                      ) : null}
                      {!deleted ? (
                        <button
                          type="button"
                          className="inline-flex h-7 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 text-[10px] text-slate-600"
                          disabled={actionBusyId === message.id}
                          data-testid="message-pin-action"
                          onClick={() => void handlePinToggle(message.id, isPinnedMsg)}
                          aria-label={isPinnedMsg ? 'Unpin message' : 'Pin message'}
                        >
                          <Pin className="h-3 w-3" />
                          {isPinnedMsg ? 'Unpin' : 'Pin'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex h-7 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 text-[10px] text-slate-600"
                        disabled={actionBusyId === message.id}
                        onClick={() => {
                          setActionBusyId(message.id);
                          void copyMessage(conversationId, message)
                            .catch((error) => {
                              setSendError(getRecoverableActionMessage('Copy message', error));
                            })
                            .finally(() => setActionBusyId(null));
                        }}
                        aria-label="Copy message"
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </button>
                      {canMutate ? (
                        <button
                          type="button"
                          className="inline-flex h-7 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 text-[10px] text-slate-600"
                          disabled={deleted || actionBusyId === message.id}
                          onClick={() => {
                            setEditingMessageId(message.id);
                            setEditDraft(String(message.text || ''));
                          }}
                          aria-label="Edit message"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      ) : null}
                      {canDeleteForMe(message) ? (
                        <button
                          type="button"
                          className="inline-flex h-7 items-center gap-1 rounded-full border border-red-200 bg-white px-2 text-[10px] text-red-600"
                          disabled={actionBusyId === message.id}
                          onClick={() => {
                            if (!window.confirm('Delete this message for you only?')) return;
                            setActionBusyId(message.id);
                            void deleteMessage(conversationId, message.id, 'me')
                              .catch((error) => {
                                setSendError(getRecoverableActionMessage('Delete message', error));
                              })
                              .finally(() => setActionBusyId(null));
                          }}
                          aria-label="Delete for me"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete for me
                        </button>
                      ) : null}
                      {canMutate ? (
                        <button
                          type="button"
                          className="inline-flex h-7 items-center gap-1 rounded-full border border-red-300 bg-white px-2 text-[10px] text-red-700"
                          disabled={deleted || actionBusyId === message.id}
                          onClick={() => {
                            if (!window.confirm('Unsend this message for everyone?')) return;
                            setActionBusyId(message.id);
                            void deleteMessage(conversationId, message.id, 'everyone')
                              .catch((error) => {
                                setSendError(getRecoverableActionMessage('Unsend message', error));
                              })
                              .finally(() => setActionBusyId(null));
                          }}
                          aria-label="Unsend for everyone"
                        >
                          <Trash2 className="h-3 w-3" />
                          Unsend
                        </button>
                      ) : null}
                      {failed ? (
                        <button
                          type="button"
                          className="inline-flex h-7 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 text-[10px] text-amber-800"
                          disabled={actionBusyId === message.id || sending}
                          onClick={() => {
                            setActionBusyId(message.id);
                            void retryFailedMessage(conversationId, message.id)
                              .catch((error) => {
                                setSendError(getRecoverableActionMessage('Retry send', error));
                              })
                              .finally(() => setActionBusyId(null));
                          }}
                          aria-label="Retry failed message"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Retry
                        </button>
                      ) : null}
                    </div>
                  ) : null}
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
        pendingAttachments={pendingAttachments}
        onAttachmentsUploaded={(files) => addPendingAttachments(conversationId, files as any)}
        onRemoveAttachment={(attachmentId) => removePendingAttachment(conversationId, attachmentId)}
        replyPreview={
          replyTo
            ? {
                label:
                  String(replyTo.senderId || replyTo.sender_id || '') === String(user?.id || '')
                    ? 'Replying to yourself'
                    : `Replying to ${title}`,
                text: getMessagePreviewText(replyTo) || replyTo.text || 'Attachment'
              }
            : null
        }
        onCancelReply={() => setReplyTo(conversationId, null)}
        voiceDisabled={
          !voiceRuntimeConfig.enabledVoiceNotes || voiceRuntimeConfig.blockedForCurrentUser
        }
        maxVoiceSeconds={voiceRuntimeConfig.maxVoiceNoteDurationSeconds}
        suggestLoading={suggestLoading}
        onTyping={(isTyping) => emitTyping(conversationId, isTyping)}
        onVoiceRecorded={async (blob, durationMs) => {
          setSendError(null);
          try {
            await sendInlineVoiceNote(conversationId, { blob, durationMs });
          } catch (error) {
            setSendError(getRecoverableActionMessage('Voice note send', error));
          }
        }}
        onSuggestReply={async () => {
          if (!user) return;
          setSuggestLoading(true);
          setSendError(null);
          try {
            const history = messages.slice(-5).map((entry) => ({
              sender:
                String(entry.senderId || entry.sender_id || '') === String(user.id)
                  ? 'Me'
                  : 'Other',
              text: String(entry.text || '')
            }));
            const response = await AIService.suggestReply({
              history,
              userRole: user.role
            });
            if (response?.suggestion) {
              // Explicit selection path: replace current draft with suggestion only on user click.
              setDraft(
                conversationId,
                insertSuggestionIntoDraft(draft, response.suggestion, 'replace')
              );
            }
          } catch (error) {
            setSendError(getRecoverableActionMessage('Suggest reply', error));
          } finally {
            setSuggestLoading(false);
          }
        }}
        onSend={async () => {
          setSendError(null);
          try {
            await sendInlineMessage(conversationId, draft, {
              replyToMessageId: replyTo?.id || null
            });
          } catch (error) {
            setSendError(getRecoverableActionMessage('Message send', error));
          }
        }}
      />

      <ChatAppearancePanel
        conversationId={conversationId}
        open={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
        onSaved={(next) => {
          setAppearance(next || { kind: 'none' });
          setAppearanceOpen(false);
        }}
      />
    </div>
  );
};

export default MessagingChatWindow;
