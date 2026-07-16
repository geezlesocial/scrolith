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

const parseContentObject = (raw: string | undefined, fallback: any = {}) => {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const setNestedValue = (source: any, path: string[], value: any): any => {
  if (!path.length) return source;
  const [head, ...rest] = path;
  const base = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  if (!rest.length) {
    return { ...base, [head]: value };
  }
  return {
    ...base,
    [head]: setNestedValue(base[head], rest, value)
  };
};

const linesToArray = (value: string) =>
  String(value || '')
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);

const arrayToLines = (value: any) => (Array.isArray(value) ? value.join('\n') : '');

const getGuestSectionInitialContent = (type: GuestSectionType) => {
  if (type === 'guest_hero_auth') {
    return {
      headline: 'The All-in-One Platform for Work, Talent, and Community',
      subheadline: 'Scrolith combines professional networking, freelance marketplace, messaging, payments, and AI workflows.',
      description: 'Join millions building careers, growing businesses, and collaborating in real time.',
      primaryCtaLabel: 'Create account',
      primaryCtaUrl: '/auth/signup',
      secondaryCtaLabel: 'Log in',
      secondaryCtaUrl: '/auth/login',
      authPanelTitle: 'Welcome to Scrolith',
      authPanelSubtitle: 'Sign in or create an account to start working and growing.',
      defaultTab: 'signup',
      enableSocialLogin: true,
      loginCtaLabel: 'Login',
      signupCtaLabel: 'Sign up',
      scrolitha: {
        enabled: true,
        eyebrow: 'Scrolitha Live Assistant',
        title: 'Talk to Scrolitha before you create your account',
        subtitle: 'Launch guided AI onboarding directly from the guest homepage.',
        description: 'Visitors can preview gig creation, hiring, briefs, and marketplace workflows before signing in.',
        primaryPrompt: 'Create a gig draft',
        primaryLabel: 'Open Scrolitha',
        secondaryLabel: 'Join with popup',
        secondaryUrl: '/auth/signup',
        promptChips: ['Create a gig draft', 'Generate a project brief', 'How do I start on Scrolith?']
      },
      authPopup: {
        enabled: true,
        delaySeconds: 120,
        headline: 'Stay on Scrolith and continue your account setup',
        subheadline: 'Sign in or join directly from the guest homepage with the same enterprise auth controls.',
        defaultTab: 'signup',
        dismissLabel: 'Maybe later',
        trustNote: 'This popup is additive to your existing auth pages and can be dismissed anytime.'
      }
    };
  }
  return {};
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

  const hasInvalidContentDraft = useCallback(
    (sectionId: string) => {
      try {
        JSON.parse(contentDrafts[sectionId] || '{}');
        return false;
      } catch {
        return true;
      }
    },
    [contentDrafts]
  );

  const getSectionContentDraft = useCallback(
    (section: any) => parseContentObject(contentDrafts[section.id], section?.content && typeof section.content === 'object' ? section.content : {}),
    [contentDrafts]
  );

  const updateSectionContentObject = useCallback((section: any, updater: (current: any) => any) => {
    setContentDrafts((prev) => {
      const fallback = section?.content && typeof section.content === 'object' ? section.content : {};
      const current = parseContentObject(prev[section.id], fallback);
      const next = updater(current || {});
      return {
        ...prev,
        [section.id]: JSON.stringify(next || {}, null, 2)
      };
    });
  }, []);

  const updateSectionContentField = useCallback(
    (section: any, field: string, value: any) => {
      updateSectionContentObject(section, (current) => ({ ...current, [field]: value }));
    },
    [updateSectionContentObject]
  );

  const updateSectionNestedField = useCallback(
    (section: any, path: string[], value: any) => {
      updateSectionContentObject(section, (current) => setNestedValue(current, path, value));
    },
    [updateSectionContentObject]
  );

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
      content: getGuestSectionInitialContent(newType)
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
          {orderedSections.map((section, index) => {
            const content = getSectionContentDraft(section);
            const invalidContentDraft = hasInvalidContentDraft(section.id);
            const scrolitha = content?.scrolitha || {};
            const authPopup = content?.authPopup || {};

            return (
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

              {section.type === 'guest_hero_auth' ? (
                <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-900">Guest Hero Experience Controls</h4>
                    <p className="mt-1 text-xs text-slate-500">
                      Manage the embedded auth panel, Scrolitha guest conversion card, and the timed sign-in popup.
                    </p>
                  </div>
                  {invalidContentDraft ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Fix the section JSON below to continue using the visual editor for this section.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-600">Headline</label>
                          <input
                            value={content.headline || ''}
                            onChange={(event) => updateSectionContentField(section, 'headline', event.target.value)}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-600">Subheadline</label>
                          <input
                            value={content.subheadline || ''}
                            onChange={(event) => updateSectionContentField(section, 'subheadline', event.target.value)}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-xs font-semibold text-gray-600">Description</label>
                          <textarea
                            value={content.description || ''}
                            onChange={(event) => updateSectionContentField(section, 'description', event.target.value)}
                            className="h-20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-600">Auth panel title</label>
                          <input
                            value={content.authPanelTitle || ''}
                            onChange={(event) => updateSectionContentField(section, 'authPanelTitle', event.target.value)}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-600">Auth panel subtitle</label>
                          <input
                            value={content.authPanelSubtitle || ''}
                            onChange={(event) => updateSectionContentField(section, 'authPanelSubtitle', event.target.value)}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-600">Default auth tab</label>
                          <select
                            value={content.defaultTab || 'signup'}
                            onChange={(event) => updateSectionContentField(section, 'defaultTab', event.target.value)}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          >
                            <option value="signup">Signup</option>
                            <option value="login">Login</option>
                          </select>
                        </div>
                        <div className="flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2">
                          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={content.enableSocialLogin !== false}
                              onChange={(event) => updateSectionContentField(section, 'enableSocialLogin', event.target.checked)}
                            />
                            Enable social login
                          </label>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h5 className="text-sm font-semibold text-slate-900">Scrolitha embed</h5>
                            <p className="mt-1 text-xs text-slate-500">Controls the homepage AI card and guest quick prompts.</p>
                          </div>
                          <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600">
                            <input
                              type="checkbox"
                              checked={scrolitha.enabled !== false}
                              onChange={(event) => updateSectionNestedField(section, ['scrolitha', 'enabled'], event.target.checked)}
                            />
                            Enabled
                          </label>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Eyebrow</label>
                            <input
                              value={scrolitha.eyebrow || ''}
                              onChange={(event) => updateSectionNestedField(section, ['scrolitha', 'eyebrow'], event.target.value)}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Primary prompt</label>
                            <input
                              value={scrolitha.primaryPrompt || ''}
                              onChange={(event) => updateSectionNestedField(section, ['scrolitha', 'primaryPrompt'], event.target.value)}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Title</label>
                            <input
                              value={scrolitha.title || ''}
                              onChange={(event) => updateSectionNestedField(section, ['scrolitha', 'title'], event.target.value)}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Primary button label</label>
                            <input
                              value={scrolitha.primaryLabel || ''}
                              onChange={(event) => updateSectionNestedField(section, ['scrolitha', 'primaryLabel'], event.target.value)}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Subtitle</label>
                            <textarea
                              value={scrolitha.subtitle || ''}
                              onChange={(event) => updateSectionNestedField(section, ['scrolitha', 'subtitle'], event.target.value)}
                              className="h-20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Description</label>
                            <textarea
                              value={scrolitha.description || ''}
                              onChange={(event) => updateSectionNestedField(section, ['scrolitha', 'description'], event.target.value)}
                              className="h-20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Secondary button label</label>
                            <input
                              value={scrolitha.secondaryLabel || ''}
                              onChange={(event) => updateSectionNestedField(section, ['scrolitha', 'secondaryLabel'], event.target.value)}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Secondary action URL</label>
                            <input
                              value={scrolitha.secondaryUrl || ''}
                              onChange={(event) => updateSectionNestedField(section, ['scrolitha', 'secondaryUrl'], event.target.value)}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Prompt chips (one per line)</label>
                            <textarea
                              value={arrayToLines(scrolitha.promptChips)}
                              onChange={(event) => updateSectionNestedField(section, ['scrolitha', 'promptChips'], linesToArray(event.target.value))}
                              className="h-24 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h5 className="text-sm font-semibold text-slate-900">Timed sign-in popup</h5>
                            <p className="mt-1 text-xs text-slate-500">Shows after the configured guest dwell time on the homepage.</p>
                          </div>
                          <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600">
                            <input
                              type="checkbox"
                              checked={authPopup.enabled !== false}
                              onChange={(event) => updateSectionNestedField(section, ['authPopup', 'enabled'], event.target.checked)}
                            />
                            Enabled
                          </label>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Popup delay (seconds)</label>
                            <input
                              type="number"
                              min={15}
                              max={900}
                              value={authPopup.delaySeconds ?? 120}
                              onChange={(event) =>
                                updateSectionNestedField(section, ['authPopup', 'delaySeconds'], Number(event.target.value || 120))
                              }
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Popup default tab</label>
                            <select
                              value={authPopup.defaultTab || 'signup'}
                              onChange={(event) => updateSectionNestedField(section, ['authPopup', 'defaultTab'], event.target.value)}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            >
                              <option value="signup">Signup</option>
                              <option value="login">Login</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Popup headline</label>
                            <input
                              value={authPopup.headline || ''}
                              onChange={(event) => updateSectionNestedField(section, ['authPopup', 'headline'], event.target.value)}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Dismiss button label</label>
                            <input
                              value={authPopup.dismissLabel || ''}
                              onChange={(event) => updateSectionNestedField(section, ['authPopup', 'dismissLabel'], event.target.value)}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Popup subheadline</label>
                            <textarea
                              value={authPopup.subheadline || ''}
                              onChange={(event) => updateSectionNestedField(section, ['authPopup', 'subheadline'], event.target.value)}
                              className="h-20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Popup trust note</label>
                            <textarea
                              value={authPopup.trustNote || ''}
                              onChange={(event) => updateSectionNestedField(section, ['authPopup', 'trustNote'], event.target.value)}
                              className="h-20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

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
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GuestHomepageBuilder;
