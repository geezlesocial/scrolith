// Job-related types
export type JobStatus = 'active' | 'closed' | 'draft' | 'submitted' | 'under_review' | 'rejected' | 'archived';
export type JobType = 'Fixed Price' | 'Hourly' | 'Contract';
export type ExperienceLevel = 'Entry' | 'Intermediate' | 'Expert';
export type Visibility = 'public' | 'private' | 'invite';

export interface Job {
  id: string;
  title: string;
  client_name: string;
  budget: string;
  type: JobType;
  posted_time: string;
  description: string;
  tags: string[];
  proposals: number;
  status: JobStatus;
  is_active?: boolean;
  is_visible?: boolean;
  category: string;
  subcategory?: string;
  experience_level?: ExperienceLevel;
  visibility?: Visibility;
  duration?: string;
  attachments?: string[];
  is_featured?: boolean;
  admin_status?: 'pending' | 'approved' | 'rejected';
  meta?: any;
}