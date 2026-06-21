
import React, { useState, useEffect, useRef } from 'react';
import { CommunityService } from '../services/community';
import { CommunityChannel, CommunityMessage } from '../types';
import { useUser } from '../context/UserContext';
import { Send, Hash, Lock, Users, Smile, MoreVertical, Search, AlertTriangle, Paperclip, Shield } from 'lucide-react';
import ReputationBadge from '../components/ReputationBadge';

const Chat = () => {
    const { user } = useUser();
    const [channels, setChannels] = useState<CommunityChannel[]>([]);
    const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
    const [messages, setMessages] = useState<CommunityMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        CommunityService.getChannels().then(data => {
            setChannels(data);
            if (data.length > 0) setActiveChannelId(data[0].id);
        });
    }, []);

    useEffect(() => {
        if (activeChannelId) {
            CommunityService.getMessages(activeChannelId).then(setMessages);
        }
    }, [activeChannelId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !activeChannelId || !user) return;

        // Optimistic update
        const tempMsg: CommunityMessage = {
            id: `temp-${Date.now()}`,
            channelId: activeChannelId,
            userId: user.id,
            userName: user.name,
            userAvatar: user.avatar,
            content: newMessage,
            timestamp: new Date().toISOString(),
            aiFlagged: false
        };
        setMessages([...messages, tempMsg]);
        setNewMessage('');

        // AI Moderation Check (Simulated)
        const moderation = await CommunityService.moderateContent(newMessage);
        if (!moderation.safe) {
            setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, aiFlagged: true, aiReason: moderation.reason } : m));
            return;
        }

        await CommunityService.sendMessage(activeChannelId, newMessage, user);
    };

    const activeChannel = channels.find(c => c.id === activeChannelId);

    return (
        <div className="flex h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Sidebar */}
            <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
                <div className="p-4 border-b border-gray-200">
                    <h2 className="font-bold text-gray-800 mb-2">Channels</h2>
                    <div className="relative">
                        <Search className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
                        <input className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white" placeholder="Search..." />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {channels.map(channel => (
                        <button
                            key={channel.id}
                            onClick={() => setActiveChannelId(channel.id)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                                activeChannelId === channel.id ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            <div className="flex items-center truncate">
                                {channel.isPaid ? <Lock className="w-4 h-4 mr-2 text-orange-500" /> : <Hash className="w-4 h-4 mr-2 opacity-50" />}
                                <span className="truncate">{channel.name}</span>
                            </div>
                            {channel.unreadCount > 0 && (
                                <span className="bg-blue-600 text-white text-[10px] px-1.5 rounded-full">{channel.unreadCount}</span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="p-4 border-t border-gray-200 bg-gray-100">
                    <div className="flex items-center text-xs text-gray-500">
                        <Users className="w-3 h-3 mr-1" /> {activeChannel?.onlineCount || 0} Online
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-white">
                    <div className="flex items-center">
                        <Hash className="w-5 h-5 text-gray-400 mr-2" />
                        <div>
                            <h3 className="font-bold text-gray-900">{activeChannel?.name || 'Select a Channel'}</h3>
                            <p className="text-xs text-gray-500">{activeChannel?.type === 'public' ? 'Public Community' : 'Exclusive Group'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {activeChannel?.isPaid && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded font-bold">PREMIUM</span>}
                        <button className="text-gray-400 hover:text-gray-600"><MoreVertical className="w-5 h-5" /></button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
                    {messages.map((msg, i) => {
                        const isMe = msg.userId === user?.id;
                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                {!isMe && <img src={msg.userAvatar} className="w-8 h-8 rounded-full mr-2 mt-1" />}
                                <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                                    {!isMe && (
                                        <div className="flex items-center mb-1 gap-2">
                                            <span className="text-xs font-bold text-gray-700">{msg.userName}</span>
                                            {/* Mock Score for now */}
                                            <ReputationBadge score={850} showScore={false} /> 
                                            <span className="text-[10px] text-gray-400">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                        </div>
                                    )}
                                    <div className={`p-3 rounded-lg text-sm shadow-sm ${
                                        msg.aiFlagged 
                                            ? 'bg-red-50 border border-red-200 text-gray-800' 
                                            : isMe ? 'bg-blue-600 text-white' : 'bg-white text-gray-800 border border-gray-100'
                                    }`}>
                                        {msg.aiFlagged ? (
                                            <div className="flex items-center text-red-600">
                                                <AlertTriangle className="w-4 h-4 mr-2" />
                                                <span className="italic text-xs">Message flagged by AI: {msg.aiReason}</span>
                                            </div>
                                        ) : msg.content}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="p-4 bg-white border-t border-gray-200">
                    <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
                        <button type="button" className="text-gray-400 hover:text-blue-600 p-2"><Paperclip className="w-5 h-5" /></button>
                        <input 
                            className="flex-1 border border-gray-300 rounded-full px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            placeholder={`Message #${activeChannel?.name || 'channel'}`}
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                        />
                        <button type="button" className="text-gray-400 hover:text-yellow-500 p-2"><Smile className="w-5 h-5" /></button>
                        <button type="submit" className="bg-blue-600 text-white p-2.5 rounded-full hover:bg-blue-700 shadow-sm transition">
                            <Send className="w-4 h-4" />
                        </button>
                    </form>
                    <div className="text-center mt-2">
                        <span className="text-[10px] text-gray-400 flex items-center justify-center">
                            <Shield className="w-3 h-3 mr-1" /> AI Moderation Active
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Chat;
