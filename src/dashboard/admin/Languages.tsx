import React, { useEffect, useState, useRef } from 'react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';
import { Save, Plus, Upload, Download, FileText, Trash2, Edit, Globe } from 'lucide-react';

const emptyLang = { name: '', code: '', flutterCode: '', isDefault: false };

const LanguagesAdmin: React.FC = () => {
  const { showNotification } = useNotification();
  const [languages, setLanguages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const langs = await AdminService.getLanguages();
      setLanguages(Array.isArray(langs) ? langs : []);
    } catch (e) {
      console.error(e);
      setLanguages([]);
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setEditing({ ...emptyLang });
    setIsAddOpen(true);
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name || !editing.code) {
      showNotification('alert', 'Missing fields', 'Please provide both a name and code.');
      return;
    }
    try {
      const saved = await AdminService.saveLanguage(editing);
      showNotification('success', 'Saved', 'Language saved successfully.');
      setIsAddOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      showNotification('alert', 'Save failed', 'Unable to save language');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete language? This cannot be undone.')) return;
    try {
      await AdminService.deleteLanguage(id);
      showNotification('success', 'Deleted', 'Language removed');
      await load();
    } catch (e) {
      showNotification('alert', 'Delete failed', 'Unable to delete language');
    }
  };

  const onImportClick = (langId: string) => {
    if (!fileRef.current) return;
    fileRef.current.onchange = async (ev: any) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        await AdminService.importTranslations(langId, file);
        showNotification('success', 'Imported', 'Translations imported successfully');
        await load();
      } catch (e) {
        showNotification('alert', 'Import failed', 'Unable to import translations');
      } finally {
        ev.target.value = '';
      }
    };
    fileRef.current.click();
  };

  const onExport = async (langId: string) => {
    try {
      const content = await AdminService.exportArb(langId);
      if (!content) throw new Error('No content');
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${langId || 'translations'}.arb`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showNotification('success', 'Exported', 'Translation file downloaded');
    } catch (e) {
      showNotification('alert', 'Export failed', 'Unable to export translations');
    }
  };

  const onTranslate = async (lang: any) => {
    // Gather keys to translate from default language (if any)
    const defaultLang = languages.find(l => l.isDefault) || languages[0];
    const source = defaultLang?.translations || {};
    const keys = Object.keys(source || {});
    if (keys.length === 0) {
      showNotification('alert', 'No keys', 'No translation keys available to translate');
      return;
    }
    try {
      const texts = keys.map(k => source[k] || k);
      const translations = await AdminService.translateByGoogle(texts, lang.code);
      // merge
      const mapping: Record<string,string> = {};
      keys.forEach((k, i) => mapping[k] = translations[i] || texts[i]);
      const updated = { ...(lang || {}), translations: { ...(lang.translations || {}), ...mapping } };
      await AdminService.saveLanguage(updated);
      showNotification('success', 'Translated', 'Google translations applied (where available)');
      await load();
    } catch (e) {
      showNotification('alert', 'Translate failed', 'Unable to translate automatically');
    }
  };

  const onSyncForApp = async (langId: string) => {
    try {
      const ok = await AdminService.syncForApp(langId);
      if (ok) showNotification('success', 'Synced', 'Translations synced for app'); else showNotification('alert', 'Sync not available', 'Server does not support app sync');
    } catch (e) {
      showNotification('alert', 'Sync failed', 'Unable to sync translations for app');
    }
  };

  const toggleDefault = async (id: string) => {
    try {
      const next = languages.map(l => ({ ...l, isDefault: l.id === id }));
      // save each language with updated isDefault; prefer backend call
      for (const l of next) {
        await AdminService.saveLanguage(l);
      }
      showNotification('success', 'Default set', 'Default language updated');
      await load();
    } catch (e) {
      showNotification('alert', 'Update failed', 'Unable to set default language');
    }
  };

  const toggleActive = async (id: string) => {
    try {
      const next = languages.map(l => l.id === id ? { ...l, isActive: !l.isActive } : l);
      for (const l of next) {
        await AdminService.saveLanguage(l);
      }
      showNotification('success', 'Updated', 'Language active state updated');
      await load();
    } catch (e) {
      showNotification('alert', 'Update failed', 'Unable to update active state');
    }
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm">
      <input ref={fileRef} type="file" accept=".json,.arb" className="hidden" />

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Languages</h2>
        <div className="flex items-center gap-2">
          <button onClick={openAdd} className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg">
            <Plus className="w-4 h-4 mr-2" /> Add New Language
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-12 gap-4 items-center font-semibold text-sm text-gray-600 mb-3">
              <div className="col-span-6">Name</div>
              <div className="col-span-1">Active</div>
              <div className="col-span-1">Default</div>
              <div className="col-span-4 text-right">Options</div>
            </div>

            {(languages || []).map((l: any) => (
              <div key={l.id} className="grid grid-cols-12 gap-4 items-center py-3 border-t border-gray-100">
                <div className="col-span-6 flex items-center gap-3">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-gray-500">{l.code}{l.flutterCode ? ` · ${l.flutterCode}` : ''}</div>
                </div>
                <div className="col-span-1">
                  <label className="inline-flex items-center">
                    <input type="checkbox" checked={!!l.isActive} onChange={() => toggleActive(l.id)} />
                    <span className="ml-2 text-xs text-gray-600">On</span>
                  </label>
                </div>
                <div className="col-span-1">
                  <label className="inline-flex items-center">
                    <input type="radio" checked={!!l.isDefault} onChange={() => toggleDefault(l.id)} />
                    <span className="ml-2 text-xs text-gray-600">Default</span>
                  </label>
                </div>
                <div className="col-span-4 text-right space-x-2">
                  <button onClick={() => onImportClick(l.id)} className="inline-flex items-center px-3 py-1.5 bg-white border rounded text-sm">
                    <Upload className="w-4 h-4 mr-2" /> Import
                  </button>
                  <button onClick={() => onExport(l.id)} className="inline-flex items-center px-3 py-1.5 bg-white border rounded text-sm">
                    <Download className="w-4 h-4 mr-2" /> Export
                  </button>
                  <button onClick={() => onTranslate(l)} className="inline-flex items-center px-3 py-1.5 bg-white border rounded text-sm">
                    <Globe className="w-4 h-4 mr-2" /> Translate
                  </button>
                  <button onClick={() => onSyncForApp(l.id)} className="inline-flex items-center px-3 py-1.5 bg-white border rounded text-sm">
                    <FileText className="w-4 h-4 mr-2" /> Sync App
                  </button>
                  <button onClick={() => remove(l.id)} className="inline-flex items-center px-3 py-1.5 bg-white border rounded text-sm text-red-600">
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </button>
                </div>
              </div>
            ))}

            {(languages || []).length === 0 && (
              <div className="p-8 text-center text-gray-500">No languages configured yet.</div>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Modal (simple inline panel) */}
      {isAddOpen && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 w-[720px]">
            <h3 className="font-bold text-lg mb-4">Add Language</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600">Language Name</label>
                <input className="w-full border p-2 rounded mt-1" value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Language Code (short)</label>
                <input className="w-full border p-2 rounded mt-1" value={editing.code} onChange={e => setEditing({...editing, code: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Flutter App Lang Code</label>
                <input className="w-full border p-2 rounded mt-1" value={editing.flutterCode} onChange={e => setEditing({...editing, flutterCode: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Default</label>
                <input type="checkbox" checked={!!editing.isDefault} onChange={e => setEditing({...editing, isDefault: e.target.checked})} />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setIsAddOpen(false); setEditing(null); }} className="px-4 py-2 border rounded">Cancel</button>
              <button onClick={save} className="px-4 py-2 bg-indigo-600 text-white rounded inline-flex items-center"><Save className="w-4 h-4 mr-2" /> Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguagesAdmin;
