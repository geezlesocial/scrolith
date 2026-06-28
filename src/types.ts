// C:\Projects\Scrolith\src\types.ts
// Enhanced with consistent naming, union types, pagination, API responses, and dashboard types

// ==================== ENUMS ====================
export enum UserRole {
  GUEST = 'guest',
  FREELANCER = 'freelancer',
  EMPLOYER = 'employer',
  ADMIN = 'admin',
  MODERATOR = 'moderator'
}

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  ESCROW_HOLD = 'escrow_hold',
  ESCROW_RELEASE = 'escrow_release',
  FEE = 'fee',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
  TRANSFER = 'transfer',
  REWARD = 'reward'
}

export enum EscrowStatus {
  HELD = 'Funded',
  RELEASED = 'Released',
  REFUNDED = 'Refunded',
  DISPUTED = 'Disputed'
}

export enum SkillLevel {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced',
  EXPERT = 'Expert'
}

// ==================== TYPE UNIONS ====================
export type UserStatus = 'active' | 'suspended' | 'inactive';
export type KYCDocumentType = 'ID Card' | 'Passport' | 'Driving License';
export type KYCDocumentStatus = 'Pending' | 'Approved' | 'Rejected';
export type KYCStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'verified' | 'under_review';

export type GigStatus = 'draft' | 'submitted' | 'active' | 'paused' | 'rejected' | 'archived' | 'under_review';
export type JobStatus = 'active' | 'closed' | 'draft' | 'submitted' | 'under_review' | 'rejected' | 'archived';
export type OrderStatus = 'Active' | 'Completed' | 'Delivered' | 'Cancelled';
export type ContractStatus = 'active' | 'paused' | 'terminated' | 'completed';
export type TimeEntryStatus = 'pending' | 'approved' | 'paid' | 'rejected';
export type TicketStatus = 'Open' | 'In Review' | 'In Progress' | 'Waiting for User' | 'Resolved' | 'Closed';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type ThreadStatus = 'open' | 'solved' | 'locked';

export type PricingMode = 'packages' | 'milestones' | 'hourly' | 'fixed';
export type RequirementType = 'text' | 'file';
export type PaymentCycle = 'weekly' | 'bi-weekly' | 'monthly';
export type JobType = 'Fixed Price' | 'Hourly' | 'Contract';
export type ExperienceLevel = 'Entry' | 'Intermediate' | 'Expert';
export type Visibility = 'public' | 'private' | 'invite';
export type PageStatus = 'PUBLISHED' | 'DRAFT';
export type BlogPostStatus = 'published' | 'draft' | 'scheduled';
export type StaffStatus = 'active' | 'suspended' | 'inactive';
export type AffiliateStatus = 'active' | 'inactive';
export type SubscriberStatus = 'active' | 'verified' | 'pending' | 'unsubscribed';
export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type SortOrder = 'asc' | 'desc';
export type AnomalySeverity = 'info' | 'warning' | 'critical';

export type AIModule = 'Support' | 'Payments' | 'Jobs' | 'Gigs' | 'KYC' | 'General';
export type PaymentProviderId = 'stripe' | 'paypal' | 'paystack' | 'flutterwave' | 'payoneer' | 'paymongo' | 'monnify' | 'opay' | 'xendit' | 'dragonpay' | 'wallet' | 'balance';
export type ChannelType = 'public' | 'private' | 'club' | 'event';
export type ChannelVisibility = 'public' | 'private';
export type HomepageSectionType =
  | 'hero'
  | 'member_home'
  | 'trust'
  | 'categories'
  | 'how_it_works'
  | 'featured'
  | 'cta'
  | 'skill_matching'
  | 'trending_opps'
  | 'growth_dash'
  | 'gig_creation'
  | 'market_insights'
  | 'project_brief_generator'
  | 'top_pro_services'
  | 'trust_security'
  | 'popular_services'
  | 'promo_banners'
  | 'trust_value'
  | 'video_feature'
  | 'marketplace_tiles'
  | 'guides_grid'
  | 'made_on_Scrolith'
  | 'footer_cta_strip'
  | 'guest_hero_auth'
  | 'guest_what_is_scrolith'
  | 'guest_paths'
  | 'guest_feature_showcase'
  | 'guest_trending_preview'
  | 'guest_community_preview'
  | 'guest_final_cta';
export type ContentBlockType = 'text' | 'heading' | 'image' | 'video' | 'quote' | 'code' | 'callout' | 'cta' | 'ad';
export type MediaType = 'image' | 'video' | 'document';
export type FileCategory = 'portfolio' | 'document' | 'verification' | 'chat';
export type NotificationType = 'info' | 'success' | 'warning' | 'alert' | 'error';
export type GcoinTransactionType = 'reward' | 'transfer' | 'conversion' | 'admin_adjustment';
export type AdPlacement =
  | 'feed'
  | 'sidebar'
  | 'homepage'
  | 'homepage_feed'
  | 'community_feed'
  | 'scroll_preroll'
  | 'scroll_feed'
  | 'forum_top'
  | 'forum_listing'
  | 'thread_detail'
  | 'chat'
  | 'chat_sidebar';

// Uploaded file type for Uploaded Files SSOT
export interface UploadedFileSummary {
  id: string;
  url: string;
  name: string;
  type: MediaType | string;
  size?: number;
  uploadedAt?: string;
  usedIn?: { type: string; id: string; label?: string }[];
}

// ==================== CORE USER TYPES ====================
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  username?: string;
  avatar?: string;
  isActive?: boolean; // Replaces status
  status?: UserStatus; // Keep for compatibility if needed, but map from isActive
  isVerified?: boolean;
  is_verified?: boolean;
  kycStatus?: KYCStatus; // Renamed from kyc_status
  kyc_status?: KYCStatus;
  isProFreelancer?: boolean;
  is_pro_freelancer?: boolean;
  isProEmployer?: boolean;
  is_pro_employer?: boolean;
  freelancerPlanId?: string | null;
  freelancer_plan_id?: string | null;
  freelancerPlanName?: string | null;
  freelancer_plan_name?: string | null;
  freelancerPlanInterval?: string | null;
  freelancer_plan_interval?: string | null;
  freelancerPlanPrice?: number | null;
  freelancer_plan_price?: number | null;
  freelancerPlanCurrency?: string | null;
  freelancer_plan_currency?: string | null;
  freelancerPlanActive?: boolean;
  freelancer_plan_active?: boolean;
  freelancerPlanPurchasedAt?: string | null;
  freelancer_plan_purchased_at?: string | null;
  freelancerPlanExpiresAt?: string | null;
  freelancer_plan_expires_at?: string | null;
  employerPlanId?: string | null;
  employer_plan_id?: string | null;
  employerPlanName?: string | null;
  employer_plan_name?: string | null;
  employerPlanInterval?: string | null;
  employer_plan_interval?: string | null;
  employerPlanPrice?: number | null;
  employer_plan_price?: number | null;
  employerPlanCurrency?: string | null;
  employer_plan_currency?: string | null;
  employerPlanActive?: boolean;
  employer_plan_active?: boolean;
  employerPlanPurchasedAt?: string | null;
  employer_plan_purchased_at?: string | null;
  employerPlanExpiresAt?: string | null;
  employer_plan_expires_at?: string | null;
  followOnboardingRequired?: boolean;
  follow_onboarding_required?: boolean;
  followOnboardingCompletedAt?: string | null;
  follow_onboarding_completed_at?: string | null;
  gcoinBalance?: number; // Renamed from gcoin_balance
  joinDate?: string; // Renamed from join_date
  country?: string;
  location?: string;
  followersCount?: number; // camelCase
  followingCount?: number; // camelCase
  profilePhotoFileId?: string; // camelCase

  // Admin meta
  meta?: {
    lastLogin?: string; // camelCase
    lastActive?: string;
    loginCount?: number;
    ipAddress?: string;
    userAgent?: string;
  };

  flags?: {
    isVerified?: boolean; // camelCase
    isFeatured?: boolean;
    isBanned?: boolean;
    isSuspended?: boolean;
    requiresKyc?: boolean;
  };
}

export interface FollowOnboardingStatus {
  required: boolean;
  completedAt?: string | null;
  followedCount: number;
  minimumRequired: number;
  maximumSelectable: number;
  canContinue: boolean;
  redirectPath: string;
}

export interface StructuredLocationFields {
  location?: string;
  formatted_address?: string | null;
  formattedAddress?: string | null;
  country?: string | null;
  country_code?: string | null;
  countryCode?: string | null;
  state?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  place_id?: string | null;
  placeId?: string | null;
  location_source?: string | null;
  locationSource?: string | null;
}

export interface LocationSuggestion extends StructuredLocationFields {
  id: string;
  label: string;
  subtitle?: string | null;
}

export interface UserProfile extends StructuredLocationFields {
  user_id: string;
  userId?: string;
  title: string;
  bio: string;
  location: string;
  languages: string[];
  skills: string[];
  hourly_rate: number;
  hourlyRate?: number;
  portfolio: PortfolioItem[];
  experience: Experience[];
  education: Education[];
  certifications: Certification[];
  intro_video_url?: string;
  introVideoUrl?: string;
  cover_photo_url?: string;
  coverPhotoUrl?: string;
  gender?: string;
  date_of_birth?: string | null;
  dateOfBirth?: string | null;
  birth_month_day?: string;
  birthMonthDay?: string;
  show_birth_month_day_public?: boolean;
  showBirthMonthDayPublic?: boolean;
  rating?: number;
  completedJobs?: number;
  responseRate?: number;
  responseTime?: number;
  profile_photo_file_id?: string;
  profilePhotoFileId?: string;
  avatar_url?: string;
  avatarUrl?: string;
  professional_identity?: ProfessionalIdentitySummary | null;
  professionalIdentity?: ProfessionalIdentitySummary | null;
}

export interface ProfessionalIdentityClub {
  id: string;
  name: string;
  visibility: ChannelVisibility;
  member_count?: number;
  memberCount?: number;
  cover_image?: string;
  coverImage?: string;
  joined_at?: string | null;
  joinedAt?: string | null;
}

export interface ProfessionalIdentitySummary {
  is_verified?: boolean;
  isVerified?: boolean;
  kyc_status?: string;
  kycStatus?: string;
  verification_status?: string;
  verificationStatus?: string;
  is_pro_freelancer?: boolean;
  isProFreelancer?: boolean;
  is_pro_employer?: boolean;
  isProEmployer?: boolean;
  trust_tier?: string;
  trustTier?: string;
  review_count?: number;
  reviewCount?: number;
  average_rating?: number;
  averageRating?: number;
  completed_jobs?: number;
  completedJobs?: number;
  response_rate?: number;
  responseRate?: number;
  response_time_hours?: number | null;
  responseTimeHours?: number | null;
  certification_count?: number;
  certificationCount?: number;
  verified_certification_count?: number;
  verifiedCertificationCount?: number;
  portfolio_proof_count?: number;
  portfolioProofCount?: number;
  verified_portfolio_proof_count?: number;
  verifiedPortfolioProofCount?: number;
  club_count?: number;
  clubCount?: number;
  featured_clubs?: ProfessionalIdentityClub[];
  featuredClubs?: ProfessionalIdentityClub[];
  top_skills?: string[];
  topSkills?: string[];
  badges?: string[];
}

export interface UserSettings {
  email_notifications: boolean;
  in_app_notifications: boolean;
  message_requests_notifications?: boolean;
  allow_in_mail?: boolean;
  mention_notifications?: boolean;
  followed_post_notifications?: boolean;
  follow_notifications?: boolean;
  comment_notifications?: boolean;
  reaction_notifications?: boolean;
  repost_notifications?: boolean;
  job_application_notifications?: boolean;
  application_update_notifications?: boolean;
  notify_mentions?: boolean;
  notify_followed_posts?: boolean;
  notify_followed_you?: boolean;
  notify_comments_on_posts?: boolean;
  notify_reactions_on_posts?: boolean;
  notify_reposts?: boolean;
  notify_job_applications?: boolean;
  notify_application_updates?: boolean;
  marketing_emails: boolean;
  two_factor_enabled: boolean;
  login_alerts: boolean;
  // CamelCase aliases used in UI
  emailNotifications?: boolean;
  inAppNotifications?: boolean;
  messageRequestsNotifications?: boolean;
  allowInMail?: boolean;
  mentionNotifications?: boolean;
  followedPostNotifications?: boolean;
  followNotifications?: boolean;
  commentNotifications?: boolean;
  reactionNotifications?: boolean;
  repostNotifications?: boolean;
  jobApplicationNotifications?: boolean;
  applicationUpdateNotifications?: boolean;
  notifyMentions?: boolean;
  notifyFollowedPosts?: boolean;
  notifyFollowedYou?: boolean;
  notifyCommentsOnPosts?: boolean;
  notifyReactionsOnPosts?: boolean;
  notifyReposts?: boolean;
  notifyJobApplications?: boolean;
  notifyApplicationUpdates?: boolean;
  marketingEmails?: boolean;
  twoFactorEnabled?: boolean;
  loginAlerts?: boolean;
}

// ==================== PORTFOLIO & EXPERIENCE ====================
export interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  image_url: string;
  link?: string;
}

export interface Experience {
  id: string;
  title: string;
  company: string;
  start_date: string;
  end_date: string;
  current: boolean;
  description: string;
  country?: string;
}

export interface Education {
  id: string;
  school: string;
  degree: string;
  field_of_study: string;
  start_year: string;
  end_year: string;
  country?: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  issue_date: string;
  is_verified: boolean;
  credential_url?: string;
}

// ==================== GIG TYPES ====================
export interface GigPackage {
  name: string;
  description: string;
  deliveryDays: number; // camelCase
  revisions: number;
  price: number;
  features: string[];
}

export interface GigFAQ {
  id: string;
  question: string;
  answer: string;
}

export interface GigRequirement {
  id: string;
  question: string;
  type: RequirementType;
  required: boolean;
  fileTypes?: string[];
  maxFiles?: number;
}

export interface GigExtra {
  id: string;
  title: string;
  description: string;
  price: number;
  additional_days: number;
  applies_to: 'basic' | 'standard' | 'premium' | 'all';
}

export interface GigMilestone {
  title: string;
  duration: string;
  price: number;
}

export interface Gig {
  id: string;
  title: string;
  freelancerId?: string; // camelCase
  freelancerName: string; // camelCase
  freelancerAvatar: string; // camelCase
  freelancerProfilePhotoFileId?: string; // camelCase
  freelancerIsPro?: boolean;
  freelancerIsVerified?: boolean;
  freelancer_is_verified?: boolean;
  freelancerVerified?: boolean;
  freelancerTrustScore?: number;
  freelancer_trust_score?: number;
  freelancerTrustTier?: string;
  freelancer_trust_tier?: string;
  freelancerCompletedJobs?: number;
  freelancer_completed_jobs?: number;
  freelancerResponseTimeHours?: number | null;
  freelancer_response_time_hours?: number | null;
  price: number;
  rating: number;
  reviews: number;
  image: string;
  images?: string[];
  videos?: string[];
  documents?: string[];
  category: string;
  subcategory?: string;
  status: GigStatus;
  adminStatus?: 'pending' | 'approved' | 'rejected'; // camelCase
  adminReason?: string;
  isActive?: boolean; // camelCase
  isVisible?: boolean; // camelCase
  isFeatured?: boolean; // camelCase
  isTopSelected?: boolean; // camelCase
  isRecommended?: boolean; // camelCase
  description: string;
  packages: GigPackage[];
  pricingMode?: PricingMode; // camelCase
  faqs?: GigFAQ[];
  requirements?: GigRequirement[];
  extras?: GigExtra[];
  milestones?: GigMilestone[];
  createdAt?: string; // camelCase
  avgResponseTime?: string; // camelCase
  memberSince?: string; // camelCase
  languages?: string[];
  tags?: string[];
  rankingScore?: number; // camelCase
  views?: number;
  clicks?: number;
  ordersCount?: number; // camelCase
  meta?: any;
}

// ==================== CART TYPES ====================
export interface CartItem {
  id: string;
  itemType?: 'gig' | 'job';
  gigId?: string;
  jobId?: string;
  title: string;
  price: number;
  budget?: string;
  type?: string;
  image?: string;
  quantity: number;
  freelancerId?: string;
  freelancerName?: string;
  clientId?: string;
  clientName?: string;
  rating?: number;
  reviews?: number;
  addedAt?: string;
}

export interface CartSummary {
  id?: string;
  items: CartItem[];
  subtotal: number;
  totalItems: number;
  updatedAt?: string;
}

// ==================== JOB TYPES ====================
export interface Job {
  id: string;
  title: string;
  clientName: string; // camelCase
  clientId?: string; // camelCase
  clientAvatar?: string | null; // camelCase
  clientProfilePhotoFileId?: string | null; // camelCase
  clientIsPro?: boolean;
  clientIsVerified?: boolean;
  client_is_verified?: boolean;
  clientVerified?: boolean;
  budget: string;
  type: JobType;
  postedTime: string; // camelCase
  experience_level?: ExperienceLevel;
  description: string;
  tags: string[];
  proposals: number;
  status: JobStatus;
  isActive?: boolean; // camelCase
  isVisible?: boolean; // camelCase
  category: string;
  subcategory?: string;
  experienceLevel?: ExperienceLevel; // camelCase
  visibility?: Visibility;
  duration?: string;
  attachments?: string[];
  isFeatured?: boolean; // camelCase
  isTopSelected?: boolean; // camelCase
  isRecommended?: boolean; // camelCase
  adminStatus?: 'pending' | 'approved' | 'rejected'; // camelCase
  adminReason?: string;
  meta?: any;
}

// ==================== CONTRACT & TIME TRACKING ====================
export interface Contract {
  id: string;
  title: string;
  client_id?: string;
  clientId?: string;
  client_name?: string;
  clientName?: string;
  freelancer_id?: string;
  freelancerId?: string;
  freelancer_name?: string;
  freelancerName?: string;
  type: 'fixed' | 'hourly';
  hourly_rate?: number;
  hourlyRate?: number;
  contract_value?: number | null;
  contractValue?: number | null;
  payment_cycle: PaymentCycle;
  paymentCycle?: PaymentCycle;
  status: ContractStatus;
  total_hours_logged: number;
  total_paid: number;
  start_date: string;
  startDate?: string;
  description: string;
  delivery_days?: number | null;
  deliveryDays?: number | null;
  payment_schedule?: ContractPaymentSchedule | null;
  paymentSchedule?: ContractPaymentSchedule | null;
  milestones?: ContractMilestone[];
  hours_today?: number;
  hours_this_week?: number;
  earnings_pending?: number;
  active_session_id?: string;
}

export interface ContractMilestone {
  id: string;
  title: string;
  description?: string;
  amount: number;
  dueDate: string;
  order: number;
  status: 'pending' | 'submitted' | 'approved' | 'paid';
  submittedAt?: string;
  approvedAt?: string;
  paidAt?: string;
}

export interface ContractPaymentSchedule {
  model: 'fixed' | 'hourly';
  paymentCycle: PaymentCycle;
  contractValue?: number;
  hourlyRate?: number;
  weeklyHourCap?: number;
  depositPercent?: number;
  milestoneCount?: number;
  clientFeePercent?: number;
  contractorFeePercent?: number;
  allowDeposits?: boolean;
}

export interface TimeEntry {
  id: string;
  contract_id?: string;
  contractId?: string;
  freelancer_id?: string;
  freelancerId?: string;
  start_time?: string;
  startTime?: string;
  end_time?: string;
  endTime?: string;
  duration_minutes?: number;
  durationMinutes?: number;
  description: string;
  status: TimeEntryStatus;
  earnings?: number;
  screenshots?: string[];
  activity_score?: number;
}

export interface TimeTrackerSession {
  id: string;
  contract_id: string;
  freelancer_id: string;
  freelancer_name: string;
  start_time: string;
  end_time?: string;
  duration: number; // in minutes
  status: 'active' | 'paused' | 'completed' | 'disputed';
  screenshots: {
    id: string;
    timestamp: string;
    url: string;
    activity_score?: number;
    is_verified?: boolean;
  }[];
  activity_logs: {
    timestamp: string;
    type: 'mouse' | 'keyboard' | 'focus' | 'screenshot';
    details?: any;
  }[];
  earnings?: number;
  hourly_rate?: number;
}

// ==================== ORDER & ESCROW ====================
export interface Order {
  id: string;
  gig_title?: string;
  gigTitle?: string;
  client_id?: string;
  clientId?: string;
  client_name?: string;
  clientName?: string;
  freelancer_id?: string;
  freelancerId?: string;
  freelancer_name?: string;
  freelancerName?: string;
  amount: number;
  status: OrderStatus;
  escrow_status: EscrowStatus;
  date_ordered: string;
  due_date: string;
}

export interface Escrow {
  id: string;
  order_id: string;
  client_id: string;
  client_name: string;
  freelancer_id: string;
  freelancer_name: string;
  amount: number;
  commission: number;
  status: EscrowStatus;
  funded_at: string;
  released_at?: string;
}

// Permissive aliases: add index signatures to core interfaces so both
// snake_case and camelCase shapes (and extra backend fields) are accepted.
// These redeclarations merge with the above interfaces and are intentionally
// permissive to reduce type errors during the migration phase.
// Minimal permissive aliases for missing types (avoid duplicating existing declarations)
export type Category = any;
export interface ListingCategory { [key: string]: any }
export interface Recommendation { [key: string]: any }
export interface PaymentGateway { [key: string]: any }
export interface FraudAlert { [key: string]: any }
export interface FraudLog { [key: string]: any }
// NOTE: Detailed `ApiResponse` is declared lower in this file; remove this permissive duplicate
export interface Plan { [key: string]: any }
export interface AdminDashboardStats { [key: string]: any }
export interface RecommendationItem { [key: string]: any }
export interface PaymentMethod { [key: string]: any }

export interface EscrowAdvice {
  escrow_id?: string;
  recommendation?: 'Release' | 'Hold' | 'Partial Release';
  confidence?: number;
  risk_warnings?: string[];
  riskWarnings?: string[];
  milestone_progress?: number;
  milestoneProgress?: number;
  // camelCase alias
  escrowId?: string;
}

// ==================== WALLET & TRANSACTIONS ====================
export interface Wallet {
  id: string;
  user_id: string;
  available_balance: number;
  pending_clearance: number;
  escrow_balance: number;
  frozen: boolean;
  currency: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  walletId?: string;
  type: TransactionType;
  amount: number;
  status: 'cleared' | 'pending' | 'reversed' | 'failed';
  description: string;
  reference_id?: string;
  // camelCase alias
  reference?: string;
  created_at: string;
  createdAt?: string;
  admin_note?: string;
}

// ==================== GCOIN SYSTEM ====================
export interface GcoinWallet {
  user_id?: string;
  userId?: string;
  recipient_id?: string;
  recipientId?: string;
  balance?: number;
  lifetime_earned?: number;
  lifetimeEarned?: number;
  transactions?: GcoinTransaction[];
  status?: 'active' | 'frozen';
  fraud_score?: number;
  fraudScore?: number;
  updated_at?: string;
  updatedAt?: string;
  // camelCase aliases
  // (aliases above)
}

export interface GcoinTransaction {
  id: string;
  user_id?: string;
  userId?: string;
  user_name?: string;
  userName?: string;
  amount?: number;
  type: GcoinTransactionType;
  reason: string;
  reference_id?: string;
  recipient_id?: string;
  timestamp: string;
  status: 'approved' | 'pending' | 'rejected';
  source?: string;
  // camelCase aliases
  referenceId?: string;
  recipientId?: string;
  timeStamp?: string;
}

export interface GcoinSettings {
  conversion_rate: number;
  min_withdrawal?: number;
  conversion_enabled: boolean;
  auto_approve_conversions?: boolean;
  user_transfers_enabled: boolean;
  // Earning rule units
  views_unit?: number;
  likes_unit?: number;
  reposts_unit?: number;
  shares_unit?: number;
  // Coins awarded per unit
  coin_per_views_unit?: number;
  coin_per_likes_unit?: number;
  coin_per_reposts_unit?: number;
  coin_per_shares_unit?: number;
  // Admin fee percentage (0-1)
  admin_fee_percent?: number;
  // Transfer fee config
  transfer_fee_type?: 'percentage' | 'flat';
  transfer_fee_value?: number;
  // camelCase alias
  conversionRate?: number;
  minWithdrawal?: number;
  conversionEnabled?: boolean;
  autoApproveConversions?: boolean;
  userTransfersEnabled?: boolean;
  viewsUnit?: number;
  likesUnit?: number;
  repostsUnit?: number;
  sharesUnit?: number;
  coinPerViewsUnit?: number;
  coinPerLikesUnit?: number;
  coinPerRepostsUnit?: number;
  coinPerSharesUnit?: number;
  adminFeePercent?: number;
  transferFeeType?: 'percentage' | 'flat';
  transferFeeValue?: number;
}

export interface GcoinConversionRequest {
  id: string;
  user_id: string;
  user_name: string;
  amount_gcoin: number;
  amount_fiat: number;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
}

// ==================== CATEGORIES & LISTINGS ====================
export interface CategorySub {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'hidden';
  sortOrder: number; // camelCase
  icon?: string;
}

export interface ListingCategory {
  id: string;
  name: string;
  slug: string;
  type: 'gig' | 'job';
  status: 'active' | 'hidden';
  count: number;
  sortOrder: number; // camelCase
  subcategories: CategorySub[];
  description?: string;
  logo?: string;
  image?: string;
}

export interface PageCategory {
  id: string;
  name: string;
  slug: string;
  count: number;
  created_at: string;
  updated_at: string;
  status: 'active' | 'hidden';
  description?: string;
  image?: string;
}

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: 'active' | 'hidden';
  count: number;
}

export interface AuthPageBranding {
  show_logo: boolean;
  logo_url: string;
  logo_file_id?: string;
  logo_link_url: string;
}

export interface LoginPageContent {
  headline: string;
  subheadline?: string;
  email_placeholder?: string;
  password_placeholder?: string;
  submit_label: string;
  footer_text?: string;
  footer_link_label?: string;
  footer_link_url?: string;
}

export interface SignupPageContent {
  headline: string;
  subheadline?: string;
  submit_label: string;
  terms_url?: string;
  privacy_url?: string;
  footer_text?: string;
  footer_link_label?: string;
  footer_link_url?: string;
}

export type AuthProviderKey = 'google' | 'facebook' | 'twitter' | 'linkedin';

export interface SocialAuthProviderConfig {
  enabled: boolean;
  client_id?: string;
  client_secret?: string;
  redirect_uri?: string;
  scopes?: string;
  button_label?: string;
  label_logo_url?: string;
  login_enabled?: boolean;
  signup_enabled?: boolean;
  allow_roles?: UserRole[];
}

export interface SocialAuthConfig {
  enabled: boolean;
  divider_text?: string;
  login_enabled?: boolean;
  signup_enabled?: boolean;
  providers: Record<AuthProviderKey, SocialAuthProviderConfig>;
}

export interface AuthPagesConfig {
  id: string;
  branding: AuthPageBranding;
  login: LoginPageContent;
  signup: SignupPageContent;
  social_auth?: SocialAuthConfig;
  updated_at?: string;
}

export interface SystemMessageTemplateChannel {
  enabled: boolean;
  subject?: string;
  html?: string;
  text?: string;
  title?: string;
  message?: string;
}

export interface SystemMessageTemplate {
  key: string;
  label: string;
  enabled: boolean;
  email: SystemMessageTemplateChannel;
  notification: SystemMessageTemplateChannel;
  push: SystemMessageTemplateChannel;
}

export interface SystemMessagesConfig {
  id: string;
  templates: Record<string, SystemMessageTemplate>;
  updated_at?: string;
}

export type SystemMessagesVariables = Record<string, string[]>;

// ==================== CURRENCY ====================
export interface Currency {
  id?: string;
  code: string;
  name: string;
  symbol: string;
  rate: number;
  rateSource?: 'base' | 'snapshot' | 'override' | 'manual';
  snapshotId?: string | null;
  rateUpdatedAt?: string | null;
  stale?: boolean;
  is_active?: boolean;
  // camelCase aliases
  isActive?: boolean;
  isDefault?: boolean;
  is_default?: boolean;
}

export interface FxSystemConfig {
  enabled: boolean;
  providerCode: string;
  syncBaseCurrency: string;
  autoApproveSnapshots: boolean;
  refreshEnabled: boolean;
  refreshCron: string;
  staleAfterSeconds: number;
  fallbackToStoredRates: boolean;
  sourceBaseUrl: string;
  sourceProvider: string;
  timezone: string;
}

export interface FxProviderRecord {
  code: string;
  name: string;
  kind: string;
  baseUrl?: string | null;
  enabled: boolean;
  priority: number;
  settingsJson?: Record<string, any> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface FxSnapshotRecord {
  id: string;
  providerCode: string;
  baseCurrency: string;
  status: string;
  sourceTimestamp: string;
  fetchedAt: string;
  approvedAt?: string | null;
  approvedById?: string | null;
  isFrozen: boolean;
  sourceMeta?: Record<string, any> | null;
  provider?: FxProviderRecord | null;
  _count?: { rates?: number; syncJobs?: number };
}

export interface FxManualOverrideRecord {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  reason: string;
  status: string;
  createdById?: string | null;
  approvedById?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface FxLockRecord {
  id: string;
  entityType: string;
  entityId: string;
  fromCurrency: string;
  toCurrency: string;
  sourceAmount: number;
  convertedAmount: number;
  rate: number;
  baseCurrency: string;
  rateSource: string;
  snapshotId?: string | null;
  overrideId?: string | null;
  stale: boolean;
  isFrozenSnapshot: boolean;
  markupBps: number;
  metadata?: Record<string, any> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface FxHealth {
  config: FxSystemConfig;
  snapshot?: {
    id: string;
    providerCode: string;
    fetchedAt: string;
    approvedAt?: string | null;
    stale: boolean;
    isFrozen: boolean;
  } | null;
  latestSync?: any;
  providers: FxProviderRecord[];
  currencyCount: number;
  recentLocks?: FxLockRecord[];
  lockCount?: number;
}

// ==================== AFFILIATE & MARKETING ====================
export interface Affiliate {
  id: string;
  user_id?: string;
  userId?: string;
  user_name?: string;
  userName?: string;
  code: string;
  earnings: number;
  referrals: number;
  status: AffiliateStatus;
  commission_rate?: number;
  commissionRate?: number;
  availableBalance?: number;
  approvedAt?: string;
  approvedBy?: string;
  created_at?: string;
  createdAt?: string;
}

export interface AffiliateProgramSettings {
  enabled: boolean;
  firstPurchaseCommissionPercent: number;
  minimumWithdrawalAmount: number;
  autoApproveApplications: boolean;
  payoutCurrency: string;
  updatedAt?: string;
}

export interface AffiliateApplication {
  id: string;
  userId: string;
  userName?: string;
  email?: string;
  website?: string;
  promotionStrategy?: string;
  audienceSize?: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
}

export interface AffiliateReferral {
  id: string;
  affiliateUserId: string;
  affiliateCode: string;
  referredUserId: string;
  referredEmail?: string;
  status: 'linked' | 'paid';
  linkedAt: string;
  firstQualifiedOrderId?: string;
}

export interface AffiliateEarning {
  id: string;
  affiliateUserId: string;
  referredUserId: string;
  orderId: string;
  baseAmount: number;
  commissionRate: number;
  commissionAmount: number;
  currency: string;
  createdAt: string;
  withdrawalId?: string;
  withdrawnAt?: string;
}

export interface AffiliateWithdrawal {
  id: string;
  affiliateUserId: string;
  amount: number;
  currency: string;
  status: 'completed' | 'failed';
  createdAt: string;
  walletTransactionId?: string;
}

export interface AffiliateDashboardData {
  settings: AffiliateProgramSettings;
  status: 'not_applied' | 'pending' | 'approved' | 'rejected';
  application?: AffiliateApplication | null;
  partner?: Affiliate | null;
  referralLink?: string | null;
  referrals: AffiliateReferral[];
  earnings: AffiliateEarning[];
  withdrawals: AffiliateWithdrawal[];
  summary: {
    totalReferrals: number;
    totalEarnings: number;
    totalWithdrawn: number;
    availableBalance: number;
    minimumWithdrawalAmount: number;
    payoutCurrency: string;
  };
}

export interface Coupon {
  id: string;
  code: string;
  discount_type?: 'percentage' | 'fixed';
  discountType?: 'percentage' | 'fixed';
  value?: number;
  usage_limit?: number;
  usageLimit?: number;
  used_count?: number;
  usedCount?: number;
  expiry_date?: string;
  expiryDate?: string;
  is_active?: boolean;
  isActive?: boolean;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  type: 'email' | 'notification' | 'sms' | 'popup_banner' | 'inbox';
  status: 'draft' | 'scheduled' | 'active' | 'completed';
  target_audience?: 'all' | 'freelancers' | 'employers' | 'inactive';
  targetAudience?: 'all' | 'freelancers' | 'employers' | 'inactive';
  stats?: { sent: number; opened: number; clicked: number };
  created_at?: string;
  createdAt?: string;
  scheduled_at?: string;
  scheduledAt?: string;
  subject?: string;
  content?: string;
  bannerTitle?: string;
  bannerBody?: string;
  imageUrl?: string;
  ctaText?: string;
  ctaUrl?: string;
  delaySeconds?: number;
  cooldownHours?: number;
  meta?: Record<string, any>;
}

export interface MarketingPopupSubscribeConfig {
  enabled: boolean;
  title: string;
  subtitle: string;
  placeholder: string;
  buttonText: string;
  successMessage: string;
  delaySeconds?: number;
  cooldownHours?: number;
}

export interface ReferralIntelligence {
  top_referrers: { user_id: string; name: string; total_referrals: number; quality_score: number; k_factor: number }[];
  fraud_alerts: { referrer_id: string; reason: string; severity: string }[];
  campaign_suggestions: string[];
}

export interface AdCampaign {
  id: string;
  title: string;
  client_name?: string;
  clientName?: string;
  creative_url?: string;
  creativeUrl?: string;
  target_url?: string;
  targetUrl?: string;
  placement: AdPlacement;
  target_roles?: UserRole[];
  impressions?: number;
  clicks?: number;
  ctr?: number;
  start_date?: string;
  end_date?: string;
  status?: 'active' | 'paused' | 'draft' | 'completed' | string;
  objective?: 'traffic' | 'messages';
  destinationType?: 'url' | 'messages';
  destinationUrl?: string | null;
  ctaText?: string | null;
  placements?: string[];
  mediaFileIds?: string[];
  media?: { id?: string; url?: string; name?: string; mimeType?: string }[];
  budget?: number;
  pendingBudget?: number;
  remainingBudget?: number;
  currency?: string;
  durationDays?: number;
  cpm?: number;
  cpc?: number;
  pricingModel?: 'CPM' | 'CPC';
  computeOption?: 'CPM' | 'CPC';
  targetCountries?: string[];
  targetAudience?: 'users' | 'businesses' | 'all';
  dailySpend?: number | null;
  targeting?: Record<string, any> | null;
  estimatedImpressions?: number;
  estimatedClicks?: number;
  body?: string;
  creatorId?: string;
  likes?: number;
  messagesStarted?: number;
  adminReviewNotes?: string | null;
  delivery?: {
    isServing: boolean;
    summary: string;
    status?: string;
    placements?: string[];
    eligiblePlacements?: string[];
    placementChecks?: Array<{ placement: string; eligible: boolean; blockers?: string[] }>;
    blockers?: string[];
    warnings?: string[];
    remainingBudget?: number;
    mediaAssetCount?: number;
    hasSettledPayment?: boolean;
    hasVideoCreative?: boolean;
    scrollPolicy?: Record<string, any>;
    checkedAt?: string;
  };
  createdAt?: string;
  startAt?: string;
  endAt?: string;
}

export interface ScrollAdsRuntimePolicy {
  enabled: boolean;
  fallbackToCommunityFeed: boolean;
  videoSkipDelaySeconds: number;
  staticSkipDelaySeconds: number;
  firstAdAfterScrolls: number;
  repeatEveryScrolls: number;
  minSecondsBetweenAds: number;
  maxAdsPerSession: number;
  maxAdsPerViewerDay: number;
  perAdCooldownMinutes: number;
  placementPacing: {
    scroll_preroll: number;
    scroll_feed: number;
  };
}

export interface AdsRuntimeConfig {
  allowedPlacements?: string[];
  scrollAds: ScrollAdsRuntimePolicy;
}

// Additional exported convenience types expected by frontend
export type StepsContent = any;
export type TestimonialsContent = any;


// ==================== MESSAGING ====================
export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  participants: ({
    id: string;
    name: string;
    avatar: string;
    username?: string;
    gender?: string;
    profile_url?: string;
    profileUrl?: string;
    label?: string;
    is_starred?: boolean;
    isStarred?: boolean;
    is_muted?: boolean;
    isMuted?: boolean;
    is_archived?: boolean;
    isArchived?: boolean;
    is_online?: boolean;
    isOnline?: boolean;
    last_seen_at?: string;
    lastSeenAt?: string;
    role?: string;
  })[];
  last_message?: string;
  lastMessage?: string;
  last_message_at?: string;
  lastMessageAt?: string;
  unread_count?: number;
  unreadCount?: number;
  label?: string;
  is_starred?: boolean;
  isStarred?: boolean;
  is_muted?: boolean;
  isMuted?: boolean;
  is_archived?: boolean;
  isArchived?: boolean;
  messages: Message[];
  // allow other shapes from backend or camelCase/cross-formed payloads
  [key: string]: any;
}

export interface MessageReaction {
  user_id: string;
  userId?: string;
  emoji: string;
  timestamp: string;
}

export interface MessageReplyPreview {
  messageId?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  snippet?: string;
  attachmentPreview?: { type?: string; label?: string } | null;
  unavailable?: boolean;
}

export interface VoiceNotePayload {
  id?: string | null;
  fileId?: string | null;
  durationMs: number;
  url?: string | null;
}

export interface VoiceCallParticipant {
  id?: string;
  userId: string;
  status?: 'invited' | 'joined' | 'left' | 'rejected' | 'missed' | string;
  invitedAt?: string;
  joinedAt?: string | null;
  leftAt?: string | null;
  user?: {
    id: string;
    name?: string;
    avatar?: string;
    username?: string;
  };
}

export interface VoiceCall {
  id: string;
  conversationId: string;
  initiatorId: string;
  status:
    | 'initiated'
    | 'ringing'
    | 'active'
    | 'ended'
    | 'rejected'
    | 'missed'
    | 'cancelled'
    | 'failed'
    | string;
  callType?: 'direct' | 'conference' | string;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt?: string;
  participants?: VoiceCallParticipant[];
  [key: string]: any;
}

export interface MessengerVoiceConfig {
  enabledVoiceCalls: boolean;
  enabledConferenceCalls: boolean;
  enabledVoiceNotes: boolean;
  maxParticipants: number;
  maxVoiceNoteDurationSeconds: number;
  blockedUserIds: string[];
  [key: string]: any;
}

export interface Message {
  id: string;
  conversation_id?: string;
  conversationId?: string;
  sender_id?: string;
  senderId?: string;
  sender_role?: string;
  senderRole?: string;
  receiver_id?: string;
  receiverId?: string;
  text: string;
  timestamp: string;
  sentAt?: string;
  is_read?: boolean;
  isRead?: boolean;
  message_type?: 'text' | 'file' | 'voice_note' | 'system' | string;
  messageType?: 'text' | 'file' | 'voice_note' | 'system' | string;
  metadata?: Record<string, any> | null;
  voice_note?: VoiceNotePayload | null;
  voiceNote?: VoiceNotePayload | null;
  reactions?: MessageReaction[];
  ai_flagged?: boolean;
  aiFlagged?: boolean;
  ai_reason?: string;
  aiReason?: string;
  attachments?: Attachment[] | string[];
  attachment_ids?: string[];
  reply_to_message_id?: string | null;
  replyToMessageId?: string | null;
  reply_to_snapshot?: any;
  replyToSnapshot?: any;
  reply_to?: MessageReplyPreview | null;
  replyTo?: MessageReplyPreview | null;
  // allow extra properties from backend variations
  [key: string]: any;
}

// ==================== KYC VERIFICATION ====================
export interface KYCDocument {
  id: string;
  user_id?: string;
  userId?: string;
  user_name?: string;
  userName?: string;
  full_name?: string;
  fullName?: string;
  address?: string;
  mobile?: string;
  dob?: string;
  nationality?: string;
  type?: KYCDocumentType;
  status?: KYCDocumentStatus;
  date_submitted?: string;
  dateSubmitted?: string;
  front_image?: string;
  frontImage?: string;
  back_image?: string;
  backImage?: string;
  admin_notes?: string;
  adminNotes?: string;
}

// ==================== PLATFORM SETTINGS ====================
export interface RecaptchaSettings {
  enabled: boolean;
  siteKey: string;
  scoreThreshold?: number;
  version?: 'v2' | 'v3';
}

export interface AnalyticsSettings {
  googleEnabled: boolean;
  googleAnalyticsId: string;
  facebookEnabled: boolean;
  facebookPixelId: string;
}

export interface GoogleMapSettings {
  enabled: boolean;
  apiKey: string;
  defaultLat?: number;
  defaultLng?: number;
  defaultZoom?: number;
}

export interface FirebaseSettings {
  enabled: boolean;
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export interface FacebookCommentsSettings {
  enabled: boolean;
  appId: string;
}

export interface PlatformIntegrationsSettings {
  recaptcha?: RecaptchaSettings;
  analytics?: AnalyticsSettings;
  googleMap?: GoogleMapSettings;
  firebase?: FirebaseSettings;
  facebookComments?: FacebookCommentsSettings;
  sitemap?: {
    lastGeneratedAt?: string;
  };
}

export interface SystemIntegrationsSettings {
  recaptchaSecretKey?: string;
}

export interface ResumeAiSettings {
  enabled?: boolean;
  builderEnabled?: boolean;
  reviewerEnabled?: boolean;
  adminAccessEnabled?: boolean;
  resume_enabled?: boolean;
  builder_enabled?: boolean;
  reviewer_enabled?: boolean;
  admin_access_enabled?: boolean;
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
  integrations?: PlatformIntegrationsSettings;

  // CamelCase aliases (backend may return snake_case or camelCase)
  siteName?: string;
  siteTagline?: string;
  site_tagline?: string;
  logoUrl?: string;
  faviconUrl?: string;
  adminEmail?: string;
  supportEmail?: string;
  proFreelancerLabelUrl?: string;
  proFreelancerLabelFileId?: string;
  proEmployerLabelUrl?: string;
  proEmployerLabelFileId?: string;
  footerAboutTitle?: string;
  footerAboutText?: string;
  footerCopyright?: string;
  footerLinks?: any[];
  socialLinks?: any[];

  // Allow additional backend variations
  [key: string]: any;

  // Feature flags
  features?: {
    community_enabled: boolean;
    blog_enabled: boolean;
    affiliate_enabled: boolean;
    gcoin_enabled: boolean;
    time_tracker_enabled: boolean;
    ai_enabled: boolean;
    kyc_enabled: boolean;
  };

  // Platform limits
  limits?: {
    max_file_size: number;
    max_gigs_per_user: number;
    max_jobs_per_user: number;
    max_portfolio_items: number;
  };
}

export interface VerificationPolicySettings {
  enabled?: boolean;
  showTooltips?: boolean;
  levels?: {
    standard?: boolean;
    pro?: boolean;
    business?: boolean;
    government?: boolean;
  };
  roles?: {
    guest?: boolean;
    user?: boolean;
    freelancer?: boolean;
    employer?: boolean;
    business?: boolean;
    admin?: boolean;
  };
}

export interface TrustScorePolicySettings {
  enabled?: boolean;
  showOnProfiles?: boolean;
  show_on_profiles?: boolean;
  showOnListings?: boolean;
  show_on_listings?: boolean;
  showRiskIndicators?: boolean;
  show_risk_indicators?: boolean;
  weights?: {
    completionRate?: number;
    completion_rate?: number;
    responseRate?: number;
    response_rate?: number;
    responseTime?: number;
    response_time?: number;
    reviewRating?: number;
    review_rating?: number;
    reviewVolume?: number;
    review_volume?: number;
    disputeRate?: number;
    dispute_rate?: number;
    cancellationRate?: number;
    cancellation_rate?: number;
  };
  thresholds?: {
    elite?: number;
    established?: number;
  };
}

export interface DealFlowTemplate {
  id: string;
  label: string;
  category: string;
  summary?: string;
}

export interface DealFlowContractTemplate {
  id: string;
  label: string;
  contractType: 'FIXED' | 'HOURLY' | string;
  contract_type?: 'FIXED' | 'HOURLY' | string;
  paymentCycle?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | string;
  payment_cycle?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | string;
  milestoneCount?: number;
  milestone_count?: number;
  summary?: string;
}

export interface DealFlowSettings {
  enabled?: boolean;
  allowCreateBriefFromChat?: boolean;
  allow_create_brief_from_chat?: boolean;
  allowBriefToProposal?: boolean;
  allow_brief_to_proposal?: boolean;
  autoCreatePrivateJobs?: boolean;
  auto_create_private_jobs?: boolean;
  defaultCategory?: string;
  default_category?: string;
  allowedCategories?: string[];
  allowed_categories?: string[];
  templates?: DealFlowTemplate[];
  timeline?: {
    briefs?: boolean;
    proposals?: boolean;
    contracts?: boolean;
  };
  proposalDefaults?: {
    timelineDays?: number;
    timeline_days?: number;
    paymentCycle?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | string;
    payment_cycle?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | string;
    coverLetterIntro?: string;
    cover_letter_intro?: string;
  };
  proposal_defaults?: {
    timelineDays?: number;
    timeline_days?: number;
    paymentCycle?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | string;
    payment_cycle?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | string;
    coverLetterIntro?: string;
    cover_letter_intro?: string;
  };
  contractTemplates?: DealFlowContractTemplate[];
  contract_templates?: DealFlowContractTemplate[];
  contractDefaults?: {
    startLeadDays?: number;
    start_lead_days?: number;
    fixedMilestoneCount?: number;
    fixed_milestone_count?: number;
    hourlyWeeklyCap?: number;
    hourly_weekly_cap?: number;
    upfrontPercent?: number;
    upfront_percent?: number;
  };
  contract_defaults?: {
    startLeadDays?: number;
    start_lead_days?: number;
    fixedMilestoneCount?: number;
    fixed_milestone_count?: number;
    hourlyWeeklyCap?: number;
    hourly_weekly_cap?: number;
    upfrontPercent?: number;
    upfront_percent?: number;
  };
  contractRules?: {
    allowFixedContracts?: boolean;
    allow_fixed_contracts?: boolean;
    allowHourlyContracts?: boolean;
    allow_hourly_contracts?: boolean;
    requireMilestonesForFixed?: boolean;
    require_milestones_for_fixed?: boolean;
    maxMilestones?: number;
    max_milestones?: number;
  };
  contract_rules?: {
    allowFixedContracts?: boolean;
    allow_fixed_contracts?: boolean;
    allowHourlyContracts?: boolean;
    allow_hourly_contracts?: boolean;
    requireMilestonesForFixed?: boolean;
    require_milestones_for_fixed?: boolean;
    maxMilestones?: number;
    max_milestones?: number;
  };
  feePolicy?: {
    clientFeePercent?: number;
    client_fee_percent?: number;
    contractorFeePercent?: number;
    contractor_fee_percent?: number;
    allowDeposits?: boolean;
    allow_deposits?: boolean;
  };
  fee_policy?: {
    clientFeePercent?: number;
    client_fee_percent?: number;
    contractorFeePercent?: number;
    contractor_fee_percent?: number;
    allowDeposits?: boolean;
    allow_deposits?: boolean;
  };
}

export interface StorefrontSettings {
  enabled?: boolean;
  userProfilesEnabled?: boolean;
  user_profiles_enabled?: boolean;
  businessPagesEnabled?: boolean;
  business_pages_enabled?: boolean;
  roles?: {
    user?: boolean;
    freelancer?: boolean;
    employer?: boolean;
    business?: boolean;
    admin?: boolean;
  };
  modules?: {
    merchantSummary?: boolean;
    merchant_summary?: boolean;
    userGigs?: boolean;
    user_gigs?: boolean;
    businessPackages?: boolean;
    business_packages?: boolean;
  };
  maxFeaturedItems?: number;
  max_featured_items?: number;
  maxCatalogItems?: number;
  max_catalog_items?: number;
}

export interface ContentOfferSettings {
  enabled?: boolean;
  postsEnabled?: boolean;
  posts_enabled?: boolean;
  scrollEnabled?: boolean;
  scroll_enabled?: boolean;
  liveEnabled?: boolean;
  live_enabled?: boolean;
  roles?: {
    user?: boolean;
    freelancer?: boolean;
    employer?: boolean;
    business?: boolean;
    admin?: boolean;
  };
  modules?: {
    userGigs?: boolean;
    user_gigs?: boolean;
    businessPackages?: boolean;
    business_packages?: boolean;
    storefrontCta?: boolean;
    storefront_cta?: boolean;
    messageCta?: boolean;
    message_cta?: boolean;
    briefCta?: boolean;
    brief_cta?: boolean;
  };
  maxTagsPerContent?: number;
  max_tags_per_content?: number;
  moderationMode?: 'off' | 'review' | 'strict' | string;
  moderation_mode?: 'off' | 'review' | 'strict' | string;
  restrictedCategories?: string[];
  restricted_categories?: string[];
}

export interface ContentOfferTag {
  id: string;
  offerType: 'user_gig' | 'business_package' | string;
  offerId: string;
  ownerType?: 'user' | 'business' | string;
  ownerId?: string;
  ownerUserId?: string | null;
  owner_user_id?: string | null;
  pageId?: string | null;
  page_id?: string | null;
  pageSlug?: string | null;
  page_slug?: string | null;
  ownerName?: string | null;
  owner_name?: string | null;
  profileUsername?: string | null;
  profile_username?: string | null;
  title?: string | null;
  summary?: string | null;
  price?: number | null;
  currency?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  storefrontUrl?: string | null;
  storefront_url?: string | null;
  messageUserId?: string | null;
  message_user_id?: string | null;
  ctas?: {
    storefront?: boolean;
    message?: boolean;
    brief?: boolean;
  };
}

export interface StorefrontMerchantSummary {
  title?: string;
  subtitle?: string;
  location?: string | null;
  category?: string | null;
  currency?: string | null;
  priceFrom?: number | null;
  price_from?: number | null;
  serviceCount?: number;
  service_count?: number;
  featuredCount?: number;
  featured_count?: number;
  rating?: number;
  completedJobs?: number;
  completed_jobs?: number;
  responseRate?: number;
  response_rate?: number;
  responseTimeHours?: number | null;
  response_time_hours?: number | null;
  trustScore?: number | null;
  trust_score?: number | null;
  trustTier?: string | null;
  trust_tier?: string | null;
  followerCount?: number;
  follower_count?: number;
  postCount?: number;
  post_count?: number;
}

export interface PlatformSettingsExtended extends PlatformSettings {
  // Community feature flags
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
  resumeAi?: ResumeAiSettings;
  resume_ai?: ResumeAiSettings;
  verification?: VerificationPolicySettings;
  trustScore?: TrustScorePolicySettings;
  trust_score?: TrustScorePolicySettings;
  dealFlow?: DealFlowSettings;
  deal_flow?: DealFlowSettings;
  storefront?: StorefrontSettings;
  storefront_settings?: StorefrontSettings;
  contentOffers?: ContentOfferSettings;
  content_offers?: ContentOfferSettings;
  integrations?: SystemIntegrationsSettings;
  currency?: {
    auto_exchange_rate: boolean;
    base_currency: string;
    provider: string;
    api_key?: string;
  };
  fx?: FxSystemConfig;
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
  // Backward-compatible wrapper used by some UI modules
  system?: any;
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

// ==================== CMS & CONTENT ====================
export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  content: string;
  settings?: any;
}

export interface AnswersCategory {
  id: string;
  label: string;
  description?: string;
}

export interface FeaturedQuestion {
  id: string;
  question: string;
  tags?: string[];
}

export interface AnswersPageConfig {
  hero: {
    title: string;
    subtitle: string;
    primaryCtaLabel?: string;
    primaryCtaUrl?: string;
    backgroundImage?: string;
    badgeLabel?: string;
  };
  ai: {
    enabled: boolean;
    allowGuest: boolean;
    disclaimer?: string;
  };
  categories: AnswersCategory[];
  featuredQuestions: FeaturedQuestion[];
  faq: { id: string; question: string; answer: string }[];
  updated_at?: string;
}

export interface GuideTopic {
  id: string;
  label: string;
  description?: string;
}

export interface FeaturedGuide {
  id: string;
  title: string;
  excerpt: string;
  category?: string;
  readTime?: string;
  coverImage?: string;
}

export interface GuidesPageConfig {
  hero: {
    title: string;
    subtitle: string;
    primaryCtaLabel?: string;
    primaryCtaUrl?: string;
    backgroundImage?: string;
    badgeLabel?: string;
  };
  ai: {
    enabled: boolean;
    allowGuest: boolean;
    disclaimer?: string;
  };
  topics: GuideTopic[];
  featuredGuides: FeaturedGuide[];
  callToAction?: {
    title?: string;
    subtitle?: string;
    ctaLabel?: string;
    ctaUrl?: string;
  };
  updated_at?: string;
}

export interface HireHighlight {
  id: string;
  title: string;
  description?: string;
}

export interface HireStep {
  id: string;
  title: string;
  description?: string;
}

export interface HireTestimonial {
  id: string;
  name: string;
  role?: string;
  quote: string;
}

export interface HirePageConfig {
  hero: {
    title: string;
    subtitle: string;
    primaryCtaLabel?: string;
    primaryCtaUrl?: string;
    secondaryCtaLabel?: string;
    secondaryCtaUrl?: string;
    backgroundImage?: string;
    badgeLabel?: string;
  };
  ai: {
    enabled: boolean;
    allowGuest: boolean;
    disclaimer?: string;
  };
  highlights: HireHighlight[];
  steps: HireStep[];
  testimonials: HireTestimonial[];
  updated_at?: string;
}

export interface FreelancerService {
  id: string;
  title: string;
  description?: string;
}

export interface FreelancerProof {
  id: string;
  metric: string;
  label: string;
}

export interface FreelancerPageConfig {
  hero: {
    title: string;
    subtitle: string;
    primaryCtaLabel?: string;
    primaryCtaUrl?: string;
    secondaryCtaLabel?: string;
    secondaryCtaUrl?: string;
    backgroundImage?: string;
    badgeLabel?: string;
  };
  ai: {
    enabled: boolean;
    allowGuest: boolean;
    disclaimer?: string;
  };
  services: FreelancerService[];
  proof: FreelancerProof[];
  callToAction?: {
    title?: string;
    subtitle?: string;
    ctaLabel?: string;
    ctaUrl?: string;
  };
  updated_at?: string;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  blocks: ContentBlock[];
  excerpt: string;
  short_description?: string;
  shortDescription?: string;
  featured_image: string;
  // camelCase aliases (compat)
  featuredImage?: string;
  categoryId?: string;
  categoryName?: string;
  allowComments?: boolean;
  isFeatured?: boolean;
  status: BlogPostStatus;
  visibility: Visibility;
  author_name: string;
  category_id: string;
  category_name: string;
  tags: string[];
  views: number;
  seo: ({ meta_title: string; meta_description: string; meta_keywords?: string[]; no_index?: boolean } & {
    metaTitle?: string;
    metaDescription?: string;
    metaKeywords?: string[];
    noIndex?: boolean;
  });
  allow_comments: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  // camelCase compatibility
  authorName?: string;
  updatedAt?: string;
  scheduled_at?: string;
  scheduledAt?: string;
}

export interface StaticPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  blocks: ContentBlock[];
  status: PageStatus;
  visibility: Visibility;
  updated_at: string;
  category_id: string;
  seo?: { meta_title: string; meta_description: string; meta_keywords?: string[] };
  images?: string[];
  videos?: string[];
}

export interface BlogSettings {
  page_title: string;
  meta_title: string;
  meta_description: string;
  banner_image: string;
  posts_per_page: number;
  default_category: string;
  show_author: boolean;
  show_date: boolean;
}

// ==================== HOMEPAGE CONTENT ====================
export interface LandingContent {
  hero: HeroContent;
  stats: { value: string; label: string }[];
  how_it_works: HowItWorksContent;
  why_choose: any;
  testimonials: any[];
  cta: CTAContent;
}

export interface HeroContent {
  headline: string;
  subheadline: string;
  primary_cta_text: string;
  primary_cta_link: string;
  secondary_cta_text: string;
  secondary_cta_link: string;
  background_image: string;
  show_trust_badges?: boolean;
  search_placeholder?: string;
  trusted_brands?: {
    enabled: boolean;
    title?: string;
    logos?: { id: string; src: string; alt?: string }[];
  };
  quick_tags?: { id: string; label: string; url: string }[];
}

export interface HowItWorksContent {
  show_video: boolean;
  employer_steps: { icon: string; title: string; description: string }[];
  freelancer_steps: { icon: string; title: string; description: string }[];
}

// camelCase aliases
export interface HowItWorksContent {
  showVideo?: boolean;
  employerSteps?: { icon: string; title: string; description: string }[];
  freelancerSteps?: { icon: string; title: string; description: string }[];
}

export interface CTAContent {
  headline: string;
  subheadline: string;
  button_text: string;
  button_link: string;
}

// camelCase aliases
export interface CTAContent {
  buttonText?: string;
  buttonLink?: string;
}

export interface TrustContent {
  stats: { value: string; label: string }[];
}

export interface CategoriesContent {
  show_icons: boolean;
  view_more_link: string;
}

// camelCase aliases
export interface CategoriesContent {
  showIcons?: boolean;
  viewMoreLink?: string;
}

export interface FeaturedContent {
  source: 'gigs' | 'jobs';
  count: number;
  layout?: 'grid' | 'carousel';
  auto_rotate?: boolean;
}

export interface SkillMatchingContent {
  // Add specific fields if needed
}

export interface TrendingOppsContent {
  title?: string;
}

export interface GrowthDashContent {
  tips?: string[];
}

export interface GigCreationContent {
  badgeLabel?: string;
  badge_label?: string;
  headline?: string;
  subheadline?: string;
  button_text?: string;
  buttonText?: string;
  guest_button_text?: string;
  guestButtonText?: string;
  helper_text?: string;
  helperText?: string;
  guest_helper_text?: string;
  guestHelperText?: string;
  login_button_text?: string;
  loginButtonText?: string;
  register_button_text?: string;
  registerButtonText?: string;
}

export interface MarketInsightsContent {
  title?: string;
  regions?: string[];
}

export interface ProjectBriefContent {
  badgeLabel?: string;
  badge_label?: string;
  title?: string;
  subtitle?: string;
  input_placeholder?: string;
  inputPlaceholder?: string;
  button_text?: string;
  buttonText?: string;
  guest_button_text?: string;
  guestButtonText?: string;
  helper_text?: string;
  helperText?: string;
  guest_helper_text?: string;
  guestHelperText?: string;
  login_button_text?: string;
  loginButtonText?: string;
  register_button_text?: string;
  registerButtonText?: string;
}

export interface ProjectBrief {
  id: string;
  user_id: string;
  userId?: string;
  prompt: string;
  title: string;
  category: string;
  budget_range: string;
  budgetRange?: string;
  timeline: string;
  description: string;
  required_skills: string[];
  requiredSkills?: string[];
  screening_questions: string[];
  screeningQuestions?: string[];
  created_at: string;
  updated_at: string;
  conversation_id?: string;
  conversationId?: string;
  template_id?: string;
  templateId?: string;
  participant_summary?: Array<{ id: string; name?: string; role?: string }>;
  participantSummary?: Array<{ id: string; name?: string; role?: string }>;
  source_messages?: Array<{
    id: string;
    sender_id?: string;
    sender_name?: string;
    snippet: string;
    timestamp: string;
  }>;
  sourceMessages?: Array<{
    id: string;
    sender_id?: string;
    sender_name?: string;
    snippet: string;
    timestamp: string;
  }>;
  linked_job_id?: string | null;
  linkedJobId?: string | null;
  linked_proposals?: Array<{
    proposal_id: string;
    freelancer_id?: string;
    freelancer_name?: string;
    status?: string;
    proposed_amount?: number;
    proposed_timeline?: number;
    created_at: string;
    updated_at: string;
  }>;
  linkedProposals?: Array<{
    proposal_id: string;
    freelancer_id?: string;
    freelancer_name?: string;
    status?: string;
    proposed_amount?: number;
    proposed_timeline?: number;
    created_at: string;
    updated_at: string;
  }>;
  linked_contract?: {
    contract_id: string;
    status?: string;
    payment_cycle?: string;
    start_date?: string | null;
    title?: string;
    created_at: string;
  } | null;
  linkedContract?: {
    contract_id: string;
    status?: string;
    payment_cycle?: string;
    start_date?: string | null;
    title?: string;
    created_at: string;
  } | null;
  history?: Array<{
    id: string;
    type: string;
    actor_user_id?: string;
    proposal_id?: string;
    contract_id?: string;
    timestamp: string;
    summary?: string;
    metadata?: Record<string, any> | null;
  }>;
}

export interface TopProServicesContent {
  title?: string;
  count?: number;
}

export interface TrustSecurityContent {
  title?: string;
  features?: { icon: string; title: string; description: string }[];
}

export interface PopularServicesContent {
  title?: string;
  subtitle?: string;
  items?: {
    id?: string;
    title?: string;
    subtitle?: string;
    image?: string;
    url?: string;
    badge?: string;
    meta?: string;
    price?: string;
    rating?: string;
  }[];
}

export interface PromoBannersContent {
  title?: string;
  items?: {
    id?: string;
    heading?: string;
    body?: string;
    ctaLabel?: string;
    ctaUrl?: string;
    image?: string;
    background?: string;
    textColor?: string;
    imagePosition?: 'left' | 'right';
  }[];
}

export interface TrustValueContent {
  title?: string;
  subtitle?: string;
  items?: { id?: string; title?: string; description?: string; icon?: string }[];
}

export interface VideoFeatureContent {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  videoUrl?: string;
  poster?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface MarketplaceTilesContent {
  title?: string;
  subtitle?: string;
  items?: {
    id?: string;
    title?: string;
    subtitle?: string;
    icon?: string;
    image?: string;
    url?: string;
    badge?: string;
    background?: string;
    textColor?: string;
  }[];
}

export interface GuidesGridContent {
  title?: string;
  subtitle?: string;
  items?: {
    id?: string;
    title?: string;
    excerpt?: string;
    image?: string;
    url?: string;
    category?: string;
  }[];
}

export interface MadeOnScrolithContent {
  title?: string;
  subtitle?: string;
  items?: { id?: string; title?: string; image?: string; url?: string }[];
}

export interface FooterCtaStripContent {
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string;
  background?: string;
  textColor?: string;
}

export interface GuestHeroScrolithaEmbedContent {
  enabled?: boolean;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  primaryPrompt?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  secondaryUrl?: string;
  promptChips?: string[];
}

export interface GuestHeroAuthPopupContent {
  enabled?: boolean;
  delaySeconds?: number;
  headline?: string;
  subheadline?: string;
  defaultTab?: 'login' | 'signup' | string;
  dismissLabel?: string;
  trustNote?: string;
}

export interface GuestHeroAuthContent {
  headline?: string;
  subheadline?: string;
  description?: string;
  primaryCtaLabel?: string;
  primaryCtaUrl?: string;
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string;
  heroBackgroundUrl?: string;
  authPanelTitle?: string;
  authPanelSubtitle?: string;
  defaultTab?: 'login' | 'signup' | string;
  enableSocialLogin?: boolean;
  loginCtaLabel?: string;
  signupCtaLabel?: string;
  compactMode?: boolean;
  maxSections?: number;
  sideImageUrl?: string;
  sideImageAlt?: string;
  sideBanners?: {
    id?: string;
    title?: string;
    subtitle?: string;
    image?: string;
    icon?: string;
    url?: string;
  }[];
  trustPoints?: string[];
  brandLogos?: {
    id?: string;
    label?: string;
    image?: string;
    url?: string;
  }[];
  scrolitha?: GuestHeroScrolithaEmbedContent;
  authPopup?: GuestHeroAuthPopupContent;
}

export interface GuestWhatIsScrolithContent {
  title?: string;
  subtitle?: string;
  compactMode?: boolean;
  maxCards?: number;
  cards?: { id?: string; title?: string; description?: string; icon?: string; image?: string }[];
}

export interface GuestPathsContent {
  title?: string;
  subtitle?: string;
  freelancerTitle?: string;
  freelancerBullets?: string[];
  freelancerCtaLabel?: string;
  freelancerCtaUrl?: string;
  employerTitle?: string;
  employerBullets?: string[];
  employerCtaLabel?: string;
  employerCtaUrl?: string;
}

export interface GuestFeatureShowcaseContent {
  title?: string;
  subtitle?: string;
  compactMode?: boolean;
  maxTabs?: number;
  tabs?: {
    id?: string;
    label?: string;
    title?: string;
    description?: string;
    image?: string;
  }[];
}

export interface GuestTrendingPreviewContent {
  title?: string;
  subtitle?: string;
  compactMode?: boolean;
  showEmptyState?: boolean;
  maxItems?: number;
  jobsTitle?: string;
  gigsTitle?: string;
  postsTitle?: string;
  jobs?: { id: string; title?: string; type?: string; budget?: string; postedTime?: string }[];
  gigs?: { id: string; title?: string; slug?: string; price?: number; rating?: number; image?: string }[];
  posts?: {
    id: string;
    title?: string;
    content?: string;
    likesCount?: number;
    commentsCount?: number;
    author?: { id?: string; name?: string; username?: string; avatar?: string };
  }[];
}

export interface GuestCommunityPreviewContent {
  title?: string;
  subtitle?: string;
  compactMode?: boolean;
  showEmptyState?: boolean;
  maxItems?: number;
  ctaLabel?: string;
  ctaUrl?: string;
  posts?: GuestTrendingPreviewContent['posts'];
}

export interface GuestFinalCtaContent {
  title?: string;
  subtitle?: string;
  primaryCtaLabel?: string;
  primaryCtaUrl?: string;
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string;
}

export interface HomepageSection {
  id: string;
  type: HomepageSectionType;
  name: string;
  isActive: boolean; // camelCase
  position: number;
  content: any;
  style?: any;
  startAt?: string; // camelCase
  endAt?: string; // camelCase
  targeting?: { roles: UserRole[] };
  abTestId?: string; // camelCase
}

export interface ABTest {
  id: string;
  name: string;
  section_id: string;
  variants: any[];
  traffic_split: number;
  status: 'running' | 'paused' | 'completed';
  metrics: { views: number; conversions: number };
  created_at: string;
}

export interface HomepageTemplate {
  id: string;
  name: string;
  type: HomepageSectionType;
  content: any;
  style: any;
}

export interface HomepageVersion {
  id: string;
  created_at: string;
  created_by: string;
  snapshot: HomepageSection[];
  description: string;
  meta?: any;
}

export interface HomepageAnalytics {
  views: number;
  cta_clicks: number;
  bounce_rate: number;
  avg_time_on_page: number;
  device_breakdown: { desktop: number; mobile: number; tablet: number };
  section_engagement: { name: string; clicks: number; views: number }[];
}

// ==================== HEADER & NAVIGATION ====================
export interface HeaderConfig {
  id: string;
  home_url: string;
  variant: 'light' | 'dark';
  search_enabled: boolean;
  search_mode: 'keyword' | 'semantic';
  logo_url: string;
  logo_file_id?: string;
  favicon_url: string;
  favicon_file_id?: string;
  navigation: NavItem[];
  actions: { notifications: boolean; messages: boolean; orders: boolean; lists: boolean; switch_selling: boolean; profile: boolean };
  profile_menu: NavItem[];
  profile_menu_group_labels?: { primary?: string; business_tools?: string; utilities?: string };
  guest_primary_dropdown?: NavDropdown;
  guest_explore_dropdown?: NavDropdown;
  guest_ctas?: NavItem[];
  role_switch?: RoleSwitchConfig;
  guestPrimaryDropdown?: NavDropdown;
  guestExploreDropdown?: NavDropdown;
  guestCtas?: NavItem[];
  roleSwitch?: RoleSwitchConfig;
}

export interface NavItem {
  id: string;
  label: string;
  url: string;
  visibility: UserRole[];
  icon?: string;
  group?: 'primary' | 'business_tools' | 'utilities' | string;
  type?: 'link' | 'currency_switcher' | 'sign_out';
  description?: string;
}

export interface NavDropdown {
  id: string;
  label: string;
  items: NavItem[];
  visibility?: UserRole[];
  description?: string;
}

export interface RoleSwitchConfig {
  buyer_label: string;
  buyer_url: string;
  seller_label: string;
  seller_url: string;
  visibility?: UserRole[];
}

export interface FooterConfig {
  id: string;
  description: string;
  copyright: string;
  columns: { id: string; title: string; links: { id: string; label: string; url: string; visibility: UserRole[]; type: 'internal' | 'external' }[] }[];
  contact: { admin_email: string; support_email: string; ticket_route: string };
  socials: { id: string; platform: string; url: string; enabled: boolean; icon?: string }[];
  logo_url?: string;
  social_label_title?: string;
  socialLabelTitle?: string;
}

export interface HomeSlide {
  id: string;
  mediaType: 'image' | 'video'; // camelCase
  mediaUrl: string; // camelCase
  title?: string;
  subtitle?: string;
  redirectUrl?: string; // camelCase
  roleVisibility: UserRole[]; // camelCase
  sortOrder: number; // camelCase
  isActive: boolean; // camelCase
  createdAt: string; // camelCase
  updatedAt: string; // camelCase
  backgroundColor?: string; // camelCase
  fileId?: string; // camelCase
}

export interface TrendingConfig {
  id: string;
  enabled: boolean;
  title: string;
  category_ids: string[];
  scroll_behavior: 'manual' | 'auto';
  auto_slide_interval: number;
  visibility: UserRole[];
}

export interface AffiliatePageContent {
  // Support both snake_case and camelCase shapes returned by different services
  hero_title?: string;
  hero_subtitle?: string;
  hero_button_text?: string;

  heroTitle?: string;
  heroSubtitle?: string;
  heroButtonText?: string;

  benefits?: { title: string; description: string; icon?: string }[];
}

export interface ActivityConfig {
  icons: NavIconConfig[];
  help_menu: HelpLink[];
  helpMenu?: HelpLink[];
  design: {
    icon_style?: 'outline' | 'filled';
    icon_size?: number;
    badge_color?: string;
    show_badges?: boolean;
    // camelCase aliases
    iconStyle?: 'outline' | 'filled';
    iconSize?: number;
    badgeColor?: string;
    showBadges?: boolean;
  };
}

export interface NavIconConfig {
  id: string;
  type: 'notifications' | 'messages' | 'favorites' | 'help';
  label: string;
  is_enabled: boolean;
  show_label: boolean;
  sort_order: number;
  roles: UserRole[];
  url?: string;
  link?: string;
  href?: string;
}

export interface HelpLink {
  id: string;
  label: string;
  url: string;
  target: '_self' | '_blank';
  is_enabled: boolean;
}

export interface HeroSearchConfig {
  id?: string;
  // Support both snake_case and camelCase
  headline?: string;
  subheadline?: string;
  search_placeholder?: string;
  searchPlaceholder?: string;
  search_size?: 'normal' | 'large' | 'xl';
  searchSize?: 'normal' | 'large' | 'xl';
  search_button_label?: string;
  searchButtonLabel?: string;
  search_results_url?: string;
  searchResultsUrl?: string;
  search_button_aria_label?: string;
  searchButtonAriaLabel?: string;
  ai_badge_label?: string;
  aiBadgeLabel?: string;
  ai_badge_description?: string;
  aiBadgeDescription?: string;
  quick_tags?: { id: string; label: string; url: string; color?: string; bgColor?: string }[];
  quickTags?: { id: string; label: string; url: string; color?: string; bgColor?: string }[];
  trusted_brands?: {
    enabled: boolean;
    is_enabled?: boolean;
    title: string;
    logos: { id: string; src: string; alt: string; url?: string; clickable?: boolean }[];
  };
  trustedBrands?: {
    enabled: boolean;
    is_enabled?: boolean;
    title: string;
    logos: { id: string; src: string; alt: string; url?: string; clickable?: boolean }[];
  };
  value_prop?: {
    enabled: boolean;
    heading: string;
    badges: { id: string; label: string; icon: string }[];
    primaryCta?: { label: string; url: string };
    secondaryCta?: { label: string; url: string };
  };
  valueProp?: {
    enabled: boolean;
    heading: string;
    badges: { id: string; label: string; icon: string }[];
    primaryCta?: { label: string; url: string };
    secondaryCta?: { label: string; url: string };
  };
  createdAt?: string;
  updatedAt?: string;
}

// ==================== MEDIA & FILES ====================
export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: MediaType;
  size: number;
}

export interface MediaItem {
  id: string;
  name: string;
  url: string;
  type: MediaType;
  size: number;
  created_at: string;
}

export interface UploadedFile {
  id: string;
  fileId?: string;
  user_id: string;
  owner_role?: string;
  owner_id?: string;
  ownerId?: string;
  ownerRole?: string;
  name: string;
  type: MediaType | string;
  size: number;
  url: string;
  category: FileCategory;
  created_at: string;
  storage_key?: string;
  storageKey?: string;
  storage_provider?: string;
  storageProvider?: string;
  visibility?: 'public' | 'private';
  mime_type?: string;
  mimeType?: string;
  thumbnail_url?: string | null;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  usedIn?: { type: string; id: string; label?: string }[];
}

// ==================== AI & INTELLIGENCE ====================
export interface SkillRecommendation {
  skill: string;
  demand_growth: number;
  income_uplift: number;
  difficulty: string;
  reason: string;
}

export interface EnterpriseHiringInsight {
  employer_id?: string;
  employerId?: string;
  shortlisted_candidates?: ({ id: string; name: string; fit_score?: number; risk_score?: number; cost_efficiency?: string; fitScore?: number; riskScore?: number; costEfficiency?: string })[];
  shortlistedCandidates?: ({ id: string; name: string; fit_score?: number; risk_score?: number; cost_efficiency?: string; fitScore?: number; riskScore?: number; costEfficiency?: string })[];
  team_gaps: string[];
  teamGaps?: string[];
  market_position: string;
  budget_optimization: string;
}

export interface BudgetAdvice {
  recommended_range: string;
  success_probability?: number;
  successProbability?: number;
  market_comparison?: string;
  marketComparison?: string;
  optimization_tips?: string[];
  optimizationTips?: string[];
}

export interface TrustScore {
  user_id?: string;
  userId?: string;
  overall_score?: number;
  overallScore?: number;
  reliability?: number;
  fairness?: number;
  professionalism?: number;
  trust_tier?: string;
  trustTier?: string;
  completion_rate?: number;
  completionRate?: number;
  cancellation_rate?: number;
  cancellationRate?: number;
  dispute_rate?: number;
  disputeRate?: number;
  response_rate?: number;
  responseRate?: number;
  response_time_hours?: number | null;
  responseTimeHours?: number | null;
  completed_jobs?: number;
  completedJobs?: number;
  review_count?: number;
  reviewCount?: number;
  average_rating?: number;
  averageRating?: number;
  trend?: 'up' | 'down' | 'stable';
  risk_indicators?: string[];
  riskIndicators?: string[];
  history?: any[];
}

export interface PricingAdvice {
  min: number;
  optimal: number;
  max: number;
  confidence: number;
  reasoning: string;
}

export interface AIAbuseReport {
  user_id: string;
  user_name: string;
  message: string;
  reason: string;
  timestamp: string;
  action_taken: string;
  severity: string;
}

export interface AIPrompt {
  id: string;
  module: AIModule;
  role: string;
  system_prompt: string;
  enabled: boolean;
  updated_at: string;
  updated_by: string;
  version: number;
}

export interface AIConversationLog {
  id: string;
  user_id: string;
  user_role: string;
  user_name: string;
  timestamp: string;
  messages: { sender: 'user' | 'agent'; text: string; timestamp: string }[];
  source: 'AI' | 'STATIC';
  status: 'active' | 'resolved';
}

export interface AIAnalytics {
  total_conversations: number;
  cost_estimate: number;
  avg_response_time: number;
  safety_stats: { spam_triggers: number };
  top_roles: { role: string; count: number }[];
  conversion_impact: { ai_gigs_created: number; ai_hire_rate: number; revenue_uplift: number };
}

export interface AIConfig {
  providers: {
    google: { provider: 'google'; api_key?: string; apiKey?: string; enabled: boolean; model: string };
    openai: { provider: 'openai'; api_key?: string; apiKey?: string; enabled: boolean; model: string };
  };
  routing: {
    support_chat: 'google' | 'openai';
    seo_tags: 'google' | 'openai';
    semantic_search: 'google' | 'openai';
    content_moderation: 'google' | 'openai';
  };
  safety: {
    max_tokens?: number;
    maxTokens?: number;
    temperature: number;
  };
  cost_control?: {
    enabled?: boolean;
    monthly_limit_usd: number;
    current_spend_usd?: number;
  };
  // CamelCase alias for UI
  costControl?: {
    enabled?: boolean;
    monthlyLimitUSD?: number;
    currentSpendUSD?: number;
  };
  fallback?: any;
}

export interface HiringPrediction {
  freelancer_id?: string;
  freelancerId?: string;
  job_id?: string;
  jobId?: string;
  success_probability?: number;
  successProbability?: number;
  risk_level?: string;
  riskLevel?: string;
  top_factors?: string[];
  topFactors?: string[];
  red_flags?: string[];
  redFlags?: string[];
}

// ==================== PAYMENTS & FINANCE ====================
export interface PaymentGateway {
  id: string;
  name: string;
  is_enabled: boolean;
  mode: 'live' | 'test';
  logo: string;
  supported_currencies: string[];
  config?: any;
}

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  amount: number;
  method: string;
  details: any;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  requested_at: string;
  processed_at?: string;
  risk_score?: number;
  risk_level?: string;
}

export interface PayoutAccountDetails {
  accountName?: string;
  accountNumber?: string;
  bankName?: string;
  routingNumber?: string;
  iban?: string;
  swiftBic?: string;
  paypalEmail?: string;
  stripeAccountId?: string;
  preferredMethod?: string;
  country: string;
  currency: string;
}

export interface CommissionRule {
  id: string;
  role: UserRole;
  type: 'percentage' | 'fixed';
  value: number;
  min_amount?: number;
  max_amount?: number;
}

export interface GlobalCommissionSettings {
  freelancer_fee_type: 'percentage' | 'fixed';
  freelancer_fee_value: number;
  employer_fee_type: 'percentage' | 'fixed';
  employer_fee_value: number;
  minimum_fee: number;
  max_adjustment?: number;
  maxAdjustment?: number;
  freelancerFeeType?: 'percentage' | 'fixed';
  freelancerFeeValue?: number;
  employerFeeType?: 'percentage' | 'fixed';
  employerFeeValue?: number;
  minimumFee?: number;
}

export interface PlatformFinancials {
  total_escrow: number;
  total_cleared_user_funds: number;
  total_pending_clearance: number;
  platform_revenue: number;
  refund_pool: number;
}

export interface MarketingROI {
  channel: string;
  spend: number;
  conversions: number;
  cost_per_acquisition: number;
  revenue: number;
  roi: number;
}

// ==================== SUBSCRIPTIONS & PLANS ====================
export interface Subscriber {
  id: string;
  email: string;
  source: 'footer' | 'popup' | 'checkout' | 'blog';
  status: SubscriberStatus;
  subscribed_at: string;
}

export interface Plan {
  id: string;
  name: string;
  type: 'freelancer' | 'employer';
  price: number;
  interval: 'monthly' | 'yearly' | 'lifetime';
  currency: string;
  isActive: boolean; // camelCase
  isPopular: boolean; // camelCase
  features: PlanFeature[];
}

export interface PlanFeature {
  id: string;
  name: string;
  included: boolean;
  limit?: string;
  code?: string;
}

// ==================== STAFF MANAGEMENT ====================
export interface StaffMember {
  id: string;
  name: string;
  email: string;
  username?: string;
  role_id: string;
  role_name: string;
  roleId?: string;
  roleName?: string;
  role_level?: number;
  roleLevel?: number;
  avatar?: string;
  status: StaffStatus;
  two_factor_enabled?: boolean;
  force_password_reset?: boolean;
  // camelCase aliases
  twoFactorEnabled?: boolean;
  forcePasswordReset?: boolean;
}

export interface StaffRole {
  id: string;
  name: string;
  level?: number;
  description?: string;
  isActive?: boolean;
  isSystemRole?: boolean;
  permissions?: any;
  permissionKeys?: string[];
  permissionsCount?: number;
  assignedStaffCount?: number;
}

// ==================== SUPPORT & DISPUTES ====================
export interface TicketReply {
  id: string;
  ticket_id: string;
  sender: 'user' | 'admin';
  sender_name: string;
  senderName?: string;
  message: string;
  timestamp: string;
  attachments?: string[];
  internal_note?: boolean;
  internalNote?: boolean;
}

export interface SupportTicket {
  id: string;
  tracking_code?: string;
  trackingCode?: string;
  user_id: string;
  userId?: string;
  full_name: string;
  fullName?: string;
  email: string;
  mobile?: string;
  subject: string;
  message: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  created_at: string;
  createdAt?: string;
  updated_at: string;
  updatedAt?: string;
  replies: TicketReply[];
  is_read_by_admin: boolean;
  isReadByAdmin?: boolean;
  is_read_by_user: boolean;
  isReadByUser?: boolean;
  attachments?: string[];
}

export interface TicketCategory {
  id: string;
  name: string;
  is_active?: boolean;
  isActive?: boolean;
}

export interface DisputePrediction {
  ticket_id?: string;
  ticketId?: string;
  dispute_id?: string;
  disputeId?: string;
  predicted_outcome?: string;
  predictedOutcome?: string;
  confidence_score?: number;
  confidenceScore?: number;
  risk_level?: RiskLevel;
  riskLevel?: RiskLevel;
  key_factors?: string[];
  keyFactors?: string[];
  suggested_resolution?: string;
  suggestedResolution?: string;
  evidence_gaps?: string[];
  evidenceGaps?: string[];
  ai_model_used?: string;
  aiModelUsed?: string;
}

// ==================== FRAUD & SECURITY ====================
export interface FraudAlert {
  id?: string;
  user_id?: string;
  userId?: string;
  user_name?: string;
  userName?: string;
  user_role?: string;
  userRole?: string;
  score?: number;
  risk_level?: RiskLevel;
  riskLevel?: RiskLevel;
  reason?: string;
  content_snippet?: string;
  contentSnippet?: string;
  action?: 'Allow' | 'Flagged' | 'Restricted' | 'Auto-Frozen' | 'Blocked';
  reviewed?: boolean;
  timestamp?: string;
}

export interface FraudLog {
  id?: string;
  email?: string;
  ip?: string;
  risk_score?: number;
  riskScore?: number;
  risk_level?: RiskLevel;
  riskLevel?: RiskLevel;
  reasons?: string[];
  action_taken?: FraudAlert['action'];
  actionTaken?: FraudAlert['action'];
  timestamp?: string;
}

// ==================== ANALYTICS & INSIGHTS ====================
export interface ChurnRisk {
  user_id: string;
  user_name: string;
  role: string;
  score: number;
  window: string;
  factors: string[];
  last_active: string;
  projected_loss: number;
}

export interface GrowthForecast {
  date: string;
  subscribers: number;
  revenue: number;
  source: 'current' | 'predicted';
}

export interface OptimizationProposal {
  id: string;
  module: string;
  issue: string;
  recommendation: string;
  impact: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  generated_at: string;
  details?: string;
}

export interface AnomalyAlert {
  id: string;
  severity: AnomalySeverity;
  area: string;
  message: string;
  value: string;
  baseline: string;
  timestamp: string;
  status: 'active' | 'resolved' | 'dismissed';
}

export interface LTVMetric {
  user_id: string;
  user_name: string;
  role: UserRole;
  predicted_ltv: number;
  confidence_score: number;
  revenue_velocity: 'Low' | 'Medium' | 'High';
  churn_risk: number;
  next_action: string;
}

export interface DemandForecast {
  skill: string;
  growth_rate: number;
  recommended_price_range: string;
  regions: string[];
  confidence: number;
  timeframe: string;
  category: string;
}

// ==================== SEARCH & DISCOVERY ====================
export interface TrendingSearch {
  id: string;
  keyword: string;
  count: number;
  is_pinned: boolean;
  is_blocked: boolean;
  trend: 'up' | 'down' | 'stable';
  last_searched_at: string;
}

export interface SearchResult {
  id: string;
  type: 'gig' | 'job' | 'blog' | 'gigs' | 'jobs' | 'post' | 'posts' | 'people' | 'pages';
  title: string;
  description: string;
  image?: string;
  avatarUrl?: string;
  name?: string;
  username?: string;
  subtitle?: string;
  url: string;
  relevance_score?: number;
  meta?: any;
}

export interface SearchConfig {
  sender_name?: string;
  personalized_suggestions: boolean;
  max_trending_items: number;
  blocked_keywords: string[];
}

export interface SearchSuggestion {
  text: string;
  type: 'keyword' | 'category' | 'history' | 'result';
  category?: string;
  url?: string;
  description?: string;
  score?: number;
  title?: string;
  username?: string;
  image?: string;
  avatarUrl?: string;
  thumbnailUrl?: string;
  group?: string;
}

export interface SearchHistory {
  id: string;
  user_id: string;
  query: string;
  created_at: string;
}

export interface RecommendedItem {
  id: string;
  type: 'gig' | 'job';
  title: string;
  description: string;
  image?: string;
  score: number;
  meta: any;
}

// ==================== MATCHING & RANKING ====================
export interface ContractClauseSuggestion {
  id: string;
  title: string;
  text: string;
  category: string;
  reason: string;
  risk_level?: string;
  riskLevel?: string;
}

export interface HiringMatch {
  freelancer_id: string;
  freelancer_name: string;
  score: number;
  match_reason: string;
}

export interface MatchingConfig {
  enabled: boolean;
  weights: {
    skills: number;
    experience: number;
    rating: number;
    response_time: number;
    budget_fit: number;
  };
}

export interface RankingConfig {
  enabled: boolean;
  weights: {
    quality_score: number;
    conversion_rate: number;
    review_sentiment: number;
    engagement: number;
  };
  demote_spam: boolean;
  boost_verified: boolean;
}

// ==================== SKILLS & CERTIFICATIONS ====================
export interface SkillCertification {
  id: string;
  user_id: string;
  skill: string;
  level: SkillLevel;
  score: number;
  confidence: number;
  expires_at: string;
  verified_by_ai: boolean;
  issued_at: string;
  badge_url: string;
}

export interface TalentCreditScore {
  user_id: string;
  score: number;
  risk_level: string;
  recommended_limit: number;
  confidence: number;
  last_updated: string;
}

// ==================== COMMUNITY & FORUM ====================
export interface ForumThread {
  id: string;
  // Support both snake_case (backend) and camelCase (frontend)
  category_id?: string;
  categoryId?: string;
  category_name?: string;
  categoryName?: string;
  user_id?: string;
  userId?: string;
  user_name?: string;
  userName?: string;
  user_avatar?: string;
  userAvatar?: string;
  title: string;
  content: string;
  status: ThreadStatus;
  views: number;
  replies_count?: number;
  repliesCount?: number;
  upvotes: number;
  is_pinned?: boolean;
  isPinned?: boolean;
  is_locked?: boolean;
  isLocked?: boolean;
  created_at?: string;
  createdAt?: string;
  tags: string[];
  interactions?: InteractionCounts;
  user_state?: InteractionState;
  userState?: InteractionState;
}

export interface CommunityClub {
  id: string;
  name: string;
  description: string;
  visibility: ChannelVisibility;
  member_count: number;
  cover_image: string;
  owner_id: string;
  owner_name?: string;
  owner_avatar?: string;
  is_joined?: boolean;
  joined_at?: string | null;
  created_at?: string;
}

// camelCase aliases for CommunityClub
export interface CommunityClub {
  memberCount?: number;
  coverImage?: string;
  slug?: string;
  summary?: string;
  avatarImage?: string;
  category?: string;
  location?: string;
  joinMode?: 'open' | 'request' | 'invite_only';
  postPermission?: 'admins' | 'members' | 'everyone';
  membersCanInvite?: boolean;
  faqs?: GroupFaqItem[];
  postingGuidelines?: string;
  status?: string;
  ownerId?: string;
  ownerName?: string;
  ownerAvatar?: string;
  isJoined?: boolean;
  membershipRole?: 'owner' | 'moderator' | 'member' | null;
  pendingRequest?: GroupJoinRequestSummary | null;
  members?: GroupMemberSummary[];
  pendingRequestCount?: number;
  joinedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GroupFaqItem {
  question: string;
  answer: string;
}

export interface GroupMemberSummary {
  userId: string;
  user_id?: string;
  role: 'owner' | 'moderator' | 'member';
  status: string;
  joinedAt?: string;
  joined_at?: string;
  user?: {
    id: string;
    name: string;
    username?: string;
    avatar?: string;
  } | null;
}

export interface GroupJoinRequestSummary {
  id: string;
  status: string;
  requestedAt?: string;
  requested_at?: string;
  note?: string;
  answers?: string[];
  userId?: string;
  user_id?: string;
  user?: {
    id: string;
    name: string;
    username?: string;
    avatar?: string;
  } | null;
  reviewedBy?: {
    id: string;
    name: string;
    username?: string;
  } | null;
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

export interface ContributorProfile {
  user_id: string;
  user_name: string;
  avatar: string;
  points: number;
  reputation: string;
  badges: string[];
  join_date?: string;
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
  channel_id?: string;
  channelId?: string;
  user_id?: string;
  userId?: string;
  user_name?: string;
  userName?: string;
  user_avatar?: string;
  userAvatar?: string;
  content: string;
  timestamp: string;
  ai_flagged?: boolean;
  aiFlagged?: boolean;
  ai_reason?: string;
  aiReason?: string;
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

// camelCase aliases for frontend compatibility
export interface CommunityComment {
  threadId?: string;
  parentId?: string | null;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  userRole?: string;
  createdAt?: string;
  isLiked?: boolean;
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

  // Community feature flags - FLAT PROPERTIES (not nested)
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

  // Payment settings
  payment_currency: string;
  payment_test_mode: boolean;
  payment_stripe_key: string | null;
  payment_stripe_secret: string | null;
  payment_paypal_client_id: string | null;
  payment_paypal_secret: string | null;

  // Social
  social_facebook: string | null;
  social_twitter: string | null;
  social_linkedin: string | null;
  social_instagram: string | null;

  // SMTP
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password: string | null;
  smtp_encryption: string;
  mail_from_name: string;

  // Analytics
  google_analytics_id: string | null;
  facebook_pixel_id: string | null;
  recaptcha_site_key: string | null;

  created_at: string;
  updated_at: string;
}

export interface LegacyCommunitySettings {
  modules: { forum: boolean; clubs: boolean; events: boolean; content: boolean; contributors: boolean };
  ai: { moderation_enabled: boolean; auto_summary: boolean; sentiment_analysis: boolean; admin_override: boolean };
  permissions: { require_approval: boolean; allow_media: boolean; allow_embeds: boolean; allow_tagging: boolean };
  editor: { enabled_features: string[]; max_content_length: number };
}

export interface CommunityAnalytics {
  health_score: number;
  healthScore?: number;
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
  risk_level: RiskLevel;
  reason: string;
  action_taken: string;
  timestamp?: string;
  moderator_id?: string;
  moderator_name?: string;
  target_id?: string;
  target_type?: string;
  notes?: string;
  severity?: string;
  // camelCase aliases
  userName?: string;
  riskLevel?: RiskLevel;
  actionTaken?: string;
  moderatorName?: string;
}

export interface CommunityPostReportUserSummary {
  id: string;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  avatar?: string | null;
  role?: string | null;
}

export interface CommunityPostReport {
  id: string;
  postId: string;
  reporterId: string;
  postOwnerId: string;
  reason?: string;
  details?: string;
  status: string;
  severity?: string;
  reporterReply?: string;
  adminDecision?: string | null;
  actionType?: string | null;
  actionSummary?: string;
  actionMetadata?: Record<string, any> | null;
  reviewedById?: string | null;
  reviewedAt?: string | Date | null;
  resolvedAt?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  snippet?: string;
  reporter?: CommunityPostReportUserSummary | null;
  postOwner?: CommunityPostReportUserSummary | null;
  reviewer?: CommunityPostReportUserSummary | null;
  post?: {
    id: string;
    title?: string;
    contentSnippet?: string;
    status?: string;
    authorId?: string;
    createdAt?: string | Date | null;
  } | null;
}

// ==================== NOTIFICATIONS ====================
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  action_url?: string;
  actionUrl?: string;
  entity_id?: string;
  entityId?: string;
  is_read?: boolean;
  isRead?: boolean;
  timestamp: string;
}

// ==================== ADMIN DASHBOARD TYPES ====================
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

// ==================== API & PAGINATION TYPES ====================
export interface PaginationParams {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: SortOrder;
}

export interface FilterParams {
  search?: string;
  status?: string;
  category?: string;
  date_from?: string;
  date_to?: string;
  [key: string]: any;
}

export interface PaginatedResponse<T = any> {
  success: boolean;
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
  filters?: FilterParams;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
  timestamp: string;
}

// ==================== VALIDATION TYPES ====================
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}


// camelCase aliases
export interface CommunityEvent {
  startTime?: string;
  endTime?: string;
  hostName?: string;
  isRegistered?: boolean;
  maxAttendees?: number;
}
export interface ValidationResult {
  is_valid: boolean;
  errors?: ValidationError[];
}

// ==================== UTILITY TYPES ====================
// Make all properties optional for partial updates
export type PartialGig = Partial<Gig>;
export type PartialUser = Partial<User>;

// Make all properties required
export type RequiredGig = Required<Gig>;

// Pick specific properties
export type GigSummary = Pick<Gig, 'id' | 'title' | 'price' | 'rating' | 'reviews' | 'image'>;

// Omit sensitive properties
export type SafeUser = Omit<User, 'password' | 'tokens' | 'meta'>;

// Add timestamps automatically
export type WithTimestamps<T> = T & {
  created_at: string;
  updated_at: string;
  deleted_at?: string;
};

// Flexible objects for settings/config
export interface DynamicSettings {
  [key: string]: string | number | boolean | any[];
}

export interface PluginConfig {
  id: string;
  name: string;
  enabled: boolean;
  settings: DynamicSettings;
}

// Main types file - Re-exports from modular files
export * from './types/modules/user-types';
export * from './types/modules/gig-types';
export * from './types/modules/job-types';
export * from './types/modules/commerce-types';
export * from './types/modules/payment-types';
export * from './types/modules/community-types';
export * from './types/modules/admin-types';
export * from './types/modules/api-types';
export * from './types/modules/ai-types';
export * from './types/modules/misc-types';

// ==================== TYPE GUARDS ====================
export function isGig(obj: any): obj is import('./types/modules/gig-types').Gig {
  return obj &&
    typeof obj.id === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.price === 'number' &&
    Array.isArray(obj.packages);
}

export function isUser(obj: any): obj is import('./types/modules/user-types').User {
  return obj &&
    typeof obj.id === 'string' &&
    typeof obj.email === 'string' &&
    typeof obj.role === 'string';
}

export function isApiResponse(obj: any): obj is import('./types/modules/api-types').ApiResponse {
  return obj &&
    typeof obj.success === 'boolean' &&
    typeof obj.timestamp === 'string';
}

// ==================== EXPORT GROUPS ====================
// Remove or comment out these lines - they're duplicate exports:
// export * as UserTypes from './user-types';
// export * as GigTypes from './gig-types';
// export * as PaymentTypes from './payment-types';
// export * as CommunityTypes from './community-types';
// export * as AdminTypes from './admin-types';
// export * as ApiTypes from './api-types';

// Export namespaces for easier access
export * as UserTypes from './types/modules/user-types';
export * as GigTypes from './types/modules/gig-types';
export * as JobTypes from './types/modules/job-types';
export * as CommerceTypes from './types/modules/commerce-types';
export * as PaymentTypes from './types/modules/payment-types';
export * as CommunityTypes from './types/modules/community-types';
export * as AdminTypes from './types/modules/admin-types';
export * as ApiTypes from './types/modules/api-types';
export * as AiTypes from './types/modules/ai-types';
export * as MiscTypes from './types/modules/misc-types';

