
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  FAVORITES_RATE_LIMIT_MESSAGE,
  FavoritesService,
  FavoriteEntityType,
  FavoriteItem,
  getFavoritesRetryAfterMs,
  isFavoritesRateLimitedError
} from '../services/favorites';
import { useUser } from './UserContext';
import { useNotification } from './NotificationContext';
import { useSocket } from './SocketContext';

interface RefreshFavoritesOptions {
  force?: boolean;
  silent?: boolean;
}

interface FavoritesContextType {
  favorites: FavoriteItem[];
  toggleFavorite: (entityType: FavoriteEntityType, entityId: string) => Promise<void>;
  isFavorite: (entityType: FavoriteEntityType, entityId: string) => boolean;
  refreshFavorites: (options?: RefreshFavoritesOptions) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);
const FAVORITES_STALE_MS = 5 * 60 * 1000;
const FAVORITES_RATE_LIMIT_NOTICE_MS = 60 * 1000;

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useUser();
  const { showNotification } = useNotification();
  const { socket } = useSocket();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const lastLoadedAtRef = useRef(0);
  const lastRateLimitNoticeAtRef = useRef(0);
  const retryAfterUntilRef = useRef(0);
  const eventRefreshTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const canLoadFavorites = isAuthenticated && Boolean(user?.id);

  const refreshFavorites = useCallback(async (options: RefreshFavoritesOptions = {}) => {
    const { force = false, silent = false } = options;

    if (!canLoadFavorites) {
      setFavorites([]);
      setLoaded(true);
      lastLoadedAtRef.current = 0;
      retryAfterUntilRef.current = 0;
      return;
    }

    const now = Date.now();
    if (!force && lastLoadedAtRef.current && now - lastLoadedAtRef.current < FAVORITES_STALE_MS) {
      setLoaded(true);
      return;
    }

    if (!force && retryAfterUntilRef.current > now) {
      setLoaded(true);
      return;
    }

    if (inFlightRef.current) {
      await inFlightRef.current;
      return;
    }

    const request = (async () => {
      try {
        const data = await FavoritesService.getAll();
        setFavorites(data);
        lastLoadedAtRef.current = Date.now();
        retryAfterUntilRef.current = 0;
      } catch (error: any) {
        if (isFavoritesRateLimitedError(error)) {
          const retryAfterMs = getFavoritesRetryAfterMs(error) || FAVORITES_RATE_LIMIT_NOTICE_MS;
          retryAfterUntilRef.current = Date.now() + retryAfterMs;

          if (!silent && Date.now() - lastRateLimitNoticeAtRef.current > FAVORITES_RATE_LIMIT_NOTICE_MS) {
            lastRateLimitNoticeAtRef.current = Date.now();
            showNotification('warning', 'Favorites Unavailable', FAVORITES_RATE_LIMIT_MESSAGE);
          }
          return;
        }

        if (!silent) {
          showNotification('error', 'Favorites Load Failed', error?.message || 'Unable to load favorites.');
        }
      } finally {
        setLoaded(true);
      }
    })();

    inFlightRef.current = request;

    try {
      await request;
    } finally {
      if (inFlightRef.current === request) {
        inFlightRef.current = null;
      }
    }
  }, [canLoadFavorites, showNotification]);

  useEffect(() => {
    if (!canLoadFavorites) {
      setFavorites([]);
      setLoaded(true);
      lastLoadedAtRef.current = 0;
      retryAfterUntilRef.current = 0;
      return;
    }

    setLoaded(false);
    lastLoadedAtRef.current = 0;
    retryAfterUntilRef.current = 0;
    refreshFavorites({ force: true, silent: true }).catch(() => null);
  }, [canLoadFavorites, user?.id, refreshFavorites]);

  useEffect(() => {
    if (!loaded) return;
    if (!canLoadFavorites) {
      setFavorites([]);
    }
  }, [canLoadFavorites, loaded]);

  useEffect(() => {
    if (!socket || !canLoadFavorites) return;
    const onFavoritesUpdated = () => {
      refreshFavorites({ force: true, silent: true }).catch(() => null);
    };
    socket.on('favorites:updated', onFavoritesUpdated);
    return () => {
      socket.off('favorites:updated', onFavoritesUpdated);
    };
  }, [socket, canLoadFavorites, refreshFavorites]);

  useEffect(() => {
    if (!canLoadFavorites) return;

    const onFavoritesUpdated = () => {
      if (eventRefreshTimeoutRef.current) {
        window.clearTimeout(eventRefreshTimeoutRef.current);
      }
      eventRefreshTimeoutRef.current = window.setTimeout(() => {
        refreshFavorites({ force: true, silent: true }).catch(() => null);
      }, 250);
    };

    window.addEventListener('favorites:updated', onFavoritesUpdated as EventListener);
    return () => {
      if (eventRefreshTimeoutRef.current) {
        window.clearTimeout(eventRefreshTimeoutRef.current);
        eventRefreshTimeoutRef.current = null;
      }
      window.removeEventListener('favorites:updated', onFavoritesUpdated as EventListener);
    };
  }, [canLoadFavorites, refreshFavorites]);

  const isFavorite = useCallback(
    (entityType: FavoriteEntityType, entityId: string) =>
      favorites.some((f) => f.entityType === entityType && f.entityId === entityId),
    [favorites]
  );

  const toggleFavorite = useCallback(async (entityType: FavoriteEntityType, entityId: string) => {
    if (!canLoadFavorites) {
      throw new Error('Please sign in to manage favorites.');
    }

    const previousFavorites = favorites;
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
      lastLoadedAtRef.current = Date.now();
    } catch (error) {
      setFavorites(previousFavorites);
      throw error;
    }
  }, [canLoadFavorites, favorites, isFavorite]);

  const value = useMemo(
    () => ({
      favorites,
      toggleFavorite,
      isFavorite,
      refreshFavorites
    }),
    [favorites, toggleFavorite, isFavorite, refreshFavorites]
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
