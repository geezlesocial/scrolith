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

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const getFocusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      );

    // Initial focus after paint so dialog children are mounted.
    window.setTimeout(() => {
      const list = getFocusable();
      list[0]?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      // Re-query each Tab so dynamically added media controls stay in the trap.
      const list = getFocusable();
      if (!list.length) return;
      const currentIndex = list.indexOf(document.activeElement as HTMLElement);
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
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={composerModalBackdrop} role="presentation">
      <button type="button" aria-label="Close composer" className="absolute inset-0" onClick={onClose} />
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
