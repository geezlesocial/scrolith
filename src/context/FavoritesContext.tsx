
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { FavoritesService, FavoriteEntityType, FavoriteItem } from '../services/favorites';
import { useUser } from './UserContext';
import { useNotification } from './NotificationContext';

interface FavoritesContextType {
  favorites: FavoriteItem[];
  toggleFavorite: (entityType: FavoriteEntityType, entityId: string) => Promise<void>;
  isFavorite: (entityType: FavoriteEntityType, entityId: string) => boolean;
  refreshFavorites: () => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useUser();
  const { showNotification } = useNotification();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refreshFavorites = async () => {
    if (!isAuthenticated || !user) {
      setFavorites([]);
      setLoaded(true);
      return;
    }

    try {
      const data = await FavoritesService.getAll();
      setFavorites(data);
    } catch (error: any) {
      showNotification('error', 'Favorites Load Failed', error?.message || 'Unable to load favorites.');
      setFavorites([]);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    refreshFavorites();
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!loaded) return;
    if (!isAuthenticated) {
      setFavorites([]);
    }
  }, [isAuthenticated, loaded]);

  const isFavorite = (entityType: FavoriteEntityType, entityId: string) =>
    favorites.some((f) => f.entityType === entityType && f.entityId === entityId);

  const toggleFavorite = async (entityType: FavoriteEntityType, entityId: string) => {
    if (!isAuthenticated || !user) {
      throw new Error('Please sign in to manage favorites.');
    }

    const already = isFavorite(entityType, entityId);
    setFavorites((prev) => {
      if (already) {
        return prev.filter((f) => !(f.entityType === entityType && f.entityId === entityId));
      }
      return [...prev, { entityType, entityId, createdAt: new Date().toISOString() }];
    });

    try {
      if (already) {
        await FavoritesService.remove(entityType, entityId);
      } else {
        await FavoritesService.add(entityType, entityId);
      }
    } catch (error) {
      await refreshFavorites();
      throw error;
    }
  };

  const value = useMemo(
    () => ({
      favorites,
      toggleFavorite,
      isFavorite,
      refreshFavorites
    }),
    [favorites]
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites must be used within FavoritesProvider');
  return context;
};
