import type { User } from '../types';

export type MarketplaceCondition =
  | 'new'
  | 'used_like_new'
  | 'used_good'
  | 'used_fair'
  | 'refurbished'
  | 'handmade'
  | 'other';

export type MarketplaceDeliveryOption = 'pickup' | 'local_delivery' | 'shipping' | 'cash_on_delivery';

export type MarketplacePaymentMethod = string;

export type MarketplaceListingStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'sold'
  | 'reserved'
  | 'removed'
  | 'suspended';

export type MarketplaceReviewStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface MarketplaceQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string | null;
  condition?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  location?: string | null;
  deliveryOption?: string | null;
  status?: string | null;
  sort?: string | null;
  includeMine?: boolean;
  includeAll?: boolean;
}

export interface MarketplaceListingMedia {
  id: string;
  listingId?: string;
  type: 'image' | 'video';
  url: string;
  storagePath?: string | null;
  thumbnailUrl?: string | null;
  sortOrder?: number | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  createdAt?: string;
}

export interface MarketplaceCategory {
  id: string;
  slug?: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
  parent_id?: string | null;
  sortOrder?: number | null;
  sort_order?: number | null;
  isActive?: boolean;
  is_active?: boolean;
  requiresApproval?: boolean;
  requires_approval?: boolean;
  icon?: string | null;
  image?: string | null;
  listingCount?: number;
  subcategories?: MarketplaceCategory[];
}

export interface MarketplaceSellerSummary extends Pick<User, 'id' | 'name' | 'username' | 'avatar' | 'role' | 'isVerified' | 'is_verified' | 'joinDate' | 'country' | 'location'> {
  verifiedBadge?: boolean;
  followersCount?: number;
  followingCount?: number;
  trustScore?: number;
  rating?: number;
}

export interface MarketplaceListing {
  id: string;
  sellerId: string;
  seller?: MarketplaceSellerSummary | null;
  title: string;
  slug?: string;
  description?: string | null;
  categoryId?: string | null;
  category?: MarketplaceCategory | null;
  subcategoryId?: string | null;
  condition?: MarketplaceCondition;
  price?: number | string | null;
  currency?: string | null;
  negotiable?: boolean;
  quantity?: number | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  deliveryOptions?: MarketplaceDeliveryOption[] | string[] | null;
  paymentMethods?: MarketplacePaymentMethod[] | string[] | null;
  images?: MarketplaceListingMedia[] | string[] | null;
  video?: MarketplaceListingMedia | null;
  status?: MarketplaceListingStatus;
  reviewStatus?: MarketplaceReviewStatus;
  rejectionReason?: string | null;
  adminNotes?: string | null;
  featured?: boolean;
  viewCount?: number;
  saveCount?: number;
  reportCount?: number;
  soldAt?: string | null;
  reservedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  removedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  contactPreference?: string | null;
  phoneNumber?: string | null;
  conditionLabel?: string | null;
  priceLabel?: string | null;
  coverImage?: string | null;
  summary?: string | null;
}

export interface MarketplaceSettings {
  enabled?: boolean;
  publicBrowsing?: boolean;
  approvalMode?: 'auto' | 'manual' | 'new_sellers' | 'conditional';
  maxImages?: number;
  maxVideos?: number;
  maxPrice?: number | null;
  allowCOD?: boolean;
  allowOnlinePayments?: boolean;
  allowBuyerMessaging?: boolean;
  requireApprovalForVideo?: boolean;
  requireApprovalForNewSellers?: boolean;
  paymentMethods?: string[];
  enabledPaymentMethods?: string[];
  reportingReasons?: string[];
  categoriesRequireApproval?: string[];
  sellerLimits?: {
    maxListings?: number;
    maxActiveListings?: number;
    canSell?: boolean;
  };
  commission?: {
    enabled?: boolean;
    rate?: number;
    fixedFee?: number;
    currency?: string;
  };
}

export interface MarketplaceListingFormValues {
  title: string;
  description: string;
  categoryId: string;
  condition: MarketplaceCondition;
  price: string;
  currency: string;
  negotiable: boolean;
  quantity: string;
  location: string;
  deliveryOptions: MarketplaceDeliveryOption[];
  paymentMethods: string[];
  contactPreference: string;
}

export interface MarketplaceDashboard {
  summary?: {
    totalListings?: number;
    activeListings?: number;
    draftListings?: number;
    soldListings?: number;
    reservedListings?: number;
    pendingListings?: number;
    savedListings?: number;
    reports?: number;
    inquiries?: number;
  };
  listings?: MarketplaceListing[];
  favorites?: MarketplaceListing[];
  categories?: MarketplaceCategory[];
}

export interface MarketplaceReport {
  id: string;
  listingId?: string;
  listing?: MarketplaceListing | null;
  reporterId?: string;
  reason?: string;
  details?: string | null;
  status?: 'open' | 'resolved' | 'dismissed';
  createdAt?: string;
  updatedAt?: string;
}

export interface MarketplaceInquiry {
  id?: string;
  listingId?: string;
  message?: string;
  createdAt?: string;
  buyerName?: string;
  buyerEmail?: string;
}
