let memoryToken: string | null = null;

const cookieName = 'geezle_token';

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
  get(): string | null {
    if (memoryToken) return memoryToken;
    const stored = safeGet('token');
    if (stored) {
      memoryToken = stored;
      return stored;
    }
    const cookieToken = readCookie();
    if (cookieToken) memoryToken = cookieToken;
    return cookieToken;
  },
  set(token: string) {
    memoryToken = token;
    safeSet('token', token);
    writeCookie(token);
  },
  clear() {
    memoryToken = null;
    safeRemove('token');
    clearCookie();
  }
};
