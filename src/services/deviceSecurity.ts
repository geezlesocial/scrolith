import { Preferences } from '@capacitor/preferences';
import api from './api';

const DEVICE_ID_KEY = 'Scrolith.device.id';
const DEVICE_KEY_DB = 'ScrolithDeviceSecurity';
const DEVICE_KEY_STORE = 'keys';
const DEVICE_PRIVATE_KEY = 'device-private-key';

const traceEnabled = () => Boolean(import.meta.env.DEV || String(import.meta.env.VITE_SECURITY_DEVICE_TRACE || '').toLowerCase() === 'true');

export const traceDeviceSecurity = (event: string, details: Record<string, boolean | string | undefined> = {}) => {
  if (traceEnabled()) console.info('[device-security]', { event, ...details });
};

const isNativeRuntime = () => {
  try {
    const runtime = (window as any)?.Capacitor;
    return Boolean(runtime?.isNativePlatform?.() || (runtime?.getPlatform?.() && runtime.getPlatform() !== 'web'));
  } catch {
    return false;
  }
};

const readStorage = async (key: string) => {
  if (isNativeRuntime()) {
    try {
      const { value } = await Preferences.get({ key });
      if (value) return value;
    } catch {}
  }
  try { return localStorage.getItem(key); } catch { return null; }
};

const writeStorage = async (key: string, value: string) => {
  if (isNativeRuntime()) {
    try { await Preferences.set({ key, value }); } catch {}
  }
  try { localStorage.setItem(key, value); } catch {}
};

const randomId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `sd_${crypto.randomUUID()}`;
  } catch {}
  return `sd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
};

const openKeyDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
  const request = indexedDB.open(DEVICE_KEY_DB, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(DEVICE_KEY_STORE)) request.result.createObjectStore(DEVICE_KEY_STORE);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Unable to open device key store'));
});

const readPrivateKey = async () => {
  try {
    const db = await openKeyDb();
    return await new Promise<CryptoKey | null>((resolve) => {
      const transaction = db.transaction(DEVICE_KEY_STORE, 'readonly');
      const request = transaction.objectStore(DEVICE_KEY_STORE).get(DEVICE_PRIVATE_KEY);
      request.onsuccess = () => resolve((request.result as CryptoKey) || null);
      request.onerror = () => resolve(null);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
    });
  } catch { return null; }
};

const writePrivateKey = async (key: CryptoKey) => {
  const db = await openKeyDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DEVICE_KEY_STORE, 'readwrite');
    transaction.objectStore(DEVICE_KEY_STORE).put(key, DEVICE_PRIVATE_KEY);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error('Unable to store device key')); };
  });
};

const toBase64Url = (buffer: ArrayBuffer) => {
  let binary = '';
  new Uint8Array(buffer).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export const getOrCreateDeviceId = async () => {
  const existing = await readStorage(DEVICE_ID_KEY);
  if (existing) return existing;
  const deviceId = randomId();
  await writeStorage(DEVICE_ID_KEY, deviceId);
  return deviceId;
};

const getOrCreateKeyPair = async () => {
  if (!crypto?.subtle) return { privateKey: null as CryptoKey | null, publicKey: null as CryptoKey | null };
  const privateKey = await readPrivateKey();
  if (privateKey) return { privateKey, publicKey: null as CryptoKey | null };
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  await writePrivateKey(pair.privateKey);
  return pair;
};

const createPossessionProof = async (deviceId: string) => {
  try {
    const pair = await getOrCreateKeyPair();
    if (!pair.privateKey) return { publicKey: null, possessionProof: null, hasPrivateKey: false };
    let publicKey = pair.publicKey ? JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey)) : await readStorage(`${DEVICE_ID_KEY}.publicKey`);
    if (pair.publicKey && publicKey) await writeStorage(`${DEVICE_ID_KEY}.publicKey`, publicKey);
    if (!publicKey) return { publicKey: null, possessionProof: null, hasPrivateKey: true };
    const timestamp = Date.now();
    const payload = `scrolith-device-proof:v1\n${deviceId}\n${timestamp}`;
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(payload));
    return { publicKey, possessionProof: { algorithm: 'ECDSA_P256_SHA256', timestamp, signature: toBase64Url(signature) }, hasPrivateKey: true };
  } catch { return { publicKey: null, possessionProof: null, hasPrivateKey: false }; }
};

export const getDeviceMetadata = async () => {
  const deviceId = await getOrCreateDeviceId();
  const proof = await createPossessionProof(deviceId);
  const runtime = (window as any)?.Capacitor;
  const platform = runtime?.getPlatform?.() || (isNativeRuntime() ? 'android' : 'web');
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  traceDeviceSecurity('metadata_created', {
    deviceIdPresent: Boolean(deviceId),
    indexedDbPrivateKeyPresent: proof.hasPrivateKey,
    publicKeyAvailable: Boolean(proof.publicKey),
    possessionProofCreated: Boolean(proof.possessionProof)
  });
  return {
    deviceId,
    ...(proof.publicKey ? { publicKey: proof.publicKey } : {}),
    ...(proof.possessionProof ? { possessionProof: proof.possessionProof } : {}),
    platform,
    deviceType: isNativeRuntime() ? 'mobile_app' : 'browser',
    browserName: userAgent.includes('Chrome') ? 'Chrome' : userAgent.includes('Firefox') ? 'Firefox' : userAgent.includes('Safari') ? 'Safari' : 'Browser',
    deviceModel: isNativeRuntime() ? 'Android device' : 'Web browser',
    osVersion: userAgent.slice(0, 160),
    appVersion: import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_SCROLITH_VERSION || 'web'
  };
};

const unwrap = (response: any) => response?.data?.data ?? response?.data ?? response;

export const DeviceSecurityService = {
  registerTrustedDevice: async () =>
    unwrap(await api.post('/security/login-approvals/trusted-device', { device: await getDeviceMetadata() }, { __skipRetry: true } as any)),
  listPendingApprovals: async () => {
    const payload = unwrap(await api.get('/security/login-approvals/pending', { __skipRetry: true } as any));
    return Array.isArray(payload?.pendingApprovals) ? payload.pendingApprovals : [];
  },
  approveLogin: async (attemptId: string) =>
    unwrap(await api.post(`/security/login-approvals/${encodeURIComponent(attemptId)}/approve`, undefined, { __skipRetry: true } as any)),
  rejectLogin: async (attemptId: string) =>
    unwrap(await api.post(`/security/login-approvals/${encodeURIComponent(attemptId)}/reject`, undefined, { __skipRetry: true } as any)),
  getApprovalStatus: async (attemptId: string, approvalToken: string) =>
    unwrap(await api.post(`/security/login-approvals/${encodeURIComponent(attemptId)}/status`, { approvalToken }, { __skipRetry: true } as any)),
  exchangeApprovedLogin: async (attemptId: string, approvalToken: string) =>
    unwrap(await api.post('/auth/login/approval/exchange', { attemptId, approvalToken, device: await getDeviceMetadata() }, { __skipRetry: true } as any))
};
