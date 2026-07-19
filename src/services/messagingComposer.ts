/**
 * Shared messaging composer / action policy helpers for full /messages and dock parity.
 * Pure utilities only — no network side effects.
 */
import type { Message, UploadedFile } from '../types';

export const MESSAGE_UPLOAD_ACCEPT =
  'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar';

export const MESSAGE_MEDIA_ACCEPT = 'image/*,video/*';
export const MESSAGE_CAMERA_ACCEPT = 'image/*,video/*';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const DEFAULT_MAX_VOICE_NOTE_SECONDS = 180;
export const DEFAULT_MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export type PendingComposerAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  mimeType?: string;
  url?: string;
  fileId?: string;
  category?: UploadedFile['category'];
  localObjectUrl?: string;
  /** Local client id for optimistic upload reconciliation */
  clientLocalId?: string;
  uploadState?: 'ready' | 'uploading' | 'failed' | 'cancelled';
  progress?: number;
  errorMessage?: string;
  /** Optional width/height for image progressive layout stability */
  width?: number;
  height?: number;
  durationMs?: number;
};

export type ComposerUploadProgress = {
  fileName: string;
  progress: number;
  uploadedCount: number;
  totalCount: number;
};

export const inferUploadCategory = (file: File): UploadedFile['category'] => {
  const mimeType = String(file?.type || '').toLowerCase();
  if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) return 'portfolio';
  return 'document';
};

export const formatAttachmentBytes = (bytes?: number | null): string => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1024) return `${Math.trunc(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export const isAllowedAttachmentSize = (
  size: number,
  maxBytes = DEFAULT_MAX_ATTACHMENT_BYTES
): boolean => {
  const value = Number(size);
  if (!Number.isFinite(value) || value <= 0) return false;
  return value <= maxBytes;
};

export const uploadedFileToPending = (file: UploadedFile): PendingComposerAttachment => {
  const id = String(file.id || file.fileId || '').trim();
  return {
    id,
    fileId: id,
    name: String(file.name || 'Attachment'),
    size: Number(file.size || 0) || 0,
    type: String((file as any).type || file.category || 'document'),
    mimeType: String((file as any).mimeType || (file as any).mime_type || ''),
    url: String(file.url || ''),
    category: file.category,
    uploadState: 'ready',
    progress: 100
  };
};

export const pendingToAttachmentIds = (items: PendingComposerAttachment[]): string[] =>
  (Array.isArray(items) ? items : [])
    .filter((item) => item.uploadState !== 'failed' && item.uploadState !== 'cancelled' && item.uploadState !== 'uploading')
    .map((item) => String(item.fileId || (item.uploadState === 'ready' ? item.id : '') || '').trim())
    .filter(Boolean);

export const createLocalPendingAttachment = (file: File, nowMs = Date.now()): PendingComposerAttachment => {
  const clientLocalId = `local-upload-${nowMs}-${Math.random().toString(36).slice(2, 9)}`;
  const mimeType = String(file?.type || '');
  let localObjectUrl: string | undefined;
  try {
    localObjectUrl = URL.createObjectURL(file);
  } catch {
    localObjectUrl = undefined;
  }
  return {
    id: clientLocalId,
    clientLocalId,
    name: String(file?.name || 'Attachment'),
    size: Number(file?.size || 0) || 0,
    type: mimeType || inferUploadCategory(file),
    mimeType,
    category: inferUploadCategory(file),
    localObjectUrl,
    url: localObjectUrl,
    uploadState: 'uploading',
    progress: 0
  };
};

export const hasPendingUploadsInFlight = (items: PendingComposerAttachment[]): boolean =>
  (Array.isArray(items) ? items : []).some((item) => item.uploadState === 'uploading');

export const hasFailedPendingUploads = (items: PendingComposerAttachment[]): boolean =>
  (Array.isArray(items) ? items : []).some((item) => item.uploadState === 'failed');

export const arePendingAttachmentsReadyToSend = (items: PendingComposerAttachment[]): boolean => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return true;
  if (hasPendingUploadsInFlight(list) || hasFailedPendingUploads(list)) return false;
  return pendingToAttachmentIds(list).length === list.filter((i) => i.uploadState !== 'cancelled').length;
};

export const updatePendingAttachment = (
  items: PendingComposerAttachment[],
  clientLocalId: string,
  patch: Partial<PendingComposerAttachment>
): PendingComposerAttachment[] => {
  const id = String(clientLocalId || '').trim();
  if (!id) return items;
  return (Array.isArray(items) ? items : []).map((item) => {
    const key = String(item.clientLocalId || item.id || '');
    if (key !== id) return item;
    return { ...item, ...patch };
  });
};

export const reconcilePendingWithUploadedFile = (
  items: PendingComposerAttachment[],
  clientLocalId: string,
  file: UploadedFile
): PendingComposerAttachment[] => {
  const uploaded = uploadedFileToPending(file);
  return updatePendingAttachment(items, clientLocalId, {
    ...uploaded,
    clientLocalId,
    localObjectUrl: items.find((i) => String(i.clientLocalId || i.id) === clientLocalId)?.localObjectUrl,
    uploadState: 'ready',
    progress: 100,
    errorMessage: undefined
  });
};

/** Parallelism cap for background attachment uploads (mobile-friendly). */
export const MESSAGE_UPLOAD_CONCURRENCY = 3;

export const runWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> => {
  const list = Array.isArray(items) ? items : [];
  const results: PromiseSettledResult<R>[] = new Array(list.length);
  let nextIndex = 0;
  const limit = Math.max(1, Math.min(concurrency || 1, list.length || 1));

  const runNext = async (): Promise<void> => {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= list.length) return;
    try {
      const value = await worker(list[index], index);
      results[index] = { status: 'fulfilled', value };
    } catch (reason) {
      results[index] = { status: 'rejected', reason };
    }
    await runNext();
  };

  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, () => runNext()));
  return results;
};

/** Isolate pending attachments by conversation id (no cross-thread leakage). */
export const setPendingAttachmentsForConversation = (
  map: Record<string, PendingComposerAttachment[]>,
  conversationId: string,
  items: PendingComposerAttachment[]
): Record<string, PendingComposerAttachment[]> => {
  const id = String(conversationId || '').trim();
  if (!id) return map;
  return { ...map, [id]: Array.isArray(items) ? items : [] };
};

export const getPendingAttachmentsForConversation = (
  map: Record<string, PendingComposerAttachment[]>,
  conversationId: string
): PendingComposerAttachment[] => {
  const id = String(conversationId || '').trim();
  if (!id) return [];
  return Array.isArray(map[id]) ? map[id] : [];
};

/**
 * Phase 22.1 — unique client message identity for optimistic UI + server idempotency.
 * Format remains `optimistic-…` so existing isOptimisticMessageId checks keep working.
 */
export const buildClientSendId = (conversationId: string, nowMs = Date.now()): string => {
  const id = String(conversationId || '').trim() || 'conversation';
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `optimistic-${id}-${nowMs}-${rand}`;
};

/** Alias used by outbox / API contract docs. */
export const buildClientMessageId = buildClientSendId;

export const mergeEditResponseIntoMessage = (
  previous: Message,
  editPayload: Partial<Message> & { messageId?: string; editedAt?: string | null; edited_at?: string | null }
): Message => {
  const nextId = String(editPayload.id || editPayload.messageId || previous.id || '').trim();
  return {
    ...previous,
    ...editPayload,
    id: nextId || previous.id,
    text: String(editPayload.text ?? previous.text ?? ''),
    editedAt: editPayload.editedAt ?? editPayload.edited_at ?? previous.editedAt ?? previous.edited_at,
    edited_at: editPayload.edited_at ?? editPayload.editedAt ?? previous.edited_at ?? previous.editedAt
  } as Message;
};

export const canEditOrUnsendMessage = (
  message: Message | null | undefined,
  currentUserId?: string | null,
  currentUserRole?: string | null
): boolean => {
  if (!message) return false;
  if (Boolean(message.isDeleted ?? message.is_deleted)) return false;
  const senderId = String(message.senderId || message.sender_id || '').trim();
  const me = String(currentUserId || '').trim();
  const role = String(currentUserRole || '').toLowerCase();
  if (role === 'admin') return true;
  return Boolean(me && senderId && me === senderId);
};

export const canDeleteForMe = (message: Message | null | undefined): boolean => {
  if (!message) return false;
  return !Boolean(message.isDeleted ?? message.is_deleted);
};

export const isFailedOutgoingMessage = (message: Message | null | undefined): boolean => {
  if (!message) return false;
  const meta = message.metadata && typeof message.metadata === 'object' ? (message.metadata as any) : null;
  return Boolean(meta?.sendFailed);
};

export const isOptimisticMessageId = (messageId?: string | null): boolean => {
  const id = String(messageId || '').trim();
  return id.startsWith('optimistic-') || id.startsWith('temp-');
};

export const getReactionCounts = (message: Message | null | undefined): Record<string, number> => {
  const reactions = Array.isArray(message?.reactions) ? message!.reactions : [];
  return reactions.reduce((acc: Record<string, number>, reaction: any) => {
    const emoji = String(reaction?.emoji || '').trim();
    if (!emoji) return acc;
    acc[emoji] = (acc[emoji] || 0) + 1;
    return acc;
  }, {});
};

export const getMyReaction = (
  message: Message | null | undefined,
  currentUserId?: string | null
): string | null => {
  const me = String(currentUserId || '').trim();
  if (!me) return null;
  const reactions = Array.isArray(message?.reactions) ? message!.reactions : [];
  const mine = reactions.find(
    (reaction: any) => String(reaction?.userId || reaction?.user_id || '').trim() === me
  );
  return mine ? String(mine.emoji || '').trim() || null : null;
};

export const applyLocalReactionToggle = (
  message: Message,
  currentUserId: string,
  emoji: string
): Message => {
  const me = String(currentUserId || '').trim();
  const nextEmoji = String(emoji || '').trim();
  if (!me || !nextEmoji) return message;
  const reactions = Array.isArray(message.reactions) ? [...message.reactions] : [];
  const existing = reactions.find(
    (reaction: any) => String(reaction?.userId || reaction?.user_id || '').trim() === me
  );
  const withoutMine = reactions.filter(
    (reaction: any) => String(reaction?.userId || reaction?.user_id || '').trim() !== me
  );
  if (existing && String(existing.emoji || '') === nextEmoji) {
    return { ...message, reactions: withoutMine };
  }
  return {
    ...message,
    reactions: [
      ...withoutMine,
      {
        user_id: me,
        userId: me,
        emoji: nextEmoji,
        timestamp: new Date().toISOString()
      }
    ]
  };
};

export const markMessageDeletedEveryone = (message: Message): Message => ({
  ...message,
  text: '[Message deleted]',
  attachments: [],
  isDeleted: true,
  is_deleted: true,
  deletedAt: new Date().toISOString(),
  deleted_at: new Date().toISOString()
});

export const insertSuggestionIntoDraft = (
  currentDraft: string,
  suggestion: string,
  mode: 'replace' | 'append' = 'replace'
): string => {
  const next = String(suggestion || '').trim();
  if (!next) return String(currentDraft || '');
  if (mode === 'append') {
    const base = String(currentDraft || '').trimEnd();
    return base ? `${base}\n${next}` : next;
  }
  return next;
};

export const revokePendingObjectUrls = (items: PendingComposerAttachment[]): void => {
  (Array.isArray(items) ? items : []).forEach((item) => {
    const url = String(item.localObjectUrl || '').trim();
    if (url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
  });
};
