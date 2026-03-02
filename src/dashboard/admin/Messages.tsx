import React, { useState, useEffect, useMemo } from 'react';
import { Conversation, User, UserRole } from '../../types';
import { MessagingService } from '../../services/messaging';
import { Search, Clock, ExternalLink, Plus, Loader2 } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';
import { MessengerVoiceConfig } from '../../types';

const AdminMessages = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState<'all' | 'freelancer' | 'employer'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [creating, setCreating] = useState(false);
  const [voiceConfig, setVoiceConfig] = useState<MessengerVoiceConfig | null>(null);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [blockedUserIdsInput, setBlockedUserIdsInput] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const { showNotification } = useNotification();

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

  useEffect(() => {
    if (!user || user.role !== UserRole.ADMIN) return;
    AdminService.getMessengerVoiceConfig()
      .then((config) => {
        setVoiceConfig(config);
        const blocked = Array.isArray(config?.blockedUserIds) ? config.blockedUserIds : [];
        setBlockedUserIdsInput(blocked.join(', '));
      })
      .catch(() => setVoiceConfig(null));
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

  const updateVoiceConfigState = (patch: Partial<MessengerVoiceConfig>) => {
    setVoiceConfig((prev) => {
      const base: MessengerVoiceConfig = prev || {
        enabledVoiceCalls: true,
        enabledConferenceCalls: true,
        enabledVoiceNotes: true,
        maxParticipants: 8,
        maxVoiceNoteDurationSeconds: 180,
        blockedUserIds: []
      };
      return { ...base, ...patch };
    });
  };

  const saveVoiceConfig = async () => {
    if (!voiceConfig) return;
    setVoiceSaving(true);
    try {
      const blockedUserIds = Array.from(
        new Set(
          String(blockedUserIdsInput || '')
            .split(/[\n,\s]+/g)
            .map((entry) => entry.trim())
            .filter(Boolean)
        )
      );
      const updated = await AdminService.updateMessengerVoiceConfig({
        ...voiceConfig,
        blockedUserIds
      });
      setVoiceConfig(updated);
      setBlockedUserIdsInput((Array.isArray(updated?.blockedUserIds) ? updated.blockedUserIds : []).join(', '));
      showNotification('success', 'Messenger Voice', 'Voice config saved.');
    } catch (error: any) {
      showNotification('error', 'Messenger Voice', error?.message || 'Failed to save voice config.');
    } finally {
      setVoiceSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex h-[calc(100vh-140px)] overflow-hidden">
      <div className="w-full flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900 mb-3">Platform Messages</h2>
          {voiceConfig && (
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Messenger Voice Settings</h3>
                <button
                  type="button"
                  onClick={() => void saveVoiceConfig()}
                  disabled={voiceSaving}
                  className="rounded-md bg-gray-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {voiceSaving ? 'Saving...' : 'Save Voice Config'}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-sm">
                <label className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 border border-gray-200">
                  Voice calls
                  <input
                    type="checkbox"
                    checked={Boolean(voiceConfig.enabledVoiceCalls)}
                    onChange={(event) => updateVoiceConfigState({ enabledVoiceCalls: event.target.checked })}
                  />
                </label>
                <label className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 border border-gray-200">
                  Conference calls
                  <input
                    type="checkbox"
                    checked={Boolean(voiceConfig.enabledConferenceCalls)}
                    onChange={(event) => updateVoiceConfigState({ enabledConferenceCalls: event.target.checked })}
                  />
                </label>
                <label className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 border border-gray-200">
                  Voice notes
                  <input
                    type="checkbox"
                    checked={Boolean(voiceConfig.enabledVoiceNotes)}
                    onChange={(event) => updateVoiceConfigState({ enabledVoiceNotes: event.target.checked })}
                  />
                </label>
                <label className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 border border-gray-200">
                  Max participants
                  <input
                    type="number"
                    min={2}
                    max={32}
                    className="w-20 rounded border border-gray-300 px-2 py-0.5 text-right"
                    value={Number(voiceConfig.maxParticipants || 8)}
                    onChange={(event) => updateVoiceConfigState({ maxParticipants: Number(event.target.value || 8) })}
                  />
                </label>
                <label className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 border border-gray-200 md:col-span-2">
                  Max voice note duration (seconds)
                  <input
                    type="number"
                    min={5}
                    max={900}
                    className="w-24 rounded border border-gray-300 px-2 py-0.5 text-right"
                    value={Number(voiceConfig.maxVoiceNoteDurationSeconds || 180)}
                    onChange={(event) =>
                      updateVoiceConfigState({ maxVoiceNoteDurationSeconds: Number(event.target.value || 180) })
                    }
                  />
                </label>
                <label className="rounded-md bg-white px-2 py-2 border border-gray-200 md:col-span-2">
                  <div className="mb-1 text-xs font-semibold text-gray-700">Blocked user IDs</div>
                  <textarea
                    rows={2}
                    value={blockedUserIdsInput}
                    onChange={(event) => setBlockedUserIdsInput(event.target.value)}
                    placeholder="user-id-1, user-id-2"
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                  />
                  <div className="mt-1 text-[10px] text-gray-500">
                    Enter user IDs separated by comma, space, or newline.
                  </div>
                </label>
              </div>
            </div>
          )}
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
              const lastTime = convo.last_message_at || convo.lastMessageAt || '';
              const formattedLastTime =
                lastTime && !Number.isNaN(Date.parse(lastTime))
                  ? new Date(lastTime).toLocaleString()
                  : '--';
              const safeLastMessage =
                convo.last_message || convo.lastMessage || 'No messages yet';
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

