import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Edit2, Moon, Plus, Power, RefreshCw, SendHorizonal } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

type JourneySummary = {
  templates: number;
  activeTemplates: number;
  flows: number;
  activeFlows: number;
  steps: number;
  pendingStepRuns: number;
  recentRuns: number;
  quietHours: number;
};

type NotificationTemplate = {
  id: string;
  key: string;
  label: string;
  description?: string;
  type: string;
  category: string;
  titleTemplate: string;
  bodyTemplate: string;
  pushTitleTemplate?: string;
  pushBodyTemplate?: string;
  emailSubjectTemplate?: string;
  emailTextTemplate?: string;
  actionUrlTemplate?: string;
  defaultMeta?: any;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  isSystemTemplate: boolean;
  isActive: boolean;
};

type JourneyStep = {
  id?: string;
  key: string;
  label: string;
  description?: string;
  templateId?: string;
  templateKey?: string;
  templateLabel?: string;
  channel: 'IN_APP' | 'PUSH' | 'EMAIL' | 'ALL';
  delayMinutes: number;
  orderIndex: number;
  actionUrl?: string;
  conditionConfig?: any;
  metadata?: any;
  isActive: boolean;
};

type JourneyFlow = {
  id: string;
  key: string;
  label: string;
  description?: string;
  triggerType: string;
  audienceType: string;
  audienceConfig?: any;
  metadata?: any;
  isSystemFlow: boolean;
  isActive: boolean;
  steps: JourneyStep[];
};

type JourneyRun = {
  id: string;
  flowLabel: string;
  flowKey: string;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  targetUser?: {
    email: string;
    name?: string;
    username?: string;
    role?: string;
  } | null;
  stepRuns: Array<{
    id: string;
    stepLabel: string;
    templateLabel: string;
    channel: string;
    status: string;
    scheduledFor: string;
    executedAt?: string | null;
  }>;
};

type QuietHourLookup = {
  user: {
    email: string;
    name?: string;
    username?: string;
    role?: string;
    timezone?: string;
  } | null;
  rules: Array<{
    id: string;
    label?: string;
    channel: string;
    timezone?: string;
    daysOfWeek: string[];
    startMinute: number;
    endMinute: number;
    isActive: boolean;
  }>;
};

const emptySummary: JourneySummary = {
  templates: 0,
  activeTemplates: 0,
  flows: 0,
  activeFlows: 0,
  steps: 0,
  pendingStepRuns: 0,
  recentRuns: 0,
  quietHours: 0
};

const emptyTemplateForm = {
  key: '',
  label: '',
  description: '',
  type: 'system',
  category: 'journey',
  titleTemplate: '',
  bodyTemplate: '',
  pushTitleTemplate: '',
  pushBodyTemplate: '',
  emailSubjectTemplate: '',
  emailTextTemplate: '',
  actionUrlTemplate: '',
  defaultMetaText: '{}',
  inAppEnabled: true,
  pushEnabled: false,
  emailEnabled: false,
  isSystemTemplate: false,
  isActive: true
};

const emptyFlowForm = {
  key: '',
  label: '',
  description: '',
  triggerType: 'MANUAL',
  audienceType: 'USER',
  audienceConfigText: '{}',
  metadataText: '{}',
  isSystemFlow: false,
  isActive: true,
  steps: [
    {
      key: 'step_1',
      label: 'Step 1',
      templateId: '',
      channel: 'ALL' as const,
      delayMinutes: 0,
      orderIndex: 0,
      actionUrl: '',
      description: '',
      conditionConfig: null,
      metadata: null,
      isActive: true
    }
  ]
};

const minuteToTime = (minute: number) => {
  const total = Number.isFinite(minute) ? minute : 0;
  const hours = String(Math.floor(total / 60)).padStart(2, '0');
  const minutes = String(total % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const NotificationJourneyCenter: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savingFlow, setSavingFlow] = useState(false);
  const [launchingRun, setLaunchingRun] = useState(false);
  const [summary, setSummary] = useState<JourneySummary>(emptySummary);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [flows, setFlows] = useState<JourneyFlow[]>([]);
  const [runs, setRuns] = useState<JourneyRun[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [templateQuery, setTemplateQuery] = useState('');
  const [flowQuery, setFlowQuery] = useState('');
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [flowForm, setFlowForm] = useState(emptyFlowForm);
  const [runIdentifier, setRunIdentifier] = useState('');
  const [runContextText, setRunContextText] = useState('{}');
  const [quietIdentifier, setQuietIdentifier] = useState('');
  const [quietLookup, setQuietLookup] = useState<QuietHourLookup>({ user: null, rules: [] });

  const templateOptions = useMemo(
    () => templates.filter((template) => template.isActive).map((template) => ({ id: template.id, label: template.label })),
    [templates]
  );

  const loadSummary = async () => {
    const data = await AdminService.getJourneySummary();
    setSummary(data || emptySummary);
  };

  const loadTemplates = async () => {
    const rows = await AdminService.getNotificationTemplates({ query: templateQuery || undefined });
    setTemplates(Array.isArray(rows) ? rows : []);
  };

  const loadFlows = async () => {
    const rows = await AdminService.getJourneyFlows({ query: flowQuery || undefined });
    setFlows(Array.isArray(rows) ? rows : []);
  };

  const loadRuns = async () => {
    const rows = await AdminService.getJourneyRuns({ limit: 20 });
    setRuns(Array.isArray(rows) ? rows : []);
  };

  const refreshAll = async () => {
    try {
      setRefreshing(true);
      await Promise.all([loadSummary(), loadTemplates(), loadFlows(), loadRuns()]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setLoading(true);
        await refreshAll();
      } catch (error: any) {
        showNotification('alert', 'Journey Center Error', error?.message || 'Failed to load Notification and Journey Center.');
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    const refresh = () => {
      refreshAll().catch(() => null);
    };
    window.addEventListener('journeys:updated', refresh as EventListener);
    window.addEventListener('notifications:preferences_updated', refresh as EventListener);
    return () => {
      window.removeEventListener('journeys:updated', refresh as EventListener);
      window.removeEventListener('notifications:preferences_updated', refresh as EventListener);
    };
  }, []);

  const resetTemplateForm = () => {
    setEditingTemplateId(null);
    setTemplateForm(emptyTemplateForm);
  };

  const startEditTemplate = (template: NotificationTemplate) => {
    setEditingTemplateId(template.id);
    setTemplateForm({
      key: template.key,
      label: template.label,
      description: template.description || '',
      type: template.type,
      category: template.category,
      titleTemplate: template.titleTemplate,
      bodyTemplate: template.bodyTemplate,
      pushTitleTemplate: template.pushTitleTemplate || '',
      pushBodyTemplate: template.pushBodyTemplate || '',
      emailSubjectTemplate: template.emailSubjectTemplate || '',
      emailTextTemplate: template.emailTextTemplate || '',
      actionUrlTemplate: template.actionUrlTemplate || '',
      defaultMetaText: JSON.stringify(template.defaultMeta || {}, null, 2),
      inAppEnabled: template.inAppEnabled !== false,
      pushEnabled: Boolean(template.pushEnabled),
      emailEnabled: Boolean(template.emailEnabled),
      isSystemTemplate: Boolean(template.isSystemTemplate),
      isActive: template.isActive !== false
    });
  };

  const saveTemplate = async () => {
    try {
      setSavingTemplate(true);
      const payload = {
        ...templateForm,
        description: templateForm.description || null,
        pushTitleTemplate: templateForm.pushTitleTemplate || null,
        pushBodyTemplate: templateForm.pushBodyTemplate || null,
        emailSubjectTemplate: templateForm.emailSubjectTemplate || null,
        emailTextTemplate: templateForm.emailTextTemplate || null,
        actionUrlTemplate: templateForm.actionUrlTemplate || null,
        defaultMeta: templateForm.defaultMetaText.trim() ? JSON.parse(templateForm.defaultMetaText) : {}
      };
      if (editingTemplateId) await AdminService.updateNotificationTemplate(editingTemplateId, payload);
      else await AdminService.createNotificationTemplate(payload);
      resetTemplateForm();
      await Promise.all([loadSummary(), loadTemplates()]);
      showNotification('success', 'Journey Center', 'Notification template saved.');
    } catch (error: any) {
      showNotification('alert', 'Template Save Failed', error?.message || 'Failed to save notification template.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const deactivateTemplate = async (template: NotificationTemplate) => {
    if (!window.confirm(`Deactivate ${template.label}?`)) return;
    try {
      await AdminService.deactivateNotificationTemplate(template.id);
      await Promise.all([loadSummary(), loadTemplates()]);
      showNotification('info', 'Journey Center', `${template.label} was deactivated.`);
    } catch (error: any) {
      showNotification('alert', 'Template Deactivate Failed', error?.message || 'Failed to deactivate template.');
    }
  };

  const resetFlowForm = () => {
    setEditingFlowId(null);
    setFlowForm(emptyFlowForm);
  };

  const startEditFlow = (flow: JourneyFlow) => {
    setEditingFlowId(flow.id);
    setFlowForm({
      key: flow.key,
      label: flow.label,
      description: flow.description || '',
      triggerType: flow.triggerType,
      audienceType: flow.audienceType,
      audienceConfigText: JSON.stringify(flow.audienceConfig || {}, null, 2),
      metadataText: JSON.stringify(flow.metadata || {}, null, 2),
      isSystemFlow: Boolean(flow.isSystemFlow),
      isActive: flow.isActive !== false,
      steps: flow.steps.map((step, index) => ({
        id: step.id,
        key: step.key,
        label: step.label,
        description: step.description || '',
        templateId: step.templateId || '',
        channel: step.channel,
        delayMinutes: Number(step.delayMinutes || 0),
        orderIndex: Number(step.orderIndex ?? index),
        actionUrl: step.actionUrl || '',
        conditionConfig: step.conditionConfig || null,
        metadata: step.metadata || null,
        isActive: step.isActive !== false
      }))
    });
  };

  const updateFlowStep = (index: number, patch: Record<string, any>) => {
    setFlowForm((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step))
    }));
  };

  const addFlowStep = () => {
    setFlowForm((current) => ({
      ...current,
      steps: current.steps.concat({
        key: `step_${current.steps.length + 1}`,
        label: `Step ${current.steps.length + 1}`,
        templateId: templateOptions[0]?.id || '',
        channel: 'ALL',
        delayMinutes: 0,
        orderIndex: current.steps.length,
        actionUrl: '',
        description: '',
        conditionConfig: null,
        metadata: null,
        isActive: true
      })
    }));
  };

  const removeFlowStep = (index: number) => {
    setFlowForm((current) => ({
      ...current,
      steps: current.steps.filter((_, stepIndex) => stepIndex !== index).map((step, stepIndex) => ({ ...step, orderIndex: stepIndex }))
    }));
  };

  const saveFlow = async () => {
    try {
      setSavingFlow(true);
      const payload = {
        key: flowForm.key,
        label: flowForm.label,
        description: flowForm.description || null,
        triggerType: flowForm.triggerType,
        audienceType: flowForm.audienceType,
        audienceConfig: flowForm.audienceConfigText.trim() ? JSON.parse(flowForm.audienceConfigText) : {},
        metadata: flowForm.metadataText.trim() ? JSON.parse(flowForm.metadataText) : {},
        isSystemFlow: flowForm.isSystemFlow,
        isActive: flowForm.isActive,
        steps: flowForm.steps.map((step, index) => ({
          ...step,
          description: step.description || null,
          actionUrl: step.actionUrl || null,
          orderIndex: index
        }))
      };
      if (editingFlowId) await AdminService.updateJourneyFlow(editingFlowId, payload);
      else await AdminService.createJourneyFlow(payload);
      resetFlowForm();
      await Promise.all([loadSummary(), loadFlows()]);
      showNotification('success', 'Journey Center', 'Journey flow saved.');
    } catch (error: any) {
      showNotification('alert', 'Flow Save Failed', error?.message || 'Failed to save journey flow.');
    } finally {
      setSavingFlow(false);
    }
  };

  const deactivateFlow = async (flow: JourneyFlow) => {
    if (!window.confirm(`Deactivate ${flow.label}?`)) return;
    try {
      await AdminService.deactivateJourneyFlow(flow.id);
      await Promise.all([loadSummary(), loadFlows()]);
      showNotification('info', 'Journey Center', `${flow.label} was deactivated.`);
      if (editingFlowId === flow.id) resetFlowForm();
    } catch (error: any) {
      showNotification('alert', 'Flow Deactivate Failed', error?.message || 'Failed to deactivate journey flow.');
    }
  };

  const launchRun = async () => {
    try {
      if (!editingFlowId && !flowForm.key) {
        showNotification('info', 'Journey Run', 'Select or create a flow first.');
        return;
      }
      if (!runIdentifier.trim()) {
        showNotification('info', 'Journey Run', 'Enter a user email, username, or ID.');
        return;
      }
      setLaunchingRun(true);
      await AdminService.triggerJourneyRun({
        flowId: editingFlowId || undefined,
        flowKey: editingFlowId ? undefined : flowForm.key,
        identifier: runIdentifier.trim(),
        context: runContextText.trim() ? JSON.parse(runContextText) : {}
      });
      await Promise.all([loadSummary(), loadRuns()]);
      showNotification('success', 'Journey Center', 'Journey run launched.');
    } catch (error: any) {
      showNotification('alert', 'Journey Launch Failed', error?.message || 'Failed to launch journey run.');
    } finally {
      setLaunchingRun(false);
    }
  };

  const lookupQuietHours = async () => {
    try {
      if (!quietIdentifier.trim()) {
        showNotification('info', 'Quiet Hours', 'Enter a user email, username, or ID.');
        return;
      }
      const data = await AdminService.getJourneyQuietHours(quietIdentifier.trim());
      setQuietLookup(data || { user: null, rules: [] });
    } catch (error: any) {
      showNotification('alert', 'Quiet Hours Lookup Failed', error?.message || 'Failed to load quiet hours.');
    }
  };

  if (loading) {
    return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading Notification and Journey Center...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Notification and Journey Center</h2>
          <p className="text-sm text-gray-500">Native templates, journey orchestration, quiet hours, and delivery history.</p>
        </div>
        <button onClick={refreshAll} className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Templates', value: `${summary.activeTemplates}/${summary.templates}` },
          { label: 'Flows', value: `${summary.activeFlows}/${summary.flows}` },
          { label: 'Steps Pending', value: summary.pendingStepRuns },
          { label: 'Quiet Hours', value: summary.quietHours }
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{card.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Notification Templates</h3>
              <p className="text-sm text-gray-500">Reusable in-app, push, and email content blocks.</p>
            </div>
            <button onClick={resetTemplateForm} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><Plus className="mr-2 inline h-4 w-4" />New</button>
          </div>
          <input value={templateQuery} onChange={(event) => setTemplateQuery(event.target.value)} onBlur={() => loadTemplates()} placeholder="Search templates" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          <div className="space-y-2">
            {templates.map((template) => (
              <div key={template.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-gray-900">{template.label}</div>
                    <div className="text-xs text-gray-500">{template.key} · {template.category}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEditTemplate(template)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><Edit2 className="mr-1 inline h-3.5 w-3.5" />Edit</button>
                    <button onClick={() => deactivateTemplate(template)} disabled={!template.isActive} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Power className="mr-1 inline h-3.5 w-3.5" />Deactivate</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={templateForm.key} onChange={(event) => setTemplateForm((current) => ({ ...current, key: event.target.value }))} placeholder="Template key" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <input value={templateForm.label} onChange={(event) => setTemplateForm((current) => ({ ...current, label: event.target.value }))} placeholder="Template label" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <input value={templateForm.type} onChange={(event) => setTemplateForm((current) => ({ ...current, type: event.target.value }))} placeholder="Type" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <input value={templateForm.category} onChange={(event) => setTemplateForm((current) => ({ ...current, category: event.target.value }))} placeholder="Category" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <textarea value={templateForm.description} onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" rows={2} className="rounded-lg border border-gray-200 px-3 py-2 text-sm md:col-span-2" />
            <input value={templateForm.titleTemplate} onChange={(event) => setTemplateForm((current) => ({ ...current, titleTemplate: event.target.value }))} placeholder="Title template" className="rounded-lg border border-gray-200 px-3 py-2 text-sm md:col-span-2" />
            <textarea value={templateForm.bodyTemplate} onChange={(event) => setTemplateForm((current) => ({ ...current, bodyTemplate: event.target.value }))} placeholder="Body template" rows={3} className="rounded-lg border border-gray-200 px-3 py-2 text-sm md:col-span-2" />
            <input value={templateForm.pushTitleTemplate} onChange={(event) => setTemplateForm((current) => ({ ...current, pushTitleTemplate: event.target.value }))} placeholder="Push title" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <input value={templateForm.pushBodyTemplate} onChange={(event) => setTemplateForm((current) => ({ ...current, pushBodyTemplate: event.target.value }))} placeholder="Push body" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <input value={templateForm.emailSubjectTemplate} onChange={(event) => setTemplateForm((current) => ({ ...current, emailSubjectTemplate: event.target.value }))} placeholder="Email subject" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <input value={templateForm.actionUrlTemplate} onChange={(event) => setTemplateForm((current) => ({ ...current, actionUrlTemplate: event.target.value }))} placeholder="Action URL template" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <textarea value={templateForm.emailTextTemplate} onChange={(event) => setTemplateForm((current) => ({ ...current, emailTextTemplate: event.target.value }))} placeholder="Email text" rows={3} className="rounded-lg border border-gray-200 px-3 py-2 text-sm md:col-span-2" />
            <textarea value={templateForm.defaultMetaText} onChange={(event) => setTemplateForm((current) => ({ ...current, defaultMetaText: event.target.value }))} placeholder="Default meta JSON" rows={4} className="rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs md:col-span-2" />
          </div>
          <button onClick={saveTemplate} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">{savingTemplate ? 'Saving...' : editingTemplateId ? 'Save Template' : 'Create Template'}</button>
        </div>
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Journey Flows</h3>
              <p className="text-sm text-gray-500">Manual flows with delayed steps and channel control.</p>
            </div>
            <button onClick={resetFlowForm} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><Plus className="mr-2 inline h-4 w-4" />New</button>
          </div>
          <input value={flowQuery} onChange={(event) => setFlowQuery(event.target.value)} onBlur={() => loadFlows()} placeholder="Search flows" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          <div className="space-y-2">
            {flows.map((flow) => (
              <div key={flow.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-gray-900">{flow.label}</div>
                    <div className="text-xs text-gray-500">{flow.key} · {flow.steps.length} steps</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEditFlow(flow)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><Edit2 className="mr-1 inline h-3.5 w-3.5" />Edit</button>
                    <button onClick={() => deactivateFlow(flow)} disabled={!flow.isActive} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Power className="mr-1 inline h-3.5 w-3.5" />Deactivate</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={flowForm.key} onChange={(event) => setFlowForm((current) => ({ ...current, key: event.target.value }))} placeholder="Flow key" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <input value={flowForm.label} onChange={(event) => setFlowForm((current) => ({ ...current, label: event.target.value }))} placeholder="Flow label" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <textarea value={flowForm.description} onChange={(event) => setFlowForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" rows={2} className="rounded-lg border border-gray-200 px-3 py-2 text-sm md:col-span-2" />
            <input value={flowForm.triggerType} onChange={(event) => setFlowForm((current) => ({ ...current, triggerType: event.target.value }))} placeholder="Trigger type" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <input value={flowForm.audienceType} onChange={(event) => setFlowForm((current) => ({ ...current, audienceType: event.target.value }))} placeholder="Audience type" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <textarea value={flowForm.audienceConfigText} onChange={(event) => setFlowForm((current) => ({ ...current, audienceConfigText: event.target.value }))} placeholder="Audience config JSON" rows={3} className="rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs md:col-span-2" />
            <textarea value={flowForm.metadataText} onChange={(event) => setFlowForm((current) => ({ ...current, metadataText: event.target.value }))} placeholder="Metadata JSON" rows={3} className="rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs md:col-span-2" />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">Flow Steps</h4>
              <button onClick={addFlowStep} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Add Step</button>
            </div>
            {flowForm.steps.map((step, index) => (
              <div key={`${step.id || 'new'}-${index}`} className="rounded-lg border border-gray-200 p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <input value={step.key} onChange={(event) => updateFlowStep(index, { key: event.target.value })} placeholder="Step key" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  <input value={step.label} onChange={(event) => updateFlowStep(index, { label: event.target.value })} placeholder="Step label" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  <select value={step.templateId || ''} onChange={(event) => updateFlowStep(index, { templateId: event.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <option value="">Select template</option>
                    {templateOptions.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
                  </select>
                  <select value={step.channel} onChange={(event) => updateFlowStep(index, { channel: event.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <option value="ALL">ALL</option>
                    <option value="IN_APP">IN_APP</option>
                    <option value="PUSH">PUSH</option>
                    <option value="EMAIL">EMAIL</option>
                  </select>
                  <input type="number" value={step.delayMinutes} onChange={(event) => updateFlowStep(index, { delayMinutes: Number(event.target.value || 0) })} placeholder="Delay minutes" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  <input value={step.actionUrl || ''} onChange={(event) => updateFlowStep(index, { actionUrl: event.target.value })} placeholder="Action URL override" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={step.isActive !== false} onChange={(event) => updateFlowStep(index, { isActive: event.target.checked })} className="rounded text-indigo-600" />
                    Step active
                  </label>
                  <button onClick={() => removeFlowStep(index)} disabled={flowForm.steps.length === 1} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Remove</button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={saveFlow} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">{savingFlow ? 'Saving...' : editingFlowId ? 'Save Flow' : 'Create Flow'}</button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,1fr]">
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <SendHorizonal className="h-5 w-5 text-indigo-600" />
            <div>
              <h3 className="text-lg font-bold text-gray-900">Run Launcher</h3>
              <p className="text-sm text-gray-500">Trigger the selected flow for one user by email, username, or user ID.</p>
            </div>
          </div>
          <input value={runIdentifier} onChange={(event) => setRunIdentifier(event.target.value)} placeholder="User email, username, or ID" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          <textarea value={runContextText} onChange={(event) => setRunContextText(event.target.value)} rows={6} placeholder='{"statusMessage":"Your proposal was shortlisted","eventTitle":"Creator Roundtable"}' className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs" />
          <button onClick={launchRun} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">{launchingRun ? 'Launching...' : 'Launch Journey'}</button>
          <div className="space-y-2 pt-2">
            <h4 className="font-semibold text-gray-900">Recent Runs</h4>
            {runs.map((run) => (
              <div key={run.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-gray-900">{run.flowLabel}</div>
                    <div className="text-xs text-gray-500">{run.targetUser?.name || run.targetUser?.email || 'Unknown user'} · {run.status}</div>
                  </div>
                  <div className="text-xs text-gray-500">{new Date(run.startedAt).toLocaleString()}</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {run.stepRuns.map((stepRun) => <span key={stepRun.id} className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">{stepRun.stepLabel}: {stepRun.status}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Moon className="h-5 w-5 text-indigo-600" />
            <div>
              <h3 className="text-lg font-bold text-gray-900">Quiet Hours Lookup</h3>
              <p className="text-sm text-gray-500">Inspect a user’s active quiet-hour rules before launching flows.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input value={quietIdentifier} onChange={(event) => setQuietIdentifier(event.target.value)} placeholder="User email, username, or ID" className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <button onClick={lookupQuietHours} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Lookup</button>
          </div>
          {quietLookup.user ? (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">
              <div className="font-semibold">{quietLookup.user.name || quietLookup.user.email}</div>
              <div className="text-xs">{quietLookup.user.email}</div>
              <div className="mt-1 text-xs">{quietLookup.user.role} · {quietLookup.user.timezone || 'Timezone not set'}</div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-400">No user loaded yet.</div>
          )}
          {quietLookup.rules.map((rule) => (
            <div key={rule.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">{rule.label || 'Quiet Hour Rule'}</div>
                  <div className="text-xs text-gray-500">{rule.channel} · {rule.timezone || 'Timezone not set'}</div>
                </div>
                <Bell className="h-4 w-4 text-indigo-600" />
              </div>
              <div className="mt-2 text-xs text-gray-500">{rule.daysOfWeek.length ? rule.daysOfWeek.join(', ') : 'All days'} · {minuteToTime(rule.startMinute)} to {minuteToTime(rule.endMinute)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NotificationJourneyCenter;
