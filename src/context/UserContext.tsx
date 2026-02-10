
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { User, UserRole } from '../types';
import { GcoinService } from '../services/gcoin';

interface AdminCreds {
  email: string;
  password: string;
  username: string;
  avatar?: string;
}

const DEFAULT_ADMIN_CREDS: AdminCreds = {
  email: 'admin@scrolith.com',
  password: 'admin12345',
  username: 'admin'
};

interface UserContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, role: UserRole) => boolean;
  signup: (email: string, name: string, role: UserRole) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  switchRole: () => void; 
  updateAdminProfile: (creds: Partial<AdminCreds>) => void;
  getAdminProfile: () => AdminCreds;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getAdminCreds = useCallback((): AdminCreds => {
      const stored = localStorage.getItem('scrolith_admin_creds');
      return stored ? JSON.parse(stored) : DEFAULT_ADMIN_CREDS;
  }, []);

  useEffect(() => {
      if (!localStorage.getItem('scrolith_admin_creds')) {
          localStorage.setItem('scrolith_admin_creds', JSON.stringify(DEFAULT_ADMIN_CREDS));
      }
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser(prev => {
        if (!prev) return null;
        const updated = { ...prev, ...updates };
        localStorage.setItem('scrolith_user', JSON.stringify(updated));
        return updated;
    });
  }, []);

  const initWallet = useCallback(async (userId: string) => {
      try {
          const wallet = await GcoinService.getWallet(userId);
          updateUser({ gcoinBalance: wallet.balance });
      } catch (e) {
          // ignore
      }
  }, [updateUser]);

  const login = useCallback((email: string, password: string, role: UserRole): boolean => {
    if (role === UserRole.ADMIN) {
        const creds = getAdminCreds();
        if (email.toLowerCase() === creds.email.toLowerCase() && password === creds.password) {
             const adminUser: User = {
                id: 'admin-1',
                name: creds.username,
                email: creds.email,
                role: UserRole.ADMIN,
                avatar: creds.avatar || `https://ui-avatars.com/api/?name=${creds.username}&background=000&color=fff`,
                kycStatus: 'approved',
                gcoinBalance: 0
            };
            setUser(adminUser);
            localStorage.setItem('scrolith_user', JSON.stringify(adminUser));
            initWallet(adminUser.id);
            return true;
        }
        return false;
    }

    const storedUser = localStorage.getItem('scrolith_user');
    let userToSet: User;

    if (storedUser) {
        const parsed = JSON.parse(storedUser);
        if (parsed.email === email && parsed.role !== UserRole.ADMIN) {
            userToSet = parsed;
        } else {
            userToSet = createMockUser(email, role);
        }
    } else {
        userToSet = createMockUser(email, role);
    }

    userToSet.role = role; 
    setUser(userToSet);
    localStorage.setItem('scrolith_user', JSON.stringify(userToSet));
    initWallet(userToSet.id);
    return true;
  }, [initWallet, getAdminCreds]);

  const createMockUser = (email: string, role: UserRole): User => ({
      id: 'u1',
      name: email.split('@')[0] || 'User',
      email,
      role,
      avatar: `https://ui-avatars.com/api/?name=${email.split('@')[0]}&background=0D8ABC&color=fff`,
      kycStatus: 'approved',
      gcoinBalance: 0
  });

  const signup = useCallback((email: string, name: string, role: UserRole) => {
      const newUser: User = {
          id: Math.random().toString(36).substr(2, 9),
          name: name,
          email: email,
          role: role,
          avatar: `https://ui-avatars.com/api/?name=${name.replace(' ', '+')}&background=random`,
          kycStatus: 'none', 
          joinDate: new Date().toISOString(),
          gcoinBalance: 0
      };
      setUser(newUser);
      localStorage.setItem('scrolith_user', JSON.stringify(newUser));
      initWallet(newUser.id);
  }, [initWallet]);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('scrolith_user');
  }, []);

  const switchRole = useCallback(() => {
      setUser(prev => {
          if (!prev || prev.role === UserRole.ADMIN) return prev;
          const newRole = prev.role === UserRole.FREELANCER ? UserRole.EMPLOYER : UserRole.FREELANCER;
          const updated = { ...prev, role: newRole };
          localStorage.setItem('scrolith_user', JSON.stringify(updated));
          return updated;
      });
  }, []);

  const updateAdminProfile = useCallback((updates: Partial<AdminCreds>) => {
      const current = getAdminCreds();
      const newCreds = { ...current, ...updates };
      localStorage.setItem('scrolith_admin_creds', JSON.stringify(newCreds));
      
      setUser(prev => {
          if (prev?.role === UserRole.ADMIN) {
            const userUpdates: Partial<User> = {};
            if (updates.username) userUpdates.name = updates.username;
            if (updates.email) userUpdates.email = updates.email;
            if (updates.avatar) userUpdates.avatar = updates.avatar;
            if (Object.keys(userUpdates).length > 0) {
                 return { ...prev, ...userUpdates };
            }
          }
          return prev;
      });
  }, [getAdminCreds]);

  useEffect(() => {
    const initAuth = async () => {
        const stored = localStorage.getItem('scrolith_user');
        if (stored) {
          try {
            const u = JSON.parse(stored);
            setUser(u);
            await initWallet(u.id);
          } catch (e) {
             // ignore
          }
        }
        setIsLoading(false);
    };
    initAuth();
  }, [initWallet]);

  const value = useMemo(() => ({
      user, 
      isAuthenticated: !!user,
      isLoading,
      login, 
      signup, 
      logout, 
      updateUser,
      switchRole,
      updateAdminProfile,
      getAdminProfile: getAdminCreds
  }), [user, isLoading, login, signup, logout, updateUser, switchRole, updateAdminProfile, getAdminCreds]);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within UserProvider');
  return context;
};
