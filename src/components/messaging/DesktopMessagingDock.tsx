import React, { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, MessageSquare, RefreshCw } from 'lucide-react';
import { useMessages } from '../../context/MessageContext';
import { useUser } from '../../context/UserContext';
import { resolveUserAvatarUrl } from '../../utils/userAvatar';
import {
  formatMessagingBadgeCount,
  isDesktopMessagingViewport,
  MESSAGING_PREVIEW_LIMIT,
  type MessagingInboxTab
} from '../../services/messagingSurfaces';
import MessagingTabs from './MessagingTabs';
import MessagingSearch from './MessagingSearch';
import MessagingConversationList from './MessagingConversationList';
import MessagingChatWindow from './MessagingChatWindow';

const DesktopMessagingDock: React.FC = () => {
  const { user, isAuthenticated } = useUser();
  const {
    unreadCount,
    loading,
    error,
    refreshMessages,
    dockExpanded,
    setDockExpanded,
    openChatWindows,
    openConversationInDock,
    closeConversationWindow,
    minimizeConversationWindow,
    restoreConversationWindow,
    getPreviewConversations,
    searchQuery,
    setSearchQuery,
    searchLoading,
    searchError
  } = useMessages();

  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? isDesktopMessagingViewport(window.innerWidth) : false
  );
  const [activeTab, setActiveTab] = useState<MessagingInboxTab>('all');
  const panelId = useId();

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  const conversations = useMemo(
    () => getPreviewConversations(activeTab, MESSAGING_PREVIEW_LIMIT),
    [getPreviewConversations, activeTab]
  );

  const avatarUrl = resolveUserAvatarUrl(user);
  const badge = formatMessagingBadgeCount(unreadCount);

  useEffect(() => {
    if (!isDesktop || !dockExpanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Close topmost expanded chat first, else collapse dock
      const topOpen = [...openChatWindows].reverse().find((entry) => !entry.minimized);
      if (topOpen) {
        event.preventDefault();
        closeConversationWindow(topOpen.conversationId);
        return;
      }
      if (dockExpanded) {
        event.preventDefault();
        setDockExpanded(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    isDesktop,
    dockExpanded,
    openChatWindows,
    closeConversationWindow,
    setDockExpanded
  ]);

  if (!isAuthenticated || !user || !isDesktop) return null;
  if (typeof document === 'undefined') return null;

  const openWindows = openChatWindows;
  const expandedWindows = openWindows.filter((entry) => !entry.minimized);
  const minimizedWindows = openWindows.filter((entry) => entry.minimized);

  const content = (
    <div className="pointer-events-none fixed bottom-0 right-0 z-[60] flex items-end gap-2 p-3 sm:p-4">
      {/* Inline chat windows stack to the left of the dock */}
      <div className="pointer-events-none flex items-end gap-2">
        {expandedWindows.map((entry, index) => (
          <MessagingChatWindow
            key={entry.conversationId}
            conversationId={entry.conversationId}
            minimized={false}
            onClose={() => closeConversationWindow(entry.conversationId)}
            onMinimize={() => minimizeConversationWindow(entry.conversationId)}
            onRestore={() => restoreConversationWindow(entry.conversationId)}
            style={{ zIndex: 10 + index }}
          />
        ))}
        {minimizedWindows.map((entry, index) => (
          <MessagingChatWindow
            key={`min-${entry.conversationId}`}
            conversationId={entry.conversationId}
            minimized
            onClose={() => closeConversationWindow(entry.conversationId)}
            onMinimize={() => minimizeConversationWindow(entry.conversationId)}
            onRestore={() => restoreConversationWindow(entry.conversationId)}
            style={{ zIndex: 5 + index }}
          />
        ))}
      </div>

      <div className="pointer-events-auto w-[min(400px,calc(100vw-1.5rem))]">
        {!dockExpanded ? (
          <button
            type="button"
            onClick={() => setDockExpanded(true)}
            className={[
              'flex w-full items-center gap-3 rounded-t-xl border border-slate-200 bg-slate-900 px-3 py-2.5 text-left text-white shadow-2xl',
              'hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50'
            ].join(' ')}
            aria-expanded={false}
            aria-controls={panelId}
            aria-label={
              unreadCount > 0 ? `Messaging, ${unreadCount} unread` : 'Messaging'
            }
          >
            <div className="relative h-8 w-8 shrink-0">
              <div className="h-8 w-8 overflow-hidden rounded-full border border-white/20 bg-slate-700">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                )}
              </div>
              <span
                className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-emerald-400"
                title="Online"
                aria-label="Online"
              />
            </div>
            <span className="min-w-0 flex-1 text-sm font-semibold">Messaging</span>
            {unreadCount > 0 ? (
              <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[11px] font-bold">
                {badge}
              </span>
            ) : null}
            <ChevronUp className="h-4 w-4 opacity-80" aria-hidden="true" />
          </button>
        ) : (
          <div
            id={panelId}
            className="flex h-[min(640px,calc(100vh-6rem))] max-h-[680px] flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-label="Messaging dock"
          >
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-900 px-3 py-2.5 text-white">
              <div className="relative h-8 w-8 shrink-0">
                <div className="h-8 w-8 overflow-hidden rounded-full border border-white/20 bg-slate-700">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <span
                  className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-emerald-400"
                  title="Online"
                  aria-label="Online"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Messaging</div>
                <div className="text-[11px] text-slate-300">
                  {unreadCount > 0 ? `${badge || unreadCount} unread` : 'Inbox'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void refreshMessages({ force: true })}
                className="rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
                aria-label="Refresh conversations"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setDockExpanded(false)}
                className="rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
                aria-expanded={true}
                aria-controls={panelId}
                aria-label="Collapse messaging"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
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
                currentUserId={user.id}
                loading={loading}
                error={searchError || error}
                activeTab={activeTab}
                dense
                onRetry={() => void refreshMessages({ force: true })}
                onSelect={(conversationId) => openConversationInDock(conversationId)}
              />
            </div>

            <div className="border-t border-slate-100 px-3 py-2">
              <Link
                to="/messages"
                className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                View all Messages
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default DesktopMessagingDock;
