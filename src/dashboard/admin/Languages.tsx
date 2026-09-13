import React, { useEffect, useMemo, useState } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { I18nService, I18nConfig, TextOverrideRow, TranslationKeyRow, TranslationValueRow } from '../../services/i18n';
import ContentTranslationPanel from './ContentTranslationPanel';
import LocalizationHubPanel from '../../components/dashboard/LocalizationHubPanel';

type TabId = 'settings' | 'keys' | 'editor' | 'overrides' | 'import_export' | 'content_translation';

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'settings', label: 'Locales & Settings' },
  { id: 'keys', label: 'Translation Keys' },
  { id: 'editor', label: 'Translate / Correct' },
  { id: 'overrides', label: 'Quick Fix Overrides' },
  { id: 'import_export', label: 'Import / Export' },
  { id: 'content_translation', label: 'Content Translation' }
];

const defaultConfig: I18nConfig = {
  defaultLocale: 'en',
  enabledLocales: ['en'],
  rtlLocales: ['ar', 'he', 'fa', 'ur'],
  dictionaryCacheSeconds: 300,
  overridesCacheSeconds: 300
};

const parseLocaleList = (value: string) =>
  Array.from(new Set(String(value || '').split(/[\n,]/).map((item) => item.trim().toLowerCase()).filter(Boolean)));

const LanguagesAdmin: React.FC = () => {
  const { showNotification } = useNotification();
  const [tab, setTab] = useState<TabId>('settings');
  const [loading, setLoading] = useState(true);

  const [config, setConfig] = useState<I18nConfig>(defaultConfig);
  const [defaultLocale, setDefaultLocale] = useState('en');
  const [enabledLocalesText, setEnabledLocalesText] = useState('en');
  const [rtlLocalesText, setRtlLocalesText] = useState('ar, he, fa, ur');

  const [search, setSearch] = useState('');
  const [keys, setKeys] = useState<TranslationKeyRow[]>([]);
  const [keyPage, setKeyPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [selectedKey, setSelectedKey] = useState<TranslationKeyRow | null>(null);

  const [valueRows, setValueRows] = useState<TranslationValueRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});

  const [overrideRows, setOverrideRows] = useState<TextOverrideRow[]>([]);
  const [overrideDraft, setOverrideDraft] = useState<Partial<TextOverrideRow>>({
    locale: 'en',
    matchText: '',
    replacementText: '',
    isRegex: false,
    enabled: true,
    priority: 100
  });
  const [editOverrideId, setEditOverrideId] = useState<string | null>(null);

  const [importFormat, setImportFormat] = useState<'json' | 'csv'>('json');
  const [importLocale, setImportLocale] = useState('en');
  const [importContent, setImportContent] = useState('');
  const [importReport, setImportReport] = useState('');
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [exportLocale, setExportLocale] = useState('en');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadKeys = async (page = keyPage, query = search) => {
    const payload = await I18nService.listKeys({ page, limit: 25, search: query || undefined });
    setKeys(payload.items || []);
    setKeyPage(payload.page || 1);
    setTotalPages(payload.totalPages || 1);
  };

  const loadOverrides = async () => {
    const payload = await I18nService.listOverrides({ page: 1, limit: 200 });
    setOverrideRows(payload.items || []);
  };

  const loadValues = async (row: TranslationKeyRow | null) => {
    if (!row) {
      setValueRows([]);
      setValues({});
      return;
    }
    const payload = await I18nService.listValues({ keyId: row.id });
    const items = payload.items || [];
    setValueRows(items);
    const map: Record<string, string> = {};
    items.forEach((item) => {
      map[item.locale] = item.value || '';
    });
    setValues(map);
  };

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      try {
        const cfg = { ...defaultConfig, ...(await I18nService.getAdminConfig()) };
        if (!mounted) return;
        setConfig(cfg);
        setDefaultLocale(cfg.defaultLocale);
        setEnabledLocalesText(cfg.enabledLocales.join(', '));
        setRtlLocalesText(cfg.rtlLocales.join(', '));
        setImportLocale(cfg.defaultLocale);
        setExportLocale(cfg.defaultLocale);
        await Promise.all([loadKeys(1, ''), loadOverrides()]);
      } catch (error: any) {
        showNotification('error', 'Language', error?.message || 'Failed to load language module');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void init();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadValues(selectedKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey?.id]);

  const keysWithMissing = useMemo(() => {
    return (keys || []).map((item: any) => {
      const localesPresent = new Set((item.values || []).map((value: any) => String(value.locale || '').toLowerCase()));
      const missingLocales = config.enabledLocales.filter((locale) => !localesPresent.has(locale.toLowerCase()));
      return { ...item, missingLocales };
    });
  }, [config.enabledLocales, keys]);

  const visibleKeys = useMemo(
    () => (showMissingOnly ? keysWithMissing.filter((item: any) => item.missingLocales.length > 0) : keysWithMissing),
    [keysWithMissing, showMissingOnly]
  );

  const saveConfig = async () => {
    try {
      const payload = await I18nService.updateAdminConfig({
        defaultLocale: defaultLocale.trim().toLowerCase(),
        enabledLocales: parseLocaleList(enabledLocalesText),
        rtlLocales: parseLocaleList(rtlLocalesText)
      });
      const merged = { ...defaultConfig, ...(payload || {}) };
      setConfig(merged);
      showNotification('success', 'Language', 'Configuration updated');
    } catch (error: any) {
      showNotification('error', 'Language', error?.response?.data?.message || error?.message || 'Failed to save config');
    }
  };

  const saveAllValues = async () => {
    if (!selectedKey) return;
    try {
      for (const locale of config.enabledLocales) {
        await I18nService.upsertValue({ key: selectedKey.key, locale, value: values[locale] || '' });
      }
      await loadValues(selectedKey);
      showNotification('success', 'Language', 'Translations saved');
    } catch (error: any) {
      showNotification('error', 'Language', error?.response?.data?.message || error?.message || 'Failed to save values');
    }
  };

  if (loading) return <div className="p-6 bg-white rounded-xl shadow-sm">Loading language module...</div>;

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm space-y-4">
      <h2 className="text-xl font-bold">Language Module (SSOT)</h2>
      <LocalizationHubPanel />
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button key={item.id} onClick={() => setTab(item.id)} className={`px-3 py-1.5 rounded ${tab === item.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'settings' && (
        <div className="grid md:grid-cols-3 gap-3">
          <input className="border rounded p-2" value={defaultLocale} onChange={(e) => setDefaultLocale(e.target.value)} placeholder="default locale" />
          <input className="border rounded p-2" value={enabledLocalesText} onChange={(e) => setEnabledLocalesText(e.target.value)} placeholder="enabled locales" />
          <input className="border rounded p-2" value={rtlLocalesText} onChange={(e) => setRtlLocalesText(e.target.value)} placeholder="rtl locales" />
          <button onClick={saveConfig} className="px-4 py-2 bg-blue-600 text-white rounded">Save Config</button>
        </div>
      )}

      {tab === 'keys' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input className="border rounded p-2 flex-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search keys/value" />
            <button onClick={() => void loadKeys(1, search)} className="px-3 py-2 bg-gray-100 rounded">Search</button>
            <label className="text-sm inline-flex items-center gap-2"><input type="checkbox" checked={showMissingOnly} onChange={(e) => setShowMissingOnly(e.target.checked)} />Missing only</label>
          </div>
          <div className="flex gap-2">
            <input className="border rounded p-2 flex-1" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="new key e.g. auth.login.title" />
            <button
              onClick={async () => {
                if (!newKey.trim()) return;
                try {
                  setBusyAction('createKey');
                  await I18nService.createKey({ key: newKey.trim() });
                  setNewKey('');
                  await loadKeys(1, search);
                  showNotification('success', 'Language', 'Translation key added');
                } catch (error: any) {
                  showNotification(
                    'error',
                    'Language',
                    error?.response?.data?.message || error?.message || 'Failed to add translation key'
                  );
                } finally {
                  setBusyAction(null);
                }
              }}
              disabled={busyAction === 'createKey'}
              className="px-3 py-2 bg-blue-600 text-white rounded"
            >
              Add
            </button>
          </div>
          <div className="border rounded overflow-hidden">
            {visibleKeys.map((row: any) => (
              <div key={row.id} className="grid grid-cols-12 gap-2 border-t p-2 items-center text-sm">
                <button className="col-span-6 text-left font-medium hover:underline" onClick={() => { setSelectedKey(row); setTab('editor'); }}>{row.key}</button>
                <div className="col-span-4 text-xs text-amber-700">{row.missingLocales?.length ? row.missingLocales.join(', ') : 'Complete'}</div>
                <button
                  className="col-span-2 text-red-600 text-right"
                  onClick={async () => {
                    if (!window.confirm(`Delete key ${row.key}?`)) return;
                    try {
                      setBusyAction(`deleteKey:${row.id}`);
                      await I18nService.deleteKey(row.id);
                      await loadKeys(keyPage, search);
                      showNotification('success', 'Language', 'Translation key deleted');
                    } catch (error: any) {
                      showNotification(
                        'error',
                        'Language',
                        error?.response?.data?.message || error?.message || 'Failed to delete translation key'
                      );
                    } finally {
                      setBusyAction(null);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
            {!visibleKeys.length && <div className="p-3 text-sm text-gray-500">No keys found.</div>}
          </div>
          <div className="flex justify-between text-sm">
            <span>Page {keyPage} / {totalPages}</span>
            <div className="space-x-2">
              <button disabled={keyPage <= 1} onClick={() => void loadKeys(keyPage - 1, search)} className="px-2 py-1 border rounded disabled:opacity-40">Prev</button>
              <button disabled={keyPage >= totalPages} onClick={() => void loadKeys(keyPage + 1, search)} className="px-2 py-1 border rounded disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'editor' && (
        <div className="space-y-3">
          {!selectedKey ? (
            <div className="text-sm text-gray-600">Select a key from the Translation Keys tab.</div>
          ) : (
            <>
              <div className="text-sm font-semibold">{selectedKey.key}</div>
              {config.enabledLocales.map((locale) => (
                <div key={locale} className="space-y-1">
                  <div className="text-xs uppercase font-semibold text-gray-600">{locale}</div>
                  <textarea className="w-full border rounded p-2 text-sm" rows={3} value={values[locale] || ''} onChange={(e) => setValues((prev) => ({ ...prev, [locale]: e.target.value }))} />
                </div>
              ))}
              <button onClick={saveAllValues} className="px-4 py-2 bg-blue-600 text-white rounded">Save Translations</button>
              <div className="text-xs text-gray-500">Existing translations loaded: {valueRows.length}</div>
            </>
          )}
        </div>
      )}

      {tab === 'overrides' && (
        <div className="space-y-3">
          <div className="grid md:grid-cols-6 gap-2">
            <input className="border rounded p-2" placeholder="locale" value={overrideDraft.locale || ''} onChange={(e) => setOverrideDraft((prev) => ({ ...prev, locale: e.target.value }))} />
            <input className="border rounded p-2 md:col-span-2" placeholder="find text" value={overrideDraft.matchText || ''} onChange={(e) => setOverrideDraft((prev) => ({ ...prev, matchText: e.target.value }))} />
            <input className="border rounded p-2 md:col-span-2" placeholder="replace with" value={overrideDraft.replacementText || ''} onChange={(e) => setOverrideDraft((prev) => ({ ...prev, replacementText: e.target.value }))} />
            <input className="border rounded p-2" type="number" placeholder="priority" value={overrideDraft.priority ?? 100} onChange={(e) => setOverrideDraft((prev) => ({ ...prev, priority: Number(e.target.value || 100) }))} />
          </div>
          <div className="flex gap-4 text-sm">
            <label><input type="checkbox" checked={Boolean(overrideDraft.enabled)} onChange={(e) => setOverrideDraft((prev) => ({ ...prev, enabled: e.target.checked }))} /> Enabled</label>
            <label><input type="checkbox" checked={Boolean(overrideDraft.isRegex)} onChange={(e) => setOverrideDraft((prev) => ({ ...prev, isRegex: e.target.checked }))} /> Regex</label>
            <button
              onClick={async () => {
                if (!overrideDraft.locale || !overrideDraft.matchText) return;
                try {
                  setBusyAction(editOverrideId ? `updateOverride:${editOverrideId}` : 'createOverride');
                  if (editOverrideId) {
                    await I18nService.updateOverride(editOverrideId, overrideDraft);
                  } else {
                    await I18nService.createOverride(overrideDraft as any);
                  }
                  setEditOverrideId(null);
                  setOverrideDraft({ locale: config.defaultLocale, matchText: '', replacementText: '', isRegex: false, enabled: true, priority: 100 });
                  await loadOverrides();
                  showNotification('success', 'Language', `Override ${editOverrideId ? 'updated' : 'created'}`);
                } catch (error: any) {
                  showNotification(
                    'error',
                    'Language',
                    error?.response?.data?.message || error?.message || 'Failed to save override'
                  );
                } finally {
                  setBusyAction(null);
                }
              }}
              disabled={Boolean(busyAction)}
              className="px-3 py-2 bg-blue-600 text-white rounded"
            >
              {editOverrideId ? 'Update' : 'Add'} Override
            </button>
          </div>
          <div className="border rounded overflow-hidden">
            {overrideRows.map((row) => (
              <div key={row.id} className="grid grid-cols-12 gap-2 border-t p-2 text-sm items-center">
                <div className="col-span-1 uppercase">{row.locale}</div>
                <div className="col-span-4 truncate" title={row.matchText}>{row.matchText}</div>
                <div className="col-span-4 truncate" title={row.replacementText}>{row.replacementText}</div>
                <div className="col-span-1">{row.priority}</div>
                <button className="col-span-1 text-blue-600" onClick={() => { setEditOverrideId(row.id); setOverrideDraft(row); }}>Edit</button>
                <button
                  className="col-span-1 text-red-600"
                  onClick={async () => {
                    if (!window.confirm('Delete override?')) return;
                    try {
                      setBusyAction(`deleteOverride:${row.id}`);
                      await I18nService.deleteOverride(row.id);
                      await loadOverrides();
                      showNotification('success', 'Language', 'Override deleted');
                    } catch (error: any) {
                      showNotification(
                        'error',
                        'Language',
                        error?.response?.data?.message || error?.message || 'Failed to delete override'
                      );
                    } finally {
                      setBusyAction(null);
                    }
                  }}
                >
                  Del
                </button>
              </div>
            ))}
            {!overrideRows.length && <div className="p-3 text-sm text-gray-500">No overrides.</div>}
          </div>
        </div>
      )}

      {tab === 'import_export' && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border rounded p-3 space-y-2">
            <h3 className="font-semibold">Import</h3>
            <div className="flex gap-2">
              <select className="border rounded p-2" value={importFormat} onChange={(e) => setImportFormat(e.target.value as 'json' | 'csv')}>
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
              <input className="border rounded p-2" value={importLocale} onChange={(e) => setImportLocale(e.target.value)} placeholder="locale" />
            </div>
            <textarea className="w-full border rounded p-2 text-xs font-mono" rows={10} value={importContent} onChange={(e) => setImportContent(e.target.value)} />
            {importReport && <div className="text-xs bg-gray-50 border border-gray-200 rounded p-2 whitespace-pre-wrap">{importReport}</div>}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    setBusyAction('validateImport');
                    const payload = importFormat === 'json'
                      ? { format: 'json', locale: importLocale, json: importContent || '{}', validateOnly: true }
                      : { format: 'csv', locale: importLocale, csv: importContent, validateOnly: true };
                    const result = await I18nService.importData(payload as any);
                    setImportReport(JSON.stringify(result || {}, null, 2));
                    showNotification('success', 'Language', 'Import validation completed');
                  } catch (error: any) {
                    setImportReport('');
                    showNotification(
                      'error',
                      'Language',
                      error?.response?.data?.message || error?.message || 'Import validation failed'
                    );
                  } finally {
                    setBusyAction(null);
                  }
                }}
                disabled={Boolean(busyAction)}
                className="px-3 py-2 bg-gray-100 text-gray-800 rounded"
              >
                Validate
              </button>
              <button
                onClick={async () => {
                  try {
                    setBusyAction('importData');
                    const payload = importFormat === 'json'
                      ? { format: 'json', locale: importLocale, json: importContent || '{}' }
                      : { format: 'csv', locale: importLocale, csv: importContent };
                    const result = await I18nService.importData(payload as any);
                    setImportReport(JSON.stringify(result || {}, null, 2));
                    await loadKeys(1, search);
                    showNotification('success', 'Language', 'Import completed');
                  } catch (error: any) {
                    setImportReport('');
                    showNotification(
                      'error',
                      'Language',
                      error?.response?.data?.message || error?.message || 'Import failed'
                    );
                  } finally {
                    setBusyAction(null);
                  }
                }}
                disabled={Boolean(busyAction)}
                className="px-3 py-2 bg-blue-600 text-white rounded"
              >
                Import
              </button>
            </div>
          </div>
          <div className="border rounded p-3 space-y-2">
            <h3 className="font-semibold">Export</h3>
            <div className="flex gap-2">
              <select className="border rounded p-2" value={exportFormat} onChange={(e) => setExportFormat(e.target.value as 'json' | 'csv')}>
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
              <input className="border rounded p-2" value={exportLocale} onChange={(e) => setExportLocale(e.target.value)} placeholder="locale" />
            </div>
            <button
              onClick={async () => {
                try {
                  setBusyAction('exportData');
                  const payload = await I18nService.exportData({ format: exportFormat, locale: exportLocale });
                  const blob = new Blob([payload.content || ''], { type: exportFormat === 'csv' ? 'text/csv' : 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = payload.filename || `translations-${exportLocale}.${exportFormat}`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  showNotification('success', 'Language', 'Export generated');
                } catch (error: any) {
                  showNotification(
                    'error',
                    'Language',
                    error?.response?.data?.message || error?.message || 'Failed to export translations'
                  );
                } finally {
                  setBusyAction(null);
                }
              }}
              disabled={Boolean(busyAction)}
              className="px-3 py-2 bg-gray-900 text-white rounded"
            >
              Export
            </button>
          </div>
        </div>
      )}

      {tab === 'content_translation' && <ContentTranslationPanel />}
    </div>
  );
};

export default LanguagesAdmin;
