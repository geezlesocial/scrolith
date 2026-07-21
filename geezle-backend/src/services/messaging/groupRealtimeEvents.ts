/**
 * Phase 29.2 — canonical Enterprise Messaging Groups realtime event catalog.
 * Wire events use existing `messages:*` conventions; executive aliases documented below.
 */

/** Wire event names (Socket.IO / community namespace) */
export const GROUP_WIRE_EVENTS = {
  // Lifecycle / policy
  GROUP_UPDATED: 'messages:group_updated',
  GROUP_LOCKED: 'messages:group_locked',
  GROUP_UNLOCKED: 'messages:group_unlocked',
  PERMISSIONS_UPDATED: 'messages:permissions_updated',
  // Membership
  MEMBER_JOINED: 'messages:member_joined',
  MEMBER_LEFT: 'messages:member_left',
  MEMBER_ROLE: 'messages:member_role',
  MEMBER_RESTRICTED: 'messages:member_restricted',
  // Invites / join requests
  INVITE_CREATED: 'messages:invite_created',
  INVITE_REVOKED: 'messages:invite_revoked',
  INVITE_UPDATED: 'messages:invite_updated',
  JOIN_REQUESTED: 'messages:join_requested',
  JOIN_APPROVED: 'messages:join_approved',
  JOIN_REJECTED: 'messages:join_rejected',
  // Messages (existing primary)
  MESSAGE_NEW: 'messages:new',
  MESSAGE_SENT: 'messages:sent',
  MESSAGE_UPDATED: 'messages:updated',
  MESSAGE_REACTION: 'messages:reaction',
  // Pins
  PIN_UPDATED: 'messages:pin_updated',
  // Ephemeral (existing)
  TYPING: 'messages:typing',
  RECORDING: 'messages:recording',
  // Receipts / conversation meta (existing)
  RECEIPTS: 'messages:receipts',
  READ: 'messages:read',
  CONVERSATION_UPDATED: 'messages:conversation_updated',
  CONVERSATION_DELETED: 'messages:conversation_deleted',
  // Room control acks
  GROUP_ROOM_JOINED: 'messages:group_room_joined',
  GROUP_ROOM_DENIED: 'messages:group_room_denied',
  // Send acks (socket send path)
  SEND_ACK: 'messages:send_ack',
  // Reconnect catch-up
  CATCHUP: 'messages:catchup',
  CATCHUP_ACK: 'messages:catchup_ack'
} as const;

export type GroupWireEvent = (typeof GROUP_WIRE_EVENTS)[keyof typeof GROUP_WIRE_EVENTS];

/**
 * Executive directive names → wire events (documentation + optional dual-emit flags).
 * Clients should subscribe to wire events; aliases are for product docs only.
 */
export const GROUP_EVENT_ALIASES: Record<string, string> = {
  'group.created': GROUP_WIRE_EVENTS.GROUP_UPDATED,
  'group.updated': GROUP_WIRE_EVENTS.GROUP_UPDATED,
  'group.deleted': GROUP_WIRE_EVENTS.CONVERSATION_DELETED,
  'group.archived': GROUP_WIRE_EVENTS.GROUP_UPDATED,
  'group.locked': GROUP_WIRE_EVENTS.GROUP_LOCKED,
  'group.unlocked': GROUP_WIRE_EVENTS.GROUP_UNLOCKED,
  'permissions.updated': GROUP_WIRE_EVENTS.PERMISSIONS_UPDATED,
  'member.joined': GROUP_WIRE_EVENTS.MEMBER_JOINED,
  'member.left': GROUP_WIRE_EVENTS.MEMBER_LEFT,
  'member.kicked': GROUP_WIRE_EVENTS.MEMBER_LEFT,
  'member.banned': GROUP_WIRE_EVENTS.MEMBER_RESTRICTED,
  'member.restricted': GROUP_WIRE_EVENTS.MEMBER_RESTRICTED,
  'invite.created': GROUP_WIRE_EVENTS.INVITE_CREATED,
  'invite.revoked': GROUP_WIRE_EVENTS.INVITE_REVOKED,
  'join.requested': GROUP_WIRE_EVENTS.JOIN_REQUESTED,
  'join.approved': GROUP_WIRE_EVENTS.JOIN_APPROVED,
  'join.rejected': GROUP_WIRE_EVENTS.JOIN_REJECTED,
  'message.sent': GROUP_WIRE_EVENTS.MESSAGE_NEW,
  'message.updated': GROUP_WIRE_EVENTS.MESSAGE_UPDATED,
  'message.deleted': GROUP_WIRE_EVENTS.MESSAGE_UPDATED,
  'reaction.created': GROUP_WIRE_EVENTS.MESSAGE_REACTION,
  'reaction.removed': GROUP_WIRE_EVENTS.MESSAGE_REACTION,
  'pin.created': GROUP_WIRE_EVENTS.PIN_UPDATED,
  'pin.removed': GROUP_WIRE_EVENTS.PIN_UPDATED,
  'typing.started': GROUP_WIRE_EVENTS.TYPING,
  'typing.stopped': GROUP_WIRE_EVENTS.TYPING,
  'recording.started': GROUP_WIRE_EVENTS.RECORDING,
  'recording.stopped': GROUP_WIRE_EVENTS.RECORDING
};

export const groupRoomName = (conversationId: string) =>
  `messages:group:${String(conversationId || '').trim()}`;

export type MessageSendAckStatus =
  | 'accepted'
  | 'rejected'
  | 'duplicate'
  | 'rate_limited'
  | 'permission_denied'
  | 'group_locked'
  | 'slow_mode'
  | 'content_type_disabled'
  | 'not_member'
  | 'blocked'
  | 'error';

export const mapGateToAckStatus = (code?: string, reason?: string): MessageSendAckStatus => {
  const c = String(code || '').toUpperCase();
  const r = String(reason || '').toLowerCase();
  if (c === 'GROUP_SLOW_MODE' || r.includes('slow_mode')) return 'slow_mode';
  if (c === 'GROUP_LOCKED' || r.includes('locked') || r.includes('archived')) return 'group_locked';
  if (c === 'GROUP_CONTENT_FORBIDDEN' || r.startsWith('content_')) return 'content_type_disabled';
  if (c === 'GROUP_NOT_MEMBER' || r.includes('not_member')) return 'not_member';
  if (c === 'MESSAGING_BLOCKED' || r.includes('block')) return 'blocked';
  if (r.includes('rate_limit')) return 'rate_limited';
  if (c === 'GROUP_PERMISSION_DENIED' || r.includes('permission')) return 'permission_denied';
  return 'rejected';
};

export const GROUP_REALTIME_EVENTS_VERSION = '29.2';
