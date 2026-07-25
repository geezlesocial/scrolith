// User-related types
export enum UserRole {
  GUEST = 'guest',
  FREELANCER = 'freelancer',
  EMPLOYER = 'employer',
  ADMIN = 'admin',
  MODERATOR = 'moderator'
}

export type UserStatus = 'active' | 'suspended' | 'inactive';
export type KYCStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'verified' | 'under_review';
export type KYCDocumentType = 'ID Card' | 'Passport' | 'Driving License';
export type KYCDocumentStatus = 'Pending' | 'Approved' | 'Rejected';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  status?: UserStatus;
  kyc_status?: KYCStatus;
  kycStatus?: KYCStatus;
  is_pro_freelancer?: boolean;
  isProFreelancer?: boolean;
  is_pro_employer?: boolean;
  isProEmployer?: boolean;
  freelancer_plan_id?: string | null;
  freelancerPlanId?: string | null;
  freelancer_plan_name?: string | null;
  freelancerPlanName?: string | null;
  freelancer_plan_interval?: string | null;
  freelancerPlanInterval?: string | null;
  freelancer_plan_price?: number | null;
  freelancerPlanPrice?: number | null;
  freelancer_plan_currency?: string | null;
  freelancerPlanCurrency?: string | null;
  freelancer_plan_active?: boolean;
  freelancerPlanActive?: boolean;
  freelancer_plan_purchased_at?: string | null;
  freelancerPlanPurchasedAt?: string | null;
  freelancer_plan_expires_at?: string | null;
  freelancerPlanExpiresAt?: string | null;
  employer_plan_id?: string | null;
  employerPlanId?: string | null;
  employer_plan_name?: string | null;
  employerPlanName?: string | null;
  employer_plan_interval?: string | null;
  employerPlanInterval?: string | null;
  employer_plan_price?: number | null;
  employerPlanPrice?: number | null;
  employer_plan_currency?: string | null;
  employerPlanCurrency?: string | null;
  employer_plan_active?: boolean;
  employerPlanActive?: boolean;
  employer_plan_purchased_at?: string | null;
  employerPlanPurchasedAt?: string | null;
  employer_plan_expires_at?: string | null;
  employerPlanExpiresAt?: string | null;
  gcoin_balance?: number;
  join_date?: string;
  location?: string;
  followers_count?: number;
  following_count?: number;
  profile_photo_file_id?: string;
  callCapabilities?: {
    videoCallsEnabled?: boolean;
    videoCallsUpdatedAt?: string | null;
    videoCallsUpdatedById?: string | null;
    videoCallsAdminReason?: string | null;
  };
  
  meta?: {
    last_login?: string;
    last_active?: string;
    login_count?: number;
    ip_address?: string;
    user_agent?: string;
  };
  
  flags?: {
    is_verified?: boolean;
    is_featured?: boolean;
    is_banned?: boolean;
    is_suspended?: boolean;
    requires_kyc?: boolean;
  };
}

export interface UserProfile {
  user_id: string;
  title: string;
  bio: string;
  location: string;
  languages: string[];
  skills: string[];
  hourly_rate: number;
  portfolio: PortfolioItem[];
  experience: Experience[];
  education: Education[];
  certifications: Certification[];
  intro_video_url?: string;
  gender?: string;
  date_of_birth?: string | null;
  dateOfBirth?: string | null;
  birth_month_day?: string;
  birthMonthDay?: string;
  show_birth_month_day_public?: boolean;
  showBirthMonthDayPublic?: boolean;
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

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  username?: string;
  role_id: string;
  role_name: string;
  role_level?: number;
  avatar?: string;
  status: 'active' | 'suspended' | 'inactive';
  two_factor_enabled?: boolean;
  force_password_reset?: boolean;
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

export interface KYCDocument {
  id: string;
  user_id: string;
  user_name: string;
  full_name: string;
  address: string;
  mobile: string;
  dob: string;
  nationality: string;
  type: KYCDocumentType;
  status: KYCDocumentStatus;
  date_submitted: string;
  front_image?: string;
  back_image?: string;
  admin_notes?: string;
}
