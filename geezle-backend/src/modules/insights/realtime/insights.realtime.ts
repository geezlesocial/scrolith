import type { Application } from 'express';

type EmitPayload = Record<string, any> & {
  userId?: string;
};

const emitToSockets = (app: Application | undefined, eventName: string, payload: EmitPayload) => {
  if (!app) return;
  const io = app.get('io');
  const communityNs = app.get('communityNs');
  try {
    const hasTargetUser = Boolean(String(payload.userId || '').trim());
    if (!hasTargetUser) {
      io?.emit(eventName, payload);
      communityNs?.emit(eventName, payload);
    }
    if (hasTargetUser) {
      io?.to(payload.userId).emit(eventName, payload);
      communityNs?.to(`community:user:${payload.userId}`).emit(eventName, payload);
      communityNs?.to(payload.userId).emit(eventName, payload);
    }
  } catch (error) {
    console.warn('[insights] socket emit failed', eventName, error);
  }
};

export const emitInsightsEvent = (
  app: Application | undefined,
  eventName:
    | 'insights:pgs_updated'
    | 'insights:achievement_unlocked'
    | 'insights:streak_updated'
    | 'insights:career_daily_updated'
    | 'insights:quests_assigned'
    | 'insights:quests_progress'
    | 'insights:quests_completed'
    | 'insights:quest_reward_granted'
    | 'insights:leaderboard_updated'
    | 'insights:copilot_tip'
    | 'insights:post_prediction_ready'
    | 'insights:opportunity_match_ready'
    | 'insights:toxicity_flagged',
  payload: EmitPayload
) => {
  emitToSockets(app, eventName, {
    ...payload,
    emittedAt: new Date().toISOString()
  });
};
