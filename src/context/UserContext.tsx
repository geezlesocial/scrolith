import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { AuthService } from '../services/authService';

interface UserContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  getAdminProfile: () => any;
  updateAdminProfile: (data: any) => void;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  register: (email: string, name: string, password: string, role?: any) => Promise<boolean>;
  updateUser: (updates: any) => void;
  switchRole: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state with proper role recognition
  useEffect(() => {
    let mounted = true;
    
    const initAuth = async () => {
      setIsLoading(true);
      
      try {
        const me = await AuthService.getCurrentUser();
        if (me && mounted) {
          setUser(me);
          setIsAuthenticated(true);

          const fromAuth = window.location.search.includes('from=auth');
          if (fromAuth && window.location.pathname === '/') {
            if (me.role === UserRole.ADMIN) {
              window.location.href = '/admin/dashboard';
            } else if (me.role === UserRole.FREELANCER) {
              window.location.href = '/freelancer/dashboard';
            } else if (me.role === UserRole.EMPLOYER) {
              window.location.href = '/client/dashboard';
            }
          }
        } else {
          setUser(null);
          setIsAuthenticated(false);
          AuthService.clearToken();
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        setUser(null);
        setIsAuthenticated(false);
        AuthService.clearToken();
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
        email: user?.email || 'admin@geezle.com',
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

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      const result = await AuthService.login({ email, password });
      
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

        // Redirect based on role - but only if they explicitly want to go to dashboard
        // Add a query parameter to indicate coming from login
        if (userWithRole.role === UserRole.ADMIN) {
          window.location.href = '/admin/dashboard?from=auth';
        } else if (userWithRole.role === UserRole.FREELANCER) {
          window.location.href = '/freelancer/dashboard?from=auth';
        } else if (userWithRole.role === UserRole.EMPLOYER) {
          window.location.href = '/client/dashboard?from=auth';
        } else {
          window.location.href = '/?from=auth';
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, name: string, password: string, role?: any): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      const result = await AuthService.register({ email, name, password, role });
      
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
      return false;
    } catch (error) {
      console.error('Registration error:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    AuthService.logout();
    // Update React state after logout
    setUser(null);
    setIsAuthenticated(false);
    // Clear admin profile
    localStorage.removeItem('admin_profile');
    // Redirect to login page
    window.location.href = '/auth/login';
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

    // Redirect to appropriate dashboard
    if (newRole === UserRole.FREELANCER) {
      window.location.href = '/freelancer/dashboard';
    } else if (newRole === UserRole.EMPLOYER) {
      window.location.href = '/client/dashboard';
    }
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
