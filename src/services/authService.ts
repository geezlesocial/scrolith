import api from './api';
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
          localStorage.setItem('token', payload.token);
          localStorage.setItem('user', JSON.stringify(user));
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
          localStorage.setItem('token', payload.token);
          localStorage.setItem('user', JSON.stringify(user));
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
      const response = await api.get('/auth/me');
      const payload = extractData<AuthResponse>(response);
      const user = normalizeUser(payload?.user);
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
      }
      return user;
    } catch {
      return null;
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

  static clearToken() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  static getToken() {
    return localStorage.getItem('token');
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
