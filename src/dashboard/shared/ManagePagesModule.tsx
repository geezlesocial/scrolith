import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  Eye,
  FileText,
  Megaphone,
  PencilLine,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  XCircle
} from 'lucide-react';
import {
  CommunityService,
  type BusinessPageServicePackage,
  type BusinessPageServicePackageInput
} from '../../services/community';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import OpportunityStudioPanel from '../../components/dashboard/OpportunityStudioPanel';
import CompanyPage from '../../pages/CompanyPage';
import FilePickerModal from './FilePickerModal';
import { resolveAssetUrl } from '../../utils/assetUrl';
import type { UploadedFile } from '../../types';

type ManagedPage = {
  id: string;
  ownerId?: string | null;
  name: string;
  slug: string;
  handle?: string | null;
  tagline?: string | null;
  category?: string | null;
  industry?: string | null;
  orgSize?: string | null;
  orgType?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  description?: string | null;
  logoFileId?: string | null;
  coverFileId?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  followersCount: number;
  postsCount: number;
  status: string;
  statusReason?: string | null;
  statusUpdatedAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

type PageDraft = {
  id?: string;
  name: string;
  handle: string;
  slug: string;
  tagline: string;
  category: string;
  industry: string;
  orgSize: string;
  orgType: string;
  website: string;
  email: string;
  phone: string;
  location: string;
  description: string;
  logoFileId: string;
  coverFileId: string;
  logoUrl: string;
  coverUrl: string;
  status?: string;
  statusReason?: string;
};

type PickerTarget = 'logo' | 'cover' | null;
type StatusFilter = 'all' | 'active' | 'attention';
type EditorMode = 'create' | 'edit';

type PackageAddonDraft = {
  id?: string;
  clientKey: string;
  name: string;
  price: string;
  description: string;
};

type ServicePackageDraft = {
  id?: string;
  clientKey: string;
  title: string;
  summary: string;
  price: string;
  currency: string;
  billing: 'fixed' | 'hourly' | 'subscription';
  turnaroundDays: string;
  revisions: string;
  ctaLabel: string;
  active: boolean;
  featuresText: string;
  addons: PackageAddonDraft[];
};

const industryOptions = [
  'Technology',
  'Marketing & Advertising',
  'Media & Entertainment',
  'Finance & Fintech',
  'Healthcare',
  'Education',
  'Ecommerce & Retail',
  'Manufacturing',
  'Professional Services',
  'Hospitality & Travel',
  'Non-profit',
  'Other'
];

const organizationSizes = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

const organizationTypes = ['Company', 'Agency', 'Studio', 'Non-profit', 'Public institution', 'Community group'];

const toSlug = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 60);

const createEmptyDraft = (): PageDraft => ({
  name: '',
  handle: '',
  slug: '',
  tagline: '',
  category: '',
  industry: '',
  orgSize: '',
  orgType: '',
  website: '',
  email: '',
  phone: '',
  location: '',
  description: '',
  logoFileId: '',
  coverFileId: '',
  logoUrl: '',
  coverUrl: '',
  status: 'active',
  statusReason: ''
});

const createClientKey = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createEmptyPackageAddonDraft = (): PackageAddonDraft => ({
  clientKey: createClientKey('addon'),
  name: '',
  price: '',
  description: ''
});

const createEmptyServicePackageDraft = (): ServicePackageDraft => ({
  clientKey: createClientKey('pkg'),
  title: '',
  summary: '',
  price: '',
  currency: 'USD',
  billing: 'fixed',
  turnaroundDays: '',
  revisions: '',
  ctaLabel: '',
  active: true,
  featuresText: '',
  addons: []
});

const toServicePackageDraft = (pkg: BusinessPageServicePackage): ServicePackageDraft => ({
  id: pkg.id,
  clientKey: createClientKey(`pkg_${pkg.id}`),
  title: pkg.title || '',
  summary: pkg.summary || '',
  price: Number.isFinite(Number(pkg.price)) ? String(pkg.price) : '',
  currency: String(pkg.currency || 'USD').toUpperCase(),
  billing: pkg.billing || 'fixed',
  turnaroundDays:
    pkg.turnaroundDays === null || pkg.turnaroundDays === undefined ? '' : String(pkg.turnaroundDays),
  revisions: pkg.revisions === null || pkg.revisions === undefined ? '' : String(pkg.revisions),
  ctaLabel: pkg.ctaLabel || '',
  active: pkg.active !== false,
  featuresText: Array.isArray(pkg.features) ? pkg.features.join('\n') : '',
  addons: Array.isArray(pkg.addons)
    ? pkg.addons.map((addon) => ({
        id: addon.id,
        clientKey: createClientKey(`addon_${addon.id}`),
        name: addon.name || '',
        price: Number.isFinite(Number(addon.price)) ? String(addon.price) : '',
        description: addon.description || ''
      }))
    : []
});

const parseNumberOrNull = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return null;
  return num;
};

const parsePackageFeatures = (featuresText: string) =>
  Array.from(
    new Set(
      String(featuresText || '')
        .split(/\r?\n|,/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  ).slice(0, 12);

const toServicePackageInput = (
  draft: ServicePackageDraft,
  index: number
): BusinessPageServicePackageInput | null => {
  const title = String(draft.title || '').trim();
  if (!title) return null;
  const price = parseNumberOrNull(draft.price);
  const turnaroundDays = parseNumberOrNull(draft.turnaroundDays);
  const revisions = parseNumberOrNull(draft.revisions);

  return {
    ...(draft.id ? { id: draft.id } : {}),
    title: title.slice(0, 140),
    summary: String(draft.summary || '').trim().slice(0, 320) || null,
    price: price === null ? 0 : Math.max(0, Number(price.toFixed(2))),
    currency: String(draft.currency || 'USD').trim().toUpperCase().slice(0, 3) || 'USD',
    billing: draft.billing || 'fixed',
    turnaroundDays:
      turnaroundDays === null ? null : Math.max(0, Math.floor(turnaroundDays)),
    revisions: revisions === null ? null : Math.max(0, Math.floor(revisions)),
    ctaLabel: String(draft.ctaLabel || '').trim().slice(0, 60) || null,
    active: draft.active !== false,
    sortOrder: index,
    features: parsePackageFeatures(draft.featuresText),
    addons: (draft.addons || [])
      .map((addon) => {
        const name = String(addon.name || '').trim();
        if (!name) return null;
        const addonPrice = parseNumberOrNull(addon.price);
        return {
          ...(addon.id ? { id: addon.id } : {}),
          name: name.slice(0, 120),
          price: addonPrice === null ? 0 : Math.max(0, Number(addonPrice.toFixed(2))),
          description: String(addon.description || '').trim().slice(0, 220) || null
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  };
};

const normalizeManagedPage = (page: any): ManagedPage | null => {
  const id = String(page?.id || '').trim();
  const slug = String(page?.slug || '').trim();
  if (!id || !slug) return null;
  return {
    id,
    ownerId: page?.ownerId || null,
    name: String(page?.name || 'Business page'),
    slug,
    handle: page?.handle || null,
    tagline: page?.tagline || null,
    category: page?.category || null,
    industry: page?.industry || null,
    orgSize: page?.orgSize || null,
    orgType: page?.orgType || null,
    website: page?.website || null,
    email: page?.email || null,
    phone: page?.phone || null,
    location: page?.location || null,
    description: page?.description || null,
    logoFileId: page?.logoFileId || page?.logo?.id || null,
    coverFileId: page?.coverFileId || page?.cover?.id || null,
    logoUrl: resolveAssetUrl(page?.logo?.url || page?.logoUrl || ''),
    coverUrl: resolveAssetUrl(page?.cover?.url || page?.coverUrl || ''),
    followersCount: Number(page?.followersCount || 0),
    postsCount: Number(page?.postsCount || 0),
    status: String(page?.status || 'active').toLowerCase(),
    statusReason: page?.statusReason || null,
    statusUpdatedAt: page?.statusUpdatedAt || null,
    updatedAt: page?.updatedAt || null,
    createdAt: page?.createdAt || null
  };
};

const toDraftFromPage = (page?: ManagedPage | null): PageDraft => ({
  id: page?.id,
  name: page?.name || '',
  handle: page?.handle || '',
  slug: page?.slug || '',
  tagline: page?.tagline || '',
  category: page?.category || '',
  industry: page?.industry || '',
  orgSize: page?.orgSize || '',
  orgType: page?.orgType || '',
  website: page?.website || '',
  email: page?.email || '',
  phone: page?.phone || '',
  location: page?.location || '',
  description: page?.description || '',
  logoFileId: page?.logoFileId || '',
  coverFileId: page?.coverFileId || '',
  logoUrl: page?.logoUrl || '',
  coverUrl: page?.coverUrl || '',
  status: page?.status || 'active',
  statusReason: page?.statusReason || ''
});

const isAttentionStatus = (status: string) => String(status || 'active').toLowerCase() !== 'active';

const formatRelativeTimestamp = (value?: string | null) => {
  if (!value) return 'Recently updated';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently updated';
  return `Updated ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

const statusBadgeClassName = (status: string) => {
  switch (String(status || '').toLowerCase()) {
    case 'active':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'paused':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'restricted':
    case 'suspended':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'pending':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700';
  }
};

const ManagePagesModule: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();
  const { showNotification } = useNotification();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [pages, setPages] = useState<ManagedPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('create');
  const [draft, setDraft] = useState<PageDraft>(createEmptyDraft());
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [packageLoading, setPackageLoading] = useState(false);
  const [packageSaving, setPackageSaving] = useState(false);
  const [packageDrafts, setPackageDrafts] = useState<ServicePackageDraft[]>([]);
  const createPageRequestRef = useRef('');

  const [businessConfig, setBusinessConfig] = useState({
    businessPagesEnabled: true,
    businessPageUserCreationEnabled: true,
    businessPagePostingEnabled: true,
    businessPageFollowEnabled: true
  });

  const loadWorkspace = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setRefreshing(true);
      try {
        const [pageData, pageConfig] = await Promise.all([
          CommunityService.getMyBusinessPages(),
          CommunityService.getBusinessPagesConfig()
        ]);

        const normalizedPages = (Array.isArray(pageData) ? pageData : [])
          .map(normalizeManagedPage)
          .filter((item): item is ManagedPage => Boolean(item));

        setBusinessConfig({
          businessPagesEnabled: pageConfig?.businessPagesEnabled !== false,
          businessPageUserCreationEnabled: pageConfig?.businessPageUserCreationEnabled !== false,
          businessPagePostingEnabled: pageConfig?.businessPagePostingEnabled !== false,
          businessPageFollowEnabled: pageConfig?.businessPageFollowEnabled !== false
        });
        setPages(normalizedPages);
        setSelectedPageId((current) => {
          if (current && normalizedPages.some((page) => page.id === current)) return current;
          return normalizedPages[0]?.id || '';
        });
      } catch (error: any) {
        showNotification('error', 'Manage Pages', error?.response?.data?.error || 'Unable to load business pages.');
        setPages([]);
        setSelectedPageId('');
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [showNotification]
  );

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    const refresh = () => {
      void loadWorkspace(true);
    };

    window.addEventListener('community:business_page_created', refresh as EventListener);
    window.addEventListener('community:business_page_updated', refresh as EventListener);
    return () => {
      window.removeEventListener('community:business_page_created', refresh as EventListener);
      window.removeEventListener('community:business_page_updated', refresh as EventListener);
    };
  }, [loadWorkspace]);

  const openCreateEditor = useCallback(() => {
    setEditorMode('create');
    setDraft(createEmptyDraft());
    setEditorOpen(true);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldCreate = params.get('createPage') === '1';
    if (!shouldCreate) {
      createPageRequestRef.current = '';
      return;
    }
    if (loading) return;
    const requestKey = `${location.pathname}?${location.search}`;
    if (createPageRequestRef.current === requestKey) return;
    createPageRequestRef.current = requestKey;
    openCreateEditor();
    params.delete('createPage');
    navigate(`${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`, { replace: true });
  }, [loading, location.pathname, location.search, navigate, openCreateEditor]);

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) || null,
    [pages, selectedPageId]
  );

  useEffect(() => {
    if (!selectedPage?.id) {
      setPackageDrafts([]);
      setPackageLoading(false);
      return;
    }

    let active = true;
    setPackageLoading(true);

    CommunityService.getBusinessPagePackages(selectedPage.id)
      .then((payload) => {
        if (!active) return;
        const drafts = (Array.isArray(payload?.packages) ? payload.packages : []).map(toServicePackageDraft);
        setPackageDrafts(drafts);
      })
      .catch((error: any) => {
        if (!active) return;
        console.error('Failed to load business page packages', error);
        setPackageDrafts([]);
        showNotification('error', 'Manage Pages', error?.response?.data?.error || 'Unable to load packaged offers.');
      })
      .finally(() => {
        if (active) setPackageLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedPage?.id, showNotification]);

  const updatePackageDraft = useCallback((clientKey: string, updater: (draft: ServicePackageDraft) => ServicePackageDraft) => {
    setPackageDrafts((current) =>
      current.map((draft) => (draft.clientKey === clientKey ? updater(draft) : draft))
    );
  }, []);

  const handleAddPackageDraft = useCallback(() => {
    setPackageDrafts((current) => [...current, createEmptyServicePackageDraft()]);
  }, []);

  const handleRemovePackageDraft = useCallback((clientKey: string) => {
    setPackageDrafts((current) => current.filter((draft) => draft.clientKey !== clientKey));
  }, []);

  const handleSavePackages = useCallback(async () => {
    if (!selectedPage?.id) return;
    if (!packageDrafts.length) {
      setPackageSaving(true);
      try {
        const payload = await CommunityService.updateBusinessPagePackages(selectedPage.id, []);
        setPackageDrafts((Array.isArray(payload?.packages) ? payload.packages : []).map(toServicePackageDraft));
        window.dispatchEvent(
          new CustomEvent('community:business_page_packages_updated', {
            detail: {
              pageId: selectedPage.id,
              packages: payload?.packages || [],
              summary: payload?.summary || null
            }
          })
        );
        showNotification('success', 'Manage Pages', 'Packaged offers saved.');
      } catch (error: any) {
        showNotification('error', 'Manage Pages', error?.response?.data?.error || 'Unable to save packaged offers.');
      } finally {
        setPackageSaving(false);
      }
      return;
    }

    const missingTitle = packageDrafts.some((draft) => !String(draft.title || '').trim());
    if (missingTitle) {
      showNotification('warning', 'Manage Pages', 'Every package must include a title before saving.');
      return;
    }

    const payload = packageDrafts
      .map((draft, index) => toServicePackageInput(draft, index))
      .filter((entry): entry is BusinessPageServicePackageInput => Boolean(entry));

    setPackageSaving(true);
    try {
      const response = await CommunityService.updateBusinessPagePackages(selectedPage.id, payload);
      setPackageDrafts((Array.isArray(response?.packages) ? response.packages : []).map(toServicePackageDraft));
      window.dispatchEvent(
        new CustomEvent('community:business_page_packages_updated', {
          detail: {
            pageId: selectedPage.id,
            packages: response?.packages || [],
            summary: response?.summary || null
          }
        })
      );
      showNotification('success', 'Manage Pages', 'Packaged offers saved.');
    } catch (error: any) {
      showNotification('error', 'Manage Pages', error?.response?.data?.error || 'Unable to save packaged offers.');
    } finally {
      setPackageSaving(false);
    }
  }, [packageDrafts, selectedPage?.id, showNotification]);

  const filteredPages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return pages.filter((page) => {
      if (statusFilter === 'active' && isAttentionStatus(page.status)) return false;
      if (statusFilter === 'attention' && !isAttentionStatus(page.status)) return false;
      if (!query) return true;
      return [page.name, page.slug, page.handle, page.tagline, page.industry, page.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [pages, searchQuery, statusFilter]);

  const summary = useMemo(() => {
    const totalFollowers = pages.reduce((sum, page) => sum + Number(page.followersCount || 0), 0);
    const totalPosts = pages.reduce((sum, page) => sum + Number(page.postsCount || 0), 0);
    const activePages = pages.filter((page) => !isAttentionStatus(page.status)).length;
    return {
      totalPages: pages.length,
      totalFollowers,
      totalPosts,
      activePages
    };
  }, [pages]);

  const promoteUrl = selectedPage
    ? `/freelancer/dashboard?tab=my-ads&boostPageId=${encodeURIComponent(selectedPage.id)}&boostOpen=1`
    : '';

  const handleDraftNameChange = (value: string) => {
    setDraft((current) => {
      const nextSlug = toSlug(value);
      const shouldUpdateSlug = !current.slug || current.slug === toSlug(current.name);
      const shouldUpdateHandle = !current.handle || current.handle === toSlug(current.name);
      return {
        ...current,
        name: value,
        slug: shouldUpdateSlug ? nextSlug : current.slug,
        handle: shouldUpdateHandle ? nextSlug : current.handle
      };
    });
  };

  const openEditEditor = (page: ManagedPage) => {
    if (!businessConfig.businessPagesEnabled) {
      showNotification('warning', 'Manage Pages', 'Business page editing is currently disabled by admin.');
      return;
    }
    setEditorMode('edit');
    setDraft(toDraftFromPage(page));
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setPickerTarget(null);
  };

  const handleAssetSelected = (file: UploadedFile) => {
    const url = resolveAssetUrl(file?.url || '');
    if (pickerTarget === 'logo') {
      setDraft((current) => ({ ...current, logoFileId: String(file?.id || ''), logoUrl: url }));
      showNotification('success', 'Manage Pages', 'Logo selected.');
    } else if (pickerTarget === 'cover') {
      setDraft((current) => ({ ...current, coverFileId: String(file?.id || ''), coverUrl: url }));
      showNotification('success', 'Manage Pages', 'Cover selected.');
    }
    setPickerTarget(null);
  };

  const handleSaveDraft = async () => {
    const name = draft.name.trim();
    if (!name) {
      showNotification('warning', 'Manage Pages', 'Business name is required.');
      return;
    }
    if (!businessConfig.businessPagesEnabled) {
      showNotification('warning', 'Manage Pages', 'Business pages are currently disabled by admin.');
      return;
    }
    if (editorMode === 'create' && !businessConfig.businessPageUserCreationEnabled) {
      showNotification('warning', 'Manage Pages', 'Business page creation is currently disabled by admin.');
      return;
    }

    const payload = {
      name,
      handle: draft.handle.trim() || toSlug(name),
      slug: draft.slug.trim() || toSlug(name),
      tagline: draft.tagline.trim(),
      category: draft.category.trim(),
      description: draft.description.trim(),
      website: draft.website.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      industry: draft.industry.trim(),
      orgSize: draft.orgSize.trim(),
      orgType: draft.orgType.trim(),
      location: draft.location.trim(),
      logoFileId: draft.logoFileId.trim() || undefined,
      coverFileId: draft.coverFileId.trim() || undefined
    };

    setSaving(true);
    try {
      const response =
        editorMode === 'edit' && draft.id
          ? await CommunityService.updateBusinessPage(draft.id, payload)
          : await CommunityService.createBusinessPage(payload);
      const normalized = normalizeManagedPage(response);
      if (!normalized) throw new Error('Saved page response was incomplete.');

      setPages((current) => {
        if (editorMode === 'edit') {
          return current.map((page) => (page.id === normalized.id ? normalized : page));
        }
        return [normalized, ...current];
      });
      setSelectedPageId(normalized.id);
      setEditorOpen(false);
      const eventName = editorMode === 'edit' ? 'community:business_page_updated' : 'community:business_page_created';
      window.dispatchEvent(new CustomEvent(eventName, { detail: { page: normalized } }));
      if (editorMode !== 'edit') {
        window.dispatchEvent(new CustomEvent('community:business_page_updated', { detail: { page: normalized } }));
      }
      showNotification('success', 'Manage Pages', editorMode === 'edit' ? 'Page changes saved.' : 'Business page created.');
    } catch (error: any) {
      showNotification('error', 'Manage Pages', error?.response?.data?.error || 'Unable to save business page.');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteDialog = (page: ManagedPage) => {
    setSelectedPageId(page.id);
    setDeleteConfirmText('');
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (deleteBusy) return;
    setDeleteDialogOpen(false);
    setDeleteConfirmText('');
  };

  const handleDeletePage = async () => {
    if (!selectedPage?.id) return;
    if (deleteConfirmText.trim().toLowerCase() !== String(selectedPage.slug || '').toLowerCase()) return;
    setDeleteBusy(true);
    try {
      await CommunityService.deleteBusinessPage(selectedPage.id);
      const remaining = pages.filter((page) => page.id !== selectedPage.id);
      setPages(remaining);
      setSelectedPageId(remaining[0]?.id || '');
      window.dispatchEvent(
        new CustomEvent('community:business_page_updated', {
          detail: { pageId: selectedPage.id, deleted: true }
        })
      );
      setDeleteDialogOpen(false);
      setDeleteConfirmText('');
      showNotification('success', 'Manage Pages', 'Business page deleted.');
    } catch (error: any) {
      showNotification('error', 'Manage Pages', error?.response?.data?.error || 'Unable to delete business page.');
    } finally {
      setDeleteBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Loading page control center...
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_32%),linear-gradient(135deg,#0f172a_0%,#111827_42%,#1d4ed8_100%)] p-6 text-white shadow-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200">Manage Pages</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                One business-page control center for brand, publishing, and governance.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
                Business Pages now live here instead of the Community dashboard. Create, organize, update, promote, and retire pages
                from one workspace while keeping the public page experience and live page operations intact.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void loadWorkspace(true)}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={openCreateEditor}
                disabled={!businessConfig.businessPagesEnabled || !businessConfig.businessPageUserCreationEnabled}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-slate-200"
              >
                <PlusCircle className="h-4 w-4" />
                Add New Page
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {[
              { label: 'Owned pages', value: summary.totalPages, icon: Building2 },
              { label: 'Active pages', value: summary.activePages, icon: ShieldCheck },
              { label: 'Audience reach', value: summary.totalFollowers, icon: Users },
              { label: 'Published posts', value: summary.totalPosts, icon: FileText }
            ].map((card) => (
              <div key={card.label} className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/10 p-2 text-sky-100">
                    <card.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-300">{card.label}</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{card.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              {
                label: businessConfig.businessPagesEnabled ? 'Business pages live' : 'Business pages disabled',
                tone: businessConfig.businessPagesEnabled ? 'bg-emerald-500/15 text-emerald-100 border-emerald-400/30' : 'bg-rose-500/15 text-rose-100 border-rose-400/30'
              },
              {
                label: businessConfig.businessPageUserCreationEnabled ? 'User page creation enabled' : 'User page creation locked',
                tone: businessConfig.businessPageUserCreationEnabled ? 'bg-sky-500/15 text-sky-100 border-sky-400/30' : 'bg-amber-500/15 text-amber-100 border-amber-400/30'
              },
              {
                label: businessConfig.businessPagePostingEnabled ? 'Page posting enabled' : 'Page posting restricted',
                tone: businessConfig.businessPagePostingEnabled ? 'bg-white/10 text-white border-white/15' : 'bg-amber-500/15 text-amber-100 border-amber-400/30'
              },
              {
                label: businessConfig.businessPageFollowEnabled ? 'Page follow enabled' : 'Page follow restricted',
                tone: businessConfig.businessPageFollowEnabled ? 'bg-white/10 text-white border-white/15' : 'bg-amber-500/15 text-amber-100 border-amber-400/30'
              }
            ].map((item) => (
              <span key={item.label} className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${item.tone}`}>
                {item.label}
              </span>
            ))}
          </div>
        </section>

        <OpportunityStudioPanel
          audience="page"
          title="Manage Pages opportunity studio"
          subtitle="Turn owned pages into stronger trust surfaces, packaged-offer channels, and qualified pipeline entry points without leaving this workspace."
        />

        <div className="grid gap-6 2xl:grid-cols-[340px,minmax(0,1fr)]">
          <aside className="grid gap-5 xl:grid-cols-2 2xl:sticky 2xl:top-6 2xl:block 2xl:self-start 2xl:space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Directory</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">Your page portfolio</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {filteredPages.length} shown
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search pages by name, slug, handle"
                    className="w-full rounded-2xl border border-slate-200 py-3 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  {([
                    { id: 'all', label: 'All pages' },
                    { id: 'active', label: 'Active only' },
                    { id: 'attention', label: 'Needs attention' }
                  ] as Array<{ id: StatusFilter; label: string }>).map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setStatusFilter(filter.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        statusFilter === filter.id
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {filteredPages.length ? (
                  filteredPages.map((page) => {
                    const active = page.id === selectedPageId;
                    return (
                      <div
                        key={page.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedPageId(page.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedPageId(page.id);
                          }
                        }}
                        className={`rounded-3xl border p-4 transition ${
                          active
                            ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                            : 'border-slate-200 bg-slate-50/70 text-slate-900 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`h-14 w-14 overflow-hidden rounded-2xl border ${active ? 'border-white/10 bg-white/10' : 'border-slate-200 bg-white'}`}>
                            {page.logoUrl ? (
                              <img src={page.logoUrl} alt={page.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className={`flex h-full w-full items-center justify-center ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                                <Building2 className="h-6 w-6" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold">{page.name}</p>
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${active ? 'border-white/15 bg-white/10 text-slate-200' : statusBadgeClassName(page.status)}`}>
                                {page.status}
                              </span>
                            </div>
                            <p className={`mt-1 truncate text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                              @{page.handle || page.slug}
                            </p>
                            <p className={`mt-2 line-clamp-2 text-xs leading-5 ${active ? 'text-slate-200' : 'text-slate-600'}`}>
                              {page.tagline || page.description || 'Add a tagline and description to strengthen your brand presence.'}
                            </p>
                          </div>
                        </div>

                        <div className={`mt-3 grid grid-cols-2 gap-2 rounded-2xl p-3 text-xs ${active ? 'bg-white/10 text-slate-100' : 'bg-white text-slate-600'}`}>
                          <div>
                            <p className={`uppercase tracking-wide ${active ? 'text-slate-300' : 'text-slate-400'}`}>Followers</p>
                            <p className="mt-1 text-base font-semibold">{page.followersCount}</p>
                          </div>
                          <div>
                            <p className={`uppercase tracking-wide ${active ? 'text-slate-300' : 'text-slate-400'}`}>Posts</p>
                            <p className="mt-1 text-base font-semibold">{page.postsCount}</p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditEditor(page);
                            }}
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                              active ? 'bg-white text-slate-900' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <PencilLine className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDeleteDialog(page);
                            }}
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                              active ? 'border border-white/15 bg-white/10 text-white hover:bg-white/15' : 'border border-rose-200 bg-white text-rose-600 hover:bg-rose-50'
                            }`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>

                        <p className={`mt-3 text-[11px] ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                          {formatRelativeTimestamp(page.updatedAt)}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                    {pages.length
                      ? 'No pages match the current search and filter.'
                      : businessConfig.businessPageUserCreationEnabled
                        ? 'Create your first business page to start publishing, growing followers, and running page-level operations.'
                        : 'Business page creation is currently disabled by admin settings.'}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Governance</p>
              <div className="mt-4 space-y-3">
                {[
                  {
                    label: 'Page creation',
                    enabled: businessConfig.businessPageUserCreationEnabled,
                    description: businessConfig.businessPageUserCreationEnabled
                      ? 'Members can create new business pages.'
                      : 'New page creation is paused by admin.'
                  },
                  {
                    label: 'Page publishing',
                    enabled: businessConfig.businessPagePostingEnabled,
                    description: businessConfig.businessPagePostingEnabled
                      ? 'Selected pages can publish publicly.'
                      : 'Posting from business pages is restricted.'
                  },
                  {
                    label: 'Page follows',
                    enabled: businessConfig.businessPageFollowEnabled,
                    description: businessConfig.businessPageFollowEnabled
                      ? 'Members and pages can follow business pages.'
                      : 'Page follow actions are restricted.'
                  }
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 rounded-xl p-2 ${item.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {item.enabled ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {selectedPage ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2 2xl:col-span-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Page operations</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">{selectedPage.name}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Launch brand actions, publish, review followers, and manage the live page from one page-specific workspace.
                </p>

                {selectedPage.statusReason ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <p className="font-semibold">Moderation note</p>
                    <p className="mt-1 text-xs leading-5">{selectedPage.statusReason}</p>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={() => openEditEditor(selectedPage)}
                    disabled={!businessConfig.businessPagesEnabled}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <PencilLine className="h-4 w-4" />
                    Edit page profile
                  </button>
                  <Link
                    to={`/company/${encodeURIComponent(selectedPage.slug)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Eye className="h-4 w-4" />
                    View public page
                  </Link>
                  <Link
                    to={promoteUrl}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <Megaphone className="h-4 w-4" />
                    Promote page
                  </Link>
                  <button
                    type="button"
                    onClick={() => openDeleteDialog(selectedPage)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete page
                  </button>
                </div>
              </section>
            ) : null}

            {selectedPage ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2 2xl:col-span-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Packaged offers</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Build service packages that appear on the public company page.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddPackageDraft}
                    disabled={packageLoading || packageSaving}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Add
                  </button>
                </div>

                {packageLoading ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    Loading packaged offers...
                  </div>
                ) : null}

                {!packageLoading && !packageDrafts.length ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    No packages yet. Add your first offer to showcase scope, pricing, and turnaround.
                  </div>
                ) : null}

                <div className="mt-4 space-y-4">
                  {packageDrafts.map((draftItem, packageIndex) => (
                    <article key={draftItem.clientKey} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Package {packageIndex + 1}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleRemovePackageDraft(draftItem.clientKey)}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove
                        </button>
                      </div>

                      <div className="mt-3 space-y-3">
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Title</span>
                          <input
                            value={draftItem.title}
                            onChange={(event) =>
                              updatePackageDraft(draftItem.clientKey, (current) => ({ ...current, title: event.target.value }))
                            }
                            placeholder="Starter audit, Growth sprint, Enterprise rollout..."
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        </label>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Price</span>
                            <input
                              value={draftItem.price}
                              onChange={(event) =>
                                updatePackageDraft(draftItem.clientKey, (current) => ({ ...current, price: event.target.value }))
                              }
                              inputMode="decimal"
                              placeholder="0.00"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Currency</span>
                            <input
                              value={draftItem.currency}
                              onChange={(event) =>
                                updatePackageDraft(draftItem.clientKey, (current) => ({
                                  ...current,
                                  currency: event.target.value.toUpperCase()
                                }))
                              }
                              placeholder="USD"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm uppercase text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Billing</span>
                            <select
                              value={draftItem.billing}
                              onChange={(event) =>
                                updatePackageDraft(draftItem.clientKey, (current) => ({
                                  ...current,
                                  billing: event.target.value as ServicePackageDraft['billing']
                                }))
                              }
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            >
                              <option value="fixed">Fixed</option>
                              <option value="hourly">Hourly</option>
                              <option value="subscription">Subscription</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">CTA label</span>
                            <input
                              value={draftItem.ctaLabel}
                              onChange={(event) =>
                                updatePackageDraft(draftItem.clientKey, (current) => ({ ...current, ctaLabel: event.target.value }))
                              }
                              placeholder="Request proposal"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Turnaround (days)</span>
                            <input
                              value={draftItem.turnaroundDays}
                              onChange={(event) =>
                                updatePackageDraft(draftItem.clientKey, (current) => ({
                                  ...current,
                                  turnaroundDays: event.target.value
                                }))
                              }
                              inputMode="numeric"
                              placeholder="7"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Revisions</span>
                            <input
                              value={draftItem.revisions}
                              onChange={(event) =>
                                updatePackageDraft(draftItem.clientKey, (current) => ({
                                  ...current,
                                  revisions: event.target.value
                                }))
                              }
                              inputMode="numeric"
                              placeholder="2"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </label>
                        </div>

                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Summary</span>
                          <textarea
                            value={draftItem.summary}
                            onChange={(event) =>
                              updatePackageDraft(draftItem.clientKey, (current) => ({ ...current, summary: event.target.value }))
                            }
                            rows={2}
                            placeholder="Short offer summary shown on the page."
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        </label>

                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Features (one per line)</span>
                          <textarea
                            value={draftItem.featuresText}
                            onChange={(event) =>
                              updatePackageDraft(draftItem.clientKey, (current) => ({
                                ...current,
                                featuresText: event.target.value
                              }))
                            }
                            rows={3}
                            placeholder={'Discovery workshop\nDelivery roadmap\nImplementation support'}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        </label>

                        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={draftItem.active}
                            onChange={(event) =>
                              updatePackageDraft(draftItem.clientKey, (current) => ({ ...current, active: event.target.checked }))
                            }
                          />
                          Offer active on public page
                        </label>

                        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Add-ons</p>
                            <button
                              type="button"
                              onClick={() =>
                                updatePackageDraft(draftItem.clientKey, (current) => ({
                                  ...current,
                                  addons: [...current.addons, createEmptyPackageAddonDraft()]
                                }))
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              <PlusCircle className="h-3 w-3" />
                              Add-on
                            </button>
                          </div>

                          <div className="space-y-2">
                            {draftItem.addons.map((addon) => (
                              <div key={addon.clientKey} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,120px,auto]">
                                  <input
                                    value={addon.name}
                                    onChange={(event) =>
                                      updatePackageDraft(draftItem.clientKey, (current) => ({
                                        ...current,
                                        addons: current.addons.map((entry) =>
                                          entry.clientKey === addon.clientKey ? { ...entry, name: event.target.value } : entry
                                        )
                                      }))
                                    }
                                    placeholder="Priority delivery"
                                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  />
                                  <input
                                    value={addon.price}
                                    onChange={(event) =>
                                      updatePackageDraft(draftItem.clientKey, (current) => ({
                                        ...current,
                                        addons: current.addons.map((entry) =>
                                          entry.clientKey === addon.clientKey ? { ...entry, price: event.target.value } : entry
                                        )
                                      }))
                                    }
                                    placeholder="0.00"
                                    inputMode="decimal"
                                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updatePackageDraft(draftItem.clientKey, (current) => ({
                                        ...current,
                                        addons: current.addons.filter((entry) => entry.clientKey !== addon.clientKey)
                                      }))
                                    }
                                    className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                                  >
                                    Remove
                                  </button>
                                </div>
                                <input
                                  value={addon.description}
                                  onChange={(event) =>
                                    updatePackageDraft(draftItem.clientKey, (current) => ({
                                      ...current,
                                      addons: current.addons.map((entry) =>
                                        entry.clientKey === addon.clientKey
                                          ? { ...entry, description: event.target.value }
                                          : entry
                                      )
                                    }))
                                  }
                                  placeholder="Optional add-on description"
                                  className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                              </div>
                            ))}
                            {!draftItem.addons.length ? (
                              <p className="text-xs text-slate-500">No add-ons yet.</p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleAddPackageDraft}
                    disabled={packageLoading || packageSaving}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Add package
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSavePackages()}
                    disabled={packageLoading || packageSaving}
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Sparkles className="h-4 w-4" />
                    {packageSaving ? 'Saving...' : 'Save offers'}
                  </button>
                </div>
              </section>
            ) : null}
          </aside>

          <section className="min-w-0">
            {selectedPage ? (
              <CompanyPage slugOverride={selectedPage.slug} embedded />
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <div className="mx-auto max-w-2xl text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-blue-600">
                    <Sparkles className="h-8 w-8" />
                  </div>
                  <h2 className="mt-5 text-2xl font-semibold text-slate-900">Build a page system that scales.</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Create a business page for your brand, agency, studio, or client-facing identity. Once created, this workspace becomes
                    your control surface for publishing, follower growth, and page-level operations.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={openCreateEditor}
                      disabled={!businessConfig.businessPagesEnabled || !businessConfig.businessPageUserCreationEnabled}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Create page
                    </button>
                    <Link
                      to="/developer-portal"
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Building2 className="h-4 w-4" />
                      Connect apps later
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {editorOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/55 p-3 sm:items-center sm:p-6">
          <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] bg-white shadow-2xl sm:max-h-[92vh]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {editorMode === 'edit' ? 'Edit page profile' : 'Add new page'}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  {editorMode === 'edit' ? 'Refine your business page' : 'Create a new business page'}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Centralize your page identity here. Assets, contact data, category, and positioning flow straight into your live company page.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {!businessConfig.businessPagesEnabled ? (
                <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Business page management is currently disabled by admin settings.
                </div>
              ) : null}

              {editorMode === 'create' && !businessConfig.businessPageUserCreationEnabled ? (
                <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  New page creation is currently disabled by admin settings.
                </div>
              ) : null}

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr),360px]">
                <div className="space-y-5">
                  <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Brand assets</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-3xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Logo</p>
                        <div className="mt-3 flex items-center gap-4">
                          <div className="h-20 w-20 overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">
                            {draft.logoUrl ? (
                              <img src={draft.logoUrl} alt="Business logo" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-slate-400">
                                <Building2 className="h-8 w-8" />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => setPickerTarget('logo')}
                              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Select logo
                            </button>
                            {draft.logoFileId ? (
                              <button
                                type="button"
                                onClick={() => setDraft((current) => ({ ...current, logoFileId: '', logoUrl: '' }))}
                                className="rounded-full border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                              >
                                Remove logo
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cover image</p>
                        <div className="mt-3 space-y-3">
                          <div className="h-24 overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">
                            {draft.coverUrl ? (
                              <img src={draft.coverUrl} alt="Business cover" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                                No cover selected
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setPickerTarget('cover')}
                              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Select cover
                            </button>
                            {draft.coverFileId ? (
                              <button
                                type="button"
                                onClick={() => setDraft((current) => ({ ...current, coverFileId: '', coverUrl: '' }))}
                                className="rounded-full border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                              >
                                Remove cover
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
                    <label className="space-y-2 md:col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Business name</span>
                      <input
                        value={draft.name}
                        onChange={(event) => handleDraftNameChange(event.target.value)}
                        placeholder="Enter the page name your audience should see"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Handle</span>
                      <input
                        value={draft.handle}
                        onChange={(event) => setDraft((current) => ({ ...current, handle: toSlug(event.target.value) }))}
                        placeholder="your-brand"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Public slug</span>
                      <input
                        value={draft.slug}
                        onChange={(event) => setDraft((current) => ({ ...current, slug: toSlug(event.target.value) }))}
                        placeholder="your-brand"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="space-y-2 md:col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tagline</span>
                      <input
                        value={draft.tagline}
                        onChange={(event) => setDraft((current) => ({ ...current, tagline: event.target.value }))}
                        placeholder="Tell people what your page stands for in one line"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Industry</span>
                      <select
                        value={draft.industry}
                        onChange={(event) => setDraft((current) => ({ ...current, industry: event.target.value }))}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">Select industry</option>
                        {industryOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Category</span>
                      <input
                        value={draft.category}
                        onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
                        placeholder="Primary focus or market category"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Organization size</span>
                      <select
                        value={draft.orgSize}
                        onChange={(event) => setDraft((current) => ({ ...current, orgSize: event.target.value }))}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">Select size</option>
                        {organizationSizes.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Organization type</span>
                      <select
                        value={draft.orgType}
                        onChange={(event) => setDraft((current) => ({ ...current, orgType: event.target.value }))}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">Select type</option>
                        {organizationTypes.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2 md:col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Website</span>
                      <input
                        value={draft.website}
                        onChange={(event) => setDraft((current) => ({ ...current, website: event.target.value }))}
                        placeholder="https://yourcompany.com"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Public email</span>
                      <input
                        value={draft.email}
                        onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                        placeholder="team@yourcompany.com"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Public phone</span>
                      <input
                        value={draft.phone}
                        onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
                        placeholder="+1 555 000 0000"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="space-y-2 md:col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Location</span>
                      <input
                        value={draft.location}
                        onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))}
                        placeholder="City, region, or global coverage"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="space-y-2 md:col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Description</span>
                      <textarea
                        value={draft.description}
                        onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                        rows={6}
                        placeholder="Describe your business, offerings, differentiators, and audience promise."
                        className="w-full rounded-3xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                  </section>
                </div>

                <aside className="space-y-5">
                  <section className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">Live preview</p>
                    <div className="mt-4 overflow-hidden rounded-[28px] border border-white/10 bg-white/5">
                      <div className="h-28 bg-slate-800">
                        {draft.coverUrl ? <img src={draft.coverUrl} alt="Cover preview" className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="h-16 w-16 overflow-hidden rounded-3xl border border-white/10 bg-white/10">
                            {draft.logoUrl ? (
                              <img src={draft.logoUrl} alt="Logo preview" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-slate-300">
                                <Building2 className="h-7 w-7" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-lg font-semibold text-white">{draft.name || 'Your business page'}</p>
                            <p className="truncate text-xs text-slate-300">@{draft.handle || draft.slug || 'your-brand'}</p>
                            <p className="mt-2 line-clamp-2 text-sm text-slate-200">
                              {draft.tagline || 'Add a positioning line that makes the page instantly legible.'}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                          <span>{draft.industry || 'Industry'}</span>
                          <span>{draft.orgSize || 'Size'}</span>
                          <span>{draft.orgType || 'Type'}</span>
                        </div>
                        <p className="mt-4 text-sm leading-6 text-slate-200">
                          {draft.description || 'This page description appears to members, followers, and search surfaces.'}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Publishing address</p>
                    <p className="mt-2 break-all text-sm font-semibold text-slate-900">
                      {`${window.location.origin}/company/${draft.slug || toSlug(draft.name) || 'your-brand'}`}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Keep this short, memorable, and stable. Existing page URLs should only change when absolutely necessary.
                    </p>
                  </section>

                  {editorMode === 'edit' && draft.status && draft.status !== 'active' ? (
                    <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 shadow-sm">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                          <p className="font-semibold">Current page status: {draft.status}</p>
                          <p className="mt-1 text-xs leading-5">
                            {draft.statusReason || 'This page has a non-active status. Resolve moderation requirements before relying on it for publishing.'}
                          </p>
                        </div>
                      </div>
                    </section>
                  ) : null}
                </aside>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-slate-500">
                Business Pages are managed here to keep brand operations separate from the Community engagement workspace.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveDraft()}
                  disabled={saving || !businessConfig.businessPagesEnabled || (editorMode === 'create' && !businessConfig.businessPageUserCreationEnabled)}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Sparkles className="h-4 w-4" />
                  {saving ? 'Saving...' : editorMode === 'edit' ? 'Save page updates' : 'Create page'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deleteDialogOpen && selectedPage ? (
        <div className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-950/55 p-3 sm:items-center sm:p-6">
          <div className="w-full max-w-xl rounded-[32px] bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-rose-100 p-3 text-rose-600">
                <Trash2 className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Delete page</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">Remove {selectedPage.name}?</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This permanently removes the page and its business-page control surface. Type <span className="font-semibold text-slate-900">{selectedPage.slug}</span> to confirm.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-rose-500">Followers</p>
                  <p className="mt-1 text-lg font-semibold text-rose-900">{selectedPage.followersCount}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-rose-500">Posts</p>
                  <p className="mt-1 text-lg font-semibold text-rose-900">{selectedPage.postsCount}</p>
                </div>
              </div>
            </div>

            <label className="mt-5 block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Confirm page slug</span>
              <input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder={selectedPage.slug}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              />
            </label>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteDialog}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeletePage()}
                disabled={deleteBusy || deleteConfirmText.trim().toLowerCase() !== selectedPage.slug.toLowerCase()}
                className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
              >
                <Trash2 className="h-4 w-4" />
                {deleteBusy ? 'Deleting...' : 'Delete page'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <FilePickerModal
        open={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        onSelect={handleAssetSelected}
        title={pickerTarget === 'logo' ? 'Select business logo' : 'Select business cover'}
        filterType="image"
        acceptedTypes={['image']}
        role={user?.role}
        visibility="public"
      />
    </>
  );
};

export default ManagePagesModule;
