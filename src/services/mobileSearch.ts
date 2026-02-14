import api from './api';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export const mobileSearch = {
  async search(params: { q: string; type: string; limit?: number }) {
    const response = await api.get('/search', {
      params: {
        q: params.q,
        type: params.type,
        limit: params.limit
      }
    });
    return extractData<any[]>(response);
  }
};

