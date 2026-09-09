import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  Eye,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  ShoppingBag,
  Tag,
  Trash2,
  X
} from 'lucide-react';
import LocationPicker from '../../components/common/LocationPicker';
import { useNotification } from '../../context/NotificationContext';
import { AdminService } from '../../services/admin';
import { PaymentService } from '../../services/payment';
import type { Currency } from '../../types';
import type { PaymentGateway } from '../../types';
import type {
  MarketplaceCategory,
  MarketplaceListing,
  MarketplaceMeetupPreference,
  MarketplaceReport,
  MarketplaceSettings
} from '../../types/marketplace';

type Section = 'listings' | 'reports' | 'categories' | 'settings' | 'payments';

type ListingDraft = {
  title: string;
  description: string;
  categoryId: string;
  condition: string;
  brand: string;
  tags: string;
  price: string;
  currency: string;
  quantity: string;
  location: string;
  latitude: string;
  longitude: string;
  meetupPreferences: MarketplaceMeetupPreference[];
  hideFromFriendsAndFollowers: boolean;
  contactPreference: string;
  status: string;
  reviewStatus: string;
  featured: boolean;
  adminNotes: string;
  rejectionReason: string;
  sellerId: string;
};

const ADMIN_CONDITION_OPTIONS = ['new', 'used_like_new', 'used_good', 'used_fair'];
const ADMIN_MEETUP_OPTIONS: Array<{ value: MarketplaceMeetupPreference; label: string }> = [
  { value: 'public_meetup', label: 'Public meetup' },
  { value: 'door_pickup', label: 'Door pickup' },
  { value: 'door_dropoff', label: 'Door dropoff' }
];

type CategoryDraft = Partial<MarketplaceCategory> & {
  id?: string;
  name: string;
  slug?: string;
};

type SettingsDraft = {
  enabled: boolean;
  publicBrowsing: boolean;
  approvalMode: NonNullable<MarketplaceSettings['approvalMode']>;
  maxImages: string;
  maxVideos: string;
  maxPrice: string;
  allowCOD: boolean;
  allowOnlinePayments: boolean;
  allowBuyerMessaging: boolean;
  requireApprovalForVideo: boolean;
  requireApprovalForNewSellers: boolean;
  paymentMethodsText: string;
  enabledPaymentMethodsText: string;
  reportingReasonsText: string;
  categoriesRequireApprovalText: string;
  sellerCanSell: boolean;
  sellerMaxListings: string;
  sellerMaxActiveListings: string;
  commissionEnabled: boolean;
  commissionRate: string;
  commissionFixedFee: string;
  commissionCurrency: string;
};

const sectionButtonClass = (active: boolean) =>
  `rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
    active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
  }`;

const resolveDefaultCurrencyCode = (currencies: Currency[] = []) =>
  currencies.find((currency) => currency.isDefault || currency.is_default)?.code ||
  currencies.find((currency) => currency.isActive ?? currency.is_active ?? true)?.code ||
  currencies[0]?.code ||
  'USD';

const normalizeCurrencyCode = (value: string | null | undefined, fallback = 'USD') =>
  String(value || fallback).trim().toUpperCase();

const emptyListingDraft = (defaultCurrencyCode = 'USD'): ListingDraft => ({
  title: '',
  description: '',
  categoryId: '',
  condition: 'new',
  brand: '',
  tags: '',
  price: '',
  currency: normalizeCurrencyCode(defaultCurrencyCode),
  quantity: '1',
  location: '',
  latitude: '',
  longitude: '',
  meetupPreferences: ['public_meetup'],
  hideFromFriendsAndFollowers: false,
  contactPreference: 'message',
  status: 'draft',
  reviewStatus: 'pending',
  featured: false,
  adminNotes: '',
  rejectionReason: '',
  sellerId: ''
});

const emptyCategoryDraft = (): CategoryDraft => ({
  id: '',
  name: '',
  slug: '',
  description: '',
  parentId: null,
  sortOrder: 0,
  isActive: true,
  requiresApproval: false,
  icon: ''
});

const emptySettingsDraft = (defaultCurrencyCode = 'USD'): SettingsDraft => ({
  enabled: true,
  publicBrowsing: true,
  approvalMode: 'manual',
  maxImages: '10',
  maxVideos: '1',
  maxPrice: '',
  allowCOD: true,
  allowOnlinePayments: true,
  allowBuyerMessaging: true,
  requireApprovalForVideo: false,
  requireApprovalForNewSellers: true,
  paymentMethodsText: 'cash_on_delivery, wallet, card, bank_transfer',
  enabledPaymentMethodsText: 'cash_on_delivery, wallet, card, bank_transfer',
  reportingReasonsText: 'Scam / fraud\nProhibited item\nMisleading listing\nDuplicate listing\nOffensive content\nWrong category\nSuspicious seller\nOther',
  categoriesRequireApprovalText: '',
  sellerCanSell: true,
  sellerMaxListings: '50',
  sellerMaxActiveListings: '20',
  commissionEnabled: false,
  commissionRate: '0',
  commissionFixedFee: '0',
  commissionCurrency: normalizeCurrencyCode(defaultCurrencyCode)
});

const asList = (value: string) =>
  value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const MarketplaceManagement: React.FC = () => {
  const { showNotification } = useNotification();
  const [activeSection, setActiveSection] = useState<Section>('listings');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [reports, setReports] = useState<MarketplaceReport[]>([]);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [activePaymentMethods, setActivePaymentMethods] = useState<PaymentGateway[]>([]);
  const [settings, setSettings] = useState<MarketplaceSettings | null>(null);
  const [search, setSearch] = useState('');
  const [selectedListingId, setSelectedListingId] = useState('');
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [listingDraft, setListingDraft] = useState<ListingDraft>(emptyListingDraft());
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategoryDraft());
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(emptySettingsDraft());
  const defaultCurrencyCode = useMemo(() => resolveDefaultCurrencyCode(currencies), [currencies]);
  const activePaymentMethodIds = useMemo(
    () =>
      Array.from(
        new Map(
          activePaymentMethods
            .map((method) => ({
              id: String(method?.id || '').trim(),
              name: String(method?.name || method?.id || '').trim(),
              isEnabled: method?.is_enabled ?? method?.isEnabled ?? false
            }))
            .filter((method) => method.id && method.isEnabled)
            .map((method) => [method.id, method] as const)
        ).values()
      ),
    [activePaymentMethods]
  );
  const activeMarketplacePaymentMethods = useMemo(
    () =>
      activePaymentMethodIds.map((method) => ({
        id: method.id,
        label: method.name,
        selected: (settingsDraft.enabledPaymentMethodsText || '')
          .split(/[\n,]/)
          .map((entry) => entry.trim())
          .filter(Boolean)
          .includes(method.id)
      })),
    [activePaymentMethodIds, settingsDraft.enabledPaymentMethodsText]
  );

  const loadAll = async () => {
    setLoading(true);
    try {
      const [listingRows, reportRows, categoryRows, settingsRows, currencyRows, paymentMethodsRows] = await Promise.all([
        AdminService.getMarketplaceListings({ limit: 200 }),
        AdminService.getMarketplaceReports(),
        AdminService.getMarketplaceCategories(),
        AdminService.getMarketplaceSettings(),
        AdminService.getActiveCurrencies().catch(() => []),
        PaymentService.getActivePaymentMethods().catch(() => [])
      ]);
      const normalizedCurrencies = Array.isArray(currencyRows) ? currencyRows : [];
      const normalizedPaymentMethods = Array.isArray(paymentMethodsRows) ? paymentMethodsRows : [];
      const resolvedCurrencyCode = resolveDefaultCurrencyCode(normalizedCurrencies);
      setListings(Array.isArray(listingRows) ? listingRows : []);
      setReports(Array.isArray(reportRows) ? reportRows : []);
      setCategories(Array.isArray(categoryRows) ? categoryRows : []);
      setCurrencies(normalizedCurrencies);
      setActivePaymentMethods(normalizedPaymentMethods);
      setSettings(settingsRows);
      const currentEnabledPaymentMethods = settingsRows?.enabledPaymentMethods || settingsRows?.paymentMethods || ['cash_on_delivery', 'wallet', 'card', 'bank_transfer'];
      setSettingsDraft({
        ...emptySettingsDraft(resolvedCurrencyCode),
        enabled: settingsRows?.enabled ?? true,
        publicBrowsing: settingsRows?.publicBrowsing ?? true,
        approvalMode: settingsRows?.approvalMode ?? 'manual',
        maxImages: String(settingsRows?.maxImages ?? 10),
        maxVideos: String(settingsRows?.maxVideos ?? 1),
        maxPrice: settingsRows?.maxPrice != null ? String(settingsRows.maxPrice) : '',
        allowCOD: settingsRows?.allowCOD ?? true,
        allowOnlinePayments: settingsRows?.allowOnlinePayments ?? true,
        allowBuyerMessaging: settingsRows?.allowBuyerMessaging ?? true,
        requireApprovalForVideo: settingsRows?.requireApprovalForVideo ?? false,
        requireApprovalForNewSellers: settingsRows?.requireApprovalForNewSellers ?? true,
        paymentMethodsText: (settingsRows?.paymentMethods || currentEnabledPaymentMethods).join(', '),
        enabledPaymentMethodsText: currentEnabledPaymentMethods.join(', '),
        reportingReasonsText: (settingsRows?.reportingReasons || emptySettingsDraft().reportingReasonsText.split('\n')).join('\n'),
        categoriesRequireApprovalText: (settingsRows?.categoriesRequireApproval || []).join('\n'),
        sellerCanSell: settingsRows?.sellerLimits?.canSell ?? true,
        sellerMaxListings: String(settingsRows?.sellerLimits?.maxListings ?? 50),
        sellerMaxActiveListings: String(settingsRows?.sellerLimits?.maxActiveListings ?? 20),
        commissionEnabled: settingsRows?.commission?.enabled ?? false,
        commissionRate: String(settingsRows?.commission?.rate ?? 0),
        commissionFixedFee: String(settingsRows?.commission?.fixedFee ?? 0),
        commissionCurrency: normalizeCurrencyCode(settingsRows?.commission?.currency, resolvedCurrencyCode)
      });
    } catch (error: any) {
      showNotification('error', 'Marketplace load failed', error?.message || 'Unable to load marketplace admin data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    const selected = listings.find((item) => item.id === selectedListingId);
    if (!selected) {
      setListingDraft(emptyListingDraft(defaultCurrencyCode));
      return;
    }

    setListingDraft({
      title: selected.title || '',
      description: selected.description || '',
      categoryId: selected.categoryId || '',
      condition: String(selected.condition || 'new'),
      brand: selected.brand || '',
      tags: Array.isArray(selected.tags) ? selected.tags.join(', ') : '',
      price: selected.price != null ? String(selected.price) : '',
      currency: normalizeCurrencyCode(selected.currency, defaultCurrencyCode),
      quantity: String(selected.quantity ?? 1),
      location: selected.location || '',
      latitude: selected.latitude != null ? String(selected.latitude) : '',
      longitude: selected.longitude != null ? String(selected.longitude) : '',
      meetupPreferences: Array.isArray(selected.meetupPreferences) && selected.meetupPreferences.length
        ? (selected.meetupPreferences.filter(Boolean) as MarketplaceMeetupPreference[])
        : ['public_meetup'],
      hideFromFriendsAndFollowers: Boolean(selected.hideFromFriendsAndFollowers),
      contactPreference: selected.contactPreference || 'message',
      status: String(selected.status || 'draft'),
      reviewStatus: String(selected.reviewStatus || 'pending'),
      featured: Boolean(selected.featured),
      adminNotes: selected.adminNotes || '',
      rejectionReason: selected.rejectionReason || '',
      sellerId: selected.sellerId || ''
    });
  }, [defaultCurrencyCode, listings, selectedListingId]);

  const filteredListings = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return listings;
    return listings.filter((listing) => {
      const haystack = [
        listing.title,
        listing.slug,
        listing.description,
        listing.location,
        listing.status,
        listing.reviewStatus,
        listing.seller?.name,
        listing.seller?.username,
        listing.category?.name
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [listings, search]);

  const visibleListingIds = useMemo(() => filteredListings.map((listing) => listing.id), [filteredListings]);
  const allVisibleListingsSelected = visibleListingIds.length > 0 && visibleListingIds.every((id) => selectedListingIds.includes(id));
  const activeCategoryIds = useMemo(
    () => categories.filter((category) => category.isActive !== false).map((category) => category.id),
    [categories]
  );
  const inactiveCategoryIds = useMemo(
    () => categories.filter((category) => category.isActive === false).map((category) => category.id),
    [categories]
  );

  const stats = useMemo(() => {
    const byStatus = (status: string) => listings.filter((item) => String(item.status || '').toLowerCase() === status).length;
    return {
      total: listings.length,
      active: byStatus('active'),
      pending: byStatus('pending_review'),
      sold: byStatus('sold'),
      reports: reports.length
    };
  }, [listings, reports]);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await loadAll();
  };

  const toggleMarketplacePaymentMethod = (methodId: string) => {
    const normalized = String(methodId || '').trim();
    if (!normalized) return;
    setSettingsDraft((previous) => {
      const current = asList(previous.enabledPaymentMethodsText);
      const next = current.includes(normalized)
        ? current.filter((entry) => entry !== normalized)
        : [...current, normalized];
      return { ...previous, enabledPaymentMethodsText: next.join(', ') };
    });
  };

  const syncMarketplacePaymentMethods = () => {
    const activeIds = activePaymentMethodIds.map((method) => method.id);
    setSettingsDraft((previous) => ({ ...previous, enabledPaymentMethodsText: activeIds.join(', ') }));
  };

  const saveListing = async () => {
    setSaving(true);
    try {
      const payload = {
        ...listingDraft,
        brand: listingDraft.brand.trim(),
        tags: listingDraft.tags,
        price: listingDraft.price === '' ? null : Number(listingDraft.price),
        quantity: listingDraft.quantity === '' ? null : Number(listingDraft.quantity),
        latitude: listingDraft.latitude === '' ? null : Number(listingDraft.latitude),
        longitude: listingDraft.longitude === '' ? null : Number(listingDraft.longitude),
        featured: Boolean(listingDraft.featured),
        hideFromFriendsAndFollowers: Boolean(listingDraft.hideFromFriendsAndFollowers),
        title: listingDraft.title.trim(),
        description: listingDraft.description.trim(),
        location: listingDraft.location.trim(),
        sellerId: listingDraft.sellerId.trim() || undefined
      };
      const ok = selectedListingId
        ? await AdminService.updateMarketplaceListing(selectedListingId, payload)
        : await AdminService.saveMarketplaceListing(payload);
      if (!ok) throw new Error('Marketplace listing save failed');
      showNotification('success', 'Listing saved', selectedListingId ? 'Marketplace listing updated.' : 'Marketplace listing created.');
      setSelectedListingId('');
      setListingDraft(emptyListingDraft(defaultCurrencyCode));
      await loadAll();
    } catch (error: any) {
      showNotification('error', 'Listing save failed', error?.message || 'Unable to save marketplace listing.');
    } finally {
      setSaving(false);
    }
  };

  const runListingAction = async (
    action: 'approve' | 'reject' | 'suspend' | 'restore' | 'feature' | 'unfeature' | 'delete',
    listingId: string
  ) => {
    if (action === 'delete' && !window.confirm('Remove this listing? It will be hidden from the marketplace and can be restored by an admin.')) return;
    setSaving(true);
    try {
      let ok = false;
      if (action === 'approve') ok = await AdminService.approveMarketplaceListing(listingId);
      if (action === 'reject') ok = await AdminService.rejectMarketplaceListing(listingId, 'Admin marketplace review');
      if (action === 'suspend') ok = await AdminService.suspendMarketplaceListing(listingId, 'Admin moderation');
      if (action === 'restore') ok = await AdminService.restoreMarketplaceListing(listingId);
      if (action === 'feature') ok = await AdminService.featureMarketplaceListing(listingId, true);
      if (action === 'unfeature') ok = await AdminService.featureMarketplaceListing(listingId, false);
      if (action === 'delete') ok = await AdminService.deleteMarketplaceListing(listingId);
      if (!ok) throw new Error(`Unable to ${action} marketplace listing`);
      showNotification('success', 'Marketplace updated', `Listing ${action}d successfully.`);
      await loadAll();
    } catch (error: any) {
      showNotification('error', 'Marketplace action failed', error?.message || 'Unable to update listing.');
    } finally {
      setSaving(false);
    }
  };

  const saveCategory = async () => {
    setSaving(true);
    try {
      const payload = {
        ...categoryDraft,
        name: String(categoryDraft.name || '').trim(),
        slug: String(categoryDraft.slug || '').trim(),
        description: String(categoryDraft.description || '').trim() || null,
        sortOrder: Number(categoryDraft.sortOrder || 0),
        parentId: String(categoryDraft.parentId || '').trim() || null,
        requiresApproval: Boolean(categoryDraft.requiresApproval)
      };
      const ok = categoryDraft.id
        ? await AdminService.updateMarketplaceCategory(categoryDraft.id, payload)
        : await AdminService.saveMarketplaceCategory(payload as MarketplaceCategory);
      if (!ok) throw new Error('Category save failed');
      showNotification('success', 'Category saved', categoryDraft.id ? 'Marketplace category updated.' : 'Marketplace category created.');
      setCategoryDraft(emptyCategoryDraft());
      await loadAll();
    } catch (error: any) {
      showNotification('error', 'Category save failed', error?.message || 'Unable to save category.');
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (id: string) => {
    const category = categories.find((item) => item.id === id);
    if (!category || !window.confirm('Disable “' + category.name + '”? Existing listings will remain intact, but this category will stop appearing in the marketplace.')) return;
    setSaving(true);
    try {
      const ok = await AdminService.deleteMarketplaceCategory(id);
      if (!ok) throw new Error('Category delete failed');
      showNotification('success', 'Category removed', 'Marketplace category deleted.');
      if (categoryDraft.id === id) setCategoryDraft(emptyCategoryDraft());
      await loadAll();
    } catch (error: any) {
      showNotification('error', 'Category delete failed', error?.message || 'Unable to delete category.');
    } finally {
      setSaving(false);
    }
  };

  const toggleListingSelection = (listingId: string) => {
    setSelectedListingIds((previous) =>
      previous.includes(listingId) ? previous.filter((id) => id !== listingId) : [...previous, listingId]
    );
  };

  const toggleAllVisibleListings = () => {
    setSelectedListingIds((previous) => {
      if (allVisibleListingsSelected) return previous.filter((id) => !visibleListingIds.includes(id));
      return Array.from(new Set([...previous, ...visibleListingIds]));
    });
  };

  const bulkDeleteListings = async () => {
    if (!selectedListingIds.length) {
      showNotification('warning', 'No listings selected', 'Select one or more listings first.');
      return;
    }
    if (!window.confirm(`Remove ${selectedListingIds.length} selected listing${selectedListingIds.length === 1 ? '' : 's'}? They will be hidden and remain restorable by an admin.`)) return;
    setSaving(true);
    try {
      const result = await AdminService.bulkDeleteMarketplaceListings(selectedListingIds);
      setSelectedListingIds([]);
      if (result.failed.length) {
        showNotification('warning', 'Listings partially removed', `${result.count} removed; ${result.failed.length} could not be found.`);
      } else {
        showNotification('success', 'Listings removed', `${result.count} listing${result.count === 1 ? '' : 's'} removed successfully.`);
      }
      await loadAll();
    } catch (error: any) {
      showNotification('error', 'Bulk listing action failed', error?.message || 'Unable to remove selected listings.');
    } finally {
      setSaving(false);
    }
  };

  const restoreCategory = async (id: string) => {
    setSaving(true);
    try {
      const ok = await AdminService.restoreMarketplaceCategory(id);
      if (!ok) throw new Error('Category restore failed');
      showNotification('success', 'Category restored', 'Marketplace category is active again.');
      await loadAll();
    } catch (error: any) {
      showNotification('error', 'Category restore failed', error?.message || 'Unable to restore category.');
    } finally {
      setSaving(false);
    }
  };

  const toggleCategorySelection = (categoryId: string) => {
    setSelectedCategoryIds((previous) =>
      previous.includes(categoryId) ? previous.filter((id) => id !== categoryId) : [...previous, categoryId]
    );
  };

  const toggleAllCategories = () => {
    const allIds = categories.map((category) => category.id);
    setSelectedCategoryIds((previous) => {
      if (allIds.length && allIds.every((id) => previous.includes(id))) return previous.filter((id) => !allIds.includes(id));
      return Array.from(new Set([...previous, ...allIds]));
    });
  };

  const bulkUpdateCategories = async (action: 'disable' | 'restore') => {
    const ids = selectedCategoryIds.filter((id) => (action === 'disable' ? activeCategoryIds : inactiveCategoryIds).includes(id));
    if (!ids.length) {
      showNotification('warning', 'No applicable categories selected', `Select ${action === 'disable' ? 'active' : 'inactive'} categories first.`);
      return;
    }
    const verb = action === 'disable' ? 'Disable' : 'Restore';
    if (!window.confirm(`${verb} ${ids.length} selected categor${ids.length === 1 ? 'y' : 'ies'}?`)) return;
    setSaving(true);
    try {
      const result = action === 'disable'
        ? await AdminService.bulkDisableMarketplaceCategories(ids)
        : await AdminService.bulkRestoreMarketplaceCategories(ids);
      setSelectedCategoryIds([]);
      if (result.failed.length) {
        showNotification('warning', `Categories partially ${action}d`, `${result.count} updated; ${result.failed.length} could not be found.`);
      } else {
        showNotification('success', `Categories ${action}d`, `${result.count} categor${result.count === 1 ? 'y' : 'ies'} updated successfully.`);
      }
      await loadAll();
    } catch (error: any) {
      showNotification('error', `Bulk category action failed`, error?.message || `Unable to ${action} selected categories.`);
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const activeMarketplaceMethods = asList(settingsDraft.enabledPaymentMethodsText);
      const payload: Partial<MarketplaceSettings> = {
        enabled: settingsDraft.enabled,
        publicBrowsing: settingsDraft.publicBrowsing,
        approvalMode: settingsDraft.approvalMode,
        maxImages: Number(settingsDraft.maxImages || 0),
        maxVideos: Number(settingsDraft.maxVideos || 0),
        maxPrice: settingsDraft.maxPrice ? Number(settingsDraft.maxPrice) : null,
        allowCOD: settingsDraft.allowCOD,
        allowOnlinePayments: settingsDraft.allowOnlinePayments,
        allowBuyerMessaging: settingsDraft.allowBuyerMessaging,
        requireApprovalForVideo: settingsDraft.requireApprovalForVideo,
        requireApprovalForNewSellers: settingsDraft.requireApprovalForNewSellers,
        paymentMethods: asList(settingsDraft.paymentMethodsText),
        enabledPaymentMethods: activeMarketplaceMethods,
        allowedPaymentMethods: activeMarketplaceMethods,
        reportingReasons: asList(settingsDraft.reportingReasonsText),
        categoriesRequireApproval: asList(settingsDraft.categoriesRequireApprovalText),
        sellerLimits: {
          canSell: settingsDraft.sellerCanSell,
          maxListings: Number(settingsDraft.sellerMaxListings || 0),
          maxActiveListings: Number(settingsDraft.sellerMaxActiveListings || 0)
        },
        commission: {
          enabled: settingsDraft.commissionEnabled,
          rate: Number(settingsDraft.commissionRate || 0),
          fixedFee: Number(settingsDraft.commissionFixedFee || 0),
          currency: settingsDraft.commissionCurrency || 'USD'
        }
      };
      const ok = await AdminService.saveMarketplaceSettings(payload);
      if (!ok) throw new Error('Marketplace settings save failed');
      showNotification('success', 'Marketplace settings saved', 'Marketplace configuration updated.');
      await loadAll();
    } catch (error: any) {
      showNotification('error', 'Settings save failed', error?.message || 'Unable to save marketplace settings.');
    } finally {
      setSaving(false);
    }
  };

  const resolveReport = async (reportId: string, status: 'resolved' | 'dismissed') => {
    setSaving(true);
    try {
      const ok = await AdminService.resolveMarketplaceReport(reportId, { status });
      if (!ok) throw new Error('Report resolution failed');
      showNotification('success', 'Report updated', `Report marked as ${status}.`);
      await loadAll();
    } catch (error: any) {
      showNotification('error', 'Report update failed', error?.message || 'Unable to resolve report.');
    } finally {
      setSaving(false);
    }
  };

  const selectedListing = useMemo(
    () => listings.find((listing) => listing.id === selectedListingId) || null,
    [listings, selectedListingId]
  );

  const toggleListingMeetupPreference = (value: MarketplaceMeetupPreference) => {
    setListingDraft((previous) => {
      const current = Array.isArray(previous.meetupPreferences) ? previous.meetupPreferences : [];
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      return { ...previous, meetupPreferences: next.length ? next : [value] };
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-slate-200 bg-white p-10 text-slate-500">
        <Loader2 className="mr-3 h-5 w-5 animate-spin" />
        Loading marketplace admin...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">
              <ShoppingBag className="h-4 w-4" />
              Marketplace
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-slate-950">Marketplace control center</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Review, moderate, and configure marketplace listings, categories, reports, payments, and seller policy from one place.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={refresh} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric title="Total listings" value={stats.total} />
          <Metric title="Active" value={stats.active} />
          <Metric title="Pending review" value={stats.pending} />
          <Metric title="Reports" value={stats.reports} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={sectionButtonClass(activeSection === 'listings')} onClick={() => setActiveSection('listings')}>
          Listings
        </button>
        <button type="button" className={sectionButtonClass(activeSection === 'reports')} onClick={() => setActiveSection('reports')}>
          Reports
        </button>
        <button type="button" className={sectionButtonClass(activeSection === 'categories')} onClick={() => setActiveSection('categories')}>
          Categories
        </button>
        <button type="button" className={sectionButtonClass(activeSection === 'settings')} onClick={() => setActiveSection('settings')}>
          Settings
        </button>
        <button type="button" className={sectionButtonClass(activeSection === 'payments')} onClick={() => setActiveSection('payments')}>
          Payments
        </button>
      </div>

      {activeSection === 'listings' && (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">All listings</h3>
                <p className="mt-1 text-sm text-slate-600">Search, review, approve, suspend, feature, or remove listings.</p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search listings..."
                  className="input w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-3 text-sm outline-none"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={allVisibleListingsSelected}
                  onChange={toggleAllVisibleListings}
                  aria-label="Select all visible marketplace listings"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span>{selectedListingIds.length ? `${selectedListingIds.length} selected` : 'Select listings for bulk actions'}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={toggleAllVisibleListings}
                  disabled={!visibleListingIds.length || saving}
                  className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 disabled:opacity-50"
                >
                  {allVisibleListingsSelected ? 'Clear visible' : 'Select visible'}
                </button>
                <button
                  type="button"
                  onClick={() => void bulkDeleteListings()}
                  disabled={!selectedListingIds.length || saving}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove selected
                </button>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <div className="max-h-[720px] overflow-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="w-12 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={allVisibleListingsSelected}
                          onChange={toggleAllVisibleListings}
                          aria-label="Select all visible marketplace listings"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600"
                        />
                      </th>
                      <th className="px-4 py-3">Listing</th>
                      <th className="px-4 py-3">Seller</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredListings.map((listing) => (
                      <tr key={listing.id} className="align-top">
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedListingIds.includes(listing.id)}
                            onChange={() => toggleListingSelection(listing.id)}
                            aria-label={`Select ${listing.title}`}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-950">{listing.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{listing.description || 'No description provided.'}</p>
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          <div className="font-medium">{listing.seller?.name || listing.seller?.username || listing.sellerId}</div>
                          <div className="text-xs text-slate-500">{listing.category?.name || 'Uncategorized'}</div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {String(listing.status || 'draft').replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {listing.price != null ? `${normalizeCurrencyCode(listing.currency, defaultCurrencyCode)} ${listing.price}` : 'Price on request'}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setSelectedListingId(listing.id)} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                              Edit
                            </button>
                            <button type="button" onClick={() => runListingAction('approve', listing.id)} className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
                              Approve
                            </button>
                            <button type="button" onClick={() => runListingAction('reject', listing.id)} className="rounded-full border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700">
                              Reject
                            </button>
                            <button type="button" onClick={() => runListingAction('suspend', listing.id)} className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700">
                              Suspend
                            </button>
                            <button type="button" onClick={() => runListingAction(listing.featured ? 'unfeature' : 'feature', listing.id)} className="rounded-full border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700">
                              {listing.featured ? 'Unfeature' : 'Feature'}
                            </button>
                            <button type="button" onClick={() => runListingAction('delete', listing.id)} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredListings.length && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                          No marketplace listings found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">{selectedListingId ? 'Edit listing' : 'Create listing'}</h3>
                  <p className="mt-1 text-sm text-slate-600">Admin can create or adjust listings directly.</p>
                </div>
                {selectedListingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedListingId('');
                      setListingDraft(emptyListingDraft(defaultCurrencyCode));
                    }}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    <X className="mr-1 inline h-3.5 w-3.5" />
                    Clear
                  </button>
                )}
              </div>

              <div className="mt-4 grid gap-4">
                <Input label="Title" value={listingDraft.title} onChange={(value) => setListingDraft((prev) => ({ ...prev, title: value }))} />
                <Input label="Description" value={listingDraft.description} onChange={(value) => setListingDraft((prev) => ({ ...prev, description: value }))} multiline />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Category ID" value={listingDraft.categoryId} onChange={(value) => setListingDraft((prev) => ({ ...prev, categoryId: value }))} />
                  <Input label="Seller ID" value={listingDraft.sellerId} onChange={(value) => setListingDraft((prev) => ({ ...prev, sellerId: value }))} />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Input label="Price" type="number" value={listingDraft.price} onChange={(value) => setListingDraft((prev) => ({ ...prev, price: value }))} />
                  <CurrencyField
                    label="Currency"
                    value={listingDraft.currency}
                    currencies={currencies}
                    onChange={(value) => setListingDraft((prev) => ({ ...prev, currency: value }))}
                  />
                  <Input label="Quantity" type="number" value={listingDraft.quantity} onChange={(value) => setListingDraft((prev) => ({ ...prev, quantity: value }))} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField label="Condition" value={listingDraft.condition} onChange={(value) => setListingDraft((prev) => ({ ...prev, condition: value }))} options={ADMIN_CONDITION_OPTIONS} />
                  <Input label="Brand" value={listingDraft.brand} onChange={(value) => setListingDraft((prev) => ({ ...prev, brand: value }))} />
                </div>
                <Input label="Tags" value={listingDraft.tags} onChange={(value) => setListingDraft((prev) => ({ ...prev, tags: value }))} />
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-2 text-sm font-semibold text-slate-900">Location</p>
                  <LocationPicker
                    value={{
                      location: listingDraft.location,
                      formattedAddress: listingDraft.location,
                      latitude: listingDraft.latitude === '' ? null : Number(listingDraft.latitude),
                      longitude: listingDraft.longitude === '' ? null : Number(listingDraft.longitude)
                    }}
                    onChange={(next) =>
                      setListingDraft((prev) => ({
                        ...prev,
                        location: String(next.location || next.formattedAddress || next.formatted_address || '').trim(),
                        latitude: next.latitude != null ? String(next.latitude) : '',
                        longitude: next.longitude != null ? String(next.longitude) : ''
                      }))
                    }
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField label="Contact preference" value={listingDraft.contactPreference} onChange={(value) => setListingDraft((prev) => ({ ...prev, contactPreference: value }))} options={['message', 'call', 'email', 'any']} />
                  <ToggleField
                    label="Hide from friends and followers"
                    checked={listingDraft.hideFromFriendsAndFollowers}
                    onChange={(value) => setListingDraft((prev) => ({ ...prev, hideFromFriendsAndFollowers: value }))}
                  />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Meetup preferences</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ADMIN_MEETUP_OPTIONS.map((option) => {
                      const active = listingDraft.meetupPreferences.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleListingMeetupPreference(option.value)}
                          className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                            active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <SelectField label="Status" value={listingDraft.status} onChange={(value) => setListingDraft((prev) => ({ ...prev, status: value }))} options={['draft', 'pending_review', 'approved', 'active', 'reserved', 'sold', 'removed', 'suspended']} />
                  <SelectField label="Review status" value={listingDraft.reviewStatus} onChange={(value) => setListingDraft((prev) => ({ ...prev, reviewStatus: value }))} options={['draft', 'pending', 'approved', 'rejected']} />
                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={listingDraft.featured}
                      onChange={(event) => setListingDraft((prev) => ({ ...prev, featured: event.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    Featured listing
                  </label>
                </div>
                <Input label="Admin notes" value={listingDraft.adminNotes} onChange={(value) => setListingDraft((prev) => ({ ...prev, adminNotes: value }))} multiline />
                <Input label="Rejection reason" value={listingDraft.rejectionReason} onChange={(value) => setListingDraft((prev) => ({ ...prev, rejectionReason: value }))} multiline />
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveListing}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {selectedListingId ? 'Update listing' : 'Create listing'}
                </button>
                {selectedListing && (
                  <button
                    type="button"
                    onClick={() => runListingAction('restore', selectedListing.id)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Restore
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-950">Selected listing</h3>
              {selectedListing ? (
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-950">{selectedListing.title}</p>
                  <p className="leading-6 text-slate-600">{selectedListing.description || 'No description provided.'}</p>
                  <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
                    <Info label="Seller" value={selectedListing.seller?.name || selectedListing.sellerId} />
                    <Info label="Category" value={selectedListing.category?.name || 'Uncategorized'} />
                    <Info label="Status" value={String(selectedListing.status || 'draft')} />
                    <Info label="Price" value={selectedListing.price != null ? `${selectedListing.currency || 'USD'} ${selectedListing.price}` : 'Price on request'} />
                    <Info label="Brand" value={selectedListing.brand || 'Not set'} />
                    <Info label="Privacy" value={selectedListing.hideFromFriendsAndFollowers ? 'Hidden from friends/followers' : 'Standard visibility'} />
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">Choose a listing from the table to edit or inspect it.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeSection === 'reports' && (
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">Reports queue</h3>
          <div className="mt-5 space-y-4">
            {reports.map((report) => (
              <div key={report.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <p className="font-semibold text-slate-950">{report.reason || 'Marketplace report'}</p>
                    <p className="text-sm text-slate-600">{report.details || 'No additional details provided.'}</p>
                    <p className="text-xs text-slate-500">Status: {report.status || 'open'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => resolveReport(report.id, 'resolved')} className="rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                      Resolve
                    </button>
                    <button type="button" onClick={() => resolveReport(report.id, 'dismissed')} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!reports.length && <p className="text-sm text-slate-500">No reports waiting for review.</p>}
          </div>
        </div>
      )}

      {activeSection === 'categories' && (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Categories</h3>
                <p className="mt-1 text-sm text-slate-600">Select multiple categories to disable or restore them together.</p>
              </div>
              <input
                type="checkbox"
                checked={categories.length > 0 && categories.every((category) => selectedCategoryIds.includes(category.id))}
                onChange={toggleAllCategories}
                aria-label="Select all marketplace categories"
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
              <span className="mr-auto text-sm text-slate-700">
                {selectedCategoryIds.length ? `${selectedCategoryIds.length} selected` : 'No categories selected'}
              </span>
              <button
                type="button"
                onClick={() => void bulkUpdateCategories('disable')}
                disabled={!selectedCategoryIds.some((id) => activeCategoryIds.includes(id)) || saving}
                className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50"
              >
                Disable selected
              </button>
              <button
                type="button"
                onClick={() => void bulkUpdateCategories('restore')}
                disabled={!selectedCategoryIds.some((id) => inactiveCategoryIds.includes(id)) || saving}
                className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
              >
                Restore selected
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategoryIds([])}
                disabled={!selectedCategoryIds.length || saving}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {categories.map((category) => (
                <div key={category.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedCategoryIds.includes(category.id)}
                        onChange={() => toggleCategorySelection(category.id)}
                        aria-label={`Select ${category.name}`}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600"
                      />
                      <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950">{category.name}</p>
                        {category.isActive === false && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Inactive</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{category.slug || category.id}</p>
                      <p className="mt-2 text-sm text-slate-600">{category.description || 'No description provided.'}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCategoryDraft({ ...category })}
                        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                      >
                        Edit
                      </button>
                      {category.isActive === false ? (
                        <button
                          type="button"
                          onClick={() => void restoreCategory(category.id)}
                          className="rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void deleteCategory(category.id)}
                          className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700"
                        >
                          Disable
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!categories.length && <p className="text-sm text-slate-500">No marketplace categories configured yet.</p>}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">{categoryDraft.id ? 'Edit category' : 'Add category'}</h3>
            <div className="mt-4 grid gap-4">
              <Input label="Name" value={categoryDraft.name || ''} onChange={(value) => setCategoryDraft((prev) => ({ ...prev, name: value }))} />
              <Input label="Slug" value={categoryDraft.slug || ''} onChange={(value) => setCategoryDraft((prev) => ({ ...prev, slug: value }))} />
              <Input label="Description" value={String(categoryDraft.description || '')} onChange={(value) => setCategoryDraft((prev) => ({ ...prev, description: value }))} multiline />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-900">Parent category</span>
                  <select
                    value={String(categoryDraft.parentId || '')}
                    onChange={(event) => setCategoryDraft((prev) => ({ ...prev, parentId: event.target.value || null }))}
                    className="input w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="">Root category</option>
                    {categories
                      .filter((category) => category.id !== categoryDraft.id && category.isActive !== false)
                      .map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                  </select>
                </label>
                <Input label="Sort order" type="number" value={String(categoryDraft.sortOrder ?? 0)} onChange={(value) => setCategoryDraft((prev) => ({ ...prev, sortOrder: Number(value || 0) }))} />
              </div>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(categoryDraft.isActive ?? true)}
                  onChange={(event) => setCategoryDraft((prev) => ({ ...prev, isActive: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                Active category
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(categoryDraft.requiresApproval)}
                  onChange={(event) => setCategoryDraft((prev) => ({ ...prev, requiresApproval: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                Require approval
              </label>
              <Input label="Icon hint" value={String(categoryDraft.icon || '')} onChange={(value) => setCategoryDraft((prev) => ({ ...prev, icon: value }))} />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={saveCategory} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {categoryDraft.id ? 'Update category' : 'Create category'}
              </button>
              <button
                type="button"
                onClick={() => setCategoryDraft(emptyCategoryDraft())}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                <X className="h-4 w-4" />
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'settings' && (
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">Marketplace settings</h3>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <ToggleField label="Marketplace enabled" checked={settingsDraft.enabled} onChange={(checked) => setSettingsDraft((prev) => ({ ...prev, enabled: checked }))} />
            <ToggleField label="Public browsing" checked={settingsDraft.publicBrowsing} onChange={(checked) => setSettingsDraft((prev) => ({ ...prev, publicBrowsing: checked }))} />
            <ToggleField label="Buyer messaging" checked={settingsDraft.allowBuyerMessaging} onChange={(checked) => setSettingsDraft((prev) => ({ ...prev, allowBuyerMessaging: checked }))} />
            <ToggleField label="Require approval for new sellers" checked={settingsDraft.requireApprovalForNewSellers} onChange={(checked) => setSettingsDraft((prev) => ({ ...prev, requireApprovalForNewSellers: checked }))} />
            <ToggleField label="Require approval for video listings" checked={settingsDraft.requireApprovalForVideo} onChange={(checked) => setSettingsDraft((prev) => ({ ...prev, requireApprovalForVideo: checked }))} />
            <Input label="Approval mode" value={settingsDraft.approvalMode} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, approvalMode: value as SettingsDraft['approvalMode'] }))} />
            <Input label="Max images" type="number" value={settingsDraft.maxImages} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, maxImages: value }))} />
            <Input label="Max videos" type="number" value={settingsDraft.maxVideos} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, maxVideos: value }))} />
            <Input label="Max price" type="number" value={settingsDraft.maxPrice} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, maxPrice: value }))} />
            <Input label="Seller max listings" type="number" value={settingsDraft.sellerMaxListings} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, sellerMaxListings: value }))} />
            <Input label="Seller max active listings" type="number" value={settingsDraft.sellerMaxActiveListings} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, sellerMaxActiveListings: value }))} />
            <ToggleField label="Users can sell" checked={settingsDraft.sellerCanSell} onChange={(checked) => setSettingsDraft((prev) => ({ ...prev, sellerCanSell: checked }))} />
            <TextareaField label="Enabled payment methods" value={settingsDraft.enabledPaymentMethodsText} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, enabledPaymentMethodsText: value }))} />
            <TextareaField label="Payment methods" value={settingsDraft.paymentMethodsText} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, paymentMethodsText: value }))} />
            <TextareaField label="Reporting reasons" value={settingsDraft.reportingReasonsText} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, reportingReasonsText: value }))} />
            <TextareaField label="Categories requiring approval" value={settingsDraft.categoriesRequireApprovalText} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, categoriesRequireApprovalText: value }))} />
            <div className="lg:col-span-2 grid gap-4 sm:grid-cols-3">
              <ToggleField label="COD enabled" checked={settingsDraft.allowCOD} onChange={(checked) => setSettingsDraft((prev) => ({ ...prev, allowCOD: checked }))} />
              <ToggleField label="Online payments enabled" checked={settingsDraft.allowOnlinePayments} onChange={(checked) => setSettingsDraft((prev) => ({ ...prev, allowOnlinePayments: checked }))} />
              <ToggleField label="Commission enabled" checked={settingsDraft.commissionEnabled} onChange={(checked) => setSettingsDraft((prev) => ({ ...prev, commissionEnabled: checked }))} />
            </div>
            <Input label="Commission rate" type="number" value={settingsDraft.commissionRate} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, commissionRate: value }))} />
            <Input label="Commission fixed fee" type="number" value={settingsDraft.commissionFixedFee} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, commissionFixedFee: value }))} />
            <CurrencyField
              label="Commission currency"
              value={settingsDraft.commissionCurrency}
              currencies={currencies}
              onChange={(value) => setSettingsDraft((prev) => ({ ...prev, commissionCurrency: value }))}
            />
          </div>
          <div className="mt-5">
            <button type="button" onClick={saveSettings} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
              Save settings
            </button>
          </div>
        </div>
      )}

      {activeSection === 'payments' && (
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">Payments</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Control cash on delivery, enabled gateways, and commission settings for marketplace checkout.
          </p>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <ToggleField label="Cash on delivery" checked={settingsDraft.allowCOD} onChange={(checked) => setSettingsDraft((prev) => ({ ...prev, allowCOD: checked }))} />
            <ToggleField label="Online checkout" checked={settingsDraft.allowOnlinePayments} onChange={(checked) => setSettingsDraft((prev) => ({ ...prev, allowOnlinePayments: checked }))} />
            <TextareaField label="Enabled payment methods" value={settingsDraft.enabledPaymentMethodsText} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, enabledPaymentMethodsText: value }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Commission rate" type="number" value={settingsDraft.commissionRate} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, commissionRate: value }))} />
              <Input label="Commission fixed fee" type="number" value={settingsDraft.commissionFixedFee} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, commissionFixedFee: value }))} />
            </div>
          </div>
          <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950">Live active payment methods</p>
                <p className="mt-1 text-sm text-slate-600">
                  Fetched from the platform's active checkout gateways. Select which ones should be active on Marketplace.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={syncMarketplacePaymentMethods}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Use all active methods
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsDraft((prev) => ({ ...prev, enabledPaymentMethodsText: '' }))}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Clear selection
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {activeMarketplacePaymentMethods.length ? (
                activeMarketplacePaymentMethods.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => toggleMarketplacePaymentMethod(method.id)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                      method.selected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{method.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      method.selected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {method.id}
                    </span>
                  </button>
                ))
              ) : (
                <div className="text-sm text-slate-500">No active payment gateways are available right now.</div>
              )}
            </div>
          </div>
          <div className="mt-5">
            <button type="button" onClick={saveSettings} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
              Save payment settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Metric: React.FC<{ title: string; value: number }> = ({ title, value }) => (
  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
    <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
  </div>
);

const Input: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  multiline?: boolean;
}> = ({ label, value, onChange, type = 'text', multiline = false }) => (
  <label className="block">
    <span className="mb-2 block text-sm font-semibold text-slate-900">{label}</span>
    {multiline ? (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="input w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
      />
    ) : (
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
      />
    )}
  </label>
);

const TextareaField: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({
  label,
  value,
  onChange
}) => (
  <label className="block lg:col-span-2">
    <span className="mb-2 block text-sm font-semibold text-slate-900">{label}</span>
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={4}
      className="input w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
    />
  </label>
);

const ToggleField: React.FC<{ label: string; checked: boolean; onChange: (value: boolean) => void }> = ({
  label,
  checked,
  onChange
}) => (
  <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
    <span>{label}</span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
  </label>
);

const SelectField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}> = ({ label, value, onChange, options }) => (
  <label className="block">
    <span className="mb-2 block text-sm font-semibold text-slate-900">{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} className="input w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none">
      {options.map((option) => (
        <option key={option} value={option}>
          {option.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  </label>
);

const CurrencyField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  currencies: Currency[];
}> = ({ label, value, onChange, currencies }) => {
  const resolvedValue = normalizeCurrencyCode(value, resolveDefaultCurrencyCode(currencies));

  if (!currencies.length) {
    return <Input label={label} value={resolvedValue} onChange={(next) => onChange(normalizeCurrencyCode(next, resolvedValue))} />;
  }

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-900">{label}</span>
      <select
        value={resolvedValue}
        onChange={(event) => onChange(normalizeCurrencyCode(event.target.value, resolvedValue))}
        className="input w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
      >
        {currencies.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.code} - {currency.name}
          </option>
        ))}
      </select>
    </label>
  );
};

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
  </div>
);

export default MarketplaceManagement;
