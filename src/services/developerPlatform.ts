import api from './api';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const extractErrorMessage = (error: any, fallback: string) => {
  const payload = error?.response?.data || {};
  const candidates = [
    payload?.error,
    payload?.message,
    payload?.data?.error,
    payload?.data?.message,
    error?.message
  ];
  const picked = candidates.find((value) => typeof value === 'string' && value.trim());
  return String(picked || fallback || 'Request failed');
};

export const DeveloperPlatformService = {
  getMe: async () => {
    try {
      const response = await api.get('/dev/me');
      return extractData<any>(response);
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to load developer profile.'));
    }
  },

  requestLink: async (payload: { lookupType: 'EMAIL' | 'USERNAME'; lookupValue: string; verificationMethod?: 'SCROLITH_LOGIN_CONFIRM' | 'EMAIL_OTP' }) => {
    try {
      const response = await api.post('/dev/link/request', payload);
      return extractData<any>(response);
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to create link request.'));
    }
  },

  verifyOtp: async (payload: { linkRequestId: string; otp: string }) => {
    try {
      const response = await api.post('/dev/link/verify-otp', payload);
      return extractData<any>(response);
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to verify OTP.'));
    }
  },

  confirmScrolithLogin: async (payload: { linkRequestId: string }) => {
    try {
      const response = await api.post('/dev/link/confirm-scrolith-login', payload);
      return extractData<any>(response);
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to confirm link.'));
    }
  },

  getApps: async () => {
    try {
      const response = await api.get('/dev/apps');
      return extractData<any[]>(response) || [];
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to load apps.'));
    }
  },

  createApp: async (payload: any) => {
    try {
      const response = await api.post('/dev/apps', payload);
      return extractData<any>(response);
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to create app.'));
    }
  },

  rotateSecret: async (appId: string) => {
    try {
      const response = await api.post(`/dev/apps/${encodeURIComponent(appId)}/rotate-secret`, {});
      return extractData<any>(response);
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to rotate secret.'));
    }
  },

  disableApp: async (appId: string) => {
    try {
      const response = await api.post(`/dev/apps/${encodeURIComponent(appId)}/disable`, {});
      return extractData<any>(response);
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to disable app.'));
    }
  },

  enableApp: async (appId: string) => {
    try {
      const response = await api.post(`/dev/apps/${encodeURIComponent(appId)}/enable`, {});
      return extractData<any>(response);
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to enable app.'));
    }
  },

  getAppLogs: async (appId: string) => {
    try {
      const response = await api.get(`/dev/apps/${encodeURIComponent(appId)}/logs`);
      return extractData<any[]>(response) || [];
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to load app logs.'));
    }
  },

  getAdminConfig: async () => {
    try {
      const response = await api.get('/admin/dev/config');
      return extractData<any>(response);
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to load developer config.'));
    }
  },

  updateAdminConfig: async (payload: any) => {
    try {
      const response = await api.put('/admin/dev/config', payload);
      return extractData<any>(response);
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to update developer config.'));
    }
  },

  getAdminApps: async (status?: string) => {
    try {
      const response = await api.get('/admin/dev/apps', {
        params: status ? { status } : undefined
      });
      return extractData<any[]>(response) || [];
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to load developer apps.'));
    }
  },

  approveAdminApp: async (appId: string) => {
    try {
      const response = await api.post(`/admin/dev/apps/${encodeURIComponent(appId)}/approve`, {});
      return extractData<any>(response);
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to approve app.'));
    }
  },

  rejectAdminApp: async (appId: string) => {
    try {
      const response = await api.post(`/admin/dev/apps/${encodeURIComponent(appId)}/reject`, {});
      return extractData<any>(response);
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to reject app.'));
    }
  },

  disableAdminApp: async (appId: string) => {
    try {
      const response = await api.post(`/admin/dev/apps/${encodeURIComponent(appId)}/disable`, {});
      return extractData<any>(response);
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to disable app.'));
    }
  },

  getAdminDevelopers: async () => {
    try {
      const response = await api.get('/admin/dev/developers');
      return extractData<any[]>(response) || [];
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to load developers.'));
    }
  },

  suspendDeveloper: async (developerId: string) => {
    try {
      const response = await api.post(`/admin/dev/developers/${encodeURIComponent(developerId)}/suspend`, {});
      return extractData<any>(response);
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to suspend developer.'));
    }
  },

  unsuspendDeveloper: async (developerId: string) => {
    try {
      const response = await api.post(`/admin/dev/developers/${encodeURIComponent(developerId)}/unsuspend`, {});
      return extractData<any>(response);
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, 'Failed to unsuspend developer.'));
    }
  }
};
