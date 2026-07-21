import api from './api';
import { tokenStore } from './tokenStore';
import { FollowOnboardingStatus, User, UserRole } from '../types';
import { resolveUserAvatarUrl } from '../utils/userAvatar';

type AuthResponse = {
  token?: string;
  accessToken?: string;
  access_token?: string;
  user?: User;
  data?: any;
  success?: boolean;
  error?: string;
  message?: string;
};
type CurrentUserResult = { user: User | null; unauthorized: boolean };
type FollowOnboardingResponse = {
  user?: User;
  onboarding?: FollowOnboardingStatus;
};

const AUTH_REQUEST_TIMEOUT_MS = 24_000;

const withAuthRequestTimeout = async <T,>(
  request: Promise<T>,
  fallbackMessage: string
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      request,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(fallbackMessage));
        }, AUTH_REQUEST_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const extractAuthPayload = (response: any): AuthResponse => {
  const root = response?.data ?? response ?? {};
  const nested = root?.data && typeof root.data === 'object' ? root.data : {};
  const token =
    root?.token ??
    root?.accessToken ??
    root?.access_token ??
    nested?.token ??
    nested?.accessToken ??
    nested?.access_token;
  const user =
    root?.user ??
    nested?.user ??
    (nested && typeof nested === 'object' && nested.id ? nested : null) ??
    (root && typeof root === 'object' && root.id ? root : null);

  return {
    ...root,
    ...nested,
    token,
    user,
    requires2FA: root?.requires2FA ?? nested?.requires2FA,
    challengeToken: root?.challengeToken ?? root?.challenge_token ?? nested?.challengeToken,
    code: root?.code ?? nested?.code,
    error: root?.error ?? root?.message ?? nested?.error ?? nested?.message,
    message: root?.message ?? nested?.message ?? root?.error ?? nested?.error,
    success: root?.success ?? nested?.success
  };
};

const extractErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error ||
  error?.response?.data?.message ||
  error?.response?.data?.data?.error ||
  error?.response?.data?.data?.message ||
  error?.message ||
  fallback;

const mapRole = (role?: any): UserRole => {
  if (!role) return UserRole.GUEST;
  const r = String(role).toLowerCase();
  if (r.includes('admin')) return UserRole.ADMIN;
  if (r.includes('freelancer') || r.includes('seller')) return UserRole.FREELANCER;
  if (r.includes('employer') || r.includes('client') || r.includes('buyer')) return UserRole.EMPLOYER;
  return UserRole.GUEST;
};

const normalizeUser = (user?: User): User | null => {
  if (!user) return null;
  const avatar = resolveUserAvatarUrl(user) || undefined;
  return {
    ...user,
    role: mapRole(user.role),
    ...(avatar ? { avatar, avatar_url: avatar, avatarUrl: avatar } : {})
  };
};

class AuthService {
  static async login(credentials: {
    email: string;
    password: string;
    humanVerificationToken?: string | null;
  }) {
    try {
      const response = await withAuthRequestTimeout(
        api.post('/auth/login', credentials, {
          timeout: AUTH_REQUEST_TIMEOUT_MS,
          __skipRetry: true
        } as any),
        'Login request timed out. Please check your connection and try again.'
      );
      const payload = extractAuthPayload(response);
      // Admin Google 2FA challenge (General Settings → Admin 2FA)
      if (payload?.requires2FA || payload?.code === '2FA_REQUIRED') {
        return {
          success: false,
          requires2FA: true,
          challengeToken: payload.challengeToken || payload.challenge_token,
          error: payload?.message || 'Authenticator code required',
          user: payload?.user || null
        };
      }
      if (payload?.token && payload?.user) {
        const user = normalizeUser(payload.user);
        if (user) {
          await tokenStore.set(payload.token);
          // Ensure axios picks up the token even if storage is blocked/cleared.
          api.defaults.headers.common.Authorization = `Bearer ${payload.token}`;
          try {
            localStorage.setItem('user', JSON.stringify(user));
          } catch {}
          return { success: true, user, token: payload.token };
        }
      }
      return { success: false, error: payload?.error || payload?.message || 'Login failed' };
    } catch (error: any) {
      return { success: false, error: extractErrorMessage(error, 'Login failed') };
    }
  }

  static async verify2FALogin(challengeToken: string, code: string) {
    try {
      const response = await withAuthRequestTimeout(
        api.post(
          '/auth/2fa/verify',
          { challengeToken, code },
          { timeout: AUTH_REQUEST_TIMEOUT_MS, __skipRetry: true } as any
        ),
        '2FA verification timed out. Please try again.'
      );
      const payload = extractAuthPayload(response);
      if (payload?.token && payload?.user) {
        const user = normalizeUser(payload.user);
        if (user) {
          await tokenStore.set(payload.token);
          api.defaults.headers.common.Authorization = `Bearer ${payload.token}`;
          try {
            localStorage.setItem('user', JSON.stringify(user));
          } catch {}
          return { success: true, user, token: payload.token };
        }
      }
      return { success: false, error: payload?.error || 'Invalid authenticator code' };
    } catch (error: any) {
      return { success: false, error: extractErrorMessage(error, '2FA verification failed') };
    }
  }

  static async register(userData: {
    email: string;
    name: string;
    password: string;
    role?: any;
    recaptchaToken?: string;
    humanVerificationToken?: string | null;
    [key: string]: any;
  }) {
    try {
      const response = await withAuthRequestTimeout(
        api.post('/auth/register', userData, {
          timeout: AUTH_REQUEST_TIMEOUT_MS,
          __skipRetry: true
        } as any),
        'Signup request timed out. Please check your connection and try again.'
      );
      const payload = extractAuthPayload(response);
      if (payload?.token && payload?.user) {
        const user = normalizeUser(payload.user);
        if (user) {
          await tokenStore.set(payload.token);
          api.defaults.headers.common.Authorization = `Bearer ${payload.token}`;
          try {
            localStorage.setItem('user', JSON.stringify(user));
          } catch {}
          return { success: true, user, token: payload.token };
        }
      }
      return { success: false, error: payload?.error || 'Registration failed' };
    } catch (error: any) {
      return { success: false, error: extractErrorMessage(error, 'Registration failed') };
    }
  }

  static async getCurrentUserWithStatus(): Promise<CurrentUserResult> {
    try {
      const token = await tokenStore.get();
      if (!token) {
        const cached = AuthService.getStoredUser();
        return { user: null, unauthorized: Boolean(cached) };
      }
      const response = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
        __authValidation: true,
        __skipRetry: true
      } as any);
      const payload = extractData<any>(response);
      const candidateUser =
        payload?.user ||
        payload?.data?.user ||
        (payload && typeof payload === 'object' && payload.id ? payload : null);
      const user = normalizeUser(candidateUser);
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
      }
      return { user, unauthorized: false };
    } catch (error: any) {
      // If the token is invalid, let callers handle logout. Otherwise, fall back
      // to any cached user so we don't bounce users due to transient failures.
      if (error?.response?.status === 401) {
        return { user: null, unauthorized: true };
      }
      const cached = AuthService.getStoredUser();
      return { user: cached, unauthorized: false };
    }
  }

  static async getCurrentUser(): Promise<User | null> {
    const { user } = await AuthService.getCurrentUserWithStatus();
    return user;
  }

  static async getFollowOnboarding(): Promise<FollowOnboardingResponse> {
    const response = await api.get('/auth/follow-onboarding');
    const payload = extractData<FollowOnboardingResponse>(response) || {};
    const user = normalizeUser(payload.user);
    if (user) {
      try {
        localStorage.setItem('user', JSON.stringify(user));
      } catch {}
    }
    return {
      ...payload,
      user
    };
  }

  static async completeFollowOnboarding(): Promise<FollowOnboardingResponse> {
    const response = await api.post('/auth/follow-onboarding/complete');
    const payload = extractData<FollowOnboardingResponse>(response) || {};
    const user = normalizeUser(payload.user);
    if (user) {
      try {
        localStorage.setItem('user', JSON.stringify(user));
      } catch {}
    }
    return {
      ...payload,
      user
    };
  }

  static async logout() {
    try {
      await api.post('/auth/logout', undefined, {
        timeout: 6000,
        __skipRetry: true
      } as any);
    } catch {
      // Ignore logout errors
    } finally {
      await AuthService.clearToken();
    }
  }

  static async setToken(token: string) {
    if (!token) return;
    await tokenStore.set(token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  }

  static async clearToken() {
    await tokenStore.clear();
    delete api.defaults.headers.common.Authorization;
    try {
      localStorage.removeItem('user');
    } catch {}
  }

  static async getToken() {
    return tokenStore.get();
  }

  static getStoredUser(): User | null {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
      const user = JSON.parse(userStr);
      return normalizeUser(user);
    } catch {
      return null;
    }
  }
}

export { AuthService };
