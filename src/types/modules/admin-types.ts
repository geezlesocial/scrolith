// Admin dashboard types
export interface AdminDashboardStats {
  totals: {
    users: number;
    freelancers: number;
    employers: number;
    gigs: number;
    jobs: number;
    orders: number;
    revenue: number;
    disputes: number;
  };
  today: {
    new_users: number;
    new_gigs: number;
    new_jobs: number;
    new_orders: number;
    revenue: number;
  };
  charts: {
    user_growth: { date: string; count: number }[];
    revenue_trend: { date: string; amount: number }[];
    category_distribution: { category: string; count: number }[];
  };
  recent_activity: {
    id: string;
    type: 'user' | 'gig' | 'job' | 'order' | 'support';
    action: 'created' | 'updated' | 'deleted' | 'approved' | 'rejected';
    title: string;
    user: string;
    time: string;
  }[];
}

export interface AnalyticsDashboard {
  total_users: number;
  active_users: number;
  new_signups: { daily: number; weekly: number; monthly: number };
  revenue_metrics: {
    total_revenue: number;
    escrow_balance: number;
    commission_earned: number;
    pending_withdrawals: number;
  };
  top_performing: {
    categories: { name: string; count: number; revenue: number }[];
    freelancers: { name: string; earnings: number; completed_orders: number }[];
    employers: { name: string; spend: number; posted_jobs: number }[];
  };
  growth_metrics: {
    user_growth: number;
    revenue_growth: number;
    conversion_rate: number;
    churn_rate: number;
  };
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    database: { status: 'up' | 'down'; latency?: number };
    redis: { status: 'up' | 'down'; latency?: number };
    storage: { status: 'up' | 'down'; usage?: string };
    email: { status: 'up' | 'down' };
    payment_gateways: { name: string; status: 'up' | 'down' }[];
  };
  metrics: {
    cpu_usage: number;
    memory_usage: number;
    disk_usage: number;
    request_rate: number;
    error_rate: number;
  };
  uptime: number;
  last_checked: string;
}

export interface PlatformSettings {
  site_name: string;
  tagline: string;
  logo_url: string;
  logo_file_id?: string;
  favicon_url: string;
  favicon_file_id?: string;
  admin_email: string;
  support_email: string;
  footer_about_title: string;
  footer_about_text: string;
  footer_copyright: string;
  footer_links: any[]; 
  social_links: any[];
  pro_freelancer_label_url?: string;
  pro_freelancer_label_file_id?: string;
  pro_employer_label_url?: string;
  pro_employer_label_file_id?: string;
  system?: SystemConfig;
  
  features?: {
    community_enabled: boolean;
    blog_enabled: boolean;
    affiliate_enabled: boolean;
    gcoin_enabled: boolean;
    time_tracker_enabled: boolean;
    ai_enabled: boolean;
    kyc_enabled: boolean;
  };
  
  limits?: {
    max_file_size: number;
    max_gigs_per_user: number;
    max_jobs_per_user: number;
    max_portfolio_items: number;
  };
}

export interface PlatformSettingsExtended extends PlatformSettings {
  require_login_to_view?: boolean;
  allow_guest_comments?: boolean;
  allow_media_uploads?: boolean;
  enable_reposts?: boolean;
  allow_external_links?: boolean;
  auto_moderate_content?: boolean;
  sentiment_analysis?: boolean;
  enable_clubs?: boolean;
  enable_events?: boolean;
}

export interface OptimizationConfig {
  enabled?: boolean;
  compressionEnabled?: boolean;
  compression_enabled?: boolean;
  compressionLevel?: number;
  compression_level?: number;
  compressionThresholdKb?: number;
  compression_threshold_kb?: number;
  apiResponseCachingEnabled?: boolean;
  api_response_caching_enabled?: boolean;
  apiResponseCacheSeconds?: number;
  api_response_cache_seconds?: number;
  apiResponseCacheMaxEntries?: number;
  api_response_cache_max_entries?: number;
  staticAssetCachingEnabled?: boolean;
  static_asset_caching_enabled?: boolean;
  staticAssetCacheSeconds?: number;
  static_asset_cache_seconds?: number;
  htmlMinifyEnabled?: boolean;
  html_minify_enabled?: boolean;
  htmlCollapseWhitespace?: boolean;
  html_collapse_whitespace?: boolean;
  htmlRemoveComments?: boolean;
  html_remove_comments?: boolean;
  jsonMinifyEnabled?: boolean;
  json_minify_enabled?: boolean;
  speedHintsEnabled?: boolean;
  speed_hints_enabled?: boolean;
  preconnectOrigins?: string[];
  preconnect_origins?: string[];
  apiCacheExcludePaths?: string[];
  api_cache_exclude_paths?: string[];
  dataSaverModeEnabled?: boolean;
  data_saver_mode_enabled?: boolean;
  autoplayEnabled?: boolean;
  autoplay_enabled?: boolean;
  feedPageSize?: number;
  feed_page_size?: number;
  lowBandwidthFeedPageSize?: number;
  low_bandwidth_feed_page_size?: number;
  realtimeThrottleMs?: number;
  realtime_throttle_ms?: number;
  mediaQualityPreset?: 'auto' | 'low' | 'balanced' | 'high';
  media_quality_preset?: 'auto' | 'low' | 'balanced' | 'high';
}

export interface SystemConfig {
  maintenance_mode: boolean;
  registrations_enabled: boolean;
  kyc_enforced: boolean;
  admin_2fa: boolean;
  currency?: {
    auto_exchange_rate: boolean;
    base_currency: string;
    provider: 'openexchangerates' | 'fixer' | 'mock';
    api_key?: string;
  };
  storage?: {
    driver: string;
    s3: { access_key_id: string; secret_access_key: string; region: string; bucket: string };
    backblaze: { access_key_id: string; secret_access_key: string; region: string; bucket: string };
  };
  cache?: {
    driver: string;
    redis: { host: string; port: number; password: string };
  };
  email?: EmailProviderConfig;
  regional_compliance?: ComplianceConfig[];
  optimization?: OptimizationConfig;
}

export interface ComplianceConfig {
  region: string;
  code: string;
  gdpr_enabled: boolean;
  data_residency: string;
  kyc_provider: string;
  tax_engine: string;
  active: boolean;
}

export interface EmailProviderConfig {
  provider: 'smtp' | 'ses' | 'sendgrid' | 'mailgun' | 'brevo';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  secure?: boolean;
  encryption?: 'tls' | 'ssl' | 'none';
  smtp_encryption?: 'tls' | 'ssl' | 'none';
  from_name?: string;
  fromName?: string;
  from_email?: string;
  fromEmail?: string;
  api_key?: string;
  apiKey?: string;
  domain?: string;
  mailgun_domain?: string;
  brevoSmtpLogin?: string;
  brevo_smtp_login?: string;
  brevoSmtpKey?: string;
  brevo_smtp_key?: string;
  region?: string;
  ses_region?: string;
  access_key_id?: string;
  accessKeyId?: string;
  secret_access_key?: string;
  secretAccessKey?: string;
}
