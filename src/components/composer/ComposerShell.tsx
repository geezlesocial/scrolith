import React, { useEffect, useId, useRef } from 'react';
import {
  composerModalBackdrop,
  composerModalBody,
  composerModalFooter,
  composerModalHeader,
  composerModalShell
} from './composerClasses';

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** Optional status text for screen readers (upload/publish). */
  statusMessage?: string;
};

/**
 * Accessible modal shell for the enterprise composer.
 * Focus trap + Escape + body scroll lock while open.
 *
 * IMPORTANT: the focus-trap effect depends only on `open`.
 * `onClose` is read via a ref so draft keystrokes / parent re-renders
 * never re-run trap setup (which previously stole focus from the editor).
 */
const ComposerShell: React.FC<Props> = ({
  open,
  title = 'Create a post',
  onClose,
  header,
  children,
  footer,
  statusMessage
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    // Exclude tabindex=-1 (suggestion rows keep editor DOM focus via aria-activedescendant).
    const getFocusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      );

    // Initial focus once when the dialog opens — never on parent callback churn.
    // Prefer keeping focus if a child (e.g. intent-driven editor focus) already has it.
    const focusTimer = window.setTimeout(() => {
      if (panel?.contains(document.activeElement)) return;
      const list = getFocusable();
      list[0]?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Allow nested handlers (mention/hashtag popup) to claim Escape first.
        if (event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      // Re-query each Tab so dynamically added media controls stay in the trap.
      const list = getFocusable();
      if (!list.length) return;
      const active = document.activeElement as HTMLElement | null;
      // If focus is already inside the panel but not a listed control, do not yank it.
      if (active && panel.contains(active) && !list.includes(active)) {
        return;
      }
      const currentIndex = active ? list.indexOf(active) : -1;
      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault();
          list[list.length - 1]?.focus();
        }
      } else if (currentIndex === list.length - 1 || currentIndex === -1) {
        event.preventDefault();
        list[0]?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={composerModalBackdrop} role="presentation">
      <button type="button" aria-label="Close composer" className="absolute inset-0" onClick={() => onCloseRef.current()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={composerModalShell}
      >
        <span id={titleId} className="sr-only">
          {title}
        </span>
        <div className={composerModalHeader}>{header}</div>
        <div className={composerModalBody}>{children}</div>
        <div className={composerModalFooter}>{footer}</div>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {statusMessage || ''}
        </div>
      </div>
    </div>
  );
};

export default ComposerShell;
