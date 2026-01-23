
export interface AIChatInput {
    messages: { role: 'user' | 'model' | 'system'; text: string }[];
    context?: { role?: string; page?: string };
}

export interface AIChatResponse {
    text: string;
    usage?: { promptTokens: number; completionTokens: number };
}

export interface AITagInput {
    title: string;
    description: string;
    category: string;
    maxTags?: number;
}

export interface AITagResponse {
    tags: string[];
}

export interface AISearchInput {
    query: string;
    userContext?: { role?: string; history?: string[] };
}

export interface AISearchResponse {
    embedding?: number[];
    intent?: string;
    filters?: Record<string, any>;
    refinedQuery?: string;
}

export interface AIModerationInput {
    content: string;
    type: 'text' | 'image';
}

export interface AIModerationResult {
    flagged: boolean;
    categories: string[];
    score: number;
}

export interface AIReplyInput {
    history: { sender: string; text: string }[];
    userRole: string;
}

export interface AIReplyResponse {
    suggestion: string;
}

export interface AIProjectBriefInput {
    prompt: string;
    userContext?: any;
}

export interface AIProjectBriefResponse {
    title: string;
    category: string;
    budgetRange: string;
    timeline: string;
    description: string;
    requiredSkills: string[];
    screeningQuestions: string[];
}

export interface AISkillMatchInput {
    query: string;
    userRole?: string;
}

export interface AISkillMatchResponse {
    recommendedCategories: string[];
    suggestedGigs: string[];
    pricingRange: string;
    nextActions: string[];
}

export interface AIMatchTrendsInput {
    trends: string[];
    categories: { id: string; name: string }[];
}

export interface AIMatchTrendsResponse {
    categoryIds: string[];
}

export interface AIProvider {
    chat(input: AIChatInput): Promise<AIChatResponse>;
    generateTags(input: AITagInput): Promise<AITagResponse>;
    semanticSearch(input: AISearchInput): Promise<AISearchResponse>;
    moderate(input: AIModerationInput): Promise<AIModerationResult>;
    suggestReply(input: AIReplyInput): Promise<AIReplyResponse>;
    generateProjectBrief(input: AIProjectBriefInput): Promise<AIProjectBriefResponse>;
    matchTrendsToCategories(input: AIMatchTrendsInput): Promise<AIMatchTrendsResponse>;
}
