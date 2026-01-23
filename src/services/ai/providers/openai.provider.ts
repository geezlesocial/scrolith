
import OpenAI from "openai";
import { AIProvider, AIChatInput, AIChatResponse, AITagInput, AITagResponse, AISearchInput, AISearchResponse, AIModerationInput, AIModerationResult, AIReplyInput, AIReplyResponse, AIProjectBriefInput, AIProjectBriefResponse, AIMatchTrendsInput, AIMatchTrendsResponse } from "../ai.types";

export class OpenAIProvider implements AIProvider {
    private client: OpenAI | null = null;
    private model: string;

    constructor(apiKey: string, model: string = 'gpt-4o-mini') {
        if (apiKey) {
            this.client = new OpenAI({ 
                apiKey,
                dangerouslyAllowBrowser: true // Allowed for this specific frontend-only demo requirement
            });
        }
        this.model = model;
    }

    async chat(input: AIChatInput): Promise<AIChatResponse> {
        if (!this.client) throw new Error("OpenAI API Key missing");

        const messages: any[] = [
            { role: "system", content: `You are an AI assistant for Geezle. User Role: ${input.context?.role}` },
            ...input.messages.map(m => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.text }))
        ];

        const completion = await this.client.chat.completions.create({
            messages,
            model: this.model,
        });

        return {
            text: completion.choices[0]?.message?.content || "No response."
        };
    }

    async generateTags(input: AITagInput): Promise<AITagResponse> {
        if (!this.client) return { tags: [] };

        const completion = await this.client.chat.completions.create({
            messages: [{
                role: "user", 
                content: `Generate ${input.maxTags || 5} keywords for: ${input.title} - ${input.description}. Return JSON array of strings.`
            }],
            model: this.model,
            response_format: { type: "json_object" }
        });

        try {
            const content = completion.choices[0].message.content;
            const parsed = JSON.parse(content || "{}");
            return { tags: parsed.tags || parsed.keywords || [] };
        } catch {
            return { tags: [] };
        }
    }

    async semanticSearch(input: AISearchInput): Promise<AISearchResponse> {
        if (!this.client) return { refinedQuery: input.query };
        // Basic stub implementation
        return { refinedQuery: input.query }; 
    }

    async moderate(input: AIModerationInput): Promise<AIModerationResult> {
        if (!this.client) return { flagged: false, categories: [], score: 0 };
        
        const moderation = await this.client.moderations.create({ input: input.content });
        const result = moderation.results[0];

        return {
            flagged: result.flagged,
            categories: Object.keys(result.categories).filter(k => (result.categories as any)[k]),
            score: Math.max(...(Object.values(result.category_scores) as number[]))
        };
    }

    async suggestReply(input: AIReplyInput): Promise<AIReplyResponse> {
        if (!this.client) return { suggestion: "" };
        // Stub implementation
        return { suggestion: "This is a placeholder reply." };
    }

    async generateProjectBrief(input: AIProjectBriefInput): Promise<AIProjectBriefResponse> {
        if (!this.client) throw new Error("OpenAI API Key missing");

        const completion = await this.client.chat.completions.create({
            messages: [{
                role: "user",
                content: `Act as an Expert Hiring Consultant. Convert this loose user requirement into a professional job post brief.
                
                User Requirement: "${input.prompt}"
                
                Return JSON with:
                - title: A professional job title
                - category: Best fit category
                - budgetRange: Estimated budget (e.g. "$500 - $1000")
                - timeline: Estimated duration
                - description: A clear, structured job description
                - requiredSkills: Array of 3-5 top skills needed
                - screeningQuestions: Array of 2-3 questions to ask applicants`
            }],
            model: this.model,
            response_format: { type: "json_object" }
        });

        try {
            const content = completion.choices[0].message.content;
            return JSON.parse(content || "{}");
        } catch {
            return {
                title: "Draft Job",
                category: "General",
                budgetRange: "Not specified",
                timeline: "Flexible",
                description: input.prompt,
                requiredSkills: [],
                screeningQuestions: []
            };
        }
    }

    async matchTrendsToCategories(input: AIMatchTrendsInput): Promise<AIMatchTrendsResponse> {
        // Fallback for OpenAI or when key is missing - just return empty or simple match
        return { categoryIds: [] }; 
    }
}
