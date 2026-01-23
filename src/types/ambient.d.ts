// Ambient global type fallbacks to reduce migration type noise
// These are intentionally permissive temporary declarations.

declare global {
  interface Gig { [key: string]: any }
  interface User { [key: string]: any }
  type Category = any;
  interface ListingCategory { [key: string]: any }
  interface Recommendation { [key: string]: any }
  interface PaymentGateway { [key: string]: any }
  interface WalletTransaction { [key: string]: any }
  interface FraudAlert { [key: string]: any }
  interface FraudLog { [key: string]: any }
  type RiskLevel = any;
  interface ApiResponse<T = any> { success?: boolean; data?: T; message?: string; [key: string]: any }
  interface Plan { [key: string]: any }
  interface AdminDashboardStats { [key: string]: any }
  interface RecommendationItem { [key: string]: any }
  interface PaymentMethod { [key: string]: any }
  interface Wallet { [key: string]: any }
  interface ListingCategory { [key: string]: any }
}

export {};
