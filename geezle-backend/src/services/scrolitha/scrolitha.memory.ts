import prisma from '../../utils/prismaClient';
import type { ScrolithaActor } from './scrolitha.types';

const OPEN_CONVERSATION_WINDOW_MS = 12 * 60 * 60 * 1000;

export const resolveConversation = async (input: {
  actor: ScrolithaActor;
  conversationId?: unknown;
  context?: {
    page?: string;
    entityId?: string;
  };
}) => {
  const actorId = String(input.actor.id || '').trim();
  if (!actorId) throw new Error('Authenticated actor is required.');

  const providedConversationId = String(input.conversationId || '').trim();
  if (providedConversationId) {
    const existing = await prisma.scrolithaConversation.findUnique({
      where: { id: providedConversationId }
    });
    if (!existing) {
      throw new Error('Conversation not found.');
    }
    if (existing.userId !== actorId || existing.scope !== input.actor.scope) {
      throw new Error('Forbidden conversation access.');
    }
    return existing;
  }

  const pageContext = String(input.context?.page || '').trim() || null;
  const entityContextId = String(input.context?.entityId || '').trim() || null;
  const cutoff = new Date(Date.now() - OPEN_CONVERSATION_WINDOW_MS);

  const latest = await prisma.scrolithaConversation.findFirst({
    where: {
      userId: actorId,
      scope: input.actor.scope,
      status: 'open',
      updatedAt: { gte: cutoff },
      ...(pageContext ? { pageContext } : {})
    },
    orderBy: { updatedAt: 'desc' }
  });

  if (latest) return latest;

  return prisma.scrolithaConversation.create({
    data: {
      userId: actorId,
      userRole: input.actor.role,
      scope: input.actor.scope,
      status: 'open',
      pageContext,
      entityContextId
    }
  });
};

export const appendConversationMessage = async (input: {
  conversationId: string;
  sender: string;
  content: string;
  metadata?: Record<string, any>;
}) => {
  const content = String(input.content || '').trim();
  if (!content) return null;

  const message = await prisma.scrolithaMessage.create({
    data: {
      conversationId: input.conversationId,
      sender: String(input.sender || 'assistant').toLowerCase(),
      content,
      metadata: input.metadata || null
    }
  });

  await prisma.scrolithaConversation.update({
    where: { id: input.conversationId },
    data: {
      updatedAt: new Date()
    }
  });

  return message;
};

export const updateConversationSummary = async (conversationId: string, summary?: string | null) => {
  await prisma.scrolithaConversation.update({
    where: { id: conversationId },
    data: {
      summary: summary ? String(summary).slice(0, 400) : null,
      updatedAt: new Date()
    }
  });
};

export const listConversationHistory = async (input: {
  actor: ScrolithaActor;
  limit?: unknown;
}) => {
  const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit || 20))));
  const conversations = await prisma.scrolithaConversation.findMany({
    where: {
      userId: input.actor.id,
      scope: input.actor.scope
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 40
      }
    }
  });

  return conversations;
};

export const saveConversationFeedback = async (input: {
  conversationId: string;
  userId?: string | null;
  rating: number;
  note?: string;
}) => {
  return prisma.scrolithaFeedback.create({
    data: {
      conversationId: input.conversationId,
      userId: input.userId || null,
      rating: input.rating,
      note: input.note?.trim() || null
    }
  });
};

export const ensureDefaultSkills = async () => {
  const defaults = [
    {
      key: 'create_gig',
      name: 'Create a Gig',
      roleScope: ['freelancer', 'admin'],
      description: 'Guides freelancer through creating and submitting a gig.',
      inputsSchema: [
        { key: 'title', type: 'string', required: true },
        { key: 'categoryId', type: 'string', required: false },
        { key: 'price', type: 'number', required: true }
      ],
      stepsSchema: [
        { type: 'fetch', tool: 'GET_ME_PROFILE' },
        { type: 'action_preview', tool: 'CREATE_GIG' },
        { type: 'confirm_required' },
        { type: 'execute', tool: 'CREATE_GIG' },
        { type: 'execute', tool: 'SUBMIT_GIG_FOR_REVIEW' }
      ],
      successCriteria: ['gig.status in [\'draft\',\'pending\',\'active\']']
    },
    {
      key: 'post_job',
      name: 'Post a Job',
      roleScope: ['client', 'employer', 'admin'],
      description: 'Guides employer through job posting.',
      inputsSchema: [
        { key: 'title', type: 'string', required: true },
        { key: 'description', type: 'string', required: true },
        { key: 'budget', type: 'string', required: false }
      ],
      stepsSchema: [
        { type: 'action_preview', tool: 'CREATE_JOB' },
        { type: 'confirm_required' },
        { type: 'execute', tool: 'CREATE_JOB' }
      ],
      successCriteria: ['job.status in [\'draft\',\'submitted\',\'active\']']
    },
    {
      key: 'upload_file',
      name: 'Upload and Attach File',
      roleScope: ['freelancer', 'client', 'employer', 'admin'],
      description: 'Guides through uploading a file to Uploaded Files and attaching it to entities.',
      inputsSchema: [{ key: 'fileId', type: 'string', required: true }],
      stepsSchema: [
        { type: 'fetch', tool: 'GET_UPLOADED_FILES' },
        { type: 'action_preview', tool: 'UPLOAD_FILE_TO_LIBRARY' },
        { type: 'confirm_required' },
        { type: 'execute', tool: 'UPLOAD_FILE_TO_LIBRARY' }
      ],
      successCriteria: ['uploaded_files contains fileId']
    },
    {
      key: 'freelancer_growth_review',
      name: 'Freelancer Growth Review',
      roleScope: ['freelancer', 'admin'],
      description: 'Reviews monetization readiness, wallet health, rewards, and growth levers for freelancers.',
      inputsSchema: [],
      stepsSchema: [
        { type: 'fetch', tool: 'GET_MY_MEMBERSHIP_STATUS' },
        { type: 'fetch', tool: 'GET_MY_WALLET_SUMMARY' },
        { type: 'fetch', tool: 'GET_MY_GCOIN_SUMMARY' },
        { type: 'fetch', tool: 'GET_MY_AFFILIATE_OVERVIEW' },
        { type: 'fetch', tool: 'GET_MY_MONETIZATION_STATUS' }
      ],
      successCriteria: ['growth review context loaded']
    },
    {
      key: 'employer_growth_review',
      name: 'Employer Growth Review',
      roleScope: ['client', 'employer', 'admin'],
      description: 'Reviews membership, wallet funding, ad performance, referrals, and retention levers for employers.',
      inputsSchema: [],
      stepsSchema: [
        { type: 'fetch', tool: 'GET_MY_MEMBERSHIP_STATUS' },
        { type: 'fetch', tool: 'GET_MY_WALLET_SUMMARY' },
        { type: 'fetch', tool: 'GET_MY_ADS_OVERVIEW' },
        { type: 'fetch', tool: 'GET_MY_AFFILIATE_OVERVIEW' },
        { type: 'fetch', tool: 'GET_MY_MONETIZATION_STATUS' }
      ],
      successCriteria: ['growth review context loaded']
    }
  ];

  await prisma.scrolithaSkill.createMany({
    data: defaults.map((entry) => ({
      key: entry.key,
      name: entry.name,
      roleScope: entry.roleScope,
      description: entry.description,
      inputsSchema: entry.inputsSchema as any,
      stepsSchema: entry.stepsSchema as any,
      successCriteria: entry.successCriteria as any,
      isActive: true,
      version: 1
    })),
    skipDuplicates: true
  });
};

export const listSkillsForScope = async (scope: 'user' | 'admin', role: string, includeInactive = false) => {
  await ensureDefaultSkills();
  const normalizedRole = String(role || '').trim().toLowerCase();
  const rows = await prisma.scrolithaSkill.findMany({
    where: includeInactive
      ? {}
      : {
          isActive: true
        },
    orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }]
  });

  return rows.filter((skill) => {
    const roleScope = Array.isArray(skill.roleScope) ? skill.roleScope.map((entry) => String(entry || '').toLowerCase()) : [];
    if (!roleScope.length) return true;
    if (scope === 'admin') return true;
    return roleScope.includes(normalizedRole);
  });
};
