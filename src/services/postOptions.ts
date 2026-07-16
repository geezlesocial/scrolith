import api from './api';

type ApiResponse<T = any> = {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
};

export type PostCollectionSummary = {
  id: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  postCount: number;
  isSelected: boolean;
  createdAt: string;
  updatedAt: string;
};

export const postOptionsApi = {
  save: async (
    postId: string,
    payload?: { collectionId?: string; collectionName?: string; collectionDescription?: string }
  ) => {
    const res = await api.post(`/posts/${encodeURIComponent(postId)}/save`, payload || {});
    return res.data as ApiResponse<{
      saved: boolean;
      favoriteId?: string;
      collectionId?: string;
      collectionName?: string;
      savedCollections?: PostCollectionSummary[];
    }>;
  },
  unsave: async (postId: string) => {
    const res = await api.post(`/posts/${encodeURIComponent(postId)}/unsave`);
    return res.data as ApiResponse<{ saved: boolean }>;
  },
  hide: async (postId: string) => {
    const res = await api.post(`/posts/${encodeURIComponent(postId)}/hide`);
    return res.data as ApiResponse<{ hidden: boolean }>;
  },
  interested: async (postId: string, payload?: { surface?: string }) => {
    const res = await api.post(`/posts/${encodeURIComponent(postId)}/interested`, payload || {});
    return res.data as ApiResponse<{ signal: string }>;
  },
  notInterested: async (postId: string, payload?: { surface?: string }) => {
    const res = await api.post(`/posts/${encodeURIComponent(postId)}/not-interested`, payload || {});
    return res.data as ApiResponse<{ signal: string; hidden?: boolean }>;
  },
  report: async (postId: string, payload?: { reason?: string; details?: string }) => {
    const res = await api.post(`/community/posts/${encodeURIComponent(postId)}/report`, payload || {});
    return res.data as ApiResponse<{ reportId: string; status: string }>;
  },
  followAuthor: async (postId: string) => {
    const res = await api.post(`/posts/${encodeURIComponent(postId)}/follow-author`);
    return res.data as ApiResponse<{ isFollowing: boolean; targetType: string; targetId: string }>;
  },
  unfollowAuthor: async (postId: string) => {
    const res = await api.post(`/posts/${encodeURIComponent(postId)}/unfollow-author`);
    return res.data as ApiResponse<{ isFollowing: boolean; targetType: string; targetId: string }>;
  },
  toggleNotifications: async (postId: string) => {
    const res = await api.post(`/posts/${encodeURIComponent(postId)}/toggle-notifications`);
    return res.data as ApiResponse<{ enabled: boolean; targetType: string; targetId: string }>;
  },
  optionsState: async (postId: string) => {
    const res = await api.get(`/posts/${encodeURIComponent(postId)}/options-state`);
    return res.data as ApiResponse<{
      isFollowingAuthor: boolean;
      saved: boolean;
      savedCollectionCount?: number;
      savedCollections?: PostCollectionSummary[];
      notificationsEnabled: boolean;
      isOwner?: boolean;
      isAdminOrMod?: boolean;
      targetType?: string;
      targetId?: string;
    }>;
  },
  listCollections: async (postId?: string) => {
    const query = postId ? `?postId=${encodeURIComponent(postId)}` : '';
    const res = await api.get(`/posts/collections${query}`);
    return res.data as ApiResponse<{
      collections: PostCollectionSummary[];
      postId?: string | null;
      defaultCollectionName?: string;
    }>;
  },
  createCollection: async (payload: { name: string; description?: string; isDefault?: boolean }) => {
    const res = await api.post('/posts/collections', payload);
    return res.data as ApiResponse<{
      collection: PostCollectionSummary;
      collections: PostCollectionSummary[];
    }>;
  },
  whyThisPost: async (postId: string) => {
    const res = await api.get(`/posts/${encodeURIComponent(postId)}/why-this-post`);
    return res.data as ApiResponse<{ primary: string; reasons: Array<{ id: string; label: string }> }>;
  },
};
