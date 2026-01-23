import api from './api';

export type FavoriteEntityType = 'gig' | 'job' | 'freelancer';

export interface FavoriteItem {
  entityType: FavoriteEntityType;
  entityId: string;
  createdAt?: string;
}

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export const FavoritesService = {
  getAll: async (): Promise<FavoriteItem[]> => {
    const res = await api.get('/favorites');
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

  getExpanded: async (): Promise<{ gigs: any[]; jobs: any[]; freelancers: any[] }> => {
    const res = await api.get('/favorites/expanded');
    const data = extractData<any>(res);
    return {
      gigs: Array.isArray(data?.gigs) ? data.gigs : [],
      jobs: Array.isArray(data?.jobs) ? data.jobs : [],
      freelancers: Array.isArray(data?.freelancers) ? data.freelancers : []
    };
  },

  getReceived: async (): Promise<{
    profileLikes: number;
    gigLikes: number;
    totalLikes: number;
    topGigs: Array<{ id: string; title: string; likes: number }>;
    recent: Array<{ entityType: FavoriteEntityType; entityId: string; createdAt: string }>;
  }> => {
    const res = await api.get('/favorites/received');
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
