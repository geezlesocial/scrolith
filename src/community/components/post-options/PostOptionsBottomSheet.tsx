import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { PostOptionItem } from './usePostOptions';

export default function PostOptionsBottomSheet({
  open,
  title = 'Post options',
  items,
  onClose
}: {
  open: boolean;
  title?: string;
  items: PostOptionItem[];
  onClose: () => void;
}) {
  const startYRef = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const sheetStyle = useMemo(() => {
    const y = Math.max(0, dragY);
    return {
      transform: `translateY(${y}px)`
    } as React.CSSProperties;
  }, [dragY]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-t-3xl border border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out"
        style={sheetStyle}
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-4 pt-3 touch-none"
          onTouchStart={(e) => {
            startYRef.current = e.touches?.[0]?.clientY ?? null;
          }}
          onTouchMove={(e) => {
            const startY = startYRef.current;
            if (startY === null) return;
            const currentY = e.touches?.[0]?.clientY ?? startY;
            const deltaY = currentY - startY;
            if (deltaY > 0) {
              e.preventDefault();
              setDragY(deltaY);
            }
          }}
          onTouchEnd={() => {
            if (dragY > 90) {
              setDragY(0);
              onClose();
              return;
            }
            setDragY(0);
            startYRef.current = null;
          }}
          onTouchCancel={() => {
            setDragY(0);
            startYRef.current = null;
          }}
        >
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-3 max-h-[70dvh] overflow-y-auto overscroll-contain pb-2">
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
                item.destructive ? 'text-rose-600 active:bg-rose-50' : 'text-slate-700 active:bg-slate-50',
                item.disabled ? 'opacity-60' : ''
              ].join(' ')}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="min-w-0 flex-1">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
