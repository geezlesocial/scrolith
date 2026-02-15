import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Smartphone } from 'lucide-react';

import api from '../../services/api';
import { useNotification } from '../../context/NotificationContext';

type MobileTabKey = 'home' | 'network' | 'post' | 'notifications' | 'jobs' | 'messages';
type SearchCategory = 'posts' | 'people' | 'pages' | 'jobs' | 'gigs';

type MobileHomeLayoutConfig = {
  header?: {
    messagesEnabled?: boolean;
    quickMenuEnabled?: boolean;
  };
  stories?: {
    enabled?: boolean;
    maxItems?: number;
  };
  accountMenu?: {
    dashboard?: boolean;
    viewAs?: boolean;
    switchCurrency?: boolean;
    postProject?: boolean;
    yourBriefs?: boolean;
    referFriend?: boolean;
    billingPayments?: boolean;
    settings?: boolean;
    logout?: boolean;
  };
  messagesPopup?: {
    enabled?: boolean;
    previewLimit?: number;
  };
  quickMenu?: {
    createPost?: boolean;
    switchUser?: boolean;
    browseJobs?: boolean;
    browseGigs?: boolean;
    projectBrief?: boolean;
    gigCreation?: boolean;
    settings?: boolean;
  };
  postComposer?: {
    visibilityEnabled?: boolean;
    allowedVisibilities?: string[];
    defaultVisibility?: string;
    graphicWarningEnabled?: boolean;
    graphicWarningLabel?: string;
    graphicWarningBlurMedia?: boolean;
    topics?: string[];
    locations?: string[];
  };
  bottomTabs?: Partial<Record<MobileTabKey, boolean>>;
  feed?: {
    showPromoted?: boolean;
    promotedFrequency?: number;
    showSuggestedPeople?: boolean;
    showSuggestedPages?: boolean;
    showTrendingTags?: boolean;
    showRecommendedGigsJobs?: boolean;
  };
  postCard?: {
    reactionsEnabled?: boolean;
    commentsEnabled?: boolean;
    repostsEnabled?: boolean;
    sendEnabled?: boolean;
    linkPreviewEnabled?: boolean;
    mediaPreviewEnabled?: boolean;
    mentionsEnabled?: boolean;
    hashtagsEnabled?: boolean;
  };
  search?: {
    enabled?: boolean;
    categories?: SearchCategory[];
  };
};

const DEFAULT_CONFIG: MobileHomeLayoutConfig = {
  header: { messagesEnabled: true, quickMenuEnabled: true },
  stories: { enabled: true, maxItems: 12 },
  accountMenu: {
    dashboard: true,
    viewAs: true,
    switchCurrency: true,
    postProject: true,
    yourBriefs: true,
    referFriend: true,
    billingPayments: true,
    settings: true,
    logout: true
  },
  messagesPopup: { enabled: true, previewLimit: 6 },
  quickMenu: {
    createPost: true,
    switchUser: true,
    browseJobs: true,
    browseGigs: true,
    projectBrief: true,
    gigCreation: true,
    settings: true
  },
  bottomTabs: {
    home: true,
    network: true,
    post: true,
    notifications: true,
    jobs: true,
    messages: false
  },
  feed: {
    showPromoted: true,
    promotedFrequency: 6,
    showSuggestedPeople: true,
    showSuggestedPages: true,
    showTrendingTags: true,
    showRecommendedGigsJobs: true
  },
  postComposer: {
    visibilityEnabled: true,
    allowedVisibilities: ['public', 'network', 'friends', 'private'],
    defaultVisibility: 'public',
    graphicWarningEnabled: true,
    graphicWarningLabel: 'Graphic warning',
    graphicWarningBlurMedia: true,
    topics: ['Product', 'Design', 'Engineering', 'Marketing', 'Sales', 'Leadership'],
    locations: ['Global', 'North America', 'Europe', 'Africa', 'Asia']
  },
  postCard: {
    reactionsEnabled: true,
    commentsEnabled: true,
    repostsEnabled: true,
    sendEnabled: true,
    linkPreviewEnabled: true,
    mediaPreviewEnabled: true,
    mentionsEnabled: true,
    hashtagsEnabled: true
  },
  search: {
    enabled: true,
    categories: ['posts', 'people', 'pages', 'jobs', 'gigs']
  }
};

const isObjectLike = (value: any): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const deepMerge = <T extends Record<string, any>>(base: T, patch: any): T => {
  if (!isObjectLike(patch)) return base;
  const out: any = { ...base };
  Object.keys(patch).forEach((key) => {
    const next = patch[key];
    const prev = out[key];
    if (isObjectLike(prev) && isObjectLike(next)) {
      out[key] = deepMerge(prev, next);
    } else if (next !== undefined) {
      out[key] = next;
    }
  });
  return out as T;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const MobileHomepage: React.FC = () => {
  const { showNotification } = useNotification();
  const [config, setConfig] = useState<MobileHomeLayoutConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const merged = useMemo(() => deepMerge(DEFAULT_CONFIG as any, config as any), [config]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get('/admin/homepage/mobile-settings');
      const data = resp?.data?.data ?? resp?.data ?? null;
      setConfig(deepMerge(DEFAULT_CONFIG as any, data));
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load mobile homepage settings');
      setConfig(DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const resp = await api.put('/admin/homepage/mobile-settings', { mobileHomeLayout: merged });
      const next = resp?.data?.data ?? resp?.data ?? merged;
      setConfig(deepMerge(DEFAULT_CONFIG as any, next));
      showNotification('success', 'Mobile Homepage', 'Settings saved and published.');
    } catch (e: any) {
      const message = e?.response?.data?.error || e?.message || 'Failed to save settings';
      setError(message);
      showNotification('error', 'Mobile Homepage', message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-gray-700" />
              <h2 className="text-lg font-bold text-gray-900">Mobile Homepage</h2>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Enterprise controls for the LinkedIn-style mobile shell at <span className="font-semibold">/m/home</span>. Changes apply instantly via realtime settings.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              disabled={loading || saving}
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black disabled:opacity-60"
              disabled={loading || saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving' : 'Save & Publish'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 shadow-sm">
          <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
          Loading mobile homepage settings...
        </div>
      ) : (
        <div className="space-y-6">
          <Section title="Header (Top Bar)">
            <Toggle
              label="Messages button in header"
              checked={merged.header?.messagesEnabled !== false}
              onChange={(v) => setConfig((p) => ({ ...p, header: { ...p.header, messagesEnabled: v } }))}
            />
            <Toggle
              label="Quick menu (ellipsis) in header"
              checked={merged.header?.quickMenuEnabled !== false}
              onChange={(v) => setConfig((p) => ({ ...p, header: { ...p.header, quickMenuEnabled: v } }))}
            />
            <Toggle
              label="Messages popup enabled"
              checked={merged.messagesPopup?.enabled !== false}
              onChange={(v) => setConfig((p) => ({ ...p, messagesPopup: { ...p.messagesPopup, enabled: v } }))}
            />
            <NumberField
              label="Messages preview limit"
              value={Number(merged.messagesPopup?.previewLimit ?? 6) || 6}
              min={1}
              max={20}
              onChange={(n) =>
                setConfig((p) => ({
                  ...p,
                  messagesPopup: { ...p.messagesPopup, previewLimit: clamp(n, 1, 20) }
                }))
              }
            />
          </Section>

          <Section title="Stories (Under Header)">
            <Toggle
              label="Stories strip enabled"
              checked={merged.stories?.enabled !== false}
              onChange={(v) => setConfig((p) => ({ ...p, stories: { ...p.stories, enabled: v } }))}
            />
            <NumberField
              label="Max stories in strip"
              value={Number(merged.stories?.maxItems ?? 12) || 12}
              min={4}
              max={40}
              onChange={(n) => setConfig((p) => ({ ...p, stories: { ...p.stories, maxItems: clamp(n, 4, 40) } }))}
            />
          </Section>

          <Section title="Account Menu (Avatar)">
            <ToggleGrid
              items={[
                { key: 'dashboard', label: 'Dashboard' },
                { key: 'viewAs', label: 'View as' },
                { key: 'switchCurrency', label: 'Switch currency' },
                { key: 'postProject', label: 'Post project' },
                { key: 'yourBriefs', label: 'Your briefs' },
                { key: 'referFriend', label: 'Refer a Friend' },
                { key: 'billingPayments', label: 'Billing and Payments' },
                { key: 'settings', label: 'Settings' },
                { key: 'logout', label: 'Logout' }
              ]}
              get={(k) => (merged.accountMenu as any)?.[k] !== false}
              set={(k, v) =>
                setConfig((p) => ({
                  ...p,
                  accountMenu: { ...p.accountMenu, [k]: v }
                }))
              }
            />
          </Section>

          <Section title="Quick Menu (Ellipsis)">
            <Toggle
              label="Create post"
              checked={merged.quickMenu?.createPost !== false}
              onChange={(v) => setConfig((p) => ({ ...p, quickMenu: { ...p.quickMenu, createPost: v } }))}
            />
            <Toggle
              label="Switch user (Freelancer/Client)"
              checked={merged.quickMenu?.switchUser !== false}
              onChange={(v) => setConfig((p) => ({ ...p, quickMenu: { ...p.quickMenu, switchUser: v } }))}
            />
            <Toggle
              label="Browse jobs"
              checked={merged.quickMenu?.browseJobs !== false}
              onChange={(v) => setConfig((p) => ({ ...p, quickMenu: { ...p.quickMenu, browseJobs: v } }))}
            />
            <Toggle
              label="Browse gigs"
              checked={merged.quickMenu?.browseGigs !== false}
              onChange={(v) => setConfig((p) => ({ ...p, quickMenu: { ...p.quickMenu, browseGigs: v } }))}
            />
            <Toggle
              label="Scrolith Project Briefs"
              checked={merged.quickMenu?.projectBrief !== false}
              onChange={(v) => setConfig((p) => ({ ...p, quickMenu: { ...p.quickMenu, projectBrief: v } }))}
            />
            <Toggle
              label="Scrolith Gig Creation"
              checked={merged.quickMenu?.gigCreation !== false}
              onChange={(v) => setConfig((p) => ({ ...p, quickMenu: { ...p.quickMenu, gigCreation: v } }))}
            />
            <Toggle
              label="Settings shortcut"
              checked={merged.quickMenu?.settings !== false}
              onChange={(v) => setConfig((p) => ({ ...p, quickMenu: { ...p.quickMenu, settings: v } }))}
            />
          </Section>

          <Section title="Post Composer (Create Post)">
            <Toggle
              label="Visibility selector enabled"
              checked={merged.postComposer?.visibilityEnabled !== false}
              onChange={(v) => setConfig((p) => ({ ...p, postComposer: { ...p.postComposer, visibilityEnabled: v } }))}
            />

            <div className="grid gap-3 md:grid-cols-2">
              {(['public', 'network', 'friends', 'private'] as const).map((key) => {
                const current = Array.isArray(merged.postComposer?.allowedVisibilities)
                  ? merged.postComposer?.allowedVisibilities
                  : DEFAULT_CONFIG.postComposer?.allowedVisibilities || [];
                const set = new Set(current.map((v) => String(v || '').toLowerCase()));
                const label =
                  key === 'public'
                    ? 'Allow Public'
                    : key === 'network'
                      ? 'Allow Network'
                      : key === 'friends'
                        ? 'Allow Friends'
                        : 'Allow Only Me';
                return (
                  <Toggle
                    key={key}
                    label={label}
                    checked={set.has(key)}
                    onChange={(v) => {
                      const next = new Set(current.map((vv) => String(vv || '').toLowerCase()));
                      if (v) next.add(key);
                      else next.delete(key);
                      const list = Array.from(next);
                      setConfig((p) => ({ ...p, postComposer: { ...p.postComposer, allowedVisibilities: list } }));
                    }}
                  />
                );
              })}
            </div>

            <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <div className="mb-1 text-xs font-semibold text-gray-500">Default visibility</div>
              <select
                className="w-full rounded border border-gray-200 px-2 py-1"
                value={String(merged.postComposer?.defaultVisibility ?? 'public')}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, postComposer: { ...p.postComposer, defaultVisibility: e.target.value } }))
                }
              >
                {(Array.isArray(merged.postComposer?.allowedVisibilities) && merged.postComposer.allowedVisibilities.length
                  ? merged.postComposer.allowedVisibilities
                  : DEFAULT_CONFIG.postComposer?.allowedVisibilities || ['public']
                ).map((v: any) => (
                  <option key={String(v)} value={String(v)}>
                    {String(v).toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <Toggle
              label="Graphic warning toggle enabled"
              checked={merged.postComposer?.graphicWarningEnabled !== false}
              onChange={(v) => setConfig((p) => ({ ...p, postComposer: { ...p.postComposer, graphicWarningEnabled: v } }))}
            />
            <TextField
              label="Graphic warning label"
              value={String(merged.postComposer?.graphicWarningLabel ?? 'Graphic warning')}
              onChange={(value) =>
                setConfig((p) => ({ ...p, postComposer: { ...p.postComposer, graphicWarningLabel: value } }))
              }
            />
            <Toggle
              label="Blur media until user taps"
              checked={merged.postComposer?.graphicWarningBlurMedia !== false}
              onChange={(v) =>
                setConfig((p) => ({ ...p, postComposer: { ...p.postComposer, graphicWarningBlurMedia: v } }))
              }
            />

            <TextField
              label="Topics (comma separated)"
              value={Array.isArray(merged.postComposer?.topics) ? merged.postComposer?.topics?.join(', ') : ''}
              onChange={(value) =>
                setConfig((p) => ({
                  ...p,
                  postComposer: {
                    ...p.postComposer,
                    topics: String(value || '')
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                  }
                }))
              }
            />
            <TextField
              label="Regions / Countries / Cities (comma separated)"
              value={Array.isArray(merged.postComposer?.locations) ? merged.postComposer?.locations?.join(', ') : ''}
              onChange={(value) =>
                setConfig((p) => ({
                  ...p,
                  postComposer: {
                    ...p.postComposer,
                    locations: String(value || '')
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                  }
                }))
              }
            />
          </Section>

          <Section title="Bottom Tabs">
            <ToggleGrid
              items={[
                { key: 'home', label: 'Home' },
                { key: 'network', label: 'My Network' },
                { key: 'post', label: 'Post (+)' },
                { key: 'notifications', label: 'Notifications' },
                { key: 'jobs', label: 'Jobs' },
                { key: 'messages', label: 'Messages (tab)' }
              ]}
              get={(k) => (merged.bottomTabs as any)?.[k] !== false}
              set={(k, v) =>
                setConfig((p) => ({
                  ...p,
                  bottomTabs: { ...p.bottomTabs, [k]: v }
                }))
              }
            />
          </Section>

          <Section title="Feed Composition">
            <Toggle
              label="Show promoted posts (ads)"
              checked={merged.feed?.showPromoted !== false}
              onChange={(v) => setConfig((p) => ({ ...p, feed: { ...p.feed, showPromoted: v } }))}
            />
            <NumberField
              label="Promoted frequency (every N posts)"
              value={Number(merged.feed?.promotedFrequency ?? 6) || 6}
              min={2}
              max={20}
              onChange={(n) => setConfig((p) => ({ ...p, feed: { ...p.feed, promotedFrequency: clamp(n, 2, 20) } }))}
            />
            <Toggle
              label="Suggested people cards"
              checked={merged.feed?.showSuggestedPeople !== false}
              onChange={(v) => setConfig((p) => ({ ...p, feed: { ...p.feed, showSuggestedPeople: v } }))}
            />
            <Toggle
              label="Suggested pages cards"
              checked={merged.feed?.showSuggestedPages !== false}
              onChange={(v) => setConfig((p) => ({ ...p, feed: { ...p.feed, showSuggestedPages: v } }))}
            />
            <Toggle
              label="Trending tags block"
              checked={merged.feed?.showTrendingTags !== false}
              onChange={(v) => setConfig((p) => ({ ...p, feed: { ...p.feed, showTrendingTags: v } }))}
            />
            <Toggle
              label="Recommended gigs/jobs block"
              checked={merged.feed?.showRecommendedGigsJobs !== false}
              onChange={(v) =>
                setConfig((p) => ({ ...p, feed: { ...p.feed, showRecommendedGigsJobs: v } }))
              }
            />
          </Section>

          <Section title="Post Card Features">
            <ToggleGrid
              items={[
                { key: 'reactionsEnabled', label: 'Reactions' },
                { key: 'commentsEnabled', label: 'Comments' },
                { key: 'repostsEnabled', label: 'Reposts' },
                { key: 'sendEnabled', label: 'Send/Share' },
                { key: 'linkPreviewEnabled', label: 'Link previews' },
                { key: 'mediaPreviewEnabled', label: 'Media previews' },
                { key: 'mentionsEnabled', label: 'Mentions (@)' },
                { key: 'hashtagsEnabled', label: 'Hashtags (#)' }
              ]}
              get={(k) => (merged.postCard as any)?.[k] !== false}
              set={(k, v) =>
                setConfig((p) => ({
                  ...p,
                  postCard: { ...p.postCard, [k]: v }
                }))
              }
            />
          </Section>

          <Section title="Search">
            <Toggle
              label="Search enabled"
              checked={merged.search?.enabled !== false}
              onChange={(v) => setConfig((p) => ({ ...p, search: { ...p.search, enabled: v } }))}
            />
            <div className="grid gap-3 md:grid-cols-2">
              {(['posts', 'people', 'pages', 'jobs', 'gigs'] as const).map((c) => {
                const set = new Set(merged.search?.categories || DEFAULT_CONFIG.search?.categories || []);
                return (
                  <Toggle
                    key={c}
                    label={`Category: ${c.toUpperCase()}`}
                    checked={set.has(c)}
                    onChange={(v) => {
                      const next = new Set(merged.search?.categories || []);
                      if (v) next.add(c);
                      else next.delete(c);
                      setConfig((p) => ({ ...p, search: { ...p.search, categories: Array.from(next) as any } }));
                    }}
                  />
                );
              })}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
    <h3 className="text-base font-bold text-gray-900">{title}</h3>
    <div className="mt-4 space-y-3">{children}</div>
  </div>
);

const Toggle = ({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
    <span className="font-medium text-gray-800">{label}</span>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
  </label>
);

const ToggleGrid = ({
  items,
  get,
  set
}: {
  items: Array<{ key: string; label: string }>;
  get: (key: string) => boolean;
  set: (key: string, value: boolean) => void;
}) => (
  <div className="grid gap-3 md:grid-cols-2">
    {items.map((item) => (
      <Toggle key={item.key} label={item.label} checked={get(item.key)} onChange={(v) => set(item.key, v)} />
    ))}
  </div>
);

const NumberField = ({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) => (
  <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
    <div className="mb-1 text-xs font-semibold text-gray-500">{label}</div>
    <input
      type="number"
      min={min}
      max={max}
      className="w-full rounded border border-gray-200 px-2 py-1"
      value={value}
      onChange={(e) => onChange(Number(e.target.value || 0))}
    />
  </label>
);

const TextField = ({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <label className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
    <div className="mb-1 text-xs font-semibold text-gray-500">{label}</div>
    <input
      type="text"
      className="w-full rounded border border-gray-200 px-2 py-1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </label>
);

export default MobileHomepage;
