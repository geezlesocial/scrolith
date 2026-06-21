import type { OptimizationConfig } from '../types';

export const USER_DATA_SAVER_KEY = 'Scrolith.pref.dataSaverMode';

type NavigatorConnection = {
  effectiveType?: string;
  saveData?: boolean;
  downlink?: number;
};

export type MediaQualityTier = 'low' | 'balanced' | 'high';

export type PerformanceProfile = {
  lowBandwidth: boolean;
  dataSaver: boolean;
  autoplayEnabled: boolean;
  feedPageSize: number;
  lowBandwidthFeedPageSize: number;
  realtimeThrottleMs: number;
  mediaQuality: MediaQualityTier;
  mediaQualityPreset: 'auto' | MediaQualityTier;
  prefetchWindow: number;
};

const parseBool = (value: unknown, fallback: boolean) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
};

const parseIntClamped = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const getConnection = (): NavigatorConnection | null => {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as any;
  return (nav.connection || nav.mozConnection || nav.webkitConnection || null) as NavigatorConnection | null;
};

const isLowBandwidthConnection = (connection: NavigatorConnection | null): boolean => {
  if (!connection) return false;
  if (connection.saveData) return true;
  const effectiveType = String(connection.effectiveType || '').toLowerCase();
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return true;
  const downlink = Number(connection.downlink || 0);
  if (Number.isFinite(downlink) && downlink > 0 && downlink < 1.2) return true;
  return false;
};

export const readUserDataSaverPreference = () => {
  if (typeof window === 'undefined') return false;
  const raw = String(window.localStorage.getItem(USER_DATA_SAVER_KEY) || '').trim().toLowerCase();
  if (!raw) return false;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(raw);
};

export const writeUserDataSaverPreference = (enabled: boolean) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(USER_DATA_SAVER_KEY, enabled ? 'true' : 'false');
};

export const normalizeOptimizationProfile = (raw: any): Required<OptimizationConfig> => {
  const source = raw || {};
  const feedPageSize = parseIntClamped(source.feedPageSize ?? source.feed_page_size, 20, 5, 80);
  const lowBandwidthFeedPageSize = parseIntClamped(
    source.lowBandwidthFeedPageSize ?? source.low_bandwidth_feed_page_size,
    10,
    3,
    40
  );
  const mediaQualityPresetRaw = String(source.mediaQualityPreset ?? source.media_quality_preset ?? 'auto').trim().toLowerCase();
  const mediaQualityPreset: 'auto' | MediaQualityTier =
    mediaQualityPresetRaw === 'low' || mediaQualityPresetRaw === 'balanced' || mediaQualityPresetRaw === 'high'
      ? mediaQualityPresetRaw
      : 'auto';

  return {
    enabled: parseBool(source.enabled, false),
    compressionEnabled: parseBool(source.compressionEnabled ?? source.compression_enabled, false),
    compression_enabled: parseBool(source.compressionEnabled ?? source.compression_enabled, false),
    compressionLevel: parseIntClamped(source.compressionLevel ?? source.compression_level, 6, 1, 9),
    compression_level: parseIntClamped(source.compressionLevel ?? source.compression_level, 6, 1, 9),
    compressionThresholdKb: parseIntClamped(source.compressionThresholdKb ?? source.compression_threshold_kb, 1, 0, 2048),
    compression_threshold_kb: parseIntClamped(source.compressionThresholdKb ?? source.compression_threshold_kb, 1, 0, 2048),
    apiResponseCachingEnabled: parseBool(source.apiResponseCachingEnabled ?? source.api_response_caching_enabled, false),
    api_response_caching_enabled: parseBool(source.apiResponseCachingEnabled ?? source.api_response_caching_enabled, false),
    apiResponseCacheSeconds: parseIntClamped(source.apiResponseCacheSeconds ?? source.api_response_cache_seconds, 45, 5, 3600),
    api_response_cache_seconds: parseIntClamped(source.apiResponseCacheSeconds ?? source.api_response_cache_seconds, 45, 5, 3600),
    apiResponseCacheMaxEntries: parseIntClamped(
      source.apiResponseCacheMaxEntries ?? source.api_response_cache_max_entries,
      500,
      50,
      5000
    ),
    api_response_cache_max_entries: parseIntClamped(
      source.apiResponseCacheMaxEntries ?? source.api_response_cache_max_entries,
      500,
      50,
      5000
    ),
    staticAssetCachingEnabled: parseBool(source.staticAssetCachingEnabled ?? source.static_asset_caching_enabled, true),
    static_asset_caching_enabled: parseBool(source.staticAssetCachingEnabled ?? source.static_asset_caching_enabled, true),
    staticAssetCacheSeconds: parseIntClamped(source.staticAssetCacheSeconds ?? source.static_asset_cache_seconds, 604800, 60, 31536000),
    static_asset_cache_seconds: parseIntClamped(source.staticAssetCacheSeconds ?? source.static_asset_cache_seconds, 604800, 60, 31536000),
    htmlMinifyEnabled: parseBool(source.htmlMinifyEnabled ?? source.html_minify_enabled, false),
    html_minify_enabled: parseBool(source.htmlMinifyEnabled ?? source.html_minify_enabled, false),
    htmlCollapseWhitespace: parseBool(source.htmlCollapseWhitespace ?? source.html_collapse_whitespace, true),
    html_collapse_whitespace: parseBool(source.htmlCollapseWhitespace ?? source.html_collapse_whitespace, true),
    htmlRemoveComments: parseBool(source.htmlRemoveComments ?? source.html_remove_comments, true),
    html_remove_comments: parseBool(source.htmlRemoveComments ?? source.html_remove_comments, true),
    jsonMinifyEnabled: parseBool(source.jsonMinifyEnabled ?? source.json_minify_enabled, false),
    json_minify_enabled: parseBool(source.jsonMinifyEnabled ?? source.json_minify_enabled, false),
    speedHintsEnabled: parseBool(source.speedHintsEnabled ?? source.speed_hints_enabled, false),
    speed_hints_enabled: parseBool(source.speedHintsEnabled ?? source.speed_hints_enabled, false),
    preconnectOrigins: Array.isArray(source.preconnectOrigins ?? source.preconnect_origins)
      ? [...(source.preconnectOrigins ?? source.preconnect_origins)]
      : [],
    preconnect_origins: Array.isArray(source.preconnectOrigins ?? source.preconnect_origins)
      ? [...(source.preconnectOrigins ?? source.preconnect_origins)]
      : [],
    apiCacheExcludePaths: Array.isArray(source.apiCacheExcludePaths ?? source.api_cache_exclude_paths)
      ? [...(source.apiCacheExcludePaths ?? source.api_cache_exclude_paths)]
      : [],
    api_cache_exclude_paths: Array.isArray(source.apiCacheExcludePaths ?? source.api_cache_exclude_paths)
      ? [...(source.apiCacheExcludePaths ?? source.api_cache_exclude_paths)]
      : [],
    dataSaverModeEnabled: parseBool(source.dataSaverModeEnabled ?? source.data_saver_mode_enabled, false),
    data_saver_mode_enabled: parseBool(source.dataSaverModeEnabled ?? source.data_saver_mode_enabled, false),
    autoplayEnabled: parseBool(source.autoplayEnabled ?? source.autoplay_enabled, true),
    autoplay_enabled: parseBool(source.autoplayEnabled ?? source.autoplay_enabled, true),
    feedPageSize,
    feed_page_size: feedPageSize,
    lowBandwidthFeedPageSize: Math.min(feedPageSize, lowBandwidthFeedPageSize),
    low_bandwidth_feed_page_size: Math.min(feedPageSize, lowBandwidthFeedPageSize),
    realtimeThrottleMs: parseIntClamped(source.realtimeThrottleMs ?? source.realtime_throttle_ms, 300, 0, 10000),
    realtime_throttle_ms: parseIntClamped(source.realtimeThrottleMs ?? source.realtime_throttle_ms, 300, 0, 10000),
    mediaQualityPreset,
    media_quality_preset: mediaQualityPreset
  };
};

export const getPerformanceProfile = (
  optimizationRaw?: any,
  options?: { userDataSaver?: boolean }
): PerformanceProfile => {
  const optimization = normalizeOptimizationProfile(optimizationRaw || {});
  const connection = getConnection();
  const lowBandwidth = isLowBandwidthConnection(connection);
  const userDataSaver = options?.userDataSaver ?? readUserDataSaverPreference();
  const dataSaver = Boolean(optimization.dataSaverModeEnabled) || userDataSaver || Boolean(connection?.saveData);
  const autoplayEnabled = Boolean(optimization.autoplayEnabled) && !dataSaver;

  let mediaQuality: MediaQualityTier = 'high';
  if (optimization.mediaQualityPreset && optimization.mediaQualityPreset !== 'auto') {
    mediaQuality = optimization.mediaQualityPreset;
  } else if (dataSaver || lowBandwidth) {
    mediaQuality = 'low';
  } else {
    const downlink = Number(connection?.downlink || 0);
    mediaQuality = downlink > 0 && downlink < 3 ? 'balanced' : 'high';
  }

  const feedPageSize = dataSaver || lowBandwidth
    ? Math.min(Number(optimization.feedPageSize || 20), Number(optimization.lowBandwidthFeedPageSize || 10))
    : Number(optimization.feedPageSize || 20);

  return {
    lowBandwidth,
    dataSaver,
    autoplayEnabled,
    feedPageSize: Math.max(3, Math.min(80, Math.trunc(feedPageSize || 20))),
    lowBandwidthFeedPageSize: Math.max(3, Math.min(40, Math.trunc(optimization.lowBandwidthFeedPageSize || 10))),
    realtimeThrottleMs: Math.max(0, Math.min(10000, Math.trunc(optimization.realtimeThrottleMs || 300))),
    mediaQuality,
    mediaQualityPreset: optimization.mediaQualityPreset || 'auto',
    prefetchWindow: dataSaver ? 1 : lowBandwidth ? 2 : 4
  };
};

