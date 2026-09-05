import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Expand, X } from 'lucide-react';
import { useMessages } from '../../context/MessageContext';
import { useUser } from '../../context/UserContext';
import {
  formatMessagingBadgeCount,
  isDesktopMessagingViewport,
  type MessagingInboxTab,
  MESSAGING_PREVIEW_LIMIT
} from '../../services/messagingSurfaces';
import {
  buildMessagesConversationPath,
  buildMessagingSoftOpenState,
  prefetchMessagesWorkspace
} from '../../services/messagingSoftOpen';
import MessagingTabs from './MessagingTabs';
import MessagingSearch from './MessagingSearch';
import MessagingConversationList from './MessagingConversationList';

type HeaderMessagesPopoverProps = {
  open: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  id?: string;
  /**
   * Soft-open conversation without full platform remount (web mobile).
   * When provided, used instead of SPA /messages navigation on compact viewports.
   */
  onSoftOpenConversation?: (conversationId: string) => void;
};

const HeaderMessagesPopover: React.FC<HeaderMessagesPopoverProps> = ({
  open,
  onClose,
  triggerRef,
  id,
  onSoftOpenConversation
}) => {
  const navigate = useNavigate();
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
    setDockExpanded,
    ensureThreadLoaded
  } = useMessages();

  const [activeTab, setActiveTab] = useState<MessagingInboxTab>('all');
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? isDesktopMessagingViewport(window.innerWidth) : true
  );
  const [compactPopoverTop, setCompactPopoverTop] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const panelId = id || autoId;

  const conversations = useMemo(
    () => getPreviewConversations(activeTab, MESSAGING_PREVIEW_LIMIT),
    [getPreviewConversations, activeTab]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsDesktop(isDesktopMessagingViewport(window.innerWidth));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const syncCompactPopoverPosition = useCallback(() => {
    if (isDesktop || !triggerRef?.current) return;
    const triggerBounds = triggerRef.current.getBoundingClientRect();
    setCompactPopoverTop(Math.max(8, Math.ceil(triggerBounds.bottom + 8)));
  }, [isDesktop, triggerRef]);

  useEffect(() => {
    if (!open || isDesktop) {
      setCompactPopoverTop(null);
      return;
    }

    syncCompactPopoverPosition();
    const handleViewportChange = () => syncCompactPopoverPosition();
    window.addEventListener('resize', handleViewportChange, { passive: true });
    window.addEventListener('scroll', handleViewportChange, { passive: true, capture: true });
    window.visualViewport?.addEventListener('resize', handleViewportChange, { passive: true });
    window.visualViewport?.addEventListener('scroll', handleViewportChange, { passive: true });

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
    };
  }, [open, isDesktop, syncCompactPopoverPosition]);

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
    // Soft refresh only — opening the popup must not thrash the inbox or mark read.
    void refreshMessages({ force: false });
  }, [open, refreshMessages]);

  if (!open) return null;

  const badge = formatMessagingBadgeCount(unreadCount);

  const openConversation = (conversationId: string) => {
    const idSafe = String(conversationId || '').trim();
    if (!idSafe) return;
    onClose();

    // Desktop: floating dock chat — host page stays mounted.
    if (isDesktop) {
      openConversationInDock(idSafe, { expandDock: true });
      return;
    }

    // Mobile host provided soft overlay (e.g. future shell) — prefer it.
    if (onSoftOpenConversation) {
      void ensureThreadLoaded(idSafe);
      onSoftOpenConversation(idSafe);
      return;
    }

    // Web mobile (Navbar): soft SPA navigate with prefetch — no hard reload.
    prefetchMessagesWorkspace();
    void ensureThreadLoaded(idSafe);
    navigate(buildMessagesConversationPath(idSafe), {
      state: buildMessagingSoftOpenState({ fromHeaderMessages: true })
    });
  };

  return (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label="Messages"
      aria-modal="false"
      className={[
        'scrolith-header-popover absolute right-0 z-[70] mt-2 flex w-[min(420px,calc(100vw-1.5rem))] max-h-[min(680px,calc(100vh-5rem))]',
        'flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl',
        // Compact screens use viewport-safe positioning so the panel is not constrained by the icon wrapper.
        !isDesktop ? 'scrolith-header-popover--compact left-2 right-2 w-auto max-h-[min(78vh,720px)]' : ''
      ].join(' ')}
      style={
        !isDesktop && compactPopoverTop !== null
          ? ({ '--scrolith-header-popover-top': `${compactPopoverTop}px` } as React.CSSProperties)
          : undefined
      }
      data-testid="header-messages-popover"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800">Messages</h3>
          <p className="text-[11px] text-slate-500">
            {unreadCount > 0 ? `${badge || unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isDesktop ? (
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
          ) : null}
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
          onSelect={openConversation}
        />
      </div>

      <div className="border-t border-slate-100 bg-white px-3 py-2.5">
        <Link
          to="/messages"
          state={buildMessagingSoftOpenState({ fromHeaderMessages: true })}
          onClick={() => {
            prefetchMessagesWorkspace();
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
