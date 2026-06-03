import { CommunityService } from '../../../services/community';
import { MessagingService } from '../../../services/messaging';

export type StoryQuickReaction = 'love' | 'like' | 'haha';

export interface StoryMessagingResult {
  conversationId?: string | null;
  messageId?: string | null;
  actionUrl?: string | null;
}

interface StoryMessagingFallbackContext {
  story?: any;
  viewer?: any;
}

const QUICK_REACTION_LABELS: Record<StoryQuickReaction, string> = {
  love: '\u2764\uFE0F',
  like: '\u{1F44D}',
  haha: '\u{1F602}'
};

const extractPayload = (value: any): StoryMessagingResult => {
  const data = value?.data?.data ?? value?.data ?? value ?? {};
  return {
    conversationId: data?.conversationId ?? data?.conversation_id ?? null,
    messageId: data?.messageId ?? data?.message_id ?? null,
    actionUrl: data?.actionUrl ?? data?.action_url ?? null
  };
};

const normalizeId = (value: unknown) => String(value || '').trim();

const resolveStoryOwnerId = (story: any) =>
  normalizeId(
    story?.authorId ||
      story?.userId ||
      story?.user_id ||
      story?.author?.id ||
      story?.author?.userId ||
      story?.author?.user_id ||
      story?.user?.id ||
      story?.user?.userId ||
      story?.user?.user_id
  );

const resolveViewerId = (viewer: any) =>
  normalizeId(viewer?.id || viewer?.userId || viewer?.user_id || viewer?._id);

const resolveViewerName = (viewer: any) =>
  normalizeId(
    viewer?.name ||
      viewer?.displayName ||
      viewer?.display_name ||
      viewer?.username ||
      viewer?.user_name ||
      viewer?.email
  ) || 'Scrolith member';

const resolveViewerRole = (viewer: any) =>
  normalizeId(viewer?.role || viewer?.userRole || viewer?.user_role || 'USER');

const isRouteMissingError = (error: any) => {
  const status = Number(error?.response?.status || 0);
  if (status !== 404 && status !== 405) return false;
  const data = error?.response?.data;
  if (!data) return true;
  if (typeof data === 'string') {
    return data.trim() === '' || /cannot\s+(post|get)|not\s+found/i.test(data);
  }
  const message = String(data?.error || data?.message || '').trim();
  return !message || /route|endpoint|cannot\s+(post|get)/i.test(message);
};

const sendViaMessagesFallback = async (
  context: StoryMessagingFallbackContext | undefined,
  text: string
): Promise<StoryMessagingResult> => {
  const viewerId = resolveViewerId(context?.viewer);
  const ownerId = resolveStoryOwnerId(context?.story);
  if (!viewerId || !ownerId) {
    throw new Error('Story owner is unavailable. Refresh and try again.');
  }

  const participants = ownerId === viewerId
    ? [{ id: viewerId }]
    : [{ id: viewerId }, { id: ownerId }];
  const conversationId = await MessagingService.createConversation(participants as any);
  const message = await MessagingService.sendMessage(
    conversationId,
    viewerId,
    text,
    resolveViewerRole(context?.viewer)
  );

  return {
    conversationId,
    messageId: message?.id || null,
    actionUrl: `/messages/${encodeURIComponent(conversationId)}`
  };
};

export const StoryMessagingService = {
  sendMessage: async (
    storyId: string,
    text: string,
    context?: StoryMessagingFallbackContext
  ): Promise<StoryMessagingResult> => {
    try {
      const response = await CommunityService.sendStoryDirectMessage(storyId, { text });
      return extractPayload(response);
    } catch (error) {
      if (!isRouteMissingError(error)) throw error;
      return sendViaMessagesFallback(context, `Replied to your story: ${text}`);
    }
  },

  sendReaction: async (
    storyId: string,
    reactionType: StoryQuickReaction,
    context?: StoryMessagingFallbackContext
  ): Promise<StoryMessagingResult> => {
    try {
      const response = await CommunityService.sendStoryDirectMessage(storyId, { reactionType });
      return extractPayload(response);
    } catch (error) {
      if (!isRouteMissingError(error)) throw error;
      const reactionLabel = QUICK_REACTION_LABELS[reactionType] || reactionType;
      return sendViaMessagesFallback(
        context,
        `${resolveViewerName(context?.viewer)} reacted ${reactionLabel} to your story`
      );
    }
  }
};
