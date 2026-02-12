import process from 'process';

type EnvKey = {
  key: string;
  requiredInProd?: boolean;
  description?: string;
};

const REQUIRED_KEYS: EnvKey[] = [
  { key: 'DATABASE_URL', requiredInProd: true, description: 'Postgres connection URL' },
  { key: 'JWT_SECRET', requiredInProd: true, description: 'JWT signing secret' },
  { key: 'PORT', requiredInProd: false, description: 'Server port' },
  { key: 'FRONTEND_URL', requiredInProd: false, description: 'Frontend origin for CORS' }
];

const OPTIONAL_KEYS: EnvKey[] = [
  { key: 'EMAIL_HOST', description: 'SMTP host' },
  { key: 'EMAIL_USER', description: 'SMTP username' },
  { key: 'EMAIL_PASS', description: 'SMTP password' },
  { key: 'GOOGLE_API_KEY', description: 'Google / Vertex AI key' },
  { key: 'OPENAI_API_KEY', description: 'OpenAI API key' },
  { key: 'UPLOAD_DRIVER', description: 'Upload driver override: local | azure_blob | s3 | backblaze' },
  { key: 'STORAGE_DRIVER', description: 'Storage driver: local | s3 | backblaze' },
  { key: 'AZURE_STORAGE_CONNECTION_STRING', description: 'Azure Blob storage connection string' },
  { key: 'AZURE_STORAGE_CONTAINER', description: 'Azure Blob storage container name' },
  { key: 'AZURE_BLOB_BASE_URL', description: 'Azure Blob base URL for public files' },
  { key: 'FCM_SERVICE_ACCOUNT_JSON', description: 'Firebase service account JSON (inline)' },
  { key: 'FCM_SERVICE_ACCOUNT_B64', description: 'Firebase service account JSON (base64)' },
  { key: 'FCM_SERVICE_ACCOUNT_PATH', description: 'Firebase service account JSON path' },
  { key: 'GOOGLE_APPLICATION_CREDENTIALS', description: 'Google ADC credentials path' }
];

export function validateEnv() {
  const missingCritical: string[] = [];
  const missingOptional: string[] = [];

  for (const k of REQUIRED_KEYS) {
    if (!process.env[k.key] || process.env[k.key]!.trim() === '') {
      missingCritical.push(`${k.key} - ${k.description || ''}`.trim());
    }
  }

  for (const k of OPTIONAL_KEYS) {
    if (!process.env[k.key] || process.env[k.key]!.trim() === '') {
      missingOptional.push(`${k.key} - ${k.description || ''}`.trim());
    }
  }

  if (missingCritical.length > 0) {
    console.error('Missing critical environment variables:');
    missingCritical.forEach((m) => console.error('  -', m));
    if (process.env.NODE_ENV === 'production') {
      console.error('Environment is production; aborting startup due to missing critical variables.');
      process.exit(1);
    }
  }

  if (missingOptional.length > 0) {
    console.warn('Optional environment variables are not set (some features may be limited):');
    missingOptional.slice(0, 50).forEach((m) => console.warn('  -', m));
  }

  const storage = (process.env.UPLOAD_DRIVER || process.env.STORAGE_DRIVER || 'local').toLowerCase();

  if (['azure_blob', 'azure', 'blob'].includes(storage)) {
    const keys = ['AZURE_STORAGE_CONNECTION_STRING', 'AZURE_STORAGE_CONTAINER'];
    const missing = keys.filter((k) => !process.env[k] || process.env[k]!.trim() === '');
    if (missing.length > 0) {
      console.warn('Azure Blob storage selected but missing:', missing.join(', '));
    }
  }

  if (storage === 's3') {
    const keys = ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];
    const missing = keys.filter((k) => !process.env[k] || process.env[k]!.trim() === '');
    if (missing.length > 0) {
      console.warn('S3 storage selected but missing:', missing.join(', '));
    }
  }

  if (storage === 'backblaze') {
    const keys = ['B2_BUCKET', 'B2_REGION', 'B2_ACCESS_KEY_ID', 'B2_SECRET_ACCESS_KEY'];
    const missing = keys.filter((k) => !process.env[k] || process.env[k]!.trim() === '');
    if (missing.length > 0) {
      console.warn('Backblaze B2 selected but missing:', missing.join(', '));
    }
  }

  return {
    missingCritical,
    missingOptional
  };
}

export default validateEnv;
