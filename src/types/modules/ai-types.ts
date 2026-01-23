// AI-related types
export type AIModule = 'Support' | 'Payments' | 'Jobs' | 'Gigs' | 'KYC' | 'General';
export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface SkillRecommendation {
  skill: string;
  demand_growth: number;
  income_uplift: number;
  difficulty: string;
  reason: string;
}

export interface EnterpriseHiringInsight {
  employer_id: string;
  shortlisted_candidates: { id: string; name: string; fit_score: number; risk_score: number; cost_efficiency: string }[];
  team_gaps: string[];
  market_position: string;
  budget_optimization: string;
}

export interface BudgetAdvice {
  recommended_range: string;
  success_probability: number;
  market_comparison: string;
  optimization_tips: string[];
}

export interface TrustScore {
  user_id: string;
  overall_score: number;
  reliability: number;
  fairness: number;
  professionalism: number;
  trend: 'up' | 'down' | 'stable';
  risk_indicators: string[];
  history?: any[];
}

export interface PricingAdvice {
  min: number;
  optimal: number;
  max: number;
  confidence: number;
  reasoning: string;
}

export interface AIAbuseReport {
  user_id: string;
  user_name: string;
  message: string;
  reason: string;
  timestamp: string;
  action_taken: string;
  severity: string;
}

export interface AIPrompt {
  id: string;
  module: AIModule;
  role: string;
  system_prompt: string;
  enabled: boolean;
  updated_at: string;
  updated_by: string;
  version: number;
}

export interface AIConversationLog {
  id: string;
  user_id: string;
  user_role: string;
  user_name: string;
  timestamp: string;
  messages: { sender: 'user' | 'agent'; text: string; timestamp: string }[];
  source: 'AI' | 'STATIC';
  status: 'active' | 'resolved';
}

export interface AIAnalytics {
  total_conversations: number;
  cost_estimate: number;
  avg_response_time: number;
  safety_stats: { spam_triggers: number };
  top_roles: { role: string; count: number }[];
  conversion_impact: { ai_gigs_created: number; ai_hire_rate: number; revenue_uplift: number };
}

export interface AIConfig {
  providers: {
    google: { provider: 'google'; api_key: string; enabled: boolean; model: string };
    openai: { provider: 'openai'; api_key: string; enabled: boolean; model: string };
  };
  routing: {
    support_chat: 'google' | 'openai';
    seo_tags: 'google' | 'openai';
    semantic_search: 'google' | 'openai';
    content_moderation: 'google' | 'openai';
  };
  safety: {
    max_tokens: number;
    temperature: number;
  };
  cost_control?: {
    enabled?: boolean;
    monthly_limit_usd: number;
    current_spend_usd?: number;
  };
  fallback?: any;
}

export interface HiringPrediction {
  freelancer_id: string;
  job_id?: string;
  success_probability: number;
  risk_level: string;
  top_factors: string[];
  red_flags: string[];
}

export interface EscrowAdvice {
  escrow_id: string;
  recommendation: 'Release' | 'Hold' | 'Partial Release';
  confidence: number;
  risk_warnings: string[];
  milestone_progress: number;
}