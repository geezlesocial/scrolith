import api from './api';

export type ReviewStatus = 'pending' | 'published' | 'hidden' | 'removed' | 'flagged';

export type Review = {
  id: string;
  rating: number;
  title?: string | null;
  comment?: string | null;
  orderId?: string | null;
  gigId?: string | null;
  authorId?: string | null;
  subjectId?: string | null;
  status: ReviewStatus;
  createdAt?: string;
  updatedAt?: string;
  editedAt?: string | null;
  publishedAt?: string | null;
  author?: {
    id: string;
    name: string;
    avatar?: string | null;
  };
};

export type PendingReview = {
  orderId: string;
  gigId?: string | null;
  gigTitle?: string;
  amount?: number | null;
  completedAt?: string | null;
};

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const normalizeReview = (review: any): Review => ({
  id: review.id,
  rating: review.rating,
  title: review.title ?? null,
  comment: review.comment ?? null,
  orderId: review.order_id ?? review.orderId ?? null,
  gigId: review.gig_id ?? review.gigId ?? null,
  authorId: review.author_id ?? review.authorId ?? null,
  subjectId: review.subject_id ?? review.subjectId ?? null,
  status: (review.status ?? 'pending').toLowerCase(),
  createdAt: review.created_at ?? review.createdAt,
  updatedAt: review.updated_at ?? review.updatedAt,
  editedAt: review.edited_at ?? review.editedAt ?? null,
  publishedAt: review.published_at ?? review.publishedAt ?? null,
  author: review.author
    ? {
        id: review.author.id,
        name: review.author.name,
        avatar: review.author.avatar
      }
    : undefined
});

const normalizePending = (item: any): PendingReview => ({
  orderId: item.order_id ?? item.orderId,
  gigId: item.gig_id ?? item.gigId ?? null,
  gigTitle: item.gig_title ?? item.gigTitle ?? '',
  amount: item.amount ?? null,
  completedAt: item.completed_at ?? item.completedAt ?? null
});

export const ReviewsService = {
  create: async (payload: { orderId: string; rating: number; title?: string; comment?: string }) => {
    const res = await api.post('/reviews', {
      order_id: payload.orderId,
      rating: payload.rating,
      title: payload.title,
      comment: payload.comment
    });
    return normalizeReview(extractData<any>(res));
  },

  listForUser: async (userId: string): Promise<Review[]> => {
    const res = await api.get(`/reviews/users/${userId}`);
    const data = extractData<any[]>(res);
    return Array.isArray(data) ? data.map(normalizeReview) : [];
  },

  listMine: async (): Promise<Review[]> => {
    const res = await api.get('/reviews/me');
    const data = extractData<any[]>(res);
    return Array.isArray(data) ? data.map(normalizeReview) : [];
  },

  listPending: async (): Promise<PendingReview[]> => {
    const res = await api.get('/reviews/me/pending');
    const data = extractData<any[]>(res);
    return Array.isArray(data) ? data.map(normalizePending) : [];
  },

  update: async (id: string, payload: { rating?: number; title?: string; comment?: string }) => {
    const res = await api.patch(`/reviews/${id}`, payload);
    return normalizeReview(extractData<any>(res));
  },

  adminList: async (params?: { status?: ReviewStatus }) => {
    const res = await api.get('/admin/reviews', { params });
    const data = extractData<any[]>(res);
    return Array.isArray(data) ? data.map(normalizeReview) : [];
  },

  adminUpdateStatus: async (id: string, status: ReviewStatus) => {
    const res = await api.patch(`/admin/reviews/${id}/status`, { status });
    return normalizeReview(extractData<any>(res));
  }
};
