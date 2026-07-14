import React from 'react';
import type { Conversation } from '../../types';
import type { MessagingInboxTab } from '../../services/messagingSurfaces';
import MessagingConversationRow from './MessagingConversationRow';

type MessagingConversationListProps = {
  conversations: Conversation[];
  currentUserId?: string | null;
  loading?: boolean;
  error?: string | null;
  emptyLabel?: string;
  activeTab?: MessagingInboxTab;
  onSelect: (conversationId: string) => void;
  onRetry?: () => void;
  dense?: boolean;
};

const SkeletonRow = () => (
  <div className="flex min-h-[72px] items-center gap-3 border-b border-slate-100 px-3 py-2.5">
    <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-slate-200" />
    <div className="min-w-0 flex-1 space-y-2">
      <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
      <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
    </div>
  </div>
);

const MessagingConversationList: React.FC<MessagingConversationListProps> = ({
  conversations,
  currentUserId,
  loading = false,
  error = null,
  emptyLabel = 'No conversations yet.',
  activeTab = 'all',
  onSelect,
  onRetry,
  dense = false
}) => {
  if (loading && conversations.length === 0) {
    return (
      <div role="status" aria-live="polite" aria-label="Loading conversations">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  if (error && conversations.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-slate-600">{error}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (conversations.length === 0) {
    const emptyByTab: Record<MessagingInboxTab, string> = {
      all: emptyLabel,
      unread: 'No unread conversations.',
      groups: 'No group conversations yet.',
      communities: 'No community conversations yet.'
    };
    return (
      <div className="px-4 py-10 text-center text-sm text-slate-500">
        {emptyByTab[activeTab] || emptyLabel}
      </div>
    );
  }

  return (
    <div role="list" aria-label="Conversations">
      {error ? (
        <div className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
          {error}
          {onRetry ? (
            <button type="button" onClick={onRetry} className="ml-2 underline">
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {conversations.map((conversation) => (
        <div key={conversation.id} role="listitem">
          <MessagingConversationRow
            conversation={conversation}
            currentUserId={currentUserId}
            onSelect={onSelect}
            dense={dense}
          />
        </div>
      ))}
    </div>
  );
};

export default MessagingConversationList;
