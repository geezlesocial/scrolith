import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { AuthService } from '../services/authService';
import { resolveAuthenticatedEntryPath } from '../utils/authRedirect';

interface UserContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  getAdminProfile: () => any;
  updateAdminProfile: (data: any) => void;
  login: (
    email: string,
    password: string,
    options?: UserLoginOptions
  ) => Promise<boolean>;
  logout: () => void;
  register: (
    email: string,
    name: string,
    password: string,
    role?: any,
    recaptchaToken?: string,
    humanVerificationToken?: string | null
  ) => Promise<boolean>;
  updateUser: (updates: any) => void;
  switchRole: () => void;
}

type LoginApprovalRequiredPayload = { id: string; approvalToken: string; expiresAt?: string | null };
type UserLoginOptions = {
  redirect?: boolean;
  humanVerificationToken?: string | null;
  onLoginApprovalRequired?: (approval: LoginApprovalRequiredPayload) => void;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

const AUTH_BOOTSTRAP_TIMEOUT_MS = 8000;
const MOBILE_POST_AUTH_TARGET_KEY = 'scrolith:mobile-post-auth-target';

const resolvePostAuthPath = (user: User | null) => {
  return resolveAuthenticatedEntryPath(user);
};

const redirectAfterAuth = (user: User | null) => {
  if (typeof window === 'undefined') return;
  const target = resolvePostAuthPath(user);
  try {
    window.sessionStorage.setItem(MOBILE_POST_AUTH_TARGET_KEY, target);
    window.localStorage.setItem(MOBILE_POST_AUTH_TARGET_KEY, target);
  } catch {
    // Session storage is best-effort; the direct redirect below is primary.
  }
  window.location.replace(new URL(target, window.location.origin).href);
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
  let timeoutId: number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = window.setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
};

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state with proper role recognition
  useEffect(() => {
    let mounted = true;
    
    const initAuth = async () => {
      try {
        if (window.location.search.includes('from=auth')) {
          const url = new URL(window.location.href);
          url.searchParams.delete('from');
          window.history.replaceState(null, '', url.pathname + url.search + url.hash);
          try {
            window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
          } catch {
            // Ignore popstate synthesis failures.
          }
        }
      } catch {}
      setIsLoading(true);
      
      try {
        const token = await AuthService.getToken();
        const cachedUser = token ? AuthService.getStoredUser() : null;

        if (!token) {
          await AuthService.clearToken();
          if (mounted) {
            setUser(null);
            setIsAuthenticated(false);
          }
          return;
        }

        if (cachedUser && mounted) {
          setUser(cachedUser);
          setIsAuthenticated(true);
        }

        const { user: me, unauthorized } = await withTimeout(
          AuthService.getCurrentUserWithStatus(),
          AUTH_BOOTSTRAP_TIMEOUT_MS,
          { user: cachedUser, unauthorized: false }
        );
        if (me && mounted) {
          setUser(me);
          setIsAuthenticated(true);
        } else if (unauthorized) {
          setUser(null);
          setIsAuthenticated(false);
          await AuthService.clearToken();
        } else if (cachedUser && mounted) {
          // Preserve cached session on transient backend/network issues.
          setUser(cachedUser);
          setIsAuthenticated(true);
        } else {
          setUser(null);
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        const cachedUser = AuthService.getStoredUser();
        if (cachedUser && mounted) {
          setUser(cachedUser);
          setIsAuthenticated(true);
        } else {
          setUser(null);
          setIsAuthenticated(false);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    
    initAuth();

    return () => {
      mounted = false;
    };
  }, []);

  // Get admin profile from localStorage
  const getAdminProfile = () => {
    try {
      const stored = localStorage.getItem('admin_profile');
      if (stored) {
        return JSON.parse(stored);
      }
      return {
        username: user?.username || user?.name || 'admin',
        email: user?.email || 'admin@Scrolith.com',
        password: '',
        avatar: user?.avatar || null
      };
    } catch (e) {
      console.error('Failed to get admin profile:', e);
      return {
        username: '',
        email: '',
        password: '',
        avatar: null
      };
    }
  };

  // Update admin profile in localStorage
  const updateAdminProfile = (data: any) => {
    const currentProfile = getAdminProfile();
    const updatedProfile = { ...currentProfile, ...data };
    
    localStorage.setItem('admin_profile', JSON.stringify(updatedProfile));
    
    // Update user state if user exists
    if (user) {
      setUser(prev => prev ? { ...prev, ...data } : null);
    }
    
    // Also update user context
    updateUser(data);
  };

  const login = async (
    email: string,
    password: string,
    options?: UserLoginOptions
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      const result = await AuthService.login({
        email,
        password,
        humanVerificationToken: options?.humanVerificationToken || undefined
      });
      if (result.requiresLoginApproval && result.loginApproval?.id) {
        const approval: LoginApprovalRequiredPayload = {
          id: String(result.loginApproval.id),
          approvalToken: String(result.loginApproval.approvalToken || ''),
          expiresAt: result.loginApproval.expiresAt ? String(result.loginApproval.expiresAt) : null
        };
        if (options?.onLoginApprovalRequired && approval.approvalToken) {
          options.onLoginApprovalRequired(approval);
          return false;
        }
        throw new Error(result.error || 'Approve this login from an existing trusted session.');
      }
      
      if (result.success && result.user) {
        // CRITICAL: Ensure admin role is recognized (initial best-effort from login payload)
        const r = (result.user.role || '').toString().toLowerCase();
        let userWithRole: User = {
          ...result.user,
          role: r.includes('admin') ? UserRole.ADMIN : r.includes('freelancer') || r.includes('seller') ? UserRole.FREELANCER : r.includes('employer') || r.includes('client') ? UserRole.EMPLOYER : (result.user.email?.toLowerCase().includes('admin') ? UserRole.ADMIN : UserRole.GUEST)
        };

        // Persist initial user so subsequent calls (and page reloads) see a user
        try {
          localStorage.setItem('user', JSON.stringify(userWithRole));
        } catch (e) {
          console.warn('Failed to persist user to localStorage on login:', e);
        }

        // Fallback: fetch authoritative user data from /api/auth/me to obtain a reliable role
        try {
          const me = await AuthService.getCurrentUser();
          if (me && me.role) {
            const mr = me.role.toString().toLowerCase();
            const authoritativeRole = mr.includes('admin') ? UserRole.ADMIN : mr.includes('freelancer') || mr.includes('seller') ? UserRole.FREELANCER : mr.includes('employer') || mr.includes('client') ? UserRole.EMPLOYER : userWithRole.role;
            userWithRole = { ...userWithRole, ...me, role: authoritativeRole };
            try {
              localStorage.setItem('user', JSON.stringify(userWithRole));
            } catch (e) {
              console.warn('Failed to persist authoritative user to localStorage:', e);
            }
          }
        } catch (meErr) {
          // If /me fails, continue with the login payload role
          console.warn('Failed to fetch /auth/me after login:', meErr);
        }

        setUser(userWithRole);
        setIsAuthenticated(true);

        // Initialize admin profile if not exists
        if (!localStorage.getItem('admin_profile')) {
          localStorage.setItem('admin_profile', JSON.stringify({
            username: userWithRole.username || userWithRole.name,
            email: userWithRole.email,
            password: '',
            avatar: userWithRole.avatar
          }));
        }

        if (options?.redirect !== false) {
          redirectAfterAuth(userWithRole);
        }
        return true;
      }
      const loginError = new Error(result.error || 'Invalid credentials') as Error & { code?: string };
      loginError.code = result.code;
      throw loginError;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    email: string,
    name: string,
    password: string,
    role?: any,
    recaptchaToken?: string,
    humanVerificationToken?: string | null
  ): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      const result = await AuthService.register({
        email,
        name,
        password,
        role,
        recaptchaToken,
        humanVerificationToken: humanVerificationToken || undefined
      });
      
      if (result.success && result.user) {
        const rr = (result.user.role || '').toString().toLowerCase();
        const userWithRole: User = {
          ...result.user,
          role: rr.includes('admin') ? UserRole.ADMIN : rr.includes('freelancer') || rr.includes('seller') ? UserRole.FREELANCER : rr.includes('employer') || rr.includes('client') ? UserRole.EMPLOYER : (result.user.email?.toLowerCase().includes('admin') ? UserRole.ADMIN : UserRole.GUEST)
        };
        
        setUser(userWithRole);
        setIsAuthenticated(true);
        
        // Initialize admin profile if not exists
        if (!localStorage.getItem('admin_profile')) {
          localStorage.setItem('admin_profile', JSON.stringify({
            username: userWithRole.username || userWithRole.name,
            email: userWithRole.email,
            password: '',
            avatar: userWithRole.avatar
          }));
        }
        
        // Do not auto-redirect here; let the caller (e.g., Signup page) handle navigation
        return true;
      }
      throw new Error(result.error || 'Signup failed');
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    try {
      localStorage.removeItem('admin_profile');
      localStorage.removeItem('user');
    } catch {}

    // Drop all private messaging media object URLs before navigation.
    void import('../services/messagingMedia')
      .then((mod) => {
        mod.revokeAllAuthenticatedMediaUrls();
      })
      .catch(() => {
        // best-effort
      });

    void AuthService.clearToken();
    void (async () => {
      try {
        const { unregisterPushNotifications } = await import('../mobile/push');
        await unregisterPushNotifications();
      } catch {}
      await AuthService.logout();
    })();

    window.location.assign('/auth/login');
  };

  const updateUser = (updates: Partial<User>) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  };

  const switchRole = () => {
    if (!user) return;
    // Prevent admins from using this toggle which is intended for freelancers/employers.
    // Admins should use explicit view-as navigation (admin header buttons) that do not mutate their true role.
    if (user.role === UserRole.ADMIN) {
      console.warn('switchRole() called for admin user — operation ignored. Use view-as links instead.');
      return;
    }

    const newRole = user.role === UserRole.FREELANCER ? UserRole.EMPLOYER : UserRole.FREELANCER;

    // Update user in state
    const updatedUser = { ...user, role: newRole };
    setUser(updatedUser);

    // Update localStorage
    localStorage.setItem('user', JSON.stringify(updatedUser));
    try {
      sessionStorage.setItem('activeRole', String(newRole));
    } catch {}

    redirectAfterAuth(updatedUser);
  };

  return (
    <UserContext.Provider value={{
      user,
      isAuthenticated,
      isLoading,
      getAdminProfile,
      updateAdminProfile,
      login,
      logout,
      register,
      updateUser,
      switchRole
    }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

