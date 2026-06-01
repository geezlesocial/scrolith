import api from './api';

export type AppDistributionPlatform = 'all' | 'android' | 'desktop';
export type AppDistributionEvent =
  | 'prompt_shown'
  | 'prompt_dismissed'
  | 'download_clicked'
  | 'install_marked'
  | 'prompt_suppressed'
  | 'campaign_opened'
  | 'push_registration_error'
  | 'push_token_registered'
  | 'push_token_project_reset'
  | 'mobile_runtime_error'
  | 'chunk_load_recovery'
  | 'route_sync_recovery'
  | 'deep_link_opened'
  | 'deep_link_invalid'
  | 'push_permission_denied'
  | 'push_notification_received'
  | 'push_notification_opened'
  | 'push_notification_open_failed'
  | 'push_token_sync_failed'
  | 'socket_connect_error'
  | 'socket_reconnected'
  | 'app_backgrounded'
  | 'app_resumed'
  | 'deep_link_navigation_failed';

export type AppDistributionConfig = {
  enabled: boolean;
  autoHideSeconds: number;
  maxShowsPerDay: number;
  cooldownHours: number;
  branding: {
    title: string;
    subtitle: string;
    logoUrl: string;
    iconUrl: string;
  };
  android: {
    enabled: boolean;
    title: string;
    message: string;
    ctaLabel: string;
    secondaryCtaLabel: string;
    downloadUrl: string;
    version: string;
    iconUrl: string;
  };
  desktop: {
    enabled: boolean;
    title: string;
    message: string;
    ctaLabel: string;
    secondaryCtaLabel: string;
    downloadUrl: string;
    version: string;
    iconUrl: string;
  };
};

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export const AppDistributionService = {
  async getPublicConfig(): Promise<AppDistributionConfig | null> {
    try {
      const response = await api.get('/apps/config');
      return extractData<AppDistributionConfig>(response);
    } catch (error) {
      console.warn('Failed to load app distribution config', error);
      return null;
    }
  },

  async trackEvent(payload: {
    event: AppDistributionEvent;
    platform: AppDistributionPlatform;
    deviceCategory: AppDistributionPlatform;
    sessionId?: string;
    sourcePath?: string;
    details?: Record<string, any>;
  }) {
    try {
      await api.post('/apps/track', payload);
    } catch (error) {
      // Tracking is best-effort and should never break UX.
    }
  }
};

export default AppDistributionService;
