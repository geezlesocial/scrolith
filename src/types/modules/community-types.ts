// Community-related types
export type ThreadStatus = 'open' | 'solved' | 'locked';
export type ChannelType = 'public' | 'private' | 'club' | 'event';
export type ChannelVisibility = 'public' | 'private';

export interface ForumThread {
  id: string;
  category_id: string;
  category_name: string;
  user_id: string;
  user_name: string;
  user_avatar: string;
  title: string;
  content: string;
  status: ThreadStatus;
  views: number;
  replies_count: number;
  upvotes: number;
  is_pinned: boolean;
  is_locked: boolean;
  created_at: string;
  tags: string[];
  interactions: InteractionCounts;
  user_state: InteractionState;
}

export interface CommunityClub {
  id: string;
  name: string;
  description: string;
  visibility: ChannelVisibility;
  member_count: number;
  cover_image: string;
  owner_id: string;
  is_joined?: boolean;
  created_at?: string;
}

export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  type: 'workshop' | 'meetup' | 'webinar';
  host_name: string;
  attendees: number;
  image: string;
  is_registered?: boolean;
  location?: string;
  max_attendees?: number;
}

export interface CommunityChannel {
  id: string;
  name: string;
  type: ChannelType;
  is_paid: boolean;
  price: number;
  unread_count: number;
  online_count: number;
  is_locked?: boolean;
  description?: string;
  members?: number;
  is_public?: boolean;
  is_joined?: boolean;
  created_at?: string;
  last_activity?: string;
}

export interface CommunityMessage {
  id: string;
  channel_id: string;
  user_id: string;
  user_name: string;
  user_avatar: string;
  content: string;
  timestamp: string;
  ai_flagged: boolean;
  ai_reason?: string;
}

export interface CommunityComment {
  id: string;
  thread_id: string;
  parent_id: string | null;
  user_id: string;
  user_name: string;
  user_avatar: string;
  user_role: string;
  content: string;
  created_at: string;
  likes: number;
  is_liked: boolean;
  replies?: CommunityComment[];
  mentions?: string[];
}

export interface ContributorProfile {
  user_id: string;
  user_name: string;
  avatar: string;
  points: number;
  reputation: string;
  badges: string[];
  join_date?: string;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  user_name: string;
  user_avatar: string;
  score: number;
  trend: 'up' | 'down' | 'stable';
  contributions: number;
  category: string;
}

export interface InteractionCounts {
  likes: number;
  comments: number;
  reposts: number;
  shares: number;
  views?: number;
  reactions?: number;
}

export interface InteractionState {
  liked: boolean;
  reposted: boolean;
}

export interface ReputationScore {
  user_id: string;
  score: number;
  trust_level: string;
  badges: string[];
  signals: { name: string; impact: number }[];
  history?: any[];
}

export interface CommunitySettings {
  id: string;
  site_name: string;
  site_description: string;
  site_tagline: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  currency: string;
  timezone: string;
  language: string;
  date_format: string;
  time_format: string;
  maintenance_mode: boolean;
  registration_enabled: boolean;
  email_verification_required: boolean;
  default_user_role: string;
  max_file_size: number;
  allowed_file_types: string[];
  seo_title: string;
  seo_description: string;
  seo_keywords: string[];
  
  require_login_to_view: boolean;
  allow_guest_comments: boolean;
  allow_media_uploads: boolean;
  enable_reposts: boolean;
  allow_external_links: boolean;
  auto_moderate_content: boolean;
  sentiment_analysis: boolean;
  enable_clubs: boolean;
  enable_events: boolean;

  // camelCase aliases (compat)
  requireLoginToView?: boolean;
  allowGuestComments?: boolean;
  allowMediaUploads?: boolean;
  enableReposts?: boolean;
  allowExternalLinks?: boolean;
  autoModerateContent?: boolean;
  sentimentAnalysis?: boolean;
  enableClubs?: boolean;
  enableEvents?: boolean;
  
  payment_currency: string;
  payment_test_mode: boolean;
  payment_stripe_key: string | null;
  payment_stripe_secret: string | null;
  payment_paypal_client_id: string | null;
  payment_paypal_secret: string | null;
  
  social_facebook: string | null;
  social_twitter: string | null;
  social_linkedin: string | null;
  social_instagram: string | null;
  
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password: string | null;
  smtp_encryption: string;
  mail_from_name: string;
  
  google_analytics_id: string | null;
  facebook_pixel_id: string | null;
  recaptcha_site_key: string | null;
  
  created_at: string;
  updated_at: string;
}

export interface CommunityAnalytics {
  health_score: number;
  active_users: number;
  messages_today: number;
  ai_flagged_count: number;
  engagement_trend: number[];
  top_channels: { name: string; activity: number }[];
  toxicity_score: number;
  total_members?: number;
  active_today?: number;
  new_this_week?: number;
  total_threads?: number;
  total_comments?: number;
  total_clubs?: number;
  total_events?: number;
  growth_rate?: number;
  engagement_rate?: number;
  top_topics?: string[];
  weekly_activity?: { day: string; count: number }[];
  popular_clubs?: { name: string; members: number }[];
}

export interface ModerationLog {
  id: string;
  user_name: string;
  snippet: string;
  risk_level: 'Low' | 'Medium' | 'High';
  reason: string;
  action_taken: string;
  timestamp?: string;
  moderator_id?: string;
  moderator_name?: string;
  target_id?: string;
  target_type?: string;
  notes?: string;
  severity?: string;
}

export interface CommunityHomepageSlide {
  id: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  videoUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface CommunityHomepageSection {
  id: string;
  type: 'text' | 'image' | 'video' | 'slider';
  title?: string;
  body?: string;
  imageUrl?: string;
  videoUrl?: string;
  slides?: CommunityHomepageSlide[];
}

export interface CommunityHomepageConfig {
  hero: {
    title: string;
    subtitle: string;
    backgroundImage?: string;
    backgroundColor?: string;
  };
  banner: {
    enabled: boolean;
    text: string;
  };
  sliders: CommunityHomepageSlide[];
  sections: CommunityHomepageSection[];
}
