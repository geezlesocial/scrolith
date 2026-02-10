import api from './api';

export type ReactionTargetType = 'POST' | 'COMMENT' | 'MESSAGE';

export type ReactionSummaryResponse = {
  targetType: ReactionTargetType;
  targetId: string;
  counts: Record<string, number>;
  userReaction: string | null;
  allowed?: { key: string; label: string; emoji: string; enabled?: boolean }[];
};

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export const ReactionsService = {
  async react(targetType: ReactionTargetType, targetId: string, reactionKey: string) {
    const response = await api.post('/reactions', { targetType, targetId, reactionKey });
    return extractData<ReactionSummaryResponse>(response);
  },

  async getSummary(targetType: ReactionTargetType, targetId: string) {
    const response = await api.get('/reactions/summary', { params: { targetType, targetId } });
    return extractData<ReactionSummaryResponse>(response);
  },

  async getSummaryBulk(targetType: ReactionTargetType, targetIds: string[]) {
    const response = await api.post('/reactions/summary/bulk', { targetType, targetIds });
    return extractData<Record<string, { counts: Record<string, number>; userReaction: string | null }>>(response);
  },

  async getUsers(targetType: ReactionTargetType, targetId: string, reactionKey: string) {
    const response = await api.get('/reactions/users', { params: { targetType, targetId, reactionKey } });
    return extractData<
      Array<{ userId: string; name: string; username?: string | null; avatar?: string | null; reactionKey: string; reactedAt: string }>
    >(response);
  }
};

