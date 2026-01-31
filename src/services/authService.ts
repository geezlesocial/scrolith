import api from './api';
import { tokenStore } from './tokenStore';
import { User, UserRole } from '../types';

type AuthResponse = { token?: string; user?: User; success?: boolean; error?: string };

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
  return {
    ...user,
    role: mapRole(user.role)
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
          tokenStore.set(payload.token);
          // Ensure axios picks up the token even if storage is blocked/cleared.
          api.defaults.headers.common.Authorization = `Bearer ${payload.token}`;
          try {
            localStorage.setItem('user', JSON.stringify(user));
          } catch {}
          return { success: true, user, token: payload.token };
        }
      }
      return { success: false, error: payload?.error || 'Login failed' };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Login failed' };
    }
  }

  static async register(userData: any) {
    try {
      const response = await api.post('/auth/register', userData);
      const payload = extractData<AuthResponse>(response);
      if (payload?.token && payload?.user) {
        const user = normalizeUser(payload.user);
        if (user) {
          tokenStore.set(payload.token);
          api.defaults.headers.common.Authorization = `Bearer ${payload.token}`;
          try {
            localStorage.setItem('user', JSON.stringify(user));
          } catch {}
          return { success: true, user, token: payload.token };
        }
      }
      return { success: false, error: payload?.error || 'Registration failed' };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Registration failed' };
    }
  }

  static async getCurrentUser(): Promise<User | null> {
    try {
      const token = tokenStore.get();
      const response = token
        ? await api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        : await api.get('/auth/me');
      const payload = extractData<AuthResponse>(response);
      const user = normalizeUser(payload?.user);
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
      }
      return user;
    } catch (error: any) {
      // If the token is invalid, let callers handle logout. Otherwise, fall back
      // to any cached user so we don't bounce users due to transient failures.
      if (error?.response?.status === 401) {
        return null;
      }
      const cached = AuthService.getStoredUser();
      return cached;
    }
  }

  static async logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore logout errors
    } finally {
      AuthService.clearToken();
    }
  }

  static setToken(token: string) {
    if (!token) return;
    tokenStore.set(token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  }

  static clearToken() {
    tokenStore.clear();
    delete api.defaults.headers.common.Authorization;
    try {
      localStorage.removeItem('user');
    } catch {}
  }

  static getToken() {
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
