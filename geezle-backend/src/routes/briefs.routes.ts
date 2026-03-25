import express, { Request, Response } from 'express'
import prisma from '../utils/prismaClient'
import { authMiddleware } from '../middleware/auth.middleware'
import { normalizeDealFlowSettings } from '../utils/dealFlowSettings'
import {
  StoredBriefRecord,
  StoredBriefSourceMessage,
  getBriefRecordById,
  listBriefRecords,
  upsertBriefRecord
} from '../utils/briefStore'
import { appendConversationTimelineEvent } from '../services/conversationTimeline.service'

const router = express.Router()

const nowIso = () => new Date().toISOString()
const makeId = () => `brief_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
const normalizeRole = (role?: string) => (role || '').toString().toLowerCase()
const isAdminRole = (role?: string) => normalizeRole(role).includes('admin')
const isEmployerRole = (role?: string) => {
  const normalized = normalizeRole(role)
  return normalized.includes('client') || normalized.includes('employer') || isAdminRole(role)
}
const isFreelancerRole = (role?: string) => {
  const normalized = normalizeRole(role)
  return normalized.includes('freelancer') || normalized.includes('seller')
}

const requireEmployer = (req: Request, res: Response): boolean => {
  if (isEmployerRole(req.user?.role)) return true
  res.status(403).json({ success: false, error: 'Access denied', code: 'ERR_FORBIDDEN' })
  return false
}

const getSystemDealFlowSettings = async () => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } })
    const data: any = record?.data || {}
    return normalizeDealFlowSettings(data?.dealFlow ?? data?.deal_flow)
  } catch (error) {
    console.warn('[briefs] failed to load deal flow settings', error)
    return normalizeDealFlowSettings(null)
  }
}

const toTitle = (prompt: string) => {
  const cleaned = prompt.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'New Project'
  const sentence = cleaned.split(/[.!?]/)[0] || cleaned
  return sentence.length > 80 ? `${sentence.slice(0, 77)}...` : sentence
}

const extractSkills = (prompt: string) => {
  const tokens = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3)

  const seen = new Set<string>()
  const skills: string[] = []
  for (const token of tokens) {
    if (seen.has(token)) continue
    seen.add(token)
    skills.push(token)
    if (skills.length >= 6) break
  }
  return skills.length ? skills : ['planning', 'communication']
}

const resolveTemplate = (templateId: string | undefined, settings: ReturnType<typeof normalizeDealFlowSettings>) => {
  const templates = Array.isArray(settings.templates) ? settings.templates : []
  if (!templateId) return templates[0] || null
  return templates.find((template) => String(template.id || '') === String(templateId || '')) || templates[0] || null
}

const detectCategory = (prompt: string, requestedCategory: string | undefined, settings: ReturnType<typeof normalizeDealFlowSettings>) => {
  const allowedCategories = Array.isArray(settings.allowedCategories) ? settings.allowedCategories : []
  if (requestedCategory && allowedCategories.includes(requestedCategory)) return requestedCategory

  const normalized = String(prompt || '').toLowerCase()
  if (normalized.includes('design') && allowedCategories.includes('Design')) return 'Design'
  if ((normalized.includes('site') || normalized.includes('app') || normalized.includes('api')) && allowedCategories.includes('Development')) {
    return 'Development'
  }
  if ((normalized.includes('campaign') || normalized.includes('marketing') || normalized.includes('ads')) && allowedCategories.includes('Marketing')) {
    return 'Marketing'
  }
  if ((normalized.includes('content') || normalized.includes('copy') || normalized.includes('newsletter')) && allowedCategories.includes('Content')) {
    return 'Content'
  }
  return settings.defaultCategory
}

const generateBriefDraft = (
  prompt: string,
  settings: ReturnType<typeof normalizeDealFlowSettings>,
  options?: {
    templateId?: string
    requestedCategory?: string
  }
) => {
  const template = resolveTemplate(options?.templateId, settings)
  const skills = extractSkills(prompt)
  const title = toTitle(prompt)
  const category = detectCategory(prompt, options?.requestedCategory || template?.category, settings)

  return {
    title,
    category,
    budgetRange: 'TBD',
    timeline: '2-4 weeks',
    description: `Project overview:\n${prompt.trim()}\n\nDeliverables, milestones, and success criteria will be refined before proposal approval.`,
    requiredSkills: skills,
    screeningQuestions: [
      'Describe a similar project you have delivered.',
      'What approach would you take to deliver this on time?'
    ],
    templateId: template?.id || null,
    templateLabel: template?.label || null
  }
}

const buildConversationContext = async (conversationId: string, viewerId: string, role?: string) => {
  const admin = isAdminRole(role)
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: {
        where: admin ? undefined : { deletedAt: null },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              role: true
            }
          }
        }
      }
    }
  })

  if (!conversation) {
    throw new Error('Conversation not found')
  }

  const isParticipant = conversation.participants.some((participant) => String(participant.userId || '') === String(viewerId || ''))
  if (!admin && !isParticipant) {
    throw new Error('Not authorized')
  }

  const rawMessages = await prisma.directMessage.findMany({
    where: {
      conversationId,
      deletedAt: null
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 18,
    include: {
      sender: {
        select: {
          id: true,
          name: true
        }
      }
    }
  })

  const messages = [...rawMessages]
    .reverse()
    .filter((message) => String(message.messageType || '').toUpperCase() !== 'SYSTEM')
    .map((message) => {
      const snippet = String(message.text || '').trim()
      return {
        id: message.id,
        sender_id: message.senderId,
        sender_name: message.sender?.name || 'Participant',
        snippet: snippet || (Array.isArray(message.attachments) && message.attachments.length ? 'Attachment shared' : 'Message'),
        timestamp: message.createdAt ? message.createdAt.toISOString() : nowIso()
      } satisfies StoredBriefSourceMessage
    })

  const participantSummary = conversation.participants.map((participant) => ({
    id: participant.user?.id || participant.userId,
    name: participant.user?.name || 'Participant',
    role: participant.user?.role || ''
  }))

  const prompt = messages.length
    ? messages.map((message) => `${message.sender_name}: ${message.snippet}`).join('\n')
    : 'Conversation starter for a new project.'

  return {
    conversation,
    participantSummary,
    messages,
    prompt
  }
}

const ensurePrivateJobBridge = async (
  brief: StoredBriefRecord,
  actorUserId: string,
  settings: ReturnType<typeof normalizeDealFlowSettings>
) => {
  if (!settings.autoCreatePrivateJobs) return brief.linked_job_id || null

  const data = {
    title: brief.title,
    description: brief.description || brief.prompt,
    budget: brief.budget_range || 'TBD',
    type: 'FIXED_PRICE' as const,
    tags: Array.isArray(brief.required_skills) ? brief.required_skills : [],
    status: 'ACTIVE' as const,
    isActive: true,
    isVisible: false,
    visibility: 'PRIVATE' as const,
    duration: brief.timeline || null,
    attachments: [],
    isFeatured: false,
    clientId: brief.user_id,
    adminStatus: 'APPROVED' as const,
    adminReason: null
  }

  if (brief.linked_job_id) {
    const existing = await prisma.job.findUnique({ where: { id: brief.linked_job_id } })
    if (existing) {
      const updated = await prisma.job.update({
        where: { id: existing.id },
        data
      })
      return updated.id
    }
  }

  const created = await prisma.job.create({
    data
  })

  return created.id
}

const canAccessBrief = async (brief: StoredBriefRecord, userId: string, role?: string) => {
  if (isAdminRole(role) || String(brief.user_id || '') === String(userId || '')) return true
  if (!brief.conversation_id) return false
  const participant = await prisma.conversationParticipant.findFirst({
    where: {
      conversationId: brief.conversation_id,
      userId,
      deletedAt: null
    },
    select: { userId: true }
  })
  return Boolean(participant)
}

router.get('/config', authMiddleware, async (_req: Request, res: Response) => {
  const settings = await getSystemDealFlowSettings()
  res.json({ success: true, data: settings })
})

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  if (!requireEmployer(req, res) && !isFreelancerRole(req.user?.role)) return

  const userId = req.user?.id || ''
  const role = normalizeRole(req.user?.role)
  const requestedUserId = (req.query.userId as string) || (req.query.user_id as string) || ''
  const requestedConversationId = (req.query.conversationId as string) || (req.query.conversation_id as string) || ''

  const items = await listBriefRecords()
  const filtered = items.filter((brief) => {
    if (requestedConversationId && String(brief.conversation_id || '') !== String(requestedConversationId || '')) {
      return false
    }
    if (isAdminRole(role) && requestedUserId) {
      return String(brief.user_id || '') === String(requestedUserId || '')
    }
    if (isAdminRole(role) && !requestedUserId) {
      return true
    }
    if (String(brief.user_id || '') === String(userId || '')) return true
    return String(brief.conversation_id || '') !== '' && false
  })

  res.json({ success: true, data: filtered })
})

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const brief = await getBriefRecordById(req.params.id)
  if (!brief) {
    res.status(404).json({ success: false, error: 'Brief not found', code: 'ERR_NOT_FOUND' })
    return
  }

  const allowed = await canAccessBrief(brief, String(req.user?.id || ''), req.user?.role)
  if (!allowed) {
    res.status(403).json({ success: false, error: 'Access denied', code: 'ERR_FORBIDDEN' })
    return
  }

  res.json({ success: true, data: brief })
})

router.post('/generate', authMiddleware, async (req: Request, res: Response) => {
  if (!requireEmployer(req, res)) return

  const prompt = (req.body?.prompt || '').toString().trim()
  if (!prompt) {
    res.status(400).json({ success: false, error: 'Prompt is required', code: 'ERR_BAD_REQUEST' })
    return
  }

  const settings = await getSystemDealFlowSettings()
  const generated = generateBriefDraft(prompt, settings, {
    templateId: req.body?.templateId || req.body?.template_id,
    requestedCategory: req.body?.category
  })

  res.json({ success: true, data: generated })
})

router.post('/from-conversation/draft', authMiddleware, async (req: Request, res: Response) => {
  if (!requireEmployer(req, res)) return

  const conversationId = String(req.body?.conversationId || req.body?.conversation_id || '').trim()
  if (!conversationId) {
    res.status(400).json({ success: false, error: 'Conversation ID is required', code: 'ERR_BAD_REQUEST' })
    return
  }

  try {
    const settings = await getSystemDealFlowSettings()
    if (!settings.enabled || !settings.allowCreateBriefFromChat) {
      res.status(403).json({ success: false, error: 'Chat-to-brief is disabled', code: 'ERR_DISABLED' })
      return
    }

    const context = await buildConversationContext(conversationId, String(req.user?.id || ''), req.user?.role)
    const generated = generateBriefDraft(context.prompt, settings, {
      templateId: req.body?.templateId || req.body?.template_id,
      requestedCategory: req.body?.category
    })

    res.json({
      success: true,
      data: {
        conversation_id: conversationId,
        participant_summary: context.participantSummary,
        source_messages: context.messages,
        prompt: context.prompt,
        ...generated
      }
    })
  } catch (error: any) {
    const message = String(error?.message || 'Failed to extract conversation')
    const status = message === 'Conversation not found' ? 404 : message === 'Not authorized' ? 403 : 500
    res.status(status).json({ success: false, error: message, code: 'ERR_CONVERSATION_EXTRACT' })
  }
})

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  if (!requireEmployer(req, res)) return

  const userId = String(req.user?.id || '').trim()
  const payload = req.body || {}
  const id = String(payload.id || makeId())
  const existing = await getBriefRecordById(id)
  if (existing && !isAdminRole(req.user?.role) && String(existing.user_id || '') !== userId) {
    res.status(403).json({ success: false, error: 'Access denied', code: 'ERR_FORBIDDEN' })
    return
  }

  const conversationId = String(payload.conversation_id || payload.conversationId || existing?.conversation_id || '').trim()
  let participantSummary = Array.isArray(payload.participant_summary || payload.participantSummary)
    ? (payload.participant_summary || payload.participantSummary)
    : existing?.participant_summary || []
  let sourceMessages = Array.isArray(payload.source_messages || payload.sourceMessages)
    ? (payload.source_messages || payload.sourceMessages)
    : existing?.source_messages || []

  if (conversationId) {
    try {
      const context = await buildConversationContext(conversationId, userId, req.user?.role)
      if (!participantSummary.length) participantSummary = context.participantSummary
      if (!sourceMessages.length) sourceMessages = context.messages
    } catch (error: any) {
      const message = String(error?.message || 'Failed to load conversation')
      const status = message === 'Conversation not found' ? 404 : message === 'Not authorized' ? 403 : 500
      res.status(status).json({ success: false, error: message, code: 'ERR_CONVERSATION_ACCESS' })
      return
    }
  }

  const prompt = String(payload.prompt || payload.description || existing?.prompt || '').trim()
  if (!prompt) {
    res.status(400).json({ success: false, error: 'Prompt is required', code: 'ERR_BAD_REQUEST' })
    return
  }

  const settings = await getSystemDealFlowSettings()
  const generated = generateBriefDraft(prompt, settings, {
    templateId: payload.template_id || payload.templateId || existing?.template_id,
    requestedCategory: payload.category || existing?.category
  })

  const createdAt = existing?.created_at || nowIso()
  const record: StoredBriefRecord = {
    id,
    user_id: existing?.user_id || userId,
    prompt,
    title: String(payload.title || generated.title).trim() || generated.title,
    category: String(payload.category || generated.category).trim() || generated.category,
    budget_range: String(payload.budget_range || payload.budgetRange || existing?.budget_range || 'TBD').trim() || 'TBD',
    timeline: String(payload.timeline || existing?.timeline || generated.timeline).trim() || generated.timeline,
    description: String(payload.description || generated.description || prompt).trim() || prompt,
    required_skills: Array.isArray(payload.required_skills || payload.requiredSkills)
      ? (payload.required_skills || payload.requiredSkills)
      : existing?.required_skills || generated.requiredSkills,
    screening_questions: Array.isArray(payload.screening_questions || payload.screeningQuestions)
      ? (payload.screening_questions || payload.screeningQuestions)
      : existing?.screening_questions || generated.screeningQuestions,
    created_at: createdAt,
    updated_at: nowIso(),
    conversation_id: conversationId || undefined,
    template_id: String(payload.template_id || payload.templateId || generated.templateId || '').trim() || undefined,
    participant_summary: participantSummary,
    source_messages: sourceMessages,
    linked_job_id: existing?.linked_job_id || null,
    linked_proposals: existing?.linked_proposals || [],
    linked_contract: existing?.linked_contract || null,
    history: existing?.history || []
  }

  record.linked_job_id = await ensurePrivateJobBridge(record, userId, settings)
  const saved = await upsertBriefRecord(record)

  const eventType = existing ? 'brief_updated' : 'brief_created'
  const historyEntry = {
    id: `${eventType}_${Date.now().toString(36)}`,
    type: eventType,
    actor_user_id: userId,
    timestamp: nowIso(),
    summary: eventType === 'brief_created' ? 'Created brief from conversation' : 'Updated brief details'
  } as const

  const updated = await upsertBriefRecord({
    ...saved,
    history: [...(saved.history || []), historyEntry]
  })

  if (conversationId && settings.timeline.briefs) {
    try {
      await appendConversationTimelineEvent(req, {
        conversationId,
        actorUserId: userId,
        eventType,
        previewText: eventType === 'brief_created' ? `Brief created: ${updated.title}` : `Brief updated: ${updated.title}`,
        metadata: {
          briefId: updated.id,
          title: updated.title,
          category: updated.category,
          budgetRange: updated.budget_range,
          timeline: updated.timeline,
          linkedJobId: updated.linked_job_id || null,
          brief: updated
        }
      })
    } catch (error) {
      console.warn('[briefs] failed to append timeline event', error)
    }
  }

  res.json({ success: true, data: updated })
})

router.post('/:id/use-to-create-job', authMiddleware, async (req: Request, res: Response) => {
  if (!requireEmployer(req, res)) return

  const brief = await getBriefRecordById(req.params.id)
  if (!brief) {
    res.status(404).json({ success: false, error: 'Brief not found', code: 'ERR_NOT_FOUND' })
    return
  }

  if (!isAdminRole(req.user?.role) && String(brief.user_id || '') !== String(req.user?.id || '')) {
    res.status(403).json({ success: false, error: 'Access denied', code: 'ERR_FORBIDDEN' })
    return
  }

  res.json({
    success: true,
    data: {
      brief,
      jobDraft: {
        title: brief.title,
        description: brief.description,
        tags: brief.required_skills,
        budget: brief.budget_range,
        timeline: brief.timeline,
        linkedJobId: brief.linked_job_id || null,
        visibility: 'private'
      }
    }
  })
})

export default router
