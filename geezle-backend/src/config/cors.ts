import { CorsOptions } from 'cors';

const BASE_ALLOWED_ORIGINS = [
  'https://scrolith.com',
  'https://www.scrolith.com',
  'https://scrolith-frontend-ui2ik4yg6q-uc.a.run.app',
  'https://scrolitha-ui-8f10d0bf-fix1---scrolith-frontend-ui2ik4yg6q-uc.a.run.app',
  'https://auth-logout-fix---scrolith-frontend-ui2ik4yg6q-uc.a.run.app',
  'https://m.scrolith.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost',
  'http://127.0.0.1',
  'https://localhost',
  'https://127.0.0.1',
  'capacitor://localhost',
  'ionic://localhost'
];

const corsMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const DEFAULT_FRONTEND_REVISION_HOST_SUFFIX =
  'thankfulbeach-8f7ee997.southeastasia.azurecontainerapps.io';

const normalizeHostSuffix = (value: string | undefined | null): string =>
  String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^\.+/, '')
    .replace(/\/+$/, '')
    .toLowerCase();

export const isScrolithFrontendRevisionOrigin = (
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean => {
  if (!origin) return false;

  try {
    const parsed = new URL(normalizeCorsOrigin(origin));
    const suffix = normalizeHostSuffix(
      env.CORS_ALLOWED_FRONTEND_REVISION_HOST_SUFFIX || DEFAULT_FRONTEND_REVISION_HOST_SUFFIX
    );
    const hostname = parsed.hostname.toLowerCase();
    const baseHost = `ca-scrolith-frontend.${suffix}`;
    const revisionHostPrefix = 'ca-scrolith-frontend--';

    return (
      parsed.protocol === 'https:' &&
      !parsed.port &&
      (hostname === baseHost ||
        (hostname.startsWith(revisionHostPrefix) && hostname.endsWith(`.${suffix}`)))
    );
  } catch {
    return false;
  }
};

export const normalizeCorsOrigin = (value: string | undefined | null): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '').toLowerCase();
};

export const parseCorsAllowedOrigins = (value: string | undefined | null): string[] =>
  String(value || '')
    .split(',')
    .map((origin) => normalizeCorsOrigin(origin))
    .filter((origin) => origin && origin !== '*');

export const buildAllowedCorsOrigins = (env: NodeJS.ProcessEnv = process.env): Set<string> =>
  new Set(
    [
      ...parseCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS),
      env.FRONTEND_URL,
      env.PUBLIC_APP_URL,
      ...BASE_ALLOWED_ORIGINS
    ]
      .map((origin) => normalizeCorsOrigin(origin))
      .filter(Boolean)
  );

export const isAllowedCorsOrigin = (
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean => {
  if (!origin) return true;
  if (env.NODE_ENV !== 'production') return true;
  return (
    buildAllowedCorsOrigins(env).has(normalizeCorsOrigin(origin)) ||
    isScrolithFrontendRevisionOrigin(origin, env)
  );
};

export const createCorsOptions = (env: NodeJS.ProcessEnv = process.env): CorsOptions => ({
  origin: (origin, callback) => {
    try {
      if (isAllowedCorsOrigin(origin, env)) return callback(null, true);
      return callback(null, false);
    } catch (error) {
      console.warn('[cors] Origin validation failed:', error);
      return callback(null, false);
    }
  },
  credentials: true,
  methods: corsMethods,
  maxAge: Math.max(300, Number(env.CORS_MAX_AGE_SECONDS || 86400)),
  optionsSuccessStatus: 204
});
