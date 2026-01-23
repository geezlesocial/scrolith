declare module '@/types' {
  // UI-friendly aliases (camelCase) for common snake_case fields
  export interface Notification {
    isRead?: boolean;
    actionUrl?: string;
    unreadCount?: number;
  }

  export interface User {
    username?: string;
    firstName?: string;
    lastName?: string;
  }

  export interface BudgetAdvice {
    recommendedRange?: string;
  }

  export interface BlogPost {
    authorName?: string;
    updatedAt?: string;
    shortDescription?: string;
    scheduledAt?: string;
    featuredImage?: string;
    categoryId?: number;
    allowComments?: boolean;
    isFeatured?: boolean;
  }

  export interface ModerationLog {
    userName?: string;
    riskLevel?: string;
  }

  export interface Currency {
    id?: string;
    isDefault?: boolean;
    is_default?: boolean;
    isActive?: boolean;
    is_active?: boolean;
  }

  export interface WalletTransaction {
    reference?: string;
    referenceId?: string;
    reference_id?: string;
  }

  export interface TicketReply {
    senderName?: string;
  }

  export interface TicketCategory {
    isActive?: boolean;
  }

  export interface HelpLink {
    isEnabled?: boolean;
  }

  export interface ActivityRecord {
    date?: string;
  }

  export interface GigExtra {
    additionalDays?: number;
  }

  export interface Job {
    experience_level?: string; // keep snake_case consumer-safe
  }

  export interface TimeEntry {
    contractId?: number;
  }

  export interface FraudLog {
    risk_score?: number;
    risk_level?: any;
    action_taken?: any;
  }

  export interface FraudAlert {
    user_id?: string;
    user_name?: string;
    user_role?: string;
    risk_level?: any;
    content_snippet?: string;
  }

  export interface ContractClauseSuggestion {
    risk_level?: string;
  }

  export interface DisputePrediction {
    ticketId?: any;
  }

  export interface EscrowAdvice {
    escrowId?: any;
  }

  export interface TrustScore {
    userId?: string;
  }

  export interface HiringPrediction {
    freelancerId?: string;
  }

  export interface EmailProviderConfig {
    from_name?: string;
  }

  export interface Message {
    senderId?: string;
    sender_id?: string;
    receiverId?: string;
    receiver_id?: string;
    isRead?: boolean;
    is_read?: boolean;
    conversationId?: string;
    conversation_id?: string;
  }

  export interface Conversation {
    unreadCount?: number;
    unread_count?: number;
    lastMessage?: string;
    last_message?: string;
    lastMessageAt?: string;
    last_message_at?: string;
  }

  export interface ApiResponse<T = any> {
    success?: boolean;
    data?: T;
    message?: string;
    [key: string]: any;
  }

  export interface Gig {
    [key: string]: any;
  }

  export interface ListingCategory {
    [key: string]: any;
  }

  export interface Plan {
    [key: string]: any;
  }

  export interface AdminDashboardStats {
    [key: string]: any;
  }
}

export {};

declare module '*types' {
  export * from '@/types';
}
