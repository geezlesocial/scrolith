import { Request, Response } from 'express';

type Participant = {
  id: string;
  name: string;
  avatar?: string;
  role?: string;
  is_online?: boolean;
};

type MessageReaction = {
  user_id: string;
  emoji: string;
  timestamp: string;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  text: string;
  timestamp: string;
  is_read: boolean;
  reactions?: MessageReaction[];
};

type Conversation = {
  id: string;
  type: 'direct' | 'group';
  participants: Participant[];
  last_message: string;
  last_message_at: string;
  unread_count: number;
  messages: Message[];
};

const conversations: Conversation[] = [];

const nowIso = () => new Date().toISOString();

const resolveUserId = (req: Request) => {
  const userId = req.user?.id;
  if (typeof userId === 'string' && userId.length > 0) return userId;
  return (req.query.userId as string) || '';
};

const resolveRole = (req: Request) => {
  const role = req.user?.role;
  if (typeof role === 'string' && role.length > 0) return role.toLowerCase();
  return ((req.query.role as string) || '').toLowerCase();
};

const isAdminRole = (role: string) => role === 'admin' || role === 'superadmin';

const ensureConversation = (id: string) => conversations.find(c => c.id === id);

const updateConversationMeta = (conversation: Conversation) => {
  const last = conversation.messages[conversation.messages.length - 1];
  conversation.last_message = last ? last.text : '';
  conversation.last_message_at = last ? last.timestamp : '';
};

export const listConversations = (req: Request, res: Response) => {
  const role = resolveRole(req);
  const userId = resolveUserId(req);

  if (isAdminRole(role)) {
    return res.json({ success: true, data: conversations });
  }

  if (!userId) {
    return res.json({ success: true, data: [] });
  }

  const filtered = conversations.filter(convo =>
    convo.participants.some(p => p.id === userId)
  );
  return res.json({ success: true, data: filtered });
};

export const getConversation = (req: Request, res: Response) => {
  const conversation = ensureConversation(req.params.id);
  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found' });
  }
  return res.json({ success: true, data: conversation });
};

export const createConversation = (req: Request, res: Response) => {
  const participants = Array.isArray(req.body?.participants) ? req.body.participants : [];
  const id = `conv-${Date.now()}`;
  const conversation: Conversation = {
    id,
    type: participants.length > 2 ? 'group' : 'direct',
    participants,
    last_message: '',
    last_message_at: '',
    unread_count: 0,
    messages: []
  };
  conversations.unshift(conversation);
  return res.json({ success: true, data: { id } });
};

export const postMessage = (req: Request, res: Response) => {
  const conversation = ensureConversation(req.params.id);
  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found' });
  }

  const senderId = req.body?.senderId || '';
  const text = req.body?.text || '';
  const receiver = conversation.participants.find(p => p.id !== senderId);
  const message: Message = {
    id: `msg-${Date.now()}`,
    conversation_id: conversation.id,
    sender_id: senderId,
    receiver_id: receiver?.id || '',
    text,
    timestamp: nowIso(),
    is_read: false,
    reactions: []
  };

  conversation.messages.push(message);
  conversation.unread_count = conversation.unread_count + 1;
  updateConversationMeta(conversation);
  return res.json({ success: true, data: message });
};

export const markRead = (req: Request, res: Response) => {
  const conversation = ensureConversation(req.params.id);
  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found' });
  }

  conversation.messages = conversation.messages.map(msg => ({
    ...msg,
    is_read: true
  }));
  conversation.unread_count = 0;
  return res.json({ success: true });
};

export const toggleReaction = (req: Request, res: Response) => {
  const conversation = ensureConversation(req.params.id);
  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found' });
  }

  const { messageId } = req.params;
  const message = conversation.messages.find(m => m.id === messageId);
  if (!message) {
    return res.status(404).json({ success: false, error: 'Message not found' });
  }

  const userId = req.body?.userId || '';
  const emoji = req.body?.emoji || '';
  message.reactions = message.reactions || [];
  const existing = message.reactions.findIndex(r => r.user_id === userId && r.emoji === emoji);
  if (existing >= 0) {
    message.reactions.splice(existing, 1);
  } else {
    message.reactions.push({ user_id: userId, emoji, timestamp: nowIso() });
  }

  return res.json({ success: true });
};

export const deleteMessage = (req: Request, res: Response) => {
  const conversation = ensureConversation(req.params.id);
  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found' });
  }

  const { messageId } = req.params;
  conversation.messages = conversation.messages.filter(m => m.id !== messageId);
  updateConversationMeta(conversation);
  return res.json({ success: true });
};
