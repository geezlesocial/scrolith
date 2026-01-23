
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MessagingService } from '../services/messaging';
import { Conversation, Message, UserRole } from '../types';
import { Send, Image as ImageIcon, Smile, MoreVertical, ArrowLeft, Sparkles, Loader2, Check, Trash2, ShieldAlert } from 'lucide-react';
import { AIService } from '../services/ai/ai.service';
import { useUser } from '../context/UserContext';
import { useMessages } from '../context/MessageContext';

const Messages = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const { refreshMessages } = useMessages();
  
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messageInput, setMessageInput] = useState('');
  
  // Advanced Features State
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [isGettingAiSuggestion, setIsGettingAiSuggestion] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load Conversations
  useEffect(() => {
      if (user) {
          MessagingService.getAllConversations(user.id, user.role).then(setConversations);
      }
  }, [user]);

  // Handle URL param for deep linking
  useEffect(() => {
      if (conversationId && conversations.length > 0) {
          const exists = conversations.find(c => c.id === conversationId);
          if (exists) {
              setActiveConvoId(conversationId);
              // Mark as read when opening
              if (user) {
                  MessagingService.markAsRead(conversationId, user.id).then(() => {
                      refreshMessages();
                      // Update local state to reflect read status
                      setConversations(prev => prev.map(c => 
                          c.id === conversationId ? { ...c, unreadCount: 0 } : c
                      ));
                  });
              }
          }
      }
  }, [conversationId, conversations.length, user]);

  // Auto-scroll to bottom
  useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConvoId, typingUser, conversations]); 

  const activeConvo = conversations.find(c => c.id === activeConvoId);

  // Simulate typing indicator from other user (Real-time Simulation)
  useEffect(() => {
      if (activeConvoId) {
          const timer = setInterval(() => {
              // 20% chance to show typing if not me
              if (Math.random() > 0.8) {
                  const otherUser = activeConvo?.participants.find(p => p.id !== user?.id)?.name;
                  setTypingUser(otherUser || 'Someone');
                  setTimeout(() => setTypingUser(null), 3000);
              }
          }, 8000);
          return () => clearInterval(timer);
      }
  }, [activeConvoId, activeConvo, user]);

  const handleConversationClick = (id: string) => {
      navigate(`/messages/${id}`);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!messageInput.trim() || !activeConvoId || !user) return;

      try {
          const newMessage = await MessagingService.sendMessage(
              activeConvoId, 
              user.id, 
              messageInput, 
              user.role
          );

          setConversations(prev => prev.map(c => {
              if (c.id === activeConvoId) {
                  return {
                      ...c,
                      messages: [...c.messages, newMessage],
                      lastMessage: messageInput,
                      lastMessageAt: new Date().toISOString()
                  };
              }
              return c;
          }));
          
          setMessageInput('');
          setIsTyping(false);
          refreshMessages(); 
      } catch (error) {
          console.error("Failed to send message", error);
          alert("Failed to send message");
      }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
      if (!activeConvoId || !user) return;
      
      // Optimistic UI Update
      setConversations(prev => prev.map(c => {
          if (c.id === activeConvoId) {
              const updatedMessages = c.messages.map(m => {
                  if (m.id === messageId) {
                      const reactions = m.reactions || [];
                      const existingIdx = reactions.findIndex(r => r.userId === user.id && r.emoji === emoji);
                      let newReactions = [];
                      if (existingIdx >= 0) {
                          newReactions = reactions.filter((_, i) => i !== existingIdx);
                      } else {
                          newReactions = [...reactions, { userId: user.id, emoji, timestamp: new Date().toISOString() }];
                      }
                      return { ...m, reactions: newReactions };
                  }
                  return m;
              });
              return { ...c, messages: updatedMessages };
          }
          return c;
      }));
      setShowReactionPicker(null);

      // Persist
      await MessagingService.toggleReaction(activeConvoId, messageId, user.id, emoji);
  };

  const handleAiSuggest = async () => {
      if (!activeConvo || !user) return;
      setIsGettingAiSuggestion(true);
      
      try {
          const history = activeConvo.messages.slice(-5).map(m => ({
              sender: m.senderId === user.id ? 'Me' : 'Other',
              text: m.text
          }));

          const response = await AIService.suggestReply({
              history,
              userRole: user.role
          });

          if (response.suggestion) {
              setMessageInput(response.suggestion);
          }
      } catch (error) {
          console.error("AI Suggestion failed");
      } finally {
          setIsGettingAiSuggestion(false);
      }
  };

  const handleDeleteMessage = async (messageId: string) => {
      if (!activeConvoId) return;
      if (confirm("Are you sure you want to delete this message?")) {
          await MessagingService.deleteMessage(activeConvoId, messageId);
          setConversations(prev => prev.map(c => {
              if (c.id === activeConvoId) {
                  return { ...c, messages: c.messages.filter(m => m.id !== messageId) };
              }
              return c;
          }));
      }
  };

  const REACTION_EMOJIS = ['👍', '❤️', '😂', '👎', '🎉'];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 h-[calc(100vh-64px)]">
        <div className="bg-white shadow rounded-lg h-full flex overflow-hidden border border-gray-200">
            {/* Sidebar */}
            <div className={`w-full md:w-1/3 border-r border-gray-200 flex flex-col ${activeConvo ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">Messages</h2>
                    {user?.role === UserRole.ADMIN && <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded font-mono">ADMIN VIEW</span>}
                </div>
                <ul className="flex-1 overflow-y-auto">
                    {conversations.length === 0 ? (
                        <li className="p-4 text-center text-gray-500 text-sm">No conversations yet.</li>
                    ) : (
                        conversations.map((convo) => (
                            <li 
                                key={convo.id} 
                                onClick={() => handleConversationClick(convo.id)}
                                className={`p-4 border-b border-gray-100 cursor-pointer transition-colors ${
                                    activeConvoId === convo.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'hover:bg-gray-50'
                                }`}
                            >
                                <div className="flex items-center">
                                    <div className="relative">
                                        <img src={convo.participants.find(p => p.id !== user?.id)?.avatar} className="w-10 h-10 rounded-full mr-3 border border-gray-200 object-cover" alt="" />
                                        {convo.participants.find(p => p.id !== user?.id)?.isOnline && (
                                            <span className="absolute bottom-0 right-3 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline mb-1">
                                            <p className="text-sm font-bold text-gray-900 truncate">
                                                {convo.participants.find(p => p.id !== user?.id)?.name}
                                            </p>
                                            {convo.lastMessageAt && (
                                                <span className="text-[10px] text-gray-400">
                                                    {new Date(convo.lastMessageAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                </span>
                                            )}
                                        </div>
                                        <p className={`text-xs truncate ${convo.unreadCount > 0 ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
                                            {convo.lastMessage || <span className="italic text-gray-400">No messages</span>}
                                        </p>
                                    </div>
                                    {convo.unreadCount > 0 && (
                                        <span className="ml-2 inline-flex items-center justify-center w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full">
                                            {convo.unreadCount}
                                        </span>
                                    )}
                                </div>
                            </li>
                        ))
                    )}
                </ul>
            </div>
            
            {/* Chat Area */}
            <div className={`flex-1 flex flex-col bg-gray-50 ${!activeConvo ? 'hidden md:flex' : 'flex'}`}>
                {activeConvo ? (
                    <>
                        {/* Chat Header */}
                        <div className="p-4 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm">
                            <div className="flex items-center">
                                <button onClick={() => navigate('/messages')} className="md:hidden mr-3 text-gray-500">
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <img src={activeConvo.participants.find(p => p.id !== user?.id)?.avatar} className="w-8 h-8 rounded-full mr-3 object-cover" alt="" />
                                <div>
                                    <h3 className="font-bold text-gray-900 text-sm">{activeConvo.participants.find(p => p.id !== user?.id)?.name}</h3>
                                    <span className="text-xs text-green-500 flex items-center">● Online</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {user?.role === UserRole.ADMIN && (
                                    <button className="text-red-500 hover:bg-red-50 p-2 rounded" title="Admin Actions">
                                        <ShieldAlert className="w-5 h-5" />
                                    </button>
                                )}
                                <button className="text-gray-400 hover:text-gray-600"><MoreVertical className="w-5 h-5" /></button>
                            </div>
                        </div>

                        {/* Messages List */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {activeConvo.messages.map(msg => (
                                <div key={msg.id} className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'} group relative`}>
                                    
                                    {/* Admin Controls */}
                                    {user?.role === UserRole.ADMIN && (
                                        <button 
                                            onClick={() => handleDeleteMessage(msg.id)}
                                            className={`absolute top-1/2 -translate-y-1/2 p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity ${msg.senderId === user?.id ? 'left-[-30px]' : 'right-[-30px]'}`}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}

                                    {/* Message Bubble */}
                                    <div className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm text-sm relative ${
                                        msg.senderId === user?.id 
                                        ? 'bg-blue-600 text-white rounded-br-none' 
                                        : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                                    }`}>
                                        <p>{msg.text}</p>
                                        <div className={`text-[10px] mt-1 text-right flex justify-end items-center gap-1 ${msg.senderId === user?.id ? 'text-blue-100' : 'text-gray-400'}`}>
                                            {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            {msg.senderId === user?.id && (
                                                msg.isRead ? <div className="flex"><Check className="w-3 h-3"/><Check className="w-3 h-3 -ml-1"/></div> : <Check className="w-3 h-3" />
                                            )}
                                        </div>

                                        {/* Reactions Display */}
                                        {msg.reactions && msg.reactions.length > 0 && (
                                            <div className="absolute -bottom-3 right-0 flex -space-x-1">
                                                {msg.reactions.slice(0, 3).map((r, i) => (
                                                    <span key={i} className="bg-white rounded-full border border-gray-100 text-[10px] p-0.5 shadow-sm">{r.emoji}</span>
                                                ))}
                                                {msg.reactions.length > 3 && <span className="bg-white rounded-full border border-gray-100 text-[8px] p-0.5 px-1 shadow-sm">+{msg.reactions.length - 3}</span>}
                                            </div>
                                        )}
                                    </div>

                                    {/* Reaction Trigger */}
                                    <div className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center ${msg.senderId === user?.id ? 'left-0 -ml-8' : 'right-0 -mr-8'}`}>
                                        <div className="relative">
                                            <button 
                                                onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)}
                                                className="p-1 rounded-full hover:bg-gray-200 text-gray-400"
                                            >
                                                <Smile className="w-4 h-4" />
                                            </button>
                                            
                                            {/* Reaction Picker Popup */}
                                            {showReactionPicker === msg.id && (
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white rounded-full shadow-lg border border-gray-100 p-1 flex gap-1 z-10 animate-fade-in-up">
                                                    {REACTION_EMOJIS.map(emoji => (
                                                        <button 
                                                            key={emoji} 
                                                            onClick={() => handleReaction(msg.id, emoji)}
                                                            className="hover:scale-125 transition-transform p-1"
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            
                            {/* Typing Indicator */}
                            {typingUser && (
                                <div className="flex justify-start animate-fade-in">
                                    <div className="bg-gray-100 rounded-2xl rounded-bl-none px-4 py-2 text-xs text-gray-500 italic flex items-center">
                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce mr-1"></span>
                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce mr-1 delay-100"></span>
                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></span>
                                        <span className="ml-2">{typingUser} is typing...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-white border-t border-gray-200">
                            {/* AI Suggestion Bar */}
                            <div className="mb-2 flex justify-end">
                                <button 
                                    onClick={handleAiSuggest}
                                    disabled={isGettingAiSuggestion}
                                    className="flex items-center text-xs font-medium text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-full border border-purple-100 transition-colors shadow-sm disabled:opacity-50"
                                >
                                    {isGettingAiSuggestion ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Sparkles className="w-3 h-3 mr-2" />}
                                    {isGettingAiSuggestion ? 'Thinking...' : 'Suggest Reply'}
                                </button>
                            </div>

                            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                                <button type="button" className="text-gray-400 hover:text-blue-600 p-2"><ImageIcon className="w-5 h-5" /></button>
                                <input 
                                    type="text" 
                                    className="flex-1 border border-gray-300 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    placeholder="Type a message..."
                                    value={messageInput}
                                    onChange={e => {
                                        setMessageInput(e.target.value);
                                        setIsTyping(true);
                                        setTimeout(() => setIsTyping(false), 2000); 
                                    }}
                                />
                                <button type="submit" className="bg-blue-600 text-white p-2.5 rounded-full hover:bg-blue-700 transition-colors shadow-sm">
                                    <Send className="w-4 h-4" />
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                            <Smile className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="font-medium">Select a conversation to start messaging</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default Messages;
