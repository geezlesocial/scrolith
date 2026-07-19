/**
 * Phase 20.7.7 — Shared conversation last-message preview formatter.
 * Used by Messages inbox, Messaging Dock, merge/normalize, sockets, search rows.
 */

export type ConversationPreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'pdf'
  | 'document'
  | 'file'
  | 'attachments'
  | 'text'
  | 'deleted'
  | 'empty'
  | 'processing'
  | 'failed'
  | 'system'
  | 'message';

export type ConversationPreviewResult = {
  text: string;
  kind: ConversationPreviewKind;
  icon: ConversationPreviewKind;
  isOwnMessage: boolean;
  isDeleted: boolean;
  attachmentCount: number;
  /** True when conversation has no visible latest message. */
  isEmpty: boolean;
};

/** Canonical localization keys / English defaults. */
export const MESSAGE_PREVIEW_KEYS = {
  image: 'messages.preview.image',
  video: 'messages.preview.video',
  audio: 'messages.preview.audio',
  voice: 'messages.preview.voice',
  pdf: 'messages.preview.pdf',
  document: 'messages.preview.document',
  file: 'messages.preview.file',
  attachments: 'messages.preview.attachments',
  deleted: 'messages.preview.deleted',
  empty: 'messages.preview.empty',
  processing: 'messages.preview.processing',
  failed: 'messages.preview.failed',
  message: 'messages.preview.message'
} as const;

export const MESSAGE_PREVIEW_DEFAULTS: Record<keyof typeof MESSAGE_PREVIEW_KEYS, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  voice: 'Voice message',
  pdf: 'PDF document',
  document: 'Document',
  file: 'File',
  attachments: 'Attachments',
  deleted: 'This message was deleted',
  empty: 'No messages',
  processing: 'Attachment processing',
  failed: 'Upload failed',
  message: 'Message'
};

const DOCUMENT_EXT = /\.(docx?|xlsx?|pptx?|txt|csv|md|rtf|json)$/i;

const safeString = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) return fallback;
  return String(value);
};

export const normalizePreviewWhitespace = (value: unknown, maxLen = 160): string => {
  const collapsed = safeString(value)
    .replace(/\u0000/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!collapsed) return '';
  if (collapsed.length <= maxLen) return collapsed;
  let end = maxLen;
  if (end < collapsed.length) {
    const code = collapsed.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  }
  return `${collapsed.slice(0, Math.max(1, end))}…`;
};

export const classifyAttachmentKind = (input: {
  mimeType?: string | null;
  type?: string | null;
  name?: string | null;
  kind?: string | null;
  messageType?: string | null;
}): ConversationPreviewKind => {
  const mime = safeString(input.mimeType || input.type || input.kind).toLowerCase();
  const name = safeString(input.name).toLowerCase();
  const messageType = safeString(input.messageType).toLowerCase();

  if (messageType === 'voice_note' || messageType === 'voice' || mime === 'voice_note') return 'voice';
  if (mime.startsWith('image/') || mime === 'image') return 'image';
  if (mime.startsWith('video/') || mime === 'video') return 'video';
  if (mime.startsWith('audio/') || mime === 'audio') return 'audio';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (
    mime.includes('word') ||
    mime.includes('sheet') ||
    mime.includes('presentation') ||
    mime.startsWith('text/') ||
    DOCUMENT_EXT.test(name)
  ) {
    return 'document';
  }
  if (mime || name) return 'file';
  return 'file';
};

const labelFor = (kind: ConversationPreviewKind, count = 1): string => {
  if (count > 1) {
    if (kind === 'image') return `${count} images`;
    if (kind === 'video') return `${count} videos`;
    if (kind === 'file' || kind === 'document' || kind === 'pdf') return `${count} files`;
    return MESSAGE_PREVIEW_DEFAULTS.attachments;
  }
  switch (kind) {
    case 'image':
      return MESSAGE_PREVIEW_DEFAULTS.image;
    case 'video':
      return MESSAGE_PREVIEW_DEFAULTS.video;
    case 'audio':
      return MESSAGE_PREVIEW_DEFAULTS.audio;
    case 'voice':
      return MESSAGE_PREVIEW_DEFAULTS.voice;
    case 'pdf':
      return MESSAGE_PREVIEW_DEFAULTS.pdf;
    case 'document':
      return MESSAGE_PREVIEW_DEFAULTS.document;
    case 'file':
      return MESSAGE_PREVIEW_DEFAULTS.file;
    case 'attachments':
      return MESSAGE_PREVIEW_DEFAULTS.attachments;
    case 'processing':
      return MESSAGE_PREVIEW_DEFAULTS.processing;
    case 'failed':
      return MESSAGE_PREVIEW_DEFAULTS.failed;
    case 'deleted':
      return MESSAGE_PREVIEW_DEFAULTS.deleted;
    case 'empty':
      return MESSAGE_PREVIEW_DEFAULTS.empty;
    default:
      return MESSAGE_PREVIEW_DEFAULTS.message;
  }
};

const collectKinds = (message: any): ConversationPreviewKind[] => {
  const messageType = safeString(message?.messageType ?? message?.message_type).toLowerCase();
  if (messageType === 'voice_note' || message?.voiceNote || message?.voice_note) {
    return ['voice'];
  }
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  if (!attachments.length) {
    if (messageType === 'image') return ['image'];
    if (messageType === 'video') return ['video'];
    if (messageType === 'audio') return ['audio'];
    if (messageType === 'file') return ['file'];
    return [];
  }
  return attachments.map((entry: any) => {
    if (typeof entry === 'string') {
      if (messageType === 'image') return 'image' as ConversationPreviewKind;
      if (messageType === 'video') return 'video' as ConversationPreviewKind;
      if (messageType === 'voice_note') return 'voice' as ConversationPreviewKind;
      return 'file' as ConversationPreviewKind;
    }
    return classifyAttachmentKind({
      mimeType: entry?.mimeType ?? entry?.mime_type,
      type: entry?.type,
      name: entry?.name ?? entry?.fileName ?? entry?.filename ?? entry?.originalName,
      kind: entry?.kind,
      messageType
    });
  });
};

/**
 * Canonical preview formatter for a single latest message.
 * Neutral wording (Image / Video / …) for product consistency across Dock + Messages.
 */
export const formatConversationPreview = (input: {
  message?: any | null;
  currentUserId?: string | null;
  /** Stored conversation.last_message when message objects lack attachment detail */
  fallbackPreview?: string | null;
  maxLen?: number;
}): ConversationPreviewResult => {
  const { message, currentUserId, fallbackPreview, maxLen = 160 } = input;
  const fallback = normalizePreviewWhitespace(fallbackPreview, maxLen);
  const senderId = safeString(message?.senderId ?? message?.sender_id);
  const isOwnMessage = Boolean(currentUserId && senderId && senderId === String(currentUserId));

  if (!message) {
    if (fallback && fallback !== MESSAGE_PREVIEW_DEFAULTS.empty) {
      // Treat known attachment labels as non-empty
      return {
        text: fallback,
        kind: 'text',
        icon: 'message',
        isOwnMessage: false,
        isDeleted: false,
        attachmentCount: 0,
        isEmpty: false
      };
    }
    return {
      text: MESSAGE_PREVIEW_DEFAULTS.empty,
      kind: 'empty',
      icon: 'empty',
      isOwnMessage: false,
      isDeleted: false,
      attachmentCount: 0,
      isEmpty: true
    };
  }

  const isDeleted = Boolean(message?.isDeleted ?? message?.is_deleted ?? message?.deletedAt ?? message?.deleted_at);
  if (isDeleted) {
    return {
      text: MESSAGE_PREVIEW_DEFAULTS.deleted,
      kind: 'deleted',
      icon: 'deleted',
      isOwnMessage,
      isDeleted: true,
      attachmentCount: 0,
      isEmpty: false
    };
  }

  const meta = message?.metadata && typeof message.metadata === 'object' ? message.metadata : null;
  const uploadState = safeString(meta?.uploadState ?? meta?.attachmentStatus).toLowerCase();
  if (uploadState === 'failed' || uploadState === 'error') {
    return {
      text: MESSAGE_PREVIEW_DEFAULTS.failed,
      kind: 'failed',
      icon: 'failed',
      isOwnMessage,
      isDeleted: false,
      attachmentCount: 0,
      isEmpty: false
    };
  }
  if (uploadState === 'processing' || uploadState === 'uploading') {
    return {
      text: MESSAGE_PREVIEW_DEFAULTS.processing,
      kind: 'processing',
      icon: 'processing',
      isOwnMessage,
      isDeleted: false,
      attachmentCount: 0,
      isEmpty: false
    };
  }

  const text = normalizePreviewWhitespace(message?.text, maxLen);
  if (text) {
    return {
      text,
      kind: 'text',
      icon: 'text',
      isOwnMessage,
      isDeleted: false,
      attachmentCount: Array.isArray(message?.attachments) ? message.attachments.length : 0,
      isEmpty: false
    };
  }

  const kinds = collectKinds(message);
  if (kinds.length) {
    const unique = Array.from(new Set(kinds));
    const kind: ConversationPreviewKind = unique.length > 1 ? 'attachments' : unique[0];
    const label = labelFor(kind === 'attachments' ? 'attachments' : kind, kinds.length);
    return {
      text: label,
      kind,
      icon: kind,
      isOwnMessage,
      isDeleted: false,
      attachmentCount: kinds.length,
      isEmpty: false
    };
  }

  if (fallback && fallback !== MESSAGE_PREVIEW_DEFAULTS.empty) {
    return {
      text: fallback,
      kind: 'file',
      icon: 'file',
      isOwnMessage,
      isDeleted: false,
      attachmentCount: 0,
      isEmpty: false
    };
  }

  return {
    text: MESSAGE_PREVIEW_DEFAULTS.message,
    kind: 'message',
    icon: 'message',
    isOwnMessage,
    isDeleted: false,
    attachmentCount: 0,
    isEmpty: false
  };
};

/** Resolve display preview for a conversation row (inbox / dock / search). */
export const getConversationPreviewText = (
  conversation: any | null | undefined,
  options?: { currentUserId?: string | null; emptyLabel?: string }
): string => {
  if (!conversation) return options?.emptyLabel || MESSAGE_PREVIEW_DEFAULTS.empty;

  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const lastMessage = messages.length ? messages[messages.length - 1] : null;
  const stored = conversation.lastMessage ?? conversation.last_message ?? '';

  // Prefer recomputing from latest message (attachment-aware); fall back to stored preview.
  const result = formatConversationPreview({
    message: lastMessage,
    currentUserId: options?.currentUserId,
    fallbackPreview: stored
  });

  if (result.isEmpty) {
    // Stored preview may still hold "Image" when messages[] is truncated/empty in list payload
    const storedNorm = normalizePreviewWhitespace(stored);
    if (storedNorm && storedNorm !== MESSAGE_PREVIEW_DEFAULTS.empty) return storedNorm;
    return options?.emptyLabel || MESSAGE_PREVIEW_DEFAULTS.empty;
  }

  return result.text;
};

/** Attachment-aware preview for a message (socket / optimistic). */
export const getMessagePreviewText = (
  message: any | null | undefined,
  options?: { currentUserId?: string | null; fallbackPreview?: string | null }
): string => {
  return formatConversationPreview({
    message,
    currentUserId: options?.currentUserId,
    fallbackPreview: options?.fallbackPreview
  }).text;
};
