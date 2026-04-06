import api from './api';

type ApiResponse<T = any> = {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
};

export const postOptionsApi = {
  save: async (postId: string) => {
    const res = await api.post(`/posts/${encodeURIComponent(postId)}/save`);
    return res.data as ApiResponse<{ saved: boolean }>;
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
      notificationsEnabled: boolean;
      isOwner?: boolean;
      isAdminOrMod?: boolean;
      targetType?: string;
      targetId?: string;
    }>;
  },
  whyThisPost: async (postId: string) => {
    const res = await api.get(`/posts/${encodeURIComponent(postId)}/why-this-post`);
    return res.data as ApiResponse<{ primary: string; reasons: Array<{ id: string; label: string }> }>;
  },
};
