// Gig-related types
export type GigStatus = 'draft' | 'submitted' | 'active' | 'paused' | 'rejected' | 'archived' | 'under_review';
export type PricingMode = 'packages' | 'milestones' | 'hourly' | 'fixed';
export type RequirementType = 'text' | 'file';

export interface GigPackage {
  name: string;
  description: string;
  delivery_days: number;
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
  freelancer_id?: string;
  freelancer_name: string;
  freelancer_avatar: string;
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
  admin_status?: 'pending' | 'approved' | 'rejected';
  is_active?: boolean;
  is_visible?: boolean;
  description: string;
  packages: GigPackage[];
  pricing_mode?: PricingMode;
  faqs?: GigFAQ[];
  requirements?: GigRequirement[];
  extras?: GigExtra[];
  milestones?: GigMilestone[];
  created_at?: string;
  avg_response_time?: string;
  member_since?: string;
  languages?: string[];
  tags?: string[];
  ranking_score?: number;
  views?: number;
  clicks?: number;
  orders_count?: number;
}