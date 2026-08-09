import { Preferences } from '@capacitor/preferences';
import api from './api';

const DEVICE_ID_KEY = 'Scrolith.device.id';

const isNativeRuntime = () => {
  try {
    const runtime = (window as any)?.Capacitor;
    return Boolean(runtime?.isNativePlatform?.() || (runtime?.getPlatform?.() && runtime.getPlatform() !== 'web'));
  } catch {
    return false;
  }
};

const randomId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `sd_${crypto.randomUUID()}`;
    }
  } catch {
    // fallback below
  }
  return `sd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
};

const readStorage = async (key: string) => {
  if (isNativeRuntime()) {
    try {
      const { value } = await Preferences.get({ key });
      if (value) return value;
    } catch {
      // localStorage fallback below
    }
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = async (key: string, value: string) => {
  if (isNativeRuntime()) {
    try {
      await Preferences.set({ key, value });
    } catch {
      // localStorage fallback below
    }
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

export const getOrCreateDeviceId = async () => {
  const existing = await readStorage(DEVICE_ID_KEY);
  if (existing) return existing;
  const next = randomId();
  await writeStorage(DEVICE_ID_KEY, next);
  return next;
};

export const getDeviceMetadata = async () => {
  const deviceId = await getOrCreateDeviceId();
  const runtime = (window as any)?.Capacitor;
  const platform = (() => {
    try {
      return runtime?.getPlatform?.() || (isNativeRuntime() ? 'android' : 'web');
    } catch {
      return 'web';
    }
  })();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return {
    deviceId,
    platform,
    deviceType: isNativeRuntime() ? 'mobile_app' : 'browser',
    browserName: ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : 'Browser',
    deviceModel: isNativeRuntime() ? 'Android device' : 'Web browser',
    osVersion: ua.slice(0, 160),
    appVersion: import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_SCROLITH_VERSION || 'web',
    metadata: {
      native: isNativeRuntime(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    }
  };
};

const unwrap = (response: any) => response?.data?.data ?? response?.data ?? response;

export const DeviceSecurityService = {
  async overview() {
    return unwrap(await api.get('/security/overview'));
  },
  async updatePreferences(patch: { loginAlerts?: boolean }) {
    return unwrap(await api.put('/security/preferences', patch));
  },
  async registerCurrentDevice() {
    return unwrap(await api.post('/security/devices/register', { device: await getDeviceMetadata() }));
  },
  async revokeDevice(deviceId: string) {
    return unwrap(await api.delete(`/security/devices/${encodeURIComponent(deviceId)}`));
  },
  async listPendingApprovals() {
    const payload = unwrap(await api.get('/security/login-approvals/pending'));
    return payload?.pendingApprovals || [];
  },
  async approveLogin(attemptId: string) {
    return unwrap(await api.post(`/security/login-approvals/${encodeURIComponent(attemptId)}/approve`));
  },
  async rejectLogin(attemptId: string) {
    return unwrap(await api.post(`/security/login-approvals/${encodeURIComponent(attemptId)}/reject`));
  },
  async getApprovalStatus(attemptId: string, approvalToken: string) {
    return unwrap(
      await api.get(`/security/login-approvals/${encodeURIComponent(attemptId)}/status`, {
        params: { approvalToken },
        __skipRetry: true
      } as any)
    );
  },
  async exchangeApprovedLogin(attemptId: string, approvalToken: string) {
    return unwrap(
      await api.post(
        '/auth/login/approval/exchange',
        { attemptId, approvalToken, device: await getDeviceMetadata() },
        { __skipRetry: true } as any
      )
    );
  }
};
