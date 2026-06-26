import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Edit3,
  Eye,
  Flag,
  Heart,
  Image as ImageIcon,
  Loader2,
  LocateFixed,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Package2,
  Plus,
  RotateCcw,
  Search,
  Send,
  Share2,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Video,
  X
} from 'lucide-react';
import LocationPicker from '../../components/common/LocationPicker';
import SearchInput from '../../components/SearchInput';
import { useCurrency } from '../../context/CurrencyContext';
import { useUser } from '../../context/UserContext';
import VerifiedBadge from '../../components/common/VerifiedBadge';
import { FileService } from '../../services/files';
import {
  archiveMarketplaceListing,
  contactMarketplaceSeller,
  createMarketplaceListing,
  deleteMarketplaceListingMedia,
  favoriteMarketplaceListing,
  getMarketplaceCategories,
  getMarketplaceDashboard,
  getMarketplaceListing,
  getMarketplaceSettings,
  listMarketplaceListings,
  markMarketplaceListingSold,
  reportMarketplaceListing,
  reserveMarketplaceListing,
  submitMarketplaceListing,
  unfavoriteMarketplaceListing,
  updateMarketplaceListing,
  uploadMarketplaceListingMedia
} from '../../services/marketplace';
import type {
  MarketplaceCategory,
  MarketplaceCondition,
  MarketplaceDeliveryOption,
  MarketplaceListing,
  MarketplaceListingFormValues,
  MarketplaceListingMedia,
  MarketplaceMeetupPreference,
  MarketplaceListingStatus,
  MarketplaceQuery,
  MarketplaceSettings
} from '../../types/marketplace';
import type { Currency, StructuredLocationFields } from '../../types';
import { getCurrentDeviceCoordinates } from '../../utils/deviceLocation';

type MarketplaceVariant = 'public' | 'dashboard';
type MarketplaceRouteMode = 'browse' | 'category' | 'detail' | 'sell' | 'edit' | 'mine' | 'saved';

const DEFAULT_CURRENCY = 'USD';
const DEFAULT_PAGE_SIZE = 24;
const DEFAULT_REPORT_REASONS = [
  'Scam / fraud',
  'Prohibited item',
  'Misleading listing',
  'Duplicate listing',
  'Offensive content',
  'Wrong category',
  'Suspicious seller',
  'Other'
];

const CONDITION_OPTIONS: Array<{ value: MarketplaceCondition; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'used_like_new', label: 'Used - Like new' },
  { value: 'used_good', label: 'Used - Good' },
  { value: 'used_fair', label: 'Used - Fair' }
];

const DELIVERY_OPTIONS: Array<{ value: MarketplaceDeliveryOption; label: string }> = [
  { value: 'pickup', label: 'Pickup' },
  { value: 'local_delivery', label: 'Local delivery' },
  { value: 'shipping', label: 'Shipping' },
  { value: 'cash_on_delivery', label: 'Cash on delivery' }
];

const PAYMENT_METHODS = [
  { value: 'cash_on_delivery', label: 'Cash on delivery' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'gcash', label: 'GCash' },
  { value: 'paystack', label: 'Paystack' },
  { value: 'stripe', label: 'Stripe' }
];

const MEETUP_PREFERENCE_OPTIONS: Array<{ value: MarketplaceMeetupPreference; label: string; help: string }> = [
  { value: 'public_meetup', label: 'Public meetup', help: 'Meetup at a public space' },
  { value: 'door_pickup', label: 'Door pickup', help: 'Buyer pickup at your door' },
  { value: 'door_dropoff', label: 'Door dropoff', help: 'Seller drops the item at buyer door' }
];

const STATUS_LABELS: Record<MarketplaceListingStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  active: 'Active',
  sold: 'Sold',
  reserved: 'Reserved',
  removed: 'Removed',
  suspended: 'Suspended'
};

const STATUS_STYLES: Record<MarketplaceListingStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  pending_review: 'bg-amber-50 text-amber-800 border border-amber-200',
  approved: 'bg-blue-50 text-blue-800',
  rejected: 'bg-rose-50 text-rose-700',
  active: 'bg-emerald-50 text-emerald-700',
  sold: 'bg-violet-50 text-violet-700',
  reserved: 'bg-cyan-50 text-cyan-700',
  removed: 'bg-slate-200 text-slate-700',
  suspended: 'bg-red-50 text-red-700'
};

const modeFromPath = (pathname: string): MarketplaceRouteMode => {
  const path = pathname.toLowerCase();
  if (/\/marketplace\/sell\/?$/i.test(path) || /\/marketplace\/create\/?$/i.test(path)) return 'sell';
  if (/\/marketplace\/edit\/[^/]+\/?$/i.test(path)) return 'edit';
  if (/\/marketplace\/my-listings\/?$/i.test(path)) return 'mine';
  if (/\/marketplace\/saved\/?$/i.test(path)) return 'saved';
  if (/\/marketplace\/listing\/[^/]+\/?$/i.test(path)) return 'detail';
  if (/\/marketplace\/category\/[^/]+\/?$/i.test(path)) return 'category';
  return 'browse';
};

const resolveDefaultCurrencyCode = (currencies: Currency[] = []) =>
  currencies.find((currency) => currency.isDefault || currency.is_default)?.code ||
  currencies.find((currency) => currency.isActive ?? currency.is_active ?? true)?.code ||
  currencies[0]?.code ||
  DEFAULT_CURRENCY;

const normalizeCurrencyCode = (value: string | null | undefined, fallback = DEFAULT_CURRENCY) =>
  String(value || fallback).trim().toUpperCase();

const formatMoney = (value: MarketplaceListing['price'], currency?: string | null) => {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 'Price on request';
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: normalizeCurrencyCode(currency, DEFAULT_CURRENCY),
      maximumFractionDigits: Number.isInteger(numeric) ? 0 : 2
    }).format(numeric);
  } catch {
    return `${normalizeCurrencyCode(currency, DEFAULT_CURRENCY)} ${numeric.toLocaleString()}`;
  }
};

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

const getMediaUrl = (media: MarketplaceListingMedia | string | null | undefined) => {
  if (!media) return '';
  return typeof media === 'string' ? media : media.url || media.thumbnailUrl || '';
};

const getCoverImage = (listing: MarketplaceListing | null | undefined) => {
  if (!listing) return '';
  if (listing.coverImage) return listing.coverImage;
  const firstImage = Array.isArray(listing.images) ? listing.images[0] : null;
  return getMediaUrl(firstImage) || '';
};

const formatMeetupPreference = (value: string) =>
  MEETUP_PREFERENCE_OPTIONS.find((option) => option.value === value)?.label || value.replace(/_/g, ' ');

const defaultFormValues = (currency = DEFAULT_CURRENCY): MarketplaceListingFormValues => ({
  title: '',
  description: '',
  categoryId: '',
  condition: 'new',
  brand: '',
  tags: '',
  price: '',
  currency: normalizeCurrencyCode(currency, DEFAULT_CURRENCY),
  negotiable: false,
  quantity: '1',
  location: '',
  latitude: null,
  longitude: null,
  meetupPreferences: ['public_meetup'],
  hideFromFriendsAndFollowers: false,
  deliveryOptions: ['pickup'],
  paymentMethods: ['cash_on_delivery'],
  contactPreference: 'message'
});

const listingToFormValues = (listing: MarketplaceListing | null | undefined, fallbackCurrency = DEFAULT_CURRENCY): MarketplaceListingFormValues => ({
  title: listing?.title ?? '',
  description: listing?.description ?? '',
  categoryId: listing?.categoryId ?? '',
  condition: (listing?.condition ?? 'new') as MarketplaceCondition,
  brand: listing?.brand ?? '',
  tags: Array.isArray(listing?.tags) ? listing.tags.join(', ') : '',
  price: listing?.price ? String(listing.price) : '',
  currency: normalizeCurrencyCode(listing?.currency, fallbackCurrency),
  negotiable: Boolean(listing?.negotiable),
  quantity: listing?.quantity ? String(listing.quantity) : '1',
  location: listing?.location ?? '',
  latitude: listing?.latitude ?? null,
  longitude: listing?.longitude ?? null,
  meetupPreferences: (Array.isArray(listing?.meetupPreferences) ? listing.meetupPreferences : ['public_meetup']) as MarketplaceMeetupPreference[],
  hideFromFriendsAndFollowers: Boolean(listing?.hideFromFriendsAndFollowers),
  deliveryOptions: (Array.isArray(listing?.deliveryOptions) ? listing!.deliveryOptions : ['pickup']) as MarketplaceDeliveryOption[],
  paymentMethods: Array.isArray(listing?.paymentMethods) ? listing.paymentMethods.map(String) : [],
  contactPreference: listing?.contactPreference ?? 'message'
});

const listingIsEditable = (listing: MarketplaceListing | null | undefined, userId?: string, isAdmin?: boolean) => {
  if (!listing) return false;
  if (isAdmin) return true;
  return Boolean(userId && listing.sellerId === userId);
};

const hasActiveImage = (listing: MarketplaceListing | null | undefined) => {
  const images = Array.isArray(listing?.images) ? listing?.images : [];
  return images.some((image) => Boolean(getMediaUrl(image)));
};

const MarketplaceChip: React.FC<{ active?: boolean; children: React.ReactNode; onClick?: () => void }> = ({
  active,
  children,
  onClick
}) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition',
      active
        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
    ].join(' ')}
  >
    {children}
  </button>
);

const MarketplaceBadge: React.FC<{ status?: MarketplaceListingStatus; children: React.ReactNode }> = ({
  status,
  children
}) => (
  <span
    className={[
      'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold',
      status ? STATUS_STYLES[status] : 'bg-slate-100 text-slate-700'
    ].join(' ')}
  >
    {children}
  </span>
);

const MarketplaceSkeleton = () => (
  <div className="space-y-4">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 9 }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-[20px] border border-slate-200 bg-white p-4">
          <div className="aspect-[4/3] rounded-2xl bg-slate-100" />
          <div className="mt-4 h-4 w-5/6 rounded-full bg-slate-100" />
          <div className="mt-2 h-3 w-1/2 rounded-full bg-slate-100" />
          <div className="mt-4 h-3 w-full rounded-full bg-slate-100" />
          <div className="mt-2 h-3 w-4/5 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  </div>
);

const MarketplacePage: React.FC<{ variant?: MarketplaceVariant }> = ({ variant = 'public' }) => {
  const { user } = useUser();
  const { availableCurrencies } = useCurrency();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ slug?: string; id?: string }>();

  const routeMode = useMemo(() => modeFromPath(location.pathname), [location.pathname]);
  const isDashboardVariant = variant === 'dashboard';
  const isSellRoute = routeMode === 'sell';
  const isEditRoute = routeMode === 'edit';
  const isMyListingsRoute = routeMode === 'mine';
  const isSavedRoute = routeMode === 'saved';
  const isDetailRoute = routeMode === 'detail';
  const isCategoryRoute = routeMode === 'category';
  const isBrowseRoute = routeMode === 'browse';
  const defaultCurrencyCode = useMemo(() => resolveDefaultCurrencyCode(availableCurrencies), [availableCurrencies]);

  const [settings, setSettings] = useState<MarketplaceSettings | null>(null);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [query, setQuery] = useState<MarketplaceQuery>({ page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: 'newest' });
  const [viewerCoordinates, setViewerCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [form, setForm] = useState<MarketplaceListingFormValues>(defaultFormValues(defaultCurrencyCode));
  const [existingMedia, setExistingMedia] = useState<MarketplaceListingMedia[]>([]);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [activePanel, setActivePanel] = useState<'browse' | 'mine' | 'saved' | 'sell'>('browse');
  const [shareState, setShareState] = useState<'closed' | 'open' | 'copied'>('closed');
  const [galleryFocus, setGalleryFocus] = useState<string | null>(null);

  const mainRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = String(user?.role || '').toUpperCase() === 'ADMIN';
  const isOwner = Boolean(user?.id && selectedListing?.sellerId === user.id);

  const activeCategory = useMemo(() => {
    if (!isCategoryRoute) return null;
    const slug = params.slug || '';
    return categories.find((category) => String(category.slug || '').toLowerCase() === slug.toLowerCase()) || null;
  }, [categories, isCategoryRoute, params.slug]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, MarketplaceCategory>();
    const pushCategory = (category: MarketplaceCategory) => {
      if (!category) return;
      if (category.slug) map.set(String(category.slug).toLowerCase(), category);
      if (category.id) map.set(String(category.id), category);
      (category.subcategories || []).forEach(pushCategory);
    };
    categories.forEach(pushCategory);
    return map;
  }, [categories]);

  const activeCategoryId = useMemo(() => {
    const slug = params.slug || '';
    if (!slug) return '';
    return categoryMap.get(slug.toLowerCase())?.id || '';
  }, [categoryMap, params.slug]);

  useEffect(() => {
    if (!(isBrowseRoute || isCategoryRoute)) return;
    const params = new URLSearchParams(location.search);
    const search = String(params.get('search') || params.get('q') || '').trim();
    if (!search) return;
    setSearchDraft(search);
    setQuery((previous) => (
      previous.search === search
        ? previous
        : { ...previous, search, page: 1 }
    ));
  }, [isBrowseRoute, isCategoryRoute, location.search]);

  const reportingReasons = useMemo(
    () => Array.isArray(settings?.reportingReasons) && settings.reportingReasons.length > 0
      ? settings.reportingReasons
      : DEFAULT_REPORT_REASONS,
    [settings?.reportingReasons]
  );

  const paymentOptions = useMemo(() => {
    const enabled = Array.isArray(settings?.enabledPaymentMethods) && settings?.enabledPaymentMethods?.length
      ? settings.enabledPaymentMethods
      : Array.isArray(settings?.paymentMethods) && settings.paymentMethods.length
        ? settings.paymentMethods
        : PAYMENT_METHODS.map((item) => item.value);
    const unique = Array.from(new Set(enabled.map(String)));
    if (settings?.allowCOD && !unique.includes('cash_on_delivery')) unique.unshift('cash_on_delivery');
    return unique;
  }, [settings]);

  const previewListing = useMemo(() => {
    if (selectedListing) return selectedListing;
    return null;
  }, [selectedListing]);

  const visibleListings = useMemo(() => {
    const base = Array.isArray(listings) ? listings : [];
    if (isDetailRoute || isSellRoute || isEditRoute) return base;
    if (isSavedRoute) {
      return Array.isArray(dashboard?.favorites) ? dashboard.favorites : [];
    }
    if (isMyListingsRoute || isDashboardVariant) {
      return Array.isArray(dashboard?.listings) ? dashboard.listings : base;
    }
    return base;
  }, [dashboard?.favorites, dashboard?.listings, isDashboardVariant, isDetailRoute, isEditRoute, isMyListingsRoute, isSavedRoute, isSellRoute, listings]);

  const summary = dashboard?.summary || {};

  const resetForm = (listing?: MarketplaceListing | null) => {
    const next = listingToFormValues(listing ?? null, defaultCurrencyCode);
    setForm(next);
    setSelectedImages([]);
    setSelectedVideo(null);
    setImagePreviews([]);
    setVideoPreview(null);
    setExistingMedia(Array.isArray(listing?.images) ? (listing.images.filter((item): item is MarketplaceListingMedia => typeof item !== 'string') as MarketplaceListingMedia[]) : []);
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [settingsPayload, categoriesPayload] = await Promise.all([
          getMarketplaceSettings().catch(() => null),
          getMarketplaceCategories().catch(() => [])
        ]);
        if (!mounted) return;
        setSettings(settingsPayload);
        setCategories(categoriesPayload);
        if (isSellRoute) {
          setActivePanel('sell');
        } else if (isMyListingsRoute) {
          setActivePanel('mine');
        } else if (isSavedRoute) {
          setActivePanel('saved');
        } else {
          setActivePanel('browse');
        }
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.error || err?.message || 'Failed to load marketplace');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [isSellRoute, isMyListingsRoute, isSavedRoute]);

  useEffect(() => {
    if (!isDetailRoute) {
      setSelectedListing(null);
      setSelectedMediaIndex(0);
      return;
    }
    let mounted = true;
    const idOrSlug = params.slug || '';
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const listing = await getMarketplaceListing(idOrSlug);
        if (!mounted) return;
        setSelectedListing(listing);
        setForm(listingToFormValues(listing, defaultCurrencyCode));
        setExistingMedia(Array.isArray(listing.images) ? (listing.images.filter((item): item is MarketplaceListingMedia => typeof item !== 'string') as MarketplaceListingMedia[]) : []);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.error || err?.message || 'Listing not found');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [isDetailRoute, params.slug]);

  useEffect(() => {
    if (!(isBrowseRoute || isCategoryRoute)) return;
    if (query.sort !== 'nearest' || viewerCoordinates) return;
    let mounted = true;
    void getCurrentDeviceCoordinates()
      .then((coords) => {
        if (!mounted) return;
        if (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
          setViewerCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
        }
      })
      .catch(() => null);
    return () => {
      mounted = false;
    };
  }, [isBrowseRoute, isCategoryRoute, query.sort, viewerCoordinates]);

  useEffect(() => {
    if (!(isBrowseRoute || isCategoryRoute)) return;
    let mounted = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload: MarketplaceQuery = {
          ...query,
          categoryId: activeCategoryId || query.categoryId || null,
          search: query.search || undefined,
          latitude: query.sort === 'nearest' ? viewerCoordinates?.latitude ?? null : null,
          longitude: query.sort === 'nearest' ? viewerCoordinates?.longitude ?? null : null,
          includeMine: Boolean(user?.id && isDashboardVariant)
        };
        const response = await listMarketplaceListings(payload);
        if (!mounted) return;
        if (Array.isArray(response)) {
          setListings(response);
        } else if (Array.isArray((response as any)?.listings)) {
          setListings((response as any).listings);
        } else {
          setListings([]);
        }
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.error || err?.message || 'Failed to load marketplace listings');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    const timer = window.setTimeout(() => void run(), 250);
    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [activeCategoryId, isBrowseRoute, isCategoryRoute, isDashboardVariant, query, user?.id, viewerCoordinates]);

  useEffect(() => {
    if (!(isMyListingsRoute || isSavedRoute || isDashboardVariant)) return;
    if (!user?.id) return;
    let mounted = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getMarketplaceDashboard();
        if (!mounted) return;
        setDashboard(data);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.error || err?.message || 'Failed to load marketplace dashboard');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [isDashboardVariant, isMyListingsRoute, isSavedRoute, user?.id]);

  useEffect(() => {
    if (selectedImages.length === 0) {
      setImagePreviews([]);
      return;
    }
    const next = selectedImages.map((file) => URL.createObjectURL(file));
    setImagePreviews(next);
    return () => next.forEach((preview) => URL.revokeObjectURL(preview));
  }, [selectedImages]);

  useEffect(() => {
    if (!selectedVideo) {
      setVideoPreview(null);
      return;
    }
    const preview = URL.createObjectURL(selectedVideo);
    setVideoPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [selectedVideo]);

  useEffect(() => {
    if (!isEditRoute || !params.id) return;
    let mounted = true;
    const run = async () => {
      setLoading(true);
      try {
        const listing = await getMarketplaceListing(params.id as string);
        if (!mounted) return;
        setSelectedListing(listing);
        setForm(listingToFormValues(listing, defaultCurrencyCode));
        setExistingMedia(Array.isArray(listing.images) ? (listing.images.filter((item): item is MarketplaceListingMedia => typeof item !== 'string') as MarketplaceListingMedia[]) : []);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.error || err?.message || 'Failed to load listing for editing');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [defaultCurrencyCode, isEditRoute, params.id]);

  useEffect(() => {
    setForm((previous) => {
      if (!previous.currency) {
        return { ...previous, currency: defaultCurrencyCode };
      }
      if (availableCurrencies.length && !availableCurrencies.some((currency) => currency.code === previous.currency)) {
        return { ...previous, currency: defaultCurrencyCode };
      }
      return previous;
    });
  }, [availableCurrencies, defaultCurrencyCode]);

  const normalizedSelectedMedia = useMemo(() => {
    const remote = Array.isArray(selectedListing?.images)
      ? selectedListing!.images.filter((item): item is MarketplaceListingMedia => typeof item !== 'string')
      : [];
    const media = [...remote];
    if (selectedListing?.video && typeof selectedListing.video !== 'string') media.push(selectedListing.video);
    return media;
  }, [selectedListing]);

  const routeHeading = useMemo(() => {
    if (isSellRoute) return 'Sell on Scrolith';
    if (isEditRoute) return 'Edit listing';
    if (isMyListingsRoute) return 'My marketplace listings';
    if (isSavedRoute) return 'Saved marketplace listings';
    if (isCategoryRoute) return activeCategory?.name ? `${activeCategory.name} marketplace` : 'Marketplace category';
    if (isDetailRoute) return selectedListing?.title || 'Marketplace listing';
    if (isDashboardVariant) return 'Marketplace';
    return 'Scrolith Marketplace';
  }, [activeCategory?.name, isCategoryRoute, isDashboardVariant, isDetailRoute, isEditRoute, isMyListingsRoute, isSavedRoute, isSellRoute, selectedListing?.title]);

  const routeSubheading = useMemo(() => {
    if (isSellRoute) return 'List products, services, and inventory items with Scrolith moderation and delivery controls.';
    if (isEditRoute) return 'Update your listing details, media, and status.';
    if (isMyListingsRoute) return 'Track drafts, approvals, active listings, reserves, and sold items.';
    if (isSavedRoute) return 'Review the listings you saved for later.';
    if (isCategoryRoute) return 'Browse items in this category.';
    if (isDetailRoute) return 'Review item photos, seller details, delivery options, and contact actions.';
    return 'Browse, create, save, and manage listings with Scrolith marketplace controls.';
  }, [isCategoryRoute, isDetailRoute, isEditRoute, isMyListingsRoute, isSavedRoute, isSellRoute]);

  const listingCount = Array.isArray(listings) ? listings.length : 0;

  const updateFormField = <K extends keyof MarketplaceListingFormValues>(key: K, value: MarketplaceListingFormValues[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const toggleArrayValue = <T extends string>(key: 'deliveryOptions' | 'paymentMethods' | 'meetupPreferences', value: T) => {
    setForm((previous) => {
      const current = Array.isArray(previous[key]) ? previous[key] : [];
      const next = current.includes(value as any) ? current.filter((item) => item !== value) : [...current, value];
      return { ...previous, [key]: next } as MarketplaceListingFormValues;
    });
  };

  const refreshDashboard = async () => {
    if (!user?.id) return;
    try {
      const data = await getMarketplaceDashboard();
      setDashboard(data);
    } catch {
      // ignore
    }
  };

  const handleFavoriteToggle = async (listing: MarketplaceListing) => {
    if (!user?.id) {
      navigate('/auth/login');
      return;
    }
    setActionLoading(true);
    try {
      const isFavorited = Boolean(dashboard?.favorites?.some((item: MarketplaceListing) => item.id === listing.id));
      if (isFavorited) {
        await unfavoriteMarketplaceListing(listing.id);
        setNotice('Removed from saved items');
      } else {
        await favoriteMarketplaceListing(listing.id);
        setNotice('Saved to your favorites');
      }
      await refreshDashboard();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to update saved state');
    } finally {
      setActionLoading(false);
    }
  };

  const handleShare = async (listing: MarketplaceListing) => {
    const url = `${window.location.origin}/marketplace/listing/${encodeURIComponent(listing.slug || listing.id)}`;
    const text = `${listing.title} on Scrolith`;
    try {
      if (navigator.share) {
        await navigator.share({ title: listing.title, text, url });
        setShareState('closed');
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareState('copied');
      setNotice('Listing link copied');
    } catch {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
      setShareState('closed');
    }
  };

  const handleSubmitListing = async (saveAsDraft = false) => {
    if (!user?.id) {
      navigate('/auth/login');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
        categoryId: form.categoryId,
        condition: form.condition,
        brand: form.brand.trim(),
        tags: form.tags,
        price: form.price ? Number(form.price) : 0,
        currency: normalizeCurrencyCode(form.currency, defaultCurrencyCode),
        negotiable: Boolean(form.negotiable),
        quantity: form.quantity ? Number(form.quantity) : 1,
        location: form.location.trim(),
        latitude: form.latitude ?? null,
        longitude: form.longitude ?? null,
        meetupPreferences: form.meetupPreferences,
        hideFromFriendsAndFollowers: Boolean(form.hideFromFriendsAndFollowers),
        deliveryOptions: form.deliveryOptions,
        paymentMethods: form.paymentMethods,
        contactPreference: form.contactPreference,
        status: saveAsDraft ? 'draft' : undefined
      };

      const existingId = isEditRoute ? (params.id || selectedListing?.id || '') : '';
      const listing = existingId
        ? await updateMarketplaceListing(existingId, payload)
        : await createMarketplaceListing(payload);

      const fileIds: string[] = [];
      const uploadTasks = [
        ...selectedImages.map(async (file) => {
          const uploaded = await FileService.uploadFile(file, 'portfolio', {
            userId: user.id,
            visibility: 'public'
          });
          fileIds.push(String(uploaded.id || uploaded.fileId || ''));
        }),
        ...(selectedVideo
          ? [async () => {
              const uploaded = await FileService.uploadFile(selectedVideo, 'portfolio', {
                userId: user.id,
                visibility: 'public'
              });
              fileIds.push(String(uploaded.id || uploaded.fileId || ''));
            }]
          : [])
      ];

      for (const task of uploadTasks) {
        await task();
      }

      if (fileIds.length > 0) {
        await uploadMarketplaceListingMedia(listing.id, fileIds);
      }

      if (saveAsDraft) {
        await updateMarketplaceListing(listing.id, { status: 'draft' });
        setNotice('Draft saved');
      } else if (!isEditRoute) {
        await submitMarketplaceListing(listing.id).catch(() => null);
        setNotice('Listing submitted');
      } else {
        setNotice('Listing updated');
      }

      setSelectedImages([]);
      setSelectedVideo(null);
      setImagePreviews([]);
      setVideoPreview(null);
      await refreshDashboard();
      navigate(`/marketplace/listing/${encodeURIComponent(listing.slug || listing.id)}`, { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to save listing');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteListing = async (listing: MarketplaceListing) => {
    if (!window.confirm('Archive this listing?')) return;
    setActionLoading(true);
    try {
      await archiveMarketplaceListing(listing.id);
      setNotice('Listing archived');
      await refreshDashboard();
      navigate('/marketplace/my-listings');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to archive listing');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReserve = async (listing: MarketplaceListing) => {
    setActionLoading(true);
    try {
      await reserveMarketplaceListing(listing.id);
      setNotice('Listing reserved');
      await refreshDashboard();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to reserve listing');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkSold = async (listing: MarketplaceListing) => {
    setActionLoading(true);
    try {
      await markMarketplaceListingSold(listing.id);
      setNotice('Listing marked as sold');
      await refreshDashboard();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to mark listing sold');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitContact = async (listing: MarketplaceListing) => {
    if (!user?.id) {
      navigate('/auth/login');
      return;
    }
    if (!contactMessage.trim()) {
      setError('Enter a message first');
      return;
    }
    setActionLoading(true);
    try {
      await contactMarketplaceSeller(listing.id, {
        message: contactMessage.trim(),
        channel: 'marketplace'
      });
      setNotice('Message sent to seller');
      setContactMessage('');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to contact seller');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitReport = async (listing: MarketplaceListing) => {
    if (!user?.id) {
      navigate('/auth/login');
      return;
    }
    if (!reportReason) {
      setError('Choose a report reason');
      return;
    }
    setActionLoading(true);
    try {
      await reportMarketplaceListing(listing.id, {
        reason: reportReason,
        details: reportDetails.trim()
      });
      setNotice('Listing reported');
      setReportReason('');
      setReportDetails('');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to report listing');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteMedia = async (media: MarketplaceListingMedia) => {
    if (!selectedListing) return;
    setActionLoading(true);
    try {
      await deleteMarketplaceListingMedia(selectedListing.id, media.id);
      setExistingMedia((previous) => previous.filter((item) => item.id !== media.id));
      setNotice('Media removed');
      const refreshed = await getMarketplaceListing(selectedListing.slug || selectedListing.id);
      setSelectedListing(refreshed);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Unable to delete media');
    } finally {
      setActionLoading(false);
    }
  };

  const renderHeader = () => (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-blue-700">
            <Sparkles className="h-3.5 w-3.5" />
            Marketplace
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">{routeHeading}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">{routeSubheading}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isBrowseRoute && (
            <MarketplaceChip active={!isMyListingsRoute && !isSavedRoute} onClick={() => setActivePanel('browse')}>
              Browse
            </MarketplaceChip>
          )}
          {Boolean(user?.id) && (
            <>
              <MarketplaceChip active={activePanel === 'mine'} onClick={() => navigate('/marketplace/my-listings')}>
                My listings
              </MarketplaceChip>
              <MarketplaceChip active={activePanel === 'saved'} onClick={() => navigate('/marketplace/saved')}>
                Saved
              </MarketplaceChip>
              <MarketplaceChip active={activePanel === 'sell'} onClick={() => navigate('/marketplace/sell')}>
                Sell
              </MarketplaceChip>
            </>
          )}
          <MarketplaceChip onClick={() => navigate('/marketplace')}>
            <Search className="h-4 w-4" />
            Search
          </MarketplaceChip>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Listings</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{loading ? '—' : listingCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Mode</p>
          <p className="mt-2 text-lg font-semibold text-slate-950 capitalize">{routeMode.replace('-', ' ')}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Approval</p>
          <p className="mt-2 text-lg font-semibold text-slate-950 capitalize">{settings?.approvalMode || 'manual'}</p>
        </div>
      </div>
    </div>
  );

  const renderBrowse = () => (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
            <SearchInput
              placeholder="Search items, brands, sellers..."
              className="lg:col-span-1"
              initialQuery={searchDraft}
              disableNavigation
              onSearch={(term) => {
                setSearchDraft(term);
                setQuery((previous) => ({ ...previous, search: term, page: 1 }));
              }}
            />
            <select
              value={query.categoryId || activeCategoryId || ''}
              onChange={(event) => setQuery((previous) => ({ ...previous, categoryId: event.target.value || null, page: 1 }))}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              value={query.sort || 'newest'}
              onChange={(event) => setQuery((previous) => ({ ...previous, sort: event.target.value, page: 1 }))}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
            >
              <option value="newest">Newest</option>
              <option value="price_low">Price low to high</option>
              <option value="price_high">Price high to low</option>
              <option value="nearest">Nearest</option>
              <option value="popular">Popular</option>
              <option value="recommended">Recommended</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(['pickup', 'local_delivery', 'shipping', 'cash_on_delivery'] as MarketplaceDeliveryOption[]).map((value) => (
              <MarketplaceChip
                key={value}
                active={query.deliveryOption === value}
                onClick={() =>
                  setQuery((previous) => ({
                    ...previous,
                    deliveryOption: previous.deliveryOption === value ? null : value,
                    page: 1
                  }))
                }
              >
                {DELIVERY_OPTIONS.find((item) => item.value === value)?.label || value}
              </MarketplaceChip>
            ))}
            {CONDITION_OPTIONS.map((option) => (
              <MarketplaceChip
                key={option.value}
                active={query.condition === option.value}
                onClick={() =>
                  setQuery((previous) => ({
                    ...previous,
                    condition: previous.condition === option.value ? null : option.value,
                    page: 1
                  }))
                }
              >
                {option.label}
              </MarketplaceChip>
            ))}
            <button
              type="button"
              onClick={() => setQuery({ page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: 'newest' })}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
            <button
              type="button"
              onClick={() => {
                void getCurrentDeviceCoordinates()
                  .then((coords) => {
                    if (!coords) return;
                    setViewerCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
                    setQuery((previous) => ({ ...previous, sort: 'nearest', page: 1 }));
                  })
                  .catch(() => setError('Unable to access your current location for nearby listings'));
              }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <LocateFixed className="h-4 w-4" />
              Nearby
            </button>
            <button
              type="button"
              onClick={() => setQuery((previous) => ({ ...previous, search: searchDraft.trim(), page: 1 }))}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          </div>
        </div>

        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
        {query.sort === 'nearest' && !viewerCoordinates && !loading && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Nearby sorting needs your location. Use the Nearby button to enable it.
          </div>
        )}

        {loading ? (
          <MarketplaceSkeleton />
        ) : (
          <>
            {isCategoryRoute && activeCategory && (
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                    <Package2 className="h-6 w-6 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Category</p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-950">{activeCategory.name}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{activeCategory.description || 'Browse items in this category.'}</p>
                  </div>
                </div>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {visibleListings.map((listing) => (
                <MarketplaceListingCard
                  key={listing.id}
                  listing={listing}
                  isSaved={Boolean(dashboard?.favorites?.some((item: MarketplaceListing) => item.id === listing.id))}
                  onOpen={() => navigate(`/marketplace/listing/${encodeURIComponent(listing.slug || listing.id)}`)}
                  onFavorite={() => void handleFavoriteToggle(listing)}
                  onShare={() => void handleShare(listing)}
                  onContact={() => navigate(`/marketplace/listing/${encodeURIComponent(listing.slug || listing.id)}?contact=1`)}
                />
              ))}
            </div>
            {visibleListings.length === 0 && (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-10 text-center">
                <ShoppingBag className="mx-auto h-10 w-10 text-slate-400" />
                <h3 className="mt-4 text-lg font-semibold text-slate-900">No listings yet</h3>
                <p className="mt-2 text-sm text-slate-500">Try a different filter or create the first listing.</p>
                {Boolean(user?.id) && (
                  <button
                    type="button"
                    onClick={() => navigate('/marketplace/sell')}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Create listing
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <aside className="space-y-4">
        <div className="sticky top-4 space-y-4">
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Marketplace status</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{settings?.enabled ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-semibold ${settings?.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {settings?.publicBrowsing ? 'Public browse' : 'Members only'}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Images</p>
                <p className="mt-1 font-semibold text-slate-950">{settings?.maxImages || 10}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Videos</p>
                <p className="mt-1 font-semibold text-slate-950">{settings?.maxVideos || 1}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">COD</p>
                <p className="mt-1 font-semibold text-slate-950">{settings?.allowCOD ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Approval</p>
                <p className="mt-1 font-semibold text-slate-950 capitalize">{settings?.approvalMode || 'manual'}</p>
              </div>
            </div>
          </div>

          {(isMyListingsRoute || isDashboardVariant) && (
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-950">Your marketplace</h3>
                <button
                  type="button"
                  onClick={() => navigate('/marketplace/sell')}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  <Plus className="h-4 w-4" />
                  Sell item
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{summary.totalListings ?? 0}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Active</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{summary.activeListings ?? 0}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Drafts</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{summary.draftListings ?? 0}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Favorites</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{summary.savedListings ?? 0}</p>
                </div>
              </div>
            </div>
          )}

          {Boolean(categories.length) && (
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-950">Categories</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {categories.slice(0, 12).map((category) => (
                  <MarketplaceChip
                    key={category.id}
                    active={activeCategory?.id === category.id}
                    onClick={() => navigate(`/marketplace/category/${encodeURIComponent(category.slug || category.id)}`)}
                  >
                    {category.name}
                  </MarketplaceChip>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );

  const renderDetail = () => {
    if (!selectedListing) return null;
    const media = normalizedSelectedMedia.filter(Boolean);
    const cover = getCoverImage(selectedListing) || getMediaUrl(media[selectedMediaIndex]) || '';
    const seller = selectedListing.seller;
    const canManage = listingIsEditable(selectedListing, user?.id, isAdmin);

    return (
      <div className="grid gap-6 xl:grid-cols-[1.3fr_420px]">
        <div className="space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <div className="flex items-center gap-2">
                <MarketplaceBadge status={selectedListing.status}>{STATUS_LABELS[selectedListing.status || 'draft']}</MarketplaceBadge>
                {selectedListing.featured && <MarketplaceBadge>Featured</MarketplaceBadge>}
                <button
                  type="button"
                  onClick={() => void handleShare(selectedListing)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              </div>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_180px]">
              <div className="space-y-3">
                <div className="overflow-hidden rounded-[24px] bg-slate-100">
                  {cover ? (
                    <img src={cover} alt={selectedListing.title} className="h-[420px] w-full object-cover" />
                  ) : (
                    <div className="flex h-[420px] items-center justify-center text-slate-400">
                      <ImageIcon className="h-12 w-12" />
                    </div>
                  )}
                </div>
                {media.length > 1 && (
                  <div className="grid grid-cols-4 gap-3">
                    {media.map((item, index) => {
                      const url = getMediaUrl(item);
                      if (!url) return null;
                      return (
                        <button
                          type="button"
                          key={`${item.id}-${index}`}
                          onClick={() => setSelectedMediaIndex(index)}
                          className={[
                            'overflow-hidden rounded-2xl border transition',
                            selectedMediaIndex === index ? 'border-slate-900 ring-2 ring-slate-200' : 'border-slate-200'
                          ].join(' ')}
                        >
                          {item.type === 'video' ? (
                            <div className="flex aspect-[4/3] items-center justify-center bg-slate-900 text-white">
                              <Video className="h-6 w-6" />
                            </div>
                          ) : (
                            <img src={url} alt={`${selectedListing.title} media ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-3xl font-bold tracking-tight text-slate-950">{selectedListing.title}</h1>
                        <VerifiedBadge size="sm" ariaHidden={!seller?.isVerified && !seller?.verifiedBadge} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        {seller?.name && <span>{seller.name}</span>}
                        {seller?.username && <span>@{seller.username}</span>}
                        {selectedListing.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {selectedListing.location}
                          </span>
                        )}
                        {typeof selectedListing.distanceKm === 'number' && (
                          <span className="inline-flex items-center gap-1">
                            <LocateFixed className="h-4 w-4" />
                            {selectedListing.distanceKm.toFixed(1)} km away
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Eye className="h-4 w-4" />
                          {selectedListing.viewCount || 0} views
                        </span>
                      </div>
                    </div>
                    <MarketplaceBadge>{selectedListing.condition || 'other'}</MarketplaceBadge>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <div className="rounded-2xl bg-white px-4 py-3 text-xl font-bold text-slate-950 shadow-sm">
                      {formatMoney(selectedListing.price, selectedListing.currency)}
                    </div>
                    {selectedListing.negotiable && <MarketplaceBadge>Negotiable</MarketplaceBadge>}
                    {selectedListing.brand && <MarketplaceBadge>{selectedListing.brand}</MarketplaceBadge>}
                    {selectedListing.deliveryOptions?.map((option) => (
                      <MarketplaceBadge key={String(option)}>{String(option).replace(/_/g, ' ')}</MarketplaceBadge>
                    ))}
                    {selectedListing.paymentMethods?.map((method) => (
                      <MarketplaceBadge key={String(method)}>{String(method).replace(/_/g, ' ')}</MarketplaceBadge>
                    ))}
                    {selectedListing.meetupPreferences?.map((preference) => (
                      <MarketplaceBadge key={String(preference)}>{formatMeetupPreference(String(preference))}</MarketplaceBadge>
                    ))}
                  </div>

                  <div className="mt-4 space-y-3">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">About this item</h2>
                    <p className="whitespace-pre-line text-sm leading-7 text-slate-700">{selectedListing.description || 'No description provided.'}</p>
                    {Array.isArray(selectedListing.tags) && selectedListing.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {selectedListing.tags.map((tag) => (
                          <MarketplaceBadge key={tag}>#{tag}</MarketplaceBadge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-950">Contact seller</h3>
                  <p className="mt-2 text-sm text-slate-600">Send a message or start a marketplace conversation.</p>
                  <textarea
                    value={contactMessage}
                    onChange={(event) => setContactMessage(event.target.value)}
                    placeholder="Write a message to the seller..."
                    className="mt-3 min-h-[110px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-400"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleSubmitContact(selectedListing)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send message
                    </button>
                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleReserve(selectedListing)}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
                        >
                          <Clock3 className="h-4 w-4" />
                          Reserve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMarkSold(selectedListing)}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Mark sold
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="sticky top-4 space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-950">Seller</h3>
              <div className="mt-4 flex items-start gap-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                  {seller?.avatar ? <img src={seller.avatar} alt={seller.name || 'Seller'} className="h-full w-full object-cover" /> : <UserAvatarFallback name={seller?.name || 'Seller'} />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-slate-950">{seller?.name || 'Scrolith seller'}</h4>
                    <VerifiedBadge size="xs" ariaHidden={!seller?.isVerified && !seller?.verifiedBadge} />
                  </div>
                  <p className="text-sm text-slate-600">@{seller?.username || 'seller'}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    {seller?.country && <span>{seller.country}</span>}
                    {seller?.joinDate && <span>Joined {formatDate(seller.joinDate)}</span>}
                    {typeof seller?.rating === 'number' && <span>Rating {seller.rating.toFixed(1)}</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-950">Actions</h3>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => void handleFavoriteToggle(selectedListing)}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700"
                >
                  <span className="inline-flex items-center gap-2">
                    <Heart className="h-4 w-4" />
                    Save item
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleShare(selectedListing)}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700"
                >
                  <span className="inline-flex items-center gap-2">
                    <Share2 className="h-4 w-4" />
                    Share listing
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setNotice('Report panel is available below')}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700"
                >
                  <span className="inline-flex items-center gap-2">
                    <Flag className="h-4 w-4" />
                    Report listing
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </button>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleDeleteListing(selectedListing)}
                    className="flex w-full items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm font-medium text-rose-700"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Trash2 className="h-4 w-4" />
                      Archive listing
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    );
  };

  const renderSavedMine = () => (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleListings.map((listing) => (
          <MarketplaceListingCard
            key={listing.id}
            listing={listing}
            isSaved={Boolean(dashboard?.favorites?.some((item: MarketplaceListing) => item.id === listing.id))}
            onOpen={() => navigate(`/marketplace/listing/${encodeURIComponent(listing.slug || listing.id)}`)}
            onFavorite={() => void handleFavoriteToggle(listing)}
            onShare={() => void handleShare(listing)}
            onContact={() => navigate(`/marketplace/listing/${encodeURIComponent(listing.slug || listing.id)}?contact=1`)}
            onEdit={listingIsEditable(listing, user?.id, isAdmin) ? () => navigate(`/marketplace/edit/${encodeURIComponent(listing.id)}`) : undefined}
          />
        ))}
      </div>
      {visibleListings.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-10 text-center">
          <Package2 className="mx-auto h-10 w-10 text-slate-400" />
          <h3 className="mt-4 text-lg font-semibold text-slate-900">{isSavedRoute ? 'No saved listings yet' : 'No listings yet'}</h3>
          <p className="mt-2 text-sm text-slate-500">{isSavedRoute ? 'Save items you want to revisit later.' : 'Create your first listing to start selling.'}</p>
          <button
            type="button"
            onClick={() => navigate('/marketplace/sell')}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Sell item
          </button>
        </div>
      )}
    </div>
  );

  const renderForm = () => (
    <MarketplaceForm
      userId={user?.id}
      settings={settings}
      categories={categories}
      availableCurrencies={availableCurrencies}
      defaultCurrencyCode={defaultCurrencyCode}
      form={form}
      loading={saving}
      existingMedia={existingMedia}
      imagePreviews={imagePreviews}
      videoPreview={videoPreview}
      selectedListing={selectedListing}
      onBack={() => navigate(isEditRoute && selectedListing ? `/marketplace/listing/${encodeURIComponent(selectedListing.slug || selectedListing.id)}` : '/marketplace')}
      onFieldChange={updateFormField}
      onToggleArrayValue={toggleArrayValue}
      onImagesChange={setSelectedImages}
      onVideoChange={setSelectedVideo}
      onRemoveExistingMedia={handleDeleteMedia}
      onSaveDraft={() => void handleSubmitListing(true)}
      onSubmit={() => void handleSubmitListing(false)}
      onPreview={() => {
        const target = mainRef.current?.querySelector('[data-marketplace-preview]');
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
      paymentOptions={paymentOptions}
      isEditRoute={isEditRoute}
    />
  );

  return (
    <div ref={mainRef} className={isDashboardVariant ? 'space-y-6' : 'space-y-6 pb-10'}>
      {renderHeader()}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      {isSellRoute || isEditRoute ? (
        renderForm()
      ) : isDetailRoute ? (
        loading ? (
          <MarketplaceSkeleton />
        ) : (
          renderDetail()
        )
      ) : isMyListingsRoute || isSavedRoute ? (
        renderSavedMine()
      ) : (
        renderBrowse()
      )}

      {!loading && !isDetailRoute && !(isSellRoute || isEditRoute) && (
        <div data-marketplace-preview className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Preview</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">Current selection</h3>
            </div>
            <button
              type="button"
              onClick={() => navigate('/marketplace/sell')}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Create listing
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {settings?.allowBuyerMessaging ? 'Buyer messaging is enabled.' : 'Buyer messaging is disabled by admin.'}
            {settings?.allowCOD ? ' Cash on delivery is available where sellers enable it.' : ' Cash on delivery is disabled.'}
          </p>
        </div>
      )}
    </div>
  );
};

const MarketplaceListingCard: React.FC<{
  listing: MarketplaceListing;
  isSaved?: boolean;
  onOpen: () => void;
  onFavorite: () => void;
  onShare: () => void;
  onContact: () => void;
  onEdit?: () => void;
}> = ({ listing, isSaved, onOpen, onFavorite, onShare, onContact, onEdit }) => {
  const cover = getCoverImage(listing);
  const seller = listing.seller;

  return (
    <article className="group overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
          {cover ? (
            <img src={cover} alt={listing.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-400">
              <ImageIcon className="h-10 w-10" />
            </div>
          )}
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {listing.featured && <MarketplaceBadge>Featured</MarketplaceBadge>}
            {listing.status && <MarketplaceBadge status={listing.status}>{STATUS_LABELS[listing.status]}</MarketplaceBadge>}
          </div>
          <div className="absolute bottom-3 right-3 flex gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onFavorite();
              }}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full backdrop-blur ${isSaved ? 'bg-rose-500 text-white' : 'bg-white/90 text-slate-700'}`}
            >
              <Heart className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onShare();
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-700 backdrop-blur"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="line-clamp-2 text-base font-semibold text-slate-950">{listing.title}</h3>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                {seller?.name && <span className="truncate">{seller.name}</span>}
                <VerifiedBadge size="xs" ariaHidden={!seller?.isVerified && !seller?.verifiedBadge} />
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-950">
              {formatMoney(listing.price, listing.currency)}
            </div>
          </div>
          <p className="line-clamp-2 text-sm leading-6 text-slate-600">{listing.summary || listing.description || 'Scrolith marketplace listing.'}</p>
          <div className="flex flex-wrap gap-2">
            {listing.brand && <MarketplaceBadge>{listing.brand}</MarketplaceBadge>}
            {Array.isArray(listing.tags) && listing.tags.slice(0, 3).map((tag) => (
              <MarketplaceBadge key={tag}>#{tag}</MarketplaceBadge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {listing.location && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1">
                <MapPin className="h-3.5 w-3.5" />
                {listing.location}
              </span>
            )}
            {typeof listing.distanceKm === 'number' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1">
                <LocateFixed className="h-3.5 w-3.5" />
                {listing.distanceKm.toFixed(1)} km
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1">
              <Eye className="h-3.5 w-3.5" />
              {listing.viewCount || 0}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1">
              <Heart className="h-3.5 w-3.5" />
              {listing.saveCount || 0}
            </span>
          </div>
        </div>
      </button>

      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
        <button
          type="button"
          onClick={onContact}
          className="flex-1 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Contact
        </button>
        <button
          type="button"
          onClick={onShare}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-700"
        >
          <Send className="h-4 w-4" />
        </button>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-700"
          >
            <Edit3 className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  );
};

const UserAvatarFallback: React.FC<{ name: string }> = ({ name }) => {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return <span className="text-sm font-semibold text-slate-600">{initials || 'S'}</span>;
};

const MarketplaceForm: React.FC<{
  userId?: string;
  settings: MarketplaceSettings | null;
  categories: MarketplaceCategory[];
  availableCurrencies: Currency[];
  defaultCurrencyCode: string;
  form: MarketplaceListingFormValues;
  loading: boolean;
  existingMedia: MarketplaceListingMedia[];
  imagePreviews: string[];
  videoPreview: string | null;
  selectedListing: MarketplaceListing | null;
  onBack: () => void;
  onFieldChange: <K extends keyof MarketplaceListingFormValues>(key: K, value: MarketplaceListingFormValues[K]) => void;
  onToggleArrayValue: (key: 'deliveryOptions' | 'paymentMethods' | 'meetupPreferences', value: string) => void;
  onImagesChange: (files: File[]) => void;
  onVideoChange: (file: File | null) => void;
  onRemoveExistingMedia: (media: MarketplaceListingMedia) => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  onPreview: () => void;
  paymentOptions: string[];
  isEditRoute: boolean;
}> = ({
  userId,
  settings,
  categories,
  availableCurrencies,
  defaultCurrencyCode,
  form,
  loading,
  existingMedia,
  imagePreviews,
  videoPreview,
  selectedListing,
  onBack,
  onFieldChange,
  onToggleArrayValue,
  onImagesChange,
  onVideoChange,
  onRemoveExistingMedia,
  onSaveDraft,
  onSubmit,
  onPreview,
  paymentOptions,
  isEditRoute
}) => {
  const cover = imagePreviews[0] || getCoverImage(selectedListing);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_420px]">
      <div className="space-y-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <MarketplaceBadge>{isEditRoute ? 'Edit' : 'Create'}</MarketplaceBadge>
              {settings?.allowCOD ? <MarketplaceBadge>COD enabled</MarketplaceBadge> : <MarketplaceBadge>COD disabled</MarketplaceBadge>}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-blue-700">
              <ShoppingBag className="h-3.5 w-3.5" />
              Sell marketplace
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-950">{isEditRoute ? 'Edit your listing' : 'Create a new listing'}</h2>
            <p className="text-sm leading-6 text-slate-600">
              Use the same Scrolith media pipeline, moderation settings, and payment controls as the rest of the platform.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Title">
              <input value={form.title} onChange={(event) => onFieldChange('title', event.target.value)} className="input" placeholder="Item title" />
            </Field>
            <Field label="Category">
              <select value={form.categoryId} onChange={(event) => onFieldChange('categoryId', event.target.value)} className="input">
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Price">
              <input value={form.price} onChange={(event) => onFieldChange('price', event.target.value)} className="input" placeholder="0.00" inputMode="decimal" />
            </Field>
            <Field label="Currency">
              {availableCurrencies.length ? (
                <select value={normalizeCurrencyCode(form.currency, defaultCurrencyCode)} onChange={(event) => onFieldChange('currency', normalizeCurrencyCode(event.target.value, defaultCurrencyCode))} className="input">
                  {availableCurrencies.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} - {currency.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={form.currency} onChange={(event) => onFieldChange('currency', normalizeCurrencyCode(event.target.value, defaultCurrencyCode))} className="input" placeholder={defaultCurrencyCode} />
              )}
            </Field>
            <Field label="Condition">
              <select value={form.condition} onChange={(event) => onFieldChange('condition', event.target.value as MarketplaceCondition)} className="input">
                {CONDITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantity">
              <input value={form.quantity} onChange={(event) => onFieldChange('quantity', event.target.value)} className="input" placeholder="1" inputMode="numeric" />
            </Field>
            <Field label="Brand">
              <input value={form.brand} onChange={(event) => onFieldChange('brand', event.target.value)} className="input" placeholder="Item brand name" />
            </Field>
            <Field label="Tags">
              <input value={form.tags} onChange={(event) => onFieldChange('tags', event.target.value)} className="input" placeholder="sony xperia, used sony xperia, Xperia 1 IV" />
              <p className="mt-2 text-xs text-slate-500">Up to 6 tags. Separate each tag with a comma.</p>
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Location">
              <LocationPicker
                value={{
                  location: form.location,
                  formattedAddress: form.location,
                  latitude: form.latitude,
                  longitude: form.longitude
                }}
                onChange={(next) => {
                  onFieldChange('location', String(next.location || next.formattedAddress || next.formatted_address || '').trim());
                  onFieldChange('latitude', next.latitude ?? null);
                  onFieldChange('longitude', next.longitude ?? null);
                }}
              />
            </Field>
            <Field label="Contact preference">
              <select value={form.contactPreference} onChange={(event) => onFieldChange('contactPreference', event.target.value)} className="input">
                <option value="message">Message</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="any">Any available</option>
              </select>
            </Field>
          </div>

          <Field label="Description" className="mt-4">
            <textarea
              value={form.description}
              onChange={(event) => onFieldChange('description', event.target.value)}
              className="input min-h-[160px]"
              placeholder="Describe the item, condition, shipping, pickup details, and anything a buyer should know."
            />
          </Field>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Meetup preferences">
              <div className="flex flex-wrap gap-2">
                {MEETUP_PREFERENCE_OPTIONS.map((option) => (
                  <MarketplaceChip
                    key={option.value}
                    active={form.meetupPreferences.includes(option.value)}
                    onClick={() => onToggleArrayValue('meetupPreferences', option.value)}
                  >
                    {option.label}
                  </MarketplaceChip>
                ))}
              </div>
              <div className="mt-2 space-y-1 text-xs text-slate-500">
                {MEETUP_PREFERENCE_OPTIONS.map((option) => (
                  <p key={option.value}>{option.label}: {option.help}</p>
                ))}
              </div>
            </Field>
            <Field label="Delivery options">
              <div className="flex flex-wrap gap-2">
                {DELIVERY_OPTIONS.map((option) => (
                  <MarketplaceChip
                    key={option.value}
                    active={form.deliveryOptions.includes(option.value)}
                    onClick={() => onToggleArrayValue('deliveryOptions', option.value)}
                  >
                    {option.label}
                  </MarketplaceChip>
                ))}
              </div>
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Payment methods">
              <div className="flex flex-wrap gap-2">
                {paymentOptions.map((option) => (
                  <MarketplaceChip
                    key={option}
                    active={form.paymentMethods.includes(option)}
                    onClick={() => onToggleArrayValue('paymentMethods', option)}
                  >
                    {PAYMENT_METHODS.find((item) => item.value === option)?.label || option.replace(/_/g, ' ')}
                  </MarketplaceChip>
                ))}
              </div>
            </Field>
            <Field label="Privacy settings">
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.hideFromFriendsAndFollowers}
                  onChange={(event) => onFieldChange('hideFromFriendsAndFollowers', event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900"
                />
                <span>
                  <span className="block font-semibold">Hide from friends and followers</span>
                  <span className="mt-1 block text-xs text-slate-500">People already connected to you will not see this listing in marketplace browsing.</span>
                </span>
              </label>
            </Field>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label={`Images (up to ${settings?.maxImages || 10})`}>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                <Upload className="h-6 w-6 text-slate-400" />
                <span className="mt-2 font-medium">Choose image files</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => onImagesChange(Array.from(event.target.files || []).slice(0, settings?.maxImages || 10))}
                />
              </label>
            </Field>
            <Field label={`Video (max ${settings?.maxVideos || 1})`}>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                <Video className="h-6 w-6 text-slate-400" />
                <span className="mt-2 font-medium">Choose one video file</span>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(event) => onVideoChange(event.target.files?.[0] || null)}
                />
              </label>
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={onPreview} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">
              <Eye className="h-4 w-4" />
              Preview
            </button>
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              <Archive className="h-4 w-4" />
              Save draft
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {isEditRoute ? 'Update listing' : 'Submit listing'}
            </button>
          </div>
        </div>

        <div data-marketplace-preview className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Preview</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">{form.title || 'Your listing preview'}</h3>
            </div>
            <MarketplaceBadge>{form.condition || 'other'}</MarketplaceBadge>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <div className="overflow-hidden rounded-[24px] bg-slate-100">
                {cover ? (
                  <img src={cover} alt="Listing preview" className="h-[320px] w-full object-cover" />
                ) : (
                  <div className="flex h-[320px] items-center justify-center text-slate-400">
                    <ImageIcon className="h-10 w-10" />
                  </div>
                )}
              </div>
              {(imagePreviews.length > 1 || videoPreview) && (
                <div className="grid grid-cols-4 gap-3">
                  {imagePreviews.slice(0, 4).map((preview, index) => (
                    <img key={preview} src={preview} alt={`Image preview ${index + 1}`} className="aspect-[4/3] rounded-2xl object-cover" />
                  ))}
                  {videoPreview && (
                    <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-slate-900 text-white">
                      <Video className="h-6 w-6" />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Price</p>
                <p className="mt-1 text-2xl font-bold text-slate-950">
                  {form.price ? formatMoney(Number(form.price), form.currency) : 'Price on request'}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {form.negotiable ? 'Negotiable price' : 'Fixed price'}
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Delivery</p>
                <p className="mt-1 text-sm text-slate-700">{form.deliveryOptions.map((option) => DELIVERY_OPTIONS.find((item) => item.value === option)?.label || option).join(', ') || 'Pickup'}</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Payment</p>
                <p className="mt-1 text-sm text-slate-700">{form.paymentMethods.map((method) => PAYMENT_METHODS.find((item) => item.value === method)?.label || method).join(', ') || 'Admin controlled'}</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Meetup and privacy</p>
                <p className="mt-1 text-sm text-slate-700">{form.meetupPreferences.map((item) => formatMeetupPreference(item)).join(', ') || 'Select meetup preferences'}</p>
                <p className="mt-2 text-xs text-slate-500">{form.hideFromFriendsAndFollowers ? 'Hidden from friends and followers' : 'Visible under your normal marketplace privacy'}</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Brand and tags</p>
                <p className="mt-1 text-sm text-slate-700">{form.brand || 'No brand added'}</p>
                <p className="mt-2 text-xs text-slate-500">{form.tags || 'No tags added'}</p>
              </div>
            </div>
          </div>

          {existingMedia.length > 0 && (
            <div className="mt-5 space-y-3">
              <p className="text-sm font-semibold text-slate-900">Existing media</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {existingMedia.map((media) => (
                  <div key={media.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {media.type === 'video' ? (
                      <div className="flex aspect-[4/3] items-center justify-center bg-slate-900 text-white">
                        <Video className="h-6 w-6" />
                      </div>
                    ) : (
                      <img src={media.thumbnailUrl || media.url} alt="Listing media" className="aspect-[4/3] w-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveExistingMedia(media)}
                      className="flex w-full items-center justify-center gap-2 border-t border-slate-200 px-3 py-2 text-sm font-medium text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {imagePreviews.length > 0 && (
            <div className="mt-5 space-y-3">
              <p className="text-sm font-semibold text-slate-900">New image uploads</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {imagePreviews.map((preview, index) => (
                  <img key={`${preview}-${index}`} src={preview} alt={`Upload preview ${index + 1}`} className="aspect-[4/3] rounded-2xl object-cover" />
                ))}
              </div>
            </div>
          )}

          {videoPreview && (
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
              <video src={videoPreview} controls className="w-full" />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">Guidelines</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li>• Upload clear images and one optional video.</li>
            <li>• Keep the title concise and searchable.</li>
            <li>• Prices are validated server-side.</li>
            <li>• Marketplace moderation follows admin approval settings.</li>
            <li>• Public browsing depends on marketplace settings.</li>
          </ul>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">Contact preference</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Buyers can reach you by the method you choose here. Keep it aligned with your availability.
          </p>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            {userId ? `Creating as ${userId}` : 'Sign in to create a listing.'}
          </div>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="mb-2 block text-sm font-semibold text-slate-900">{label}</span>
    {children}
  </label>
);

export default MarketplacePage;
