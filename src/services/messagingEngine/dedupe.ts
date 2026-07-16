/**
 * Event / message deduplication for realtime messaging.
 * Bounded LRU-ish set prevents infinite growth.
 */

const DEFAULT_CAPACITY = 1200;

export class BoundedIdSet {
  private readonly ids = new Set<string>();
  private readonly order: string[] = [];
  private readonly capacity: number;

  constructor(capacity = DEFAULT_CAPACITY) {
    this.capacity = Math.max(1, capacity);
  }

  has(id: string): boolean {
    const key = String(id || '').trim();
    if (!key) return false;
    return this.ids.has(key);
  }

  /** Returns true if the id is new and was added. */
  add(id: string): boolean {
    const key = String(id || '').trim();
    if (!key) return false;
    if (this.ids.has(key)) return false;
    this.ids.add(key);
    this.order.push(key);
    this.evict();
    return true;
  }

  /** Mark seen without reporting novelty (e.g. local optimistic ids). */
  remember(id: string): void {
    const key = String(id || '').trim();
    if (!key || this.ids.has(key)) return;
    this.ids.add(key);
    this.order.push(key);
    this.evict();
  }

  clear(): void {
    this.ids.clear();
    this.order.length = 0;
  }

  size(): number {
    return this.ids.size;
  }

  private evict() {
    while (this.order.length > this.capacity) {
      const oldest = this.order.shift();
      if (oldest) this.ids.delete(oldest);
    }
  }
}

/**
 * Build a stable event fingerprint for socket payloads that may lack message ids.
 */
export const buildMessagingEventFingerprint = (payload: any): string => {
  if (!payload || typeof payload !== 'object') return '';
  const id = String(payload.id || payload.messageId || payload.message_id || '').trim();
  if (id) return `id:${id}`;
  const conversationId = String(
    payload.conversationId || payload.conversation_id || ''
  ).trim();
  const clientSendId = String(
    payload.clientSendId ||
      payload.client_send_id ||
      payload.metadata?.clientSendId ||
      payload.metadata?.client_send_id ||
      ''
  ).trim();
  if (conversationId && clientSendId) return `client:${conversationId}:${clientSendId}`;
  const sender = String(payload.senderId || payload.sender_id || '').trim();
  const ts = String(payload.timestamp || payload.createdAt || payload.created_at || '').trim();
  const text = String(payload.text || payload.body || '').slice(0, 80);
  if (conversationId && sender && ts) return `row:${conversationId}:${sender}:${ts}:${text}`;
  return '';
};
