import { useEffect, useState } from 'react';
import type { MessagingDockRect } from '../../services/messagingSurfaces';

export type BlockingOverlaySnapshot = {
  active: boolean;
  /** Bounding rect of the topmost visible aria-modal dialog, if measurable. */
  rect: MessagingDockRect | null;
};

const EMPTY: BlockingOverlaySnapshot = { active: false, rect: null };

/**
 * Detects blocking dialogs/modals and exposes their geometry for adaptive dock placement.
 * MutationObserver + ResizeObserver + rAF coalescing (no polling loop).
 */
export function useBlockingOverlayActive(): boolean {
  return useBlockingOverlaySnapshot().active;
}

export function useBlockingOverlaySnapshot(): BlockingOverlaySnapshot {
  const [snapshot, setSnapshot] = useState<BlockingOverlaySnapshot>(() =>
    readBlockingOverlaySnapshot()
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;

    let raf = 0;
    let resizeObserver: ResizeObserver | null = null;
    let observedEl: Element | null = null;

    const apply = (next: BlockingOverlaySnapshot) => {
      setSnapshot((prev) => {
        if (
          prev.active === next.active &&
          rectEqual(prev.rect, next.rect)
        ) {
          return prev;
        }
        return next;
      });
    };

    const measure = () => {
      raf = 0;
      const next = readBlockingOverlaySnapshot();
      apply(next);

      const el = findTopmostBlockingDialog();
      if (resizeObserver) {
        if (observedEl && observedEl !== el) {
          try {
            resizeObserver.unobserve(observedEl);
          } catch {
            /* ignore */
          }
          observedEl = null;
        }
        if (el && observedEl !== el) {
          resizeObserver.observe(el);
          observedEl = el;
        }
      }
    };

    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(measure);
    };

    schedule();
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-modal', 'hidden', 'class', 'style', 'open']
    });

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(schedule);
    }

    window.addEventListener('resize', schedule, { passive: true });

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      mutationObserver.disconnect();
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return snapshot;
}

const rectEqual = (a: MessagingDockRect | null, b: MessagingDockRect | null) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.left) === Math.round(b.left) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  );
};

export function findTopmostBlockingDialog(
  root: ParentNode = document
): HTMLElement | null {
  try {
    const modals = root.querySelectorAll('[aria-modal="true"]');
    let found: HTMLElement | null = null;
    for (let i = 0; i < modals.length; i += 1) {
      const el = modals[i] as HTMLElement;
      if (!isVisibleBlockingDialog(el)) continue;
      found = el;
    }
    return found;
  } catch {
    return null;
  }
}

export function isVisibleBlockingDialog(el: HTMLElement): boolean {
  if (!el || el.getAttribute('aria-hidden') === 'true') return false;
  if (el.hasAttribute('hidden')) return false;
  const style = typeof window !== 'undefined' ? window.getComputedStyle(el) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  const role = (el.getAttribute('role') || '').toLowerCase();
  if (role === 'dialog' || role === 'alertdialog') return true;
  if (el.closest('[role="dialog"], [role="alertdialog"]')) return true;
  return el.getAttribute('aria-modal') === 'true';
}

export function readBlockingOverlayRect(
  el: HTMLElement | null
): MessagingDockRect | null {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  try {
    const r = el.getBoundingClientRect();
    if (!r || r.width < 8 || r.height < 8) return null;
    return {
      top: r.top,
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height
    };
  } catch {
    return null;
  }
}

/** Pure DOM check — exported for unit tests. */
export function readBlockingOverlayActive(root: ParentNode = document): boolean {
  return Boolean(findTopmostBlockingDialog(root));
}

export function readBlockingOverlaySnapshot(
  root: ParentNode = document
): BlockingOverlaySnapshot {
  const el = findTopmostBlockingDialog(root);
  if (!el) return EMPTY;
  return {
    active: true,
    rect: readBlockingOverlayRect(el)
  };
}

export default useBlockingOverlayActive;
