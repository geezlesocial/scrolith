
import { AIConfigManager } from "./ai.config";
import { GeminiProvider } from "./providers/gemini.provider";
import { OpenAIProvider } from "./providers/openai.provider";
import { AIProvider, AIChatInput, AITagInput, AISearchInput, AIReplyInput, AIProjectBriefInput, AISkillMatchInput, AISkillMatchResponse, AIMatchTrendsInput } from "./ai.types";
import { GoogleGenAI, Type } from "@google/genai";

export class AIService {
    private static getProvider(feature: 'support_chat' | 'seo_tags' | 'semantic_search' | 'content_moderation'): AIProvider {
        const config = AIConfigManager.getConfig();
        const providerName = config.routing[feature];
        const providerConfig = config.providers[providerName];

        if (providerName === 'openai' && providerConfig.api_key) {
            return new OpenAIProvider(providerConfig.api_key, providerConfig.model);
        }
        
        // Default to Gemini or fallback mock
        return new GeminiProvider(providerConfig.api_key, providerConfig.model);
    }

    static async chat(input: AIChatInput) {
        try {
            const provider = this.getProvider('support_chat');
            return await provider.chat(input);
        } catch (error) {
            console.error("AI Chat Error", error);
            return { text: "I'm currently offline. Please try again later." };
        }
    }

    static async getTagSuggestions(input: AITagInput) {
        try {
            const provider = this.getProvider('seo_tags');
            return await provider.generateTags(input);
        } catch (error) {
            console.error("AI Tags Error", error);
            return { tags: [input.category, "Freelance"] };
        }
    }

    static async semanticSearch(input: AISearchInput) {
        try {
            const provider = this.getProvider('semantic_search');
            return await provider.semanticSearch(input);
        } catch (error) {
            console.error("AI Search Error", error);
            return { refinedQuery: input.query };
        }
    }

    static async moderateContent(content: string) {
        try {
            const provider = this.getProvider('content_moderation');
            return await provider.moderate({ content, type: 'text' });
        } catch (error) {
            return { flagged: false, categories: [], score: 0 };
        }
    }

    static async suggestReply(input: AIReplyInput) {
        try {
            // Using support_chat provider for reply suggestion for consistency
            const provider = this.getProvider('support_chat');
            return await provider.suggestReply(input);
        } catch (error) {
            console.error("AI Suggestion Error", error);
            return { suggestion: "" };
        }
    }

    static async generateProjectBrief(input: AIProjectBriefInput) {
        try {
            // Use 'semantic_search' provider config as it likely has the stronger reasoning model
            const provider = this.getProvider('semantic_search');
            return await provider.generateProjectBrief(input);
        } catch (error) {
            console.error("AI Brief Generation Error", error);
            throw error;
        }
    }

    // New Method for Skill Matching
    static async freelancerSkillMatch(input: AISkillMatchInput): Promise<AISkillMatchResponse> {
        try {
              const config = AIConfigManager.getConfig();
              // Direct Gemini call for specialized structured output if provider doesn't support generic interface
              if (config.providers.google.enabled && config.providers.google.api_key) {
                  const client = new GoogleGenAI({ apiKey: config.providers.google.api_key });
                 const prompt = `
                    You are an AI Career Consultant for a freelance marketplace.
                    User Input: "${input.query}"
                    Task: Suggest relevant marketplace categories, gig ideas, and pricing strategies.
                    
                    Return JSON:
                    {
                        "recommendedCategories": ["Category1", "Category2"],
                        "suggestedGigs": ["Gig Title 1", "Gig Title 2"],
                        "pricingRange": "$X - $Y",
                        "nextActions": ["Action 1", "Action 2"]
                    }
                 `;
                 
                      const response = await client.models.generateContent({
                          model: config.providers.google.model,
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                recommendedCategories: { type: Type.ARRAY, items: { type: Type.STRING } },
                                suggestedGigs: { type: Type.ARRAY, items: { type: Type.STRING } },
                                pricingRange: { type: Type.STRING },
                                nextActions: { type: Type.ARRAY, items: { type: Type.STRING } }
                            }
                        }
                    }
                 });
                 
                 return JSON.parse(response.text || "{}");
            }
            
            // Mock Fallback
            return {
                recommendedCategories: ["General Freelance"],
                suggestedGigs: ["Consultation Service"],
                pricingRange: "$20 - $50",
                nextActions: ["Create Profile"]
            };

        } catch (error) {
            console.error("Skill Match Error", error);
            return {
                recommendedCategories: [],
                suggestedGigs: [],
                pricingRange: "Unknown",
                nextActions: []
            };
        }
    }

    static async matchTrendsToCategories(input: AIMatchTrendsInput) {
        try {
            const provider = this.getProvider('semantic_search');
            return await provider.matchTrendsToCategories(input);
        } catch (error) {
            console.error("AI Trend Match Error", error);
            return { categoryIds: [] };
        }
    }
}
