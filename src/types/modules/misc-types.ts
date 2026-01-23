// Miscellaneous types
export enum SkillLevel {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced',
  EXPERT = 'Expert'
}

export type AnomalySeverity = 'info' | 'warning' | 'critical';
export type TicketStatus = 'Open' | 'In Review' | 'In Progress' | 'Waiting for User' | 'Resolved' | 'Closed';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type NotificationType = 'info' | 'success' | 'warning' | 'alert';
export type MediaType = 'image' | 'video' | 'document';
export type FileCategory = 'portfolio' | 'document' | 'verification' | 'chat';
export type AdPlacement = 'feed' | 'sidebar' | 'forum_top';

// Conversations and Messages
export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  participants: { id: string; name: string; avatar: string; is_online?: boolean; role?: string }[];
  last_message: string;
  last_message_at: string;
  unread_count: number;
  messages: Message[];
}

export interface MessageReaction {
  user_id: string;
  emoji: string;
  timestamp: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_role?: string;
  receiver_id: string;
  text: string;
  timestamp: string;
  is_read: boolean;
  reactions?: MessageReaction[];
  ai_flagged?: boolean;
  ai_reason?: string;
}

// Support Tickets
export interface TicketReply {
  id: string;
  ticket_id: string;
  sender: 'user' | 'admin';
  sender_name: string;
  message: string;
  timestamp: string;
  attachments?: string[];
  internal_note?: boolean;
}

export interface SupportTicket {
  id: string;
  tracking_code?: string;
  user_id: string;
  full_name: string;
  email: string;
  mobile?: string;
  subject: string;
  message: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  created_at: string;
  updated_at: string;
  replies: TicketReply[];
  is_read_by_admin: boolean;
  is_read_by_user: boolean;
  attachments?: string[];
}

export interface TicketCategory {
  id: string;
  name: string;
  is_active: boolean;
}

// Analytics and Insights
export interface FraudAlert {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  score: number;
  risk_level: RiskLevel;
  reason: string;
  content_snippet: string;
  action: 'Allow' | 'Flagged' | 'Restricted' | 'Auto-Frozen' | 'Blocked';
  reviewed: boolean;
  timestamp: string;
}

export interface FraudLog {
  id: string;
  email?: string;
  ip?: string;
  risk_score: number;
  risk_level: RiskLevel;
  reasons: string[];
  action_taken: FraudAlert['action'];
  timestamp: string;
}

export interface ChurnRisk {
  user_id: string;
  user_name: string;
  role: string;
  score: number;
  window: string;
  factors: string[];
  last_active: string;
  projected_loss: number;
}

export interface GrowthForecast {
  date: string;
  subscribers: number;
  revenue: number;
  source: 'current' | 'predicted';
}

export interface OptimizationProposal {
  id: string;
  module: string;
  issue: string;
  recommendation: string;
  impact: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  generated_at: string;
  details?: string;
}

export interface AnomalyAlert {
  id: string;
  severity: AnomalySeverity;
  area: string;
  message: string;
  value: string;
  baseline: string;
  timestamp: string;
  status: 'active' | 'resolved' | 'dismissed';
}

export interface LTVMetric {
  user_id: string;
  user_name: string;
  role: 'guest' | 'freelancer' | 'employer' | 'admin' | 'moderator';
  predicted_ltv: number;
  confidence_score: number;
  revenue_velocity: 'Low' | 'Medium' | 'High';
  churn_risk: number;
  next_action: string;
}

export interface DemandForecast {
  skill: string;
  growth_rate: number;
  recommended_price_range: string;
  regions: string[];
  confidence: number;
  timeframe: string;
  category: string;
}

export interface SkillCertification {
  id: string;
  user_id: string;
  skill: string;
  level: SkillLevel;
  score: number;
  confidence: number;
  expires_at: string;
  verified_by_ai: boolean;
  issued_at: string;
  badge_url: string;
}

export interface TalentCreditScore {
  user_id: string;
  score: number;
  risk_level: string;
  recommended_limit: number;
  confidence: number;
  last_updated: string;
}