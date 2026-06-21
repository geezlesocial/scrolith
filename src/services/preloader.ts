import api from './api';

export type PreloaderLoaderType = 'spinner' | 'progress' | 'logoPulse' | 'dots' | 'skeleton' | 'lottie';
export type PreloaderBackgroundType = 'solid' | 'gradient' | 'image';
export type PreloaderPosition = 'center' | 'bottom';
export type PreloaderStatus = 'active' | 'inactive' | 'draft';

export interface PreloaderConfig {
  id: string;
  name: string;
  status: PreloaderStatus;
  isActive: boolean;
  minDurationMs: number;
  maxDurationMs: number;
  showOnInitialLoad: boolean;
  showOnRouteChange: boolean;
  showOnApiLoading: boolean;
  headlineText?: string | null;
  subText?: string | null;
  loaderType: PreloaderLoaderType;
  logoFileId?: string | null;
  logoUrl?: string | null;
  backgroundFileId?: string | null;
  backgroundImageUrl?: string | null;
  backgroundType: PreloaderBackgroundType;
  backgroundColor: string;
  gradientFrom?: string | null;
  gradientTo?: string | null;
  overlayOpacity: number;
  blurPx: number;
  accentColor: string;
  textColor: string;
  animationSpeed: number;
  position: PreloaderPosition;
  customCss?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export const PreloaderService = {
  getActivePreloader: async (): Promise<PreloaderConfig> => {
    const response = await api.get('/public/preloader/active');
    return extractData<PreloaderConfig>(response);
  },

  adminListPreloaders: async (): Promise<PreloaderConfig[]> => {
    const response = await api.get('/admin/preloaders');
    return extractData<PreloaderConfig[]>(response) || [];
  },

  adminCreatePreloader: async (payload: Partial<PreloaderConfig>): Promise<PreloaderConfig> => {
    const response = await api.post('/admin/preloaders', payload);
    return extractData<PreloaderConfig>(response);
  },

  adminUpdatePreloader: async (id: string, payload: Partial<PreloaderConfig>): Promise<PreloaderConfig> => {
    const response = await api.put(`/admin/preloaders/${encodeURIComponent(id)}`, payload);
    return extractData<PreloaderConfig>(response);
  },

  adminActivatePreloader: async (id: string): Promise<PreloaderConfig> => {
    const response = await api.post(`/admin/preloaders/${encodeURIComponent(id)}/activate`);
    return extractData<PreloaderConfig>(response);
  },

  adminDeactivatePreloader: async (id: string): Promise<PreloaderConfig> => {
    const response = await api.post(`/admin/preloaders/${encodeURIComponent(id)}/deactivate`);
    return extractData<PreloaderConfig>(response);
  },

  adminDeletePreloader: async (id: string): Promise<void> => {
    await api.delete(`/admin/preloaders/${encodeURIComponent(id)}`);
  },
};

export default PreloaderService;
