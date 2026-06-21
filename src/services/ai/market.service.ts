
import { LTVMetric, ReferralIntelligence, DemandForecast, UserRole } from "../../types";

export const MarketService = {
    getLTVPredictions: async (): Promise<LTVMetric[]> => {
        return new Promise(resolve => setTimeout(() => resolve([
            { user_id: 'u1', user_name: 'Top Agency', role: UserRole.FREELANCER, predicted_ltv: 150000, confidence_score: 92, revenue_velocity: 'High', churn_risk: 5, next_action: 'Offer Pro Plan' },
            { user_id: 'u2', user_name: 'Startup Inc', role: UserRole.EMPLOYER, predicted_ltv: 45000, confidence_score: 85, revenue_velocity: 'Medium', churn_risk: 15, next_action: 'Send Case Studies' },
            { user_id: 'u3', user_name: 'New Dev', role: UserRole.FREELANCER, predicted_ltv: 5000, confidence_score: 60, revenue_velocity: 'Low', churn_risk: 45, next_action: 'Suggest Upskilling' },
        ]), 600));
    },

    getReferralIntelligence: async (): Promise<ReferralIntelligence> => {
        return new Promise(resolve => setTimeout(() => resolve({
            top_referrers: [
                { user_id: 'u10', name: 'Tech Blogger', total_referrals: 125, quality_score: 95, k_factor: 1.8 },
                { user_id: 'u11', name: 'Design Guru', total_referrals: 45, quality_score: 88, k_factor: 1.2 }
            ],
            fraud_alerts: [
                { referrer_id: 'u99', reason: 'Self-referral loop detected', severity: 'High' }
            ],
            campaign_suggestions: [
                'Increase commission for "SaaS" category referrals to 15%',
                'Launch "Refer-a-Founder" bonus for employers'
            ]
        }), 600));
    },

    getDemandForecast: async (): Promise<DemandForecast[]> => {
        return new Promise(resolve => setTimeout(() => resolve([
            { skill: "AI Agent Dev", growth_rate: 145, recommended_price_range: "$80-$150/hr", regions: ["Global"], confidence: 0.95, timeframe: "30d", category: "AI" },
            { skill: "Rust", growth_rate: 40, recommended_price_range: "$70-$120/hr", regions: ["US", "EU"], confidence: 0.88, timeframe: "90d", category: "Backend" },
            { skill: "Video UGC", growth_rate: 65, recommended_price_range: "$100-$500/video", regions: ["US"], confidence: 0.90, timeframe: "30d", category: "Marketing" }
        ]), 600));
    }
};
