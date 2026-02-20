type MaybeRecord = Record<string, unknown> | null | undefined;

export interface RuntimeOptimizationConfig {
  enabled: boolean;
  compressionEnabled: boolean;
  compressionLevel: number;
  compressionThresholdKb: number;
  apiResponseCachingEnabled: boolean;
  apiResponseCacheSeconds: number;
  apiResponseCacheMaxEntries: number;
  staticAssetCachingEnabled: boolean;
  staticAssetCacheSeconds: number;
  htmlMinifyEnabled: boolean;
  htmlCollapseWhitespace: boolean;
  htmlRemoveComments: boolean;
  jsonMinifyEnabled: boolean;
  speedHintsEnabled: boolean;
  preconnectOrigins: string[];
  apiCacheExcludePaths: string[];
}

const DEFAULT_API_CACHE_EXCLUDE_PATHS = [
  '/api/auth',
  '/api/admin',
  '/api/messages',
  '/api/contracts',
  '/api/wallet',
  '/api/withdrawal',
  '/api/notifications',
  '/api/support',
  '/api/community/admin',
  '/api/payments',
  '/api/kyc'
];

export const DEFAULT_RUNTIME_OPTIMIZATION_CONFIG: RuntimeOptimizationConfig = {
  enabled: false,
  compressionEnabled: false,
  compressionLevel: 6,
  compressionThresholdKb: 1,
  apiResponseCachingEnabled: false,
  apiResponseCacheSeconds: 45,
  apiResponseCacheMaxEntries: 500,
  staticAssetCachingEnabled: true,
  staticAssetCacheSeconds: 604800,
  htmlMinifyEnabled: false,
  htmlCollapseWhitespace: true,
  htmlRemoveComments: true,
  jsonMinifyEnabled: false,
  speedHintsEnabled: false,
  preconnectOrigins: [],
  apiCacheExcludePaths: [...DEFAULT_API_CACHE_EXCLUDE_PATHS]
};

const asObject = (value: unknown): MaybeRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const parseBoolean = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) return false;
  }
  return fallback;
};

const clampNumber = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  integer = false
): number => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return fallback;
  const bounded = Math.min(max, Math.max(min, parsed));
  return integer ? Math.trunc(bounded) : bounded;
};

const normalizeStringList = (value: unknown, maxLength = 20): string[] => {
  const source =
    Array.isArray(value)
      ? value
      : String(value || '')
          .split(/[,\n]/g)
          .map((item) => item.trim())
          .filter(Boolean);

  const out: string[] = [];
  for (const raw of source) {
    const item = String(raw || '').trim();
    if (!item) continue;
    if (out.includes(item)) continue;
    out.push(item);
    if (out.length >= maxLength) break;
  }
  return out;
};

const normalizePreconnectOrigins = (value: unknown): string[] => {
  const urls = normalizeStringList(value, 20);
  return urls.filter((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  });
};

const normalizeCacheExcludePaths = (value: unknown): string[] => {
  const paths = normalizeStringList(value, 100).map((entry) => {
    const cleaned = entry.trim();
    if (!cleaned) return '';
    return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  }).filter(Boolean);

  if (paths.length === 0) return [...DEFAULT_API_CACHE_EXCLUDE_PATHS];
  return paths;
};

export const normalizeRuntimeOptimizationConfig = (raw: unknown): RuntimeOptimizationConfig => {
  const source = asObject(raw) || {};
  const defaults = DEFAULT_RUNTIME_OPTIMIZATION_CONFIG;

  const preconnectOrigins = normalizePreconnectOrigins(
    source.preconnectOrigins ?? source.preconnect_origins
  );
  const apiCacheExcludePaths = normalizeCacheExcludePaths(
    source.apiCacheExcludePaths ?? source.api_cache_exclude_paths
  );

  return {
    enabled: parseBoolean(source.enabled, defaults.enabled),
    compressionEnabled: parseBoolean(
      source.compressionEnabled ?? source.compression_enabled,
      defaults.compressionEnabled
    ),
    compressionLevel: clampNumber(
      source.compressionLevel ?? source.compression_level,
      defaults.compressionLevel,
      1,
      9,
      true
    ),
    compressionThresholdKb: clampNumber(
      source.compressionThresholdKb ?? source.compression_threshold_kb,
      defaults.compressionThresholdKb,
      0,
      2048,
      true
    ),
    apiResponseCachingEnabled: parseBoolean(
      source.apiResponseCachingEnabled ?? source.api_response_caching_enabled,
      defaults.apiResponseCachingEnabled
    ),
    apiResponseCacheSeconds: clampNumber(
      source.apiResponseCacheSeconds ?? source.api_response_cache_seconds,
      defaults.apiResponseCacheSeconds,
      5,
      3600,
      true
    ),
    apiResponseCacheMaxEntries: clampNumber(
      source.apiResponseCacheMaxEntries ?? source.api_response_cache_max_entries,
      defaults.apiResponseCacheMaxEntries,
      50,
      5000,
      true
    ),
    staticAssetCachingEnabled: parseBoolean(
      source.staticAssetCachingEnabled ?? source.static_asset_caching_enabled,
      defaults.staticAssetCachingEnabled
    ),
    staticAssetCacheSeconds: clampNumber(
      source.staticAssetCacheSeconds ?? source.static_asset_cache_seconds,
      defaults.staticAssetCacheSeconds,
      60,
      31536000,
      true
    ),
    htmlMinifyEnabled: parseBoolean(
      source.htmlMinifyEnabled ?? source.html_minify_enabled,
      defaults.htmlMinifyEnabled
    ),
    htmlCollapseWhitespace: parseBoolean(
      source.htmlCollapseWhitespace ?? source.html_collapse_whitespace,
      defaults.htmlCollapseWhitespace
    ),
    htmlRemoveComments: parseBoolean(
      source.htmlRemoveComments ?? source.html_remove_comments,
      defaults.htmlRemoveComments
    ),
    jsonMinifyEnabled: parseBoolean(
      source.jsonMinifyEnabled ?? source.json_minify_enabled,
      defaults.jsonMinifyEnabled
    ),
    speedHintsEnabled: parseBoolean(
      source.speedHintsEnabled ?? source.speed_hints_enabled,
      defaults.speedHintsEnabled
    ),
    preconnectOrigins,
    apiCacheExcludePaths
  };
};

export const serializeRuntimeOptimizationConfig = (
  config: RuntimeOptimizationConfig
): Record<string, unknown> => ({
  ...config,
  compression_enabled: config.compressionEnabled,
  compression_level: config.compressionLevel,
  compression_threshold_kb: config.compressionThresholdKb,
  api_response_caching_enabled: config.apiResponseCachingEnabled,
  api_response_cache_seconds: config.apiResponseCacheSeconds,
  api_response_cache_max_entries: config.apiResponseCacheMaxEntries,
  static_asset_caching_enabled: config.staticAssetCachingEnabled,
  static_asset_cache_seconds: config.staticAssetCacheSeconds,
  html_minify_enabled: config.htmlMinifyEnabled,
  html_collapse_whitespace: config.htmlCollapseWhitespace,
  html_remove_comments: config.htmlRemoveComments,
  json_minify_enabled: config.jsonMinifyEnabled,
  speed_hints_enabled: config.speedHintsEnabled,
  preconnect_origins: config.preconnectOrigins,
  api_cache_exclude_paths: config.apiCacheExcludePaths
});
