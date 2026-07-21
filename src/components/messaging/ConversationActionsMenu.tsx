/**
 * Conversation ⋯ menu — desktop dropdown + mobile full-screen portal sheet.
 * Portals to document.body so overflow/transform on the messages shell cannot clip items.
 */
import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  buildConversationMenuItems,
  groupMenuItemsBySection,
  type ConversationMenuAction,
  type ConversationMenuState
} from './conversationMenuPolicy';

export type MessagingControlsMap = Record<string, boolean | undefined>;

type Props = {
  open: boolean;
  onClose: () => void;
  onAction: (action: ConversationMenuAction) => void;
  menuState: ConversationMenuState;
  messagingControls?: MessagingControlsMap;
  actionBusy?: boolean;
  /** Prefer sheet when true (mobile conversation / narrow viewport). */
  useMobileSheet: boolean;
  anchorRef?: React.RefObject<HTMLElement | null>;
};

const filterItems = (
  state: ConversationMenuState,
  controls: MessagingControlsMap | undefined
) =>
  buildConversationMenuItems(state).filter((item) => {
    const key = item.controlKey;
    if (!key) return true;
    // Only hide when explicitly false; missing/true stay visible.
    return controls?.[key] !== false;
  });

const MenuSections: React.FC<{
  state: ConversationMenuState;
  controls?: MessagingControlsMap;
  actionBusy?: boolean;
  onAction: (action: ConversationMenuAction) => void;
  dense?: boolean;
}> = ({ state, controls, actionBusy, onAction, dense }) => {
  const groups = useMemo(
    () => groupMenuItemsBySection(filterItems(state, controls)),
    [state, controls]
  );

  return (
    <>
      {groups.map((group, groupIndex) => (
        <div
          key={group.section}
          className={groupIndex > 0 ? 'mt-1 border-t border-gray-100 pt-1' : ''}
          data-testid={`messages-menu-section-${group.section}`}
        >
          {group.label ? (
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {group.label}
            </div>
          ) : null}
          {group.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              data-testid={`messages-menu-${item.id}`}
              disabled={Boolean(actionBusy) && item.id !== 'manage_settings'}
              onClick={() => onAction(item.id)}
              className={[
                dense ? 'min-h-10 rounded-md px-3 py-2' : 'min-h-12 rounded-xl px-3 py-3',
                'w-full text-left text-sm touch-manipulation disabled:opacity-60',
                item.destructive
                  ? 'font-medium text-red-600 hover:bg-red-50 active:bg-red-50'
                  : item.id === 'manage_settings' || item.id === 'group_settings'
                    ? 'font-medium text-indigo-700 hover:bg-indigo-50 active:bg-indigo-50'
                    : 'text-gray-900 hover:bg-gray-100 active:bg-gray-100'
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </>
  );
};

const ConversationActionsMenu: React.FC<Props> = ({
  open,
  onClose,
  onAction,
  menuState,
  messagingControls,
  actionBusy,
  useMobileSheet
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    if (useMobileSheet) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      if (useMobileSheet) document.body.style.overflow = prev;
    };
  }, [open, onClose, useMobileSheet]);

  if (!open) return null;

  const handleAction = (action: ConversationMenuAction) => {
    onAction(action);
  };

  if (useMobileSheet) {
    const sheet = (
      <div
        className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center"
        style={{
          paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
          paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
          paddingRight: 'max(0.5rem, env(safe-area-inset-right))'
        }}
        role="presentation"
        data-testid="messages-conversation-menu-backdrop"
        data-scroll-skip-swipe="true"
        onClick={onClose}
      >
        <div
          className="absolute inset-0 bg-black/45"
          aria-hidden
        />
        <div
          className="relative z-[1] flex max-h-[min(88dvh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:rounded-2xl"
          role="menu"
          aria-label="Conversation actions"
          data-testid="messages-conversation-menu"
          data-mobile-sheet="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Conversation</p>
              <p className="text-[11px] text-gray-500">Organization, notifications, privacy &amp; more</p>
            </div>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
              aria-label="Close menu"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
            style={{ WebkitOverflowScrolling: 'touch' }}
            data-testid="messages-conversation-menu-scroll"
          >
            <MenuSections
              state={menuState}
              controls={messagingControls}
              actionBusy={actionBusy}
              onAction={handleAction}
            />
            {actionBusy ? (
              <div className="px-3 py-2 text-xs text-gray-500">Updating…</div>
            ) : null}
          </div>
        </div>
      </div>
    );

    if (typeof document !== 'undefined') {
      return createPortal(sheet, document.body);
    }
    return sheet;
  }

  return (
    <div
      className="absolute right-0 top-11 z-30 max-h-[min(70vh,28rem)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl"
      role="menu"
      aria-label="Conversation actions"
      data-testid="messages-conversation-menu"
      data-mobile-sheet="false"
    >
      <MenuSections
        state={menuState}
        controls={messagingControls}
        actionBusy={actionBusy}
        onAction={handleAction}
        dense
      />
      {actionBusy ? <div className="px-3 py-2 text-xs text-gray-500">Updating…</div> : null}
    </div>
  );
};

export default ConversationActionsMenu;
