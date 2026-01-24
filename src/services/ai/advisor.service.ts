
import { PricingAdvice, SkillRecommendation, BudgetAdvice } from "../../types";

export const AdvisorService = {
    getPricingAdvice: async (category: string, scope: string): Promise<PricingAdvice> => {
        return new Promise(resolve => setTimeout(() => resolve({
            min: 250,
            optimal: 450,
            max: 800,
            confidence: 0.85,
            reasoning: "Based on current demand for 'React Development' and your profile reputation."
        }), 800));
    },

    getSkillRecommendations: async (userId: string): Promise<SkillRecommendation[]> => {
        return new Promise(resolve => setTimeout(() => resolve([
            { skill: "Next.js 14", demand_growth: 45, income_uplift: 20, difficulty: "Medium", reason: "High demand in Enterprise projects." },
            { skill: "AI Integration", demand_growth: 120, income_uplift: 35, difficulty: "Hard", reason: "Exploding market interest." },
            { skill: "Tailwind CSS", demand_growth: 15, income_uplift: 5, difficulty: "Easy", reason: "Standard requirement for many frontend gigs." }
        ]), 700));
    },

    optimizeBudget: async (title: string, requirements: string): Promise<BudgetAdvice> => {
        return new Promise(resolve => setTimeout(() => resolve(({
            recommended_range: "$800 - $1,200",
            recommendedRange: "$800 - $1,200",
            success_probability: 92,
            successProbability: 92,
            market_comparison: "Competitive",
            marketComparison: "Competitive",
            optimization_tips: ["Mention specific deliverables to attract experts.", "Set milestones for payments."],
            optimizationTips: ["Mention specific deliverables to attract experts.", "Set milestones for payments."]
        }) as BudgetAdvice), 900));
    }
};
