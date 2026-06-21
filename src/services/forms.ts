import api from './api';

export interface FormsConfig {
  gig?: Record<string, any>;
  job?: Record<string, any>;
  updatedAt?: string;
}

const extractData = <T>(response: any, fallback: T): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return fallback;
};

export const formsApi = {
  getConfig: async (): Promise<FormsConfig> => {
    const response = await api.get('/forms/config');
    return extractData<FormsConfig>(response, {});
  }
};

export default formsApi;
