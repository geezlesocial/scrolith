import type { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const DEFAULT_POLLS = [
  {
    key: 'member_home_scrolitha_focus',
    title: 'Scrolitha coach',
    prompt: 'Which Scrolitha assist would help you most today?',
    kind: 'poll',
    sourceScope: 'member_home',
    options: [
      { label: 'Improve a post', description: 'Polish a community update before publishing.', accent: 'indigo' },
      { label: 'Sharpen a gig', description: 'Clarify an offer and tighten positioning.', accent: 'emerald' },
      { label: 'Clarify a brief', description: 'Turn rough needs into a stronger scope.', accent: 'amber' }
    ]
  },
  {
    key: 'member_home_versus_next_move',
    title: 'Versus card',
    prompt: 'What would pull you back first this week?',
    kind: 'versus',
    sourceScope: 'member_home',
    options: [
      { label: 'Weekly challenge', description: 'Compete, submit, and win visible status.', accent: 'violet' },
      { label: 'Live AMA', description: 'Join a real-time expert office hour.', accent: 'cyan' }
    ]
  },
  {
    key: 'member_home_growth_priority',
    title: 'Growth priority',
    prompt: 'Which identity move matters most right now?',
    kind: 'poll',
    sourceScope: 'member_home',
    options: [
      { label: 'Build streaks', description: 'Stay consistent across post, reply, apply, and learn.', accent: 'slate' },
      { label: 'Grow trust', description: 'Finish verification, improve profile, and ship proof.', accent: 'emerald' },
      { label: 'Unlock rewards', description: 'Join squads, climb tiers, and claim Gcoin drops.', accent: 'amber' }
    ]
  }
] as const;

const ensureDefaultPolls = async () => {
  for (const poll of DEFAULT_POLLS) {
    const existing = await prisma.communityPoll.findUnique({
      where: { key: poll.key },
      select: { id: true }
    });
    if (existing?.id) continue;
    await prisma.communityPoll.create({
      data: {
        key: poll.key,
        title: poll.title,
        prompt: poll.prompt,
        kind: poll.kind,
        sourceScope: poll.sourceScope,
        status: 'active',
        options: {
          create: poll.options.map((option, index) => ({
            label: option.label,
            description: option.description,
            accent: option.accent,
            position: index
          }))
        }
      }
    });
  }
};

const buildPollSummary = (poll: any, viewerUserId?: string | null) => {
  const votes = Array.isArray(poll?.votes) ? poll.votes : [];
  const totalVotes = votes.length;
  const viewerVote = votes.find((vote: any) => String(vote?.userId || '') === String(viewerUserId || '')) || null;
  const optionVotes = new Map<string, number>();
  votes.forEach((vote: any) => {
    const key = String(vote?.optionId || '').trim();
    if (!key) return;
    optionVotes.set(key, Number(optionVotes.get(key) || 0) + 1);
  });

  return {
    id: poll.id,
    key: poll.key || null,
    title: poll.title,
    prompt: poll.prompt,
    kind: poll.kind || 'poll',
    status: poll.status || 'active',
    sourceScope: poll.sourceScope || 'member_home',
    totalVotes,
    viewerVoteOptionId: viewerVote?.optionId || null,
    createdAt: poll.createdAt instanceof Date ? poll.createdAt.toISOString() : String(poll.createdAt || ''),
    endsAt: poll.endsAt instanceof Date ? poll.endsAt.toISOString() : poll.endsAt || null,
    options: (Array.isArray(poll?.options) ? poll.options : [])
      .slice()
      .sort((left: any, right: any) => Number(left?.position || 0) - Number(right?.position || 0))
      .map((option: any) => {
        const voteCount = Number(optionVotes.get(String(option?.id || '').trim()) || 0);
        const percentage = totalVotes > 0 ? Number(((voteCount / totalVotes) * 100).toFixed(1)) : 0;
        return {
          id: option.id,
          label: option.label,
          description: option.description || null,
          accent: option.accent || null,
          position: Number(option.position || 0),
          voteCount,
          percentage,
          selected: viewerVote?.optionId === option.id
        };
      })
  };
};

export const getCommunityPollsController = async (req: Request, res: Response) => {
  try {
    await ensureDefaultPolls();
    const viewerUserId = String(req.user?.id || '').trim() || null;
    const limit = Math.max(1, Math.min(6, Number(req.query.limit || 4)));
    const scope = String(req.query.scope || 'member_home').trim().toLowerCase();
    const now = new Date();
    const polls = await prisma.communityPoll.findMany({
      where: {
        status: 'active',
        sourceScope: scope,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }]
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      include: {
        options: true,
        votes: { select: { optionId: true, userId: true } }
      }
    });

    return res.json({
      success: true,
      data: polls.map((poll) => buildPollSummary(poll, viewerUserId))
    });
  } catch (error: any) {
    console.error('Get community polls error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load polls' });
  }
};

export const voteCommunityPollController = async (req: Request, res: Response) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const pollId = String(req.params.pollId || '').trim();
    const optionId = String(req.body?.optionId || '').trim();
    if (!pollId || !optionId) {
      return res.status(400).json({ success: false, error: 'pollId and optionId are required' });
    }

    const now = new Date();
    const poll = await prisma.communityPoll.findUnique({
      where: { id: pollId },
      include: {
        options: true,
        votes: { select: { optionId: true, userId: true } }
      }
    });
    if (!poll || String(poll.status || '').toLowerCase() !== 'active') {
      return res.status(404).json({ success: false, error: 'Poll not found' });
    }
    if (poll.startsAt && poll.startsAt > now) {
      return res.status(409).json({ success: false, error: 'Poll has not started yet' });
    }
    if (poll.endsAt && poll.endsAt < now) {
      return res.status(409).json({ success: false, error: 'Poll has already closed' });
    }
    if (!poll.options.some((option) => String(option.id) === optionId)) {
      return res.status(400).json({ success: false, error: 'Poll option not found' });
    }

    await prisma.$transaction(async (prismaTx) => {
      const existing = await prismaTx.communityPollVote.findUnique({
        where: { pollId_userId: { pollId, userId } },
        select: { id: true }
      });
      if (existing?.id) {
        await prismaTx.communityPollVote.update({
          where: { id: existing.id },
          data: { optionId }
        });
      } else {
        await prismaTx.communityPollVote.create({
          data: { pollId, optionId, userId }
        });
      }
    });

    const refreshed = await prisma.communityPoll.findUnique({
      where: { id: pollId },
      include: {
        options: true,
        votes: { select: { optionId: true, userId: true } }
      }
    });
    return res.json({
      success: true,
      data: refreshed ? buildPollSummary(refreshed, userId) : null
    });
  } catch (error: any) {
    console.error('Vote community poll error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to record poll vote' });
  }
};
