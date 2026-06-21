import api from './api';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const EMPTY_UNIFIED = {
  query: '',
  groups: {
    people: [],
    pages: [],
    jobs: [],
    gigs: []
  },
  results: [],
  totals: {
    people: 0,
    pages: 0,
    jobs: 0,
    gigs: 0,
    total: 0
  }
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
  },

  async searchUnified(params: { q: string; limit?: number; perType?: number }) {
    const response = await api.get('/search/unified', {
      params: {
        q: params.q,
        limit: params.limit,
        perType: params.perType
      }
    });
    const data = extractData<any>(response);
    return data && typeof data === 'object' ? data : EMPTY_UNIFIED;
  }
};
