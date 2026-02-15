// Frontend support widget helper (guest-safe).
// IMPORTANT: No direct Gemini/OpenAI browser calls. All AI runs through backend Scrolitha/Ollama.

import { getApiBaseUrl } from '../utils/apiBase';

export interface ChatOption {
  label: string;
  path: string;
  role?: string;
}

export interface ChatMessage {
  type: 'text' | 'list';
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

const API_URL = getApiBaseUrl();

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
    console.error('Error loading chat flow configuration:', error);
    return {
      agent: { name: 'Scrolitha', role: 'Support', description: 'Fallback Agent' },
      initial_prompt: { text: "I'm having trouble connecting. Please reload.", options: [] },
      paths: {}
    };
  }
};

export const getStaticFallback = async (userRole: string, intent: string): Promise<string> => {
  const flow = await loadChatFlow();
  const roleKey = userRole?.toLowerCase() || 'guest';

  const rolePath = flow.paths[roleKey];
  if (rolePath && rolePath.options) {
    const match = rolePath.options.find((opt) =>
      intent.toLowerCase().includes(opt.label.toLowerCase())
    );
    if (match) {
      const answerPath = flow.paths[match.path];
      if (answerPath && answerPath.messages.length > 0) {
        return answerPath.messages.map((m) => m.text).join('\n');
      }
    }
  }

  return "I can help with general questions or connect you to support. Tell me what you need and I will guide you.";
};

const detectPromptInjection = (message: string): boolean => {
  const blocked = [
    'ignore previous',
    'system prompt',
    'act as',
    'bypass',
    'internal instructions',
    'developer mode',
    'reveal internal',
    'do anything now'
  ];
  return blocked.some((k) => message.toLowerCase().includes(k));
};

const userMessageTimestamps: Record<string, number[]> = {};

const checkSpam = (userId: string): boolean => {
  const now = Date.now();
  const timestamps = userMessageTimestamps[userId] || [];
  const recentMessages = timestamps.filter((t) => now - t < 60_000);
  userMessageTimestamps[userId] = [...recentMessages, now];
  return recentMessages.length > 10;
};

const roleSafetyFilter = (reply: string, userRole: string): string => {
  const role = (userRole || 'guest').toLowerCase();
  const ROLE_GUARD: Record<string, string[]> = {
    freelancer: ['milestone', 'payment', 'deposit', 'invoice'],
    employer: ['withdraw', 'earning', 'bid'],
    guest: []
  };

  const forbiddenKeywords: string[] = [];
  if (role === 'freelancer') forbiddenKeywords.push(...(ROLE_GUARD.employer || []));
  if (role === 'employer') forbiddenKeywords.push(...(ROLE_GUARD.freelancer || []));

  const lowerReply = reply.toLowerCase();
  const hasUnsafeKeyword = forbiddenKeywords.some((k) => lowerReply.includes(k));
  if (!hasUnsafeKeyword) return reply;

  return `${reply}\n\n(Note: Some features mentioned may differ based on your account type.)`;
};

export const getSupportResponse = async (
  message: string,
  role: 'Freelancer' | 'Employer' | null,
  history: { sender: string; text: string }[]
): Promise<string> => {
  const userRole = role || 'Guest';
  const userId = 'guest-user';

  if (checkSpam(userId)) return 'You are sending messages too quickly. Please wait a moment.';
  if (detectPromptInjection(message)) return 'I cannot process that request due to security policies.';

  try {
    const res = await fetch(`${API_URL}/ai/support-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        role: userRole,
        history: Array.isArray(history) ? history.slice(-20) : []
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }
    const payload = await res.json().catch(() => null);
    const reply = String(payload?.data?.reply || payload?.data?.text || payload?.reply || '').trim();
    if (reply) return roleSafetyFilter(reply, userRole);
  } catch (error) {
    console.warn('[SupportWidget] support-chat failed, falling back to static flow:', error);
  }

  const fallback = await getStaticFallback(userRole, message);
  return roleSafetyFilter(fallback, userRole);
};

