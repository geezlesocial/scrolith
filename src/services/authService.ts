import api from './api';
import { tokenStore } from './tokenStore';
import { User, UserRole } from '../types';
import { resolveAssetUrl } from '../utils/assetUrl';

type AuthResponse = { token?: string; user?: User; success?: boolean; error?: string };
type CurrentUserResult = { user: User | null; unauthorized: boolean };

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

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
  const rawAvatar = (user as any).avatar ?? (user as any).avatar_url ?? (user as any).avatarUrl ?? '';
  const avatar = rawAvatar ? resolveAssetUrl(String(rawAvatar)) : undefined;
  return {
    ...user,
    role: mapRole(user.role),
    ...(avatar ? { avatar, avatar_url: avatar, avatarUrl: avatar } : {})
  };
};

class AuthService {
  static async login(credentials: { email: string; password: string }) {
    try {
      const response = await api.post('/auth/login', credentials);
      const payload = extractData<AuthResponse>(response);
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
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Login failed';
      return { success: false, error: message };
    }
  }

  static async register(userData: any) {
    try {
      const response = await api.post('/auth/register', userData);
      const payload = extractData<AuthResponse>(response);
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
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Registration failed';
      return { success: false, error: message };
    }
  }

  static async getCurrentUserWithStatus(): Promise<CurrentUserResult> {
    try {
      const token = await tokenStore.get();
      const response = token
        ? await api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        : await api.get('/auth/me');
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

  static async logout() {
    try {
      await api.post('/auth/logout');
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
