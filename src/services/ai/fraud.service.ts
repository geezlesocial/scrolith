
import { GoogleGenAI, Type } from "@google/genai";
import { FraudAlert, FraudLog } from "../../types";
import { AIConfigManager } from "./ai.config";

export class FraudService {
    private client: GoogleGenAI;
    private model: string;

    constructor() {
        const config = AIConfigManager.getConfig();
        const providerConfig = config.providers.google;
        this.client = new GoogleGenAI({ apiKey: providerConfig.apiKey });
        this.model = providerConfig.model;
    }

    /**
     * Analyzes a new subscriber signup for potential fraud/bot activity.
     */
    async analyzeSubscriber(email: string, ip: string, userAgent: string): Promise<FraudLog> {
        const disposableDomains = ['tempmail.com', 'mailinator.com', '10minutemail.com'];
        const domain = email.split('@')[1];
        let riskScore = 0;
        let reasons: string[] = [];
        let level: FraudLog['riskLevel'] = 'Low';

        // 1. Static Rule Check
        if (disposableDomains.includes(domain)) {
            riskScore += 80;
            reasons.push('Disposable Domain');
        }

        // 2. AI Analysis (if configured and key present)
        try {
            const prompt = `
                Analyze signup attempt for fraud risk.
                Email: ${email}
                IP: ${ip}
                UserAgent: ${userAgent}
                
                Factors to consider: 
                - Bot-like email patterns (random strings)
                - High-risk IP ranges (datacenter vs residential) - simulated based on IP string
                
                Return JSON: { "aiScore": number (0-100), "flags": string[] }
            `;

            const response = await this.client.models.generateContent({
                model: this.model,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            aiScore: { type: Type.NUMBER },
                            flags: { type: Type.ARRAY, items: { type: Type.STRING } }
                        }
                    }
                }
            });

            const result = JSON.parse(response.text || "{}");
            if (result.aiScore) {
                riskScore = Math.max(riskScore, result.aiScore);
                if (result.flags) reasons.push(...result.flags);
            }

        } catch (e) {
            console.error("AI Fraud Check Failed", e);
        }

        // Determine Level & Action
        if (riskScore >= 80) level = 'Critical';
        else if (riskScore >= 40) level = 'Medium';

        let action: FraudLog['actionTaken'] = 'Allow';
        if (level === 'Critical') action = 'Blocked';
        else if (level === 'Medium') action = 'Flagged';

        return {
            id: `fraud-${Date.now()}`,
            email,
            ip,
            riskScore,
            riskLevel: level,
            reasons,
            actionTaken: action,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Calculates risk score based on transaction and user metadata.
     * Formula: risk_score = (velocity * 0.3) + (amount_anomaly * 0.25) + (dispute_rate * 0.25) + (ip_mismatch * 0.2)
     */
    async calculateTransactionRisk(userId: string, amount: number, context: any): Promise<{ score: number, level: FraudAlert['riskLevel'], reasons: string[] }> {
        const { 
            velocityScore = 0, // 0-100 based on txs per hour
            avgAmount = 500,
            disputeRate = 0, // 0-100
            isIpMismatch = false
        } = context;

        const reasons: string[] = [];

        // 1. Velocity (30%)
        // High frequency of withdrawals/transactions
        const velocityComponent = Math.min(velocityScore, 100) * 0.3;
        if(velocityScore > 70) reasons.push("High Transaction Velocity");

        // 2. Amount Anomaly (25%)
        // Spike compared to average
        const ratio = amount / (avgAmount || 1);
        let anomalyScore = 0;
        if (ratio > 5) anomalyScore = 100;
        else if (ratio > 2) anomalyScore = 60;
        else if (ratio > 1.5) anomalyScore = 30;
        
        const amountComponent = anomalyScore * 0.25;
        if(ratio > 3) reasons.push("Unusual Transaction Amount");

        // 3. Dispute Rate (25%)
        const disputeComponent = Math.min(disputeRate * 20, 100) * 0.25; // Scale rate to score
        if(disputeRate > 5) reasons.push("High Dispute History");

        // 4. IP Mismatch (20%)
        const ipComponent = (isIpMismatch ? 100 : 0) * 0.2;
        if(isIpMismatch) reasons.push("IP Address Mismatch");

        // Total
        let score = velocityComponent + amountComponent + disputeComponent + ipComponent;
        score = Math.min(Math.max(score, 0), 100);

        let level: FraudAlert['riskLevel'] = 'Low';
        if (score > 70) level = 'Critical';
        else if (score > 40) level = 'High';
        else if (score > 20) level = 'Medium';

        return { score, level, reasons };
    }

    async analyzeRisk(
        userId: string,
        userName: string,
        userRole: string,
        actionType: 'gig_creation' | 'message' | 'withdrawal' | 'login',
        content: string,
        metadata?: any
    ): Promise<FraudAlert | null> {
        
        let behavioralScore = 0;
        let riskLevel: FraudAlert['riskLevel'] = 'Low';
        let reasons: string[] = [];

        // 1. Specific Logic for Withdrawals using formula
        if (actionType === 'withdrawal') {
            const result = await this.calculateTransactionRisk(userId, metadata?.amount || 0, metadata);
            behavioralScore = result.score;
            riskLevel = result.level;
            reasons = result.reasons;
        } else {
            // Standard Behavioral Heuristics for other actions
            behavioralScore = this.calculateBehavioralScore(actionType, metadata);
        }
        
        // 2. Content Analysis using Gemini (if text content exists)
        let contentScore = 0;
        let contentReason = "";
        let flaggedContent = "";

        if (content && content.length > 10) {
            try {
                const prompt = `
                    Analyze the following text for fraud signals in a freelance marketplace.
                    Look for: off-platform payments, scams, phishing, free work requests, toxic language.
                    Text: "${content}"
                    Return JSON: { "riskScore": number (0-100), "reason": string, "flaggedSnippet": string }
                `;

                const response = await this.client.models.generateContent({
                    model: this.model,
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                riskScore: { type: Type.NUMBER },
                                reason: { type: Type.STRING },
                                flaggedSnippet: { type: Type.STRING }
                            }
                        }
                    }
                });

                const analysis = JSON.parse(response.text || "{}");
                contentScore = analysis.riskScore || 0;
                contentReason = analysis.reason || "";
                flaggedContent = analysis.flaggedSnippet || "";

            } catch (error) {
                console.error("Fraud Analysis Error:", error);
            }
        }

        // 3. Combine Scores
        const totalRisk = Math.max(behavioralScore, contentScore);
        
        if (totalRisk < 20) return null; // Safe

        // Refine Action based on Total Risk
        let action: FraudAlert['action'] = 'Allow';
        if (totalRisk >= 70) {
            action = 'Auto-Frozen';
            riskLevel = 'Critical';
        } else if (totalRisk >= 40) {
            action = 'Restricted';
            if (riskLevel === 'Low') riskLevel = 'High';
        } else if (totalRisk >= 20) {
            action = 'Flagged';
            if (riskLevel === 'Low') riskLevel = 'Medium';
        }

        const finalReason = reasons.length > 0 
            ? reasons.join(", ") 
            : (contentReason || "Suspicious Activity Detected");

        return {
            id: `alert-${Date.now()}`,
            userId,
            userName,
            userRole,
            score: Math.round(totalRisk),
            riskLevel,
            reason: finalReason,
            contentSnippet: flaggedContent || content.substring(0, 50) + "...",
            action,
            reviewed: false,
            timestamp: new Date().toISOString()
        };
    }

    private calculateBehavioralScore(actionType: string, metadata?: any): number {
        let score = 0;
        if (actionType === 'gig_creation' && metadata?.recentGigCount > 5) score += 40;
        if (actionType === 'message' && metadata?.isRepetitive) score += 60;
        return score;
    }
}
