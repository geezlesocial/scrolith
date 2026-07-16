import React, { useEffect, useMemo, useState } from 'react';
import { useNotification } from '../../context/NotificationContext';
import {
  ContentTranslationService,
  type ContentTranslationConfig,
  type ContentTranslationGlossaryEntry,
  type ContentTranslationOverview,
  type ContentTranslationAuditLog
} from '../../services/contentTranslation';

const parseLocaleList = (value: string) =>
  Array.from(new Set(String(value || '').split(/[\n,]/).map((item) => item.trim().toLowerCase()).filter(Boolean)));

const ContentTranslationPanel: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overview, setOverview] = useState<ContentTranslationOverview | null>(null);
  const [glossary, setGlossary] = useState<ContentTranslationGlossaryEntry[]>([]);
  const [audit, setAudit] = useState<ContentTranslationAuditLog[]>([]);
  const [configForm, setConfigForm] = useState<Partial<ContentTranslationConfig>>({});
  const [sourceLocalesText, setSourceLocalesText] = useState('');
  const [targetLocalesText, setTargetLocalesText] = useState('');
  const [runtimeApiKey, setRuntimeApiKey] = useState('');
  const [glossaryDraft, setGlossaryDraft] = useState<Partial<ContentTranslationGlossaryEntry>>({
    sourceText: '',
    replacementText: '',
    locale: '',
    targetLocale: '',
    enabled: true,
    caseSensitive: false,
    priority: 100
  });
  const [editingGlossaryId, setEditingGlossaryId] = useState<string | null>(null);
  const [testText, setTestText] = useState('Hola desde Scrolith. #RemoteWork @support');
  const [testSourceLocale, setTestSourceLocale] = useState('');
  const [testTargetLocale, setTestTargetLocale] = useState('en');
  const [testResult, setTestResult] = useState<Record<string, any> | null>(null);

  const loadPanel = async () => {
    setLoading(true);
    try {
      const [overviewPayload, glossaryPayload, auditPayload] = await Promise.all([
        ContentTranslationService.getAdminOverview(),
        ContentTranslationService.listAdminGlossary(),
        ContentTranslationService.listAdminAudit()
      ]);
      setOverview(overviewPayload);
      setGlossary(glossaryPayload.items || []);
      setAudit(auditPayload.items || []);
      setConfigForm(overviewPayload.config || {});
      setSourceLocalesText((overviewPayload.config?.enabledSourceLocales || []).join(', '));
      setTargetLocalesText((overviewPayload.config?.enabledTargetLocales || []).join(', '));
      setTestTargetLocale(overviewPayload.config?.defaultTargetLocale || 'en');
    } catch (error: any) {
      showNotification('error', 'Languages', error?.message || 'Failed to load content translation controls');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => overview?.stats || null, [overview]);

  const saveConfig = async () => {
    try {
      setSaving(true);
      const updated = await ContentTranslationService.updateAdminConfig({
        ...configForm,
        enabledSourceLocales: parseLocaleList(sourceLocalesText),
        enabledTargetLocales: parseLocaleList(targetLocalesText),
        runtimeApiKey: runtimeApiKey || undefined
      });
      setConfigForm(updated);
      setRuntimeApiKey('');
      showNotification('success', 'Languages', 'Content translation settings updated');
      await loadPanel();
    } catch (error: any) {
      showNotification('error', 'Languages', error?.response?.data?.message || error?.message || 'Failed to save translation settings');
    } finally {
      setSaving(false);
    }
  };

  const submitGlossary = async () => {
    try {
      setSaving(true);
      if (editingGlossaryId) {
        await ContentTranslationService.updateAdminGlossaryEntry(editingGlossaryId, glossaryDraft);
      } else {
        await ContentTranslationService.createAdminGlossaryEntry(glossaryDraft);
      }
      setEditingGlossaryId(null);
      setGlossaryDraft({
        sourceText: '',
        replacementText: '',
        locale: '',
        targetLocale: '',
        enabled: true,
        caseSensitive: false,
        priority: 100
      });
      showNotification('success', 'Languages', `Glossary entry ${editingGlossaryId ? 'updated' : 'created'}`);
      await loadPanel();
    } catch (error: any) {
      showNotification('error', 'Languages', error?.response?.data?.message || error?.message || 'Failed to save glossary entry');
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    try {
      setSaving(true);
      const result = await ContentTranslationService.runAdminTest({
        text: testText,
        sourceLocale: testSourceLocale || undefined,
        targetLocale: testTargetLocale || undefined
      });
      setTestResult(result);
      showNotification('success', 'Languages', 'Translation test completed');
    } catch (error: any) {
      setTestResult(null);
      showNotification('error', 'Languages', error?.response?.data?.message || error?.message || 'Failed to run translation test');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading content translation controls...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Content Translation</h3>
          <p className="text-sm text-gray-500">Server-side post translation controls for feed, detail, and mobile surfaces.</p>
        </div>
        <button type="button" onClick={() => void loadPanel()} className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Refresh
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-xs uppercase text-gray-500">Ready translations</div><div className="mt-2 text-2xl font-semibold text-gray-900">{stats?.readyTranslations ?? 0}</div></div>
        <div className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-xs uppercase text-gray-500">Detections</div><div className="mt-2 text-2xl font-semibold text-gray-900">{stats?.detectionCount ?? 0}</div></div>
        <div className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-xs uppercase text-gray-500">Glossary entries</div><div className="mt-2 text-2xl font-semibold text-gray-900">{stats?.glossaryCount ?? 0}</div></div>
        <div className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-xs uppercase text-gray-500">Failed translations</div><div className="mt-2 text-2xl font-semibold text-gray-900">{stats?.failedTranslations ?? 0}</div></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-gray-900">Engine & Policy</h4>
            <span className="text-xs text-gray-500">Stored in admin-controlled backend config</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={Boolean(configForm.enabled)} onChange={(e) => setConfigForm((prev) => ({ ...prev, enabled: e.target.checked }))} /> Enable translation</label>
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={Boolean(configForm.translateOnDemand)} onChange={(e) => setConfigForm((prev) => ({ ...prev, translateOnDemand: e.target.checked }))} /> Translate on demand</label>
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={Boolean(configForm.autoTranslatePosts)} onChange={(e) => setConfigForm((prev) => ({ ...prev, autoTranslatePosts: e.target.checked }))} /> Auto-translate hot posts later</label>
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={Boolean(configForm.preserveGlossaryTerms)} onChange={(e) => setConfigForm((prev) => ({ ...prev, preserveGlossaryTerms: e.target.checked }))} /> Preserve glossary terms</label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <select className="border rounded p-2" value={configForm.runtimeMode || 'self_hosted_m2m100'} onChange={(e) => setConfigForm((prev) => ({ ...prev, runtimeMode: e.target.value as ContentTranslationConfig['runtimeMode'] }))}>
              <option value="self_hosted_m2m100">Self-hosted M2M100 runtime</option>
              <option value="mock">Mock runtime</option>
            </select>
            <input className="border rounded p-2" value={configForm.engineKey || ''} onChange={(e) => setConfigForm((prev) => ({ ...prev, engineKey: e.target.value }))} placeholder="engine key" />
            <input className="border rounded p-2" value={configForm.detectorKey || ''} onChange={(e) => setConfigForm((prev) => ({ ...prev, detectorKey: e.target.value }))} placeholder="detector key" />
            <input className="border rounded p-2" value={configForm.defaultTargetLocale || ''} onChange={(e) => setConfigForm((prev) => ({ ...prev, defaultTargetLocale: e.target.value }))} placeholder="default target locale" />
            <input className="border rounded p-2 md:col-span-2" value={configForm.runtimeBaseUrl || ''} onChange={(e) => setConfigForm((prev) => ({ ...prev, runtimeBaseUrl: e.target.value }))} placeholder="runtime base URL" />
            <input className="border rounded p-2 md:col-span-2" value={runtimeApiKey} onChange={(e) => setRuntimeApiKey(e.target.value)} placeholder={configForm.runtimeApiKeyConfigured ? 'Runtime API key configured. Enter a new value to rotate it.' : 'runtime API key'} />
            <textarea className="border rounded p-2 md:col-span-2" rows={2} value={sourceLocalesText} onChange={(e) => setSourceLocalesText(e.target.value)} placeholder="enabled source locales" />
            <textarea className="border rounded p-2 md:col-span-2" rows={2} value={targetLocalesText} onChange={(e) => setTargetLocalesText(e.target.value)} placeholder="enabled target locales" />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <input className="border rounded p-2" type="number" value={Number(configForm.maxCharactersPerRequest || 5000)} onChange={(e) => setConfigForm((prev) => ({ ...prev, maxCharactersPerRequest: Number(e.target.value || 5000) }))} placeholder="max chars" />
            <input className="border rounded p-2" type="number" value={Number(configForm.timeoutMs || 10000)} onChange={(e) => setConfigForm((prev) => ({ ...prev, timeoutMs: Number(e.target.value || 10000) }))} placeholder="timeout ms" />
            <input className="border rounded p-2" type="number" value={Number(configForm.cacheTtlSeconds || 0)} onChange={(e) => setConfigForm((prev) => ({ ...prev, cacheTtlSeconds: Number(e.target.value || 0) }))} placeholder="cache ttl seconds" />
          </div>
          <button type="button" onClick={saveConfig} disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving...' : 'Save translation settings'}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <h4 className="font-semibold text-gray-900">Translation Test</h4>
          <textarea className="w-full border rounded p-2 text-sm" rows={6} value={testText} onChange={(e) => setTestText(e.target.value)} />
          <div className="grid gap-3 md:grid-cols-2">
            <input className="border rounded p-2" value={testSourceLocale} onChange={(e) => setTestSourceLocale(e.target.value)} placeholder="source locale optional" />
            <input className="border rounded p-2" value={testTargetLocale} onChange={(e) => setTestTargetLocale(e.target.value)} placeholder="target locale" />
          </div>
          <button type="button" onClick={runTest} disabled={saving} className="rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Running...' : 'Run translation test'}
          </button>
          {testResult ? <pre className="overflow-x-auto rounded bg-gray-50 p-3 text-xs text-gray-700">{JSON.stringify(testResult, null, 2)}</pre> : null}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <h4 className="font-semibold text-gray-900">Glossary / Protected Terms</h4>
        <div className="grid gap-3 md:grid-cols-6">
          <input className="border rounded p-2 md:col-span-2" value={glossaryDraft.sourceText || ''} onChange={(e) => setGlossaryDraft((prev) => ({ ...prev, sourceText: e.target.value }))} placeholder="source text" />
          <input className="border rounded p-2 md:col-span-2" value={glossaryDraft.replacementText || ''} onChange={(e) => setGlossaryDraft((prev) => ({ ...prev, replacementText: e.target.value }))} placeholder="replacement text" />
          <input className="border rounded p-2" value={glossaryDraft.locale || ''} onChange={(e) => setGlossaryDraft((prev) => ({ ...prev, locale: e.target.value }))} placeholder="source locale optional" />
          <input className="border rounded p-2" value={glossaryDraft.targetLocale || ''} onChange={(e) => setGlossaryDraft((prev) => ({ ...prev, targetLocale: e.target.value }))} placeholder="target locale optional" />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
          <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(glossaryDraft.enabled)} onChange={(e) => setGlossaryDraft((prev) => ({ ...prev, enabled: e.target.checked }))} /> Enabled</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(glossaryDraft.caseSensitive)} onChange={(e) => setGlossaryDraft((prev) => ({ ...prev, caseSensitive: e.target.checked }))} /> Case sensitive</label>
          <input className="border rounded p-2 w-32" type="number" value={Number(glossaryDraft.priority || 100)} onChange={(e) => setGlossaryDraft((prev) => ({ ...prev, priority: Number(e.target.value || 100) }))} placeholder="priority" />
          <button type="button" onClick={submitGlossary} disabled={saving} className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60">
            {editingGlossaryId ? 'Update entry' : 'Add entry'}
          </button>
        </div>
        <div className="space-y-2">
          {glossary.map((entry) => (
            <div key={entry.id} className="grid gap-2 rounded border border-gray-200 p-3 md:grid-cols-[2fr_2fr_1fr_1fr_auto] md:items-center">
              <div className="text-sm text-gray-800">{entry.sourceText}</div>
              <div className="text-sm text-gray-600">{entry.replacementText}</div>
              <div className="text-xs uppercase text-gray-500">{entry.locale || 'all'}</div>
              <div className="text-xs uppercase text-gray-500">{entry.targetLocale || 'all'}</div>
              <div className="flex gap-2">
                <button type="button" className="text-blue-600 hover:underline" onClick={() => { setEditingGlossaryId(entry.id); setGlossaryDraft(entry); }}>Edit</button>
                <button type="button" className="text-red-600 hover:underline" onClick={async () => { await ContentTranslationService.deleteAdminGlossaryEntry(entry.id); await loadPanel(); }}>Delete</button>
              </div>
            </div>
          ))}
          {!glossary.length ? <div className="text-sm text-gray-500">No glossary entries yet. Add protected terms like Scrolith and Gcoin here.</div> : null}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h4 className="font-semibold text-gray-900">Recent Audit</h4>
        {audit.map((entry) => (
          <div key={entry.id} className="rounded border border-gray-200 p-3 text-sm">
            <div className="font-medium text-gray-900">{entry.eventType}</div>
            <div className="text-xs text-gray-500">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}</div>
            {entry.metadata ? <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 text-xs text-gray-700">{JSON.stringify(entry.metadata, null, 2)}</pre> : null}
          </div>
        ))}
        {!audit.length ? <div className="text-sm text-gray-500">No content translation audit entries yet.</div> : null}
      </div>
    </div>
  );
};

export default ContentTranslationPanel;
