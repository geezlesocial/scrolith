import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Bot, FileSearch, Palette, Shield, Wrench } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import ScrolithaService, { ScrolithaSuggestedAction, ScrolithaWidgetConfig } from '../../services/scrolitha';
import FilePickerModal from '../shared/FilePickerModal';
import { UploadedFile } from '../../types';

type TabId = 'console' | 'skills' | 'policies' | 'widget' | 'audit' | 'analytics';

const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'console', label: 'Console', icon: Bot },
  { id: 'skills', label: 'Skills Library', icon: Wrench },
  { id: 'policies', label: 'Policies & Security', icon: Shield },
  { id: 'widget', label: 'Chat Widget', icon: Palette },
  { id: 'audit', label: 'Audit Logs', icon: FileSearch },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 }
];

const defaultWidgetSettings: ScrolithaWidgetConfig = {
  enabled: true,
  assistantName: 'Scrolitha',
  assistantRoleLabel: 'Support',
  textColor: '#1e293b',
  accentColor: '#4f46e5',
  agentBubbleColor: '#f3f4f6',
  userBubbleColor: '#4f46e5',
  logoUrl: '',
  logoFileId: '',
  welcomeText: "Hi! I'm Scrolitha. I can help you navigate Scrolith. What describes you best?",
  typingText: 'Scrolitha is thinking...',
  placeholderText: 'Ask Scrolitha a question...',
  emptyStateText: 'Ask about support, gigs, jobs, files, orders, notifications, or account help.',
  offlineMessage: "I'm having trouble connecting right now. Please try again in a moment.",
  disclaimerText: 'Scrolitha keeps actions inside approved platform tools and confirmation rules.',
  starterPrompts: ['Create a gig draft', 'Generate a structured project brief', 'Show my latest orders'],
  guestStarterPrompts: ['How do I get started?', 'How do gigs and jobs work?', 'How do I contact support?'],
  allowVoiceInput: true,
  allowFileUpload: true,
  showStatusBadge: true,
  maxHistoryItems: 24
};

const parseJson = (value: string) => {
  const source = String(value || '').trim();
  if (!source) return {};
  return JSON.parse(source);
};

const parseIdList = (value: string): string[] => {
  const entries = String(value || '')
    .split(/[\n,]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return Array.from(new Set(entries));
};

const formatDate = (value?: string | Date | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const toScrolithaModelLabel = (value: any) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  if (/^scrolitha/i.test(normalized)) return 'Scrolitha';
  return `Scrolitha (${normalized})`;
};

const ScrolithaManagement: React.FC = () => {
  const { showNotification } = useNotification();
  const { socket, isConnected } = useSocket();

  const [tab, setTab] = useState<TabId>('console');

  const [message, setMessage] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatReply, setChatReply] = useState('');
  const [suggestedActions, setSuggestedActions] = useState<ScrolithaSuggestedAction[]>([]);
  const [actionParams, setActionParams] = useState<Record<string, string>>({});

  const [configScope, setConfigScope] = useState<'user' | 'admin'>('admin');
  const [config, setConfig] = useState<any>(null);
  const [skills, setSkills] = useState<any[]>([]);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [widgetSettings, setWidgetSettings] = useState<ScrolithaWidgetConfig>(defaultWidgetSettings);
  const [chatRecords, setChatRecords] = useState<any[]>([]);
  const [chatRecordScope, setChatRecordScope] = useState<'user' | 'admin'>('user');
  const [chatRecordUserId, setChatRecordUserId] = useState('');
  const [showLogoPicker, setShowLogoPicker] = useState(false);

  const [llmHealth, setLlmHealth] = useState<any>(null);
  const [llmModels, setLlmModels] = useState<string[]>([]);
  const [learningInsights, setLearningInsights] = useState<any>(null);
  const [postAiTargetPostIds, setPostAiTargetPostIds] = useState('');
  const [postAiBatchLimit, setPostAiBatchLimit] = useState(40);
  const [postAiActionBusy, setPostAiActionBusy] = useState(false);

  const [loading, setLoading] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);

  const [newSkill, setNewSkill] = useState({
    key: '',
    name: '',
    roleScope: 'freelancer,client,employer',
    description: ''
  });

  const loadConfig = async () => {
    const data = await ScrolithaService.adminGetConfig();
    const selected = data && data.scope ? data : data?.[configScope] || null;
    const adminConfig = data && data.scope ? (data.scope === 'admin' ? data : null) : data?.admin || null;
    setConfig(selected);
    setLlmHealth(null);
    setLlmModels([]);
    const metadata =
      adminConfig?.metadata && typeof adminConfig.metadata === 'object' && !Array.isArray(adminConfig.metadata)
        ? adminConfig.metadata
        : {};
    const chatWidgetSource =
      ((metadata as any)?.chatWidget && typeof (metadata as any).chatWidget === 'object' ? (metadata as any).chatWidget : null) ||
      ((metadata as any)?.chat_widget && typeof (metadata as any).chat_widget === 'object' ? (metadata as any).chat_widget : null) ||
      ((metadata as any)?.widget && typeof (metadata as any).widget === 'object' ? (metadata as any).widget : null) ||
      {};
    setWidgetSettings({ ...defaultWidgetSettings, ...(chatWidgetSource as Partial<ScrolithaWidgetConfig>) });
  };

  const loadLlmHealth = async () => {
    const data = await ScrolithaService.adminGetHealth(configScope);
    setLlmHealth(data || null);
    return data;
  };

  const loadLlmModels = async () => {
    const data = await ScrolithaService.adminGetModels(configScope);
    const models = Array.isArray(data?.models) ? data.models : [];
    setLlmModels(models);
    return models;
  };

  const llmMetadata = useMemo(() => {
    const metadata = config?.metadata && typeof config.metadata === 'object' && !Array.isArray(config.metadata)
      ? config.metadata
      : {};
    const llm = (metadata as any)?.llm;
    if (!llm || typeof llm !== 'object' || Array.isArray(llm)) return {};
    return llm as Record<string, any>;
  }, [config]);

  const normalizedMetadata = useMemo(() => {
    if (config?.metadata && typeof config.metadata === 'object' && !Array.isArray(config.metadata)) {
      return { ...(config.metadata as Record<string, any>) };
    }
    return {} as Record<string, any>;
  }, [config]);

  const learningMetadata = useMemo(() => {
    const learning = (normalizedMetadata as any).learning;
    if (!learning || typeof learning !== 'object' || Array.isArray(learning)) {
      return { enabled: true };
    }
    return learning as Record<string, any>;
  }, [normalizedMetadata]);

  const knowledgeMetadata = useMemo(() => {
    const knowledge = (normalizedMetadata as any).knowledge;
    if (!knowledge || typeof knowledge !== 'object' || Array.isArray(knowledge)) {
      return {};
    }
    return knowledge as Record<string, any>;
  }, [normalizedMetadata]);

  const postAiMetadata = useMemo(() => {
    const source = (normalizedMetadata as any).postAi;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return {
        assistantEnabled: true,
        insightEnabled: true,
        randomPercentage: 15,
        manualOnly: false,
        maxInsightLength: 220,
        insightSafeMode: false,
        insightTone: 'professional',
        rankingBoostEnabled: false
      };
    }
    return {
      assistantEnabled: source.assistantEnabled !== false,
      insightEnabled: source.insightEnabled !== false,
      randomPercentage: Math.max(0, Math.min(100, Number(source.randomPercentage ?? 15) || 0)),
      manualOnly: Boolean(source.manualOnly),
      maxInsightLength: Math.max(60, Math.min(500, Number(source.maxInsightLength ?? 220) || 220)),
      insightSafeMode: Boolean(source.insightSafeMode),
      insightTone: String(source.insightTone || 'professional').trim() || 'professional',
      rankingBoostEnabled: Boolean(source.rankingBoostEnabled)
    };
  }, [normalizedMetadata]);

  const llmProvider = String(llmMetadata.provider || 'core');
  const usesOllamaAccelerator = llmProvider === 'ollama';

  const updateLlmMetadata = (patch: Record<string, any>) => {
    setConfig((prev: any) => {
      const metadata = prev?.metadata && typeof prev.metadata === 'object' && !Array.isArray(prev.metadata)
        ? { ...(prev.metadata as Record<string, any>) }
        : {};
      const llm = (metadata as any).llm && typeof (metadata as any).llm === 'object' && !Array.isArray((metadata as any).llm)
        ? { ...((metadata as any).llm as Record<string, any>) }
        : {};
      (metadata as any).llm = { ...llm, ...patch };
      return { ...prev, metadata };
    });
  };

  const updateLearningMetadata = (patch: Record<string, any>) => {
    setConfig((prev: any) => {
      const metadata = prev?.metadata && typeof prev.metadata === 'object' && !Array.isArray(prev.metadata)
        ? { ...(prev.metadata as Record<string, any>) }
        : {};
      const learning = (metadata as any).learning && typeof (metadata as any).learning === 'object' && !Array.isArray((metadata as any).learning)
        ? { ...((metadata as any).learning as Record<string, any>) }
        : {};
      (metadata as any).learning = { ...learning, ...patch };
      return { ...prev, metadata };
    });
  };

  const parseLines = (value: string) =>
    String(value || '')
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);

  const formatLines = (value: unknown) =>
    Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean).join('\n') : '';

  const updateKnowledgeMetadata = (patch: Record<string, any>) => {
    setConfig((prev: any) => {
      const metadata = prev?.metadata && typeof prev.metadata === 'object' && !Array.isArray(prev.metadata)
        ? { ...(prev.metadata as Record<string, any>) }
        : {};
      const knowledge = (metadata as any).knowledge && typeof (metadata as any).knowledge === 'object' && !Array.isArray((metadata as any).knowledge)
        ? { ...((metadata as any).knowledge as Record<string, any>) }
        : {};
      (metadata as any).knowledge = { ...knowledge, ...patch };
      return { ...prev, metadata };
    });
  };

  const updatePostAiMetadata = (patch: Record<string, any>) => {
    setConfig((prev: any) => {
      const metadata = prev?.metadata && typeof prev.metadata === 'object' && !Array.isArray(prev.metadata)
        ? { ...(prev.metadata as Record<string, any>) }
        : {};
      const postAi = (metadata as any).postAi && typeof (metadata as any).postAi === 'object' && !Array.isArray((metadata as any).postAi)
        ? { ...((metadata as any).postAi as Record<string, any>) }
        : {};
      (metadata as any).postAi = { ...postAi, ...patch };
      return { ...prev, metadata };
    });
  };

  const loadSkills = async () => {
    const data = await ScrolithaService.adminGetSkills(true);
    setSkills(Array.isArray(data) ? data : []);
  };

  const loadAudit = async (cursor?: string | null) => {
    const data = await ScrolithaService.adminGetAudit({ cursor: cursor || undefined, limit: 30 });
    if (cursor) {
      setAuditRows((prev) => [...prev, ...(data.items || [])]);
    } else {
      setAuditRows(data.items || []);
    }
    setAuditCursor(data.nextCursor || null);
  };

  const loadAnalytics = async () => {
    const data = await ScrolithaService.adminGetAnalytics();
    setAnalytics(data || null);
  };

  const loadLearningInsights = async () => {
    const data = await ScrolithaService.adminGetLearningInsights(400);
    setLearningInsights(data || null);
  };

  const loadChatRecords = async () => {
    const data = await ScrolithaService.adminGetChatRecords({
      limit: 20,
      scope: chatRecordScope,
      userId: chatRecordUserId.trim() || undefined
    });
    setChatRecords(Array.isArray(data?.items) ? data.items : []);
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      try {
        await Promise.all([loadConfig(), loadSkills(), loadAudit(null), loadAnalytics(), loadLearningInsights(), loadChatRecords()]);
      } catch (error: any) {
        if (!mounted) return;
        showNotification('error', 'Scrolitha', error?.message || 'Failed to load Scrolitha admin module.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [configScope, chatRecordScope]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      void loadConfig();
      void loadSkills();
      void loadAudit(null);
      void loadAnalytics();
      void loadLearningInsights();
      void loadChatRecords();
    };
    socket.on('scrolitha:config_updated', refresh);
    socket.on('scrolitha:skills_updated', refresh);
    socket.on('scrolitha:action_completed', refresh);
    socket.on('scrolitha:learning_updated', refresh);
    socket.on('scrolitha:post_ai_updated', refresh);
    return () => {
      socket.off('scrolitha:config_updated', refresh);
      socket.off('scrolitha:skills_updated', refresh);
      socket.off('scrolitha:action_completed', refresh);
      socket.off('scrolitha:learning_updated', refresh);
      socket.off('scrolitha:post_ai_updated', refresh);
    };
  }, [socket, configScope, chatRecordScope, chatRecordUserId]);

  useEffect(() => {
    if (isConnected) return;
    const timer = window.setInterval(() => {
      void loadConfig();
      void loadSkills();
      void loadAudit(null);
      void loadAnalytics();
      void loadLearningInsights();
      void loadChatRecords();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [isConnected, configScope, chatRecordScope, chatRecordUserId]);

  const submitChat = async () => {
    const value = message.trim();
    if (!value) return;
    setLoading(true);
    try {
      const data = await ScrolithaService.adminChat({ message: value, conversationId: conversationId || undefined, context: { page: '/admin/scrolitha' } });
      if (data?.conversationId) setConversationId(data.conversationId);
      setChatReply(data?.reply || 'No reply');
      setSuggestedActions(Array.isArray(data?.suggestedActions) ? data.suggestedActions : []);
      setMessage('');
    } catch (error: any) {
      showNotification('error', 'Scrolitha Console', error?.message || 'Chat request failed.');
    } finally {
      setLoading(false);
    }
  };

  const executeAction = async (action: ScrolithaSuggestedAction) => {
    setRunningActionId(action.actionId);
    try {
      const paramsText = actionParams[action.actionId] || '';
      const params = paramsText ? parseJson(paramsText) : action.paramsPreview || {};
      const result = await ScrolithaService.adminExecute({ actionId: action.actionId, confirmed: true, params });
      showNotification(
        'success',
        'Scrolitha Action',
        result?.success === false
          ? result?.message || 'Awaiting confirmation'
          : result?.summary ||
              (action.agent ? 'Action agent completed.' : 'Action completed.')
      );
      await Promise.all([loadAudit(null), loadAnalytics()]);
      setSuggestedActions((prev) => prev.filter((entry) => entry.actionId !== action.actionId));
    } catch (error: any) {
      showNotification('error', 'Scrolitha Action', error?.message || 'Execution failed.');
    } finally {
      setRunningActionId(null);
    }
  };

  const saveConfig = async () => {
    if (!config) return;
    setLoading(true);
    try {
      const metadata = config?.metadata && typeof config.metadata === 'object' && !Array.isArray(config.metadata)
        ? { ...config.metadata }
        : {};
      if (configScope === 'admin') {
        (metadata as any).chatWidget = { ...defaultWidgetSettings, ...widgetSettings };
      }
      const payload = {
        scope: configScope,
        enabled: Boolean(config.enabled),
        safeMode: Boolean(config.safeMode),
        requireConfirmationByDefault: Boolean(config.requireConfirmationByDefault),
        lowRiskAutoExecute: Boolean(config.lowRiskAutoExecute),
        denyListedTools: String(config.denyListedTools || '')
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
        promptBlocklist: String(config.promptBlocklist || '')
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
        userRateLimitPerMinute: Number(config.userRateLimitPerMinute || 30),
        adminActionCapPerMinute: Number(config.adminActionCapPerMinute || 10),
        metadata
      };
      await ScrolithaService.adminUpdateConfig(payload);
      await loadConfig();
      showNotification('success', 'Scrolitha Config', 'Policy configuration saved.');
    } catch (error: any) {
      showNotification('error', 'Scrolitha Config', error?.message || 'Failed to save policy config.');
    } finally {
      setLoading(false);
    }
  };

  const saveWidgetSettings = async () => {
    setLoading(true);
    try {
      const adminConfig = await ScrolithaService.adminGetConfig('admin');
      if (!adminConfig) {
        throw new Error('Admin config not found.');
      }
      const metadata = adminConfig?.metadata && typeof adminConfig.metadata === 'object' && !Array.isArray(adminConfig.metadata)
        ? { ...adminConfig.metadata }
        : {};
      metadata.chatWidget = { ...defaultWidgetSettings, ...widgetSettings };

      await ScrolithaService.adminUpdateConfig({
        scope: 'admin',
        enabled: Boolean(adminConfig.enabled),
        safeMode: Boolean(adminConfig.safeMode),
        requireConfirmationByDefault: Boolean(adminConfig.requireConfirmationByDefault),
        lowRiskAutoExecute: Boolean(adminConfig.lowRiskAutoExecute),
        denyListedTools: String(adminConfig.denyListedTools || '')
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
        promptBlocklist: String(adminConfig.promptBlocklist || '')
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
        userRateLimitPerMinute: Number(adminConfig.userRateLimitPerMinute || 30),
        adminActionCapPerMinute: Number(adminConfig.adminActionCapPerMinute || 10),
        metadata
      });

      await Promise.all([loadConfig(), loadChatRecords()]);
      showNotification('success', 'Chat Widget', 'Widget settings saved.');
    } catch (error: any) {
      showNotification('error', 'Chat Widget', error?.message || 'Failed to save widget settings.');
    } finally {
      setLoading(false);
    }
  };

  const onLogoSelected = (file: UploadedFile) => {
    setWidgetSettings((prev) => ({
      ...prev,
      logoUrl: String(file?.url || ''),
      logoFileId: String(file?.id || '')
    }));
    setShowLogoPicker(false);
  };

  const createSkill = async () => {
    if (!newSkill.key.trim() || !newSkill.name.trim()) {
      showNotification('warning', 'Skill', 'key and name are required.');
      return;
    }
    try {
      await ScrolithaService.adminCreateSkill({
        key: newSkill.key,
        name: newSkill.name,
        roleScope: newSkill.roleScope
          .split(',')
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean),
        description: newSkill.description,
        inputsSchema: [],
        stepsSchema: [],
        successCriteria: []
      });
      setNewSkill({ key: '', name: '', roleScope: 'freelancer,client,employer', description: '' });
      await loadSkills();
      showNotification('success', 'Skill', 'Skill created.');
    } catch (error: any) {
      showNotification('error', 'Skill', error?.message || 'Failed to create skill.');
    }
  };

  const deleteSkill = async (id: string) => {
    try {
      await ScrolithaService.adminDeleteSkill(id);
      await loadSkills();
      showNotification('success', 'Skill', 'Skill deleted.');
    } catch (error: any) {
      showNotification('error', 'Skill', error?.message || 'Failed to delete skill.');
    }
  };

  const regeneratePostInsights = async () => {
    const postIds = parseIdList(postAiTargetPostIds);
    setPostAiActionBusy(true);
    try {
      const result = await ScrolithaService.adminRegeneratePostInsights({
        postIds: postIds.length ? postIds : undefined,
        limit: postIds.length ? undefined : Math.max(1, Math.min(200, Math.floor(postAiBatchLimit || 40)))
      });
      showNotification(
        'success',
        'Post AI',
        `Insights regenerated: ${Number(result?.generated || 0)} (failed: ${Number(result?.failed || 0)})`
      );
      await Promise.all([loadAudit(null), loadAnalytics()]);
    } catch (error: any) {
      showNotification('error', 'Post AI', error?.message || 'Failed to regenerate post insights.');
    } finally {
      setPostAiActionBusy(false);
    }
  };

  const clearPostInsights = async () => {
    const postIds = parseIdList(postAiTargetPostIds);
    const warning = postIds.length
      ? `Clear AI insights for ${postIds.length} selected post(s)?`
      : 'Clear AI insights for all generated posts?';
    if (!window.confirm(warning)) return;

    setPostAiActionBusy(true);
    try {
      const result = await ScrolithaService.adminClearPostInsights({
        postIds: postIds.length ? postIds : undefined
      });
      showNotification('success', 'Post AI', `Insights cleared: ${Number(result?.updatedCount || 0)}`);
      await Promise.all([loadAudit(null), loadAnalytics()]);
    } catch (error: any) {
      showNotification('error', 'Post AI', error?.message || 'Failed to clear post insights.');
    } finally {
      setPostAiActionBusy(false);
    }
  };

  const totals = useMemo(() => analytics?.totals || {}, [analytics]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((entry) => {
            const Icon = entry.icon;
            const active = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm ${active ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'}`}
              >
                <Icon className="h-4 w-4" />
                {entry.label}
              </button>
            );
          })}
        </div>
      </section>

      {tab === 'console' ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Admin Console</h3>
          <p className="mt-1 text-xs text-slate-500">Chat with Scrolitha, preview actions, and execute with confirmation.</p>
          <div className="mt-3 flex gap-2">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="e.g. Approve monetization application app_123"
            />
            <button type="button" disabled={loading || !message.trim()} onClick={() => void submitChat()} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60">
              Send
            </button>
          </div>
          {chatReply ? <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{chatReply}</p> : null}

          <div className="mt-4 space-y-2">
            {suggestedActions.map((action) => (
              <div key={action.actionId} className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{action.actionKey}</p>
                    <p className="text-xs text-slate-500">{action.summary}</p>
                    {action.agent ? (
                      <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] text-slate-600">
                        <p className="font-medium text-slate-700">
                          Action agent: {action.agent.skillName || action.agent.skillKey}
                        </p>
                        <p className="mt-1">
                          {action.agent.stepCount} total steps, {action.agent.executableStepCount} runtime step
                          {action.agent.executableStepCount === 1 ? '' : 's'}.
                        </p>
                        <div className="mt-2 space-y-1">
                          {action.agent.steps.slice(0, 5).map((step) => (
                            <div key={`${action.actionId}-${step.index}`} className="flex items-start gap-2">
                              <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-semibold text-slate-600">
                                {step.index}
                              </span>
                              <div>
                                <p className="text-[11px] font-medium text-slate-700">{step.summary}</p>
                                <p className="text-[10px] text-slate-500">
                                  {step.mode}
                                  {step.toolKey ? ` • ${step.toolKey}` : ''}
                                </p>
                              </div>
                            </div>
                          ))}
                          {action.agent.steps.length > 5 ? (
                            <p className="text-[10px] text-slate-400">+{action.agent.steps.length - 5} more steps</p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <p className="text-[11px] text-slate-500">Tool: {action.toolKey} ({action.tool?.method} {action.tool?.endpoint})</p>
                  </div>
                  <button
                    type="button"
                    disabled={runningActionId === action.actionId}
                    onClick={() => void executeAction(action)}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {runningActionId === action.actionId ? 'Running...' : action.agent ? 'Run Agent' : 'Execute'}
                  </button>
                </div>
                <textarea
                  rows={2}
                  className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                  placeholder='Optional params JSON e.g. {"applicationId":"app_123","decision":"approve"}'
                  value={actionParams[action.actionId] || ''}
                  onChange={(event) =>
                    setActionParams((prev) => ({
                      ...prev,
                      [action.actionId]: event.target.value
                    }))
                  }
                />
              </div>
            ))}
            {suggestedActions.length === 0 ? <p className="text-xs text-slate-500">No action previews yet.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === 'policies' ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <label className="text-xs font-medium uppercase text-slate-500">Scope</label>
            <select value={configScope} onChange={(event) => setConfigScope(event.target.value as 'user' | 'admin')} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
              <option value="admin">admin</option>
              <option value="user">user</option>
            </select>
          </div>
          {config ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-700">
                  <input type="checkbox" className="mr-2" checked={Boolean(config.enabled)} onChange={(event) => setConfig((prev: any) => ({ ...prev, enabled: event.target.checked }))} />
                  Enabled
                </label>
                <label className="text-sm text-slate-700">
                  <input type="checkbox" className="mr-2" checked={Boolean(config.safeMode)} onChange={(event) => setConfig((prev: any) => ({ ...prev, safeMode: event.target.checked }))} />
                  Safe mode
                </label>
                <label className="text-sm text-slate-700">
                  <input type="checkbox" className="mr-2" checked={Boolean(config.requireConfirmationByDefault)} onChange={(event) => setConfig((prev: any) => ({ ...prev, requireConfirmationByDefault: event.target.checked }))} />
                  Confirm by default
                </label>
                <label className="text-sm text-slate-700">
                  <input type="checkbox" className="mr-2" checked={Boolean(config.lowRiskAutoExecute)} onChange={(event) => setConfig((prev: any) => ({ ...prev, lowRiskAutoExecute: event.target.checked }))} />
                  Auto-execute low risk
                </label>
                <label className="text-xs font-medium uppercase text-slate-500">
                  Deny-listed tools (comma-separated)
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" value={Array.isArray(config.denyListedTools) ? config.denyListedTools.join(',') : String(config.denyListedTools || '')} onChange={(event) => setConfig((prev: any) => ({ ...prev, denyListedTools: event.target.value }))} />
                </label>
                <label className="text-xs font-medium uppercase text-slate-500">
                  Prompt blocklist (comma-separated)
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" value={Array.isArray(config.promptBlocklist) ? config.promptBlocklist.join(',') : String(config.promptBlocklist || '')} onChange={(event) => setConfig((prev: any) => ({ ...prev, promptBlocklist: event.target.value }))} />
                </label>
                <label className="text-xs font-medium uppercase text-slate-500">
                  User rate limit / min
                  <input type="number" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" value={Number(config.userRateLimitPerMinute || 30)} onChange={(event) => setConfig((prev: any) => ({ ...prev, userRateLimitPerMinute: Number(event.target.value || 30) }))} />
                </label>
                <label className="text-xs font-medium uppercase text-slate-500">
                  Admin destructive cap / min
                  <input type="number" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" value={Number(config.adminActionCapPerMinute || 10)} onChange={(event) => setConfig((prev: any) => ({ ...prev, adminActionCapPerMinute: Number(event.target.value || 10) }))} />
                </label>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">LLM Settings (Ollama)</div>
                    <div className="text-xs text-slate-500">Stored in config metadata and applied instantly without redeploy.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={loading || !usesOllamaAccelerator}
                      onClick={async () => {
                        try {
                          setLoading(true);
                          await loadLlmHealth();
                        } catch (error: any) {
                          showNotification('error', 'Scrolitha LLM', error?.message || 'Health check failed.');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60"
                    >
                      Health
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={async () => {
                        try {
                          setLoading(true);
                          await loadLlmModels();
                        } catch (error: any) {
                          showNotification('error', 'Scrolitha LLM', error?.message || 'Failed to load models.');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60"
                    >
                      Load Models
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={llmMetadata.enabled !== false}
                      onChange={(event) => updateLlmMetadata({ enabled: event.target.checked })}
                    />
                    Enabled
                  </label>

                  <label className="text-xs font-medium uppercase text-slate-500">
                    Provider
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                      value={llmProvider}
                      onChange={(event) => updateLlmMetadata({ provider: event.target.value })}
                    >
                      <option value="core">scrolitha-core (recommended)</option>
                      <option value="ollama">ollama</option>
                      <option value="disabled">disabled</option>
                    </select>
                  </label>

                  <label className="text-xs font-medium uppercase text-slate-500">
                    Ollama Host
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                      placeholder="http://127.0.0.1:11434"
                      disabled={!usesOllamaAccelerator}
                      value={String(llmMetadata.ollamaHost || llmMetadata.host || '')}
                      onChange={(event) => updateLlmMetadata({ ollamaHost: event.target.value, host: event.target.value })}
                    />
                  </label>

                  <label className="text-xs font-medium uppercase text-slate-500">
                    Model
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                      placeholder={usesOllamaAccelerator ? 'llama3.1' : 'scrolitha-core'}
                      disabled={!usesOllamaAccelerator}
                      value={String(llmMetadata.ollamaModel || llmMetadata.model || '')}
                      onChange={(event) => updateLlmMetadata({ ollamaModel: event.target.value, model: event.target.value })}
                    />
                    {llmModels.length ? (
                      <select
                        className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        disabled={!usesOllamaAccelerator}
                        value={String(llmMetadata.ollamaModel || llmMetadata.model || '')}
                        onChange={(event) => updateLlmMetadata({ ollamaModel: event.target.value, model: event.target.value })}
                      >
                        <option value="">Select from server...</option>
                        {llmModels.map((m) => (
                          <option key={m} value={m}>{toScrolithaModelLabel(m)}</option>
                        ))}
                      </select>
                    ) : null}
                  </label>

                  <label className="text-xs font-medium uppercase text-slate-500">
                    Max Tokens
                    <input
                      type="number"
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                      value={Number(llmMetadata.maxTokens ?? 1024)}
                      onChange={(event) => updateLlmMetadata({ maxTokens: Number(event.target.value || 1024) })}
                    />
                  </label>

                  <label className="text-xs font-medium uppercase text-slate-500">
                    Temperature
                    <input
                      type="number"
                      step="0.05"
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                      value={Number(llmMetadata.temperature ?? 0.7)}
                      onChange={(event) => updateLlmMetadata({ temperature: Number(event.target.value || 0.7) })}
                    />
                  </label>

                  <label className="text-xs font-medium uppercase text-slate-500">
                    Top P
                    <input
                      type="number"
                      step="0.05"
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                      value={Number(llmMetadata.topP ?? 0.9)}
                      onChange={(event) => updateLlmMetadata({ topP: Number(event.target.value || 0.9) })}
                    />
                  </label>

                  <label className="text-xs font-medium uppercase text-slate-500">
                    Timeout (ms)
                    <input
                      type="number"
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                      value={Number(llmMetadata.timeoutMs ?? 25000)}
                      onChange={(event) => updateLlmMetadata({ timeoutMs: Number(event.target.value || 25000) })}
                    />
                  </label>

                  <label className="text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={Boolean(llmMetadata.allowGeminiFallback)}
                      onChange={(event) => updateLlmMetadata({ allowGeminiFallback: event.target.checked })}
                    />
                    Allow legacy fallback (Gemini/OpenAI)
                  </label>

                  <label className="text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={Boolean(llmMetadata.enableStreaming)}
                      onChange={(event) => updateLlmMetadata({ enableStreaming: event.target.checked })}
                    />
                    Enable streaming (future)
                  </label>
                </div>

                {!usesOllamaAccelerator ? (
                  <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    Scrolitha Core is the default enterprise-safe runtime. Ollama is optional and only needed if you want a
                    self-hosted local accelerator.
                  </div>
                ) : null}

                {llmHealth ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                    <div className="font-semibold">
                      Status:{' '}
                      <span
                        className={
                          llmHealth.status === 'disabled'
                            ? 'text-red-700'
                            : llmHealth.status === 'degraded'
                              ? 'text-amber-700'
                              : 'text-green-700'
                        }
                      >
                        {String(llmHealth.status || (llmHealth.ok ? 'operational' : 'error')).toUpperCase()}
                      </span>
                    </div>
                    <div className="mt-1">Runtime: {String(llmHealth.runtime || llmProvider || 'core')}</div>
                    <div>Host: {llmHealth.host || '-'}</div>
                    <div>Model: {toScrolithaModelLabel(llmHealth.model)}</div>
                    {llmHealth.note ? <div className="mt-1 text-slate-600">{String(llmHealth.note)}</div> : null}
                    {llmHealth.warning ? <div className="mt-1 text-amber-700">Warning: {String(llmHealth.warning)}</div> : null}
                    {llmHealth.error ? <div className="mt-1 text-red-700">Error: {String(llmHealth.error)}</div> : null}
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-semibold text-slate-900">Adaptive Learning</div>
                <div className="mt-1 text-xs text-slate-500">
                  Enables Scrolitha to improve response relevance from user conversations while keeping communication records auditable.
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={learningMetadata.enabled !== false}
                      onChange={(event) => updateLearningMetadata({ enabled: event.target.checked })}
                    />
                    Enable adaptive learning
                  </label>
                  <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                    Learning profiles are stored per user and surfaced in Admin records/analytics.
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-semibold text-slate-900">Scrolith Service Knowledge Base</div>
                <div className="mt-1 text-xs text-slate-500">
                  Manage the baseline knowledge Scrolitha uses about Scrolith, employer/client capabilities, and freelancer capabilities.
                </div>
                <div className="mt-3 space-y-3">
                  <label className="block text-xs font-medium uppercase text-slate-500">
                    Overview
                    <textarea
                      rows={3}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                      value={String(knowledgeMetadata.overview || '')}
                      onChange={(event) => updateKnowledgeMetadata({ overview: event.target.value })}
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase text-slate-500">
                    Core Services (one line per item)
                    <textarea
                      rows={4}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                      value={formatLines(knowledgeMetadata.coreServices)}
                      onChange={(event) => updateKnowledgeMetadata({ coreServices: parseLines(event.target.value) })}
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block text-xs font-medium uppercase text-slate-500">
                      Employer/Client Capabilities
                      <textarea
                        rows={5}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        value={formatLines(knowledgeMetadata.employerCapabilities)}
                        onChange={(event) => updateKnowledgeMetadata({ employerCapabilities: parseLines(event.target.value) })}
                      />
                    </label>
                    <label className="block text-xs font-medium uppercase text-slate-500">
                      Freelancer Capabilities
                      <textarea
                        rows={5}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        value={formatLines(knowledgeMetadata.freelancerCapabilities)}
                        onChange={(event) => updateKnowledgeMetadata({ freelancerCapabilities: parseLines(event.target.value) })}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {configScope === 'admin' ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Post AI Settings</div>
                      <div className="text-xs text-slate-500">
                        Governance for Create Post assistant and AI insight generation.
                      </div>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      Scrolitha + Ollama
                    </span>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={Boolean(postAiMetadata.assistantEnabled)}
                        onChange={(event) => updatePostAiMetadata({ assistantEnabled: event.target.checked })}
                      />
                      Enable AI Post Assistant
                    </label>
                    <label className="text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={Boolean(postAiMetadata.insightEnabled)}
                        onChange={(event) => updatePostAiMetadata({ insightEnabled: event.target.checked })}
                      />
                      Enable AI Insight System
                    </label>
                    <label className="text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={Boolean(postAiMetadata.manualOnly)}
                        onChange={(event) => updatePostAiMetadata({ manualOnly: event.target.checked })}
                      />
                      Enable Manual Insight Only
                    </label>
                    <label className="text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={Boolean(postAiMetadata.insightSafeMode)}
                        onChange={(event) => updatePostAiMetadata({ insightSafeMode: event.target.checked })}
                      />
                      Insight Safe Mode
                    </label>
                    <label className="text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={Boolean(postAiMetadata.rankingBoostEnabled)}
                        onChange={(event) => updatePostAiMetadata({ rankingBoostEnabled: event.target.checked })}
                      />
                      Enable AI Ranking Boost
                    </label>
                    <label className="text-xs font-medium uppercase text-slate-500">
                      Insight Tone
                      <select
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        value={String(postAiMetadata.insightTone || 'professional')}
                        onChange={(event) => updatePostAiMetadata({ insightTone: event.target.value })}
                      >
                        <option value="professional">professional</option>
                        <option value="neutral">neutral</option>
                        <option value="concise">concise</option>
                        <option value="friendly">friendly</option>
                        <option value="analytical">analytical</option>
                      </select>
                    </label>
                    <label className="text-xs font-medium uppercase text-slate-500 md:col-span-2">
                      Random Insight Percentage ({Math.round(Number(postAiMetadata.randomPercentage || 0))}%)
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        disabled={Boolean(postAiMetadata.manualOnly)}
                        value={Math.round(Number(postAiMetadata.randomPercentage || 0))}
                        onChange={(event) => updatePostAiMetadata({ randomPercentage: Number(event.target.value || 0) })}
                        className="mt-2 w-full"
                      />
                    </label>
                    <label className="text-xs font-medium uppercase text-slate-500">
                      Insight Max Length
                      <input
                        type="number"
                        min={60}
                        max={500}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        value={Number(postAiMetadata.maxInsightLength || 220)}
                        onChange={(event) => updatePostAiMetadata({ maxInsightLength: Number(event.target.value || 220) })}
                      />
                    </label>
                    <label className="text-xs font-medium uppercase text-slate-500">
                      Regenerate Batch Limit
                      <input
                        type="number"
                        min={1}
                        max={200}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        value={Number(postAiBatchLimit || 40)}
                        onChange={(event) => setPostAiBatchLimit(Number(event.target.value || 40))}
                      />
                    </label>
                    <label className="text-xs font-medium uppercase text-slate-500 md:col-span-2">
                      Selected Post IDs (comma/new line)
                      <textarea
                        rows={2}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        placeholder="Optional. Leave empty to use batch regenerate scope."
                        value={postAiTargetPostIds}
                        onChange={(event) => setPostAiTargetPostIds(event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void regeneratePostInsights()}
                      disabled={postAiActionBusy}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                    >
                      {postAiActionBusy ? 'Working...' : 'Regenerate Insight'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void clearPostInsights()}
                      disabled={postAiActionBusy}
                      className="rounded-md border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60"
                    >
                      {postAiActionBusy ? 'Working...' : 'Delete All Insights'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Loading config...</p>
          )}
          <div className="mt-4 flex justify-end">
            <button type="button" disabled={loading} onClick={() => void saveConfig()} className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60">
              Save Policies
            </button>
          </div>
        </section>
      ) : null}

      {tab === 'widget' ? (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Chat Widget Settings</h3>
            <p className="text-xs text-slate-500">Customize the Scrolitha support widget appearance and live behavior.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase text-slate-600">
              <input
                type="checkbox"
                checked={widgetSettings.enabled !== false}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              Widget enabled
            </label>
            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase text-slate-600">
              <input
                type="checkbox"
                checked={widgetSettings.showStatusBadge !== false}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, showStatusBadge: event.target.checked }))}
              />
              Show status badge
            </label>
            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase text-slate-600">
              <input
                type="checkbox"
                checked={widgetSettings.allowVoiceInput !== false}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, allowVoiceInput: event.target.checked }))}
              />
              Allow voice input
            </label>
            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase text-slate-600">
              <input
                type="checkbox"
                checked={widgetSettings.allowFileUpload !== false}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, allowFileUpload: event.target.checked }))}
              />
              Allow file upload
            </label>
            <label className="text-xs font-medium uppercase text-slate-500">
              Assistant Name
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={widgetSettings.assistantName}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, assistantName: event.target.value }))}
              />
            </label>
            <label className="text-xs font-medium uppercase text-slate-500">
              Role Label
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={widgetSettings.assistantRoleLabel}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, assistantRoleLabel: event.target.value }))}
              />
            </label>
            <label className="text-xs font-medium uppercase text-slate-500">
              Accent Color
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={widgetSettings.accentColor}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, accentColor: event.target.value }))}
              />
            </label>
            <label className="text-xs font-medium uppercase text-slate-500">
              Text Color
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={widgetSettings.textColor}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, textColor: event.target.value }))}
              />
            </label>
            <label className="text-xs font-medium uppercase text-slate-500">
              Agent Bubble Color
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={widgetSettings.agentBubbleColor}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, agentBubbleColor: event.target.value }))}
              />
            </label>
            <label className="text-xs font-medium uppercase text-slate-500">
              User Bubble Color
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={widgetSettings.userBubbleColor}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, userBubbleColor: event.target.value }))}
              />
            </label>
            <label className="text-xs font-medium uppercase text-slate-500 md:col-span-2">
              Welcome Message
              <textarea
                rows={2}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={widgetSettings.welcomeText}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, welcomeText: event.target.value }))}
              />
            </label>
            <label className="text-xs font-medium uppercase text-slate-500 md:col-span-2">
              Typing Message
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={widgetSettings.typingText}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, typingText: event.target.value }))}
              />
            </label>
            <label className="text-xs font-medium uppercase text-slate-500 md:col-span-2">
              Input Placeholder
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={widgetSettings.placeholderText || ''}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, placeholderText: event.target.value }))}
              />
            </label>
            <label className="text-xs font-medium uppercase text-slate-500 md:col-span-2">
              Empty State Message
              <textarea
                rows={2}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={widgetSettings.emptyStateText || ''}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, emptyStateText: event.target.value }))}
              />
            </label>
            <label className="text-xs font-medium uppercase text-slate-500 md:col-span-2">
              Offline Message
              <textarea
                rows={2}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={widgetSettings.offlineMessage || ''}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, offlineMessage: event.target.value }))}
              />
            </label>
            <label className="text-xs font-medium uppercase text-slate-500 md:col-span-2">
              Disclaimer
              <textarea
                rows={2}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={widgetSettings.disclaimerText || ''}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, disclaimerText: event.target.value }))}
              />
            </label>
            <label className="text-xs font-medium uppercase text-slate-500">
              Max History Items
              <input
                type="number"
                min={8}
                max={60}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={Number(widgetSettings.maxHistoryItems || 24)}
                onChange={(event) =>
                  setWidgetSettings((prev) => ({
                    ...prev,
                    maxHistoryItems: Math.max(8, Math.min(60, Number(event.target.value || 24) || 24))
                  }))
                }
              />
            </label>
            <label className="text-xs font-medium uppercase text-slate-500 md:col-span-2">
              Member Starter Prompts
              <textarea
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={Array.isArray(widgetSettings.starterPrompts) ? widgetSettings.starterPrompts.join('\n') : ''}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, starterPrompts: parseLines(event.target.value) }))}
                placeholder={'One prompt per line'}
              />
            </label>
            <label className="text-xs font-medium uppercase text-slate-500 md:col-span-2">
              Guest Starter Prompts
              <textarea
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={Array.isArray(widgetSettings.guestStarterPrompts) ? widgetSettings.guestStarterPrompts.join('\n') : ''}
                onChange={(event) => setWidgetSettings((prev) => ({ ...prev, guestStarterPrompts: parseLines(event.target.value) }))}
                placeholder={'One prompt per line'}
              />
            </label>
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto] md:items-end">
            <label className="text-xs font-medium uppercase text-slate-500">
              Chat Logo URL
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={widgetSettings.logoUrl}
                onChange={(event) =>
                  setWidgetSettings((prev) => ({
                    ...prev,
                    logoUrl: event.target.value,
                    logoFileId: prev.logoFileId || ''
                  }))
                }
                placeholder="https://..."
              />
            </label>
            <button
              type="button"
              onClick={() => setShowLogoPicker(true)}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700"
            >
              Choose Logo
            </button>
            <button
              type="button"
              onClick={() => setWidgetSettings((prev) => ({ ...prev, logoUrl: '', logoFileId: '' }))}
              className="rounded-md border border-rose-300 px-3 py-2 text-xs text-rose-700"
            >
              Clear Logo
            </button>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={loading}
              onClick={() => void saveWidgetSettings()}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              Save Widget Settings
            </button>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium uppercase text-slate-500">
                Record Scope
                <select
                  value={chatRecordScope}
                  onChange={(event) => setChatRecordScope(event.target.value as 'user' | 'admin')}
                  className="mt-1 w-36 rounded-md border border-slate-300 px-2 py-1 text-sm"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="text-xs font-medium uppercase text-slate-500">
                Filter by User ID
                <input
                  value={chatRecordUserId}
                  onChange={(event) => setChatRecordUserId(event.target.value)}
                  className="mt-1 w-72 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  placeholder="optional user id"
                />
              </label>
              <button
                type="button"
                onClick={() => void loadChatRecords()}
                className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700"
              >
                Refresh Records
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {chatRecords.map((record) => (
                <div key={record.id} className="rounded-md border border-slate-200 p-3 text-xs text-slate-700">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold text-slate-800">Conversation {record.id}</span>
                    <span>User: {record.userId}</span>
                    <span>Role: {record.userRole}</span>
                    <span>Updated: {formatDate(record.updatedAt)}</span>
                    <span>Messages: {record.messageCount}</span>
                  </div>
                  <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded border border-slate-100 bg-slate-50 p-2">
                    {(record.messages || []).map((msg: any) => (
                      <div key={msg.id} className="rounded bg-white px-2 py-1">
                        <span className="font-semibold text-slate-600">{String(msg.sender || 'unknown')}:</span>{' '}
                        <span>{String(msg.content || '')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {chatRecords.length === 0 ? <p className="text-xs text-slate-500">No chat records found.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {tab === 'skills' ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Skills Library</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <input className="rounded-md border border-slate-300 px-2 py-1 text-sm" placeholder="key" value={newSkill.key} onChange={(event) => setNewSkill((prev) => ({ ...prev, key: event.target.value }))} />
            <input className="rounded-md border border-slate-300 px-2 py-1 text-sm" placeholder="name" value={newSkill.name} onChange={(event) => setNewSkill((prev) => ({ ...prev, name: event.target.value }))} />
            <input className="rounded-md border border-slate-300 px-2 py-1 text-sm" placeholder="roleScope csv" value={newSkill.roleScope} onChange={(event) => setNewSkill((prev) => ({ ...prev, roleScope: event.target.value }))} />
            <button type="button" onClick={() => void createSkill()} className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white">Add Skill</button>
          </div>
          <textarea className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" rows={2} placeholder="description" value={newSkill.description} onChange={(event) => setNewSkill((prev) => ({ ...prev, description: event.target.value }))} />

          <div className="mt-4 space-y-2">
            {skills.map((skill) => (
              <div key={skill.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">{skill.key} (v{skill.version})</p>
                  <p className="text-xs text-slate-500">{skill.name} | roles: {(skill.roleScope || []).join(', ') || 'all'}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void ScrolithaService.adminUpdateSkill(skill.id, { isActive: !skill.isActive, bumpVersion: true }).then(loadSkills)} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                    {skill.isActive ? 'Disable' : 'Enable'}
                  </button>
                  <button type="button" onClick={() => void deleteSkill(skill.id)} className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700">
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {skills.length === 0 ? <p className="text-xs text-slate-500">No skills found.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === 'audit' ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Audit Logs</h3>
          <div className="mt-3 space-y-2">
            {auditRows.map((row) => (
              <div key={row.id} className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700">
                <p className="font-medium text-slate-800">{row.eventType} | {row.toolKey || '-'} | {row.resultStatus}</p>
                <p className="text-slate-500">actor {row.actorId} ({row.actorRole}) | {formatDate(row.createdAt)}</p>
                <p className="text-slate-500">{row.resultSummary || '-'}</p>
              </div>
            ))}
            {auditRows.length === 0 ? <p className="text-xs text-slate-500">No audit events yet.</p> : null}
          </div>
          {auditCursor ? (
            <div className="mt-3">
              <button type="button" onClick={() => void loadAudit(auditCursor)} className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700">
                Load More
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'analytics' ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Analytics</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">Conversations: {totals.conversations || 0}</p>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">Actions: {totals.actions || 0}</p>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">Failure Rate: {Number(totals.failureRate || 0).toFixed(3)}</p>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">Avg Rating: {Number(totals.avgRating || 0).toFixed(2)}</p>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">Feedback Count: {totals.feedbackCount || 0}</p>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">Estimated Minutes Saved: {totals.estimatedMinutesSaved || 0}</p>
          </div>

          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase text-slate-500">Top Tools</h4>
            <div className="mt-2 space-y-1">
              {(analytics?.topTools || []).map((entry: any) => (
                <p key={entry.toolKey} className="text-sm text-slate-700">{entry.toolKey}: {entry.count}</p>
              ))}
              {!Array.isArray(analytics?.topTools) || analytics.topTools.length === 0 ? <p className="text-xs text-slate-500">No tool usage data yet.</p> : null}
            </div>
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase text-slate-500">Adaptive Learning Insights</h4>
              <button
                type="button"
                onClick={() => void loadLearningInsights()}
                className="rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-700"
              >
                Refresh
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Users Scanned: {Number(learningInsights?.totals?.usersScanned || 0)}
              </p>
              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Users With Learning Profile: {Number(learningInsights?.totals?.usersWithLearningProfile || 0)}
              </p>
              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Recorded Interactions: {Number(learningInsights?.totals?.totalInteractions || 0)}
              </p>
            </div>

            <div className="mt-3">
              <div className="text-xs font-semibold uppercase text-slate-500">Top Learned Topics</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(learningInsights?.topTopics || []).slice(0, 20).map((entry: any) => (
                  <span
                    key={`${entry.topic}_${entry.count}`}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
                  >
                    {String(entry.topic)} ({Number(entry.count || 0)})
                  </span>
                ))}
                {!Array.isArray(learningInsights?.topTopics) || learningInsights.topTopics.length === 0 ? (
                  <p className="text-xs text-slate-500">No learning topics yet.</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <FilePickerModal
        isOpen={showLogoPicker}
        onClose={() => setShowLogoPicker(false)}
        onSelect={onLogoSelected}
        allowUpload
        filterType="image"
        acceptedTypes="image/*"
        role="admin"
        title="Select Chat Logo"
      />
    </div>
  );
};

export default ScrolithaManagement;
