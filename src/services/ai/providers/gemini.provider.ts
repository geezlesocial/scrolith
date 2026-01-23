
import { GoogleGenAI, Type } from "@google/genai";
import { AIProvider, AIChatInput, AIChatResponse, AITagInput, AITagResponse, AISearchInput, AISearchResponse, AIModerationInput, AIModerationResult, AIReplyInput, AIReplyResponse, AIProjectBriefInput, AIProjectBriefResponse, AIMatchTrendsInput, AIMatchTrendsResponse } from "../ai.types";

export class GeminiProvider implements AIProvider {
    private client: GoogleGenAI | null = null;
    private model: string;

    constructor(apiKey: string, model: string = 'gemini-3-flash-preview') {
        if (apiKey) {
            this.client = new GoogleGenAI({ apiKey });
        }
        this.model = model;
    }

    async chat(input: AIChatInput): Promise<AIChatResponse> {
        if (!this.client) throw new Error("Gemini API Key missing");

        const history = input.messages.slice(0, -1).map(m => 
            `${m.role === 'user' ? 'User' : 'Agent'}: ${m.text}`
        ).join('\n');
        
        const lastMsg = input.messages[input.messages.length - 1];
        
        const prompt = `
        System: You are an AI assistant for Geezle freelance marketplace.
        Context: Role=${input.context?.role || 'Guest'}, Page=${input.context?.page || 'Unknown'}
        History:
        ${history}
        
        User: ${lastMsg.text}
        Agent:
        `;

        const response = await this.client.models.generateContent({
            model: this.model,
            contents: prompt
        });

        return {
            text: response.text || "I'm having trouble responding right now."
        };
    }

    async generateTags(input: AITagInput): Promise<AITagResponse> {
        if (!this.client) return { tags: ["Mock Tag", "Demo"] };

        try {
            const response = await this.client.models.generateContent({
                model: this.model,
                contents: `Generate ${input.maxTags || 5} SEO tags for a gig:
                Title: ${input.title}
                Category: ${input.category}
                Description: ${input.description}`,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    }
                }
            });

            const tags = JSON.parse(response.text || "[]");
            return { tags };
        } catch (e) {
            console.error("Gemini Tag Error", e);
            return { tags: [] };
        }
    }

    async semanticSearch(input: AISearchInput): Promise<AISearchResponse> {
        if (!this.client) return { intent: "search", refinedQuery: input.query };

        const response = await this.client.models.generateContent({
            model: this.model,
            contents: `Analyze search query: "${input.query}"
            User Context: ${JSON.stringify(input.userContext)}
            Return JSON with:
            - intent: (browsing, hiring, informational)
            - refinedQuery: optimized keyword string
            - filters: extracted filters (e.g. price range, category)
            `,
            config: { responseMimeType: "application/json" }
        });

        try {
            return JSON.parse(response.text || "{}");
        } catch {
            return { refinedQuery: input.query };
        }
    }

    async moderate(input: AIModerationInput): Promise<AIModerationResult> {
        if (!this.client) return { flagged: false, categories: [], score: 0 };

        const response = await this.client.models.generateContent({
            model: this.model,
            contents: `Analyze this content for toxicity, hate speech, or spam.
            Content: "${input.content}"
            Return JSON: { flagged: boolean, categories: string[], score: number (0-1) }`,
            config: { responseMimeType: "application/json" }
        });

        try {
            return JSON.parse(response.text || "{}");
        } catch {
            return { flagged: false, categories: [], score: 0 };
        }
    }

    async suggestReply(input: AIReplyInput): Promise<AIReplyResponse> {
        if (!this.client) return { suggestion: "" };

        const context = input.history.map(h => `${h.sender}: ${h.text}`).join('\n');
        
        const prompt = `
        You are Jima, an AI assistant for GEEZLE.
        Rules:
        - No financial advice
        - No legal advice
        - No personal data
        - Professional, short replies
        User role: ${input.userRole}
        
        Context:
        ${context}
        
        Draft a single, professional, and concise reply.
        `;

        try {
            const response = await this.client.models.generateContent({
                model: this.model,
                contents: prompt
            });
            return { suggestion: response.text?.trim() || "" };
        } catch (e) {
            console.error("Gemini Suggest Error", e);
            return { suggestion: "" };
        }
    }

    async generateProjectBrief(input: AIProjectBriefInput): Promise<AIProjectBriefResponse> {
        if (!this.client) throw new Error("Gemini AI Client not initialized");

        const prompt = `
        Act as an Expert Hiring Consultant. Convert this loose user requirement into a professional job post brief.
        
        User Requirement: "${input.prompt}"
        
        Return JSON with:
        - title: A professional job title
        - category: Best fit category
        - budgetRange: Estimated budget (e.g. "$500 - $1000")
        - timeline: Estimated duration
        - description: A clear, structured job description
        - requiredSkills: Array of 3-5 top skills needed
        - screeningQuestions: Array of 2-3 questions to ask applicants
        `;

        try {
            const response = await this.client.models.generateContent({
                model: this.model,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            category: { type: Type.STRING },
                            budgetRange: { type: Type.STRING },
                            timeline: { type: Type.STRING },
                            description: { type: Type.STRING },
                            requiredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                            screeningQuestions: { type: Type.ARRAY, items: { type: Type.STRING } }
                        }
                    }
                }
            });

            return JSON.parse(response.text || "{}");
        } catch (e) {
            console.error("AI Brief Generation Error", e);
            throw new Error("Failed to generate brief");
        }
    }

    async matchTrendsToCategories(input: AIMatchTrendsInput): Promise<AIMatchTrendsResponse> {
        if (!this.client) return { categoryIds: [] };

        const prompt = `
        You are a Marketplace Merchandiser.
        
        Task: Match the provided "Trending Search Keywords" to the "Available Categories".
        Return a list of 'categoryIds' that best represent the trends.
        
        Keywords: ${JSON.stringify(input.trends)}
        
        Available Categories:
        ${JSON.stringify(input.categories)}
        
        Return JSON: { "categoryIds": string[] }
        `;

        try {
            const response = await this.client.models.generateContent({
                model: this.model,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            categoryIds: { type: Type.ARRAY, items: { type: Type.STRING } }
                        }
                    }
                }
            });
            
            return JSON.parse(response.text || '{"categoryIds": []}');
        } catch (e) {
            console.error("AI Category Match Error", e);
            return { categoryIds: [] };
        }
    }
}
