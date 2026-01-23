// User-related types
export enum UserRole {
  GUEST = 'guest',
  FREELANCER = 'freelancer',
  EMPLOYER = 'employer',
  ADMIN = 'admin',
  MODERATOR = 'moderator'
}

export type UserStatus = 'active' | 'suspended' | 'inactive';
export type KYCStatus = 'none' | 'pending' | 'approved' | 'rejected';
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
  gcoin_balance?: number;
  join_date?: string;
  location?: string;
  followers_count?: number;
  following_count?: number;
  profile_photo_file_id?: string;
  
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
}

export interface UserSettings {
  email_notifications: boolean;
  in_app_notifications: boolean;
  marketing_emails: boolean;
  two_factor_enabled: boolean;
  login_alerts: boolean;
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
  level: number;
  permissions: any;
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