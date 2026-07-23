/**
 * Per-user chat appearance (background). Personal only — never shared with peers.
 */
import prisma from '../../utils/prismaClient';

export type ChatAppearance = {
  kind: 'none' | 'solid' | 'gradient' | 'pattern' | 'wallpaper' | 'photo';
  color?: string | null;
  colorEnd?: string | null;
  pattern?: string | null;
  fileId?: string | null;
  imageUrl?: string | null;
  opacity?: number;
  blurPx?: number;
  version?: number;
};

export const DEFAULT_CHAT_APPEARANCE: ChatAppearance = {
  kind: 'none',
  opacity: 1,
  blurPx: 0,
  version: 1
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const KINDS = new Set(['none', 'solid', 'gradient', 'pattern', 'wallpaper', 'photo']);

export const normalizeChatAppearance = (raw: unknown): ChatAppearance => {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const kind = String(src.kind || 'none').toLowerCase();
  const safeKind = (KINDS.has(kind) ? kind : 'none') as ChatAppearance['kind'];
  const color = src.color != null ? String(src.color).trim() : null;
  const colorEnd = src.colorEnd != null ? String(src.colorEnd).trim() : null;
  const pattern = src.pattern != null ? String(src.pattern).trim().slice(0, 64) : null;
  const fileId = src.fileId != null ? String(src.fileId).trim().slice(0, 128) : null;
  const imageUrl = src.imageUrl != null ? String(src.imageUrl).trim().slice(0, 2048) : null;
  const opacity = Math.min(1, Math.max(0.15, Number(src.opacity ?? 1) || 1));
  const blurPx = Math.min(40, Math.max(0, Math.floor(Number(src.blurPx ?? 0) || 0)));

  if (color && !HEX.test(color) && !/^rgb/i.test(color) && !/^hsl/i.test(color)) {
    throw new Error('Invalid background color');
  }
  if (colorEnd && !HEX.test(colorEnd) && !/^rgb/i.test(colorEnd) && !/^hsl/i.test(colorEnd)) {
    throw new Error('Invalid gradient end color');
  }
  if (imageUrl && !/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith('/')) {
    throw new Error('Invalid background image URL');
  }

  return {
    kind: safeKind,
    color: color || null,
    colorEnd: colorEnd || null,
    pattern: pattern || null,
    fileId: fileId || null,
    imageUrl: imageUrl || null,
    opacity,
    blurPx,
    version: 1
  };
};

export const getChatAppearance = async (
  conversationId: string,
  userId: string
): Promise<ChatAppearance> => {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { deletedAt: true, chatAppearanceJson: true } as any
  });
  if (!participant || (participant as any).deletedAt) {
    throw Object.assign(new Error('Conversation not found'), { code: 'NOT_FOUND', status: 404 });
  }
  const raw = (participant as any).chatAppearanceJson;
  if (!raw) return { ...DEFAULT_CHAT_APPEARANCE };
  try {
    return normalizeChatAppearance(raw);
  } catch {
    return { ...DEFAULT_CHAT_APPEARANCE };
  }
};

export const setChatAppearance = async (
  conversationId: string,
  userId: string,
  appearance: unknown
): Promise<ChatAppearance> => {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } }
  });
  if (!participant || participant.deletedAt) {
    throw Object.assign(new Error('Conversation not found'), { code: 'NOT_FOUND', status: 404 });
  }
  const next = normalizeChatAppearance(appearance);
  await prisma.conversationParticipant.update({
    where: { id: participant.id },
    data: { chatAppearanceJson: next as any } as any
  });
  return next;
};

export const resetChatAppearance = async (
  conversationId: string,
  userId: string
): Promise<ChatAppearance> => {
  return setChatAppearance(conversationId, userId, DEFAULT_CHAT_APPEARANCE);
};
