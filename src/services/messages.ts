import api from './api';

export const MessageService = {
  getConversations: async () => {
    const res = await api.get('/messages/conversations');
    return res.data?.data || [];
  },
  getConversation: async (id: string) => {
    const res = await api.get(`/messages/${id}`);
    return res.data?.data;
  }
};
