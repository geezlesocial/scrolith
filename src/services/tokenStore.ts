import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

let memoryToken: string | null = null;

const cookieName = 'Scrolith_token';
const tokenKey = 'token';

const isNative = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
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
    if (isNative()) {
      try {
        const { value } = await Preferences.get({ key: tokenKey });
        if (value) memoryToken = value;
        return value || null;
      } catch {
        return null;
      }
    }
    const stored = safeGet(tokenKey);
    if (stored) {
      memoryToken = stored;
      return stored;
    }
    const cookieToken = readCookie();
    if (cookieToken) memoryToken = cookieToken;
    return cookieToken;
  },
  async set(token: string): Promise<void> {
    memoryToken = token;
    if (isNative()) {
      try {
        await Preferences.set({ key: tokenKey, value: token });
      } catch {
        // If the native Preferences plugin isn't available, keep in memory.
      }
      return;
    }
    safeSet(tokenKey, token);
    writeCookie(token);
  },
  async clear(): Promise<void> {
    memoryToken = null;
    if (isNative()) {
      try {
        await Preferences.remove({ key: tokenKey });
      } catch {
        // Ignore if native Preferences plugin isn't available.
      }
      return;
    }
    safeRemove(tokenKey);
    clearCookie();
  }
};

