import { Preferences } from '@capacitor/preferences';
import api from './api';

const DEVICE_ID_KEY = 'Scrolith.device.id';
const DEVICE_KEY_DB = 'ScrolithDeviceSecurity';
const DEVICE_KEY_STORE = 'keys';
const DEVICE_PRIVATE_KEY = 'device-private-key';

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

const bufferToBase64Url = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const openKeyDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DEVICE_KEY_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DEVICE_KEY_STORE)) {
        db.createObjectStore(DEVICE_KEY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open device key store'));
  });

const readPrivateKey = async () => {
  try {
    const db = await openKeyDb();
    return await new Promise<CryptoKey | null>((resolve, reject) => {
      const tx = db.transaction(DEVICE_KEY_STORE, 'readonly');
      const request = tx.objectStore(DEVICE_KEY_STORE).get(DEVICE_PRIVATE_KEY);
      request.onsuccess = () => resolve((request.result as CryptoKey) || null);
      request.onerror = () => reject(request.error || new Error('Unable to read device key'));
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  } catch {
    return null;
  }
};

const writePrivateKey = async (key: CryptoKey) => {
  const db = await openKeyDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DEVICE_KEY_STORE, 'readwrite');
    tx.objectStore(DEVICE_KEY_STORE).put(key, DEVICE_PRIVATE_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Unable to store device key'));
    };
  });
};

const getOrCreateDeviceKeyPair = async () => {
  if (!crypto?.subtle) return null;
  const existingPrivateKey = await readPrivateKey();
  if (existingPrivateKey) {
    return { privateKey: existingPrivateKey, publicKey: null as CryptoKey | null };
  }
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify']
  );
  await writePrivateKey(pair.privateKey);
  return { privateKey: pair.privateKey, publicKey: pair.publicKey };
};

const ensurePublicKey = async (privateKey: CryptoKey, generatedPublicKey: CryptoKey | null) => {
  if (!generatedPublicKey) {
    const cached = await readStorage(`${DEVICE_ID_KEY}.publicKey`);
    if (cached) return cached;
    return null;
  }
  const exported = await crypto.subtle.exportKey('jwk', generatedPublicKey);
  const serialized = JSON.stringify(exported);
  await writeStorage(`${DEVICE_ID_KEY}.publicKey`, serialized);
  return serialized;
};

const createPossessionProof = async (deviceId: string) => {
  try {
    const keyPair = await getOrCreateDeviceKeyPair();
    if (!keyPair) return { publicKey: null, possessionProof: null };
    const publicKey = await ensurePublicKey(keyPair.privateKey, keyPair.publicKey);
    if (!publicKey) return { publicKey: null, possessionProof: null };
    const timestamp = Date.now();
    const payload = `scrolith-device-proof:v1\n${deviceId}\n${timestamp}`;
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPair.privateKey,
      new TextEncoder().encode(payload)
    );
    return {
      publicKey,
      possessionProof: {
        algorithm: 'ECDSA_P256_SHA256',
        timestamp,
        signature: bufferToBase64Url(signature)
      }
    };
  } catch {
    return { publicKey: null, possessionProof: null };
  }
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
  const proof = await createPossessionProof(deviceId);
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
    ...(proof.publicKey ? { publicKey: proof.publicKey } : {}),
    ...(proof.possessionProof ? { possessionProof: proof.possessionProof } : {}),
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
