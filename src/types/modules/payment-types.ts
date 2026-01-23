// Payment-related types
export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  ESCROW_HOLD = 'escrow_hold',
  ESCROW_RELEASE = 'escrow_release',
  FEE = 'fee',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
  TRANSFER = 'transfer',
  REWARD = 'reward'
}

export enum EscrowStatus {
  HELD = 'Funded',
  RELEASED = 'Released',
  REFUNDED = 'Refunded',
  DISPUTED = 'Disputed'
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  rate: number;
  is_active: boolean;
  is_default?: boolean;
}

export interface Wallet {
  id: string;
  user_id: string;
  available_balance: number;
  pending_clearance: number;
  escrow_balance: number;
  frozen: boolean;
  currency: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  type: TransactionType;
  amount: number;
  status: 'cleared' | 'pending' | 'reversed' | 'failed';
  description: string;
  reference_id?: string;
  created_at: string;
  admin_note?: string;
}

export interface Escrow {
  id: string;
  order_id: string;
  client_id: string;
  client_name: string;
  freelancer_id: string;
  freelancer_name: string;
  amount: number;
  commission: number;
  status: EscrowStatus;
  funded_at: string;
  released_at?: string;
}

export interface PaymentGateway {
  id: string;
  name: string;
  is_enabled: boolean;
  mode: 'live' | 'test';
  logo: string;
  supported_currencies: string[];
  config?: any;
}

export type PaymentProviderId = 'stripe' | 'paypal' | 'paystack' | 'flutterwave' | 'payoneer' | 'paymongo' | 'monnify' | 'opay' | 'xendit' | 'dragonpay';

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  amount: number;
  method: string;
  details: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  risk_score?: number;
  risk_level?: string;
}

export interface CommissionRule {
  id: string;
  role: 'guest' | 'freelancer' | 'employer' | 'admin' | 'moderator';
  type: 'percentage' | 'fixed';
  value: number;
  min_amount?: number;
  max_amount?: number;
}

export interface GlobalCommissionSettings {
  freelancer_fee_type: 'percentage' | 'fixed';
  freelancer_fee_value: number;
  employer_fee_type: 'percentage' | 'fixed';
  employer_fee_value: number;
  minimum_fee: number;
}

export interface GcoinWallet {
  user_id: string;
  recipient_id: string;
  balance: number;
  lifetime_earned: number;
  transactions: GcoinTransaction[];
  status: 'active' | 'frozen';
  fraud_score: number;
  updated_at: string;
}

export interface GcoinTransaction {
  id: string;
  user_id: string;
  user_name: string;
  amount: number;
  type: 'reward' | 'transfer' | 'conversion' | 'admin_adjustment';
  reason: string;
  reference_id?: string;
  recipient_id?: string;
  timestamp: string;
  status: 'approved' | 'pending' | 'rejected';
  source?: string;
}

export interface GcoinSettings {
  conversion_rate: number;
  min_withdrawal: number;
  conversion_enabled: boolean;
  user_transfers_enabled: boolean;
}

export interface GcoinConversionRequest {
  id: string;
  user_id: string;
  user_name: string;
  amount_gcoin: number;
  amount_fiat: number;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
}