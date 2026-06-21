import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

type FirebaseCredentialSource =
  | 'env_json'
  | 'env_b64'
  | 'env_path'
  | 'default_path'
  | 'application_default'
  | null;

type ResolvedServiceAccount = {
  serviceAccount: admin.ServiceAccount | null;
  source: FirebaseCredentialSource;
  sourcePath?: string | null;
};

let cachedBucketName: string | null = null;
let cachedServiceAccount: admin.ServiceAccount | null = null;
let cachedCredentialSource: FirebaseCredentialSource = null;
let cachedCredentialPath: string | null = null;
let firebaseInitAttempted = false;
const STORAGE_APP_NAME = 'scrolith-storage';

const trim = (value: unknown) => String(value || '').trim();

const normalizeObjectName = (value: string) => value.replace(/^\/+/, '');

const normalizeBucketName = (value: unknown) =>
  trim(value)
    .replace(/^gs:\/\//i, '')
    .replace(/^https?:\/\/storage\.googleapis\.com\//i, '')
    .replace(/^https?:\/\/firebasestorage\.googleapis\.com\/v0\/b\//i, '')
    .replace(/\/.*$/, '');

const parseServiceAccount = (input: string): admin.ServiceAccount | null => {
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object') return null;
    const serviceAccount = parsed as admin.ServiceAccount & Record<string, any>;
    if (typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    return serviceAccount;
  } catch {
    return null;
  }
};

const defaultServiceAccountPaths = () => {
  const cwd = process.cwd();
  return [
    path.resolve(cwd, 'secrets', 'fcm-service-account.json'),
    path.resolve(cwd, 'fcm-service-account.json'),
    path.resolve(cwd, 'secrets', 'firebase-adminsdk.json')
  ];
};

const shouldPreferApplicationDefault = () =>
  Boolean(
    trim(process.env.K_SERVICE) ||
      trim(process.env.K_REVISION) ||
      trim(process.env.GOOGLE_CLOUD_PROJECT) ||
      trim(process.env.GCLOUD_PROJECT)
  );

const readServiceAccount = (): ResolvedServiceAccount => {
  const rawJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  const rawB64 = process.env.FCM_SERVICE_ACCOUNT_B64;
  const rawPath = process.env.FCM_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (rawJson) {
    const parsed = parseServiceAccount(rawJson);
    if (parsed) return { serviceAccount: parsed, source: 'env_json' };
  }

  if (rawB64) {
    try {
      const decoded = Buffer.from(rawB64, 'base64').toString('utf8');
      const parsed = parseServiceAccount(decoded);
      if (parsed) return { serviceAccount: parsed, source: 'env_b64' };
    } catch {
      // Ignore invalid base64 content and continue with other credential sources.
    }
  }

  const pathCandidates = [...(rawPath ? [rawPath] : []), ...defaultServiceAccountPaths()];
  for (const candidate of pathCandidates) {
    const resolved = path.resolve(candidate);
    if (!fs.existsSync(resolved)) continue;
    try {
      const rawFile = fs.readFileSync(resolved, 'utf8');
      const parsed = parseServiceAccount(rawFile);
      if (parsed) {
        return {
          serviceAccount: parsed,
          source: rawPath && path.resolve(rawPath) === resolved ? 'env_path' : 'default_path',
          sourcePath: resolved
        };
      }
    } catch {
      // Ignore unreadable files and continue with the remaining candidates.
    }
  }

  return {
    serviceAccount: null,
    source: rawPath ? 'env_path' : null,
    sourcePath: rawPath ? path.resolve(rawPath) : null
  };
};

const readStorageBucketFromGoogleServices = () => {
  const candidates = [
    path.resolve(process.cwd(), '../mobile/android/app/google-services.json'),
    path.resolve(process.cwd(), '../../mobile/android/app/google-services.json'),
    path.resolve(process.cwd(), './mobile/android/app/google-services.json')
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      const bucket = trim(parsed?.project_info?.storage_bucket);
      if (bucket) return bucket;
    } catch {
      // Ignore malformed JSON and continue with the next candidate.
    }
  }

  return '';
};

const resolveBucketName = () => {
  if (cachedBucketName) return cachedBucketName;

  const envBucket =
    normalizeBucketName(process.env.FIREBASE_STORAGE_BUCKET) ||
    normalizeBucketName(process.env.GCLOUD_STORAGE_BUCKET) ||
    normalizeBucketName(process.env.GOOGLE_CLOUD_STORAGE_BUCKET) ||
    normalizeBucketName(process.env.STORAGE_BUCKET);
  if (envBucket) {
    cachedBucketName = envBucket;
    return cachedBucketName;
  }

  const googleServicesBucket = readStorageBucketFromGoogleServices();
  if (googleServicesBucket) {
    cachedBucketName = googleServicesBucket;
    return cachedBucketName;
  }

  const serviceAccount = cachedServiceAccount || readServiceAccount().serviceAccount;
  const projectId =
    trim(serviceAccount?.projectId) ||
    trim((serviceAccount as any)?.project_id) ||
    trim(process.env.FIREBASE_PROJECT_ID);
  if (projectId) {
    cachedBucketName = `${projectId}.firebasestorage.app`;
    return cachedBucketName;
  }

  return null;
};

const getFirebaseApp = () => {
  try {
    return admin.app(STORAGE_APP_NAME);
  } catch {
    // App has not been initialized yet for storage.
  }
  if (firebaseInitAttempted) return null;
  firebaseInitAttempted = true;

  const { serviceAccount, source, sourcePath } = readServiceAccount();
  cachedServiceAccount = serviceAccount;
  cachedCredentialSource = source;
  cachedCredentialPath = sourcePath || null;

  if (shouldPreferApplicationDefault()) {
    cachedCredentialSource = 'application_default';
    cachedCredentialPath = null;
    return admin.initializeApp({
      credential: admin.credential.applicationDefault()
    }, STORAGE_APP_NAME);
  }

  if (serviceAccount) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    }, STORAGE_APP_NAME);
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    cachedCredentialSource = 'application_default';
    cachedCredentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    return admin.initializeApp({
      credential: admin.credential.applicationDefault()
    }, STORAGE_APP_NAME);
  }

  return null;
};

const getBucket = () => {
  const app = getFirebaseApp();
  const bucketName = resolveBucketName();
  if (!app || !bucketName) {
    throw new Error('Firebase Storage is not configured');
  }
  return admin.storage(app).bucket(bucketName);
};

export const isFirebaseStorageConfigured = () => {
  try {
    return Boolean(getFirebaseApp() && resolveBucketName());
  } catch {
    return false;
  }
};

export const getFirebaseStorageRuntimeStatus = () => ({
  configured: isFirebaseStorageConfigured(),
  bucket: resolveBucketName(),
  credentialSource: cachedCredentialSource,
  credentialPath: cachedCredentialPath
});

export const uploadBufferToFirebaseStorage = async (params: {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}) => {
  const bucket = getBucket();
  const objectName = normalizeObjectName(params.fileName);
  const file = bucket.file(objectName);
  await file.save(params.buffer, {
    resumable: false,
    validation: false,
    metadata: {
      contentType: params.contentType || 'application/octet-stream',
      cacheControl: 'public, max-age=31536000, immutable'
    }
  });
  return {
    bucket: bucket.name,
    objectName
  };
};

export const deleteFirebaseStorageByName = async (fileName?: string | null) => {
  if (!fileName) return;
  const bucket = getBucket();
  const objectName = normalizeObjectName(fileName);
  try {
    await bucket.file(objectName).delete({ ignoreNotFound: true });
  } catch (error: any) {
    const code = Number(error?.code || 0);
    if (code === 404) return;
    throw error;
  }
};

export const firebaseStorageExistsByName = async (fileName: string) => {
  const bucket = getBucket();
  const objectName = normalizeObjectName(fileName);
  const [exists] = await bucket.file(objectName).exists();
  return Boolean(exists);
};

export const getFirebaseStorageMetadataByName = async (fileName: string) => {
  const bucket = getBucket();
  const objectName = normalizeObjectName(fileName);
  const [metadata] = await bucket.file(objectName).getMetadata();
  return metadata;
};

export const createFirebaseStorageReadStream = (fileName: string) => {
  const bucket = getBucket();
  const objectName = normalizeObjectName(fileName);
  return bucket.file(objectName).createReadStream();
};

export const downloadFirebaseStorageBufferByName = async (fileName: string) => {
  const bucket = getBucket();
  const objectName = normalizeObjectName(fileName);
  const [buffer] = await bucket.file(objectName).download();
  return buffer;
};
