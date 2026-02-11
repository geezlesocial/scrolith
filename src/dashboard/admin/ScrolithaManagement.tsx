import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Bot, FileSearch, Shield, Wrench } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import ScrolithaService, { ScrolithaSuggestedAction } from '../../services/scrolitha';

type TabId = 'console' | 'skills' | 'policies' | 'audit' | 'analytics';

const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'console', label: 'Console', icon: Bot },
  { id: 'skills', label: 'Skills Library', icon: Wrench },
  { id: 'policies', label: 'Policies & Security', icon: Shield },
  { id: 'audit', label: 'Audit Logs', icon: FileSearch },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 }
];

const parseJson = (value: string) => {
  const source = String(value || '').trim();
  if (!source) return {};
  return JSON.parse(source);
};

const formatDate = (value?: string | Date | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
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

  const [loading, setLoading] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);

  const [newSkill, setNewSkill] = useState({
    key: '',
    name: '',
    roleScope: 'freelancer,client,employer',
    description: ''
  });

  const loadConfig = async () => {
    const data = await ScrolithaService.adminGetConfig(configScope);
    if (data && data.scope) {
      setConfig(data);
    } else {
      setConfig(data?.[configScope] || null);
    }
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

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      try {
        await Promise.all([loadConfig(), loadSkills(), loadAudit(null), loadAnalytics()]);
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
  }, [configScope]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      void loadConfig();
      void loadSkills();
      void loadAudit(null);
      void loadAnalytics();
    };
    socket.on('scrolitha:config_updated', refresh);
    socket.on('scrolitha:skills_updated', refresh);
    socket.on('scrolitha:action_completed', refresh);
    return () => {
      socket.off('scrolitha:config_updated', refresh);
      socket.off('scrolitha:skills_updated', refresh);
      socket.off('scrolitha:action_completed', refresh);
    };
  }, [socket, configScope]);

  useEffect(() => {
    if (isConnected) return;
    const timer = window.setInterval(() => {
      void loadConfig();
      void loadSkills();
      void loadAudit(null);
      void loadAnalytics();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [isConnected, configScope]);

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
      showNotification('success', 'Scrolitha Action', result?.success === false ? result?.message || 'Awaiting confirmation' : 'Action completed.');
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
        adminActionCapPerMinute: Number(config.adminActionCapPerMinute || 10)
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
                    <p className="text-[11px] text-slate-500">Tool: {action.toolKey} ({action.tool?.method} {action.tool?.endpoint})</p>
                  </div>
                  <button
                    type="button"
                    disabled={runningActionId === action.actionId}
                    onClick={() => void executeAction(action)}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {runningActionId === action.actionId ? 'Running...' : 'Execute'}
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
        </section>
      ) : null}
    </div>
  );
};

export default ScrolithaManagement;
