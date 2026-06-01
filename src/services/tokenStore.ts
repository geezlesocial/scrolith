let memoryToken: string | null = null;

const cookieName = 'Scrolith_token';
const tokenKey = 'token';
const NATIVE_PREFERENCES_TIMEOUT_MS = 1200;

const hasCapacitorBridge = () =>
  typeof window !== 'undefined' && Boolean((window as any).Capacitor);

const isNative = () => {
  if (!hasCapacitorBridge()) return false;
  try {
    const runtime = (window as any).Capacitor;
    return Boolean(runtime && typeof runtime.isNativePlatform === 'function' && runtime.isNativePlatform());
  } catch {
    return false;
  }
};

const getPreferences = async () => {
  const { Preferences } = await import('@capacitor/preferences');
  return Preferences;
};

const withTimeout = async <T,>(promise: Promise<T>, fallback: T, timeoutMs = NATIVE_PREFERENCES_TIMEOUT_MS): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const readCookie = (): string | null => {
  try {
    const raw = document.cookie || '';
    const match = raw
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${cookieName}=`));
    if (!match) return null;
    return decodeURIComponent(match.slice(cookieName.length + 1));
  } catch {}
  return null;
};

const writeCookie = (value: string) => {
  try {
    document.cookie = `${cookieName}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
  } catch {}
};

const clearCookie = () => {
  try {
    document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  } catch {}
};

const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {}
  try {
    return sessionStorage.getItem(key);
  } catch {}
  return null;
};

const safeSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
    return;
  } catch {}
  try {
    sessionStorage.setItem(key, value);
  } catch {}
};

const safeRemove = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {}
  try {
    sessionStorage.removeItem(key);
  } catch {}
};

export const tokenStore = {
  async get(): Promise<string | null> {
    if (memoryToken) return memoryToken;

    const stored = safeGet(tokenKey);
    if (stored) {
      memoryToken = stored;
      return stored;
    }

    const cookieToken = readCookie();
    if (cookieToken) {
      memoryToken = cookieToken;
      return cookieToken;
    }

    if (isNative()) {
      try {
        const { value } = await withTimeout(
          (async () => {
            const Preferences = await getPreferences();
            return Preferences.get({ key: tokenKey });
          })(),
          { value: null as string | null }
        );
        if (value) memoryToken = value;
        return value || null;
      } catch {
        return null;
      }
    }

    return null;
  },
  async set(token: string): Promise<void> {
    memoryToken = token;
    safeSet(tokenKey, token);
    writeCookie(token);

    if (isNative()) {
      try {
        await withTimeout(
          (async () => {
            const Preferences = await getPreferences();
            return Preferences.set({ key: tokenKey, value: token });
          })(),
          undefined
        );
      } catch {
        // If the native Preferences plugin isn't available, keep in memory.
      }
    }
  },
  async clear(): Promise<void> {
    memoryToken = null;
    safeRemove(tokenKey);
    clearCookie();

    if (isNative()) {
      try {
        await withTimeout(
          (async () => {
            const Preferences = await getPreferences();
            return Preferences.remove({ key: tokenKey });
          })(),
          undefined
        );
      } catch {
        // Ignore if native Preferences plugin isn't available.
      }
    }
  }
};

