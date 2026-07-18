/**
 * Predictive conversation media preloading with device-condition gates.
 */

import {
  extractMessageAttachments,
  type NormalizedMessageAttachment
} from '../messagingMedia';
import { enqueueMediaDownload } from './mediaDownloadEngine';
import { getDeviceMediaConditions } from './deviceMediaConditions';
import { incrementMessagingCounter } from './messagingTelemetry';

export const preloadConversationMedia = async (params: {
  conversationId: string;
  messages: any[];
  maxItems?: number;
  priority?: 'high' | 'normal' | 'low';
}) => {
  const conditions = getDeviceMediaConditions();
  if (!conditions.allowPreload) {
    incrementMessagingCounter('preload_skipped_conditions');
    return 0;
  }

  const maxItems = Math.max(1, Math.min(24, params.maxItems || 8));
  const messages = Array.isArray(params.messages) ? params.messages.slice(-40) : [];
  const attachments: NormalizedMessageAttachment[] = [];
  const seen = new Set<string>();

  for (let i = messages.length - 1; i >= 0 && attachments.length < maxItems; i -= 1) {
    const list = extractMessageAttachments(messages[i]);
    for (const attachment of list) {
      if (!attachment.canPreview) continue;
      if (attachment.type === 'video' && conditions.metered) continue;
      const key = attachment.fileId || attachment.url || attachment.id;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      attachments.push(attachment);
      if (attachments.length >= maxItems) break;
    }
  }

  let enqueued = 0;
  for (const attachment of attachments) {
    try {
      void enqueueMediaDownload({
        attachment,
        conversationId: params.conversationId,
        priority: params.priority === 'high' ? 'high' : 'low'
      });
      enqueued += 1;
    } catch {
      // ignore
    }
  }
  if (enqueued) incrementMessagingCounter('preload_enqueued', enqueued);
  return enqueued;
};

export const preloadConversationAvatars = (urls: string[]) => {
  const conditions = getDeviceMediaConditions();
  if (!conditions.allowPreload || typeof Image === 'undefined') return 0;
  let count = 0;
  (Array.isArray(urls) ? urls : [])
    .map((url) => String(url || '').trim())
    .filter(Boolean)
    .slice(0, 12)
    .forEach((url) => {
      try {
        const img = new Image();
        img.decoding = 'async';
        img.loading = 'eager';
        img.src = url;
        count += 1;
      } catch {
        // ignore
      }
    });
  return count;
};
