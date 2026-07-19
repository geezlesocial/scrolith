/**
 * Phase 20.7.7 — Shared last-message preview policy (server).
 * Used for inbox DTOs, conversation merge, and conversation.lastMessageText.
 * Never exposes storage keys or signed URLs.
 */

export type AttachmentPreviewKind =
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
  | 'system';

export type LastMessagePreviewResult = {
  text: string;
  kind: AttachmentPreviewKind;
  attachmentCount: number;
  isDeleted: boolean;
};

/** Localization keys (English defaults; CMS i18n can override later). */
export const MESSAGE_PREVIEW_LABELS = {
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
} as const;

const DOCUMENT_MIME = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/rtf'
]);

const normalizeWhitespace = (value: string, maxLen = 160): string => {
  const collapsed = String(value || '')
    .replace(/\u0000/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!collapsed) return '';
  if (collapsed.length <= maxLen) return collapsed;
  // Avoid splitting surrogate pairs mid-pair
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
}): AttachmentPreviewKind => {
  const mime = String(input.mimeType || input.type || input.kind || '').toLowerCase();
  const name = String(input.name || '').toLowerCase();
  const messageType = String(input.messageType || '').toLowerCase();

  if (messageType === 'voice_note' || messageType === 'voice' || mime === 'voice_note') {
    return 'voice';
  }
  if (mime.startsWith('image/') || mime === 'image') return 'image';
  if (mime.startsWith('video/') || mime === 'video') return 'video';
  if (mime.startsWith('audio/') || mime === 'audio') return 'audio';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (DOCUMENT_MIME.has(mime) || /\.(docx?|xlsx?|pptx?|txt|csv|md|rtf)$/i.test(name)) {
    return 'document';
  }
  if (mime || name) return 'file';
  return 'file';
};

const labelForKind = (kind: AttachmentPreviewKind, count = 1): string => {
  if (kind === 'attachments' || count > 1) {
    if (count > 1 && kind === 'image') return `${count} images`;
    if (count > 1 && kind === 'video') return `${count} videos`;
    if (count > 1 && kind === 'file') return `${count} files`;
    if (count > 1) return MESSAGE_PREVIEW_LABELS.attachments;
  }
  switch (kind) {
    case 'image':
      return MESSAGE_PREVIEW_LABELS.image;
    case 'video':
      return MESSAGE_PREVIEW_LABELS.video;
    case 'audio':
      return MESSAGE_PREVIEW_LABELS.audio;
    case 'voice':
      return MESSAGE_PREVIEW_LABELS.voice;
    case 'pdf':
      return MESSAGE_PREVIEW_LABELS.pdf;
    case 'document':
      return MESSAGE_PREVIEW_LABELS.document;
    case 'file':
      return MESSAGE_PREVIEW_LABELS.file;
    case 'processing':
      return MESSAGE_PREVIEW_LABELS.processing;
    case 'failed':
      return MESSAGE_PREVIEW_LABELS.failed;
    case 'deleted':
      return MESSAGE_PREVIEW_LABELS.deleted;
    case 'empty':
      return MESSAGE_PREVIEW_LABELS.empty;
    default:
      return MESSAGE_PREVIEW_LABELS.message;
  }
};

const collectAttachmentKinds = (message: any): AttachmentPreviewKind[] => {
  const messageType = String(message?.messageType || message?.message_type || '').toLowerCase();
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  if (!attachments.length) {
    if (messageType === 'voice_note' || message?.voiceNote || message?.voice_note) return ['voice'];
    if (messageType === 'image') return ['image'];
    if (messageType === 'video') return ['video'];
    if (messageType === 'audio') return ['audio'];
    if (messageType === 'file') return ['file'];
    return [];
  }

  return attachments.map((entry: any) => {
    if (typeof entry === 'string') {
      // Attachment ID only — use message type or generic file
      if (messageType === 'voice_note') return 'voice' as AttachmentPreviewKind;
      if (messageType === 'image') return 'image' as AttachmentPreviewKind;
      if (messageType === 'video') return 'video' as AttachmentPreviewKind;
      return 'file' as AttachmentPreviewKind;
    }
    return classifyAttachmentKind({
      mimeType: entry?.mimeType || entry?.mime_type,
      type: entry?.type,
      name: entry?.name || entry?.fileName || entry?.filename || entry?.originalName,
      kind: entry?.kind,
      messageType
    });
  });
};

/**
 * Format preview for a single message (or null when conversation is empty).
 */
export const formatLastMessagePreview = (
  message: any | null | undefined,
  options?: { fallbackStoredPreview?: string | null; maxLen?: number }
): LastMessagePreviewResult => {
  const maxLen = options?.maxLen ?? 160;
  const fallbackStored = normalizeWhitespace(String(options?.fallbackStoredPreview || ''), maxLen);

  if (!message) {
    if (fallbackStored) {
      return { text: fallbackStored, kind: 'text', attachmentCount: 0, isDeleted: false };
    }
    return { text: MESSAGE_PREVIEW_LABELS.empty, kind: 'empty', attachmentCount: 0, isDeleted: false };
  }

  const isDeleted = Boolean(message?.isDeleted ?? message?.is_deleted ?? message?.deletedAt ?? message?.deleted_at);
  if (isDeleted) {
    return {
      text: MESSAGE_PREVIEW_LABELS.deleted,
      kind: 'deleted',
      attachmentCount: 0,
      isDeleted: true
    };
  }

  const meta = message?.metadata && typeof message.metadata === 'object' ? message.metadata : null;
  const uploadState = String(meta?.uploadState || meta?.attachmentStatus || '').toLowerCase();
  if (uploadState === 'failed' || uploadState === 'error') {
    return {
      text: MESSAGE_PREVIEW_LABELS.failed,
      kind: 'failed',
      attachmentCount: 0,
      isDeleted: false
    };
  }
  if (uploadState === 'processing' || uploadState === 'uploading') {
    return {
      text: MESSAGE_PREVIEW_LABELS.processing,
      kind: 'processing',
      attachmentCount: 0,
      isDeleted: false
    };
  }

  const rawText = String(message?.text ?? '');
  const text = normalizeWhitespace(rawText, maxLen);
  if (text) {
    // Caption with attachments still prefers text
    return {
      text,
      kind: 'text',
      attachmentCount: Array.isArray(message?.attachments) ? message.attachments.length : 0,
      isDeleted: false
    };
  }

  const kinds = collectAttachmentKinds(message);
  if (kinds.length) {
    const unique = Array.from(new Set(kinds));
    let kind: AttachmentPreviewKind = unique[0];
    if (unique.length > 1) kind = 'attachments';
    else if (kinds.length > 1) kind = unique[0];
    const label = labelForKind(kind === 'attachments' ? 'attachments' : kind, kinds.length);
    return {
      text: label,
      kind: kind === 'attachments' ? 'attachments' : kind,
      attachmentCount: kinds.length,
      isDeleted: false
    };
  }

  // Stored conversation preview (e.g. "Sent an attachment") if message payload lacked attachment objects
  if (fallbackStored && fallbackStored !== MESSAGE_PREVIEW_LABELS.empty) {
    return { text: fallbackStored, kind: 'file', attachmentCount: 0, isDeleted: false };
  }

  return {
    text: MESSAGE_PREVIEW_LABELS.message,
    kind: 'text',
    attachmentCount: 0,
    isDeleted: false
  };
};

/** Value to persist on Conversation.lastMessageText (never null for media-only). */
export const resolveStoredLastMessageText = (message: any | null | undefined): string | null => {
  if (!message) return null;
  const preview = formatLastMessagePreview(message);
  if (preview.kind === 'empty') return null;
  return preview.text.slice(0, 240);
};
