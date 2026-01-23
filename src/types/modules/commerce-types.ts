// Commerce-related types
export type ContractStatus = 'active' | 'paused' | 'terminated' | 'completed';
export type TimeEntryStatus = 'pending' | 'approved' | 'paid' | 'rejected';
export type OrderStatus = 'Active' | 'Completed' | 'Delivered' | 'Cancelled';
export type PaymentCycle = 'weekly' | 'bi-weekly' | 'monthly';

export interface Contract {
  id: string;
  title: string;
  client_id: string;
  client_name: string;
  freelancer_id: string;
  freelancer_name: string;
  type: 'fixed' | 'hourly';
  hourly_rate: number;
  payment_cycle: PaymentCycle;
  status: ContractStatus;
  total_hours_logged: number;
  total_paid: number;
  start_date: string;
  description: string;
  hours_today?: number;
  hours_this_week?: number;
  earnings_pending?: number;
  active_session_id?: string;
}

export interface TimeEntry {
  id: string;
  contract_id: string;
  freelancer_id: string;
  start_time: string;
  end_time?: string;
  duration_minutes: number;
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
  duration: number;
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

export interface Order {
  id: string;
  gig_title: string;
  client_id: string;
  client_name: string;
  freelancer_id: string;
  freelancer_name: string;
  amount: number;
  status: OrderStatus;
  escrow_status: 'Funded' | 'Released' | 'Refunded' | 'Disputed';
  date_ordered: string;
  due_date: string;
}

export interface CategorySub {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'hidden';
  sort_order: number;
  icon?: string;
}

export interface ListingCategory {
  id: string;
  name: string;
  slug: string;
  type: 'gig' | 'job';
  status: 'active' | 'hidden';
  count: number;
  sort_order: number;
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

export interface Plan {
  id: string;
  name: string;
  type: 'freelancer' | 'employer';
  price: number;
  interval: 'monthly' | 'yearly' | 'lifetime';
  currency: string;
  is_active: boolean;
  is_popular: boolean;
  features: PlanFeature[];
}

export interface PlanFeature {
  id: string;
  name: string;
  included: boolean;
  limit?: string;
}