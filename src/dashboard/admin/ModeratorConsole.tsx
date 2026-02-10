import React, { useEffect, useMemo, useState } from 'react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';
import { AlertTriangle, MessageSquare, RefreshCcw, Search, ShieldAlert } from 'lucide-react';

const QUICK_WARNINGS = [
  'Moderator warning: Please keep all communication respectful and professional.',
  'Moderator warning: Off-platform payment requests are not allowed.',
  'Moderator warning: Please avoid sharing sensitive personal data in chat.'
];

const ModeratorConsole: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>('');
  const [messages, setMessages] = useState<any[]>([]);
  const [auditItems, setAuditItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');

  const selectedConversation = useMemo(
    () => conversations.find((entry) => entry.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  const loadConversations = async (query = search) => {
    setLoading(true);
    try {
      const data = await AdminService.getModerationConversations({ page: 1, limit: 30, search: query || undefined });
      const items = Array.isArray(data?.items) ? data.items : [];
      setConversations(items);
      if (!selectedConversationId && items.length) {
        setSelectedConversationId(items[0].id);
      } else if (selectedConversationId && !items.some((entry: any) => entry.id === selectedConversationId)) {
        setSelectedConversationId(items[0]?.id || '');
      }
    } catch (error: any) {
      showNotification('alert', 'Load failed', error?.message || 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const loadConversationDetails = async (conversationId: string) => {
    if (!conversationId) {
      setMessages([]);
      setAuditItems([]);
      return;
    }
    try {
      const [messagesData, auditData] = await Promise.all([
        AdminService.getModerationConversationMessages(conversationId, { page: 1, limit: 200 }),
        AdminService.getModerationAudit({ page: 1, limit: 30, conversationId })
      ]);
      const messageItems = Array.isArray(messagesData?.messages)
        ? messagesData.messages
        : Array.isArray(messagesData?.items)
          ? messagesData.items
          : [];
      setMessages(messageItems);
      setAuditItems(Array.isArray(auditData?.items) ? auditData.items : []);
    } catch (error: any) {
      showNotification('alert', 'Load failed', error?.message || 'Failed to load conversation details');
    }
  };

  useEffect(() => {
    loadConversations('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadConversationDetails(selectedConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId]);

  const sendWarning = async () => {
    const message = String(draft || '').trim();
    if (!selectedConversationId) {
      showNotification('alert', 'No conversation', 'Select a conversation first.');
      return;
    }
    if (!message) {
      showNotification('alert', 'Validation', 'Enter a moderator message.');
      return;
    }

    setSending(true);
    try {
      await AdminService.sendModerationConversationMessage(selectedConversationId, {
        message,
        type: 'MODERATOR_WARNING'
      });
      setDraft('');
      showNotification('success', 'Sent', 'Moderator warning sent successfully.');
      await loadConversationDetails(selectedConversationId);
      await loadConversations(search);
    } catch (error: any) {
      showNotification('alert', 'Send failed', error?.message || 'Failed to send warning.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Moderator Console</h2>
            <p className="text-sm text-gray-500">Read conversations, send warnings, and review moderation audit logs.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search user/email"
                className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-60"
              />
            </div>
            <button
              onClick={() => loadConversations(search)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <RefreshCcw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden xl:col-span-1">
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-800">Conversations</div>
          <div className="max-h-[560px] overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-gray-500">Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No conversations found.</div>
            ) : (
              conversations.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedConversationId(item.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${
                    selectedConversationId === item.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {(item.participants || [])
                      .map((participant: any) => participant?.name || participant?.email || participant?.userId)
                      .filter(Boolean)
                      .join(', ') || item.id}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{item.lastMessageText || 'No messages yet'}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden xl:col-span-2">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="font-semibold text-gray-800 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              {selectedConversation ? `Conversation ${selectedConversation.id}` : 'Select a conversation'}
            </div>
          </div>

          <div className="p-4 space-y-3 max-h-[360px] overflow-y-auto bg-gray-50">
            {messages.length === 0 ? (
              <div className="text-sm text-gray-500">No messages to display.</div>
            ) : (
              messages.map((message) => {
                const isModerator =
                  Boolean(message?.isSystem || message?.is_system) ||
                  String(message?.messageType || message?.message_type || '').toUpperCase().includes('MODERATOR');
                const createdAt = message?.createdAt || message?.timestamp;
                return (
                  <div key={message.id} className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-700">
                          {message?.sender?.name || message?.sender?.email || 'Unknown'}
                        </span>
                        {isModerator && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            <ShieldAlert className="w-3 h-3 mr-1" />
                            Moderator
                          </span>
                        )}
                      </div>
                      <span>{createdAt ? new Date(createdAt).toLocaleString() : ''}</span>
                    </div>
                    <div className="text-sm text-gray-900 whitespace-pre-wrap">{message.text || ''}</div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-gray-100 p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {QUICK_WARNINGS.map((text) => (
                <button
                  key={text}
                  onClick={() => setDraft(text)}
                  className="text-xs px-2.5 py-1.5 rounded-full border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100"
                >
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  Template
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write moderator warning..."
                className="flex-1 border border-gray-300 rounded-lg p-2.5 text-sm min-h-20"
              />
              <button
                onClick={sendWarning}
                disabled={sending || !selectedConversationId}
                className="self-end px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send Warning'}
              </button>
            </div>
          </div>

          <div className="border-t border-gray-100 p-4">
            <div className="text-sm font-semibold text-gray-800 mb-2">Audit Trail</div>
            <div className="space-y-2 max-h-44 overflow-y-auto">
              {auditItems.length === 0 ? (
                <div className="text-xs text-gray-500">No audit entries yet.</div>
              ) : (
                auditItems.map((item) => (
                  <div key={item.id} className="text-xs text-gray-700 border border-gray-200 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="font-semibold">{item.action}</span> • {new Date(item.createdAt).toLocaleString()}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModeratorConsole;
