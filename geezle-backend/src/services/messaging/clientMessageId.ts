/**
 * Phase 22.1 — parse and normalize clientMessageId from request bodies.
 */

const MAX_LEN = 128;

export const parseClientMessageId = (body: any, headers?: Record<string, any>): string | null => {
  const fromBody =
    body?.clientMessageId ??
    body?.client_message_id ??
    body?.clientSendId ??
    body?.client_send_id ??
    null;
  const fromHeader =
    headers?.['x-client-message-id'] ??
    headers?.['X-Client-Message-Id'] ??
    headers?.['x-client-send-id'] ??
    null;
  const raw = String(fromBody || fromHeader || '').trim();
  if (!raw) return null;
  if (raw.length > MAX_LEN) return raw.slice(0, MAX_LEN);
  // Reject path/control characters
  if (/[\u0000-\u001f]/.test(raw)) return null;
  return raw;
};
