import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { PostOptionItem } from './usePostOptions';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export default function PostOptionsMenu({
  open,
  anchorEl,
  items,
  onClose
}: {
  open: boolean;
  anchorEl: HTMLElement | null;
  items: PostOptionItem[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuSize, setMenuSize] = useState<{ w: number; h: number }>({ w: 300, h: 260 });

  useLayoutEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuSize({ w: rect.width, h: rect.height });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, onClose]);

  const pos = useMemo(() => {
    if (!anchorEl) return { top: 0, left: 0 };
    const rect = anchorEl.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer bottom-right alignment.
    let left = rect.right - menuSize.w;
    left = clamp(left, margin, vw - margin - menuSize.w);

    let top = rect.bottom + 8;
    const wouldOverflowBottom = top + menuSize.h > vh - margin;
    if (wouldOverflowBottom) {
      top = rect.top - 8 - menuSize.h;
    }
    top = clamp(top, margin, vh - margin - menuSize.h);

    return { top, left };
  }, [anchorEl, menuSize.h, menuSize.w]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      {/* outside-click layer */}
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-transparent"
        aria-label="Close menu"
        onClick={onClose}
      />

      <div
        ref={menuRef}
        className="fixed w-[min(92vw,320px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        style={{ top: pos.top, left: pos.left }}
        role="menu"
        aria-label="Post options"
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={async () => {
              try {
                await item.onSelect();
              } finally {
                onClose();
              }
            }}
            className={[
              'flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors',
              item.dividerBefore ? 'border-t border-slate-100' : '',
              item.destructive ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50',
              item.disabled ? 'opacity-60' : ''
            ].join(' ')}
            role="menuitem"
          >
            <span className="shrink-0">{item.icon}</span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}

