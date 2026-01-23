
import { DisputePrediction, EscrowAdvice, ContractClauseSuggestion, EnterpriseHiringInsight } from "../../types";

export const GovernanceService = {
    // 1. AI Dispute Outcome Prediction
    predictDisputeOutcome: async (ticketId: string): Promise<DisputePrediction> => {
        // Simulating analysis of chat logs, contract terms, and deliverables
        return new Promise(resolve => setTimeout(() => resolve({
            ticket_id: ticketId,
            ticketId,
            predicted_outcome: 'Split Refund',
            predictedOutcome: 'Split Refund',
            confidence_score: 85,
            confidenceScore: 85,
            risk_level: 'Medium',
            riskLevel: 'Medium',
            key_factors: [
                'Freelancer delivered 80% of milestone requirements',
                'Employer provided unclear initial specs',
                'Communication gap of 5 days detected'
            ],
            keyFactors: [
                'Freelancer delivered 80% of milestone requirements',
                'Employer provided unclear initial specs',
                'Communication gap of 5 days detected'
            ],
            suggested_resolution: 'Refund 20% to client, release 80% to freelancer.',
            suggestedResolution: 'Refund 20% to client, release 80% to freelancer.',
            evidence_gaps: ['Final high-res source files', 'Client formal rejection notice'],
            evidenceGaps: ['Final high-res source files', 'Client formal rejection notice']
        }), 1200));
    },

    // 2. AI Escrow Release Advisor
    adviseEscrowRelease: async (escrowId: string): Promise<EscrowAdvice> => {
        return new Promise(resolve => setTimeout(() => resolve({
            escrow_id: escrowId,
            escrowId,
            recommendation: 'Hold',
            confidence: 92,
            risk_warnings: [
                'Deliverable file size (12KB) is unusually small for "Video Production"',
                'Client has not viewed the latest submission'
            ],
            riskWarnings: [
                'Deliverable file size (12KB) is unusually small for "Video Production"',
                'Client has not viewed the latest submission'
            ],
            milestone_progress: 95,
            milestoneProgress: 95
        }), 800));
    },

    // 3. AI Contract Clause Suggestions
    suggestContractClauses: async (jobType: string): Promise<ContractClauseSuggestion[]> => {
        return new Promise(resolve => setTimeout(() => resolve([
            {
                id: 'cl-1',
                title: 'AI Generated Content Usage',
                text: 'The freelancer must disclose any use of generative AI tools in the creation of deliverables.',
                category: 'IP Rights',
                reason: 'High prevalence of AI tools in Content Writing gigs.',
                riskLevel: 'Medium'
            },
            {
                id: 'cl-2',
                title: 'Source Code Ownership',
                text: 'Full ownership of source code transfers to Client upon final payment.',
                category: 'IP Rights',
                reason: 'Standard protection for Software Development.',
                riskLevel: 'Low'
            }
        ]), 600));
    },

    // 4. AI Enterprise Hiring Assistant
    getEnterpriseInsights: async (employerId: string): Promise<EnterpriseHiringInsight> => {
        return new Promise(resolve => setTimeout(() => resolve({
            employer_id: employerId,
            employerId,
            shortlisted_candidates: [
                { id: 'u-101', name: 'Dev Team Alpha', fit_score: 94, risk_score: 5, cost_efficiency: 'High', fitScore: 94, riskScore: 5, costEfficiency: 'High' },
                { id: 'u-102', name: 'Sarah Senior Dev', fit_score: 88, risk_score: 12, cost_efficiency: 'Medium', fitScore: 88, riskScore: 12, costEfficiency: 'Medium' },
                { id: 'u-103', name: 'TechFlow Agency', fit_score: 85, risk_score: 2, cost_efficiency: 'Low', fitScore: 85, riskScore: 2, costEfficiency: 'Low' }
            ],
            shortlistedCandidates: [
                { id: 'u-101', name: 'Dev Team Alpha', fit_score: 94, risk_score: 5, cost_efficiency: 'High', fitScore: 94, riskScore: 5, costEfficiency: 'High' },
                { id: 'u-102', name: 'Sarah Senior Dev', fit_score: 88, risk_score: 12, cost_efficiency: 'Medium', fitScore: 88, riskScore: 12, costEfficiency: 'Medium' },
                { id: 'u-103', name: 'TechFlow Agency', fit_score: 85, risk_score: 2, cost_efficiency: 'Low', fitScore: 85, riskScore: 2, costEfficiency: 'Low' }
            ],
            team_gaps: ['DevOps Specialist', 'QA Automation Engineer'],
            teamGaps: ['DevOps Specialist', 'QA Automation Engineer'],
            market_position: 'Leading (Top 10% Budget)',
            marketPosition: 'Leading (Top 10% Budget)',
            budget_optimization: 'Consider switching 2 senior roles to mid-level to extend runway by 3 months.',
            budgetOptimization: 'Consider switching 2 senior roles to mid-level to extend runway by 3 months.'
        }), 1500));
    }
};
