import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Expand, X } from 'lucide-react';
import { useMessages } from '../../context/MessageContext';
import { useUser } from '../../context/UserContext';
import {
  formatMessagingBadgeCount,
  type MessagingInboxTab,
  MESSAGING_PREVIEW_LIMIT
} from '../../services/messagingSurfaces';
import MessagingTabs from './MessagingTabs';
import MessagingSearch from './MessagingSearch';
import MessagingConversationList from './MessagingConversationList';

type HeaderMessagesPopoverProps = {
  open: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  id?: string;
};

const HeaderMessagesPopover: React.FC<HeaderMessagesPopoverProps> = ({
  open,
  onClose,
  triggerRef,
  id
}) => {
  const { user } = useUser();
  const {
    unreadCount,
    loading,
    error,
    refreshMessages,
    getPreviewConversations,
    searchQuery,
    setSearchQuery,
    searchLoading,
    searchError,
    openConversationInDock,
    setDockExpanded
  } = useMessages();

  const [activeTab, setActiveTab] = useState<MessagingInboxTab>('all');
  const panelRef = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const panelId = id || autoId;

  const conversations = useMemo(
    () => getPreviewConversations(activeTab, MESSAGING_PREVIEW_LIMIT),
    [getPreviewConversations, activeTab]
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        triggerRef?.current?.focus?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, triggerRef]);

  useEffect(() => {
    if (!open) return;
    // Opening the popup alone must not mark conversations read.
    // Prefetch is safe.
    void refreshMessages({ force: false });
  }, [open, refreshMessages]);

  if (!open) return null;

  const badge = formatMessagingBadgeCount(unreadCount);

  return (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label="Messages"
      aria-modal="false"
      className={[
        'absolute right-0 z-[70] mt-2 flex w-[min(420px,calc(100vw-1.5rem))] max-h-[min(680px,calc(100vh-5rem))]',
        'flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl'
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800">Messages</h3>
          <p className="text-[11px] text-slate-500">
            {unreadCount > 0 ? `${badge || unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setDockExpanded(true);
              onClose();
            }}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            aria-label="Open messaging dock"
            title="Open messaging dock"
          >
            <Expand className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              triggerRef?.current?.focus?.();
            }}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            aria-label="Close messages"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2.5 border-b border-slate-100 px-3 py-2.5">
        <MessagingSearch
          value={searchQuery}
          onChange={setSearchQuery}
          loading={searchLoading}
          id={`${panelId}-search`}
        />
        <MessagingTabs
          activeTab={activeTab}
          onChange={setActiveTab}
          idPrefix={`${panelId}-tab`}
        />
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-${activeTab}`}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <MessagingConversationList
          conversations={conversations}
          currentUserId={user?.id}
          loading={loading}
          error={searchError || error}
          activeTab={activeTab}
          onRetry={() => void refreshMessages({ force: true })}
          onSelect={(conversationId) => {
            openConversationInDock(conversationId, { expandDock: true });
            onClose();
          }}
        />
      </div>

      <div className="border-t border-slate-100 bg-white px-3 py-2.5">
        <Link
          to="/messages"
          onClick={() => {
            onClose();
          }}
          className="flex w-full items-center justify-center rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
        >
          View all Messages
        </Link>
      </div>
    </div>
  );
};

export default HeaderMessagesPopover;
