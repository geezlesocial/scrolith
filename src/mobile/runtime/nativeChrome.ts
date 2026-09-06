/**
 * Next-gen native chrome bootstrap for Capacitor / compact-touch shells.
 * Safe-area + theme markers only — must NEVER lock document vertical scroll.
 * (1.1.65/66 regression fix: prior overscroll/touch-action settings broke
 * member-home and community feed pan on Android WebView + mobile web.)
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
    // Allow vertical pan; keep pinch zoom available for a11y (max 5).
    meta.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
    document.head.appendChild(meta);
    return;
  }
  const content = String(existing.content || '');
  const parts = content
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    // Drop locks that break scroll/zoom on some Android WebViews.
    .filter((part) => !/^user-scalable=/i.test(part) && !/^maximum-scale=1(\.0)?$/i.test(part));
  if (!parts.some((part) => /^viewport-fit=/i.test(part))) {
    parts.push('viewport-fit=cover');
  }
  if (!parts.some((part) => /^maximum-scale=/i.test(part))) {
    parts.push('maximum-scale=5.0');
  }
  existing.content = parts.join(', ');
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
 */
export const syncSafeAreaCssVars = () => {
  if (typeof document === 'undefined') return;
  setCssVar('--scrolith-sat', 'env(safe-area-inset-top, 0px)');
  setCssVar('--scrolith-sar', 'env(safe-area-inset-right, 0px)');
  setCssVar('--scrolith-sab', 'env(safe-area-inset-bottom, 0px)');
  setCssVar('--scrolith-sal', 'env(safe-area-inset-left, 0px)');
  setCssVar('--scrolith-header-h', '52px');
  setCssVar('--scrolith-bottom-nav-h', '56px');
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
 * Ensure document can scroll vertically (critical for member-home / community feeds).
 * Clears any residual inline locks from older chrome experiments or modal cleanup bugs.
 */
export const ensureDocumentScrollEnabled = () => {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  const body = document.body;
  if (!html || !body) return;

  // Prefer document (window) scroll — matches older working mobile builds.
  html.style.overflowY = 'auto';
  html.style.overflowX = 'hidden';
  html.style.height = 'auto';
  html.style.minHeight = '100%';
  // Do NOT set overscroll-behavior-y: none on html — it traps pan on some WebViews.
  html.style.overscrollBehaviorY = 'auto';
  html.style.touchAction = 'pan-y pinch-zoom';

  body.style.overflowY = 'visible';
  body.style.overflowX = 'hidden';
  body.style.height = 'auto';
  body.style.minHeight = '100%';
  body.style.overscrollBehaviorY = 'auto';
  body.style.touchAction = 'pan-y pinch-zoom';
  body.style.position = '';
  body.style.top = '';
  body.style.width = '';

  const root = document.getElementById('root');
  if (root) {
    root.style.minHeight = '100%';
    root.style.height = 'auto';
    root.style.overflow = 'visible';
    root.style.touchAction = 'pan-y pinch-zoom';
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
    document.documentElement.style.backgroundColor = '#f8fafc';
    document.body.style.backgroundColor = '#f8fafc';
  }

  // Always re-enable document scroll after chrome apply (and after orientation).
  ensureDocumentScrollEnabled();

  const onOrientation = () => {
    syncSafeAreaCssVars();
    ensureDocumentScrollEnabled();
  };
  window.addEventListener('orientationchange', onOrientation, { passive: true });
  window.visualViewport?.addEventListener('resize', onOrientation, {
    passive: true
  } as AddEventListenerOptions);
  // Re-assert after first paint — some WebViews reflow and re-lock overflow.
  const paintId =
    typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(() => ensureDocumentScrollEnabled())
      : null;
  const timerId = window.setTimeout(() => ensureDocumentScrollEnabled(), 120);

  return () => {
    window.removeEventListener('orientationchange', onOrientation);
    window.visualViewport?.removeEventListener('resize', onOrientation as EventListener);
    if (paintId != null && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(paintId);
    }
    window.clearTimeout(timerId);
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
