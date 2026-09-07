import { useEffect } from 'react';
import { recordMobileObservabilityEvent } from './mobileObservability';

type PerformanceObserverConstructor = new (callback: (list: { getEntries: () => PerformanceEntry[] }) => void) => PerformanceObserver;

const isReducedDataRuntime = () => {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(connection?.saveData || ['slow-2g', '2g'].includes(String(connection?.effectiveType || '').toLowerCase()));
};

const reportPerformance = (route: string, durationMs: number, kind: 'route' | 'long-task') => {
  const roundedDuration = Math.round(Math.max(0, durationMs));
  recordMobileObservabilityEvent({
    type: `performance.${kind}`,
    level: roundedDuration > (kind === 'route' ? 1200 : 250) ? 'warning' : 'info',
    message: `${route} ${kind} completed in ${roundedDuration}ms.`,
    metadata: { route, durationMs: roundedDuration, reducedData: isReducedDataRuntime() }
  });

  void import('../mobileTelemetry')
    .then(({ trackMobileRuntimeEvent }) =>
      trackMobileRuntimeEvent(
        'mobile_runtime_error',
        {
          kind: `performance.${kind}`,
          route,
          durationMs: roundedDuration,
          reducedData: isReducedDataRuntime()
        },
        { dedupeMs: 10_000, sourcePath: typeof window === 'undefined' ? route : window.location.pathname }
      )
    )
    .catch(() => {});
};

export const useMobilePerformance = (route: string, ready = true) => {
  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const markName = `scrolith:mobile:${route}:start`;
    try {
      performance.mark(markName);
    } catch {
      // Performance instrumentation must never affect rendering.
    }

    const report = () => {
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      reportPerformance(route, endedAt - startedAt, 'route');
    };

    const frame = window.requestAnimationFrame(report);
    return () => window.cancelAnimationFrame(frame);
  }, [ready, route]);
};

export const installMobileLongTaskObserver = (route: string) => {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return () => undefined;
  const SupportedObserver = PerformanceObserver as unknown as PerformanceObserverConstructor;
  let observer: PerformanceObserver | null = null;
  try {
    observer = new SupportedObserver((list) => {
      list.getEntries().forEach((entry) => reportPerformance(route, entry.duration, 'long-task'));
    });
    observer.observe({ type: 'longtask', buffered: true });
  } catch {
    observer?.disconnect();
    observer = null;
  }
  return () => observer?.disconnect();
};
