/**
 * Phase 33.1 — AI feedback (helpful / not helpful). Quality metrics only — no training.
 */
import { randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import { inc } from './observability';
import { writeAIAudit } from './audit';

const isMissing = (err: any) =>
  err?.code === 'P2021' || err instanceof TypeError || /does not exist/i.test(String(err?.message || ''));

export type FeedbackRating = 'helpful' | 'not_helpful';

export type AIFeedbackRecord = {
  id: string;
  userId: string;
  rating: FeedbackRating;
  comment?: string | null;
  capability?: string | null;
  correlationId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  createdAt: string;
};

const memory: AIFeedbackRecord[] = [];

export async function submitFeedback(input: {
  userId: string;
  rating: FeedbackRating;
  comment?: string | null;
  capability?: string | null;
  correlationId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
}): Promise<AIFeedbackRecord> {
  const rating = input.rating === 'helpful' ? 'helpful' : 'not_helpful';
  const rec: AIFeedbackRecord = {
    id: randomUUID(),
    userId: input.userId,
    rating,
    comment: input.comment ? String(input.comment).slice(0, 500) : null,
    capability: input.capability || null,
    correlationId: input.correlationId || null,
    conversationId: input.conversationId || null,
    messageId: input.messageId || null,
    createdAt: new Date().toISOString()
  };
  memory.unshift(rec);
  if (memory.length > 500) memory.pop();

  if (rating === 'helpful') inc('feedbackHelpful');
  else inc('feedbackNotHelpful');

  try {
    await (prisma as any).aIFeedback?.create?.({
      data: {
        id: rec.id,
        userId: rec.userId,
        rating: rec.rating,
        comment: rec.comment,
        capability: rec.capability,
        correlationId: rec.correlationId,
        conversationId: rec.conversationId,
        messageId: rec.messageId
      }
    });
  } catch (err) {
    if (!isMissing(err)) {
      /* soft */
    }
  }

  await writeAIAudit({
    action: 'feedback.submitted',
    actorUserId: input.userId,
    capability: rec.capability,
    correlationId: rec.correlationId,
    metadata: { rating: rec.rating, hasComment: Boolean(rec.comment) }
  });

  return rec;
}

export async function feedbackSummary() {
  let helpful = memory.filter((m) => m.rating === 'helpful').length;
  let notHelpful = memory.filter((m) => m.rating === 'not_helpful').length;
  try {
    const rows = (await (prisma as any).aIFeedback?.groupBy?.({
      by: ['rating'],
      _count: { rating: true }
    })) || [];
    if (rows.length) {
      helpful = 0;
      notHelpful = 0;
      for (const r of rows) {
        if (r.rating === 'helpful') helpful = r._count.rating;
        if (r.rating === 'not_helpful') notHelpful = r._count.rating;
      }
    }
  } catch {
    /* use memory */
  }
  return {
    helpful,
    notHelpful,
    total: helpful + notHelpful,
    note: 'Quality metrics only. Not used for model training in Phase 33.1.'
  };
}

export default { submitFeedback, feedbackSummary };
