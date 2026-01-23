// API-related types
export type SortOrder = 'asc' | 'desc';

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

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface ValidationResult {
  is_valid: boolean;
  errors?: ValidationError[];
}

// Utility types
export type PartialGig = Partial<Gig>;
export type PartialUser = Partial<User>;
export type RequiredGig = Required<Gig>;
export type GigSummary = Pick<Gig, 'id' | 'title' | 'price' | 'rating' | 'reviews' | 'image'>;
export type SafeUser = Omit<User, 'password' | 'tokens' | 'meta'>;
export type WithTimestamps<T> = T & {
  created_at: string;
  updated_at: string;
  deleted_at?: string;
};

export interface DynamicSettings {
  [key: string]: string | number | boolean | any[];
}

export interface PluginConfig {
  id: string;
  name: string;
  enabled: boolean;
  settings: DynamicSettings;
}

// Type guards
export function isGig(obj: any): obj is Gig {
  return obj && 
         typeof obj.id === 'string' &&
         typeof obj.title === 'string' &&
         typeof obj.price === 'number' &&
         Array.isArray(obj.packages);
}

export function isUser(obj: any): obj is User {
  return obj && 
         typeof obj.id === 'string' &&
         typeof obj.email === 'string' &&
         typeof obj.role === 'string';
}

export function isApiResponse(obj: any): obj is ApiResponse {
  return obj && 
         typeof obj.success === 'boolean' &&
         typeof obj.timestamp === 'string';
}