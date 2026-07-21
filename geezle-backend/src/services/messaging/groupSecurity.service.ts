/**
 * Phase 29.5 — Security helpers for messaging groups (IDOR, SECRET isolation, payload limits).
 */

import prisma from '../../utils/prismaClient';
import { normalizeGroupVisibility } from './groupVisibility';

export const MAX_GROUP_TEXT_LEN = Math.max(1000, Number(process.env.MSG_GROUP_MAX_TEXT || 8000));
export const MAX_GROUP_ATTACHMENTS = Math.max(1, Number(process.env.MSG_GROUP_MAX_ATTACHMENTS || 10));

export type AccessDecision = {
  allowed: boolean;
  reason: string;
  visibility?: string;
};

/** Member-only access for private group content/metadata. */
export const assertGroupMemberAccess = async (
  conversationId: string,
  userId: string,
  opts?: { allowAdmin?: boolean; isAdmin?: boolean }
): Promise<AccessDecision> => {
  if (!conversationId || !userId) return { allowed: false, reason: 'missing_ids' };
  if (opts?.allowAdmin && opts?.isAdmin) return { allowed: true, reason: 'admin' };

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, type: true, visibility: true } as any
  });
  if (!conversation || conversation.type !== 'GROUP') {
    return { allowed: false, reason: 'not_group' };
  }

  const membership = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId, deletedAt: null } as any,
    select: { id: true }
  });
  if (!membership) {
    return {
      allowed: false,
      reason: 'not_member',
      visibility: normalizeGroupVisibility((conversation as any).visibility)
    };
  }
  return {
    allowed: true,
    reason: 'member',
    visibility: normalizeGroupVisibility((conversation as any).visibility)
  };
};

/** Public discovery may only see PUBLIC. SECRET always denied for non-members. */
export const canExposeGroupInDiscovery = (visibility: string) =>
  normalizeGroupVisibility(visibility) === 'PUBLIC';

export const sanitizeGroupPayload = (body: any) => {
  const text = String(body?.text || '');
  const attachments = Array.isArray(body?.attachments) ? body.attachments.slice(0, MAX_GROUP_ATTACHMENTS) : [];
  const errors: string[] = [];
  if (text.length > MAX_GROUP_TEXT_LEN) errors.push('text_too_long');
  if (attachments.length > MAX_GROUP_ATTACHMENTS) errors.push('too_many_attachments');
  return {
    ok: errors.length === 0,
    errors,
    text: text.slice(0, MAX_GROUP_TEXT_LEN),
    attachments: attachments.map((a: any) => String(a || '').trim()).filter(Boolean)
  };
};

/** Strip secrets from any loggable object */
export const redactForLogs = (obj: Record<string, unknown>) => {
  const clone = { ...obj };
  delete clone.text;
  delete clone.body;
  delete clone.message;
  delete clone.code;
  delete clone.inviteCode;
  delete clone.token;
  delete clone.password;
  return clone;
};

export const GROUP_SECURITY_VERSION = '29.5';
