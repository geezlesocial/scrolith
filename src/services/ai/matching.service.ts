
import { GoogleGenAI, Type } from "@google/genai";
import { HiringMatch, MatchingConfig, Job, User } from "../../types";
import { AIConfigManager } from "./ai.config";

export class MatchingService {
    private client: GoogleGenAI;
    private model: string;
    private config: MatchingConfig;

    constructor() {
        const aiConfig = AIConfigManager.getConfig();
        const providerConfig = aiConfig.providers.google;
        this.client = new GoogleGenAI({ apiKey: providerConfig.apiKey });
        this.model = providerConfig.model;
        
        // Default Config based on requested formula
        this.config = {
            enabled: true,
            weights: {
                skills: 0.30,      // 30%
                experience: 0.20,  // 20%
                rating: 0.20,      // 20% - mapped from 'Past performance'
                responseTime: 0.10,// 10% - mapped from 'Availability'
                budgetFit: 0.10    // 10%
                // Client preference is dynamic 10%
            }
        };
    }

    setConfig(config: MatchingConfig) {
        this.config = config;
    }

    getConfig() {
        return this.config;
    }

    async matchFreelancersToJob(job: Job, freelancers: any[], clientPreferences?: string): Promise<HiringMatch[]> {
        if (!this.config.enabled) return [];

        const matches: HiringMatch[] = [];

        // Batch processing would be better in prod, but iterating for demo reasoning
        for (const freelancer of freelancers) {
            try {
                // Construct a prompt that enforces the specific weighting logic
                const prompt = `
                    Act as an AI Recruitment Engine. Calculate a match score (0-100) for this freelancer against the job.
                    
                    FORMULA WEIGHTS:
                    - Skill Match: 30%
                    - Experience: 20%
                    - Past Performance (Rating): 20%
                    - Availability: 10%
                    - Budget Fit: 10%
                    - Client Preference: 10%

                    JOB:
                    Title: ${job.title}
                    Skills: ${job.tags.join(', ')}
                    Budget: ${job.budget}
                    Description: ${job.description}
                    Client Preference Note: "${clientPreferences || 'None'}"

                    FREELANCER:
                    Name: ${freelancer.name}
                    Title: ${freelancer.title}
                    Skills: ${(freelancer.skills || []).join(', ')}
                    Rating: ${freelancer.rating || 0} (${freelancer.reviewsCount || 0} reviews)
                    Hourly Rate: ${freelancer.hourlyRate}
                    Availability: ${freelancer.availability || 'Available'}
                    Bio: ${freelancer.bio}

                    INSTRUCTIONS:
                    1. Calculate the score based on the weights.
                    2. Provide a "matchReason" that explains the score using the top contributing factors.
                    
                    Return JSON: { "score": number, "matchReason": string }
                `;

                const response = await this.client.models.generateContent({
                    model: this.model,
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                score: { type: Type.NUMBER },
                                matchReason: { type: Type.STRING }
                            }
                        }
                    }
                });

                const result = JSON.parse(response.text || "{}");
                
                // Safety check on score
                let finalScore = result.score || 0;
                
                // Fallback calculation if AI fails or returns 0 (mock logic)
                if (finalScore === 0) {
                    const skillIntersect = job.tags.filter(t => freelancer.skills?.includes(t)).length;
                    finalScore = (skillIntersect / Math.max(job.tags.length, 1)) * 30; // Base skill score
                    if (freelancer.rating > 4.5) finalScore += 20;
                    if (freelancer.hourlyRate <= parseInt(job.budget.replace(/[^0-9]/g, '') || '100')) finalScore += 10;
                }

                if (finalScore > 0) {
                    matches.push({
                        freelancerId: freelancer.id,
                        freelancerName: freelancer.name,
                        score: Math.min(Math.round(finalScore), 100),
                        matchReason: result.matchReason || `Strong skill match in ${job.tags[0]}`
                    });
                }

            } catch (e) {
                console.error("Matching Error", e);
            }
        }

        return matches.sort((a, b) => b.score - a.score);
    }
}
