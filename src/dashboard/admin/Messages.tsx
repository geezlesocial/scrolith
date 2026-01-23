import React, { useState, useEffect, useMemo } from 'react';
import { Conversation, User, UserRole } from '../../types';
import { MessagingService } from '../../services/messaging';
import { Search, Clock, ExternalLink, Plus, Loader2 } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import { AdminService } from '../../services/admin';

const AdminMessages = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState<'all' | 'freelancer' | 'employer'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [creating, setCreating] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useUser();

  useEffect(() => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }
    if (user.role !== UserRole.ADMIN) {
      setError('You do not have permission to view platform conversations.');
      setConversations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    MessagingService.getAllConversations(user.id, user.role)
      .then(setConversations)
      .catch(err => {
        console.error('Unable to load conversations', err);
        const status = err?.response?.status;
        if (status === 429) {
          setError('Too many requests. Please wait a moment and try again.');
        } else {
          setError(err?.message || 'Unable to load conversations');
        }
        setConversations([]);
      })
      .finally(() => setLoading(false));
  }, [user, searchParams]);

  useEffect(() => {
    if (!user || user.role !== UserRole.ADMIN) return;
    AdminService.getUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [user]);

  const filteredConversations = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return conversations.filter(convo => {
      const participants = convo.participants ?? [];
      const matchesFilter =
        filter === 'all' ||
        participants.some(
          p => (p.role ?? '').toString().toLowerCase() === filter
        );
      const searchableMessage = (convo.lastMessage ?? convo.last_message ?? '').toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        participants.some(p => (p.name ?? '').toLowerCase().includes(normalizedSearch)) ||
        searchableMessage.includes(normalizedSearch);
      return matchesFilter && matchesSearch;
    });
  }, [conversations, filter, searchTerm]);

  const handleOpenChat = (id: string) => {
    navigate(`/messages/${id}`);
  };

  const handleCreateConversation = async () => {
    if (!user || !selectedUserId) return;
    const target = users.find(u => u.id === selectedUserId);
    if (!target) return;
    setCreating(true);
    try {
      const id = await MessagingService.createConversation([
        { id: user.id, name: user.name || 'Admin', avatar: user.avatar, role: user.role },
        { id: target.id, name: target.name || 'User', avatar: target.avatar, role: target.role }
      ]);
      setSelectedUserId('');
      const updated = await MessagingService.getAllConversations(user.id, user.role);
      setConversations(updated);
      handleOpenChat(id);
    } catch (err) {
      setError('Failed to start a new conversation.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex h-[calc(100vh-140px)] overflow-hidden">
      <div className="w-full flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900 mb-3">Platform Messages</h2>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex flex-col md:flex-row gap-2 mb-3">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Start conversation with...</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {(u.name || u.email || 'User').toString()} ({u.role})
                </option>
              ))}
            </select>
            <button
              onClick={handleCreateConversation}
              disabled={!selectedUserId || creating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold inline-flex items-center justify-center disabled:opacity-50"
              type="button"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Start
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md ${
                filter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('freelancer')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md ${
                filter === 'freelancer' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Freelancers
            </button>
            <button
              onClick={() => setFilter('employer')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md ${
                filter === 'employer' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Employers
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading conversations...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-600">{error}</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {conversations.length === 0
                ? 'No conversations found.'
                : 'No conversations match the selected filter or search.'}
            </div>
          ) : (
            filteredConversations.map(convo => {
              const participants = convo.participants ?? [];
              const lastTime = convo.last_message_at || (convo as any).lastMessageAt;
              const formattedLastTime =
                lastTime && !Number.isNaN(Date.parse(lastTime))
                  ? new Date(lastTime).toLocaleString()
                  : '--';
              const safeLastMessage =
                convo.last_message || (convo as any).lastMessage || 'No messages yet';
              return (
                <div
                  key={convo.id}
                  className="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors flex justify-between items-center group"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center">
                        <div className="flex -space-x-2 mr-3">
                          {participants.length === 0 && (
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-500">
                              ?
                            </div>
                          )}
                          {participants.slice(0, 3).map(p =>
                            p.avatar ? (
                              <img
                                key={p.id}
                                src={p.avatar}
                                className="w-8 h-8 rounded-full border-2 border-white"
                                title={p.name}
                                alt={p.name}
                              />
                            ) : (
                              <div
                                key={p.id}
                                className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-500 border-2 border-white"
                              >
                                {p.name ? p.name.charAt(0) : 'U'}
                              </div>
                            )
                          )}
                        </div>
                        <span className="font-medium text-gray-900 text-sm truncate max-w-[200px]">
                          {participants.map(p => p.name).filter(Boolean).join(' & ') || 'Unknown participants'}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {formattedLastTime}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-1 pl-11">
                      {safeLastMessage}
                    </p>
                  </div>
                  <button
                    onClick={() => handleOpenChat(convo.id)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center text-xs font-bold"
                  >
                    Open <ExternalLink className="w-3 h-3 ml-1" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminMessages;

