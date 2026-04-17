export type MobileObservabilityLevel = 'info' | 'warning' | 'error';

export type MobileObservabilityEvent = {
  id: string;
  type: string;
  level: MobileObservabilityLevel;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  url?: string;
  userAgent?: string;
};

const BUFFER_KEY = 'scrolith:mobile-observability-buffer:v1';
const MAX_EVENTS = 80;
let installed = false;

const safeNowIso = () => {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
};

const createEventId = () => {
  const random = Math.random().toString(36).slice(2, 10);
  return `mob_${Date.now().toString(36)}_${random}`;
};

const readBuffer = (): MobileObservabilityEvent[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(BUFFER_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_EVENTS) : [];
  } catch {
    return [];
  }
};

const writeBuffer = (events: MobileObservabilityEvent[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BUFFER_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Observability must never break the user path.
  }
};

export const getMobileObservabilityBuffer = () => readBuffer();

export const clearMobileObservabilityBuffer = () => writeBuffer([]);

export const recordMobileObservabilityEvent = (
  input: Omit<MobileObservabilityEvent, 'id' | 'createdAt' | 'url' | 'userAgent'> &
    Partial<Pick<MobileObservabilityEvent, 'id' | 'createdAt' | 'url' | 'userAgent'>>
) => {
  const event: MobileObservabilityEvent = {
    id: input.id || createEventId(),
    createdAt: input.createdAt || safeNowIso(),
    type: input.type,
    level: input.level,
    message: input.message,
    metadata: input.metadata,
    url:
      input.url ||
      (typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}${window.location.hash}` : undefined),
    userAgent: input.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined)
  };

  const next = [...readBuffer(), event].slice(-MAX_EVENTS);
  writeBuffer(next);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('scrolith:mobile-observability', { detail: event }));
  }

  return event;
};

export const installMobileObservability = () => {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    recordMobileObservabilityEvent({
      type: 'window.error',
      level: 'error',
      message: String(event.message || 'Unhandled window error'),
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason: any = event.reason;
    recordMobileObservabilityEvent({
      type: 'promise.unhandled_rejection',
      level: 'error',
      message: String(reason?.message || reason || 'Unhandled promise rejection'),
      metadata: {
        code: reason?.code,
        status: reason?.response?.status
      }
    });
  });

  window.addEventListener('offline', () => {
    recordMobileObservabilityEvent({
      type: 'network.offline',
      level: 'warning',
      message: 'Device went offline.'
    });
  });

  window.addEventListener('online', () => {
    recordMobileObservabilityEvent({
      type: 'network.online',
      level: 'info',
      message: 'Device came back online.'
    });
  });
};
