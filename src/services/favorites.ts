import api from './api';

export type FavoriteEntityType = 'gig' | 'job' | 'freelancer' | 'marketplace';

export interface FavoriteItem {
  entityType: FavoriteEntityType;
  entityId: string;
  createdAt?: string;
}

export const FAVORITES_RATE_LIMIT_MESSAGE =
  'Favorites are temporarily unavailable. Please try again shortly.';

const MAX_RETRY_AFTER_MS = 5 * 60 * 1000;

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const favoritesReadConfig = () => ({ __skipRetry: true }) as any;

export const isFavoritesRateLimitedError = (error: any) => {
  const status = Number(error?.response?.status ?? error?.status ?? 0);
  return status === 429;
};

export const getFavoritesRetryAfterMs = (error: any) => {
  const headers = error?.response?.headers;
  const raw =
    (typeof headers?.get === 'function' ? headers.get('retry-after') : undefined) ??
    headers?.['retry-after'] ??
    headers?.['Retry-After'];

  if (!raw) return 0;

  const value = String(raw);
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }

  const retryDate = Date.parse(value);
  if (Number.isFinite(retryDate)) {
    return Math.max(0, Math.min(retryDate - Date.now(), MAX_RETRY_AFTER_MS));
  }

  return 0;
};

export const FavoritesService = {
  getAll: async (): Promise<FavoriteItem[]> => {
    const res = await api.get('/favorites', favoritesReadConfig());
    const data = extractData<any>(res);
    return Array.isArray(data)
      ? data.map((item: any) => ({
          entityType: item.entity_type ?? item.entityType,
          entityId: item.entity_id ?? item.entityId,
          createdAt: item.created_at ?? item.createdAt
        }))
      : [];
  },

  add: async (entityType: FavoriteEntityType, entityId: string) => {
    const res = await api.post('/favorites', { entity_type: entityType, entity_id: entityId });
    return extractData<any>(res);
  },

  remove: async (entityType: FavoriteEntityType, entityId: string) => {
    const res = await api.delete('/favorites', { data: { entity_type: entityType, entity_id: entityId } });
    return extractData<any>(res);
  },

  getExpanded: async (): Promise<{ gigs: any[]; jobs: any[]; freelancers: any[]; marketplace: any[] }> => {
    const res = await api.get('/favorites/expanded', favoritesReadConfig());
    const data = extractData<any>(res);
    return {
      gigs: Array.isArray(data?.gigs) ? data.gigs : [],
      jobs: Array.isArray(data?.jobs) ? data.jobs : [],
      freelancers: Array.isArray(data?.freelancers) ? data.freelancers : [],
      marketplace: Array.isArray(data?.marketplace) ? data.marketplace : []
    };
  },

  getReceived: async (): Promise<{
    profileLikes: number;
    gigLikes: number;
    totalLikes: number;
    topGigs: Array<{ id: string; title: string; likes: number }>;
    recent: Array<{ entityType: FavoriteEntityType; entityId: string; createdAt: string }>;
  }> => {
    const res = await api.get('/favorites/received', favoritesReadConfig());
    const data = extractData<any>(res);
    return {
      profileLikes: data?.profile_likes ?? data?.profileLikes ?? 0,
      gigLikes: data?.gig_likes ?? data?.gigLikes ?? 0,
      totalLikes: data?.total_likes ?? data?.totalLikes ?? 0,
      topGigs: Array.isArray(data?.top_gigs)
        ? data.top_gigs.map((item: any) => ({
            id: item.id ?? item.entity_id ?? '',
            title: item.title ?? 'Gig',
            likes: item.likes ?? item.count ?? 0
          }))
        : [],
      recent: Array.isArray(data?.recent)
        ? data.recent.map((item: any) => ({
            entityType: item.entity_type ?? item.entityType,
            entityId: item.entity_id ?? item.entityId,
            createdAt: item.created_at ?? item.createdAt
          }))
        : []
    };
  }
};
