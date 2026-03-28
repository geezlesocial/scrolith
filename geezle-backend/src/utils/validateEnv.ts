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
  { key: 'EMAIL_PROVIDER', description: 'Email provider: smtp | ses | sendgrid | mailgun | brevo' },
  { key: 'EMAIL_HOST', description: 'SMTP host' },
  { key: 'EMAIL_PORT', description: 'SMTP port' },
  { key: 'EMAIL_USER', description: 'SMTP username' },
  { key: 'EMAIL_PASS', description: 'SMTP password' },
  { key: 'EMAIL_FROM_NAME', description: 'Email sender display name' },
  { key: 'EMAIL_FROM_EMAIL', description: 'Email sender address' },
  { key: 'EMAIL_ENCRYPTION', description: 'Email transport encryption: tls | ssl | none' },
  { key: 'SES_REGION', description: 'Amazon SES region (for SMTP host defaults)' },
  { key: 'SES_SMTP_USERNAME', description: 'Amazon SES SMTP username' },
  { key: 'SES_SMTP_PASSWORD', description: 'Amazon SES SMTP password' },
  { key: 'SENDGRID_API_KEY', description: 'SendGrid API key' },
  { key: 'SENDGRID_SMTP_USERNAME', description: 'SendGrid SMTP username (often apikey)' },
  { key: 'SENDGRID_SMTP_PASSWORD', description: 'SendGrid SMTP password (or API key)' },
  { key: 'MAILGUN_DOMAIN', description: 'Mailgun domain (for inferred SMTP username)' },
  { key: 'MAILGUN_API_KEY', description: 'Mailgun API key' },
  { key: 'MAILGUN_SMTP_USERNAME', description: 'Mailgun SMTP username' },
  { key: 'MAILGUN_SMTP_PASSWORD', description: 'Mailgun SMTP password' },
  { key: 'BREVO_SMTP_LOGIN', description: 'Brevo SMTP login email' },
  { key: 'BREVO_SMTP_KEY', description: 'Brevo SMTP key' },
  { key: 'BREVO_SMTP_PASSWORD', description: 'Brevo SMTP password alias (same as SMTP key)' },
  { key: 'GOOGLE_API_KEY', description: 'Google / Vertex AI key' },
  { key: 'OPENAI_API_KEY', description: 'OpenAI API key' },
  { key: 'SCROLITHA_PROVIDER', description: 'Scrolitha provider: core | ollama | disabled' },
  { key: 'SCROLITHA_OLLAMA_HOST', description: 'Ollama base URL (e.g. http://127.0.0.1:11434)' },
  { key: 'SCROLITHA_OLLAMA_MODEL', description: 'Ollama model name (e.g. llama3.1)' },
  { key: 'SCROLITHA_MAX_TOKENS', description: 'Scrolitha max tokens (num_predict)' },
  { key: 'SCROLITHA_TEMPERATURE', description: 'Scrolitha temperature' },
  { key: 'SCROLITHA_TOP_P', description: 'Scrolitha top_p' },
  { key: 'SCROLITHA_TIMEOUT_MS', description: 'Scrolitha request timeout (ms)' },
  { key: 'SCROLITHA_ENABLE_STREAMING', description: 'Enable streaming responses (future)' },
  { key: 'SCROLITHA_GEMINI_FALLBACK', description: 'Allow legacy Gemini/OpenAI fallback when Ollama is unavailable' },
  { key: 'UPLOAD_DRIVER', description: 'Upload driver override: local | database_storage | firebase_storage | azure_blob | s3 | backblaze' },
  { key: 'STORAGE_DRIVER', description: 'Storage driver: local | database_storage | firebase_storage | s3 | backblaze' },
  { key: 'AZURE_STORAGE_CONNECTION_STRING', description: 'Azure Blob storage connection string' },
  { key: 'AZURE_STORAGE_CONTAINER', description: 'Azure Blob storage container name' },
  { key: 'AZURE_BLOB_BASE_URL', description: 'Azure Blob base URL for public files' },
  { key: 'FIREBASE_STORAGE_BUCKET', description: 'Firebase Storage bucket name' },
  { key: 'API_REQUEST_LOGGING', description: 'Enable verbose API request logs in production' },
  { key: 'API_RATE_LIMIT_WINDOW_MS', description: 'API rate-limit rolling window in ms' },
  { key: 'API_RATE_LIMIT_MAX_ANON', description: 'API rate-limit max requests for anonymous traffic per window' },
  { key: 'API_RATE_LIMIT_MAX_AUTH', description: 'API rate-limit max requests for authenticated traffic per window' },
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
      if (k.requiredInProd === false) {
        missingOptional.push(`${k.key} - ${k.description || ''}`.trim());
      } else {
        missingCritical.push(`${k.key} - ${k.description || ''}`.trim());
      }
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

  const scrolithaProvider = String(process.env.SCROLITHA_PROVIDER || 'core').trim().toLowerCase();
  if (scrolithaProvider === 'ollama') {
    const keys = ['SCROLITHA_OLLAMA_HOST', 'SCROLITHA_OLLAMA_MODEL'];
    const missing = keys.filter((k) => !process.env[k] || process.env[k]!.trim() === '');
    if (missing.length > 0) {
      console.warn('Scrolitha provider is ollama but missing:', missing.join(', '));
    }
  }

  if (['azure_blob', 'azure', 'blob'].includes(storage)) {
    const keys = ['AZURE_STORAGE_CONNECTION_STRING', 'AZURE_STORAGE_CONTAINER'];
    const missing = keys.filter((k) => !process.env[k] || process.env[k]!.trim() === '');
    if (missing.length > 0) {
      console.warn('Azure Blob storage selected but missing:', missing.join(', '));
    }
  }

  if (['firebase_storage', 'firebase', 'gcs', 'google_cloud_storage'].includes(storage)) {
    const hasInlineJson = Boolean(process.env.FCM_SERVICE_ACCOUNT_JSON?.trim());
    const hasBase64 = Boolean(process.env.FCM_SERVICE_ACCOUNT_B64?.trim());
    const hasPath = Boolean(
      process.env.FCM_SERVICE_ACCOUNT_PATH?.trim() || process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
    );
    if (!hasInlineJson && !hasBase64 && !hasPath) {
      console.warn(
        'Firebase Storage selected but no Firebase Admin credentials were found. Set FCM_SERVICE_ACCOUNT_JSON, FCM_SERVICE_ACCOUNT_B64, FCM_SERVICE_ACCOUNT_PATH, or GOOGLE_APPLICATION_CREDENTIALS.'
      );
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
