import React, { useMemo } from 'react';
import type { Conversation } from '../../types';
import { resolveUserAvatarUrl } from '../../utils/userAvatar';
import {
  formatRelativeMessageTime,
  getConversationAvatarParticipant,
  getConversationCategory,
  getConversationDisplayName,
  getConversationUnreadCount
} from '../../services/messagingSurfaces';
import { Paperclip, Pin, VolumeX } from 'lucide-react';

type MessagingConversationRowProps = {
  conversation: Conversation;
  currentUserId?: string | null;
  onSelect: (conversationId: string) => void;
  dense?: boolean;
};

const MessagingConversationRow: React.FC<MessagingConversationRowProps> = ({
  conversation,
  currentUserId,
  onSelect,
  dense = false
}) => {
  const name = useMemo(
    () => getConversationDisplayName(conversation, currentUserId),
    [conversation, currentUserId]
  );
  const other = useMemo(
    () => getConversationAvatarParticipant(conversation, currentUserId),
    [conversation, currentUserId]
  );
  const avatarUrl = resolveUserAvatarUrl(other) || String(other?.avatar || '').trim();
  const unread = getConversationUnreadCount(conversation);
  const preview = String(
    conversation.lastMessage || conversation.last_message || 'No messages yet'
  ).trim();
  const timestamp = formatRelativeMessageTime(
    conversation.lastMessageAt || conversation.last_message_at
  );
  const isOnline = Boolean(other?.isOnline ?? other?.is_online);
  const isMuted = Boolean(conversation.isMuted ?? conversation.is_muted);
  const isStarred = Boolean(conversation.isStarred ?? conversation.is_starred);
  const category = getConversationCategory(conversation);
  const hasAttachmentHint = /photo|video|attachment|voice/i.test(preview);

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={[
        'flex w-full items-center gap-3 border-b border-slate-100 px-3 text-left',
        'hover:bg-slate-50 focus:outline-none focus-visible:bg-blue-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/30',
        dense ? 'min-h-[64px] py-2' : 'min-h-[72px] py-2.5'
      ].join(' ')}
      aria-label={
        unread > 0
          ? `${name}, ${unread} unread. ${preview}`
          : `${name}. ${preview}`
      }
    >
      <div className="relative h-11 w-11 shrink-0">
        <div className="h-11 w-11 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-500">
              {name.charAt(0).toUpperCase() || '?'}
            </div>
          )}
        </div>
        {isOnline ? (
          <span
            className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500"
            title="Online"
            aria-label="Online"
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={[
              'min-w-0 truncate text-sm',
              unread > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'
            ].join(' ')}
          >
            {name}
          </span>
          {category === 'group' ? (
            <span className="shrink-0 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
              Group
            </span>
          ) : null}
          {category === 'community' ? (
            <span className="shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
              Community
            </span>
          ) : null}
          {isStarred ? <Pin className="h-3 w-3 shrink-0 text-amber-500" aria-label="Pinned" /> : null}
          {isMuted ? <VolumeX className="h-3 w-3 shrink-0 text-slate-400" aria-label="Muted" /> : null}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {hasAttachmentHint ? (
            <Paperclip className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
          ) : null}
          <p
            className={[
              'min-w-0 truncate text-xs',
              unread > 0 ? 'font-semibold text-slate-800' : 'text-slate-500'
            ].join(' ')}
          >
            {preview}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1 self-start pt-0.5">
        <span className="text-[10px] font-medium text-slate-400">{timestamp}</span>
        {unread > 0 ? (
          <span className="min-w-[18px] rounded-full bg-blue-600 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : (
          <span className="h-[18px]" aria-hidden="true" />
        )}
      </div>
    </button>
  );
};

export default React.memo(MessagingConversationRow);
