
import { RankingConfig, Gig } from "../../types";

export class RankingService {
    private config: RankingConfig;

    constructor() {
        this.config = {
            enabled: true,
            weights: {
                quality_score: 0, // Placeholder, remapped below
                conversion_rate: 0.25,
                review_sentiment: 0.20,
                engagement: 0.10 // Response time/Speed
            },
            demote_spam: true,
            boost_verified: true
        };
    }

    setConfig(config: RankingConfig) {
        this.config = config;
    }

    getConfig() {
        return this.config;
    }

    /**
     * Ranking Signals:
     * - Conversion Rate (25%)
     * - Completion Rate (20%)
     * - Reviews (20%)
     * - Response Time (10%)
     * - Freshness (10%)
     * - Fraud Score (-15% Penalty)
     */
    rankGigs(gigs: Gig[], gigMetrics?: Record<string, any>): Gig[] {
        if (!this.config.enabled) return gigs;

        const rankedGigs = gigs.map(gig => {
            // Mock metric data if not provided (Simulation)
            const metrics = gigMetrics?.[gig.id] || {
                conversion: Math.random() * 5 + 1, // 1-6%
                completion: 90 + Math.random() * 10, // 90-100%
                reviews: gig.rating * 20, // Scale 5 to 100
                response_time: Math.random() * 100, // Inverse score (higher is faster)
                freshness: Math.random() * 100, // Newness
                fraud_score: Math.random() < 0.1 ? 50 : 0 // Occasional risk
            };

            let score = 
                (metrics.conversion * 4) * 0.25 + // Scale conversion to ~100 base
                (metrics.completion) * 0.20 +
                (metrics.reviews) * 0.20 +
                (metrics.response_time) * 0.10 +
                (metrics.freshness) * 0.10;

            // Fraud Penalty
            if (metrics.fraud_score > 0) {
                score -= (metrics.fraud_score * 0.15);
            }

            // Admin Controls
            if (this.config.boost_verified && gig.freelancerAvatar) { 
                score += 5; // Flat boost
            }
            if (this.config.demote_spam && gig.title.length < 15) {
                score -= 20; // Demote short titles
            }

            // Ensure bounds
            score = Math.max(0, Math.min(100, score));

            return { ...gig, rankingScore: score };
        });

        return rankedGigs.sort((a, b) => (b.rankingScore ?? 0) - (a.rankingScore ?? 0));
    }
}
