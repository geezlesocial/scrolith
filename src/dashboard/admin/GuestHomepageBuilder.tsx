import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, Plus, Save, Trash2, UploadCloud } from 'lucide-react';
import { CMSService } from '../../services/cms';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';

type GuestSectionType =
  | 'guest_hero_auth'
  | 'guest_what_is_scrolith'
  | 'guest_paths'
  | 'guest_feature_showcase'
  | 'guest_trending_preview'
  | 'guest_community_preview'
  | 'guest_final_cta';

const SECTION_TYPES: GuestSectionType[] = [
  'guest_hero_auth',
  'guest_what_is_scrolith',
  'guest_paths',
  'guest_feature_showcase',
  'guest_trending_preview',
  'guest_community_preview',
  'guest_final_cta'
];

const uid = () => `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeDraft = (payload: any) => {
  const source = payload?.draft || payload || {};
  const sections = Array.isArray(source.sections) ? source.sections : [];
  const seo = source.seo || {};
  return {
    sections: sections.map((section: any, index: number) => ({
      id: String(section?.id || uid()),
      type: String(section?.type || 'guest_hero_auth'),
      name: String(section?.name || `Section ${index + 1}`),
      isActive: section?.isActive !== false,
      position: Number(section?.position || index + 1),
      content: section?.content && typeof section.content === 'object' ? section.content : {}
    })),
    seo: {
      title: String(seo?.title || ''),
      metaDescription: String(seo?.metaDescription || ''),
      keywords: Array.isArray(seo?.keywords)
        ? seo.keywords.join(', ')
        : String(seo?.keywords || ''),
      ogImage: String(seo?.ogImage || '')
    }
  };
};

const GuestHomepageBuilder: React.FC = () => {
  const { showNotification } = useNotification();
  const { socket } = useSocket();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [newType, setNewType] = useState<GuestSectionType>('guest_hero_auth');
  const [draft, setDraft] = useState<{ sections: any[]; seo: any }>({ sections: [], seo: {} });
  const [contentDrafts, setContentDrafts] = useState<Record<string, string>>({});

  const orderedSections = useMemo(
    () => [...draft.sections].sort((a, b) => Number(a.position || 0) - Number(b.position || 0)),
    [draft.sections]
  );

  const loadDraft = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await CMSService.getGuestHomepageDraft();
      const normalized = normalizeDraft(payload);
      setDraft(normalized);
      const nextContentDrafts: Record<string, string> = {};
      normalized.sections.forEach((section: any) => {
        nextContentDrafts[section.id] = JSON.stringify(section.content || {}, null, 2);
      });
      setContentDrafts(nextContentDrafts);
    } catch (error: any) {
      showNotification('error', 'Guest Homepage', error?.message || 'Failed to load guest homepage draft.');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  useEffect(() => {
    if (!socket) return;
    const handler = () => loadDraft();
    socket.on('homepage:guest_updated', handler);
    return () => {
      socket.off('homepage:guest_updated', handler);
    };
  }, [socket, loadDraft]);

  const syncSections = async (sections: any[], seo = draft.seo) => {
    setSaving(true);
    try {
      await CMSService.reorderGuestHomepageSections({
        sections: sections.map((section, index) => ({
          ...section,
          position: index + 1
        })),
        seo: {
          ...seo,
          keywords: String(seo?.keywords || '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
        }
      });
      showNotification('success', 'Guest Homepage', 'Draft updated successfully.');
      await loadDraft();
    } catch (error: any) {
      showNotification('error', 'Guest Homepage', error?.message || 'Failed to update guest homepage draft.');
    } finally {
      setSaving(false);
    }
  };

  const updateSectionContentDraft = (sectionId: string, value: string) => {
    setContentDrafts((prev) => ({ ...prev, [sectionId]: value }));
  };

  const saveSection = async (section: any) => {
    setSaving(true);
    try {
      const contentRaw = contentDrafts[section.id] || '{}';
      let content = {};
      try {
        content = JSON.parse(contentRaw || '{}');
      } catch {
        throw new Error(`Section "${section.name}" content must be valid JSON.`);
      }
      await CMSService.saveGuestHomepageSection({
        sectionId: section.id,
        section: {
          ...section,
          content
        }
      });
      showNotification('success', 'Guest Homepage', `"${section.name}" saved.`);
      await loadDraft();
    } catch (error: any) {
      showNotification('error', 'Guest Homepage', error?.message || 'Failed to save section.');
    } finally {
      setSaving(false);
    }
  };

  const addSection = async () => {
    const section = {
      id: uid(),
      type: newType,
      name: `New ${newType}`,
      isActive: true,
      position: orderedSections.length + 1,
      content: {}
    };
    await saveSection(section);
  };

  const removeSection = async (sectionId: string) => {
    setSaving(true);
    try {
      await CMSService.saveGuestHomepageSection({ sectionId, remove: true });
      showNotification('success', 'Guest Homepage', 'Section removed.');
      await loadDraft();
    } catch (error: any) {
      showNotification('error', 'Guest Homepage', error?.message || 'Failed to remove section.');
    } finally {
      setSaving(false);
    }
  };

  const moveSection = async (index: number, direction: 'up' | 'down') => {
    const next = [...orderedSections];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    await syncSections(next);
  };

  const saveSeo = async () => {
    await syncSections(orderedSections, draft.seo);
  };

  const publish = async () => {
    setPublishing(true);
    try {
      await CMSService.publishGuestHomepage();
      showNotification('success', 'Guest Homepage', 'Guest homepage published successfully.');
      await loadDraft();
    } catch (error: any) {
      showNotification('error', 'Guest Homepage', error?.message || 'Failed to publish guest homepage.');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Loading guest homepage draft...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Guest Homepage Builder</h3>
            <p className="text-xs text-gray-500">
              Manage guest-only sections, SEO, and publish changes in real time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => window.open('/', '_blank')}
              className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Eye className="mr-1.5 h-4 w-4" />
              Preview
            </button>
            <button
              onClick={publish}
              disabled={publishing}
              className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-70"
            >
              <UploadCloud className="mr-1.5 h-4 w-4" />
              {publishing ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">SEO title</label>
            <input
              value={draft.seo.title || ''}
              onChange={(event) => setDraft((prev) => ({ ...prev, seo: { ...prev.seo, title: event.target.value } }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">OG image URL</label>
            <input
              value={draft.seo.ogImage || ''}
              onChange={(event) => setDraft((prev) => ({ ...prev, seo: { ...prev.seo, ogImage: event.target.value } }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-semibold text-gray-600">Meta description</label>
          <textarea
            value={draft.seo.metaDescription || ''}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, seo: { ...prev.seo, metaDescription: event.target.value } }))
            }
            className="h-20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-semibold text-gray-600">Keywords (comma separated)</label>
          <input
            value={draft.seo.keywords || ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, seo: { ...prev.seo, keywords: event.target.value } }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-4">
          <button
            onClick={saveSeo}
            disabled={saving}
            className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-70"
          >
            <Save className="mr-1.5 h-4 w-4" />
            Save Draft SEO
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            value={newType}
            onChange={(event) => setNewType(event.target.value as GuestSectionType)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            {SECTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button
            onClick={addSection}
            disabled={saving}
            className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-70"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Section
          </button>
        </div>

        <div className="space-y-4">
          {orderedSections.map((section, index) => (
            <div key={section.id} className="rounded-xl border border-gray-200 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => moveSection(index, 'up')} className="rounded border border-gray-200 p-1 hover:bg-gray-50">
                    <ChevronUp className="h-4 w-4 text-gray-500" />
                  </button>
                  <button onClick={() => moveSection(index, 'down')} className="rounded border border-gray-200 p-1 hover:bg-gray-50">
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  </button>
                  <span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                    {section.type}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={section.isActive !== false}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          sections: prev.sections.map((candidate) =>
                            candidate.id === section.id ? { ...candidate, isActive: event.target.checked } : candidate
                          )
                        }))
                      }
                    />
                    Active
                  </label>
                  <button
                    onClick={() => removeSection(section.id)}
                    className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={section.name || ''}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      sections: prev.sections.map((candidate) =>
                        candidate.id === section.id ? { ...candidate, name: event.target.value } : candidate
                      )
                    }))
                  }
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Section name"
                />
                <select
                  value={section.type}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      sections: prev.sections.map((candidate) =>
                        candidate.id === section.id ? { ...candidate, type: event.target.value } : candidate
                      )
                    }))
                  }
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  {SECTION_TYPES.map((type) => (
                    <option key={`${section.id}-${type}`} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold text-gray-600">Section content JSON</label>
                <textarea
                  value={contentDrafts[section.id] || '{}'}
                  onChange={(event) => updateSectionContentDraft(section.id, event.target.value)}
                  className="h-40 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
                />
              </div>

              <div className="mt-3">
                <button
                  onClick={() => saveSection(section)}
                  disabled={saving}
                  className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-70"
                >
                  <Save className="mr-1.5 h-4 w-4" />
                  Save Section
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GuestHomepageBuilder;
