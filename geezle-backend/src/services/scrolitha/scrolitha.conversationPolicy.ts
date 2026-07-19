/**
 * Phase 20.7.8 — Server-side policy for the canonical Scrolitha system conversation.
 * Hides peer controls client-side; enforces the same rules on API mutations.
 */
import prisma from '../../utils/prismaClient';
import { getScrolithaPlatformUserId, isScrolithaPlatformUserId } from './scrolitha.platformIdentity';

export const SCROLITHA_PEER_CONTROL_BLOCKED =
  'This action is not available for the official Scrolitha conversation.';

export const isCanonicalScrolithaConversation = async (
  conversationId: string | null | undefined
): Promise<boolean> => {
  const id = String(conversationId || '').trim();
  if (!id) return false;
  const platformId = await getScrolithaPlatformUserId();
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId: id },
    select: { userId: true }
  });
  if (participants.length < 2) return false;
  return participants.some((p) => p.userId === platformId);
};

export const assertNotScrolithaPeerControl = async (
  conversationId: string,
  action: string
): Promise<{ blocked: boolean; error?: string; code?: string }> => {
  const isScrolitha = await isCanonicalScrolithaConversation(conversationId);
  if (!isScrolitha) return { blocked: false };
  return {
    blocked: true,
    error: SCROLITHA_PEER_CONTROL_BLOCKED,
    code: 'SCROLITHA_SYSTEM_CONVERSATION_PROTECTED',
    // action retained for audit logs by callers
    ...(action ? {} : {})
  };
};

export const assertNotScrolithaTargetUser = async (
  targetUserId: string | null | undefined
): Promise<{ blocked: boolean; error?: string; code?: string }> => {
  if (await isScrolithaPlatformUserId(targetUserId)) {
    return {
      blocked: true,
      error: 'Scrolitha is a protected system assistant and cannot be used in this peer operation.',
      code: 'SCROLITHA_PROTECTED_IDENTITY'
    };
  }
  return { blocked: false };
};
