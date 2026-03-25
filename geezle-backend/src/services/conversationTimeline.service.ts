import { Request } from 'express'
import prisma from '../utils/prismaClient'

const nowIso = () => new Date().toISOString()

const emitToUser = (req: Request, userId: string, event: string, payload: any) => {
  try {
    const ns = req.app.get('communityNs')
    if (ns && typeof ns.to === 'function') {
      ns.to(`community:user:${userId}`).emit(event, payload)
    }
  } catch (error) {
    console.warn('[conversationTimeline] emit failed', error)
  }
}

const resolvePreviewText = (input: {
  eventType: string
  title?: string
  proposalId?: string
  contractId?: string
}) => {
  const title = String(input.title || '').trim()
  if (input.eventType === 'brief_created') return title ? `Brief created: ${title}` : 'Brief created'
  if (input.eventType === 'brief_updated') return title ? `Brief updated: ${title}` : 'Brief updated'
  if (input.eventType === 'proposal_created') return title ? `Proposal created for ${title}` : 'Proposal created'
  if (input.eventType === 'contract_created') return title ? `Contract created: ${title}` : 'Contract created'
  return title || 'Deal flow update'
}

export const appendConversationTimelineEvent = async (
  req: Request,
  input: {
    conversationId: string
    actorUserId: string
    eventType: string
    text?: string
    metadata: Record<string, any>
    previewText?: string
  }
) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    include: { participants: true }
  })
  if (!conversation) {
    throw new Error('Conversation not found')
  }

  const message = await prisma.directMessage.create({
    data: {
      conversationId: conversation.id,
      senderId: input.actorUserId,
      text: String(input.text || '').trim(),
      messageType: 'SYSTEM',
      isSystem: true,
      metadata: {
        dealFlow: {
          ...(input.metadata || {}),
          eventType: input.eventType
        }
      } as any,
      attachments: []
    }
  })

  const previewText =
    String(input.previewText || '').trim() ||
    resolvePreviewText({
      eventType: input.eventType,
      title: input.metadata?.title,
      proposalId: input.metadata?.proposalId,
      contractId: input.metadata?.contractId
    })

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageText: previewText,
      lastMessageAt: message.createdAt,
      lastMessageSenderId: input.actorUserId
    }
  })

  const receiverIds = conversation.participants
    .map((participant) => String(participant.userId || '').trim())
    .filter(Boolean)

  const payload = {
    id: message.id,
    conversation_id: conversation.id,
    sender_id: input.actorUserId,
    receiver_id: '',
    text: message.text,
    timestamp: message.createdAt ? message.createdAt.toISOString() : nowIso(),
    is_read: false,
    is_deleted: false,
    isDeleted: false,
    deleted_at: null,
    deletedAt: null,
    edited_at: null,
    editedAt: null,
    reactions: [],
    attachments: [],
    attachment_ids: [],
    message_type: 'system',
    messageType: 'system',
    metadata: {
      dealFlow: {
        ...(input.metadata || {}),
        eventType: input.eventType
      }
    },
    reply_to_message_id: null,
    replyToMessageId: null,
    reply_to_snapshot: null,
    replyToSnapshot: null,
    reply_to: null,
    replyTo: null
  }

  receiverIds.forEach((userId) => {
    if (userId === input.actorUserId) {
      emitToUser(req, userId, 'messages:sent', payload)
      return
    }
    emitToUser(req, userId, 'messages:new', payload)
  })

  return payload
}
