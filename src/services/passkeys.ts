import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/browser';
import api from './api';
import { tokenStore } from './tokenStore';
import type { User } from '../types';

export type PasskeyRecord = {
  id: string;
  label: string;
  deviceType?: string | null;
  backedUp?: boolean;
  transports?: string[];
  createdAt?: string;
  lastUsedAt?: string | null;
};

const isEnabled = () => String(import.meta.env.VITE_PASSKEYS_ENABLED || '').toLowerCase() === 'true';

const getPasskeyPlatform = (): 'web' | 'android' | 'ios' => {
  if (typeof window === 'undefined') return 'web';
  try {
    const capacitor = (window as any).Capacitor;
    if (typeof capacitor?.isNativePlatform === 'function' && capacitor.isNativePlatform()) {
      return capacitor.getPlatform?.() === 'ios' ? 'ios' : 'android';
    }
    if ((window as any).ScrolithNative?.getBridgeVersion) return 'android';
  } catch {
    // Browser fallback remains the safe default.
  }
  return 'web';
};

const unwrap = <T,>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  return response?.data as T;
};

const errorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;

export const passkeySupport = {
  enabled: isEnabled,
  available: () =>
    isEnabled() &&
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined',
};

export const PasskeyService = {
  async register(label: string, currentPassword?: string) {
    if (!passkeySupport.available()) throw new Error('Passkeys are not enabled on this device.');
    const optionsResponse = await api.post('/auth/passkeys/registration/options', {
      label: label.trim() || 'Scrolith passkey',
      currentPassword: currentPassword || undefined,
      platform: getPasskeyPlatform(),
    });
    const optionsPayload = {
      data: optionsResponse?.data?.data,
      challengeId: String(optionsResponse?.data?.challengeId || ''),
    };
    const credential: RegistrationResponseJSON = await startRegistration({
      optionsJSON: optionsPayload.data,
    });
    await api.post('/auth/passkeys/registration/verify', {
      challengeId: optionsPayload.challengeId,
      response: credential,
      label: label.trim() || 'Scrolith passkey',
      platform: 'web',
    });
    return true;
  },

  async authenticate(email?: string) {
    if (!passkeySupport.available()) throw new Error('Passkeys are not enabled on this device.');
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const optionsResponse = await api.post('/auth/passkeys/authentication/options', {
      platform: getPasskeyPlatform(),
      ...(normalizedEmail ? { email: normalizedEmail } : {})
    });
    const optionsPayload = {
      data: optionsResponse?.data?.data,
      challengeId: String(optionsResponse?.data?.challengeId || ''),
    };
    const credential: AuthenticationResponseJSON = await startAuthentication({
      optionsJSON: optionsPayload.data,
    });
    const verifiedResponse = await api.post('/auth/passkeys/authentication/verify', {
      challengeId: optionsPayload.challengeId,
      response: credential,
      platform: 'web',
    });
    const payload = verifiedResponse?.data || {};
    const user = payload?.user as User | undefined;
    const token = payload?.token || payload?.accessToken;
    if (!user || !token) throw new Error('Passkey sign-in did not return a valid session.');
    await tokenStore.set(token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    try {
      localStorage.setItem('user', JSON.stringify(user));
    } catch {
      // Storage may be unavailable in private browsing; the API session remains usable.
    }
    return { user, token };
  },

  async list() {
    const response = await api.get('/auth/passkeys');
    return unwrap<PasskeyRecord[]>(response) || [];
  },

  async rename(id: string, label: string) {
    await api.patch(`/auth/passkeys/${encodeURIComponent(id)}`, { label: label.trim() });
  },

  async revoke(id: string) {
    await api.delete(`/auth/passkeys/${encodeURIComponent(id)}`);
  },

  getErrorMessage(error: unknown, fallback = 'Passkey operation failed.') {
    const typedError = error as any;
    const name = String(typedError?.name || '').trim();
    if (name === 'NotAllowedError' || name === 'AbortError') {
      return 'No matching Scrolith passkey was selected. If you have not added one yet, sign in with your password first, then open Settings > Passkeys to add this device.';
    }
    if (name === 'InvalidStateError') {
      return 'This device could not use the selected passkey. Try another passkey or add this device again from Settings > Passkeys.';
    }
    return errorMessage(error, fallback);
  },
};
