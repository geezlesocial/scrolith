export interface Gig {
  id: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  price: number;
  pricingMode: 'packages' | 'fixed' | 'hourly';
  packages: GigPackage[];
  milestones?: any[];
  extras: GigExtra[];
  faqs: GigFAQ[];
  requirements: GigRequirement[];
  images: string[];
  videos: string[];
  documents: string[];
  freelancerName: string;
  freelancerId: string;
  freelancerAvatar: string;
  status: 'draft' | 'submitted' | 'under_review' | 'active' | 'paused' | 'rejected' | 'archived';
  adminStatus: 'pending' | 'approved' | 'rejected';
  rating?: number;
  reviews?: number;
  views?: number;
  clicks?: number;
  ordersCount?: number;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GigPackage {
  name: string;
  description: string;
  deliveryDays: number;
  revisions: number; // -1 for unlimited
  price: number;
  features: string[];
}

export interface GigExtra {
  id: string;
  title: string;
  description: string;
  price: number;
  additionalDays: number;
  appliesTo: string;
}

export interface GigFAQ {
  id: string;
  question: string;
  answer: string;
}

export interface GigRequirement {
  id: string;
  question: string;
  type: 'text' | 'file';
  required: boolean;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  budget: string;
  type: 'fixed' | 'hourly';
  category: string;
  subcategory: string;
  tags: string[];
  status: 'draft' | 'submitted' | 'under_review' | 'active' | 'closed' | 'rejected';
  adminStatus: 'pending' | 'approved' | 'rejected';
  employerName: string;
  employerId: string;
  postedTime: string;
  applications: number;
  isRemote: boolean;
  location?: string;
  duration?: string;
  skills: string[];
  experienceLevel: 'entry' | 'intermediate' | 'expert';
  createdAt: string;
  updatedAt: string;
}

export interface ListingCategory {
  id: string;
  name: string;
  slug: string;
  type: 'gig' | 'job';
  status: 'active' | 'hidden';
  count: number;
  sortOrder: number;
  subcategories: CategorySub[];
  description?: string;
  logo?: string;
}

export interface CategorySub {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'hidden';
  sortOrder: number;
  icon?: string;
}

export interface Plan {
  id: string;
  name: string;
  type: 'freelancer' | 'employer';
  price: number;
  interval: 'monthly' | 'yearly' | 'lifetime';
  currency: string;
  isActive: boolean;
  isPopular: boolean;
  features: PlanFeature[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanFeature {
  id: string;
  name: string;
  included: boolean;
  limit?: string;
}

export interface UploadedFile {
  id: string;
  url: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}