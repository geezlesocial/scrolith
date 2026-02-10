import { Capacitor } from '@capacitor/core';
import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';

export const BIOMETRIC_PREF_KEY = 'Scrolith.pref.biometric.enabled';

export const isNativePlatform = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export const getBiometricPreference = () =>
  typeof localStorage !== 'undefined' && localStorage.getItem(BIOMETRIC_PREF_KEY) === 'true';

export const setBiometricPreference = (enabled: boolean) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(BIOMETRIC_PREF_KEY, enabled ? 'true' : 'false');
};

const normalizeBiometryType = (value: unknown) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    return BiometryType[value] ?? String(value);
  }
  return String(value);
};

export const getBiometryLabel = (value: unknown) => {
  const normalized = normalizeBiometryType(value).toLowerCase();
  if (normalized.includes('face')) return 'Face ID';
  if (normalized.includes('touch')) return 'Touch ID';
  if (normalized.includes('finger')) return 'Fingerprint';
  if (normalized.includes('iris')) return 'Iris';
  return 'Biometric';
};

export const checkBiometrics = async () => {
  if (!isNativePlatform()) {
    return { available: false, biometryType: '' };
  }
  try {
    const result = await BiometricAuth.checkBiometry();
    return {
      available: Boolean(result?.isAvailable),
      biometryType: result?.biometryType ?? ''
    };
  } catch (error) {
    console.error('Biometric check failed', error);
    return { available: false, biometryType: '' };
  }
};

export const authenticateBiometrics = async (reason = 'Unlock Scrolith') => {
  if (!isNativePlatform()) {
    return { ok: false, error: 'Not running on a native platform.' };
  }
  try {
    await BiometricAuth.authenticate({ reason });
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Authentication failed.' };
  }
};

