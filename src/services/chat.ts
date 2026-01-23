import { MessagingService } from './messaging';

export const ChatService = {
  getConversations: MessagingService.getAllConversations,
  getConversationById: MessagingService.getConversationById,
  sendMessage: MessagingService.sendMessage,
  markAsRead: MessagingService.markAsRead,
  toggleReaction: MessagingService.toggleReaction,
  createConversation: MessagingService.createConversation,
  deleteMessage: MessagingService.deleteMessage
};

export default ChatService;
