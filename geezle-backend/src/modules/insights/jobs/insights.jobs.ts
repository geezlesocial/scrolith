import type { Application } from 'express';
import cron from 'node-cron';
import { buildWeeklyLeaderboard, recomputeAllProfessionalScores } from '../services/insights.service';

let jobsRegistered = false;

export const registerInsightsJobs = (app: Application) => {
  if (jobsRegistered) return;
  jobsRegistered = true;

  // Recompute a rolling sample frequently to keep dashboards near-real-time.
  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await recomputeAllProfessionalScores({ limit: 150, app });
      console.log(
        `[insights] rolling recompute complete success=${result.success} failed=${result.failed} total=${result.total}`
      );
    } catch (error) {
      console.warn('[insights] rolling recompute failed', error);
    }
  });

  // Weekly leaderboard rebuild (every Monday 00:10 server time).
  cron.schedule('10 0 * * 1', async () => {
    try {
      await Promise.all([
        buildWeeklyLeaderboard('global', app),
        buildWeeklyLeaderboard('freelancer', app),
        buildWeeklyLeaderboard('employer', app)
      ]);
      console.log('[insights] weekly leaderboard rebuild complete');
    } catch (error) {
      console.warn('[insights] weekly leaderboard rebuild failed', error);
    }
  });
};

