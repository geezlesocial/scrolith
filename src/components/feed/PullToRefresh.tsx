import React, { useCallback, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

type PullToRefreshProps = {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
  /** Soft refresh must never clear children. */
  children: React.ReactNode;
  className?: string;
  thresholdPx?: number;
  /** Prefer reduced motion / data saver: disable gesture. */
  reducedMotion?: boolean;
};

/**
 * Phase 21.0.1 — native-quality pull-to-refresh.
 * Soft refresh only: never clears feed content; cancels duplicate pulls.
 */
const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  disabled = false,
  children,
  className = '',
  thresholdPx = 72,
  reducedMotion = false
}) => {
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const inFlightRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const canPull = useCallback(() => {
    if (disabled || reducedMotion || refreshing || inFlightRef.current) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const el = containerRef.current;
    if (!el) return true;
    // Only when scrolled to top of nearest scroll parent / window.
    const scrollParent = el.closest('[data-feed-scroll-root="true"]') as HTMLElement | null;
    if (scrollParent) return scrollParent.scrollTop <= 0;
    if (typeof window !== 'undefined') return window.scrollY <= 2 || document.documentElement.scrollTop <= 2;
    return true;
  }, [disabled, reducedMotion, refreshing]);

  const finish = useCallback(async () => {
    if (pullDistance < thresholdPx || inFlightRef.current) {
      setPullDistance(0);
      pullingRef.current = false;
      return;
    }
    inFlightRef.current = true;
    setRefreshing(true);
    setPullDistance(thresholdPx * 0.55);
    try {
      await onRefresh();
    } finally {
      inFlightRef.current = false;
      setRefreshing(false);
      setPullDistance(0);
      pullingRef.current = false;
    }
  }, [onRefresh, pullDistance, thresholdPx]);

  const onTouchStart = (event: React.TouchEvent) => {
    if (!canPull()) return;
    startYRef.current = event.touches[0]?.clientY || 0;
    pullingRef.current = true;
  };

  const onTouchMove = (event: React.TouchEvent) => {
    if (!pullingRef.current || inFlightRef.current) return;
    if (!canPull() && pullDistance === 0) {
      pullingRef.current = false;
      return;
    }
    const y = event.touches[0]?.clientY || 0;
    const delta = y - startYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    // Rubber-band resistance
    const distance = Math.min(thresholdPx * 1.45, delta * 0.45);
    setPullDistance(distance);
    if (distance > 8) {
      // Prevent native overscroll bounce fighting PTR on some WebViews
      event.preventDefault();
    }
  };

  const onTouchEnd = () => {
    if (!pullingRef.current) return;
    void finish();
  };

  const progress = Math.min(1, pullDistance / thresholdPx);
  const showIndicator = pullDistance > 4 || refreshing;

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      data-testid="pull-to-refresh"
      data-phase="21.0.1"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => {
        pullingRef.current = false;
        if (!refreshing) setPullDistance(0);
      }}
    >
      <div
        className="pointer-events-none flex items-center justify-center overflow-hidden transition-[height] duration-150 ease-out"
        style={{ height: showIndicator ? Math.max(pullDistance, refreshing ? 40 : 0) : 0 }}
        aria-hidden={!showIndicator}
      >
        <div
          className={`flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm ${
            reducedMotion ? '' : 'transition-transform'
          }`}
          style={{
            transform: reducedMotion ? undefined : `scale(${0.85 + progress * 0.15})`,
            opacity: 0.55 + progress * 0.45
          }}
          role="status"
          aria-live="polite"
        >
          <Loader2
            className={`h-3.5 w-3.5 ${refreshing || progress >= 1 ? 'animate-spin' : ''}`}
            aria-hidden
          />
          <span>{refreshing ? 'Refreshing…' : progress >= 1 ? 'Release to refresh' : 'Pull to refresh'}</span>
        </div>
      </div>
      {/* Children always remain mounted — soft refresh never clears feed. */}
      {children}
    </div>
  );
};

export default PullToRefresh;
