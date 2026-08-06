/**
 * Next-gen native chrome bootstrap for Capacitor / compact-touch shells.
 * Applies safe-area, overscroll, and document-level platform markers without
 * changing routing or business logic.
 */

export const NATIVE_SHELL_CLASS = 'scrolith-native-shell';
export const COMPACT_TOUCH_SHELL_CLASS = 'scrolith-compact-touch';
export const NATIVE_ONLINE_FLAG = '__SCROLITH_NATIVE_ONLINE';

export type NativeChromeOptions = {
  isNative?: boolean;
  isCompactTouch?: boolean;
  brandThemeColor?: string;
};

const DEFAULT_THEME_COLOR = '#0B5FFF';

const ensureViewportFitCover = () => {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
  if (!existing) {
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content =
      'width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no';
    document.head.appendChild(meta);
    return;
  }
  const content = String(existing.content || '');
  const parts = content
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const withoutFit = parts.filter((part) => !/^viewport-fit=/i.test(part));
  withoutFit.push('viewport-fit=cover');
  // Avoid double-pinch zoom thrash in WebView; keep accessibility via system font scale.
  if (!withoutFit.some((part) => /^maximum-scale=/i.test(part))) {
    withoutFit.push('maximum-scale=5.0');
  }
  existing.content = withoutFit.join(', ');
};

const ensureThemeColor = (color: string) => {
  if (typeof document === 'undefined') return;
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  if (meta.content !== color) {
    meta.content = color;
  }
};

const setDocumentClass = (className: string, enabled: boolean) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle(className, enabled);
  document.body?.classList.toggle(className, enabled);
};

const setCssVar = (name: string, value: string) => {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(name, value);
};

/**
 * Publish safe-area CSS variables so shell chrome can pad without hardcoding.
 * Falls back to 0px when env() is unavailable (desktop browsers).
 */
export const syncSafeAreaCssVars = () => {
  if (typeof document === 'undefined') return;
  setCssVar('--scrolith-sat', 'env(safe-area-inset-top, 0px)');
  setCssVar('--scrolith-sar', 'env(safe-area-inset-right, 0px)');
  setCssVar('--scrolith-sab', 'env(safe-area-inset-bottom, 0px)');
  setCssVar('--scrolith-sal', 'env(safe-area-inset-left, 0px)');
  setCssVar('--scrolith-header-h', '56px');
  setCssVar('--scrolith-bottom-nav-h', '64px');
  setCssVar('--scrolith-shell-header-offset', 'calc(var(--scrolith-header-h) + var(--scrolith-sat))');
  setCssVar(
    '--scrolith-shell-bottom-offset',
    'calc(var(--scrolith-bottom-nav-h) + var(--scrolith-sab))'
  );
};

export const readNativeOnlineFlag = (): boolean | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = (window as any)[NATIVE_ONLINE_FLAG];
    if (typeof value === 'boolean') return value;
    return null;
  } catch {
    return null;
  }
};

/**
 * Apply next-gen document chrome for native / compact-touch runtimes.
 * Idempotent and safe to call from App bootstrap.
 */
export const applyNativeChrome = (options: NativeChromeOptions = {}) => {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return () => undefined;
  }

  const isNative = Boolean(options.isNative);
  const isCompactTouch = Boolean(options.isCompactTouch || isNative);
  const themeColor = options.brandThemeColor || DEFAULT_THEME_COLOR;

  ensureViewportFitCover();
  ensureThemeColor(themeColor);
  syncSafeAreaCssVars();

  setDocumentClass(NATIVE_SHELL_CLASS, isNative);
  setDocumentClass(COMPACT_TOUCH_SHELL_CLASS, isCompactTouch);

  if (isNative || isCompactTouch) {
    document.documentElement.style.overscrollBehaviorY = 'none';
    document.body.style.overscrollBehaviorY = 'contain';
    document.body.style.touchAction = 'manipulation';
    // Prevent rubber-band white flash behind fixed chrome on Android WebView.
    document.documentElement.style.backgroundColor = '#f8fafc';
    document.body.style.backgroundColor = '#f8fafc';
    document.documentElement.style.minHeight = '100dvh';
  }

  const onOrientation = () => {
    syncSafeAreaCssVars();
  };
  window.addEventListener('orientationchange', onOrientation, { passive: true });
  window.visualViewport?.addEventListener('resize', onOrientation, { passive: true } as AddEventListenerOptions);

  return () => {
    window.removeEventListener('orientationchange', onOrientation);
    window.visualViewport?.removeEventListener('resize', onOrientation as EventListener);
  };
};

/** Light haptic-style tap feedback for tab/header actions (no plugin required). */
export const pulseTapFeedback = (element?: HTMLElement | null) => {
  if (!element || typeof element.animate !== 'function') return;
  try {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduceMotion) return;
    element.animate(
      [
        { transform: 'scale(1)', offset: 0 },
        { transform: 'scale(0.94)', offset: 0.4 },
        { transform: 'scale(1)', offset: 1 }
      ],
      { duration: 140, easing: 'ease-out' }
    );
  } catch {
    // Best-effort only.
  }
};
