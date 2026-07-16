import {
  AppDistributionService,
  type AppDistributionEvent,
  type AppDistributionPlatform
} from '../services/appDistribution';

const RECENT_EVENT_DEDUPE = new Map<string, number>();
const DEFAULT_DEDUPE_MS = 30_000;

const isNativeRuntime = () => {
  try {
    const runtime = typeof window !== 'undefined' ? (window as any)?.Capacitor : null;
    return Boolean(runtime && typeof runtime.isNativePlatform === 'function' && runtime.isNativePlatform());
  } catch {
    return false;
  }
};

const getRuntimePlatform = () => {
  try {
    const runtime = typeof window !== 'undefined' ? (window as any)?.Capacitor : null;
    if (runtime && typeof runtime.getPlatform === 'function') {
      return String(runtime.getPlatform() || 'web');
    }
  } catch {
    // Ignore runtime platform detection failures.
  }
  return 'web';
};

const hasCoarseTouchPointer = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  } catch {
    return false;
  }
};

const getRuntimeCategory = () => {
  if (isNativeRuntime()) return 'native';
  if (hasCoarseTouchPointer()) return 'mobile-web';
  return 'desktop-web';
};

const getTrackingPlatform = (): AppDistributionPlatform =>
  isNativeRuntime() ? 'android' : 'desktop';

const getCurrentSourcePath = () => {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname || '/'}${window.location.search || ''}${window.location.hash || ''}`;
};

const pruneRecentEvents = (now: number) => {
  for (const [key, value] of RECENT_EVENT_DEDUPE.entries()) {
    if (now - value > DEFAULT_DEDUPE_MS * 3) {
      RECENT_EVENT_DEDUPE.delete(key);
    }
  }
};

const buildFingerprint = (
  event: AppDistributionEvent,
  sourcePath: string,
  details: Record<string, any>
) => {
  const canonicalDetails = {
    code: details.code ?? '',
    message: String(details.message ?? details.error ?? '').slice(0, 240),
    targetRoute: details.targetRoute ?? '',
    path: details.path ?? '',
    type: details.type ?? '',
    reason: details.reason ?? ''
  };
  return `${event}:${sourcePath}:${JSON.stringify(canonicalDetails)}`;
};

export const trackMobileRuntimeEvent = async (
  event: AppDistributionEvent,
  details: Record<string, any> = {},
  options?: {
    dedupeMs?: number;
    sourcePath?: string;
  }
) => {
  try {
    const sourcePath = String(options?.sourcePath || getCurrentSourcePath() || '/');
    const dedupeMs = Math.max(0, Number(options?.dedupeMs ?? DEFAULT_DEDUPE_MS));
    const now = Date.now();
    pruneRecentEvents(now);
    const fingerprint = buildFingerprint(event, sourcePath, details);
    const lastSeen = RECENT_EVENT_DEDUPE.get(fingerprint) || 0;
    if (dedupeMs > 0 && now - lastSeen < dedupeMs) return;
    RECENT_EVENT_DEDUPE.set(fingerprint, now);

    await AppDistributionService.trackEvent({
      event,
      platform: getTrackingPlatform(),
      deviceCategory: getTrackingPlatform(),
      sourcePath,
      details: {
        ...details,
        runtimeCategory: getRuntimeCategory(),
        native: isNativeRuntime(),
        coarseTouch: hasCoarseTouchPointer(),
        capacitorPlatform: getRuntimePlatform(),
        href: typeof window !== 'undefined' ? window.location.href : sourcePath
      }
    });
  } catch {
    // Telemetry must remain best-effort only.
  }
};
