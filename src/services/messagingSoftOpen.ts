/**
 * Soft-open helpers for messaging surfaces (header / mobile shell).
 * Prefer in-place overlays on mobile home; when SPA navigation is required,
 * prefetch the messages chunk and avoid hard reloads.
 */

export type MessagingSoftOpenState = {
  softOpen: true;
  fromHeaderMessages?: boolean;
  fromMobileHome?: boolean;
  fromShellPath?: string;
};

/** True when navigation state indicates a soft header/shell open. */
export const isMessagingSoftOpenState = (state: unknown): state is MessagingSoftOpenState => {
  if (!state || typeof state !== 'object') return false;
  return Boolean((state as MessagingSoftOpenState).softOpen);
};

/** Prefetch the full /messages workspace chunk (best-effort). */
export const prefetchMessagesWorkspace = (): void => {
  void import('../messages/Messages').catch(() => undefined);
};

export const buildMessagesConversationPath = (conversationId: string): string => {
  const id = String(conversationId || '').trim();
  if (!id) return '/messages';
  return `/messages/${encodeURIComponent(id)}`;
};

export const buildMessagingSoftOpenState = (options?: {
  fromHeaderMessages?: boolean;
  fromMobileHome?: boolean;
  fromShellPath?: string;
}): MessagingSoftOpenState => ({
  softOpen: true,
  fromHeaderMessages: Boolean(options?.fromHeaderMessages),
  fromMobileHome: Boolean(options?.fromMobileHome),
  ...(options?.fromShellPath ? { fromShellPath: options.fromShellPath } : {})
});
