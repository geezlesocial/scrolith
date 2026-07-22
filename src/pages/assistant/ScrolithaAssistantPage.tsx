/**
 * Phase 33.1 — /assistant — Scrolitha AI Assistant UI
 * Chat, drafts, rewrite, translate, prompt library, history, feedback.
 * Everything is draft/suggestion only.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  BookOpen,
  Copy,
  History,
  Loader2,
  MessageSquarePlus,
  Pin,
  Search,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Download,
  Languages,
  Pencil
} from 'lucide-react';
import {
  ScrolithaAssistantService,
  type AssistantResult
} from '../../services/scrolithaAssistant';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';

type TabId = 'chat' | 'tools' | 'prompts' | 'history';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  correlationId?: string;
  messageId?: string;
};

const REWRITE_MODES = [
  'rewrite',
  'summarize',
  'bullet_points',
  'simplify',
  'professional',
  'executive_summary',
  'social',
  'seo'
] as const;

const DRAFT_KINDS = [
  { id: 'post', label: 'Post' },
  { id: 'comment', label: 'Comment' },
  { id: 'message', label: 'Message' },
  { id: 'bio', label: 'Bio' },
  { id: 'job_description', label: 'Job description' },
  { id: 'cover_letter', label: 'Cover letter' },
  { id: 'marketplace_listing', label: 'Marketplace listing' },
  { id: 'community_announcement', label: 'Community announcement' },
  { id: 'business_announcement', label: 'Business announcement' },
  { id: 'ideas', label: 'Ideas' }
] as const;

const ScrolithaAssistantPage: React.FC = () => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const [tab, setTab] = useState<TabId>('chat');
  const [status, setStatus] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState('');
  const [prompts, setPrompts] = useState<any[]>([]);
  const [promptCategory, setPromptCategory] = useState('');
  const [toolText, setToolText] = useState('');
  const [toolOut, setToolOut] = useState('');
  const [rewriteMode, setRewriteMode] = useState<string>('rewrite');
  const [targetLocale, setTargetLocale] = useState('en');
  const [draftKind, setDraftKind] = useState('post');
  const [draftTopic, setDraftTopic] = useState('');
  const [searchDomain, setSearchDomain] = useState('jobs');
  const [searchQuery, setSearchQuery] = useState('');
  const [historyQ, setHistoryQ] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const st = await ScrolithaAssistantService.getStatus();
      setStatus(st);
    } catch {
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const rows = await ScrolithaAssistantService.listConversations(historyQ || undefined);
      setConversations(Array.isArray(rows) ? rows : []);
    } catch {
      setConversations([]);
    }
  }, [historyQ]);

  const loadPrompts = useCallback(async () => {
    try {
      const data = await ScrolithaAssistantService.listPrompts({
        category: promptCategory || undefined
      });
      setPrompts(data?.items || []);
    } catch {
      setPrompts([]);
    }
  }, [promptCategory]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (tab === 'history' || tab === 'chat') loadConversations();
  }, [tab, loadConversations]);

  useEffect(() => {
    if (tab === 'prompts') loadPrompts();
  }, [tab, loadPrompts]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const surfaces = status?.surfaces || {};
  const disabledHint = useMemo(() => {
    if (loadingStatus) return 'Loading…';
    if (!status) return 'Unable to load assistant status.';
    if (!surfaces.assistant) {
      return 'Assistant is disabled (feature flags / consent). Enable AI features in Settings → AI when the platform allows it.';
    }
    return null;
  }, [loadingStatus, status, surfaces.assistant]);

  const sendChat = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setSending(true);
    setLive('Sending message to Scrolitha AI…');
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: 'user', content: msg }]);
    setInput('');
    try {
      const result = await ScrolithaAssistantService.chat({
        message: msg,
        conversationId
      });
      if (!result.ok) {
        showNotification('alert', 'Assistant', result.reason || 'Unavailable');
        setLive(`Failed: ${result.reason || 'error'}`);
        setMessages((m) => [
          ...m,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            content: `Unable to respond: ${result.reason || 'AI unavailable'}. Check Settings → AI consent and platform flags.`
          }
        ]);
        return;
      }
      if (result.conversationId) setConversationId(result.conversationId);
      setMessages((m) => [
        ...m,
        {
          id: result.messageId || `a-${Date.now()}`,
          role: 'assistant',
          content: result.text || '',
          correlationId: result.correlationId,
          messageId: result.messageId || undefined
        }
      ]);
      setLive('Assistant reply ready. Draft/suggestion only.');
      loadConversations();
    } catch (err: any) {
      showNotification('alert', 'Assistant', err?.message || 'Failed');
      setLive('Request failed');
    } finally {
      setSending(false);
    }
  };

  const newChat = async () => {
    setConversationId(null);
    setMessages([]);
    setLive('New chat started');
    try {
      const c = await ScrolithaAssistantService.createConversation('New chat');
      if ((c as any)?.id) setConversationId((c as any).id);
    } catch {
      /* local only */
    }
  };

  const openConversation = async (id: string) => {
    try {
      const data = await ScrolithaAssistantService.getConversation(id);
      setConversationId(id);
      const msgs = (data as any)?.messages || [];
      setMessages(
        msgs.map((m: any) => ({
          id: m.id,
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content || m.contentPreview || '',
          correlationId: m.correlationId,
          messageId: m.id
        }))
      );
      setTab('chat');
      setLive('Conversation loaded');
    } catch {
      showNotification('alert', 'History', 'Could not load conversation');
    }
  };

  const feedback = async (rating: 'helpful' | 'not_helpful', m: ChatMessage) => {
    try {
      await ScrolithaAssistantService.feedback({
        rating,
        capability: 'ASSISTANT_CHAT',
        correlationId: m.correlationId,
        conversationId: conversationId || undefined,
        messageId: m.messageId
      });
      showNotification('success', 'Feedback', 'Thanks — quality metrics only, not used for training.');
      setLive('Feedback recorded');
    } catch (err: any) {
      showNotification('alert', 'Feedback', err?.message || 'Failed (flag may be off)');
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showNotification('success', 'Copied', 'Draft copied to clipboard');
    } catch {
      /* ignore */
    }
  };

  const runRewrite = async () => {
    setSending(true);
    setLive('Rewriting…');
    try {
      const result = await ScrolithaAssistantService.rewrite({ text: toolText, mode: rewriteMode });
      if (!result.ok) {
        setToolOut(result.reason || 'Failed');
        return;
      }
      setToolOut(result.text || '');
      setLive('Rewrite draft ready');
    } finally {
      setSending(false);
    }
  };

  const runTranslate = async () => {
    setSending(true);
    try {
      const result = await ScrolithaAssistantService.translate({
        text: toolText,
        targetLocale
      });
      setToolOut(result.ok ? result.text || '' : result.reason || 'Failed');
      setLive(result.ok ? `Translated (detected ${result.detectedLanguage || 'auto'})` : 'Translate failed');
    } finally {
      setSending(false);
    }
  };

  const runDraft = async () => {
    setSending(true);
    try {
      const result = await ScrolithaAssistantService.draft({ kind: draftKind, topic: draftTopic });
      setToolOut(result.ok ? result.text || '' : result.reason || 'Failed');
      setLive(result.ok ? 'Draft ready — not published' : 'Draft failed');
    } finally {
      setSending(false);
    }
  };

  const runSearch = async () => {
    setSending(true);
    try {
      const result = await ScrolithaAssistantService.searchSuggest({
        domain: searchDomain,
        query: searchQuery
      });
      if (result.ok) {
        setToolOut(
          (result.suggestions || []).join('\n') || result.text || ''
        );
        setLive('Search suggestions only — not executed');
      } else setToolOut(result.reason || 'Failed');
    } finally {
      setSending(false);
    }
  };

  const usePrompt = async (id: string) => {
    const topic = window.prompt('Topic / details for this template:') || '';
    if (!topic) return;
    setSending(true);
    setTab('chat');
    try {
      const result = await ScrolithaAssistantService.usePrompt(id, {
        topic,
        conversationId: conversationId || undefined
      });
      if (result.conversationId) setConversationId(result.conversationId);
      if (result.ok && result.text) {
        setMessages((m) => [
          ...m,
          { id: `u-p-${Date.now()}`, role: 'user', content: `Template: ${topic}` },
          {
            id: result.messageId || `a-p-${Date.now()}`,
            role: 'assistant',
            content: result.text,
            correlationId: result.correlationId,
            messageId: result.messageId || undefined
          }
        ]);
        setLive('Prompt library draft ready');
      } else {
        showNotification('alert', 'Prompt library', result.reason || 'Failed');
      }
    } finally {
      setSending(false);
    }
  };

  const exportHistory = async () => {
    try {
      const data = await ScrolithaAssistantService.exportConversations();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scrolitha-ai-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLive('Export downloaded');
    } catch {
      showNotification('alert', 'Export', 'Failed');
    }
  };

  if (!user?.id) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-slate-600">Sign in to use Scrolitha AI Assistant.</p>
        <Link to="/login" className="text-blue-600 underline">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col px-3 py-4 sm:px-6">
      <div className="sr-only" role="status" aria-live="polite">
        {live}
      </div>

      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <Bot className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Scrolitha AI Assistant</h1>
            <p className="text-sm text-slate-500">Drafts and suggestions only · Phase 33.1</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/settings/ai"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            AI settings
          </Link>
          <button
            type="button"
            onClick={newChat}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <MessageSquarePlus className="h-4 w-4" />
            New chat
          </button>
        </div>
      </header>

      <div
        className="mb-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
        role="note"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <p>
          {status?.disclosure ||
            'AI outputs may be incorrect. Nothing is auto-published, sent, applied, or charged. You stay in control.'}
        </p>
      </div>

      {disabledHint ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700" role="status">
          {disabledHint}{' '}
          <Link to="/settings/ai" className="text-violet-700 underline">
            Open AI settings
          </Link>
        </div>
      ) : null}

      <div role="tablist" aria-label="Assistant sections" className="mb-3 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {(
          [
            { id: 'chat' as const, label: 'Chat', icon: Bot },
            { id: 'tools' as const, label: 'Rewrite & tools', icon: Pencil },
            { id: 'prompts' as const, label: 'Prompt library', icon: BookOpen },
            { id: 'history' as const, label: 'History', icon: History }
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`asst-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                selected ? 'bg-violet-100 text-violet-900' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1" role="tabpanel" aria-labelledby={`asst-tab-${tab}`}>
        {tab === 'chat' && (
          <div className="flex h-[min(70vh,640px)] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-label="Conversation messages">
              {messages.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Ask a question, request a draft, or open a prompt template. Responses are drafts you can copy and edit.
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                      m.role === 'user'
                        ? 'ml-auto bg-violet-600 text-white'
                        : 'mr-auto bg-slate-100 text-slate-900'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.role === 'assistant' ? (
                      <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-200/60 pt-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                          onClick={() => copyText(m.content)}
                          aria-label="Copy draft"
                        >
                          <Copy className="h-3.5 w-3.5" /> Copy
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-slate-600"
                          onClick={() => feedback('helpful', m)}
                          aria-label="Mark helpful"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" /> Helpful
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-slate-600"
                          onClick={() => feedback('not_helpful', m)}
                          aria-label="Mark not helpful"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" /> Not helpful
                        </button>
                        <span className="text-[10px] text-slate-500">AI-generated · draft only</span>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
              <div ref={endRef} />
            </div>
            <div className="border-t border-slate-200 p-3">
              <label htmlFor="assistant-input" className="sr-only">
                Message to Scrolitha AI
              </label>
              <div className="flex gap-2">
                <textarea
                  id="assistant-input"
                  rows={2}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                  placeholder="Ask Scrolitha… (Enter to send, Shift+Enter for newline)"
                  className="min-h-[44px] flex-1 resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  disabled={sending}
                />
                <button
                  type="button"
                  onClick={sendChat}
                  disabled={sending || !input.trim()}
                  className="inline-flex h-11 items-center justify-center gap-1 rounded-xl bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
                  aria-label="Send message"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'tools' && (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="block text-sm font-medium text-slate-800" htmlFor="tool-input">
              Source text
            </label>
            <textarea
              id="tool-input"
              rows={5}
              value={toolText}
              onChange={(e) => setToolText(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              placeholder="Paste text to rewrite, translate, or improve…"
            />
            <div className="flex flex-wrap gap-2">
              <label className="text-xs text-slate-600">
                Rewrite mode{' '}
                <select
                  value={rewriteMode}
                  onChange={(e) => setRewriteMode(e.target.value)}
                  className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm"
                >
                  {REWRITE_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={runRewrite}
                disabled={sending || !toolText.trim()}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Rewrite
              </button>
              <label className="text-xs text-slate-600">
                Translate to{' '}
                <input
                  value={targetLocale}
                  onChange={(e) => setTargetLocale(e.target.value)}
                  className="ml-1 w-16 rounded border border-slate-300 px-2 py-1 text-sm"
                  aria-label="Target locale"
                />
              </label>
              <button
                type="button"
                onClick={runTranslate}
                disabled={sending || !toolText.trim()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                <Languages className="h-4 w-4" /> Translate
              </button>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <h3 className="mb-2 text-sm font-semibold">Draft generator</h3>
              <div className="flex flex-wrap gap-2">
                <select
                  value={draftKind}
                  onChange={(e) => setDraftKind(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  aria-label="Draft kind"
                >
                  {DRAFT_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <input
                  value={draftTopic}
                  onChange={(e) => setDraftTopic(e.target.value)}
                  placeholder="Topic / brief"
                  className="min-w-[200px] flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={runDraft}
                  disabled={sending || !draftTopic.trim()}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  Generate draft
                </button>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <h3 className="mb-2 text-sm font-semibold">Search suggestions</h3>
              <div className="flex flex-wrap gap-2">
                <select
                  value={searchDomain}
                  onChange={(e) => setSearchDomain(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  aria-label="Search domain"
                >
                  {['jobs', 'marketplace', 'communities', 'people', 'posts'].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="What are you looking for?"
                  className="min-w-[200px] flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={runSearch}
                  disabled={sending || !searchQuery.trim()}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  <Search className="h-4 w-4" /> Suggest queries
                </button>
              </div>
            </div>

            {toolOut ? (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs text-slate-500">Output (draft / suggestion only)</p>
                  <button type="button" onClick={() => copyText(toolOut)} className="text-xs text-violet-700 underline">
                    Copy
                  </button>
                </div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-800">
                  {toolOut}
                </pre>
              </div>
            ) : null}
          </div>
        )}

        {tab === 'prompts' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {['', 'professional', 'business', 'education', 'marketing', 'community', 'freelancing', 'recruitment', 'productivity'].map(
                (c) => (
                  <button
                    key={c || 'all'}
                    type="button"
                    onClick={() => setPromptCategory(c)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      promptCategory === c ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {c || 'All'}
                  </button>
                )
              )}
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {prompts.map((p) => (
                <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="font-medium text-slate-900">{p.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {p.category} · v{p.version}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">{p.description}</p>
                  <button
                    type="button"
                    onClick={() => usePrompt(p.id)}
                    className="mt-3 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
                  >
                    Use template
                  </button>
                </li>
              ))}
            </ul>
            {!prompts.length ? (
              <p className="text-sm text-slate-500">No prompts (library may be flag-disabled).</p>
            ) : null}
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">
              Privacy: full message bodies only when AI activity history is enabled in{' '}
              <Link to="/settings/ai" className="underline">
                settings
              </Link>
              . Otherwise previews/hashes only.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={historyQ}
                onChange={(e) => setHistoryQ(e.target.value)}
                placeholder="Search conversations"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                aria-label="Search conversations"
              />
              <button
                type="button"
                onClick={loadConversations}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                Search
              </button>
              <button
                type="button"
                onClick={exportHistory}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                <Download className="h-4 w-4" /> Export
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm('Clear all AI conversations?')) return;
                  await ScrolithaAssistantService.clearConversations();
                  setConversations([]);
                  setMessages([]);
                  setConversationId(null);
                  setLive('History cleared');
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700"
              >
                <Trash2 className="h-4 w-4" /> Clear all
              </button>
            </div>
            <ul className="divide-y divide-slate-100">
              {conversations.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <button
                    type="button"
                    className="text-left text-sm font-medium text-slate-900 hover:text-violet-700"
                    onClick={() => openConversation(c.id)}
                  >
                    {c.pinned ? '📌 ' : ''}
                    {c.title}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {c.messageCount} msgs
                    </span>
                  </button>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label="Pin conversation"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                      onClick={async () => {
                        await ScrolithaAssistantService.patchConversation(c.id, { pinned: !c.pinned });
                        loadConversations();
                      }}
                    >
                      <Pin className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete conversation"
                      className="rounded p-1.5 text-red-600 hover:bg-red-50"
                      onClick={async () => {
                        await ScrolithaAssistantService.deleteConversation(c.id);
                        loadConversations();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {!conversations.length ? <p className="text-sm text-slate-500">No conversations yet.</p> : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScrolithaAssistantPage;
