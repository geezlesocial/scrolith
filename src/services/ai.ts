
import { GoogleGenAI } from "@google/genai";
import { AIService } from "./ai/ai.service";
import { AIConfigManager } from "./ai/ai.config";
import { AIAbuseReport, AIPrompt, AIModule, AIConversationLog, UserRole } from "../types";
import { FraudService } from "./ai/fraud.service";
import { MatchingService } from "./ai/matching.service";
import { RankingService } from "./ai/ranking.service";

// Export new Services Instances
export const fraudService = new FraudService();
export const matchingService = new MatchingService();
export const rankingService = new RankingService();

// --- Types ---

export interface ChatOption {
  label: string;
  path: string;
  role?: string;
}

export interface ChatMessage {
  type: "text" | "list";
  text?: string;
  items?: string[];
}

export interface ChatPath {
  messages: ChatMessage[];
  options?: ChatOption[];
  action?: string;
}

export interface ChatFlow {
  agent: { name: string; role: string; description: string };
  initial_prompt: { text: string; options: ChatOption[] };
  paths: Record<string, ChatPath>;
}

// --- COST & LOGGING HELPERS ---

const COST_PER_1K_TOKENS = 0.002; // Approximate cost for Flash models

const calculateCost = (textLength: number) => {
    // Crude approximation: 1 token ~= 4 characters
    const estimatedTokens = textLength / 4;
    return (estimatedTokens / 1000) * COST_PER_1K_TOKENS;
};

export const checkUsageLimit = async (userId?: string): Promise<boolean> => {
  const config = AIConfigManager.getConfig();
  if (!config.cost_control?.enabled) return true;

  // Use simulated spend from config or local storage tracking
  const currentSpend = config.cost_control.current_spend_usd || 0;
    
  if (currentSpend >= config.cost_control.monthly_limit_usd) {
    console.warn("AI Cost Limit Exceeded. Switching to fallback.");
    return false;
  }
  return true;
};

const trackUsage = (cost: number) => {
  const config = AIConfigManager.getConfig();
  if (config.cost_control) {
    config.cost_control.current_spend_usd = (config.cost_control.current_spend_usd || 0) + cost;
    AIConfigManager.saveConfig(config);
  }
};

export const logConversation = async (data: Partial<AIConversationLog>) => {
    // In production, send this to backend (Prisma)
    // Here we log to console for demo visibility
    console.log("[AI_CONVO_LOG]", data);
};

export const recordAbuse = async (report: Partial<AIAbuseReport>) => {
    console.warn("[ABUSE_DETECTED]", report);
    // In production: await prisma.aIAbuseReport.create({ data: report });
};

// --- SAFETY FILTERS ---

const ROLE_GUARD: Record<string, string[]> = {
  freelancer: ["apply", "withdraw", "gig", "profile", "earning", "bid"],
  employer: ["hire", "post job", "milestone", "payment", "deposit", "invoice"],
  guest: ["signup", "login", "register", "price", "how it works"],
};

export const roleSafetyFilter = (reply: string, userRole: string): string => {
  // Normalize role
  const role = (userRole || 'guest').toLowerCase();
  
  // If the reply mentions keywords that belong exclusively to OTHER roles, flag it.
  
  const forbiddenKeywords: string[] = [];
  
  if (role === 'freelancer') {
      forbiddenKeywords.push(...(ROLE_GUARD['employer'] || []));
  } else if (role === 'employer') {
      forbiddenKeywords.push(...(ROLE_GUARD['freelancer'] || []));
  }

  const lowerReply = reply.toLowerCase();
  const hasUnsafeKeyword = forbiddenKeywords.some(k => lowerReply.includes(k));

  if (hasUnsafeKeyword) {
      // Allow generic help but block specific instructional text for wrong role
      return reply + "\n\n(Note: Some features mentioned may differ based on your account type.)";
  }

  return reply;
};

// --- PROMPT INJECTION & SPAM PREVENTION ---

export const detectPromptInjection = (message: string): boolean => {
  const blocked = [
    "ignore previous",
    "system prompt",
    "act as",
    "bypass",
    "internal instructions",
    "developer mode",
    "reveal internal",
    "do anything now"
  ];
  return blocked.some((k) => message.toLowerCase().includes(k));
};

const userMessageTimestamps: Record<string, number[]> = {};

export const checkSpam = (userId: string, message: string): boolean => {
    const now = Date.now();
    const timestamps = userMessageTimestamps[userId] || [];
    
    // Filter messages from last minute
    const recentMessages = timestamps.filter(t => now - t < 60000);
    userMessageTimestamps[userId] = [...recentMessages, now];

    // Rule: Max 10 messages per minute
    if (recentMessages.length > 10) return true;

    return false;
};

// --- MULTI-LANGUAGE & PROMPT MANAGEMENT ---

const DEFAULT_PROMPTS: Record<AIModule, string> = {
    Support: "You are Jima, a helpful customer support agent for Scrolith.",
    Payments: "You are a financial assistant. Explain escrow, withdrawals, and fees clearly.",
    Jobs: "You are a hiring assistant. Help employers write better job descriptions.",
    Gigs: "You are a gig optimizer. Help freelancers improve their service listings.",
    KYC: "You are a compliance officer. Guide users through ID verification steps.",
    General: "You are a general assistant for the Scrolith platform."
};

// Mock in-memory storage for prompts
let systemPrompts: AIPrompt[] = Object.entries(DEFAULT_PROMPTS).map(([module, text]) => ({
  id: `prompt-${module}`,
  module: module as AIModule,
  role: 'all',
  system_prompt: text,
  enabled: true,
  updated_at: new Date().toISOString(),
  updated_by: 'System',
  version: 1
}));

export const getSystemPrompt = (module: AIModule = 'Support', role: string = 'all'): string => {
  const prompt = systemPrompts.find(p => p.module === module && (p.role === role || p.role === 'all') && p.enabled);
  return prompt?.system_prompt || DEFAULT_PROMPTS[module];
};

export const updateSystemPrompt = async (id: string, text: string, enabled: boolean): Promise<void> => {
  systemPrompts = systemPrompts.map(p => p.id === id ? { ...p, system_prompt: text, enabled, updated_at: new Date().toISOString() } : p);
};

export const getAvailablePrompts = async (): Promise<AIPrompt[]> => {
    return [...systemPrompts];
};

// --- CORE METHODS ---

export const getTagSuggestions = async (title: string, description: string, category: string): Promise<string[]> => {
  const result = await AIService.getTagSuggestions({
    title,
    description,
    category
  });
  return result.tags;
};

// Cache the flow to avoid refetching constantly for fallback
let cachedChatFlow: ChatFlow | null = null;

export const loadChatFlow = async (): Promise<ChatFlow> => {
  if (cachedChatFlow) return cachedChatFlow;
  try {
    const response = await fetch('/chatflow.json');
    if (!response.ok) {
      throw new Error(`Failed to load chat flow: ${response.statusText}`);
    }
    const data = await response.json();
    cachedChatFlow = data;
    return data as ChatFlow;
  } catch (error) {
    console.error("Error loading chat flow configuration:", error);
    return {
      agent: { name: "Jima", role: "Support", description: "Fallback Agent" },
      initial_prompt: { text: "I'm having trouble connecting. Please reload.", options: [] },
      paths: {}
    };
  }
};

export const getStaticFallback = async (userRole: string, intent: string): Promise<string> => {
    const flow = await loadChatFlow();
    const roleKey = userRole?.toLowerCase() || 'guest';
    
    // 1. Try to find path matching role
    const rolePath = flow.paths[roleKey];
    if (rolePath && rolePath.options) {
        // Simple keyword matching against options
        const match = rolePath.options.find(opt => intent.toLowerCase().includes(opt.label.toLowerCase()));
        if (match) {
            // Retrieve the answer for that option
            const answerPath = flow.paths[match.path];
            if (answerPath && answerPath.messages.length > 0) {
                return answerPath.messages.map(m => m.text).join('\n');
            }
        }
    }

    // 2. Generic Fallback
    return "I'm currently in offline mode. I can help with general questions, or you can contact our support team directly.";
};

/**
 * Enhanced Support Response with Fallback, Safety, Abuse Prevention, and Logging
 */
export const getSupportResponse = async (
  message: string, 
  role: 'Freelancer' | 'Employer' | null, 
  history: {sender: string, text: string}[]
): Promise<string> => {
  const userRole = role || 'Guest';
  const userId = 'current-user'; // Replace with actual ID from context in real implementation
  
  // 1. Abuse Detection (Spam & Injection)
    if (checkSpam(userId, message)) {
      await recordAbuse({ user_id: userId, user_name: userRole, message, reason: 'Spam', timestamp: new Date().toISOString(), action_taken: 'Warned', severity: 'Low' });
      return "You are sending messages too quickly. Please wait a moment.";
  }

  if (detectPromptInjection(message)) {
      await recordAbuse({ user_id: userId, user_name: userRole, message, reason: 'Prompt Injection', timestamp: new Date().toISOString(), action_taken: 'Blocked', severity: 'High' });
      return "I cannot process that request due to security policies.";
  }

  let responseText = "";
  let source: "AI" | "STATIC" = "AI";

  // 2. Check Usage Limits
  if (!(await checkUsageLimit())) {
      source = "STATIC";
      responseText = await getStaticFallback(userRole, message);
  } else {
      // 3. Try Gemini AI with Dynamic System Prompt
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const conversationContext = history.map(h => 
          `${h.sender === 'user' ? 'User' : 'Agent'}: ${h.text}`
        ).join('\n');

        // Fetch dynamic system prompt based on context (Support module by default)
        const systemPrompt = getSystemPrompt('Support', userRole);

        const fullPrompt = `
          ${systemPrompt}
          
          User Role: ${userRole}
          
          History:
          ${conversationContext}
          
          User: ${message}
          
          Provide a helpful, professional, and concise response. 
          If the question is about specific account actions (withdrawals, hiring), ensure the advice matches the User Role.
        `;

        const result = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: fullPrompt,
        });

        responseText = result.text || "";
        
        if (!responseText || responseText.length < 5) {
            throw new Error("Empty AI response");
        }

        // Track Cost
        const cost = calculateCost(fullPrompt.length + responseText.length);
        trackUsage(cost);

      } catch (error) {
        console.warn("AI Generation Failed, switching to fallback:", error);
        source = "STATIC";
        responseText = await getStaticFallback(userRole, message);
      }
  }

  // 4. Apply Safety Filter
  responseText = roleSafetyFilter(responseText, userRole);

  // 5. Log Conversation
        await logConversation({
      id: Math.random().toString(36).substr(2, 9),
      user_id: userId,
      user_role: userRole,
      user_name: userRole,
      timestamp: new Date().toISOString(),
      messages: [...history.map(h => ({ sender: h.sender as 'user' | 'agent', text: h.text, timestamp: new Date().toISOString() })), { sender: 'user', text: message, timestamp: new Date().toISOString() }, { sender: 'agent', text: responseText, timestamp: new Date().toISOString() }],
      source,
      status: 'active'
  });

  return responseText;
};

