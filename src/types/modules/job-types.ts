// Job-related types
export type JobStatus = 'active' | 'closed' | 'draft' | 'submitted' | 'under_review' | 'rejected' | 'archived';
export type JobType = 'Fixed Price' | 'Hourly' | 'Contract';
export type ExperienceLevel = 'Entry' | 'Intermediate' | 'Expert';
export type Visibility = 'public' | 'private' | 'invite';

export interface Job {
  id: string;
  title: string;
  client_name: string;
  client_is_pro?: boolean;
  clientIsPro?: boolean;
  budget: string;
  type: JobType;
  posted_time: string;
  description: string;
  tags: string[];
  proposals: number;
  status: JobStatus;
  is_active?: boolean;
  is_visible?: boolean;
  is_featured?: boolean;
  is_top_selected?: boolean;
  is_recommended?: boolean;
  isFeatured?: boolean;
  isTopSelected?: boolean;
  isRecommended?: boolean;
  category: string;
  subcategory?: string;
  experience_level?: ExperienceLevel;
  visibility?: Visibility;
  duration?: string;
  attachments?: string[];
  is_featured?: boolean;
  admin_status?: 'pending' | 'approved' | 'rejected';
  adminReason?: string;
  meta?: any;
}
