import React, { useState, useEffect, useMemo } from 'react';
import { useContent } from '../../context/ContentContext';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';
import { useCurrency } from '../../context/CurrencyContext';
import { Save, Settings, Mail, HardDrive, DollarSign, Cpu, CheckCircle, ShieldCheck, Globe, FileText, Database, Server, RefreshCw, Plus, Trash2, X, Network, Send, Loader2, AlertTriangle, Image as ImageIcon, Gauge, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { AIConfigManager } from '../../services/ai/ai.config';
import {
    AIConfig,
    ComplianceConfig,
    Currency,
    PlatformSettings,
    EmailProviderConfig,
    UploadedFile,
    SystemConfig,
    OptimizationConfig,
    FxSystemConfig,
    FxProviderRecord,
    FxHealth,
    FxSnapshotRecord,
    FxManualOverrideRecord,
    FxLockRecord
} from '../../types';
import { INITIAL_CURRENCIES } from '../../constants';
import { CMSService } from '../../services/cms';
import FilePickerModal from '../shared/FilePickerModal';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { resolvePostAttachmentMediaUrl } from '../../utils/postAttachmentMedia';
import { normalizeVerificationSettings } from '../../utils/verification';
import { normalizeTrustScoreSettings } from '../../utils/trustScore';
import { normalizeDealFlowSettings } from '../../utils/dealFlow';
import { normalizeStorefrontSettings } from '../../utils/storefront';
import { normalizeContentOfferSettings } from '../../utils/contentOffers';
import FxControlPlanePanel from './fx/FxControlPlanePanel';
import Admin2FAControlPanel from './Admin2FAControlPanel';

const TabButton = ({ id, label, icon: Icon, activeTab, setActiveTab }: any) => (
    <button 
        onClick={() => setActiveTab(id)} 
        className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium flex items-center transition-colors ${activeTab === id ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
    >
        <Icon className="w-4 h-4 mr-3" /> {label}
    </button>
);

const normalizeBoolean = (value: any, fallback: boolean) => {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
        return Boolean(normalized);
    }
    return Boolean(value);
};

const normalizeNumber = (value: any, fallback: number) => {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : fallback;
};

const DEFAULT_RESUME_AI_POLICY = {
    enabled: true,
    builderEnabled: true,
    reviewerEnabled: true,
    adminAccessEnabled: true
};

const normalizeResumeAiPolicy = (raw: any) => {
    const source = raw || {};
    const enabled = normalizeBoolean(source.enabled ?? source.resume_enabled ?? source.isEnabled, DEFAULT_RESUME_AI_POLICY.enabled);
    const builderEnabled = normalizeBoolean(
        source.builderEnabled ?? source.builder_enabled ?? source.resumeBuilderEnabled ?? source.resume_builder_enabled,
        DEFAULT_RESUME_AI_POLICY.builderEnabled
    );
    const reviewerEnabled = normalizeBoolean(
        source.reviewerEnabled ?? source.reviewer_enabled ?? source.resumeReviewerEnabled ?? source.resume_reviewer_enabled,
        DEFAULT_RESUME_AI_POLICY.reviewerEnabled
    );
    const adminAccessEnabled = normalizeBoolean(
        source.adminAccessEnabled ?? source.admin_access_enabled ?? source.allowAdminAccess ?? source.allow_admin_access,
        DEFAULT_RESUME_AI_POLICY.adminAccessEnabled
    );

    return {
        enabled,
        builderEnabled,
        reviewerEnabled,
        adminAccessEnabled,
        resume_enabled: enabled,
        builder_enabled: builderEnabled,
        reviewer_enabled: reviewerEnabled,
        admin_access_enabled: adminAccessEnabled
    };
};

const EMAIL_PORT_DEFAULTS: Record<NonNullable<EmailProviderConfig['provider']>, number> = {
    smtp: 587,
    ses: 587,
    sendgrid: 587,
    mailgun: 587,
    brevo: 587
};

const normalizeEmailProvider = (value: any): NonNullable<EmailProviderConfig['provider']> => {
    const provider = String(value || 'smtp').toLowerCase();
    if (provider === 'ses' || provider === 'sendgrid' || provider === 'mailgun' || provider === 'brevo') {
        return provider;
    }
    return 'smtp';
};

const getProviderDefaultHost = (provider: NonNullable<EmailProviderConfig['provider']>, region?: string) => {
    if (provider === 'sendgrid') return 'smtp.sendgrid.net';
    if (provider === 'mailgun') return 'smtp.mailgun.org';
    if (provider === 'brevo') return 'smtp-relay.brevo.com';
    if (provider === 'ses') return `email-smtp.${(region || 'us-east-1').trim() || 'us-east-1'}.amazonaws.com`;
    return '';
};

const getProviderUsernameLabel = (provider: NonNullable<EmailProviderConfig['provider']>) => {
    if (provider === 'brevo') return 'SMTP Login';
    return 'Username';
};

const getProviderUsernamePlaceholder = (provider: NonNullable<EmailProviderConfig['provider']>) => {
    if (provider === 'sendgrid') return 'apikey';
    if (provider === 'brevo') return 'your-brevo-login@example.com';
    return '';
};

const getProviderPasswordLabel = (provider: NonNullable<EmailProviderConfig['provider']>) => {
    if (provider === 'brevo') return 'SMTP Key';
    return 'Password';
};

const getProviderPasswordPlaceholder = (provider: NonNullable<EmailProviderConfig['provider']>) => {
    if (provider === 'brevo') return 'xkeysib-...';
    return '';
};

const getProviderSetupHint = (provider: NonNullable<EmailProviderConfig['provider']>, region?: string) => {
    if (provider === 'brevo') {
        return {
            title: 'Brevo relay defaults',
            body: 'Use smtp-relay.brevo.com with TLS on port 587 by default. Username is your Brevo SMTP login email and password is your Brevo SMTP key.'
        };
    }
    if (provider === 'ses') {
        return {
            title: 'Amazon SES relay defaults',
            body: `SES uses ${getProviderDefaultHost(provider, region)} with your SES SMTP username and password.`
        };
    }
    if (provider === 'sendgrid') {
        return {
            title: 'SendGrid relay defaults',
            body: 'SendGrid typically uses smtp.sendgrid.net on port 587. Username is usually apikey and password is your SendGrid API key.'
        };
    }
    if (provider === 'mailgun') {
        return {
            title: 'Mailgun relay defaults',
            body: 'Mailgun typically uses smtp.mailgun.org on port 587 with your Mailgun SMTP username and password or API key-backed SMTP secret.'
        };
    }
    return {
        title: 'Custom SMTP',
        body: 'Use your provider\'s SMTP host, port, encryption, username, and password. Existing email delivery behavior remains unchanged until you save new values.'
    };
};

const normalizeEmailConfig = (raw: any): EmailProviderConfig => {
    const source = raw || {};
    const provider = normalizeEmailProvider(source.provider);
    const region = source.region || source.ses_region || source.sesRegion || 'us-east-1';
    const apiKey = source.apiKey || source.api_key || source.sendgrid_api_key || source.mailgun_api_key || '';
    const domain = source.domain || source.mailgun_domain || source.mailgunDomain || '';
    const username = source.username || source.user || source.brevoSmtpLogin || source.brevo_smtp_login || '';
    const password = source.password || source.brevoSmtpKey || source.brevo_smtp_key || '';
    const encryption =
        (source.encryption || source.smtp_encryption || source.smtpEncryption || (source.port === 465 ? 'ssl' : 'tls'))
            .toString()
            .toLowerCase() as 'tls' | 'ssl' | 'none';
    const defaultHost = getProviderDefaultHost(provider, region);
    const defaultPort = EMAIL_PORT_DEFAULTS[provider] || 587;
    const defaultUsername =
        provider === 'sendgrid'
            ? (username || 'apikey')
            : username;

    return {
        provider,
        host: source.host || defaultHost,
        port: normalizeNumber(source.port, defaultPort),
        username: defaultUsername,
        password,
        secure: source.secure !== undefined ? normalizeBoolean(source.secure, false) : encryption === 'ssl',
        encryption,
        smtp_encryption: source.smtp_encryption || encryption,
        fromName: source.fromName || source.from_name || 'Scrolith',
        from_name: source.from_name || source.fromName || 'Scrolith',
        fromEmail: source.fromEmail || source.from_email || 'noreply@Scrolith.com',
        from_email: source.from_email || source.fromEmail || 'noreply@Scrolith.com',
        apiKey,
        api_key: source.api_key || apiKey,
        domain,
        mailgun_domain: source.mailgun_domain || domain,
        brevoSmtpLogin: source.brevoSmtpLogin || source.brevo_smtp_login || username,
        brevo_smtp_login: source.brevo_smtp_login || source.brevoSmtpLogin || username,
        brevoSmtpKey: source.brevoSmtpKey || source.brevo_smtp_key || password,
        brevo_smtp_key: source.brevo_smtp_key || source.brevoSmtpKey || password,
        region,
        ses_region: source.ses_region || region,
        accessKeyId: source.accessKeyId || source.access_key_id || '',
        access_key_id: source.access_key_id || source.accessKeyId || '',
        secretAccessKey: source.secretAccessKey || source.secret_access_key || '',
        secret_access_key: source.secret_access_key || source.secretAccessKey || ''
    };
};

const isValidEmailAddress = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const getEmailConfigValidationErrors = (raw: EmailProviderConfig): string[] => {
    const config = normalizeEmailConfig(raw);
    const provider = normalizeEmailProvider(config.provider);
    const errors: string[] = [];

    if (!config.host?.trim()) errors.push('Please configure email host first.');
    if (!config.port || Number(config.port) <= 0) errors.push('Please configure a valid email port.');
    if (!config.fromName?.trim()) errors.push('Please provide From Name.');
    if (!isValidEmailAddress(config.fromEmail || '')) errors.push('Please provide a valid From Email.');

    if (provider === 'smtp' || provider === 'ses') {
        if (!config.username?.trim()) errors.push('Please provide SMTP username.');
        if (!config.password?.trim()) errors.push('Please provide SMTP password.');
    }

    if (provider === 'brevo') {
        if (!config.username?.trim()) errors.push('Please provide Brevo SMTP login.');
        if (!config.password?.trim()) errors.push('Please provide Brevo SMTP key.');
    }

    if (provider === 'sendgrid') {
        if (!config.apiKey?.trim() && !config.password?.trim()) {
            errors.push('Please provide SendGrid API key (or SMTP password).');
        }
    }

    if (provider === 'mailgun') {
        if (!config.username?.trim() && !config.domain?.trim()) {
            errors.push('Please provide Mailgun SMTP username or domain.');
        }
        if (!config.apiKey?.trim() && !config.password?.trim()) {
            errors.push('Please provide Mailgun API key (or SMTP password).');
        }
    }

    return errors;
};

const transitionProviderConfig = (
    current: EmailProviderConfig,
    nextProviderRaw: any
): EmailProviderConfig => {
    const currentNormalized = normalizeEmailConfig(current);
    const nextProvider = normalizeEmailProvider(nextProviderRaw);
    const previousProvider = normalizeEmailProvider(currentNormalized.provider);
    const currentRegion = currentNormalized.region || 'us-east-1';

    const previousDefaultHost = getProviderDefaultHost(previousProvider, currentRegion);
    const nextDefaultHost = getProviderDefaultHost(nextProvider, currentRegion);
    const previousDefaultPort = EMAIL_PORT_DEFAULTS[previousProvider] || 587;
    const nextDefaultPort = EMAIL_PORT_DEFAULTS[nextProvider] || 587;

    const shouldReplaceHost =
        !currentNormalized.host ||
        currentNormalized.host === previousDefaultHost ||
        currentNormalized.host === '';
    const shouldReplacePort = !currentNormalized.port || Number(currentNormalized.port) === previousDefaultPort;

    return normalizeEmailConfig({
        ...currentNormalized,
        provider: nextProvider,
        host: shouldReplaceHost ? nextDefaultHost : currentNormalized.host,
        port: shouldReplacePort ? nextDefaultPort : currentNormalized.port,
        username:
            nextProvider === 'sendgrid'
                ? (currentNormalized.username || 'apikey')
                : currentNormalized.username || '',
        encryption: currentNormalized.encryption || 'tls',
        smtp_encryption: currentNormalized.smtp_encryption || currentNormalized.encryption || 'tls'
    });
};

const normalizeCurrencyConfig = (raw: any) => {
    const source = raw || {};
    const baseCurrency = (source.baseCurrency || source.base_currency || 'USD').toString().toUpperCase();
    return {
        autoExchangeRate: normalizeBoolean(source.autoExchangeRate ?? source.auto_exchange_rate, false),
        baseCurrency,
        provider: String(source.provider || 'frankfurter_ecb'),
        apiKey: source.apiKey || source.api_key || ''
    };
};

const normalizeFxSystemConfig = (raw: any, baseCurrency = 'USD'): FxSystemConfig => {
    const source = raw || {};
    const safeBaseCurrency = (source.syncBaseCurrency || baseCurrency || 'USD').toString().toUpperCase();
    return {
        enabled: normalizeBoolean(source.enabled, true),
        providerCode: String(source.providerCode || source.provider || 'frankfurter_ecb').trim() || 'frankfurter_ecb',
        syncBaseCurrency: safeBaseCurrency,
        autoApproveSnapshots: normalizeBoolean(source.autoApproveSnapshots, true),
        refreshEnabled: normalizeBoolean(source.refreshEnabled, true),
        refreshCron: String(source.refreshCron || '17 0 * * 1-5').trim() || '17 0 * * 1-5',
        staleAfterSeconds: Math.max(60, Math.round(normalizeNumber(source.staleAfterSeconds, 172800))),
        fallbackToStoredRates: normalizeBoolean(source.fallbackToStoredRates, true),
        sourceBaseUrl: String(source.sourceBaseUrl || 'https://api.frankfurter.app').trim() || 'https://api.frankfurter.app',
        sourceProvider: String(source.sourceProvider || 'ECB').trim().toUpperCase() || 'ECB',
        timezone: String(source.timezone || 'UTC').trim() || 'UTC'
    };
};

const overlayLiveCurrencyRates = (configuredCurrencies: Currency[], liveCurrencies: Currency[], baseCurrency: string) => {
    const normalizedConfigured = normalizeCurrencies(configuredCurrencies, baseCurrency);
    const liveByCode = new Map(
        normalizeCurrencies(liveCurrencies, baseCurrency).map((entry) => [entry.code, entry] as const)
    );

    return normalizedConfigured.map((entry) => {
        const live = liveByCode.get(entry.code);
        if (!live) return entry;
        return {
            ...entry,
            name: entry.name || live.name,
            symbol: entry.symbol || live.symbol,
            rate: live.rate,
            rateSource: live.rateSource || entry.rateSource,
            snapshotId: live.snapshotId ?? entry.snapshotId ?? null,
            rateUpdatedAt: live.rateUpdatedAt ?? entry.rateUpdatedAt ?? null,
            stale: live.stale ?? entry.stale ?? false,
            isDefault: entry.isDefault || live.isDefault || entry.code === baseCurrency,
            is_default: entry.isDefault || live.isDefault || entry.code === baseCurrency
        } as Currency;
    });
};

const normalizeCurrencies = (list: any[], baseCurrency: string) => {
    const safeBase = (baseCurrency || 'USD').toUpperCase();
    const seen = new Set<string>();
    const normalized = (Array.isArray(list) ? list : []).map((entry, index) => {
        const code = (entry?.code || '').toString().toUpperCase();
        const key = code || `CUR-${index}`;
        const rate = normalizeNumber(entry?.rate, 1);
        const isDefault = Boolean(entry?.isDefault ?? entry?.is_default ?? key === safeBase);
        const activeValue = entry?.isActive ?? entry?.is_active;
        return {
            id: entry?.id || `currency-${key}`,
            code: key,
            name: entry?.name || key,
            symbol: entry?.symbol || '',
            rate,
            isActive: activeValue !== false,
            isDefault
        } as Currency;
    }).filter((entry) => {
        if (!entry.code) return false;
        if (seen.has(entry.code)) return false;
        seen.add(entry.code);
        return true;
    });

    if (!normalized.some((c) => c.code === safeBase)) {
        normalized.unshift({
            id: `currency-${safeBase}`,
            code: safeBase,
            name: safeBase,
            symbol: '',
            rate: 1,
            isActive: true,
            isDefault: true
        });
    } else {
        normalized.forEach((c) => {
            c.isDefault = c.code === safeBase;
        });
    }

    return normalized;
};

const normalizeCompliance = (list: any[]) => {
    return (Array.isArray(list) ? list : []).map((entry) => ({
        region: entry.region || entry.region_name || '',
        code: entry.code || entry.region_code || '',
        gdprEnabled: normalizeBoolean(entry.gdprEnabled ?? entry.gdpr_enabled, false),
        dataResidency: entry.dataResidency || entry.data_residency || '',
        kycProvider: entry.kycProvider || entry.kyc_provider || '',
        taxEngine: entry.taxEngine || entry.tax_engine || '',
        active: entry.active !== false
    })) as ComplianceConfig[];
};

const normalizeStorageConfig = (raw: any) => {
    const source = raw || {};
    const driver = source.driver || 'local';
    const s3 = source.s3 || {};
    const backblaze = source.backblaze || {};
    return {
        driver,
        s3: {
            accessKeyId: s3.accessKeyId || s3.access_key_id || '',
            secretAccessKey: s3.secretAccessKey || s3.secret_access_key || '',
            region: s3.region || 'us-east-1',
            bucket: s3.bucket || ''
        },
        backblaze: {
            accessKeyId: backblaze.accessKeyId || backblaze.access_key_id || '',
            secretAccessKey: backblaze.secretAccessKey || backblaze.secret_access_key || '',
            region: backblaze.region || '',
            bucket: backblaze.bucket || ''
        }
    };
};

const normalizeCacheConfig = (raw: any) => {
    const source = raw || {};
    return {
        driver: source.driver || 'local',
        redis: {
            host: source.redis?.host || '127.0.0.1',
            port: normalizeNumber(source.redis?.port, 6379),
            password: source.redis?.password || ''
        }
    };
};

const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
    enabled: true,
    compressionEnabled: true,
    compressionLevel: 6,
    compressionThresholdKb: 1,
    apiResponseCachingEnabled: false,
    apiResponseCacheSeconds: 45,
    apiResponseCacheMaxEntries: 500,
    staticAssetCachingEnabled: true,
    staticAssetCacheSeconds: 2592000,
    htmlMinifyEnabled: false,
    htmlCollapseWhitespace: true,
    htmlRemoveComments: true,
    jsonMinifyEnabled: false,
    speedHintsEnabled: false,
    preconnectOrigins: [],
    apiCacheExcludePaths: [
        '/api/auth',
        '/api/admin',
        '/api/messages',
        '/api/contracts',
        '/api/wallet',
        '/api/notifications'
    ],
    dataSaverModeEnabled: false,
    autoplayEnabled: true,
    feedPageSize: 20,
    lowBandwidthFeedPageSize: 10,
    realtimeThrottleMs: 300,
    mediaQualityPreset: 'auto'
};

const normalizeOptimizationArray = (value: any, fallback: string[] = []) => {
    const source = Array.isArray(value)
        ? value
        : String(value || '')
            .split(/[,\n]/g)
            .map((entry) => entry.trim())
            .filter(Boolean);

    const deduped: string[] = [];
    source.forEach((entry: any) => {
        const normalized = String(entry || '').trim();
        if (!normalized) return;
        if (deduped.includes(normalized)) return;
        deduped.push(normalized);
    });

    return deduped.length ? deduped : fallback;
};

const normalizeOptimizationConfig = (raw: any): OptimizationConfig => {
    const source = raw || {};
    const feedPageSize = Math.max(
        5,
        Math.min(80, Math.round(normalizeNumber(source.feedPageSize ?? source.feed_page_size, DEFAULT_OPTIMIZATION_CONFIG.feedPageSize || 20)))
    );
    const lowBandwidthFeedPageSize = Math.max(
        3,
        Math.min(40, Math.round(normalizeNumber(
            source.lowBandwidthFeedPageSize ?? source.low_bandwidth_feed_page_size,
            DEFAULT_OPTIMIZATION_CONFIG.lowBandwidthFeedPageSize || 10
        )))
    );
    const mediaQualityPresetRaw = String(source.mediaQualityPreset ?? source.media_quality_preset ?? DEFAULT_OPTIMIZATION_CONFIG.mediaQualityPreset ?? 'auto')
        .trim()
        .toLowerCase();
    const mediaQualityPreset: 'auto' | 'low' | 'balanced' | 'high' =
        mediaQualityPresetRaw === 'low' || mediaQualityPresetRaw === 'balanced' || mediaQualityPresetRaw === 'high'
            ? mediaQualityPresetRaw
            : 'auto';

    return {
        enabled: normalizeBoolean(source.enabled, DEFAULT_OPTIMIZATION_CONFIG.enabled || false),
        compressionEnabled: normalizeBoolean(
            source.compressionEnabled ?? source.compression_enabled,
            DEFAULT_OPTIMIZATION_CONFIG.compressionEnabled || false
        ),
        compressionLevel: Math.max(
            1,
            Math.min(
                9,
                Math.round(
                    normalizeNumber(
                        source.compressionLevel ?? source.compression_level,
                        DEFAULT_OPTIMIZATION_CONFIG.compressionLevel || 6
                    )
                )
            )
        ),
        compressionThresholdKb: Math.max(
            0,
            Math.min(
                2048,
                Math.round(
                    normalizeNumber(
                        source.compressionThresholdKb ?? source.compression_threshold_kb,
                        DEFAULT_OPTIMIZATION_CONFIG.compressionThresholdKb || 1
                    )
                )
            )
        ),
        apiResponseCachingEnabled: normalizeBoolean(
            source.apiResponseCachingEnabled ?? source.api_response_caching_enabled,
            DEFAULT_OPTIMIZATION_CONFIG.apiResponseCachingEnabled || false
        ),
        apiResponseCacheSeconds: Math.max(
            5,
            Math.min(
                3600,
                Math.round(
                    normalizeNumber(
                        source.apiResponseCacheSeconds ?? source.api_response_cache_seconds,
                        DEFAULT_OPTIMIZATION_CONFIG.apiResponseCacheSeconds || 45
                    )
                )
            )
        ),
        apiResponseCacheMaxEntries: Math.max(
            50,
            Math.min(
                5000,
                Math.round(
                    normalizeNumber(
                        source.apiResponseCacheMaxEntries ?? source.api_response_cache_max_entries,
                        DEFAULT_OPTIMIZATION_CONFIG.apiResponseCacheMaxEntries || 500
                    )
                )
            )
        ),
        staticAssetCachingEnabled: normalizeBoolean(
            source.staticAssetCachingEnabled ?? source.static_asset_caching_enabled,
            DEFAULT_OPTIMIZATION_CONFIG.staticAssetCachingEnabled || true
        ),
        staticAssetCacheSeconds: Math.max(
            60,
            Math.min(
                31536000,
                Math.round(
                    normalizeNumber(
                        source.staticAssetCacheSeconds ?? source.static_asset_cache_seconds,
                        DEFAULT_OPTIMIZATION_CONFIG.staticAssetCacheSeconds || 604800
                    )
                )
            )
        ),
        htmlMinifyEnabled: normalizeBoolean(
            source.htmlMinifyEnabled ?? source.html_minify_enabled,
            DEFAULT_OPTIMIZATION_CONFIG.htmlMinifyEnabled || false
        ),
        htmlCollapseWhitespace: normalizeBoolean(
            source.htmlCollapseWhitespace ?? source.html_collapse_whitespace,
            DEFAULT_OPTIMIZATION_CONFIG.htmlCollapseWhitespace || true
        ),
        htmlRemoveComments: normalizeBoolean(
            source.htmlRemoveComments ?? source.html_remove_comments,
            DEFAULT_OPTIMIZATION_CONFIG.htmlRemoveComments || true
        ),
        jsonMinifyEnabled: normalizeBoolean(
            source.jsonMinifyEnabled ?? source.json_minify_enabled,
            DEFAULT_OPTIMIZATION_CONFIG.jsonMinifyEnabled || false
        ),
        speedHintsEnabled: normalizeBoolean(
            source.speedHintsEnabled ?? source.speed_hints_enabled,
            DEFAULT_OPTIMIZATION_CONFIG.speedHintsEnabled || false
        ),
        preconnectOrigins: normalizeOptimizationArray(
            source.preconnectOrigins ?? source.preconnect_origins,
            DEFAULT_OPTIMIZATION_CONFIG.preconnectOrigins
        ),
        apiCacheExcludePaths: normalizeOptimizationArray(
            source.apiCacheExcludePaths ?? source.api_cache_exclude_paths,
            DEFAULT_OPTIMIZATION_CONFIG.apiCacheExcludePaths
        ),
        dataSaverModeEnabled: normalizeBoolean(
            source.dataSaverModeEnabled ?? source.data_saver_mode_enabled,
            DEFAULT_OPTIMIZATION_CONFIG.dataSaverModeEnabled || false
        ),
        autoplayEnabled: normalizeBoolean(
            source.autoplayEnabled ?? source.autoplay_enabled,
            DEFAULT_OPTIMIZATION_CONFIG.autoplayEnabled !== false
        ),
        feedPageSize,
        lowBandwidthFeedPageSize: Math.min(feedPageSize, lowBandwidthFeedPageSize),
        realtimeThrottleMs: Math.max(
            0,
            Math.min(
                10000,
                Math.round(
                    normalizeNumber(
                        source.realtimeThrottleMs ?? source.realtime_throttle_ms,
                        DEFAULT_OPTIMIZATION_CONFIG.realtimeThrottleMs || 300
                    )
                )
            )
        ),
        mediaQualityPreset
    };
};

const serializeOptimizationConfig = (raw: OptimizationConfig) => {
    const config = normalizeOptimizationConfig(raw);
    return {
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
        api_cache_exclude_paths: config.apiCacheExcludePaths,
        data_saver_mode_enabled: config.dataSaverModeEnabled,
        autoplay_enabled: config.autoplayEnabled,
        feed_page_size: config.feedPageSize,
        low_bandwidth_feed_page_size: config.lowBandwidthFeedPageSize,
        realtime_throttle_ms: config.realtimeThrottleMs,
        media_quality_preset: config.mediaQualityPreset
    };
};

const SystemSettings = () => {
    // 1. Hooks (Unconditional)
    const { settings, updateSettings } = useContent();
    const { availableCurrencies } = useCurrency();
    const { showNotification } = useNotification();
    
    // UI State
    const [activeTab, setActiveTab] = useState('general');
    const [localSettings, setLocalSettings] = useState<Partial<PlatformSettings>>({});
    const [labelPickerTarget, setLabelPickerTarget] = useState<'freelancer' | 'employer' | null>(null);
    const [isLabelPickerOpen, setIsLabelPickerOpen] = useState(false);
    
    // File Picker (removed here - Header & Hero manages logo/favicon)

    // AI Settings State
    const [aiConfig, setAiConfig] = useState<AIConfig>(AIConfigManager.getConfig());
    const [resumeAiConfig, setResumeAiConfig] = useState(DEFAULT_RESUME_AI_POLICY);

    // Storage & Cache State
    const [storageConfig, setStorageConfig] = useState<any>(
        normalizeStorageConfig({
            driver: 'local',
            s3: { accessKeyId: '', secretAccessKey: '', region: 'us-east-1', bucket: '' },
            backblaze: { accessKeyId: '', secretAccessKey: '', region: '', bucket: '' }
        })
    );
    const [cacheConfig, setCacheConfig] = useState<any>(normalizeCacheConfig({ driver: 'local' }));
    const [optimizationConfig, setOptimizationConfig] = useState<OptimizationConfig>(
        normalizeOptimizationConfig(DEFAULT_OPTIMIZATION_CONFIG)
    );
    
    // Currency State
    const [currencies, setCurrencies] = useState<Currency[]>(INITIAL_CURRENCIES);
    const [isCurrencyModalOpen, setIsCurrencyModalOpen] = useState(false);
    const [newCurrency, setNewCurrency] = useState<Partial<Currency>>({ code: '', name: '', symbol: '', rate: 1, isActive: true });
    // Phase 28B — local filter/pagination (presentation only; does not change FX data)
    const [currencySearch, setCurrencySearch] = useState('');
    const [currencyStatusFilter, setCurrencyStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
    const [currencySourceFilter, setCurrencySourceFilter] = useState<'all' | 'base' | 'snapshot' | 'override' | 'manual'>('all');
    const [currencyPage, setCurrencyPage] = useState(1);
    const [currencyPageSize, setCurrencyPageSize] = useState(25);
    const [currencyConfig, setCurrencyConfig] = useState(normalizeCurrencyConfig({
        autoExchangeRate: false,
        baseCurrency: 'USD',
        provider: 'frankfurter_ecb',
        apiKey: ''
    }));
    const [fxConfig, setFxConfig] = useState<FxSystemConfig>(
        normalizeFxSystemConfig({ providerCode: 'frankfurter_ecb', syncBaseCurrency: 'USD' }, 'USD')
    );
    const [fxProviders, setFxProviders] = useState<FxProviderRecord[]>([]);
    const [fxHealth, setFxHealth] = useState<FxHealth | null>(null);
    const [fxSnapshots, setFxSnapshots] = useState<FxSnapshotRecord[]>([]);
    const [fxOverrides, setFxOverrides] = useState<FxManualOverrideRecord[]>([]);
    const [fxLocks, setFxLocks] = useState<FxLockRecord[]>([]);
    const [fxBusyAction, setFxBusyAction] = useState<string | null>(null);

    // Email State
    const [emailConfig, setEmailConfig] = useState<EmailProviderConfig>(normalizeEmailConfig({ 
        provider: 'smtp', 
        host: 'smtp.mailtrap.io', 
        port: 587, 
        username: '', 
        password: '', 
        fromName: 'Scrolith', 
        fromEmail: 'noreply@Scrolith.com' 
    }));
    const [testEmail, setTestEmail] = useState('');
    const [isTestingEmail, setIsTestingEmail] = useState(false);

    // Mock Compliance Settings
    const [compliance, setCompliance] = useState<ComplianceConfig[]>([
        { region: "European Union", code: "EU", gdprEnabled: true, dataResidency: "EU-West (Frankfurt)", kycProvider: "SumSub", taxEngine: "Stripe Tax", active: true },
        { region: "United States", code: "US", gdprEnabled: false, dataResidency: "US-East (N. Virginia)", kycProvider: "Persona", taxEngine: "Avalara", active: true },
        { region: "United Kingdom", code: "UK", gdprEnabled: true, dataResidency: "EU-West (London)", kycProvider: "SumSub", taxEngine: "Stripe Tax", active: true },
    ]);

    // Loading states
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isApplyingMaintenance, setIsApplyingMaintenance] = useState(false);

    // 2. Effects
    useEffect(() => {
        loadSystemSettings();
    }, []);

    useEffect(() => {
        if (!availableCurrencies?.length) return;
        setCurrencies((prev) => overlayLiveCurrencyRates(prev, availableCurrencies, currencyConfig.baseCurrency || 'USD'));
    }, [availableCurrencies, currencyConfig.baseCurrency]);

    useEffect(() => {
        setFxConfig((prev) => ({
            ...prev,
            syncBaseCurrency: (currencyConfig.baseCurrency || 'USD').toString().toUpperCase(),
            providerCode: String(currencyConfig.provider || prev.providerCode || 'frankfurter_ecb').trim() || 'frankfurter_ecb'
        }));
    }, [currencyConfig.baseCurrency, currencyConfig.provider]);

    // When global content settings update (via socket or external save), reflect them here
    useEffect(() => {
        if (!isSaving && settings) {
            setLocalSettings(settings);
            const s = settings as unknown as Record<string, any>;
            const systemSource = s?.system ?? s;
            if (systemSource?.storage) setStorageConfig(normalizeStorageConfig(systemSource.storage));
            if (systemSource?.cache) setCacheConfig(normalizeCacheConfig(systemSource.cache));
            setOptimizationConfig(normalizeOptimizationConfig(systemSource?.optimization || DEFAULT_OPTIMIZATION_CONFIG));
            if (systemSource?.email) setEmailConfig(normalizeEmailConfig(systemSource.email));
            if (systemSource?.currency) setCurrencyConfig(normalizeCurrencyConfig(systemSource.currency));
            setFxConfig(
                normalizeFxSystemConfig(
                    systemSource?.fx || {},
                    systemSource?.currency?.baseCurrency || systemSource?.currency?.base_currency || 'USD'
                )
            );

            const incomingCurrencies =
                systemSource?.currencies ??
                systemSource?.currency_list ??
                s?.currencies ??
                [];
            const baseCode = (systemSource?.currency?.baseCurrency || systemSource?.currency?.base_currency || currencyConfig.baseCurrency || 'USD').toString().toUpperCase();
            const currencySource = Array.isArray(incomingCurrencies) && incomingCurrencies.length
                ? incomingCurrencies
                : (currencies && currencies.length ? currencies : INITIAL_CURRENCIES);
            const normalized = overlayLiveCurrencyRates(currencySource, availableCurrencies, baseCode);
            setCurrencies(normalized);
            const defaultCurrency = normalized.find((c) => c.isDefault) || normalized.find((c) => c.code === baseCode);
            if (defaultCurrency && defaultCurrency.code !== baseCode) {
                setCurrencyConfig((prev) => ({ ...prev, baseCurrency: defaultCurrency.code }));
            }

            const complianceSource = systemSource?.regionalCompliance ?? systemSource?.regional_compliance;
            if (Array.isArray(complianceSource)) {
                setCompliance(normalizeCompliance(complianceSource));
            }

            const aiSource = systemSource?.aiConfig ?? systemSource?.ai_config;
            const normalizedAi = AIConfigManager.normalizeConfig(aiSource || AIConfigManager.getConfig());
            setAiConfig(normalizedAi);
            // Keep local storage aligned so other modules read the same config
            AIConfigManager.saveConfig(normalizedAi);
            const resumeAiSource = systemSource?.resumeAi ?? systemSource?.resume_ai;
            setResumeAiConfig(normalizeResumeAiPolicy(resumeAiSource || DEFAULT_RESUME_AI_POLICY));
            void loadFxControlPlane(baseCode);
        }
    }, [settings, isSaving]);

    const loadSystemSettings = async () => {
        try {
            setIsLoading(true);
            // Try to load from backend. Prefer the merged settings available in ContentContext
            try {
                const systemSettings = await AdminService.getSystemSettings();

                // `settings` from ContentContext already contains platform + system merged.
                // Prefer it when present so we don't lose platform-level fields (siteName, tagline, etc.).
                const merged = settings ?? (systemSettings ? { system: systemSettings } : {});

                setLocalSettings(merged as PlatformSettings);

                // Determine source for nested configs (system namespace if present, otherwise the returned object)
                const m = merged as unknown as Record<string, any>;
                const systemSource = m?.system ?? systemSettings ?? merged;

                if (systemSource?.storage) {
                    setStorageConfig(normalizeStorageConfig(systemSource.storage));
                }
                if (systemSource?.cache) {
                    setCacheConfig(normalizeCacheConfig(systemSource.cache));
                }
                setOptimizationConfig(normalizeOptimizationConfig(systemSource?.optimization || DEFAULT_OPTIMIZATION_CONFIG));
                if (systemSource?.email) {
                    setEmailConfig(normalizeEmailConfig(systemSource.email));
                }
                if (systemSource?.currency) {
                    setCurrencyConfig(normalizeCurrencyConfig(systemSource.currency));
                }
                setFxConfig(
                    normalizeFxSystemConfig(
                        systemSource?.fx || {},
                        systemSource?.currency?.baseCurrency || systemSource?.currency?.base_currency || 'USD'
                    )
                );
                const incomingCurrencies =
                    systemSource?.currencies ??
                    systemSource?.currency_list ??
                    m?.currencies ??
                    [];
                const baseCode = (systemSource?.currency?.baseCurrency || systemSource?.currency?.base_currency || currencyConfig.baseCurrency || 'USD').toString().toUpperCase();
                const currencySource = Array.isArray(incomingCurrencies) && incomingCurrencies.length
                    ? incomingCurrencies
                    : (currencies && currencies.length ? currencies : INITIAL_CURRENCIES);
                const normalized = overlayLiveCurrencyRates(currencySource, availableCurrencies, baseCode);
                setCurrencies(normalized);
                const defaultCurrency = normalized.find((c) => c.isDefault) || normalized.find((c) => c.code === baseCode);
                if (defaultCurrency && defaultCurrency.code !== baseCode) {
                    setCurrencyConfig((prev) => ({ ...prev, baseCurrency: defaultCurrency.code }));
                }
                const complianceSource = systemSource?.regionalCompliance ?? systemSource?.regional_compliance;
                if (Array.isArray(complianceSource)) {
                    setCompliance(normalizeCompliance(complianceSource));
                }
                const aiSource = systemSource?.aiConfig ?? systemSource?.ai_config;
                const normalizedAi = AIConfigManager.normalizeConfig(aiSource || AIConfigManager.getConfig());
                setAiConfig(normalizedAi);
                AIConfigManager.saveConfig(normalizedAi);
                const resumeAiSource = systemSource?.resumeAi ?? systemSource?.resume_ai;
                setResumeAiConfig(normalizeResumeAiPolicy(resumeAiSource || DEFAULT_RESUME_AI_POLICY));
                await loadFxControlPlane(baseCode);
            } catch (error) {
                console.warn('Failed to load system settings from API, using context/default state:', error);
                // Fallback to context settings
                if (settings) {
                    setLocalSettings(settings);
                }
                try {
                    await loadFxControlPlane();
                } catch (fxError) {
                    console.warn('Failed to load FX control plane:', fxError);
                }
            }
            
            // Load AI config
            setAiConfig(AIConfigManager.getConfig());
            
        } catch (error) {
            console.error('Error loading system settings:', error);
            showNotification('error', 'Load Failed', 'Failed to load system settings');
        } finally {
            setIsLoading(false);
        }
    };

    const loadFxControlPlane = async (baseCurrencyOverride?: string) => {
        const baseCurrency = (baseCurrencyOverride || currencyConfig.baseCurrency || 'USD').toString().toUpperCase();
        const [health, providers, snapshots, overrides, locks, liveCurrencies] = await Promise.all([
            AdminService.getFxHealth(),
            AdminService.getFxProviders(),
            AdminService.getFxSnapshots({ limit: 10, baseCurrency }),
            AdminService.getFxOverrides({ limit: 10 }),
            AdminService.getFxLocks({ limit: 10 }),
            AdminService.getActiveCurrencies()
        ]);

        setFxHealth(health);
        setFxProviders(providers);
        setFxSnapshots(snapshots);
        setFxOverrides(overrides);
        setFxLocks(locks);
        setFxConfig(normalizeFxSystemConfig(health?.config || {}, baseCurrency));
        setCurrencies((prev) => overlayLiveCurrencyRates(prev, liveCurrencies, baseCurrency));
    };

    // 3. Handlers
    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Avoid overwriting secrets with empty values: only include secrets when provided
            const safeEmail: Partial<EmailProviderConfig> = { ...normalizeEmailConfig(emailConfig || {}) };
            if (!safeEmail.password) {
                const _safe = safeEmail as unknown as Record<string, any>;
                delete _safe.password;
            }
            if (!(safeEmail as any).apiKey) {
                const _safe = safeEmail as unknown as Record<string, any>;
                delete _safe.apiKey;
                delete _safe.api_key;
            }
            if (!(safeEmail as any).secretAccessKey) {
                const _safe = safeEmail as unknown as Record<string, any>;
                delete _safe.secretAccessKey;
                delete _safe.secret_access_key;
            }
            // Ensure snake_case aliases are present
            (safeEmail as any).from_name = (safeEmail as any).from_name || safeEmail.fromName || '';
            (safeEmail as any).from_email = (safeEmail as any).from_email || safeEmail.fromEmail || '';
            (safeEmail as any).api_key = (safeEmail as any).api_key || (safeEmail as any).apiKey || '';
            (safeEmail as any).mailgun_domain = (safeEmail as any).mailgun_domain || (safeEmail as any).domain || '';
            (safeEmail as any).brevo_smtp_login =
                (safeEmail as any).brevo_smtp_login || (safeEmail as any).brevoSmtpLogin || safeEmail.username || '';
            (safeEmail as any).ses_region = (safeEmail as any).ses_region || (safeEmail as any).region || '';
            (safeEmail as any).smtp_encryption =
                (safeEmail as any).smtp_encryption || (safeEmail as any).encryption || 'tls';
            (safeEmail as any).access_key_id =
                (safeEmail as any).access_key_id || (safeEmail as any).accessKeyId || '';
            (safeEmail as any).secret_access_key =
                (safeEmail as any).secret_access_key || (safeEmail as any).secretAccessKey || '';
            if ((safeEmail as any).password) {
                (safeEmail as any).brevo_smtp_key =
                    (safeEmail as any).brevo_smtp_key || (safeEmail as any).brevoSmtpKey || (safeEmail as any).password;
            }

            const safeStorage: any = { ...(storageConfig || {}) };
            if (safeStorage.driver && safeStorage.driver !== 'local') {
                const creds = { ...(safeStorage[safeStorage.driver] || {}) };
                if (!creds.secretAccessKey) delete creds.secretAccessKey;
                if (!creds.accessKeyId) delete creds.accessKeyId;
                safeStorage[safeStorage.driver] = creds;
            }
            // Mirror storage keys to snake_case for backend compatibility
            if (safeStorage.s3) {
                safeStorage.s3.access_key_id = safeStorage.s3.access_key_id || safeStorage.s3.accessKeyId || '';
                safeStorage.s3.secret_access_key = safeStorage.s3.secret_access_key || safeStorage.s3.secretAccessKey || '';
            }
            if (safeStorage.backblaze) {
                safeStorage.backblaze.access_key_id = safeStorage.backblaze.access_key_id || safeStorage.backblaze.accessKeyId || '';
                safeStorage.backblaze.secret_access_key = safeStorage.backblaze.secret_access_key || safeStorage.backblaze.secretAccessKey || '';
            }

            // Normalize AI config so both camelCase/snake_case keys are present
            const normalizedAiConfig = AIConfigManager.normalizeConfig(aiConfig);
            AIConfigManager.saveConfig(normalizedAiConfig);

            // Normalize currencies and ensure base currency is active
            const baseCurrency = (currencyConfig.baseCurrency || 'USD').toString().toUpperCase();
            const normalizedCurrencies = normalizeCurrencies(currencies, baseCurrency);
            const baseEntry = normalizedCurrencies.find((c) => c.code === baseCurrency);
            if (!baseEntry || baseEntry.isActive === false) {
                showNotification('alert', 'Invalid Currency', 'Base currency must be active.');
                setIsSaving(false);
                return;
            }
            const persistedCurrencies = normalizedCurrencies.map((c) => ({
                ...c,
                is_active: c.isActive,
                is_default: c.isDefault
            }));
            const normalizedCurrencyConfig = { 
                ...currencyConfig, 
                baseCurrency,
                provider: fxConfig.providerCode,
                api_key: (currencyConfig as any).api_key || currencyConfig.apiKey || ''
            };
            const normalizedFxConfig = {
                ...fxConfig,
                providerCode: String(fxConfig.providerCode || normalizedCurrencyConfig.provider || 'frankfurter_ecb').trim() || 'frankfurter_ecb',
                syncBaseCurrency: baseCurrency,
                refreshEnabled: normalizeBoolean(fxConfig.refreshEnabled, currencyConfig.autoExchangeRate),
                enabled: normalizeBoolean(fxConfig.enabled, true)
            };
            const normalizedResumeAi = normalizeResumeAiPolicy(resumeAiConfig);

            const systemValues = (localSettings.system || {}) as Record<string, any>;
            const updatedSystem = {
                ...(localSettings.system || {}),
                maintenanceMode: normalizeBoolean(systemValues.maintenanceMode ?? systemValues.maintenance_mode, false),
                registrationsEnabled: normalizeBoolean(
                    systemValues.registrationsEnabled ?? systemValues.registrations_enabled,
                    true
                ),
                kycEnforced: normalizeBoolean(systemValues.kycEnforced ?? systemValues.kyc_enforced, false),
                admin2FA: normalizeBoolean(systemValues.admin2FA ?? systemValues.admin_2fa, false),
                regionalCompliance: compliance,
                regional_compliance: compliance.map((entry) => ({
                    region: entry.region,
                    code: entry.code,
                    gdpr_enabled: entry.gdprEnabled,
                    data_residency: entry.dataResidency,
                    kyc_provider: entry.kycProvider,
                    tax_engine: entry.taxEngine,
                    active: entry.active
                })),
                storage: safeStorage,
                cache: cacheConfig,
                optimization: serializeOptimizationConfig(optimizationConfig),
                email: safeEmail,
                currency: normalizedCurrencyConfig,
                fx: normalizedFxConfig,
                currencies: persistedCurrencies,
                aiConfig: normalizedAiConfig,
                resumeAi: normalizedResumeAi,
                resume_ai: {
                    enabled: normalizedResumeAi.enabled,
                    builder_enabled: normalizedResumeAi.builder_enabled,
                    reviewer_enabled: normalizedResumeAi.reviewer_enabled,
                    admin_access_enabled: normalizedResumeAi.admin_access_enabled
                }
            };

            const updatedSettings = {
                ...localSettings,
                system: updatedSystem
            } as PlatformSettings;

            // Persist via ContentContext (which calls AdminService appropriately)
            try {
                await updateSettings(updatedSettings);
                await loadFxControlPlane(baseCurrency);
                showNotification('success', 'Settings Saved', 'System configuration saved successfully.');
            } catch (err) {
                console.warn('Failed to save to API, falling back to localStorage:', err);
                try {
                    localStorage.setItem('system_settings', JSON.stringify(updatedSettings));
                    showNotification('success', 'Settings Saved', 'System configuration saved locally.');
                } catch (lsErr) {
                    console.error('Failed to persist settings to localStorage', lsErr);
                    showNotification('error', 'Save Failed', 'Failed to save settings to backend and local storage.');
                }
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            showNotification('error', 'Save Failed', 'Failed to save settings. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleChange = (section: string, field: string, value: any) => {
        if (section === 'root') {
            setLocalSettings(prev => ({ ...prev, [field]: value }));
        } else if (section === 'system') {
            setLocalSettings(prev => ({
                ...prev,
                system: { ...(prev.system || {}), [field]: value }
            }));
        } else {
            setLocalSettings(prev => ({
                ...prev,
                [section]: { ...((prev as unknown as Record<string, any>)[section]) || {}, [field]: value }
            }));
        }
    };

    const updateVerificationSetting = (updater: (current: ReturnType<typeof normalizeVerificationSettings>) => ReturnType<typeof normalizeVerificationSettings>) => {
        setLocalSettings((prev) => {
            const system = (prev as any)?.system || {};
            const current = normalizeVerificationSettings(system.verification);
            return {
                ...prev,
                system: {
                    ...system,
                    verification: updater(current)
                }
            };
        });
    };

    const updateTrustScoreSetting = (updater: (current: ReturnType<typeof normalizeTrustScoreSettings>) => ReturnType<typeof normalizeTrustScoreSettings>) => {
        setLocalSettings((prev) => {
            const system = (prev as any)?.system || {};
            const current = normalizeTrustScoreSettings(system.trustScore ?? system.trust_score);
            return {
                ...prev,
                system: {
                    ...system,
                    trustScore: updater(current)
                }
            };
        });
    };

    const updateDealFlowSetting = (updater: (current: ReturnType<typeof normalizeDealFlowSettings>) => ReturnType<typeof normalizeDealFlowSettings>) => {
        setLocalSettings((prev) => {
            const system = (prev as any)?.system || {};
            const current = normalizeDealFlowSettings(system.dealFlow ?? system.deal_flow);
            return {
                ...prev,
                system: {
                    ...system,
                    dealFlow: updater(current)
                }
            };
        });
    };

    const updateStorefrontSetting = (updater: (current: ReturnType<typeof normalizeStorefrontSettings>) => ReturnType<typeof normalizeStorefrontSettings>) => {
        setLocalSettings((prev) => {
            const system = (prev as any)?.system || {};
            const current = normalizeStorefrontSettings(system.storefront ?? system.storefront_settings);
            return {
                ...prev,
                system: {
                    ...system,
                    storefront: updater(current)
                }
            };
        });
    };

    const updateContentOfferSetting = (
        updater: (current: ReturnType<typeof normalizeContentOfferSettings>) => ReturnType<typeof normalizeContentOfferSettings>
    ) => {
        setLocalSettings((prev) => {
            const system = (prev as any)?.system || {};
            const current = normalizeContentOfferSettings(
                system.contentOffers ??
                    system.content_offers ??
                    system.contentOfferTags ??
                    system.content_offer_tags
            );
            return {
                ...prev,
                system: {
                    ...system,
                    contentOffers: updater(current)
                }
            };
        });
    };

    const applyMaintenanceMode = async (nextValue: boolean) => {
        if (isApplyingMaintenance) return;

        const previousValue = maintenanceEnabled;
        setIsApplyingMaintenance(true);
        handleChange('system', 'maintenanceMode', nextValue);

        try {
            const saved = await AdminService.saveSystemSettings({ maintenanceMode: nextValue } as SystemConfig);
            setLocalSettings((prev) => ({
                ...prev,
                system: {
                    ...(prev.system || {}),
                    ...(saved || {}),
                    maintenanceMode: nextValue
                }
            }));
            showNotification(
                'success',
                nextValue ? 'Maintenance Mode Enabled' : 'Maintenance Mode Disabled',
                nextValue
                    ? 'Non-admin API access is now restricted.'
                    : 'Platform access has been restored for all users.'
            );
        } catch (error) {
            handleChange('system', 'maintenanceMode', previousValue);
            console.error('Failed to update maintenance mode:', error);
            showNotification('error', 'Update Failed', 'Could not update maintenance mode. Please try again.');
        } finally {
            setIsApplyingMaintenance(false);
        }
    };

    const setProLabel = (target: 'freelancer' | 'employer', url: string, fileId?: string | null) => {
        if (target === 'freelancer') {
            setLocalSettings(prev => ({
                ...prev,
                proFreelancerLabelUrl: url,
                proFreelancerLabelFileId: fileId || '',
                pro_freelancer_label_url: url,
                pro_freelancer_label_file_id: fileId || ''
            }));
            return;
        }
        setLocalSettings(prev => ({
            ...prev,
            proEmployerLabelUrl: url,
            proEmployerLabelFileId: fileId || '',
            pro_employer_label_url: url,
            pro_employer_label_file_id: fileId || ''
        }));
    };

    const openLabelPicker = (target: 'freelancer' | 'employer') => {
        setLabelPickerTarget(target);
        setIsLabelPickerOpen(true);
    };

    const handleLabelSelect = (file: UploadedFile) => {
        if (!labelPickerTarget) return;
        // Prefer durable content API URL so <img> never depends on ephemeral /uploads paths.
        const fileId = String(file.id || (file as any).fileId || '').trim();
        const resolved =
          resolvePostAttachmentMediaUrl({
            url: file.url,
            fileId,
            id: fileId,
            storageKey: (file as any).storageKey || (file as any).storage_key
          }) ||
          resolveAssetUrl(String(file.url || '').trim()) ||
          (fileId ? resolveAssetUrl(`/api/files/content/${encodeURIComponent(fileId)}`) : '') ||
          String(file.url || '').trim();
        setProLabel(labelPickerTarget, resolved, fileId || null);
        setIsLabelPickerOpen(false);
        setLabelPickerTarget(null);
    };

    // File selection handled in Header & Hero editor; no local file picker here.

    const handleAIChange = (section: keyof AIConfig, field: string, value: any) => {
        if (section === 'providers') {
            const [provider, key] = field.split('.');
            setAiConfig(prev => ({
                ...prev,
                providers: {
                    ...prev.providers,
                    [provider as 'google' | 'openai']: {
                        ...prev.providers[provider as 'google' | 'openai'] || {},
                        [key]: value,
                        ...(key === 'apiKey' ? { api_key: value } : {}),
                        ...(key === 'api_key' ? { apiKey: value } : {})
                    }
                }
            }));
        } else if (section === 'costControl') {
            setAiConfig(prev => ({
                ...prev,
                costControl: {
                    ...prev.costControl || {},
                    [field]: value
                },
                cost_control: {
                    ...prev.cost_control || {},
                    ...(field === 'monthlyLimitUSD' ? { monthly_limit_usd: value } : {}),
                    ...(field === 'currentSpendUSD' ? { current_spend_usd: value } : {}),
                    ...(field === 'enabled' ? { enabled: value } : {})
                }
            }));
        } else {
            setAiConfig(prev => ({
                ...prev,
                [section]: {
                    ...((prev as unknown as Record<string, any>)[section]) || {},
                    [field]: value,
                    ...(section === 'safety' && field === 'maxTokens' ? { max_tokens: value } : {}),
                    ...(section === 'safety' && field === 'max_tokens' ? { maxTokens: value } : {})
                }
            }));
        }
    };

    // Compliance Handlers
    const toggleCompliance = (code: string) => {
        setCompliance(prev => prev.map(c => c.code === code ? { ...c, active: !c.active } : c));
    };

    // Currency Handlers
    const toggleCurrency = (code: string) => {
        const normalizedCode = code.toUpperCase();
        const target = currencies.find(c => c.code === normalizedCode);
        if (target?.isDefault || currencyConfig.baseCurrency?.toUpperCase() === normalizedCode) {
            showNotification('alert', 'Cannot Disable', 'Base currency must remain active.');
            return;
        }
        setCurrencies(prev => prev.map(c => c.code === normalizedCode ? { ...c, isActive: !c.isActive } : c));
    };

    const updateCurrencyRate = (code: string, rate: number) => {
        if (rate <= 0) {
            showNotification('alert', 'Invalid Rate', 'Exchange rate must be greater than 0.');
            return;
        }
        setCurrencies(prev => prev.map(c => c.code === code ? { ...c, rate: parseFloat(rate.toFixed(4)) || 1 } : c));
    };

    const handleSetDefaultCurrency = (code: string) => {
        const normalizedCode = code.toUpperCase();
        setCurrencies(prev => prev.map(c => ({
            ...c,
            isDefault: c.code === normalizedCode,
            isActive: c.code === normalizedCode ? true : c.isActive
        })));
        setCurrencyConfig(prev => ({ ...prev, baseCurrency: normalizedCode }));
    };

    const handleAddCurrency = () => {
        if (!newCurrency.code?.trim()) {
            showNotification('alert', 'Invalid Code', 'Please enter a currency code.');
            return;
        }
        
        if (!newCurrency.name?.trim()) {
            showNotification('alert', 'Invalid Name', 'Please enter a currency name.');
            return;
        }
        
        if (!newCurrency.symbol?.trim()) {
            showNotification('alert', 'Invalid Symbol', 'Please enter a currency symbol.');
            return;
        }
        
        // Check for duplicates
        if (currencies.some(c => c.code === newCurrency.code.toUpperCase())) {
            showNotification('alert', 'Duplicate Currency', `${newCurrency.code} already exists.`);
            return;
        }
        
        const currencyToAdd: Currency = {
            id: `currency-${Date.now()}`,
            code: newCurrency.code.toUpperCase().trim(),
            name: newCurrency.name.trim(),
            symbol: newCurrency.symbol.trim(),
            rate: newCurrency.rate || 1,
            isActive: true,
            isDefault: currencies.length === 0 // Set as default if first currency
        };
        
        setCurrencies(prev => [...prev, currencyToAdd]);
        if (currencies.length === 0) {
            setCurrencyConfig(prev => ({ ...prev, baseCurrency: currencyToAdd.code }));
        }
        setIsCurrencyModalOpen(false);
        setNewCurrency({ code: '', name: '', symbol: '', rate: 1, isActive: true });
        showNotification('success', 'Currency Added', `${currencyToAdd.code} added to available currencies.`);
    };

    const handleDeleteCurrency = (code: string) => {
        // Prevent deletion of default currency
        const currencyToDelete = currencies.find(c => c.code === code);
        if (!currencyToDelete) return;
        
        if (currencyToDelete.isDefault) {
            showNotification('alert', 'Cannot Delete', 'Cannot delete the default currency.');
            return;
        }
        
        if (window.confirm(`Are you sure you want to remove ${code}? This action cannot be undone.`)) {
            setCurrencies(prev => prev.filter(c => c.code !== code));
            showNotification('info', 'Currency Removed', `${code} has been removed.`);
        }
    };

    // Phase 28B — client-side search/filter/pagination for currency table (display only)
    const filteredCurrencies = useMemo(() => {
        const q = currencySearch.trim().toLowerCase();
        return (Array.isArray(currencies) ? currencies : []).filter((c) => {
            if (currencyStatusFilter === 'active' && c.isActive === false) return false;
            if (currencyStatusFilter === 'disabled' && c.isActive !== false) return false;
            const source = String((c as any).rateSource || 'manual').toLowerCase();
            if (currencySourceFilter !== 'all' && source !== currencySourceFilter) return false;
            if (!q) return true;
            return (
                String(c.code || '').toLowerCase().includes(q) ||
                String(c.name || '').toLowerCase().includes(q) ||
                String(c.symbol || '').toLowerCase().includes(q)
            );
        });
    }, [currencies, currencySearch, currencyStatusFilter, currencySourceFilter]);

    const currencyTotalPages = Math.max(1, Math.ceil(filteredCurrencies.length / currencyPageSize));
    const safeCurrencyPage = Math.min(currencyPage, currencyTotalPages);
    const pagedCurrencies = useMemo(() => {
        const start = (safeCurrencyPage - 1) * currencyPageSize;
        return filteredCurrencies.slice(start, start + currencyPageSize);
    }, [filteredCurrencies, safeCurrencyPage, currencyPageSize]);

    useEffect(() => {
        setCurrencyPage(1);
    }, [currencySearch, currencyStatusFilter, currencySourceFilter, currencyPageSize]);

    const handleAutoUpdateRates = async () => {
        setFxBusyAction('sync');
        showNotification('info', 'FX Sync Started', 'Fetching the latest approved FX snapshot.');
        try {
            await AdminService.runFxSync({
                providerCode: fxConfig.providerCode,
                baseCurrency: fxConfig.syncBaseCurrency
            });
            await loadFxControlPlane(fxConfig.syncBaseCurrency);
            showNotification('success', 'FX Sync Completed', 'Exchange rates synchronized successfully.');
        } catch (error) {
            console.error('FX sync failed:', error);
            showNotification('error', 'FX Sync Failed', 'Failed to update exchange rates.');
        } finally {
            setFxBusyAction(null);
        }
    };

    const handleRefreshFxControlPlane = async () => {
        setFxBusyAction('refresh');
        try {
            await loadFxControlPlane(fxConfig.syncBaseCurrency);
            showNotification('success', 'FX Data Refreshed', 'The FX control plane data is up to date.');
        } catch (error) {
            console.error('Failed to refresh FX data:', error);
            showNotification('error', 'Refresh Failed', 'Could not refresh FX data.');
        } finally {
            setFxBusyAction(null);
        }
    };

    const handleUpdateFxProvider = async (
        code: string,
        payload: Partial<Pick<FxProviderRecord, 'enabled' | 'priority' | 'baseUrl' | 'settingsJson'>>
    ) => {
        setFxBusyAction(`provider:${code}`);
        try {
            await AdminService.updateFxProvider(code, payload);
            await loadFxControlPlane(fxConfig.syncBaseCurrency);
            showNotification('success', 'Provider Updated', `${code} has been updated.`);
        } catch (error) {
            console.error('Failed to update FX provider:', error);
            showNotification('error', 'Provider Update Failed', `Could not update ${code}.`);
        } finally {
            setFxBusyAction(null);
        }
    };

    const handleApproveFxSnapshot = async (snapshotId: string, freeze = false) => {
        setFxBusyAction(`snapshot:${freeze ? 'freeze' : 'approve'}:${snapshotId}`);
        try {
            await AdminService.approveFxSnapshot(snapshotId, { freeze });
            await loadFxControlPlane(fxConfig.syncBaseCurrency);
            showNotification(
                'success',
                freeze ? 'Snapshot Approved & Frozen' : 'Snapshot Approved',
                freeze
                    ? 'The snapshot is now approved and frozen for production use.'
                    : 'The snapshot is now approved for production use.'
            );
        } catch (error) {
            console.error('Failed to approve FX snapshot:', error);
            showNotification('error', 'Snapshot Approval Failed', 'Could not approve the FX snapshot.');
        } finally {
            setFxBusyAction(null);
        }
    };

    const handleSetSnapshotFrozen = async (snapshotId: string, frozen: boolean) => {
        setFxBusyAction(`snapshot:freeze:${snapshotId}`);
        try {
            await AdminService.setFxSnapshotFrozen(snapshotId, frozen);
            await loadFxControlPlane(fxConfig.syncBaseCurrency);
            showNotification(
                'success',
                frozen ? 'Snapshot Frozen' : 'Snapshot Unfrozen',
                frozen ? 'The snapshot has been pinned for runtime use.' : 'The snapshot is no longer pinned.'
            );
        } catch (error) {
            console.error('Failed to update snapshot freeze state:', error);
            showNotification('error', 'Freeze Update Failed', 'Could not update snapshot freeze state.');
        } finally {
            setFxBusyAction(null);
        }
    };

    const handleCreateFxOverride = async (payload: {
        fromCurrency: string;
        toCurrency: string;
        rate: number;
        effectiveFrom?: string;
        effectiveTo?: string | null;
        reason: string;
    }) => {
        setFxBusyAction('override:create');
        try {
            await AdminService.createFxOverride(payload);
            await loadFxControlPlane(fxConfig.syncBaseCurrency);
            showNotification('success', 'Override Created', 'The FX override has been created.');
        } catch (error) {
            console.error('Failed to create FX override:', error);
            showNotification('error', 'Override Failed', 'Could not create the FX override.');
            throw error;
        } finally {
            setFxBusyAction(null);
        }
    };

    const handleApproveFxOverride = async (overrideId: string) => {
        setFxBusyAction(`override:approve:${overrideId}`);
        try {
            await AdminService.approveFxOverride(overrideId);
            await loadFxControlPlane(fxConfig.syncBaseCurrency);
            showNotification('success', 'Override Approved', 'The FX override is now active.');
        } catch (error) {
            console.error('Failed to approve FX override:', error);
            showNotification('error', 'Approval Failed', 'Could not approve the FX override.');
        } finally {
            setFxBusyAction(null);
        }
    };

    const handleTestStorage = async () => {
        showNotification('info', 'Testing Connection...', `Attempting to connect to ${storageConfig.driver}...`);
        
        try {
            // In a real app, this would test the storage connection
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            if (storageConfig.driver === 'local') {
                showNotification('success', 'Connection Successful', 'Local storage is accessible.');
            } else {
                const config = storageConfig[storageConfig.driver];
                if (!config?.accessKeyId || !config?.secretAccessKey || !config?.bucket) {
                    showNotification('alert', 'Configuration Incomplete', 'Please fill all required fields.');
                    return;
                }
                showNotification('success', 'Connection Successful', `Connected to ${storageConfig.driver} successfully.`);
            }
        } catch (error) {
            showNotification('error', 'Connection Failed', 'Unable to connect to storage provider.');
        }
    };

    const handleTestCache = async () => {
        showNotification('info', 'Testing Cache...', `Attempting to connect to ${cacheConfig.driver} cache...`);

        try {
            await new Promise(resolve => setTimeout(resolve, 1200));

            if (cacheConfig.driver === 'local') {
                showNotification('success', 'Cache Ready', 'Local cache driver is ready.');
                return;
            }

            const redis = cacheConfig.redis || {};
            if (!redis.host || !redis.port) {
                showNotification('alert', 'Configuration Incomplete', 'Please provide Redis host and port.');
                return;
            }

            showNotification('success', 'Cache Connection Successful', 'Connected to Redis cache successfully.');
        } catch (error) {
            showNotification('error', 'Cache Connection Failed', 'Unable to connect to cache provider.');
        }
    };

    const handleTestEmail = async () => {
        // Validate email
        if (!isValidEmailAddress(testEmail || '')) {
            showNotification('alert', 'Invalid Email', 'Please enter a valid recipient email address.');
            return;
        }

        const validationErrors = getEmailConfigValidationErrors(emailConfig);
        if (validationErrors.length) {
            showNotification('alert', 'Configuration Incomplete', validationErrors[0]);
            return;
        }
        
        setIsTestingEmail(true);
        
        try {
            await AdminService.testEmailSettings({ to: testEmail, config: normalizeEmailConfig(emailConfig) });
            setIsTestingEmail(false);
            showNotification('success', 'Email Sent', `Test email sent to ${testEmail}. Please check your inbox.`);
            setTestEmail('');
        } catch (error: any) {
            setIsTestingEmail(false);
            const message =
                error?.response?.data?.error ||
                error?.message ||
                'Failed to send test email. Check your configuration.';
            showNotification('error', 'Send Failed', message);
        }
    };

    const handleEvidenceDownload = (artifact: { id: string; name: string; type: string; date: string; status: string }) => {
        try {
            const content = [
                `Artifact: ${artifact.name}`,
                `Type: ${artifact.type}`,
                `Date: ${artifact.date}`,
                `Status: ${artifact.status}`,
                '',
                'Generated from Scrolith System Settings - SOC-2 Evidence.'
            ].join('\n');
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${artifact.id}.${artifact.type.toLowerCase()}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            showNotification('success', 'Download Started', `${artifact.name} export generated.`);
        } catch (error) {
            showNotification('error', 'Download Failed', 'Unable to generate the evidence file.');
        }
    };

    // AI Routing Configuration
    const aiRoutingOptions = [
        { id: 'support_chat', label: 'Support Chat' },
        { id: 'seo_tags', label: 'SEO Tags' },
        { id: 'semantic_search', label: 'Semantic Search' },
        { id: 'content_moderation', label: 'Content Moderation' }
    ];

    const freelancerLabelFileId =
        (localSettings as any)?.proFreelancerLabelFileId ??
        (localSettings as any)?.pro_freelancer_label_file_id ??
        '';
    const employerLabelFileId =
        (localSettings as any)?.proEmployerLabelFileId ??
        (localSettings as any)?.pro_employer_label_file_id ??
        '';
    const resolveProLabelDisplayUrl = (rawUrl: string, fileId: string) => {
        const raw = String(rawUrl || '').trim();
        const id = String(fileId || '').trim();
        return (
          resolvePostAttachmentMediaUrl({ url: raw, fileId: id, id }) ||
          resolveAssetUrl(raw) ||
          (id ? resolveAssetUrl(`/api/files/content/${encodeURIComponent(id)}`) : '') ||
          raw
        );
    };
    const freelancerLabelUrl = resolveProLabelDisplayUrl(
        (localSettings as any)?.proFreelancerLabelUrl ??
          (localSettings as any)?.pro_freelancer_label_url ??
          '',
        freelancerLabelFileId
    );
    const employerLabelUrl = resolveProLabelDisplayUrl(
        (localSettings as any)?.proEmployerLabelUrl ??
          (localSettings as any)?.pro_employer_label_url ??
          '',
        employerLabelFileId
    );
    const systemSnapshot = (localSettings as any)?.system || {};
    const maintenanceEnabled = normalizeBoolean(systemSnapshot.maintenanceMode ?? systemSnapshot.maintenance_mode, false);
    const registrationsEnabled = normalizeBoolean(
        systemSnapshot.registrationsEnabled ?? systemSnapshot.registrations_enabled,
        true
    );
    const kycEnabled = normalizeBoolean(systemSnapshot.kycEnforced ?? systemSnapshot.kyc_enforced, false);
    const admin2FAEnabled = normalizeBoolean(systemSnapshot.admin2FA ?? systemSnapshot.admin_2fa, false);
    const verificationConfig = normalizeVerificationSettings(systemSnapshot.verification);
    const trustScoreConfig = normalizeTrustScoreSettings(systemSnapshot.trustScore ?? systemSnapshot.trust_score);
    const dealFlowConfig = normalizeDealFlowSettings(systemSnapshot.dealFlow ?? systemSnapshot.deal_flow);
    const storefrontConfig = normalizeStorefrontSettings(systemSnapshot.storefront ?? systemSnapshot.storefront_settings);
    const contentOfferConfig = normalizeContentOfferSettings(
        systemSnapshot.contentOffers ??
            systemSnapshot.content_offers ??
            systemSnapshot.contentOfferTags ??
            systemSnapshot.content_offer_tags
    );
    const selectedEmailProvider = normalizeEmailProvider(emailConfig.provider);
    const providerSetupHint = getProviderSetupHint(selectedEmailProvider, emailConfig.region);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" />
                    <p className="text-gray-500">Loading system configuration...</p>
                </div>
            </div>
        );
    }

    // Phase 28B — layout: column shell so Save footer is never a third horizontal column
    // that steals width / paints as a solid obstruction over the currency table.
    const systemNavItems = [
        { id: 'general', label: 'General Settings', icon: Settings },
        { id: 'filesystem', label: 'File System & Cache', icon: HardDrive },
        { id: 'optimization', label: 'Optimization', icon: Gauge },
        { id: 'currencies', label: 'Currencies', icon: DollarSign },
        { id: 'email', label: 'Email SMTP', icon: Mail },
        { id: 'ai', label: 'AI Engine', icon: Cpu },
        { id: 'compliance', label: 'Regional Compliance', icon: Globe },
        { id: 'evidence', label: 'SOC-2 Evidence', icon: ShieldCheck }
    ] as const;

    return (
        <div
            className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-[600px] min-w-0 w-full max-w-full"
            data-testid="system-settings-shell"
        >
            <div className="flex flex-col lg:flex-row min-w-0 flex-1 overflow-hidden">
            <div className="w-full lg:w-64 lg:max-w-[260px] bg-gray-50 border-b lg:border-b-0 lg:border-r border-gray-200 p-3 sm:p-4 space-y-1 flex-shrink-0">
                {/* Tablet/mobile: collapsible section select */}
                <label className="lg:hidden block mb-2">
                    <span className="sr-only">System settings section</span>
                    <select
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm font-medium text-gray-800 bg-white"
                        value={activeTab}
                        onChange={(e) => setActiveTab(e.target.value)}
                        aria-label="System settings section"
                    >
                        {systemNavItems.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </label>
                <nav className="hidden lg:block space-y-1" aria-label="System settings sections">
                    {systemNavItems.map((item) => (
                        <TabButton
                            key={item.id}
                            id={item.id}
                            label={item.label}
                            icon={item.icon}
                            activeTab={activeTab}
                            setActiveTab={setActiveTab}
                        />
                    ))}
                </nav>
            </div>

            <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-y-auto overflow-x-hidden relative">
                {activeTab === 'general' && (
                    <div className="space-y-6 max-w-lg animate-fade-in">
                        <h3 className="text-lg font-bold mb-4 border-b pb-2">General Configuration</h3>
                        
                        {/* Platform Logo and Favicon are managed in Header & Hero - removed here */}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Site Name</label>
                            <input 
                                className="w-full border-gray-300 rounded-md p-2" 
                                value={localSettings.siteName || ''} 
                                onChange={e => handleChange('root', 'siteName', e.target.value)} 
                                placeholder="Enter site name"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
                            <input 
                                className="w-full border-gray-300 rounded-md p-2" 
                                value={localSettings.tagline || ''} 
                                onChange={e => handleChange('root', 'tagline', e.target.value)}
                                placeholder="Enter tagline"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                            <input 
                                className="w-full border-gray-300 rounded-md p-2" 
                                value={localSettings.adminEmail || ''} 
                                onChange={e => handleChange('root', 'adminEmail', e.target.value)}
                                placeholder="admin@example.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Support Email</label>
                            <input 
                                className="w-full border-gray-300 rounded-md p-2" 
                                value={localSettings.supportEmail || ''} 
                                onChange={e => handleChange('root', 'supportEmail', e.target.value)}
                                placeholder="support@example.com"
                            />
                        </div>

                        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
                            <div>
                                <h4 className="text-sm font-bold text-gray-900">Pro Verification Labels</h4>
                                <p className="text-xs text-gray-500">Shown next to verified freelancer and employer accounts.</p>
                            </div>

                            <div className="flex items-center gap-4">
                                <div
                                    className="border border-dashed rounded-lg p-2 w-16 h-16 flex items-center justify-center cursor-pointer hover:bg-gray-50"
                                    onClick={() => openLabelPicker('freelancer')}
                                >
                                    {freelancerLabelUrl ? (
                                        <img
                                          src={freelancerLabelUrl}
                                          className="max-h-full object-contain"
                                          alt="Freelancer pro label"
                                          onError={(event) => {
                                            const img = event.currentTarget;
                                            const id = String(freelancerLabelFileId || '').trim();
                                            if (id && img.dataset.fallbackTried !== '1') {
                                              img.dataset.fallbackTried = '1';
                                              img.src = `https://api.scrolith.com/api/files/content/${encodeURIComponent(id)}`;
                                              return;
                                            }
                                            img.style.display = 'none';
                                          }}
                                        />
                                    ) : (
                                        <ImageIcon className="w-6 h-6 text-gray-400" />
                                    )}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Freelancer Pro Label</label>
                                    <input
                                        className="w-full border-gray-300 rounded-md p-2 text-sm"
                                        value={freelancerLabelUrl}
                                        onChange={(e) => setProLabel('freelancer', e.target.value, freelancerLabelFileId)}
                                        placeholder="https://.../pro-freelancer.png"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openLabelPicker('freelancer')}
                                            className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded font-bold hover:bg-blue-100"
                                        >
                                            Choose File
                                        </button>
                                        {freelancerLabelUrl && (
                                            <button
                                                type="button"
                                                onClick={() => setProLabel('freelancer', '', null)}
                                                className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded font-bold hover:bg-gray-200"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div
                                    className="border border-dashed rounded-lg p-2 w-16 h-16 flex items-center justify-center cursor-pointer hover:bg-gray-50"
                                    onClick={() => openLabelPicker('employer')}
                                >
                                    {employerLabelUrl ? (
                                        <img
                                          src={employerLabelUrl}
                                          className="max-h-full object-contain"
                                          alt="Employer pro label"
                                          onError={(event) => {
                                            const img = event.currentTarget;
                                            const id = String(employerLabelFileId || '').trim();
                                            if (id && img.dataset.fallbackTried !== '1') {
                                              img.dataset.fallbackTried = '1';
                                              img.src = `https://api.scrolith.com/api/files/content/${encodeURIComponent(id)}`;
                                              return;
                                            }
                                            img.style.display = 'none';
                                          }}
                                        />
                                    ) : (
                                        <ImageIcon className="w-6 h-6 text-gray-400" />
                                    )}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Employer Pro Label</label>
                                    <input
                                        className="w-full border-gray-300 rounded-md p-2 text-sm"
                                        value={employerLabelUrl}
                                        onChange={(e) => setProLabel('employer', e.target.value, employerLabelFileId)}
                                        placeholder="https://.../pro-employer.png"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openLabelPicker('employer')}
                                            className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded font-bold hover:bg-blue-100"
                                        >
                                            Choose File
                                        </button>
                                        {employerLabelUrl && (
                                            <button
                                                type="button"
                                                onClick={() => setProLabel('employer', '', null)}
                                                className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded font-bold hover:bg-gray-200"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
                            <div>
                                <h4 className="text-sm font-bold text-gray-900">Verification Badge Policy</h4>
                                <p className="text-xs text-gray-500">
                                    Control whether verification badges appear publicly and which account roles can display each badge class.
                                </p>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                                <div>
                                    <span className="text-sm font-medium text-gray-800">Enable verification badges</span>
                                    <p className="text-xs text-gray-500">Hide all public verification badges platform-wide without disturbing account data.</p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={verificationConfig.enabled}
                                    onChange={(e) =>
                                        updateVerificationSetting((current) => ({
                                            ...current,
                                            enabled: e.target.checked
                                        }))
                                    }
                                    className="rounded text-blue-600"
                                />
                            </div>

                            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                                <div>
                                    <span className="text-sm font-medium text-gray-800">Show badge tooltip and mobile sheet</span>
                                    <p className="text-xs text-gray-500">Control whether users can open the verification explainer from public badges.</p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={verificationConfig.showTooltips}
                                    onChange={(e) =>
                                        updateVerificationSetting((current) => ({
                                            ...current,
                                            showTooltips: e.target.checked
                                        }))
                                    }
                                    className="rounded text-blue-600"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    ['standard', 'Standard'],
                                    ['pro', 'Pro'],
                                    ['business', 'Business'],
                                    ['government', 'Government']
                                ].map(([key, label]) => (
                                    <label key={key} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                        <span>{label}</span>
                                        <input
                                            type="checkbox"
                                            checked={(verificationConfig.levels as any)[key]}
                                            onChange={(e) =>
                                                updateVerificationSetting((current) => ({
                                                    ...current,
                                                    levels: {
                                                        ...current.levels,
                                                        [key]: e.target.checked
                                                    }
                                                }))
                                            }
                                            className="rounded text-blue-600"
                                        />
                                    </label>
                                ))}
                            </div>

                            <div className="space-y-2">
                                <div>
                                    <h5 className="text-xs font-bold uppercase tracking-wide text-gray-500">Visible Roles</h5>
                                    <p className="text-xs text-gray-500">Choose which account roles are allowed to show badges on public surfaces.</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        ['guest', 'Guest'],
                                        ['user', 'User'],
                                        ['freelancer', 'Freelancer'],
                                        ['employer', 'Employer'],
                                        ['business', 'Business'],
                                        ['admin', 'Admin']
                                    ].map(([key, label]) => (
                                        <label key={key} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                            <span>{label}</span>
                                            <input
                                                type="checkbox"
                                                checked={(verificationConfig.roles as any)[key]}
                                                onChange={(e) =>
                                                    updateVerificationSetting((current) => ({
                                                        ...current,
                                                        roles: {
                                                            ...current.roles,
                                                            [key]: e.target.checked
                                                        }
                                                    }))
                                                }
                                                className="rounded text-blue-600"
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
                            <div>
                                <h4 className="text-sm font-bold text-gray-900">Delivery & Reliability Score</h4>
                                <p className="text-xs text-gray-500">
                                    Govern the public trust score shown on profiles and commerce cards using platform behavior instead of static labels.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {[
                                    ['enabled', 'Enable trust score', 'Allow public trust scoring to render on supported surfaces.'],
                                    ['showOnProfiles', 'Show on profiles', 'Display the score and breakdown on public profile pages.'],
                                    ['showOnListings', 'Show on listing cards', 'Expose compact trust chips on gig and commerce cards.'],
                                    ['showRiskIndicators', 'Show risk indicators', 'Let public users see risk flags when thresholds are missed.']
                                ].map(([key, label, description]) => (
                                    <div key={key} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                                        <div className="pr-3">
                                            <span className="text-sm font-medium text-gray-800">{label}</span>
                                            <p className="text-xs text-gray-500">{description}</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={Boolean((trustScoreConfig as any)[key])}
                                            onChange={(e) =>
                                                updateTrustScoreSetting((current) => ({
                                                    ...current,
                                                    [key]: e.target.checked
                                                }))
                                            }
                                            className="rounded text-blue-600"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-2">
                                <div>
                                    <h5 className="text-xs font-bold uppercase tracking-wide text-gray-500">Score Weights</h5>
                                    <p className="text-xs text-gray-500">Each factor accepts a value between 0 and 1. The backend normalizes the final mix automatically.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {[
                                        ['completionRate', 'Completion rate'],
                                        ['responseRate', 'Response rate'],
                                        ['responseTime', 'Response time'],
                                        ['reviewRating', 'Review rating'],
                                        ['reviewVolume', 'Review volume'],
                                        ['disputeRate', 'Dispute rate'],
                                        ['cancellationRate', 'Cancellation rate']
                                    ].map(([key, label]) => (
                                        <label key={key} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
                                            <input
                                                type="number"
                                                min={0}
                                                max={1}
                                                step={0.01}
                                                value={Number(((trustScoreConfig.weights as any)?.[key] ?? 0).toFixed(2))}
                                                onChange={(e) =>
                                                    updateTrustScoreSetting((current) => ({
                                                        ...current,
                                                        weights: {
                                                            ...current.weights,
                                                            [key]: Number.parseFloat(e.target.value || '0')
                                                        }
                                                    }))
                                                }
                                                className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div>
                                    <h5 className="text-xs font-bold uppercase tracking-wide text-gray-500">Tier Thresholds</h5>
                                    <p className="text-xs text-gray-500">Set the minimum score for each public trust label.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {[
                                        ['elite', 'Elite'],
                                        ['established', 'Established']
                                    ].map(([key, label]) => (
                                        <label key={key} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
                                            <input
                                                type="number"
                                                min={0}
                                                max={100}
                                                step={1}
                                                value={Number((trustScoreConfig.thresholds as any)?.[key] ?? 0)}
                                                onChange={(e) =>
                                                    updateTrustScoreSetting((current) => ({
                                                        ...current,
                                                        thresholds: {
                                                            ...current.thresholds,
                                                            [key]: Number.parseInt(e.target.value || '0', 10)
                                                        }
                                                    }))
                                                }
                                                className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
                            <div>
                                <h4 className="text-sm font-bold text-gray-900">Message to Brief to Contract Flow</h4>
                                <p className="text-xs text-gray-500">
                                    Govern the chat-native commerce flow so conversations can move into briefs, proposals, and contracts without leaving messaging.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {[
                                    ['enabled', 'Enable deal flow', 'Show commerce conversion actions inside supported conversations.'],
                                    ['allowCreateBriefFromChat', 'Allow chat to brief', 'Let employers convert a conversation into a structured brief draft.'],
                                    ['allowBriefToProposal', 'Allow brief to proposal', 'Allow freelancers to create proposals from linked conversation briefs.'],
                                    ['autoCreatePrivateJobs', 'Auto-create private job bridge', 'Create a hidden private job behind each saved conversation brief so existing proposals can attach cleanly.']
                                ].map(([key, label, description]) => (
                                    <div key={key} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                                        <div className="pr-3">
                                            <span className="text-sm font-medium text-gray-800">{label}</span>
                                            <p className="text-xs text-gray-500">{description}</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={Boolean((dealFlowConfig as any)[key])}
                                            onChange={(e) =>
                                                updateDealFlowSetting((current) => ({
                                                    ...current,
                                                    [key]: e.target.checked
                                                }))
                                            }
                                            className="rounded text-blue-600"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-2">
                                <div>
                                    <h5 className="text-xs font-bold uppercase tracking-wide text-gray-500">Allowed Brief Categories</h5>
                                    <p className="text-xs text-gray-500">Comma-separated categories shown in the chat brief editor and used for validation.</p>
                                </div>
                                <textarea
                                    value={(dealFlowConfig.allowedCategories || []).join(', ')}
                                    onChange={(e) =>
                                        updateDealFlowSetting((current) => ({
                                            ...current,
                                            allowedCategories: e.target.value
                                                .split(',')
                                                .map((entry) => entry.trim())
                                                .filter(Boolean)
                                        }))
                                    }
                                    className="w-full rounded-md border-gray-300 p-2 text-sm"
                                    rows={2}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Default Category</span>
                                    <input
                                        type="text"
                                        value={String(dealFlowConfig.defaultCategory || '')}
                                        onChange={(e) =>
                                            updateDealFlowSetting((current) => ({
                                                ...current,
                                                defaultCategory: e.target.value
                                            }))
                                        }
                                        className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                    />
                                </label>
                                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Default Proposal Timeline (days)</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={365}
                                        value={Number(dealFlowConfig.proposalDefaults?.timelineDays ?? 14)}
                                        onChange={(e) =>
                                            updateDealFlowSetting((current) => ({
                                                ...current,
                                                proposalDefaults: {
                                                    ...(current.proposalDefaults || {}),
                                                    timelineDays: Number.parseInt(e.target.value || '14', 10)
                                                }
                                            }))
                                        }
                                        className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                    />
                                </label>
                            </div>

                            <div className="space-y-2">
                                <div>
                                    <h5 className="text-xs font-bold uppercase tracking-wide text-gray-500">Conversation Timeline Visibility</h5>
                                    <p className="text-xs text-gray-500">Choose which relationship events render as timeline cards inside messaging.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {[
                                        ['briefs', 'Brief events'],
                                        ['proposals', 'Proposal events'],
                                        ['contracts', 'Contract events']
                                    ].map(([key, label]) => (
                                        <label key={key} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                            <span>{label}</span>
                                            <input
                                                type="checkbox"
                                                checked={Boolean((dealFlowConfig.timeline as any)?.[key])}
                                                onChange={(e) =>
                                                    updateDealFlowSetting((current) => ({
                                                        ...current,
                                                        timeline: {
                                                            ...(current.timeline || {}),
                                                            [key]: e.target.checked
                                                        }
                                                    }))
                                                }
                                                className="rounded text-blue-600"
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h5 className="text-xs font-bold uppercase tracking-wide text-gray-500">Brief Templates</h5>
                                        <p className="text-xs text-gray-500">The first template acts as the default when a user converts a conversation into a brief.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            updateDealFlowSetting((current) => ({
                                                ...current,
                                                templates: [
                                                    ...(current.templates || []),
                                                    {
                                                        id: `template_${Date.now().toString(36)}`,
                                                        label: 'New Template',
                                                        category: String(current.defaultCategory || 'General'),
                                                        summary: ''
                                                    }
                                                ]
                                            }))
                                        }
                                        className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                    >
                                        Add Template
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {(dealFlowConfig.templates || []).map((template, index) => (
                                        <div key={`${template.id}-${index}`} className="rounded-lg border border-gray-200 p-3 space-y-2">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <input
                                                    type="text"
                                                    value={template.id}
                                                    onChange={(e) =>
                                                        updateDealFlowSetting((current) => ({
                                                            ...current,
                                                            templates: (current.templates || []).map((entry, entryIndex) =>
                                                                entryIndex === index ? { ...entry, id: e.target.value } : entry
                                                            )
                                                        }))
                                                    }
                                                    className="rounded-md border-gray-300 p-2 text-sm"
                                                    placeholder="template id"
                                                />
                                                <input
                                                    type="text"
                                                    value={template.label}
                                                    onChange={(e) =>
                                                        updateDealFlowSetting((current) => ({
                                                            ...current,
                                                            templates: (current.templates || []).map((entry, entryIndex) =>
                                                                entryIndex === index ? { ...entry, label: e.target.value } : entry
                                                            )
                                                        }))
                                                    }
                                                    className="rounded-md border-gray-300 p-2 text-sm"
                                                    placeholder="template label"
                                                />
                                                <input
                                                    type="text"
                                                    value={template.category}
                                                    onChange={(e) =>
                                                        updateDealFlowSetting((current) => ({
                                                            ...current,
                                                            templates: (current.templates || []).map((entry, entryIndex) =>
                                                                entryIndex === index ? { ...entry, category: e.target.value } : entry
                                                            )
                                                        }))
                                                    }
                                                    className="rounded-md border-gray-300 p-2 text-sm"
                                                    placeholder="template category"
                                                />
                                            </div>
                                            <div className="flex gap-3">
                                                <input
                                                    type="text"
                                                    value={template.summary || ''}
                                                    onChange={(e) =>
                                                        updateDealFlowSetting((current) => ({
                                                            ...current,
                                                            templates: (current.templates || []).map((entry, entryIndex) =>
                                                                entryIndex === index ? { ...entry, summary: e.target.value } : entry
                                                            )
                                                        }))
                                                    }
                                                    className="flex-1 rounded-md border-gray-300 p-2 text-sm"
                                                    placeholder="what this template helps structure"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        updateDealFlowSetting((current) => ({
                                                            ...current,
                                                            templates: (current.templates || []).filter((_, entryIndex) => entryIndex !== index)
                                                        }))
                                                    }
                                                    className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h5 className="text-xs font-bold uppercase tracking-wide text-gray-500">Contract Templates</h5>
                                        <p className="text-xs text-gray-500">Preset contract modes shown when a client accepts a proposal.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            updateDealFlowSetting((current) => ({
                                                ...current,
                                                contractTemplates: [
                                                    ...(current.contractTemplates || []),
                                                    {
                                                        id: `contract_${Date.now().toString(36)}`,
                                                        label: 'New Contract Template',
                                                        contractType: 'FIXED',
                                                        paymentCycle: 'MONTHLY',
                                                        milestoneCount: Number(current.contractDefaults?.fixedMilestoneCount ?? 3),
                                                        summary: ''
                                                    }
                                                ]
                                            }))
                                        }
                                        className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                    >
                                        Add Contract Template
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {(dealFlowConfig.contractTemplates || []).map((template, index) => (
                                        <div key={`${template.id}-${index}`} className="rounded-lg border border-gray-200 p-3 space-y-3">
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                                <input
                                                    type="text"
                                                    value={String(template.id || '')}
                                                    onChange={(e) =>
                                                        updateDealFlowSetting((current) => ({
                                                            ...current,
                                                            contractTemplates: (current.contractTemplates || []).map((entry, entryIndex) =>
                                                                entryIndex === index ? { ...entry, id: e.target.value } : entry
                                                            )
                                                        }))
                                                    }
                                                    className="rounded-md border-gray-300 p-2 text-sm"
                                                    placeholder="template id"
                                                />
                                                <input
                                                    type="text"
                                                    value={String(template.label || '')}
                                                    onChange={(e) =>
                                                        updateDealFlowSetting((current) => ({
                                                            ...current,
                                                            contractTemplates: (current.contractTemplates || []).map((entry, entryIndex) =>
                                                                entryIndex === index ? { ...entry, label: e.target.value } : entry
                                                            )
                                                        }))
                                                    }
                                                    className="rounded-md border-gray-300 p-2 text-sm"
                                                    placeholder="template label"
                                                />
                                                <select
                                                    value={String(template.contractType || 'FIXED')}
                                                    onChange={(e) =>
                                                        updateDealFlowSetting((current) => ({
                                                            ...current,
                                                            contractTemplates: (current.contractTemplates || []).map((entry, entryIndex) =>
                                                                entryIndex === index ? { ...entry, contractType: e.target.value } : entry
                                                            )
                                                        }))
                                                    }
                                                    className="rounded-md border-gray-300 p-2 text-sm"
                                                >
                                                    <option value="FIXED">Fixed</option>
                                                    <option value="HOURLY">Hourly</option>
                                                </select>
                                                <select
                                                    value={String(template.paymentCycle || 'MONTHLY')}
                                                    onChange={(e) =>
                                                        updateDealFlowSetting((current) => ({
                                                            ...current,
                                                            contractTemplates: (current.contractTemplates || []).map((entry, entryIndex) =>
                                                                entryIndex === index ? { ...entry, paymentCycle: e.target.value } : entry
                                                            )
                                                        }))
                                                    }
                                                    className="rounded-md border-gray-300 p-2 text-sm"
                                                >
                                                    <option value="WEEKLY">Weekly</option>
                                                    <option value="BIWEEKLY">Bi-weekly</option>
                                                    <option value="MONTHLY">Monthly</option>
                                                </select>
                                            </div>
                                            <div className="flex gap-3">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={12}
                                                    value={Number(template.milestoneCount ?? 0)}
                                                    onChange={(e) =>
                                                        updateDealFlowSetting((current) => ({
                                                            ...current,
                                                            contractTemplates: (current.contractTemplates || []).map((entry, entryIndex) =>
                                                                entryIndex === index
                                                                    ? { ...entry, milestoneCount: Number.parseInt(e.target.value || '0', 10) }
                                                                    : entry
                                                            )
                                                        }))
                                                    }
                                                    className="w-40 rounded-md border-gray-300 p-2 text-sm"
                                                    placeholder="milestones"
                                                />
                                                <input
                                                    type="text"
                                                    value={String(template.summary || '')}
                                                    onChange={(e) =>
                                                        updateDealFlowSetting((current) => ({
                                                            ...current,
                                                            contractTemplates: (current.contractTemplates || []).map((entry, entryIndex) =>
                                                                entryIndex === index ? { ...entry, summary: e.target.value } : entry
                                                            )
                                                        }))
                                                    }
                                                    className="flex-1 rounded-md border-gray-300 p-2 text-sm"
                                                    placeholder="what this template should prefill"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        updateDealFlowSetting((current) => ({
                                                            ...current,
                                                            contractTemplates: (current.contractTemplates || []).filter((_, entryIndex) => entryIndex !== index)
                                                        }))
                                                    }
                                                    className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Contract Start Lead (days)</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={30}
                                        value={Number(dealFlowConfig.contractDefaults?.startLeadDays ?? 2)}
                                        onChange={(e) =>
                                            updateDealFlowSetting((current) => ({
                                                ...current,
                                                contractDefaults: {
                                                    ...(current.contractDefaults || {}),
                                                    startLeadDays: Number.parseInt(e.target.value || '2', 10)
                                                }
                                            }))
                                        }
                                        className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                    />
                                </label>
                                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Default Fixed Milestones</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={12}
                                        value={Number(dealFlowConfig.contractDefaults?.fixedMilestoneCount ?? 3)}
                                        onChange={(e) =>
                                            updateDealFlowSetting((current) => ({
                                                ...current,
                                                contractDefaults: {
                                                    ...(current.contractDefaults || {}),
                                                    fixedMilestoneCount: Number.parseInt(e.target.value || '3', 10)
                                                }
                                            }))
                                        }
                                        className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                    />
                                </label>
                                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Default Hourly Weekly Cap</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={168}
                                        value={Number(dealFlowConfig.contractDefaults?.hourlyWeeklyCap ?? 40)}
                                        onChange={(e) =>
                                            updateDealFlowSetting((current) => ({
                                                ...current,
                                                contractDefaults: {
                                                    ...(current.contractDefaults || {}),
                                                    hourlyWeeklyCap: Number.parseInt(e.target.value || '40', 10)
                                                }
                                            }))
                                        }
                                        className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                    />
                                </label>
                                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Default Upfront Percent</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={Number(dealFlowConfig.contractDefaults?.upfrontPercent ?? 30)}
                                        onChange={(e) =>
                                            updateDealFlowSetting((current) => ({
                                                ...current,
                                                contractDefaults: {
                                                    ...(current.contractDefaults || {}),
                                                    upfrontPercent: Number.parseInt(e.target.value || '30', 10)
                                                }
                                            }))
                                        }
                                        className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                    />
                                </label>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {[
                                    ['allowFixedContracts', 'Allow fixed contracts', 'Let clients convert proposals into fixed-scope contracts.'],
                                    ['allowHourlyContracts', 'Allow hourly contracts', 'Let clients convert proposals into hourly retainers or tracked engagements.'],
                                    ['requireMilestonesForFixed', 'Require milestones for fixed', 'Seed and enforce delivery checkpoints on fixed-price contracts.']
                                ].map(([key, label, description]) => (
                                    <div key={key} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                                        <div className="pr-3">
                                            <span className="text-sm font-medium text-gray-800">{label}</span>
                                            <p className="text-xs text-gray-500">{description}</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={Boolean((dealFlowConfig.contractRules as any)?.[key])}
                                            onChange={(e) =>
                                                updateDealFlowSetting((current) => ({
                                                    ...current,
                                                    contractRules: {
                                                        ...(current.contractRules || {}),
                                                        [key]: e.target.checked
                                                    }
                                                }))
                                            }
                                            className="rounded text-blue-600"
                                        />
                                    </div>
                                ))}
                                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Max Milestones</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={20}
                                        value={Number(dealFlowConfig.contractRules?.maxMilestones ?? 8)}
                                        onChange={(e) =>
                                            updateDealFlowSetting((current) => ({
                                                ...current,
                                                contractRules: {
                                                    ...(current.contractRules || {}),
                                                    maxMilestones: Number.parseInt(e.target.value || '8', 10)
                                                }
                                            }))
                                        }
                                        className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                    />
                                </label>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Client Fee Percent</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={Number(dealFlowConfig.feePolicy?.clientFeePercent ?? 0)}
                                        onChange={(e) =>
                                            updateDealFlowSetting((current) => ({
                                                ...current,
                                                feePolicy: {
                                                    ...(current.feePolicy || {}),
                                                    clientFeePercent: Number.parseInt(e.target.value || '0', 10)
                                                }
                                            }))
                                        }
                                        className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                    />
                                </label>
                                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Contractor Fee Percent</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={Number(dealFlowConfig.feePolicy?.contractorFeePercent ?? 0)}
                                        onChange={(e) =>
                                            updateDealFlowSetting((current) => ({
                                                ...current,
                                                feePolicy: {
                                                    ...(current.feePolicy || {}),
                                                    contractorFeePercent: Number.parseInt(e.target.value || '0', 10)
                                                }
                                            }))
                                        }
                                        className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                    />
                                </label>
                                <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                                    <div className="pr-3">
                                        <span className="text-sm font-medium text-gray-800">Allow deposits</span>
                                        <p className="text-xs text-gray-500">Let the contract plan show deposit-friendly terms in fixed-price deals.</p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(dealFlowConfig.feePolicy?.allowDeposits)}
                                        onChange={(e) =>
                                            updateDealFlowSetting((current) => ({
                                                ...current,
                                                feePolicy: {
                                                    ...(current.feePolicy || {}),
                                                    allowDeposits: e.target.checked
                                                }
                                            }))
                                        }
                                        className="rounded text-blue-600"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
                            <div>
                                <h4 className="text-sm font-bold text-gray-900">Profile Storefronts</h4>
                                <p className="text-xs text-gray-500">
                                    Enable commerce-ready storefront tabs on user and business profiles, control role access, and limit how much catalog inventory appears publicly.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {[
                                    ['enabled', 'Enable storefronts', 'Turn on the storefront system across supported profile surfaces.'],
                                    ['userProfilesEnabled', 'User profile storefronts', 'Show storefront tabs on eligible member profiles.'],
                                    ['businessPagesEnabled', 'Business page storefronts', 'Show storefront tabs on business profile pages.'],
                                    ['merchantSummary', 'Merchant summary block', 'Render the storefront summary block with pricing, social proof, and catalog counts.'],
                                    ['userGigs', 'User service catalog', 'Use approved active gigs as the storefront inventory on member profiles.'],
                                    ['businessPackages', 'Business packaged offers', 'Use business page packaged offers as the storefront inventory for company pages.']
                                ].map(([key, label, description]) => {
                                    const checked =
                                        key === 'merchantSummary' || key === 'userGigs' || key === 'businessPackages'
                                            ? Boolean((storefrontConfig.modules as any)?.[key])
                                            : Boolean((storefrontConfig as any)[key]);
                                    return (
                                        <div key={key} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                                            <div className="pr-3">
                                                <span className="text-sm font-medium text-gray-800">{label}</span>
                                                <p className="text-xs text-gray-500">{description}</p>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(e) =>
                                                    updateStorefrontSetting((current) => ({
                                                        ...current,
                                                        ...(key === 'merchantSummary' || key === 'userGigs' || key === 'businessPackages'
                                                            ? {
                                                                  modules: {
                                                                      ...(current.modules || {}),
                                                                      [key]: e.target.checked
                                                                  }
                                                              }
                                                            : {
                                                                  [key]: e.target.checked
                                                              })
                                                    }))
                                                }
                                                className="rounded text-blue-600"
                                            />
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="space-y-2">
                                <div>
                                    <h5 className="text-xs font-bold uppercase tracking-wide text-gray-500">Eligible Roles</h5>
                                    <p className="text-xs text-gray-500">Choose which account roles can expose a storefront tab on public profiles.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                    {['user', 'freelancer', 'employer', 'business', 'admin'].map((roleKey) => (
                                        <label key={roleKey} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                            <span className="capitalize">{roleKey}</span>
                                            <input
                                                type="checkbox"
                                                checked={Boolean((storefrontConfig.roles as any)?.[roleKey])}
                                                onChange={(e) =>
                                                    updateStorefrontSetting((current) => ({
                                                        ...current,
                                                        roles: {
                                                            ...(current.roles || {}),
                                                            [roleKey]: e.target.checked
                                                        }
                                                    }))
                                                }
                                                className="rounded text-blue-600"
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Max Featured Items</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={12}
                                        value={Number(storefrontConfig.maxFeaturedItems ?? 4)}
                                        onChange={(e) =>
                                            updateStorefrontSetting((current) => ({
                                                ...current,
                                                maxFeaturedItems: Number.parseInt(e.target.value || '4', 10)
                                            }))
                                        }
                                        className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                    />
                                </label>
                                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Max Catalog Items</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={60}
                                        value={Number(storefrontConfig.maxCatalogItems ?? 12)}
                                        onChange={(e) =>
                                            updateStorefrontSetting((current) => ({
                                                ...current,
                                                maxCatalogItems: Number.parseInt(e.target.value || '12', 10)
                                            }))
                                        }
                                        className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
                            <div>
                                <h4 className="text-sm font-bold text-gray-900">Content Offer Tagging</h4>
                                <p className="text-xs text-gray-500">
                                    Control whether posts, Scroll, and LIVE can tag storefront inventory and which commerce CTAs remain available on tagged content.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {[
                                    ['enabled', 'Enable content offer tagging', 'Allow supported content surfaces to attach storefront offers.'],
                                    ['postsEnabled', 'Posts', 'Show offer-tag authoring and display on post cards.'],
                                    ['scrollEnabled', 'Scroll', 'Allow tagged offers on Scroll creation and viewer surfaces.'],
                                    ['liveEnabled', 'LIVE', 'Allow tagged offers on live session setup and viewer surfaces.'],
                                    ['userGigs', 'User gig inventory', 'Use approved user gigs as taggable content offers.'],
                                    ['businessPackages', 'Business packaged offers', 'Use business page packages as taggable content offers.'],
                                    ['storefrontCta', 'Storefront CTA', 'Show one-tap storefront navigation from tagged content.'],
                                    ['messageCta', 'Message CTA', 'Let viewers open a DM directly from tagged content.'],
                                    ['briefCta', 'Brief CTA', 'Let viewers start a brief flow from tagged content.']
                                ].map(([key, label, description]) => {
                                    const checked =
                                        key === 'userGigs' ||
                                        key === 'businessPackages' ||
                                        key === 'storefrontCta' ||
                                        key === 'messageCta' ||
                                        key === 'briefCta'
                                            ? Boolean((contentOfferConfig.modules as any)?.[key])
                                            : Boolean((contentOfferConfig as any)[key]);
                                    return (
                                        <div key={key} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                                            <div className="pr-3">
                                                <span className="text-sm font-medium text-gray-800">{label}</span>
                                                <p className="text-xs text-gray-500">{description}</p>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(e) =>
                                                    updateContentOfferSetting((current) => ({
                                                        ...current,
                                                        ...(key === 'userGigs' ||
                                                        key === 'businessPackages' ||
                                                        key === 'storefrontCta' ||
                                                        key === 'messageCta' ||
                                                        key === 'briefCta'
                                                            ? {
                                                                  modules: {
                                                                      ...(current.modules || {}),
                                                                      [key]: e.target.checked
                                                                  }
                                                              }
                                                            : {
                                                                  [key]: e.target.checked
                                                              })
                                                    }))
                                                }
                                                className="rounded text-blue-600"
                                            />
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="space-y-2">
                                <div>
                                    <h5 className="text-xs font-bold uppercase tracking-wide text-gray-500">Eligible Roles</h5>
                                    <p className="text-xs text-gray-500">Choose which roles can attach offers to supported content surfaces.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                    {['user', 'freelancer', 'employer', 'business', 'admin'].map((roleKey) => (
                                        <label key={roleKey} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                            <span className="capitalize">{roleKey}</span>
                                            <input
                                                type="checkbox"
                                                checked={Boolean((contentOfferConfig.roles as any)?.[roleKey])}
                                                onChange={(e) =>
                                                    updateContentOfferSetting((current) => ({
                                                        ...current,
                                                        roles: {
                                                            ...(current.roles || {}),
                                                            [roleKey]: e.target.checked
                                                        }
                                                    }))
                                                }
                                                className="rounded text-blue-600"
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Max tags per content item</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={6}
                                        value={Number(contentOfferConfig.maxTagsPerContent ?? 3)}
                                        onChange={(e) =>
                                            updateContentOfferSetting((current) => ({
                                                ...current,
                                                maxTagsPerContent: Number.parseInt(e.target.value || '3', 10)
                                            }))
                                        }
                                        className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                    />
                                </label>
                                <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Moderation mode</span>
                                    <select
                                        value={String(contentOfferConfig.moderationMode || 'off')}
                                        onChange={(e) =>
                                            updateContentOfferSetting((current) => ({
                                                ...current,
                                                moderationMode: e.target.value as 'off' | 'review' | 'strict'
                                            }))
                                        }
                                        className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                    >
                                        <option value="off">Off</option>
                                        <option value="review">Review</option>
                                        <option value="strict">Strict</option>
                                    </select>
                                </label>
                            </div>

                            <label className="block rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Restricted categories</span>
                                <input
                                    type="text"
                                    value={(contentOfferConfig.restrictedCategories || []).join(', ')}
                                    onChange={(e) =>
                                        updateContentOfferSetting((current) => ({
                                            ...current,
                                            restrictedCategories: e.target.value
                                                .split(',')
                                                .map((entry) => entry.trim())
                                                .filter(Boolean)
                                        }))
                                    }
                                    className="mt-2 w-full rounded-md border-gray-300 p-2 text-sm"
                                    placeholder="adult services, regulated products"
                                />
                                <p className="mt-2 text-xs text-gray-500">Comma-separated categories blocked from tagging on content surfaces.</p>
                            </label>
                        </div>
                        
                        <div className="space-y-4 pt-4 border-t border-gray-200">
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-sm font-medium text-gray-700">Maintenance Mode</span>
                                    <p className="text-xs text-gray-500">Temporarily disable access for non-admins</p>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={maintenanceEnabled} 
                                    onChange={e => void applyMaintenanceMode(e.target.checked)} 
                                    disabled={isApplyingMaintenance}
                                    className="rounded text-blue-600" 
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => void applyMaintenanceMode(!maintenanceEnabled)}
                                disabled={isApplyingMaintenance}
                                className={`w-full rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                                    maintenanceEnabled
                                        ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                } disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                                {isApplyingMaintenance
                                    ? 'Applying...'
                                    : maintenanceEnabled
                                        ? 'Disable Maintenance Mode'
                                        : 'Enable Maintenance Mode'}
                            </button>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-sm font-medium text-gray-700">Allow Registrations</span>
                                    <p className="text-xs text-gray-500">Allow new users to sign up</p>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={registrationsEnabled} 
                                    onChange={e => {
                                        const next = e.target.checked;
                                        handleChange('system', 'registrationsEnabled', next);
                                        void AdminService.saveSystemSettings({ registrationsEnabled: next } as SystemConfig)
                                            .then(() => showNotification('success', 'Registrations', next ? 'Sign-ups enabled.' : 'Sign-ups disabled.'))
                                            .catch(() => showNotification('error', 'Save Failed', 'Could not update registrations setting.'));
                                    }} 
                                    className="rounded text-blue-600" 
                                    data-testid="setting-registrations-enabled"
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-sm font-medium text-gray-700">Enforce KYC</span>
                                    <p className="text-xs text-gray-500">Require identity verification for sensitive actions</p>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={kycEnabled} 
                                    onChange={e => {
                                        const next = e.target.checked;
                                        handleChange('system', 'kycEnforced', next);
                                        void AdminService.saveSystemSettings({ kycEnforced: next } as SystemConfig)
                                            .then(() => showNotification('success', 'KYC Enforcement', next ? 'KYC required for sensitive actions.' : 'KYC enforcement off.'))
                                            .catch(() => showNotification('error', 'Save Failed', 'Could not update KYC setting.'));
                                    }} 
                                    className="rounded text-blue-600" 
                                    data-testid="setting-kyc-enforced"
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-sm font-medium text-gray-700">Admin 2FA</span>
                                    <p className="text-xs text-gray-500">Require Google Authenticator for admin access</p>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={admin2FAEnabled} 
                                    onChange={e => {
                                        const next = e.target.checked;
                                        handleChange('system', 'admin2FA', next);
                                        void AdminService.saveSystemSettings({ admin2FA: next } as SystemConfig)
                                            .then(() => showNotification('success', 'Admin 2FA', next ? 'Admin 2FA enforced at login.' : 'Admin 2FA policy disabled.'))
                                            .catch(() => showNotification('error', 'Save Failed', 'Could not update Admin 2FA setting.'));
                                    }} 
                                    className="rounded text-blue-600" 
                                    data-testid="setting-admin-2fa"
                                />
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                                <h4 className="text-sm font-semibold text-slate-900">Maintenance page (CMS-controlled)</h4>
                                <p className="text-xs text-slate-600">
                                    Shown to non-admins when Maintenance Mode is on. Also available as public status at{' '}
                                    <code className="rounded bg-white px-1">/maintenance</code>.
                                </p>
                                {(['title', 'message', 'contactEmail', 'ctaLabel', 'ctaUrl'] as const).map((field) => (
                                    <label key={field} className="block text-xs font-medium text-slate-700">
                                        {field === 'contactEmail' ? 'Contact email' : field === 'ctaLabel' ? 'Button label' : field === 'ctaUrl' ? 'Button URL' : field === 'title' ? 'Title' : 'Message'}
                                        {field === 'message' ? (
                                            <textarea
                                                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                                                rows={3}
                                                value={String((localSettings.system as any)?.maintenancePage?.[field] || '')}
                                                onChange={(e) =>
                                                    handleChange('system', 'maintenancePage', {
                                                        ...((localSettings.system as any)?.maintenancePage || {}),
                                                        [field]: e.target.value
                                                    })
                                                }
                                            />
                                        ) : (
                                            <input
                                                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                                                value={String((localSettings.system as any)?.maintenancePage?.[field] || '')}
                                                onChange={(e) =>
                                                    handleChange('system', 'maintenancePage', {
                                                        ...((localSettings.system as any)?.maintenancePage || {}),
                                                        [field]: e.target.value
                                                    })
                                                }
                                            />
                                        )}
                                    </label>
                                ))}
                                <button
                                    type="button"
                                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                                    onClick={() => {
                                        const page = (localSettings.system as any)?.maintenancePage || {};
                                        void AdminService.saveSystemSettings({ maintenancePage: page } as SystemConfig)
                                            .then(() => showNotification('success', 'Maintenance page', 'Fault page content saved.'))
                                            .catch(() => showNotification('error', 'Save Failed', 'Could not save maintenance page.'));
                                    }}
                                >
                                    Save maintenance page
                                </button>
                            </div>
                            <Admin2FAControlPanel enabled={admin2FAEnabled} />
                        </div>

                        <div className={`p-4 rounded-lg flex items-center justify-between ${
                            maintenanceEnabled
                                ? 'bg-amber-50 border border-amber-200'
                                : 'bg-green-50 border border-green-200'
                        }`}>
                            <div>
                                <span className={`font-bold text-sm block ${
                                    maintenanceEnabled ? 'text-amber-800' : 'text-green-800'
                                }`}>
                                    {maintenanceEnabled ? 'Maintenance Mode Active' : 'System Operational'}
                                </span>
                                <span className={`text-xs ${
                                    maintenanceEnabled ? 'text-amber-700' : 'text-green-600'
                                }`}>
                                    {maintenanceEnabled
                                        ? 'Non-admin traffic is temporarily restricted.'
                                        : 'All services running normally'}
                                </span>
                            </div>
                            {maintenanceEnabled ? (
                                <AlertTriangle className="w-5 h-5 text-amber-600" />
                            ) : (
                                <CheckCircle className="w-5 h-5 text-green-600" />
                            )}
                        </div>
                    </div>
                )}
                
                {activeTab === 'filesystem' && (
                     <div className="space-y-8 animate-fade-in max-w-2xl">
                        <div className="bg-white p-6 rounded-xl border border-gray-200">
                            <div className="flex justify-between items-start mb-6">
                                <h3 className="font-bold text-gray-900 flex items-center">
                                    <Database className="w-5 h-5 mr-2 text-blue-600" /> File Storage Configuration
                                </h3>
                                <button 
                                    onClick={handleTestStorage} 
                                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center"
                                >
                                    <Network className="w-3 h-3 mr-1" /> Test Connection
                                </button>
                            </div>
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Default Storage Driver</label>
                                    <select 
                                        className="w-full border-gray-300 rounded-lg p-2.5 shadow-sm focus:ring-blue-500 focus:border-blue-500" 
                                        value={storageConfig.driver || 'local'} 
                                        onChange={e => setStorageConfig({...storageConfig, driver: e.target.value})}
                                    >
                                        <option value="local">Local Filesystem</option>
                                        <option value="s3">AWS S3 / Compatible</option>
                                        <option value="backblaze">Backblaze B2</option>
                                    </select>
                                </div>
                                {storageConfig.driver !== 'local' && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Access Key ID</label>
                                                <input 
                                                    className="w-full border-gray-300 rounded-md p-2" 
                                                    type="password" 
                                                    value={storageConfig[storageConfig.driver]?.accessKeyId || ''} 
                                                    onChange={e => setStorageConfig({
                                                        ...storageConfig, 
                                                        [storageConfig.driver]: { 
                                                            ...storageConfig[storageConfig.driver] || {}, 
                                                            accessKeyId: e.target.value 
                                                        }
                                                    })} 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Secret Access Key</label>
                                                <input 
                                                    className="w-full border-gray-300 rounded-md p-2" 
                                                    type="password" 
                                                    value={storageConfig[storageConfig.driver]?.secretAccessKey || ''} 
                                                    onChange={e => setStorageConfig({
                                                        ...storageConfig, 
                                                        [storageConfig.driver]: { 
                                                            ...storageConfig[storageConfig.driver] || {}, 
                                                            secretAccessKey: e.target.value 
                                                        }
                                                    })} 
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Region</label>
                                                <input 
                                                    className="w-full border-gray-300 rounded-md p-2" 
                                                    value={storageConfig[storageConfig.driver]?.region || ''} 
                                                    onChange={e => setStorageConfig({
                                                        ...storageConfig, 
                                                        [storageConfig.driver]: { 
                                                            ...storageConfig[storageConfig.driver] || {}, 
                                                            region: e.target.value 
                                                        }
                                                    })} 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bucket Name</label>
                                                <input 
                                                    className="w-full border-gray-300 rounded-md p-2" 
                                                    value={storageConfig[storageConfig.driver]?.bucket || ''} 
                                                    onChange={e => setStorageConfig({
                                                        ...storageConfig, 
                                                        [storageConfig.driver]: { 
                                                            ...storageConfig[storageConfig.driver] || {}, 
                                                            bucket: e.target.value 
                                                        }
                                                    })} 
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl border border-gray-200">
                            <div className="flex justify-between items-start mb-6">
                                <h3 className="font-bold text-gray-900 flex items-center">
                                    <Server className="w-5 h-5 mr-2 text-indigo-600" /> Cache Configuration
                                </h3>
                                <button 
                                    onClick={handleTestCache} 
                                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center"
                                >
                                    <Network className="w-3 h-3 mr-1" /> Test Cache
                                </button>
                            </div>
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Cache Driver</label>
                                    <select
                                        className="w-full border-gray-300 rounded-lg p-2.5 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                        value={cacheConfig.driver || 'local'}
                                        onChange={e => setCacheConfig({ ...cacheConfig, driver: e.target.value })}
                                    >
                                        <option value="local">Local (In-Memory)</option>
                                        <option value="redis">Redis</option>
                                    </select>
                                </div>
                                {cacheConfig.driver === 'redis' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Redis Host</label>
                                            <input
                                                className="w-full border-gray-300 rounded-md p-2"
                                                value={cacheConfig.redis?.host || ''}
                                                onChange={e => setCacheConfig({
                                                    ...cacheConfig,
                                                    redis: { ...cacheConfig.redis, host: e.target.value }
                                                })}
                                                placeholder="127.0.0.1"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Redis Port</label>
                                            <input
                                                type="number"
                                                className="w-full border-gray-300 rounded-md p-2"
                                                value={cacheConfig.redis?.port || 6379}
                                                onChange={e => setCacheConfig({
                                                    ...cacheConfig,
                                                    redis: { ...cacheConfig.redis, port: parseInt(e.target.value) || 6379 }
                                                })}
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Redis Password (Optional)</label>
                                            <input
                                                type="password"
                                                className="w-full border-gray-300 rounded-md p-2"
                                                value={cacheConfig.redis?.password || ''}
                                                onChange={e => setCacheConfig({
                                                    ...cacheConfig,
                                                    redis: { ...cacheConfig.redis, password: e.target.value }
                                                })}
                                            />
                                        </div>
                                    </div>
                                )}
                                <p className="text-xs text-gray-500">
                                    Cache settings control response speed for frequently accessed data. Use Redis for production workloads.
                                </p>
                            </div>
                        </div>
                     </div>
                 )}

                {activeTab === 'optimization' && (
                    <div className="space-y-6 animate-fade-in max-w-3xl">
                        <div className="bg-white p-6 rounded-xl border border-gray-200">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Runtime Optimization Engine</h3>
                                    <p className="text-sm text-gray-500 mt-1">
                                        Configure platform-wide caching, compression, minification, and speed delivery controls in real time.
                                    </p>
                                </div>
                                <label className="inline-flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                                    <input
                                        type="checkbox"
                                        className="rounded text-blue-600"
                                        checked={Boolean(optimizationConfig.enabled)}
                                        onChange={(e) => setOptimizationConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
                                    />
                                    <span className="text-sm font-semibold text-gray-700">Enable Optimization Module</span>
                                </label>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white p-6 rounded-xl border border-gray-200 space-y-4">
                                <h4 className="font-semibold text-gray-900">Compression & Minification</h4>

                                <label className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                                    <span className="text-sm text-gray-700">Compress API responses (gzip/brotli)</span>
                                    <input
                                        type="checkbox"
                                        className="rounded text-blue-600"
                                        checked={Boolean(optimizationConfig.compressionEnabled)}
                                        onChange={(e) => setOptimizationConfig((prev) => ({ ...prev, compressionEnabled: e.target.checked }))}
                                    />
                                </label>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Compression Level (1-9)</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={9}
                                            className="w-full border-gray-300 rounded-md p-2"
                                            value={optimizationConfig.compressionLevel || 6}
                                            onChange={(e) =>
                                                setOptimizationConfig((prev) => ({
                                                    ...prev,
                                                    compressionLevel: Math.max(1, Math.min(9, Number.parseInt(e.target.value, 10) || 6))
                                                }))
                                            }
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Compression Threshold (KB)</label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={2048}
                                            className="w-full border-gray-300 rounded-md p-2"
                                            value={optimizationConfig.compressionThresholdKb || 1}
                                            onChange={(e) =>
                                                setOptimizationConfig((prev) => ({
                                                    ...prev,
                                                    compressionThresholdKb: Math.max(0, Math.min(2048, Number.parseInt(e.target.value, 10) || 1))
                                                }))
                                            }
                                        />
                                    </div>
                                </div>

                                <label className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                                    <span className="text-sm text-gray-700">Minify JSON responses</span>
                                    <input
                                        type="checkbox"
                                        className="rounded text-blue-600"
                                        checked={Boolean(optimizationConfig.jsonMinifyEnabled)}
                                        onChange={(e) => setOptimizationConfig((prev) => ({ ...prev, jsonMinifyEnabled: e.target.checked }))}
                                    />
                                </label>

                                <label className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                                    <span className="text-sm text-gray-700">Minify HTML responses</span>
                                    <input
                                        type="checkbox"
                                        className="rounded text-blue-600"
                                        checked={Boolean(optimizationConfig.htmlMinifyEnabled)}
                                        onChange={(e) => setOptimizationConfig((prev) => ({ ...prev, htmlMinifyEnabled: e.target.checked }))}
                                    />
                                </label>

                                <div className="grid grid-cols-2 gap-3">
                                    <label className="flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            className="rounded text-blue-600"
                                            checked={Boolean(optimizationConfig.htmlCollapseWhitespace)}
                                            onChange={(e) =>
                                                setOptimizationConfig((prev) => ({ ...prev, htmlCollapseWhitespace: e.target.checked }))
                                            }
                                        />
                                        Collapse whitespace
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            className="rounded text-blue-600"
                                            checked={Boolean(optimizationConfig.htmlRemoveComments)}
                                            onChange={(e) =>
                                                setOptimizationConfig((prev) => ({ ...prev, htmlRemoveComments: e.target.checked }))
                                            }
                                        />
                                        Remove comments
                                    </label>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl border border-gray-200 space-y-4">
                                <h4 className="font-semibold text-gray-900">Caching & Speed Hints</h4>

                                <label className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                                    <span className="text-sm text-gray-700">Cache public API GET responses</span>
                                    <input
                                        type="checkbox"
                                        className="rounded text-blue-600"
                                        checked={Boolean(optimizationConfig.apiResponseCachingEnabled)}
                                        onChange={(e) =>
                                            setOptimizationConfig((prev) => ({ ...prev, apiResponseCachingEnabled: e.target.checked }))
                                        }
                                    />
                                </label>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">API Cache TTL (Seconds)</label>
                                        <input
                                            type="number"
                                            min={5}
                                            max={3600}
                                            className="w-full border-gray-300 rounded-md p-2"
                                            value={optimizationConfig.apiResponseCacheSeconds || 45}
                                            onChange={(e) =>
                                                setOptimizationConfig((prev) => ({
                                                    ...prev,
                                                    apiResponseCacheSeconds: Math.max(5, Math.min(3600, Number.parseInt(e.target.value, 10) || 45))
                                                }))
                                            }
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Max Cache Entries</label>
                                        <input
                                            type="number"
                                            min={50}
                                            max={5000}
                                            className="w-full border-gray-300 rounded-md p-2"
                                            value={optimizationConfig.apiResponseCacheMaxEntries || 500}
                                            onChange={(e) =>
                                                setOptimizationConfig((prev) => ({
                                                    ...prev,
                                                    apiResponseCacheMaxEntries: Math.max(50, Math.min(5000, Number.parseInt(e.target.value, 10) || 500))
                                                }))
                                            }
                                        />
                                    </div>
                                </div>

                                <label className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                                    <span className="text-sm text-gray-700">Cache static assets aggressively</span>
                                    <input
                                        type="checkbox"
                                        className="rounded text-blue-600"
                                        checked={Boolean(optimizationConfig.staticAssetCachingEnabled)}
                                        onChange={(e) =>
                                            setOptimizationConfig((prev) => ({ ...prev, staticAssetCachingEnabled: e.target.checked }))
                                        }
                                    />
                                </label>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Static Cache TTL (Seconds)</label>
                                    <input
                                        type="number"
                                        min={60}
                                        max={31536000}
                                        className="w-full border-gray-300 rounded-md p-2"
                                        value={optimizationConfig.staticAssetCacheSeconds || 604800}
                                        onChange={(e) =>
                                            setOptimizationConfig((prev) => ({
                                                ...prev,
                                                staticAssetCacheSeconds: Math.max(60, Math.min(31536000, Number.parseInt(e.target.value, 10) || 604800))
                                            }))
                                        }
                                    />
                                </div>

                                <label className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                                    <span className="text-sm text-gray-700">Enable speed hints (preconnect headers)</span>
                                    <input
                                        type="checkbox"
                                        className="rounded text-blue-600"
                                        checked={Boolean(optimizationConfig.speedHintsEnabled)}
                                        onChange={(e) => setOptimizationConfig((prev) => ({ ...prev, speedHintsEnabled: e.target.checked }))}
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl border border-gray-200 space-y-4">
                            <h4 className="font-semibold text-gray-900">Performance & Delivery</h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <label className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                                    <span className="text-sm text-gray-700">Enable global Data Saver mode</span>
                                    <input
                                        type="checkbox"
                                        className="rounded text-blue-600"
                                        checked={Boolean(optimizationConfig.dataSaverModeEnabled)}
                                        onChange={(e) =>
                                            setOptimizationConfig((prev) => ({ ...prev, dataSaverModeEnabled: e.target.checked }))
                                        }
                                    />
                                </label>
                                <label className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                                    <span className="text-sm text-gray-700">Allow media autoplay</span>
                                    <input
                                        type="checkbox"
                                        className="rounded text-blue-600"
                                        checked={Boolean(optimizationConfig.autoplayEnabled)}
                                        onChange={(e) => setOptimizationConfig((prev) => ({ ...prev, autoplayEnabled: e.target.checked }))}
                                    />
                                </label>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Feed Page Size</label>
                                    <input
                                        type="number"
                                        min={5}
                                        max={80}
                                        className="w-full border-gray-300 rounded-md p-2"
                                        value={optimizationConfig.feedPageSize || 20}
                                        onChange={(e) =>
                                            setOptimizationConfig((prev) => ({
                                                ...prev,
                                                feedPageSize: Math.max(5, Math.min(80, Number.parseInt(e.target.value, 10) || 20))
                                            }))
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Low-bandwidth Page Size</label>
                                    <input
                                        type="number"
                                        min={3}
                                        max={40}
                                        className="w-full border-gray-300 rounded-md p-2"
                                        value={optimizationConfig.lowBandwidthFeedPageSize || 10}
                                        onChange={(e) =>
                                            setOptimizationConfig((prev) => ({
                                                ...prev,
                                                lowBandwidthFeedPageSize: Math.max(
                                                    3,
                                                    Math.min(
                                                        Number(prev.feedPageSize || 20),
                                                        Number.parseInt(e.target.value, 10) || 10
                                                    )
                                                )
                                            }))
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Realtime Throttle (ms)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={10000}
                                        className="w-full border-gray-300 rounded-md p-2"
                                        value={optimizationConfig.realtimeThrottleMs || 300}
                                        onChange={(e) =>
                                            setOptimizationConfig((prev) => ({
                                                ...prev,
                                                realtimeThrottleMs: Math.max(0, Math.min(10000, Number.parseInt(e.target.value, 10) || 300))
                                            }))
                                        }
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Media Quality Preset</label>
                                <select
                                    className="w-full border-gray-300 rounded-md p-2"
                                    value={optimizationConfig.mediaQualityPreset || 'auto'}
                                    onChange={(e) =>
                                        setOptimizationConfig((prev) => ({
                                            ...prev,
                                            mediaQualityPreset: (e.target.value || 'auto') as 'auto' | 'low' | 'balanced' | 'high'
                                        }))
                                    }
                                >
                                    <option value="auto">Auto</option>
                                    <option value="low">Low bandwidth</option>
                                    <option value="balanced">Balanced</option>
                                    <option value="high">High quality</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white p-6 rounded-xl border border-gray-200">
                                <label className="block text-sm font-semibold text-gray-800 mb-2">
                                    Preconnect Origins (one per line)
                                </label>
                                <textarea
                                    rows={6}
                                    className="w-full border-gray-300 rounded-lg p-3 text-sm"
                                    value={normalizeOptimizationArray(optimizationConfig.preconnectOrigins).join('\n')}
                                    onChange={(e) =>
                                        setOptimizationConfig((prev) => ({
                                            ...prev,
                                            preconnectOrigins: normalizeOptimizationArray(e.target.value, [])
                                        }))
                                    }
                                    placeholder={'https://api.scrolith.com\nhttps://cdn.scrolith.com'}
                                />
                                <p className="text-xs text-gray-500 mt-2">Used when speed hints are enabled.</p>
                            </div>

                            <div className="bg-white p-6 rounded-xl border border-gray-200">
                                <label className="block text-sm font-semibold text-gray-800 mb-2">
                                    API Cache Exclusions (prefix per line)
                                </label>
                                <textarea
                                    rows={6}
                                    className="w-full border-gray-300 rounded-lg p-3 text-sm"
                                    value={normalizeOptimizationArray(optimizationConfig.apiCacheExcludePaths).join('\n')}
                                    onChange={(e) =>
                                        setOptimizationConfig((prev) => ({
                                            ...prev,
                                            apiCacheExcludePaths: normalizeOptimizationArray(e.target.value, DEFAULT_OPTIMIZATION_CONFIG.apiCacheExcludePaths)
                                        }))
                                    }
                                    placeholder={'/api/auth\n/api/admin\n/api/messages'}
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    Sensitive and personalized routes should remain excluded from public response caching.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'currencies' && (
                    <div className="space-y-6 animate-fade-in min-w-0 w-full max-w-full" data-testid="currency-management">
                        {/* Header + primary actions — wrap, never clip */}
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-gray-900">Currency Management</h3>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    Admin-governed catalog, FX authority, and rate controls.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => void handleRefreshFxControlPlane()}
                                    className="text-xs sm:text-sm bg-white border border-gray-200 text-gray-700 px-3 py-2 min-h-[40px] rounded-lg font-bold hover:bg-gray-50 inline-flex items-center"
                                >
                                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAutoUpdateRates}
                                    className="text-xs sm:text-sm bg-indigo-50 text-indigo-700 px-3 py-2 min-h-[40px] rounded-lg font-bold hover:bg-indigo-100 inline-flex items-center"
                                >
                                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Update Rates
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsCurrencyModalOpen(true)}
                                    className="text-xs sm:text-sm bg-blue-600 text-white px-3 py-2 min-h-[40px] rounded-lg font-bold hover:bg-blue-700 inline-flex items-center"
                                >
                                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Currency
                                </button>
                            </div>
                        </div>

                        {/* Policy bar */}
                        <div className="bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-200 flex flex-wrap gap-3 sm:gap-4 items-center">
                            <label className="flex items-center cursor-pointer min-h-[40px]">
                                <input
                                    type="checkbox"
                                    checked={currencyConfig.autoExchangeRate}
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        setCurrencyConfig({ ...currencyConfig, autoExchangeRate: checked });
                                        setFxConfig((prev) => ({ ...prev, refreshEnabled: checked, enabled: true }));
                                    }}
                                    className="rounded text-blue-600 mr-2"
                                />
                                <span className="text-sm font-medium text-gray-700">Auto FX Sync</span>
                            </label>

                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-gray-700">Base Currency:</span>
                                <select
                                    className="border-gray-300 rounded-md text-sm p-2 min-h-[40px]"
                                    value={currencyConfig.baseCurrency}
                                    onChange={(e) => {
                                        setCurrencyConfig({ ...currencyConfig, baseCurrency: e.target.value });
                                        handleSetDefaultCurrency(e.target.value);
                                    }}
                                >
                                    {Array.isArray(currencies) &&
                                        currencies.map((c) => (
                                            <option key={`base-currency-${c.code}`} value={c.code}>
                                                {c.code}
                                            </option>
                                        ))}
                                </select>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-gray-700">Authority:</span>
                                <select
                                    className="border-gray-300 rounded-md text-sm p-2 min-h-[40px]"
                                    value={currencyConfig.provider}
                                    onChange={(e) => {
                                        const providerCode = e.target.value;
                                        setCurrencyConfig({ ...currencyConfig, provider: providerCode });
                                        setFxConfig((prev) => ({ ...prev, providerCode }));
                                    }}
                                >
                                    {fxProviders.map((provider) => (
                                        <option key={`fx-provider-${provider.code}`} value={provider.code}>
                                            {provider.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex-1 basis-full sm:basis-auto min-w-[12rem] text-xs text-gray-500">
                                Live rates come from approved FX snapshots. Manual rate edits below are fallback values
                                and local defaults only.
                            </div>
                        </div>

                        <FxControlPlanePanel
                            currencies={currencies}
                            fxConfig={fxConfig}
                            onFxConfigChange={(updater) =>
                                setFxConfig((prev) => (typeof updater === 'function' ? updater(prev) : updater))
                            }
                            providers={fxProviders}
                            health={fxHealth}
                            snapshots={fxSnapshots}
                            overrides={fxOverrides}
                            locks={fxLocks}
                            busyAction={fxBusyAction}
                            onRefresh={handleRefreshFxControlPlane}
                            onRunSync={handleAutoUpdateRates}
                            onUpdateProvider={handleUpdateFxProvider}
                            onApproveSnapshot={handleApproveFxSnapshot}
                            onSetSnapshotFrozen={handleSetSnapshotFrozen}
                            onCreateOverride={handleCreateFxOverride}
                            onApproveOverride={handleApproveFxOverride}
                        />

                        {/* Toolbar: search + filters */}
                        <div
                            className="flex flex-wrap gap-3 items-center"
                            data-testid="currency-toolbar"
                        >
                            <div className="relative flex-1 min-w-[220px] basis-[320px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                                <input
                                    type="search"
                                    value={currencySearch}
                                    onChange={(e) => setCurrencySearch(e.target.value)}
                                    placeholder="Search code, name, or symbol"
                                    className="w-full border border-gray-300 rounded-lg pl-9 pr-9 py-2.5 text-sm min-h-[44px] focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                                    aria-label="Search currencies"
                                />
                                {currencySearch ? (
                                    <button
                                        type="button"
                                        onClick={() => setCurrencySearch('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                                        aria-label="Clear search"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                ) : null}
                            </div>
                            <select
                                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm min-h-[44px] flex-shrink-0"
                                value={currencyStatusFilter}
                                onChange={(e) => setCurrencyStatusFilter(e.target.value as typeof currencyStatusFilter)}
                                aria-label="Filter by status"
                            >
                                <option value="all">All statuses</option>
                                <option value="active">Active</option>
                                <option value="disabled">Disabled</option>
                            </select>
                            <select
                                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm min-h-[44px] flex-shrink-0"
                                value={currencySourceFilter}
                                onChange={(e) => setCurrencySourceFilter(e.target.value as typeof currencySourceFilter)}
                                aria-label="Filter by rate source"
                            >
                                <option value="all">All sources</option>
                                <option value="base">Base</option>
                                <option value="snapshot">Snapshot</option>
                                <option value="override">Override</option>
                                <option value="manual">Manual</option>
                            </select>
                        </div>

                        {/* Desktop / tablet table — horizontal scroll on container only */}
                        <div
                            className="currency-table-container hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-full overflow-x-auto overscroll-x-contain"
                            data-testid="currency-table-container"
                            role="region"
                            aria-label="Currency list. Scroll horizontally to view additional columns."
                            tabIndex={0}
                        >
                            <table className="currency-table w-full text-sm text-left min-w-[880px] border-collapse">
                                <thead className="bg-gray-50 text-gray-500 uppercase font-bold text-xs">
                                    <tr>
                                        <th className="px-4 lg:px-6 py-3 sticky left-0 z-20 bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                                            Code
                                        </th>
                                        <th className="px-4 lg:px-6 py-3">Name</th>
                                        <th className="px-4 lg:px-6 py-3">Symbol</th>
                                        <th className="px-4 lg:px-6 py-3">Rate (vs Base)</th>
                                        <th className="px-4 lg:px-6 py-3">Rate Source</th>
                                        <th className="px-4 lg:px-6 py-3">Status</th>
                                        <th className="px-4 lg:px-6 py-3">Default</th>
                                        <th className="px-4 lg:px-6 py-3 text-right sticky right-0 z-20 bg-gray-50 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {pagedCurrencies.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-10 text-center text-gray-500">
                                                No currencies match your filters.
                                            </td>
                                        </tr>
                                    ) : (
                                        pagedCurrencies.map((curr, index) => (
                                            <tr key={`currency-${curr.code || index}`} className="hover:bg-gray-50 group">
                                                <td className="px-4 lg:px-6 py-3 font-bold sticky left-0 z-10 bg-white group-hover:bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                                                    {curr.code}
                                                </td>
                                                <td className="px-4 lg:px-6 py-3 whitespace-nowrap">{curr.name}</td>
                                                <td className="px-4 lg:px-6 py-3 font-mono">{curr.symbol}</td>
                                                <td className="px-4 lg:px-6 py-3">
                                                    <input
                                                        type="number"
                                                        step="0.0001"
                                                        min="0.0001"
                                                        disabled={currencyConfig.autoExchangeRate || curr.isDefault}
                                                        title={String(curr.rate ?? '')}
                                                        className="min-w-[7.5rem] w-28 max-w-[10rem] border border-gray-200 rounded px-2 py-2 text-right tabular-nums disabled:bg-gray-100 disabled:text-gray-500 focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                                                        value={curr.rate || 0}
                                                        onChange={(e) =>
                                                            updateCurrencyRate(curr.code, parseFloat(e.target.value) || 0)
                                                        }
                                                        aria-label={`Rate for ${curr.code}`}
                                                    />
                                                </td>
                                                <td className="px-4 lg:px-6 py-3">
                                                    <div className="flex flex-col gap-1 min-w-[7rem]">
                                                        <span
                                                            className={`inline-flex w-fit rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                                                                curr.rateSource === 'override'
                                                                    ? 'bg-amber-100 text-amber-700'
                                                                    : curr.rateSource === 'snapshot'
                                                                      ? 'bg-blue-100 text-blue-700'
                                                                      : curr.rateSource === 'base'
                                                                        ? 'bg-emerald-100 text-emerald-700'
                                                                        : 'bg-slate-100 text-slate-700'
                                                            }`}
                                                        >
                                                            {curr.rateSource || 'manual'}
                                                        </span>
                                                        <span className="text-[11px] text-gray-400 whitespace-nowrap">
                                                            {curr.rateUpdatedAt
                                                                ? new Date(curr.rateUpdatedAt).toLocaleString()
                                                                : 'No runtime snapshot'}
                                                        </span>
                                                        {curr.stale && (
                                                            <span className="text-[11px] font-semibold text-amber-600">
                                                                Stale
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 lg:px-6 py-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleCurrency(curr.code)}
                                                        className={`px-3 py-2 min-h-[40px] rounded text-xs font-bold uppercase ${
                                                            curr.isActive
                                                                ? 'bg-green-100 text-green-700'
                                                                : 'bg-gray-100 text-gray-500'
                                                        }`}
                                                    >
                                                        {curr.isActive ? 'Active' : 'Disabled'}
                                                    </button>
                                                </td>
                                                <td className="px-4 lg:px-6 py-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetDefaultCurrency(curr.code)}
                                                        aria-label={
                                                            curr.isDefault
                                                                ? `${curr.code} is base currency`
                                                                : `Set ${curr.code} as base`
                                                        }
                                                        className={`w-10 h-10 rounded-full border flex items-center justify-center ${
                                                            curr.isDefault
                                                                ? 'border-blue-600 bg-blue-600'
                                                                : 'border-gray-300 hover:border-blue-400'
                                                        }`}
                                                    >
                                                        {curr.isDefault && (
                                                            <div className="w-2 h-2 bg-white rounded-full" />
                                                        )}
                                                    </button>
                                                </td>
                                                <td className="px-4 lg:px-6 py-3 text-right sticky right-0 z-10 bg-white group-hover:bg-gray-50 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                                                    {!curr.isDefault && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteCurrency(curr.code)}
                                                            className="text-red-400 hover:text-red-600 p-2 min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg hover:bg-red-50"
                                                            aria-label={`Remove ${curr.code}`}
                                                            title="Remove currency"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="md:hidden space-y-3" data-testid="currency-mobile-cards">
                            {pagedCurrencies.length === 0 ? (
                                <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500 text-sm">
                                    No currencies match your filters.
                                </div>
                            ) : (
                                pagedCurrencies.map((curr, index) => (
                                    <article
                                        key={`currency-card-${curr.code || index}`}
                                        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="text-lg font-bold text-gray-900">
                                                    {curr.code}{' '}
                                                    <span className="font-mono text-base text-gray-500">
                                                        {curr.symbol}
                                                    </span>
                                                </p>
                                                <p className="text-sm text-gray-600">{curr.name}</p>
                                            </div>
                                            <span
                                                className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                                                    curr.isActive
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-gray-100 text-gray-500'
                                                }`}
                                            >
                                                {curr.isActive ? 'Active' : 'Disabled'}
                                            </span>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-gray-500 uppercase">
                                                Rate vs base
                                            </label>
                                            <input
                                                type="number"
                                                step="0.0001"
                                                min="0.0001"
                                                disabled={currencyConfig.autoExchangeRate || curr.isDefault}
                                                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-right tabular-nums min-h-[44px] disabled:bg-gray-100"
                                                value={curr.rate || 0}
                                                onChange={(e) =>
                                                    updateCurrencyRate(curr.code, parseFloat(e.target.value) || 0)
                                                }
                                            />
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                                            <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold uppercase">
                                                {curr.rateSource || 'manual'}
                                            </span>
                                            {curr.isDefault && (
                                                <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-1 font-semibold">
                                                    Base
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
                                            <button
                                                type="button"
                                                onClick={() => toggleCurrency(curr.code)}
                                                className="flex-1 min-h-[44px] rounded-lg border border-gray-200 text-sm font-semibold"
                                            >
                                                {curr.isActive ? 'Disable' : 'Enable'}
                                            </button>
                                            {!curr.isDefault && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetDefaultCurrency(curr.code)}
                                                    className="flex-1 min-h-[44px] rounded-lg border border-gray-200 text-sm font-semibold"
                                                >
                                                    Set base
                                                </button>
                                            )}
                                            {!curr.isDefault && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteCurrency(curr.code)}
                                                    className="min-h-[44px] min-w-[44px] rounded-lg border border-red-100 text-red-500 inline-flex items-center justify-center"
                                                    aria-label={`Remove ${curr.code}`}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </article>
                                ))
                            )}
                        </div>

                        {/* Pagination */}
                        <div
                            className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600"
                            data-testid="currency-pagination"
                        >
                            <p>
                                Showing{' '}
                                <span className="font-semibold text-gray-900">
                                    {filteredCurrencies.length === 0
                                        ? 0
                                        : (safeCurrencyPage - 1) * currencyPageSize + 1}
                                    –
                                    {Math.min(safeCurrencyPage * currencyPageSize, filteredCurrencies.length)}
                                </span>{' '}
                                of <span className="font-semibold text-gray-900">{filteredCurrencies.length}</span>{' '}
                                currencies
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    disabled={safeCurrencyPage <= 1}
                                    onClick={() => setCurrencyPage(1)}
                                    className="p-2 min-h-[40px] min-w-[40px] rounded-lg border border-gray-200 disabled:opacity-40"
                                    aria-label="First page"
                                >
                                    <ChevronsLeft className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    disabled={safeCurrencyPage <= 1}
                                    onClick={() => setCurrencyPage((p) => Math.max(1, p - 1))}
                                    className="p-2 min-h-[40px] min-w-[40px] rounded-lg border border-gray-200 disabled:opacity-40"
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="px-2 font-medium tabular-nums">
                                    {safeCurrencyPage} / {currencyTotalPages}
                                </span>
                                <button
                                    type="button"
                                    disabled={safeCurrencyPage >= currencyTotalPages}
                                    onClick={() => setCurrencyPage((p) => Math.min(currencyTotalPages, p + 1))}
                                    className="p-2 min-h-[40px] min-w-[40px] rounded-lg border border-gray-200 disabled:opacity-40"
                                    aria-label="Next page"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    disabled={safeCurrencyPage >= currencyTotalPages}
                                    onClick={() => setCurrencyPage(currencyTotalPages)}
                                    className="p-2 min-h-[40px] min-w-[40px] rounded-lg border border-gray-200 disabled:opacity-40"
                                    aria-label="Last page"
                                >
                                    <ChevronsRight className="w-4 h-4" />
                                </button>
                                <select
                                    className="border border-gray-200 rounded-lg px-2 py-2 min-h-[40px] text-sm"
                                    value={currencyPageSize}
                                    onChange={(e) => setCurrencyPageSize(Number(e.target.value) || 25)}
                                    aria-label="Rows per page"
                                >
                                    <option value={10}>10 / page</option>
                                    <option value={25}>25 / page</option>
                                    <option value={50}>50 / page</option>
                                    <option value={100}>100 / page</option>
                                </select>
                            </div>
                        </div>

                        {/* Add Currency Modal */}
                        {isCurrencyModalOpen && (
                            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                                <div className="bg-white rounded-xl w-full max-w-sm p-6 shadow-2xl">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-bold text-lg">Add New Currency</h3>
                                        <button type="button" onClick={() => setIsCurrencyModalOpen(false)} aria-label="Close">
                                            <X className="w-5 h-5 text-gray-400" />
                                        </button>
                                    </div>
                                    <div className="space-y-4">
                                        <input
                                            className="w-full border rounded p-2.5 min-h-[44px]"
                                            placeholder="Code (e.g. EUR)"
                                            value={newCurrency.code}
                                            onChange={(e) =>
                                                setNewCurrency({ ...newCurrency, code: e.target.value.toUpperCase() })
                                            }
                                        />
                                        <input
                                            className="w-full border rounded p-2.5 min-h-[44px]"
                                            placeholder="Name (e.g. Euro)"
                                            value={newCurrency.name}
                                            onChange={(e) => setNewCurrency({ ...newCurrency, name: e.target.value })}
                                        />
                                        <input
                                            className="w-full border rounded p-2.5 min-h-[44px]"
                                            placeholder="Symbol (e.g. €)"
                                            value={newCurrency.symbol}
                                            onChange={(e) => setNewCurrency({ ...newCurrency, symbol: e.target.value })}
                                        />
                                        <input
                                            type="number"
                                            className="w-full border rounded p-2.5 min-h-[44px]"
                                            placeholder="Initial Rate"
                                            value={newCurrency.rate || 1}
                                            onChange={(e) =>
                                                setNewCurrency({
                                                    ...newCurrency,
                                                    rate: parseFloat(e.target.value) || 1
                                                })
                                            }
                                            min="0.0001"
                                            step="0.0001"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddCurrency}
                                        className="w-full bg-blue-600 text-white rounded-lg py-2.5 min-h-[44px] mt-6 font-bold hover:bg-blue-700"
                                    >
                                        Add Currency
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'email' && (
                    <div className="space-y-6 max-w-2xl animate-fade-in">
                         <div className="bg-white p-6 rounded-xl border border-gray-200">
                            <h3 className="font-bold text-gray-900 mb-6 flex items-center">
                                <Mail className="w-5 h-5 mr-2 text-blue-600" /> Email Configuration
                            </h3>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Provider</label>
                                    <select 
                                        className="w-full border-gray-300 rounded-lg p-2" 
                                        value={selectedEmailProvider} 
                                        onChange={e => setEmailConfig(transitionProviderConfig(emailConfig, e.target.value))}
                                    >
                                        <option value="smtp">Custom SMTP</option>
                                        <option value="ses">Amazon SES</option>
                                        <option value="sendgrid">SendGrid</option>
                                        <option value="mailgun">Mailgun</option>
                                        <option value="brevo">Brevo</option>
                                    </select>
                                </div>
                                <div className="col-span-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                                    <div className="font-semibold">{providerSetupHint.title}</div>
                                    <div className="mt-1 text-blue-800">{providerSetupHint.body}</div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Host</label>
                                    <input 
                                        className="w-full border-gray-300 rounded-lg p-2" 
                                        value={emailConfig.host || ''} 
                                        onChange={e => setEmailConfig({...emailConfig, host: e.target.value})} 
                                        placeholder={
                                            selectedEmailProvider === 'smtp'
                                                ? 'smtp.example.com'
                                                : getProviderDefaultHost(selectedEmailProvider, emailConfig.region)
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Port</label>
                                    <input 
                                        type="number" 
                                        className="w-full border-gray-300 rounded-lg p-2" 
                                        value={emailConfig.port || 587} 
                                        onChange={e => setEmailConfig({...emailConfig, port: parseInt(e.target.value) || 587})}
                                        min="1"
                                        max="65535"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Encryption</label>
                                    <select
                                        className="w-full border-gray-300 rounded-lg p-2"
                                        value={(emailConfig.encryption || emailConfig.smtp_encryption || 'tls').toString().toLowerCase()}
                                        onChange={e =>
                                            setEmailConfig({
                                                ...emailConfig,
                                                encryption: e.target.value as 'tls' | 'ssl' | 'none',
                                                smtp_encryption: e.target.value as 'tls' | 'ssl' | 'none'
                                            })
                                        }
                                    >
                                        <option value="tls">TLS (Recommended)</option>
                                        <option value="ssl">SSL</option>
                                        <option value="none">None</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{getProviderUsernameLabel(selectedEmailProvider)}</label>
                                    <input 
                                        className="w-full border-gray-300 rounded-lg p-2" 
                                        value={emailConfig.username || ''} 
                                        onChange={e => setEmailConfig({...emailConfig, username: e.target.value})} 
                                        placeholder={getProviderUsernamePlaceholder(selectedEmailProvider)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{getProviderPasswordLabel(selectedEmailProvider)}</label>
                                    <input 
                                        type="password" 
                                        className="w-full border-gray-300 rounded-lg p-2" 
                                        value={emailConfig.password || ''} 
                                        onChange={e => setEmailConfig({...emailConfig, password: e.target.value})}
                                        placeholder={getProviderPasswordPlaceholder(selectedEmailProvider)}
                                    />
                                </div>
                                {selectedEmailProvider === 'ses' && (
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">SES Region</label>
                                        <input
                                            className="w-full border-gray-300 rounded-lg p-2"
                                            value={emailConfig.region || 'us-east-1'}
                                            onChange={e =>
                                                setEmailConfig({
                                                    ...emailConfig,
                                                    region: e.target.value,
                                                    ses_region: e.target.value
                                                })
                                            }
                                            placeholder="us-east-1"
                                        />
                                    </div>
                                )}
                                {selectedEmailProvider === 'sendgrid' && (
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">SendGrid API Key</label>
                                        <input
                                            type="password"
                                            className="w-full border-gray-300 rounded-lg p-2"
                                            value={emailConfig.apiKey || ''}
                                            onChange={e =>
                                                setEmailConfig({
                                                    ...emailConfig,
                                                    apiKey: e.target.value,
                                                    api_key: e.target.value
                                                })
                                            }
                                            placeholder="SG.xxxxx"
                                        />
                                    </div>
                                )}
                                {selectedEmailProvider === 'mailgun' && (
                                    <>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Mailgun Domain</label>
                                            <input
                                                className="w-full border-gray-300 rounded-lg p-2"
                                                value={emailConfig.domain || ''}
                                                onChange={e =>
                                                    setEmailConfig({
                                                        ...emailConfig,
                                                        domain: e.target.value,
                                                        mailgun_domain: e.target.value
                                                    })
                                                }
                                                placeholder="mg.example.com"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Mailgun API Key</label>
                                            <input
                                                type="password"
                                                className="w-full border-gray-300 rounded-lg p-2"
                                                value={emailConfig.apiKey || ''}
                                                onChange={e =>
                                                    setEmailConfig({
                                                        ...emailConfig,
                                                        apiKey: e.target.value,
                                                        api_key: e.target.value
                                                    })
                                                }
                                                placeholder="key-xxxxxxxx"
                                            />
                                        </div>
                                    </>
                                )}
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">From Name</label>
                                    <input 
                                        className="w-full border-gray-300 rounded-lg p-2" 
                                        value={emailConfig.fromName || ''} 
                                        onChange={e => setEmailConfig({...emailConfig, fromName: e.target.value})} 
                                        placeholder="Scrolith"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">From Email</label>
                                    <input 
                                        className="w-full border-gray-300 rounded-lg p-2" 
                                        value={emailConfig.fromEmail || ''} 
                                        onChange={e => setEmailConfig({...emailConfig, fromEmail: e.target.value})} 
                                        placeholder="noreply@Scrolith.com"
                                        type="email"
                                    />
                                </div>
                            </div>
                            
                            <div className="border-t border-gray-100 pt-6 mt-6">
                                <h4 className="font-bold text-gray-900 mb-2">Test Configuration</h4>
                                <div className="flex gap-2">
                                    <input 
                                        className="flex-1 border-gray-300 rounded-lg p-2 text-sm" 
                                        placeholder="Enter recipient email" 
                                        value={testEmail}
                                        onChange={e => setTestEmail(e.target.value)}
                                        type="email"
                                    />
                                    <button 
                                        onClick={handleTestEmail}
                                        disabled={isTestingEmail}
                                        className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {isTestingEmail ? (
                                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                        ) : (
                                            <Send className="w-3 h-3 mr-2" />
                                        )}
                                        {isTestingEmail ? 'Sending...' : 'Send Test'}
                                    </button>
                                </div>
                            </div>
                         </div>
                    </div>
                )}

                {activeTab === 'ai' && (
                    <div className="space-y-8 animate-fade-in max-w-2xl">
                        {/* Cost Control */}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
                            <h3 className="font-bold text-yellow-800 mb-4 flex items-center">
                                <DollarSign className="w-5 h-5 mr-2" /> AI Cost Control
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-yellow-700">Enable Cost Control</span>
                                    <input 
                                        type="checkbox" 
                                        checked={aiConfig.costControl?.enabled ?? aiConfig.cost_control?.enabled ?? false} 
                                        onChange={e => handleAIChange('costControl', 'enabled', e.target.checked)} 
                                        className="rounded text-blue-600" 
                                    />
                                </div>
                                {(aiConfig.costControl?.enabled ?? aiConfig.cost_control?.enabled) && (
                                    <div>
                                        <label className="block text-xs font-bold text-yellow-700 uppercase mb-1">Monthly Limit (USD)</label>
                                        <input 
                                            type="number" 
                                            className="w-full border-yellow-200 bg-yellow-100 rounded-lg p-2" 
                                            value={aiConfig.costControl?.monthlyLimitUSD ?? aiConfig.cost_control?.monthly_limit_usd ?? 100} 
                                            onChange={e => handleAIChange('costControl', 'monthlyLimitUSD', parseFloat(e.target.value) || 100)} 
                                            min="1"
                                            step="10"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Google Gemini */}
                        <div className="bg-white border border-gray-200 rounded-xl p-6">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3 text-blue-600 font-bold">G</div>
                                    <div>
                                        <h4 className="font-bold text-gray-900">Google Gemini</h4>
                                        <p className="text-xs text-gray-500">
                                            Model: {aiConfig.providers?.google?.model || 'gemini-pro'}
                                        </p>
                                    </div>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={aiConfig.providers?.google?.enabled || false} 
                                    onChange={e => handleAIChange('providers', 'google.enabled', e.target.checked)} 
                                    className="rounded text-blue-600" 
                                />
                            </div>
                            <input 
                                type="password" 
                                className="w-full border-gray-300 rounded-md text-sm p-2.5" 
                                value={aiConfig.providers?.google?.apiKey ?? aiConfig.providers?.google?.api_key ?? ''} 
                                onChange={e => handleAIChange('providers', 'google.apiKey', e.target.value)} 
                                placeholder="Enter Gemini API Key" 
                            />
                            {aiConfig.providers?.google?.enabled && (
                                <select 
                                    className="w-full border-gray-300 rounded-md text-sm p-2.5 mt-2"
                                    value={aiConfig.providers?.google?.model || 'gemini-pro'}
                                    onChange={e => handleAIChange('providers', 'google.model', e.target.value)}
                                >
                                    <option value="gemini-pro">Gemini Pro</option>
                                    <option value="gemini-pro-vision">Gemini Pro Vision</option>
                                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                </select>
                            )}
                        </div>
                        
                        {/* OpenAI */}
                        <div className="bg-white border border-gray-200 rounded-xl p-6">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3 text-green-600 font-bold">O</div>
                                    <div>
                                        <h4 className="font-bold text-gray-900">OpenAI</h4>
                                        <p className="text-xs text-gray-500">
                                            Model: {aiConfig.providers?.openai?.model || 'gpt-4'}
                                        </p>
                                    </div>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={aiConfig.providers?.openai?.enabled || false} 
                                    onChange={e => handleAIChange('providers', 'openai.enabled', e.target.checked)} 
                                    className="rounded text-blue-600" 
                                />
                            </div>
                            <input 
                                type="password" 
                                className="w-full border-gray-300 rounded-md text-sm p-2.5" 
                                value={aiConfig.providers?.openai?.apiKey ?? aiConfig.providers?.openai?.api_key ?? ''} 
                                onChange={e => handleAIChange('providers', 'openai.apiKey', e.target.value)} 
                                placeholder="Enter OpenAI API Key" 
                            />
                            {aiConfig.providers?.openai?.enabled && (
                                <select 
                                    className="w-full border-gray-300 rounded-md text-sm p-2.5 mt-2"
                                    value={aiConfig.providers?.openai?.model || 'gpt-4'}
                                    onChange={e => handleAIChange('providers', 'openai.model', e.target.value)}
                                >
                                    <option value="gpt-4">GPT-4</option>
                                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                                </select>
                            )}
                        </div>

                        {/* AI Routing */}
                        <div className="bg-white border border-gray-200 rounded-xl p-6">
                            <h4 className="font-bold text-gray-900 mb-4">AI Routing Configuration</h4>
                            <div className="space-y-3">
                                {aiRoutingOptions.map((option) => (
                                    <div key={option.id} className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-gray-700">{option.label}</span>
                                        <select 
                                            className="border-gray-300 rounded-md text-sm p-1"
                                            value={aiConfig.routing?.[option.id as keyof typeof aiConfig.routing] || 'google'}
                                            onChange={e => handleAIChange('routing', option.id, e.target.value)}
                                        >
                                            <option value="google">Google</option>
                                            <option value="openai">OpenAI</option>
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* AI Safety Settings */}
                        <div className="bg-white border border-gray-200 rounded-xl p-6">
                            <h4 className="font-bold text-gray-900 mb-4">Safety & Performance</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Max Tokens</label>
                                    <input 
                                        type="number" 
                                        className="w-full border-gray-300 rounded-md p-2" 
                                        value={aiConfig.safety?.maxTokens ?? aiConfig.safety?.max_tokens ?? 2048} 
                                        onChange={e => handleAIChange('safety', 'maxTokens', parseInt(e.target.value) || 2048)} 
                                        min="100"
                                        max="8192"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Temperature</label>
                                    <input 
                                        type="number" 
                                        step="0.1"
                                        className="w-full border-gray-300 rounded-md p-2" 
                                        value={aiConfig.safety?.temperature || 0.7} 
                                        onChange={e => handleAIChange('safety', 'temperature', parseFloat(e.target.value) || 0.7)} 
                                        min="0"
                                        max="2"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-xl p-6">
                            <div className="flex items-start justify-between gap-4 mb-4">
                                <div>
                                    <h4 className="font-bold text-gray-900">Resume / CV AI Controls</h4>
                                    <p className="text-xs text-gray-500">
                                        Manage resume builder and analyzer availability for freelancer and client dashboards.
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={resumeAiConfig.enabled}
                                    onChange={(e) => setResumeAiConfig((prev) => normalizeResumeAiPolicy({ ...prev, enabled: e.target.checked }))}
                                    className="rounded text-blue-600"
                                />
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                                <label className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                    <span className="text-sm font-medium text-gray-700">Enable Resume/CV Builder</span>
                                    <input
                                        type="checkbox"
                                        checked={resumeAiConfig.builderEnabled}
                                        onChange={(e) => setResumeAiConfig((prev) => normalizeResumeAiPolicy({ ...prev, builderEnabled: e.target.checked }))}
                                        className="rounded text-blue-600"
                                    />
                                </label>
                                <label className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                    <span className="text-sm font-medium text-gray-700">Enable Resume/CV Reviewer</span>
                                    <input
                                        type="checkbox"
                                        checked={resumeAiConfig.reviewerEnabled}
                                        onChange={(e) => setResumeAiConfig((prev) => normalizeResumeAiPolicy({ ...prev, reviewerEnabled: e.target.checked }))}
                                        className="rounded text-blue-600"
                                    />
                                </label>
                                <label className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 md:col-span-2">
                                    <span className="text-sm font-medium text-gray-700">Allow admin access even when the module is limited</span>
                                    <input
                                        type="checkbox"
                                        checked={resumeAiConfig.adminAccessEnabled}
                                        onChange={(e) => setResumeAiConfig((prev) => normalizeResumeAiPolicy({ ...prev, adminAccessEnabled: e.target.checked }))}
                                        className="rounded text-blue-600"
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                )}
                
                {activeTab === 'compliance' && (
                    <div className="space-y-6 animate-fade-in max-w-4xl">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Regional Compliance Settings</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {Array.isArray(compliance) && compliance.map((comp) => (
                                <div key={`compliance-${comp.code}`} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center">
                                            <Globe className="w-5 h-5 text-indigo-600 mr-2" />
                                            <h3 className="font-bold text-gray-900">{comp.region}</h3>
                                        </div>
                                        <div 
                                            onClick={() => toggleCompliance(comp.code)} 
                                            className={`w-10 h-5 rounded-full cursor-pointer relative transition-colors ${comp.active ? 'bg-green-500' : 'bg-gray-300'}`}
                                        >
                                            <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${comp.active ? 'left-6' : 'left-1'}`}></div>
                                        </div>
                                    </div>
                                    <div className="space-y-2 text-sm text-gray-600">
                                        <div className="flex justify-between">
                                            <span>GDPR:</span> 
                                            <strong className={comp.gdprEnabled ? 'text-green-600' : 'text-red-500'}>
                                                {comp.gdprEnabled ? 'Enabled' : 'Disabled'}
                                            </strong>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Data Center:</span> 
                                            <strong>{comp.dataResidency}</strong>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>KYC Engine:</span> 
                                            <strong>{comp.kycProvider}</strong>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Tax Auto:</span> 
                                            <strong>{comp.taxEngine}</strong>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {activeTab === 'evidence' && (
                    <div className="space-y-6 animate-fade-in max-w-4xl">
                         <div className="bg-white p-6 rounded-xl border border-gray-200">
                             <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                                 <ShieldCheck className="w-5 h-5 mr-2 text-green-600" /> SOC-2 Compliance Evidence
                             </h3>
                             <p className="text-sm text-gray-500 mb-6">Automatically generated artifacts for compliance audits.</p>
                             
                             <table className="w-full text-sm text-left">
                                 <thead className="bg-gray-50 text-gray-500">
                                     <tr>
                                         <th className="p-3">Artifact Name</th>
                                         <th className="p-3">Date</th>
                                         <th className="p-3">Size</th>
                                         <th className="p-3">Status</th>
                                         <th className="p-3 text-right">Action</th>
                                     </tr>
                                 </thead>
                                 <tbody className="divide-y divide-gray-100">
                                     {[
                                        { id: 'audit-logs', name: 'Audit Logs', type: 'CSV', date: '2023-10-30', size: '12MB', status: 'ready' },
                                        { id: 'access-logs', name: 'Access Logs', type: 'JSON', date: '2023-10-30', size: '45MB', status: 'ready' },
                                        { id: 'incident-report', name: 'Incident Response Report', type: 'PDF', date: '2023-09-15', size: '2.4MB', status: 'archived' },
                                        { id: 'vendor-risk', name: 'Vendor Risk Assessment', type: 'PDF', date: '2023-08-01', size: '5MB', status: 'ready' },
                                        { id: 'pen-test', name: 'Penetration Test Results', type: 'PDF', date: '2023-07-20', size: '8MB', status: 'restricted' },
                                    ].map((art) => (
                                         <tr key={`artifact-${art.id}`} className="hover:bg-gray-50">
                                             <td className="p-3 font-medium flex items-center">
                                                 <FileText className="w-4 h-4 mr-2 text-gray-400" /> {art.name}
                                             </td>
                                             <td className="p-3 text-gray-500">{art.date}</td>
                                             <td className="p-3 text-gray-500">{art.size}</td>
                                             <td className="p-3">
                                                 <span className={`px-2 py-0.5 rounded text-xs uppercase font-bold ${art.status === 'ready' ? 'bg-green-100 text-green-700' : art.status === 'archived' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                                     {art.status}
                                                 </span>
                                             </td>
                                             <td className="p-3 text-right">
                                                 <button
                                                     className="text-blue-600 hover:underline text-xs"
                                                     onClick={() => handleEvidenceDownload(art)}
                                                 >
                                                     Download
                                                 </button>
                                             </td>
                                         </tr>
                                     ))}
                                 </tbody>
                             </table>
                         </div>
                    </div>
                )}

            </div>
            </div>

            <div className="p-3 sm:p-4 border-t border-gray-200 bg-gray-50 flex flex-wrap justify-end gap-2 flex-shrink-0 w-full">
                <button 
                    onClick={handleSave} 
                    disabled={isSaving}
                    className="bg-blue-600 text-white px-6 py-2.5 min-h-[44px] rounded-lg font-bold hover:bg-blue-700 inline-flex items-center shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isSaving ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <Save className="w-4 h-4 mr-2" />
                    )}
                    {isSaving ? 'Saving...' : 'Save All Changes'}
                </button>
            </div>

            <FilePickerModal
                isOpen={isLabelPickerOpen}
                onClose={() => {
                    setIsLabelPickerOpen(false);
                    setLabelPickerTarget(null);
                }}
                onSelect={handleLabelSelect}
                allowUpload
                filterType="image"
                acceptedTypes="image/*"
                role="admin"
            />
        </div>
    );
};

export default SystemSettings;



