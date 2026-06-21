
import React, { useState, useEffect } from 'react';
import { Conversation } from '../../types';
import { MessagingService } from '../../services/messaging';
import { Search, User, Clock, MessageSquare, ExternalLink } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { UserRole } from '../../types';

const AdminMessages = () => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [filter, setFilter] = useState<'all' | 'freelancer' | 'employer'>('all');
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    useEffect(() => {
        // Admin sees all
        MessagingService.getAllConversations('admin', UserRole.ADMIN).then(setConversations);
    }, [searchParams]);

    const handleOpenChat = (id: string) => {
        navigate(`/messages/${id}`);
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex h-[calc(100vh-140px)] overflow-hidden">
            {/* List View */}
            <div className="w-full flex flex-col">
                <div className="p-4 border-b border-gray-200">
                    <h2 className="font-bold text-gray-900 mb-3">Platform Messages</h2>
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <input type="text" placeholder="Search conversations..." className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setFilter('all')} className={`flex-1 py-1.5 text-xs font-medium rounded-md ${filter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>All</button>
                        <button onClick={() => setFilter('freelancer')} className={`flex-1 py-1.5 text-xs font-medium rounded-md ${filter === 'freelancer' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Freelancers</button>
                        <button onClick={() => setFilter('employer')} className={`flex-1 py-1.5 text-xs font-medium rounded-md ${filter === 'employer' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Employers</button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {conversations.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">No conversations found.</div>
                    ) : (
                        conversations.map(convo => (
                            <div 
                                key={convo.id} 
                                className="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors flex justify-between items-center group"
                            >
                                <div className="flex-1 min-w-0 pr-4">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-center">
                                            <div className="flex -space-x-2 mr-3">
                                                {convo.participants.map(p => (
                                                    <img key={p.id} src={p.avatar} className="w-8 h-8 rounded-full border-2 border-white" title={p.name} />
                                                ))}
                                            </div>
                                            <span className="font-medium text-gray-900 text-sm truncate max-w-[200px]">
                                                {convo.participants.map(p => p.name).join(' & ')}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-gray-400 whitespace-nowrap flex items-center">
                                            <Clock className="w-3 h-3 mr-1" />
                                            {new Date(convo.lastMessageAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 line-clamp-1 pl-11">
                                        {convo.lastMessage}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => handleOpenChat(convo.id)}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center text-xs font-bold"
                                >
                                    Open <ExternalLink className="w-3 h-3 ml-1" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminMessages;
