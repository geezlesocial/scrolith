/**
 * Phase 32.3 — Rich notification action catalog for Android / push data payloads.
 * Actions reuse existing inbox/bulk APIs on the client.
 */

export type NotificationRichAction = {
  id: string;
  title: string;
  /** Client routes this to NotificationService / bulk APIs */
  apiAction?: 'read' | 'archive' | 'delete' | 'pin' | 'open';
  deepLink?: string | null;
  destructive?: boolean;
};

export function resolveRichActions(input: {
  type?: string | null;
  category?: string | null;
  deepLink?: string | null;
  conversationId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}): NotificationRichAction[] {
  const type = String(input.type || '').toLowerCase();
  const category = String(input.category || '').toLowerCase();
  const deepLink = input.deepLink || null;
  const actions: NotificationRichAction[] = [
    { id: 'mark_read', title: 'Mark Read', apiAction: 'read' },
    { id: 'archive', title: 'Archive', apiAction: 'archive' }
  ];

  const convId = input.conversationId || (category.includes('messag') || type.includes('message') ? input.entityId : null);
  if (convId || type.includes('message') || category.includes('messag')) {
    actions.unshift({
      id: 'open_conversation',
      title: 'Open Conversation',
      apiAction: 'open',
      deepLink: deepLink || (convId ? `/messages/${encodeURIComponent(String(convId))}` : '/messages')
    });
    if (type.includes('message') || category === 'messaging') {
      actions.push({
        id: 'reply',
        title: 'Reply',
        apiAction: 'open',
        deepLink: deepLink || (convId ? `/messages/${encodeURIComponent(String(convId))}?reply=1` : '/messages')
      });
    }
  } else if (type.includes('job') || category === 'jobs') {
    actions.unshift({
      id: 'view_job',
      title: 'View Job',
      apiAction: 'open',
      deepLink: deepLink || '/browse-jobs'
    });
  } else if (type.includes('market') || type.includes('order') || category === 'marketplace') {
    actions.unshift({
      id: 'view_order',
      title: 'View Order',
      apiAction: 'open',
      deepLink: deepLink || '/marketplace'
    });
  } else if (type.includes('wallet') || type.includes('payment') || category === 'wallet') {
    actions.unshift({
      id: 'view_wallet',
      title: 'View Wallet',
      apiAction: 'open',
      deepLink: deepLink || '/wallet'
    });
  } else if (type.includes('support') || category === 'support') {
    actions.unshift({
      id: 'view_support',
      title: 'Open Support',
      apiAction: 'open',
      deepLink: deepLink || '/support'
    });
  } else if (type.includes('security') || category === 'security') {
    actions.unshift({
      id: 'view_security',
      title: 'Security',
      apiAction: 'open',
      deepLink: deepLink || '/settings'
    });
  } else {
    actions.unshift({
      id: 'open',
      title: 'Open',
      apiAction: 'open',
      deepLink: deepLink || '/notifications'
    });
  }

  // Cap for payload size
  return actions.slice(0, 4);
}

export function serializeActionsForPush(actions: NotificationRichAction[]): string {
  try {
    return JSON.stringify(actions);
  } catch {
    return '[]';
  }
}
