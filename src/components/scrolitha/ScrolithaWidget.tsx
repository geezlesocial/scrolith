import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Send, X, CheckCircle2, Sparkles, Upload, Loader2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import ScrolithaService, { ScrolithaSuggestedAction } from '../../services/scrolitha';
import { FileService } from '../../services/files';

type ChatLine = {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
};

const routeAllowsWidget = (pathname: string) => {
  if (pathname === '/') return true;
  if (pathname.startsWith('/freelancer/dashboard')) return true;
  if (pathname.startsWith('/client/dashboard')) return true;
  return false;
};

const prettyActionName = (key: string) =>
  String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const defaultQuickActionForRole = (role: string) => {
  const normalized = String(role || '').toLowerCase();
  if (normalized.includes('freelancer')) {
    return ['Create gig', 'Upload file', 'My orders', 'Generate brief'];
  }
  if (normalized.includes('employer') || normalized.includes('client')) {
    return ['Post job', 'Upload file', 'My orders', 'Generate brief'];
  }
  return ['Upload file', 'My orders', 'Generate brief'];
};

const ScrolithaWidget: React.FC = () => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const { socket, isConnected } = useSocket();
  const location = useLocation();

  const visible = Boolean(user?.id) && routeAllowsWidget(location.pathname) && !location.pathname.startsWith('/admin');

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [suggestedActions, setSuggestedActions] = useState<ScrolithaSuggestedAction[]>([]);
  const [busy, setBusy] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [actionParams, setActionParams] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const quickActions = useMemo(() => defaultQuickActionForRole(String(user?.role || '')), [user?.role]);

  const appendLine = (line: Omit<ChatLine, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        ...line
      }
    ]);
  };

  const loadHistory = async () => {
    try {
      const history = await ScrolithaService.history(10);
      if (!Array.isArray(history) || !history.length) return;
      const latest = history[0];
      if (latest?.id) setConversationId(latest.id);
      const mapped = Array.isArray(latest?.messages)
        ? latest.messages.map((entry: any) => ({
            id: String(entry.id || `${entry.createdAt || Date.now()}`),
            sender: String(entry.sender || 'assistant').toLowerCase() === 'user' ? 'user' : 'assistant',
            text: String(entry.content || ''),
            timestamp: String(entry.createdAt || new Date().toISOString())
          }))
        : [];
      setMessages(mapped.slice(-20));
    } catch {
      // History load is best-effort.
    }
  };

  useEffect(() => {
    if (!open || !visible) return;
    void loadHistory();
  }, [open, visible]);

  useEffect(() => {
    if (!open || !visible || isConnected) return;
    const timer = window.setInterval(() => {
      void loadHistory();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [open, visible, isConnected]);

  useEffect(() => {
    if (!socket) return;
    const onCompleted = (payload: any) => {
      appendLine({
        sender: 'system',
        text: `Action completed: ${payload?.toolKey || 'Unknown tool'}`
      });
    };
    socket.on('scrolitha:action_completed', onCompleted);
    return () => {
      socket.off('scrolitha:action_completed', onCompleted);
    };
  }, [socket]);

  const sendChat = async (message: string) => {
    const text = String(message || '').trim();
    if (!text) return;
    appendLine({ sender: 'user', text });
    setBusy(true);
    try {
      const data = await ScrolithaService.chat({
        message: text,
        context: { page: location.pathname },
        conversationId: conversationId || undefined
      });
      if (data?.conversationId) setConversationId(data.conversationId);
      appendLine({ sender: 'assistant', text: data?.reply || 'Done.' });
      setSuggestedActions(Array.isArray(data?.suggestedActions) ? data.suggestedActions : []);
    } catch (error: any) {
      showNotification('error', 'Scrolitha', error?.message || 'Failed to send request.');
    } finally {
      setBusy(false);
    }
  };

  const executeAction = async (action: ScrolithaSuggestedAction, extraParams?: Record<string, any>) => {
    setRunningActionId(action.actionId);
    try {
      const baseParams = action.paramsPreview || {};
      const mergedParams = { ...baseParams, ...(extraParams || {}) };
      const data = await ScrolithaService.execute({
        actionId: action.actionId,
        confirmed: true,
        params: mergedParams
      });
      appendLine({ sender: 'assistant', text: data?.success === false ? data?.message || 'Confirmation required.' : `${prettyActionName(action.actionKey)} executed.` });
      if (data?.deepLink) {
        appendLine({ sender: 'system', text: `Take me there: ${data.deepLink}` });
      }
      setSuggestedActions((prev) => prev.filter((entry) => entry.actionId !== action.actionId));
    } catch (error: any) {
      showNotification('error', 'Scrolitha Action', error?.message || 'Action execution failed.');
    } finally {
      setRunningActionId(null);
    }
  };

  const handleQuickAction = async (actionLabel: string) => {
    const normalized = actionLabel.toLowerCase();
    if (normalized.includes('upload file')) {
      fileInputRef.current?.click();
      return;
    }
    await sendChat(actionLabel);
  };

  const handleUploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    try {
      const uploaded = await FileService.uploadFile(file, 'document');
      appendLine({ sender: 'system', text: `Uploaded file: ${uploaded.name}` });
      const data = await ScrolithaService.chat({
        message: 'Upload file to library',
        context: { page: location.pathname },
        conversationId: conversationId || undefined
      });
      if (data?.conversationId) setConversationId(data.conversationId);
      const uploadAction = Array.isArray(data?.suggestedActions)
        ? data.suggestedActions.find((entry) => entry.toolKey === 'UPLOAD_FILE_TO_LIBRARY')
        : null;

      if (uploadAction) {
        await executeAction(uploadAction, { fileId: uploaded.id });
      } else {
        appendLine({ sender: 'assistant', text: 'File uploaded. You can attach it from Uploaded Files.' });
      }
    } catch (error: any) {
      showNotification('error', 'Upload', error?.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <>
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadFile} />
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-slate-800"
        >
          <Bot className="h-4 w-4" />
          Ask Scrolitha
        </button>
      ) : null}

      {open ? (
        <div className="fixed bottom-24 right-6 z-50 flex h-[520px] w-[360px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Scrolitha Assistant
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-slate-200 px-3 py-2">
            <div className="flex flex-wrap gap-2">
              {quickActions.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => void handleQuickAction(entry)}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                >
                  {entry}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? (
              <p className="text-xs text-slate-500">Ask Scrolitha to create gigs/jobs, upload files, check orders, or run guided tasks.</p>
            ) : null}
            {messages.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-lg px-3 py-2 text-xs ${entry.sender === 'user' ? 'ml-8 bg-slate-900 text-white' : entry.sender === 'assistant' ? 'mr-8 bg-slate-100 text-slate-800' : 'bg-emerald-50 text-emerald-700'}`}
              >
                {entry.text}
              </div>
            ))}

            {suggestedActions.map((action) => {
              const manualParams = actionParams[action.actionId] || '';
              return (
                <div key={action.actionId} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                  <p className="font-semibold text-slate-800">{prettyActionName(action.actionKey)}</p>
                  <p className="mt-1 text-slate-600">{action.summary}</p>
                  <textarea
                    value={manualParams}
                    onChange={(event) =>
                      setActionParams((prev) => ({
                        ...prev,
                        [action.actionId]: event.target.value
                      }))
                    }
                    rows={2}
                    placeholder='Optional params JSON, e.g. {"title":"New Gig"}'
                    className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px]"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">
                      {action.requiresConfirmation ? 'Confirmation required' : 'Safe action'}
                    </span>
                    <button
                      type="button"
                      disabled={runningActionId === action.actionId}
                      onClick={() => {
                        let params = action.paramsPreview || {};
                        if (manualParams.trim()) {
                          try {
                            params = { ...params, ...JSON.parse(manualParams) };
                          } catch {
                            showNotification('warning', 'Invalid JSON', 'Action params must be valid JSON.');
                            return;
                          }
                        }
                        void executeAction(action, params);
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {runningActionId === action.actionId ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Execute
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-200 p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask Scrolitha..."
                rows={2}
                className="flex-1 resize-none rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                disabled={busy || !input.trim()}
                onClick={() => {
                  const current = input;
                  setInput('');
                  void sendChat(current);
                }}
                className="inline-flex items-center justify-center rounded-md bg-slate-900 p-2 text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-100"
                title="Upload file"
              >
                <Upload className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default ScrolithaWidget;
