import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronUp, MessageSquare, RefreshCw } from 'lucide-react';
import { useMessages } from '../../context/MessageContext';
import { useUser } from '../../context/UserContext';
import { resolveUserAvatarUrl } from '../../utils/userAvatar';
import {
  formatMessagingBadgeCount,
  isDesktopMessagingViewport,
  MESSAGING_DOCK_COLLAPSED_HEIGHT_PX,
  MESSAGING_DOCK_COLLAPSED_MAX_WIDTH_PX,
  MESSAGING_DOCK_COMPACT_HEIGHT_PX,
  MESSAGING_DOCK_COMPACT_WIDTH_PX,
  MESSAGING_DOCK_EDGE_OFFSET_PX,
  MESSAGING_DOCK_ICON_SIZE_PX,
  MESSAGING_PREVIEW_LIMIT,
  resolveMessagingDockPlacement,
  shouldShowMessagingDock,
  type MessagingDockPlacement,
  type MessagingInboxTab
} from '../../services/messagingSurfaces';
import MessagingTabs from './MessagingTabs';
import MessagingSearch from './MessagingSearch';
import MessagingConversationList from './MessagingConversationList';
import MessagingChatWindow from './MessagingChatWindow';
import { useBlockingOverlaySnapshot } from './useBlockingOverlayActive';

/**
 * Desktop messaging dock with adaptive placement (Phase 6.2.1).
 *
 * Body-portal stacking can place the dock above #root modals. While a blocking
 * dialog is open we collapse expanded chrome and reposition the compact bar
 * outside the modal geometry; hide only when no safe slot exists.
 */
const DesktopMessagingDock: React.FC = () => {
  const location = useLocation();
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

  // Defense-in-depth: never portal UI on dedicated /messages workspace routes.
  // App.tsx also skips mount; this covers any alternate mount sites.
  const dockAllowedOnRoute = shouldShowMessagingDock(location.pathname);

  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? isDesktopMessagingViewport(window.innerWidth) : false
  );
  const [activeTab, setActiveTab] = useState<MessagingInboxTab>('all');
  const [placement, setPlacement] = useState<MessagingDockPlacement>(() =>
    resolveMessagingDockPlacement({
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1280,
      viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 800,
      modal: null
    })
  );
  const panelId = useId();
  const overlay = useBlockingOverlaySnapshot();
  const restoreDockExpandedRef = useRef(false);
  const restoreExpandedWindowsRef = useRef<string[]>([]);
  const wasBlockingRef = useRef(false);

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

  // Collapse expanded dock + minimize open chat chrome while blocking; restore once.
  useEffect(() => {
    if (overlay.active && !wasBlockingRef.current) {
      restoreDockExpandedRef.current = dockExpanded;
      restoreExpandedWindowsRef.current = openChatWindows
        .filter((entry) => !entry.minimized)
        .map((entry) => entry.conversationId);
      if (dockExpanded) setDockExpanded(false);
      restoreExpandedWindowsRef.current.forEach((id) => minimizeConversationWindow(id));
    } else if (!overlay.active && wasBlockingRef.current) {
      if (restoreDockExpandedRef.current) {
        setDockExpanded(true);
      }
      restoreDockExpandedRef.current = false;
      const toRestore = restoreExpandedWindowsRef.current;
      restoreExpandedWindowsRef.current = [];
      // Only restore windows still present (user-closed stay closed).
      const openIds = new Set(openChatWindows.map((entry) => entry.conversationId));
      toRestore.forEach((id) => {
        if (openIds.has(id)) restoreConversationWindow(id);
      });
    }
    wasBlockingRef.current = overlay.active;
  }, [
    overlay.active,
    dockExpanded,
    setDockExpanded,
    openChatWindows,
    minimizeConversationWindow,
    restoreConversationWindow
  ]);

  // Adaptive placement from viewport + topmost modal geometry.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let raf = 0;
    const compute = () => {
      raf = 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // If modal is active but not yet measurable, treat as full-viewport to avoid covering it.
      const modal =
        overlay.active
          ? overlay.rect || {
              top: 0,
              left: 0,
              right: vw,
              bottom: vh,
              width: vw,
              height: vh
            }
          : null;
      const next = resolveMessagingDockPlacement({
        viewportWidth: vw,
        viewportHeight: vh,
        modal
      });
      setPlacement((prev) => {
        if (
          prev.mode === next.mode &&
          prev.bottom === next.bottom &&
          prev.right === next.right &&
          prev.width === next.width &&
          prev.height === next.height
        ) {
          return prev;
        }
        return next;
      });
    };
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(compute);
    };
    schedule();
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
    };
  }, [overlay.active, overlay.rect]);

  const conversations = useMemo(
    () => getPreviewConversations(activeTab, MESSAGING_PREVIEW_LIMIT),
    [getPreviewConversations, activeTab]
  );

  const avatarUrl = resolveUserAvatarUrl(user);
  const badge = formatMessagingBadgeCount(unreadCount);

  useEffect(() => {
    if (!isDesktop || !dockExpanded || overlay.active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
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
    overlay.active,
    openChatWindows,
    closeConversationWindow,
    setDockExpanded
  ]);

  // Collapse chrome when leaving dock-eligible routes so re-entry is clean.
  useEffect(() => {
    if (dockAllowedOnRoute) return;
    if (dockExpanded) setDockExpanded(false);
    openChatWindows
      .filter((entry) => !entry.minimized)
      .forEach((entry) => minimizeConversationWindow(entry.conversationId));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to route permission flips
  }, [dockAllowedOnRoute]);

  if (!isAuthenticated || !user || !isDesktop) return null;
  if (typeof document === 'undefined') return null;
  if (!dockAllowedOnRoute) return null;

  // E: last resort — no safe geometry; keep MessageContext alive, leave a11y tree.
  if (placement.mode === 'hidden' && overlay.active) {
    return null;
  }

  const openWindows = openChatWindows;
  // Suppress chat-window chrome while a blocking modal is open (drafts stay in context).
  const showChatWindows = !overlay.active;
  const expandedWindows = showChatWindows
    ? openWindows.filter((entry) => !entry.minimized)
    : [];
  const minimizedWindows = showChatWindows
    ? openWindows.filter((entry) => entry.minimized)
    : [];

  const edge = MESSAGING_DOCK_EDGE_OFFSET_PX;
  const isIconOnly = placement.mode === 'icon-only' || (overlay.active && placement.mode !== 'normal' && placement.width <= MESSAGING_DOCK_ICON_SIZE_PX + 1);
  const collapsedWidth =
    placement.mode === 'icon-only'
      ? MESSAGING_DOCK_ICON_SIZE_PX
      : placement.mode === 'compact'
        ? MESSAGING_DOCK_COMPACT_WIDTH_PX
        : placement.width || MESSAGING_DOCK_COLLAPSED_MAX_WIDTH_PX;
  const collapsedHeight =
    placement.mode === 'icon-only'
      ? MESSAGING_DOCK_ICON_SIZE_PX
      : placement.mode === 'compact'
        ? MESSAGING_DOCK_COMPACT_HEIGHT_PX
        : placement.height || MESSAGING_DOCK_COLLAPSED_HEIGHT_PX;

  const content = (
    <div
      className="pointer-events-none fixed z-[35] flex items-end gap-2"
      style={{
        bottom: placement.bottom,
        right: placement.right
      }}
      data-testid="scrolith-desktop-messaging-dock"
      data-dock-mode={placement.mode}
      data-dock-blocking={overlay.active ? 'true' : 'false'}
    >
      {showChatWindows ? (
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
      ) : null}

      <div
        className="pointer-events-auto"
        style={{
          width: dockExpanded
            ? `min(360px, calc(100vw - ${edge * 2}px))`
            : collapsedWidth
        }}
        data-testid="scrolith-messaging-dock-shell"
        data-dock-expanded={dockExpanded ? 'true' : 'false'}
      >
        {!dockExpanded ? (
          <button
            type="button"
            onClick={() => setDockExpanded(true)}
            className={[
              'flex w-full items-center border border-slate-200 bg-slate-900 text-left text-white shadow-xl',
              'hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50',
              isIconOnly
                ? 'justify-center rounded-xl px-0'
                : 'gap-2 rounded-t-lg px-2.5'
            ].join(' ')}
            style={{ minHeight: collapsedHeight, height: collapsedHeight }}
            data-testid="scrolith-messaging-dock-collapsed"
            data-dock-visual-mode={isIconOnly ? 'icon-only' : placement.mode}
            title={
              unreadCount > 0 ? `Messaging, ${unreadCount} unread` : 'Messaging'
            }
            aria-expanded={false}
            aria-controls={panelId}
            aria-label={
              unreadCount > 0 ? `Messaging, ${unreadCount} unread` : 'Messaging'
            }
          >
            <div className={`relative shrink-0 ${isIconOnly ? 'h-8 w-8' : 'h-7 w-7'}`}>
              <div
                className={`overflow-hidden rounded-full border border-white/20 bg-slate-700 ${
                  isIconOnly ? 'h-8 w-8' : 'h-7 w-7'
                }`}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <MessageSquare className={isIconOnly ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
                  </div>
                )}
              </div>
              <span
                className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-slate-900 bg-emerald-400"
                title="Online"
                aria-hidden="true"
              />
              {isIconOnly ? (
                <span
                  className={[
                    'absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] max-w-[1.5rem] items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none',
                    badge ? 'bg-blue-500 text-white' : 'opacity-0'
                  ].join(' ')}
                  aria-hidden="true"
                  data-testid="scrolith-messaging-dock-badge"
                >
                  {badge || '0'}
                </span>
              ) : null}
            </div>
            {!isIconOnly ? (
              <>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-none">
                  Messaging
                </span>
                <span
                  className={[
                    'inline-flex h-5 min-w-[1.35rem] max-w-[2rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none',
                    badge ? 'bg-blue-500 text-white' : 'opacity-0'
                  ].join(' ')}
                  aria-hidden="true"
                  data-testid="scrolith-messaging-dock-badge"
                >
                  {badge || '0'}
                </span>
                <ChevronUp className="h-4 w-4 shrink-0 opacity-80" aria-hidden="true" />
              </>
            ) : null}
          </button>
        ) : (
          <div
            id={panelId}
            className="flex h-[min(560px,calc(100vh-5.5rem))] max-h-[600px] flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-label="Messaging dock"
            data-testid="scrolith-messaging-dock-expanded"
          >
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-900 px-2.5 py-2 text-white">
              <div className="relative h-7 w-7 shrink-0">
                <div className="h-7 w-7 overflow-hidden rounded-full border border-white/20 bg-slate-700">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <span
                  className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-slate-900 bg-emerald-400"
                  title="Online"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">Messaging</div>
                <div className="truncate text-[10px] text-slate-300">
                  {unreadCount > 0 ? `${badge || unreadCount} unread` : 'Inbox'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void refreshMessages({ force: true })}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
                aria-label="Refresh conversations"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setDockExpanded(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
                aria-expanded={true}
                aria-controls={panelId}
                aria-label="Collapse messaging"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 border-b border-slate-100 px-2.5 py-2">
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

            <div className="border-t border-slate-100 px-2.5 py-2">
              <Link
                to="/messages"
                className="flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
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
